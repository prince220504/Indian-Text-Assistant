# Tutorial 14 — Per-Session Memory in Postgres — Week 3 D2

> **What you'll be able to recall after re-reading this:** why a module-level `history = []` is a real bug the moment more than one person can call your API; what a session id is and — more importantly — what it is *not*; why memory goes in a database instead of a dict; the shape of a `messages` table and why one row per **message**, not per turn; why `%s` in a SQL query is not string formatting and what it structurally prevents; why `ORDER BY ... DESC ... LIMIT n` then reverse; and why an assert on an LLM's prose is a test that will betray you.
>
> **How to use this doc:** read top-to-bottom once. After that jump to any boxed **Analogy**, the **60-second recall**, or the **Interview flashcards**.

---

## Where this fits

```
WEEK 1   PDFs → chunks → embeddings → ChromaDB          ✅ Tutorials 01-06
WEEK 2   retriever → generator → memory                 ✅ Tutorials 07-09
WEEK 2.5 the pipeline as a graph: route/grade/rewrite   ✅ Tutorials 10-12
WEEK 3   D1 the graph, reachable over HTTP              ✅ Tutorial 13
         D2 memory that survives users and restarts     ▲ you are here
WEEK 4   React, calling this API
```

Day 12 gave the graph a front door. The moment that door existed, a bug that had been sleeping since Day 8 woke up. Today was about killing it.

The rule of the day: **`graph.py`, `generator.py` and `retriever.py` were not touched.** The graph stayed stateless. Only the two edges — where a request comes in, and where memory lives — changed.

---

## Concept 1 — The bug you had already shipped

Day 8's memory, in full:

```python
history = []          # module level, in chat.py
```

That is a **global**. One list, created once when Python imports the module, shared by everything in that process for as long as the process lives.

On Day 8 that was correct-enough: one person, one terminal, one conversation, `python chat.py`.

From Day 12 it was a bug, because `uvicorn` serves **many** requests into that same process.

> **🧠 Analogy — the tea stall with one notebook.** You run a tea stall. Every customer's order goes into the same notebook, on the same page, with no names against them. One customer at a time — fine, you remember who's who. Now ten customers order at once. You read the page back: *chai, samosa, no sugar, two plates, extra masala.* Whose order is that? Nobody's. It's everybody's, mashed together.

Three separate failures, one root cause:

| symptom | why |
|---|---|
| User A's follow-up gets rewritten using user B's topic | `condense()` reads one shared list |
| Restart the server, everyone's memory vanishes | the list lives in RAM |
| Two Railway workers disagree about the conversation | each process has its **own** list |

**Root cause:** memory was scoped to the *process*. Conversation is scoped to the *person*.

> ⭐ **The failure mode is the scary part.** The old code would not have crashed. It would have quietly answered `someone-else` using **your** conversation. State-mixing bugs don't look like bugs — they look like the app being surprisingly clever, right up until it leaks something private.

---

## Concept 2 — The fix has two halves

### Half A — a key

HTTP is **stateless**. Every request arrives with no memory that any earlier request happened. The server genuinely cannot tell two questions belong to one conversation.

So the **client** has to say so. It sends a `session_id` with every question. Same id = same conversation.

> ⭐ **Interview tip:** this is the whole idea behind cookies, JWTs and session tokens. HTTP forgets; the client carries the thread; the server looks things up by the id it's handed.

### Half B — somewhere durable

A `dict` of `{session_id: [...]}` fixes the *mixing* but not the *forgetting*: a restart still wipes it, and two worker processes don't share RAM.

Postgres is outside your process. It survives restarts, and every worker sees the same rows.

So `history = []` (a list in RAM) becomes a `messages` table, and "read history" becomes `SELECT ... WHERE session_id = %s`.

---

## Concept 3 — Identification is not authentication

The question that mattered today:

> *What stops me sending you **your** session id and reading your conversation?*

**Nothing does.**

A client-supplied id with no signature and no login is a **claim**, not a **proof**. If the ids are guessable (`user1`, `user2`), anyone can walk into anyone's chat.

> ⭐ **Interview flashcard.** *Identification* = "I claim to be this session." *Authentication* = "and here is proof." Real apps close that gap with a signed cookie or a JWT — a value the server can verify it minted and that nobody edited.

We did **not** fix it today, deliberately: there are no logins yet and nothing sensitive in the DB. But it is marked in the code so it isn't forgotten:

```python
class ChatRequest(BaseModel):
    question: str
    session_id: str   # client-supplied. NOT authentication - anyone who guesses an id reads that chat (Week 5: real auth)
```

> ⭐ **Untracked security shortcuts are how they ship.** A known gap with a comment on it is engineering. The same gap with nothing written down is an incident waiting for a date.

---

## Concept 4 — The table

```sql
CREATE TABLE IF NOT EXISTS messages (
    id          SERIAL PRIMARY KEY,
    session_id  TEXT        NOT NULL,
    role        TEXT        NOT NULL,
    content     TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

| column | why it exists |
|---|---|
| `id SERIAL` | Postgres hands out the number; you never generate one and never race |
| `session_id` | the key you filter on — the whole point of the day |
| `role` | `'user'` or `'assistant'` |
| `content` | the text |
| `created_at` | so you can `ORDER BY` it |

**One row per message, not per turn.** Your Python tuple `(question, answer)` becomes *two* rows. Why:

- It's the shape every LLM API already speaks: `[{"role": ..., "content": ...}]`.
- A turn can grow more parts later — a tool call, a system note, a retry — and a two-column `(q, a)` row can't hold them.

> ⭐ **Rows in a SQL table have no inherent order.** A `SELECT` without `ORDER BY` may return them in whatever order the query planner finds cheapest, and that can change as the table grows. If you want your conversation in order, you must **store something to sort by**. `created_at` is not decoration.

### `IF NOT EXISTS` = idempotent

```python
def init_db():
    """Create the messages table if it isn't there yet. Safe to run every startup."""
```

Running `init_db()` ten times equals running it once. That is what lets `main.py` call it on **every boot** without checking anything first, and what makes it safe when four Railway workers boot at the same moment.

> ⭐ **Interview flashcard.** *Idempotent* = doing it again changes nothing more. It's why `PUT` is idempotent and `POST` isn't, why retrying a failed deploy is safe or isn't, and why this one keyword removes a whole class of startup race.

---

## Concept 5 — `%s` is not string formatting

Here is what we did **not** write:

```python
# NEVER
cur.execute(f"SELECT ... WHERE session_id = '{session_id}'")
```

`session_id` arrives from a stranger's JSON body. With the f-string, a stranger who sends

```
x'; DROP TABLE messages; --
```

has their text pasted into your SQL and **executed as SQL**. That's **SQL injection**, still one of the most common ways real databases get dumped or destroyed.

What we wrote instead:

```python
cur.execute(
    "INSERT INTO messages (session_id, role, content) VALUES (%s, %s, %s)",
    (session_id, role, content),
)
```

`psycopg2` sends the **query** and the **values** to Postgres separately. The value is data, and data is never parsed as code — no quantity of quotes or semicolons inside it can escape into the query.

> ⭐ **This is a structural guarantee, not a filter.** Escaping/blocklisting is a filter — it can miss a case. Parameterisation removes the possibility, because the value never travels through the SQL parser at all. Same family as: prepared statements, `textContent` instead of `innerHTML`, `subprocess.run([...])` instead of `shell=True`.

Two traps worth memorising:

- It **looks** like `%`-formatting but isn't — `psycopg2` intercepts the markers. Never do `execute(sql % values)`.
- It is **always `%s`**, whatever the type. `%s` for an int, `%s` for a string. Never `%d`.

---

## Concept 6 — Reading the *last* n, in reading order

```python
cur.execute(
    """SELECT role, content FROM messages
       WHERE session_id = %s
       ORDER BY created_at DESC
       LIMIT %s""",
    (session_id, limit),
)
return cur.fetchall()[::-1]   # newest-first from SQL, flipped back to reading order
```

You want the **newest** 10 but you want to **read** them oldest-first. SQL has no "last 10 in order":

1. Sort **backwards** (`DESC`) so the newest are on top.
2. `LIMIT 10` takes them.
3. `[::-1]` in Python flips it back to conversation order.

Sorting ascending with `LIMIT 10` would hand you the ten **oldest** — the wrong end of a long chat.

**Why a limit at all:** every message fetched becomes tokens inside the `condense()` prompt.

> ⭐ **Anything that feeds a prompt needs a ceiling.** Unbounded history = a prompt that grows forever until it is slow, expensive, and eventually rejected by the model's context limit. The bug arrives on the day your best user has their longest conversation.

---

## Concept 7 — Pushing state to the edges

The signature change that mattered:

```python
def condense(question, history):   # was: condense(question)
```

`condense` stopped reaching outside itself for state. Same inputs → same output. It can be called from a test with a hand-written list and no database at all.

```python
def chat(question, session_id):
    history = get_history(session_id)          # per-session, from Postgres - no global, no mixing
    standalone = condense(question, history)   # memory applied BEFORE retrieval
    reply = ask(standalone)                    # full graph: route -> retrieve -> grade -> generate

    save_message(session_id, "user", question)  # store what the user typed, not the rewrite
    save_message(session_id, "assistant", reply)
    return reply
```

> ⭐ **Push mutable per-user state to the edges, keep the middle pure.** This is the same lesson as Day 11's decision to keep `condense()` *outside* the LangGraph graph — now applied one level down, inside `chat.py` itself. The impure part (`get_history` / `save_message`) is squeezed into the outermost function; everything below it is a function of its arguments.

**We still save the original question, not the rewrite.** Day 8's decision, unchanged. History is a record of what was *said*. Store the rewrite and the next `condense()` reads a rewrite-of-a-rewrite, drifting further from the human every turn.

### Deleting the global was the deliverable

The dead `history = []` had to go even though nothing read it any more (the local inside `chat()` shadowed it).

> ⭐ **A leftover global is a loaded gun.** The next function that forgets to accept `history` as a parameter will happily read the empty global and "work" — silently, with no memory and no error. Dead state that still *looks* live is worse than a crash.

---

## Concept 8 — Fresh connection per call

```python
def get_conn():
    return psycopg2.connect(DATABASE_URL)
```

Not one module-level connection. You spent this same session learning why a module-level global breaks under concurrency — and a `psycopg2` connection is **not thread-safe** either.

> ⭐ **Don't fix one global by adding another.**

Real deployments use a connection **pool**; Neon already pools on their side via the pooled URL. `ponytail:` good enough until it measurably isn't.

One trap: `with get_conn() as conn` **commits on clean exit and rolls back on exception — but does not close the connection.** That surprises everyone once. It's fine here; `init_db` runs once and the request functions are short.

---

## Concept 9 — The assert that failed on a day you changed nothing

`graph.py` was untouched today. It failed anyway:

```
AssertionError: expected a citation
```

The answer contained:

```
(Sources: gst-concept-2019.pdf, p. 46; ...)
```

The assert said:

```python
assert "Source:" in a
```

`"Sources:"` does not contain `"Source:"` — the `s` sits where the colon was expected. The citation was **there**. A human sees it instantly. Python doesn't.

`temperature=0` makes a model *deterministic-ish*, not *stable*. One run it writes one citation; the next it writes two and pluralises the label.

> ⭐ **Interview flashcard — the core problem with testing LLM systems.** Assert on what your **code** guarantees (a call happened, documents were retrieved, a refusal fired), never on how the model happened to phrase it. An assert on model wording fails on days you changed nothing — and a test that cries wolf gets deleted, taking its real coverage with it.

Today's fix was one character (`"Source"` — a prefix of both spellings). The **right** fix is already on the Week 4 list from Day 12: return `{answer, sources}` with the citations read from `state["documents"]` metadata.

> ⭐ **Don't ask an LLM to reproduce a value you already hold.** Then you assert on a list *you* built, and the model's prose can't break it.

Also note: that assert was written on Day 7 and **copied** into `graph.py` on Day 9. A copied assert has copied bugs.

---

## The self-checks

`database.py` got three asserts, and the third is the one that matters:

```python
sid = f"selftest-{uuid.uuid4()}"   # fresh id every run - never collides with real or past rows

save_message(sid, "user", "What is the GST registration threshold?")
save_message(sid, "assistant", "Rs 40 lakh for goods.")

rows = get_history(sid)
assert len(rows) == 2,        f"expected 2 rows, got {len(rows)}"
assert rows[0][0] == "user",  "history came back in the wrong order"
assert get_history(f"other-{uuid.uuid4()}") == [], "session filter leaked rows"
```

| assert | what it defends |
|---|---|
| `len == 2` | the write actually reached Postgres and the read found it |
| `rows[0][0] == "user"` | the `[::-1]` flip — real logic, and the kind that silently looks fine. Reversed history just makes `condense()` quietly worse, and you'd blame the LLM |
| the empty one | **the point of the whole day** — a different session sees *nothing* |

> ⭐ **Test the property you changed the design for.** Not just that the code runs.

### `uuid4()` — and a bug caught by writing it wrong

The first version read `uuid.uuid4` — **no parentheses**. That's the function *object*, not a call, so `sid` became `selftest-<function uuid4 at 0x...>`. Valid Python. No error. The test still passed.

But it passed **by accident**: the id was no longer guaranteed unique across runs, and a repeated memory address would have made `len(...) == 4` fail intermittently, weeks later.

> ⭐ **A test that passes for the wrong reason is the most expensive kind.** And: a self-check that only passes the **first** time is worse than no self-check — you'll start ignoring it.

`chat.py` kept Day 8's two asserts **unchanged in meaning** and gained one:

```python
assert len(get_history(sid)) == 4, "turns not persisted as 2 rows each"
```

2 turns × 2 messages = 4 rows. It catches the case where `condense` works off in-flight values but a `save_message` silently never fired.

> ⭐ **That's how you know a refactor is a refactor:** the tests that defined the old behaviour still pass, without being weakened. Day 9 proved the graph rewrite the same way.

---

## The demo that proves the day

Two requests over HTTP with `"session_id": "prince-1"`:

```
Q: "What is the GST registration threshold?"
Q: "And for services?"   →  rewritten to "...threshold for suppliers of services?"  ✅ memory works
```

Then the **same** second question with `"session_id": "someone-else"`:

```
→ a generic answer about what "supply of services" means under GST
```

No history for that session → `condense()` hit `if not history: return question` → the bare fragment went through unresolved. **Different history → different question → different answer.**

That third call is the entire day in one request.

---

## 60-second recall

- A module-level `history = []` is per-**process**; a conversation is per-**person**. The moment an HTTP server exists, that's a bug — and a silent, leaky one.
- HTTP is stateless; the **client** carries the thread via `session_id`.
- A client-supplied id is **identification, not authentication**. Anyone who guesses it reads that chat. Marked in the code, fixed in Week 5.
- Memory moved to Postgres because a dict still dies on restart and isn't shared between workers.
- One row per **message** (`session_id, role, content, created_at`) — the shape LLM APIs already speak.
- `IF NOT EXISTS` makes `init_db()` **idempotent**, so it can run on every boot.
- `%s` is parameterisation, not formatting: values never reach the SQL parser. Always `%s`, never `%d`, never an f-string.
- Rows have **no inherent order** — `ORDER BY created_at DESC` + `LIMIT n`, then `[::-1]`.
- Anything that feeds a prompt needs a **ceiling**.
- `condense(question, history)` — push per-user state to the edges, keep the middle pure.
- Never assert on an LLM's wording. Assert on what your code guarantees.

---

## Interview flashcards

| Q | A |
|---|---|
| Why is a module-level list a bug in a web app? | It's shared by every concurrent request in the process, dies on restart, and isn't shared between workers. Worst of all it fails *silently* — mixing users instead of crashing. |
| What's a session id? | A client-supplied key that ties requests into one conversation, because HTTP itself is stateless. |
| Session id vs auth token? | Identification vs proof. A bare id is a claim; a signed cookie/JWT is a claim the server can verify it issued. |
| Why not a `dict` in memory? | Fixes mixing, not durability. Restart wipes it; a second worker has its own. |
| Why one row per message? | Matches the `{role, content}` shape of every LLM API and survives turns that grow extra parts. |
| What does `IF NOT EXISTS` buy you? | Idempotent startup — safe to run on every boot and from several workers at once. |
| Why `%s` and not an f-string? | SQL injection. Query and values travel separately; the value is never parsed as code. Structural guarantee, not a filter. |
| Why `ORDER BY ... DESC ... LIMIT n` then reverse? | You want the newest n but in reading order, and SQL can't express "last n in order" directly. |
| Why cap history length? | It becomes prompt tokens — unbounded means slow, costly, then rejected. |
| Why pass `history` in instead of reading a global? | Purity: same inputs → same output, testable without a DB, no hidden per-user state in a shared function. |
| Why delete a global nothing reads? | The next function that forgets the parameter will read it and silently "work" with no memory. |
| Why did an untouched file's assert fail? | It asserted on the model's prose (`"Source:"`), and the model wrote `"Sources:"`. Test your guarantees, not its wording. |

---

## What's still owed

1. **`{answer, sources}` in the response** (from Day 12) — read citations from `state["documents"]` metadata instead of trusting the model to retype filenames. It currently mangles them (non-breaking hyphens) and has invented a page number.
2. **Real auth** — Week 5. Today's `session_id` is a claim, not a proof.
3. **Connection pooling** — if request volume ever makes per-call `connect()` measurable.
4. **`GROQ_MODEL` from env** — Week 6 config; the model id is still hardcoded after two vendor deprecations.

---

**Next:** Week 3 D3 — split routes into `routes/chat.py`, return sources in the response, calculator/upload stubs.

# Tutorial 20 — Point, Don't Name: Honest Citations and a Schema Migration — Week 5 D0

> **What you'll be able to recall after re-reading this:** why a filename written *by the model* is a guess and a filename read *off metadata* is a fact; the "point, don't name" pattern for getting structure out of an LLM; how a regex capture group works and why `\s*` sits at the front of this one; why narrowing one value in the middle of a pipeline changed the API response without touching the API; why `temperature=0` does **not** mean reproducible; how to spot an assert that passes when the feature is entirely missing; why old rows in your database are old code's output; how to add a column to a table that already has data; why `response_model` silently deleted your new field; and the `_` convention.
>
> **How to use this doc:** read top-to-bottom once. After that jump to any boxed **Analogy**, the **regex table**, the **five-silent-bugs table**, the **60-second recall**, or the **Interview flashcards**.

---

## Where this fits

```
WEEK 1   PDFs → chunks → embeddings → ChromaDB          ✅ Tutorials 01-06
WEEK 2   retriever → generator → memory                 ✅ Tutorials 07-09
WEEK 2.5 the pipeline as a graph: route/grade/rewrite   ✅ Tutorials 10-12
WEEK 3   the graph, reachable over HTTP, with sessions  ✅ Tutorials 13-15
WEEK 4   the React chat UI                              ✅ Tutorials 16-19  (PR #5 merged)
WEEK 5   D0 citations that are true and that persist    ▲ you are here
         D1 the tax calculator                          → next
```

Week 4 shipped. This day was not on the roadmap — it came from **looking at the product**. The answers had citations, and the citations were wrong in two different ways. That is worth a session.

---

## Concept 0 — Two problems wearing one coat

The complaint was one sentence: *"the citations are wrong."* Underneath it were two unrelated bugs, and the first job was to refuse to treat them as one.

**Problem 1 — the prose citations.** The model wrote `(Source: cgst-faq.pdf, page 12)` inside the answer text. That string is **model prose**. The same machinery that predicts the next word predicted that filename and that page number. Usually right; occasionally invented; never verifiable.

**Problem 2 — the pills were over-inclusive.** `unique_sources(result["documents"])` returned all 5 retrieved chunks. **Retrieved ≠ used.** The grader said "yes, these are relevant" about the *set*; the generator may have written its whole answer off chunk 2. Showing 5 citations for a 1-source answer is not exactly false, but it makes citations meaningless — and a citation nobody trusts is worse than none.

So the answer carried the **untrustworthy** copy of the truth and the pills carried the **trustworthy** copy, and they disagreed. You have met this exact shape before:

- Day 17, `localStorage`: two copies of the conversation, no tiebreaker → store the **key**, never the messages.
- Day 18, `hii`: the symptom was in the router, the cause was in `condense` → **debug at the boundary, not the symptom.**

⭐ **Interview tip:** "the citations are wrong" is a *symptom report*. Before writing a line, split it into independent failures and fix them in order. A fix that addresses two entangled bugs at once usually only really addresses one.

---

## Concept 1 — What the model may be trusted with

Ask what the model is actually good at here.

It cannot be trusted to **retype** a filename. That is recall, and recall is where models fabricate. But it *can* be trusted to **point at** a block it was just handed: "this fact came from block 2." Block 2 is sitting in its context window right now. That is not memory — that is reading.

> **🧠 Analogy — the exam and the answer sheet.** You don't want the student rewriting the textbook's title and page number from memory into every answer; he'll misremember one digit and nobody will notice. You want him to write "**[2]**" in the margin. **You** hold the numbered book list. He points; *you* do the naming.

So the design is:

1. The model emits `[2]`.
2. Your code reads the marker and maps it to the actual `Document` object.
3. Your code **deletes the marker** from the prose.
4. The user sees clean text, plus exactly the pills that were pointed at.

The metadata comes from `doc.metadata` — stamped on at chunk time back on **Day 4**, read off disk, never retyped by anything.

⭐ **Interview tip — this is the general pattern for getting structure out of an LLM.** Don't parse its prose. Make it emit a **token you designed**, and parse that. Prose is for humans; markers are for code. Same instinct as the one-word `yes`/`no` grader on Day 10 and the bare category name on Day 11.

### The prompt change

`SYSTEM_PROMPT` rule 3, before:

```
3. Always cite your sources at the end, like: (Source:filename.pdf, page 12)
```

after:

```
3. Cite with a numbered marker like [1] or [2] immediately after each fact you take
   from the context, matching the source numbers above. Never write filenames or page
   numbers in your answer - the marker is the whole citation.
```

Note the rule has **two clauses**: *do* point, and *don't* name. Remember that — it comes back when we write the asserts.

> **Small trap you got away with.** `SYSTEM_PROMPT` is an **f-string** (since Day 11, so `{REFUSAL}` interpolates). Square brackets are ordinary characters to an f-string, so `[1]` passes through untouched. Had you picked `{1}` as the marker style, that line would have exploded at import time.

---

## Concept 2 — A regex is a pattern for shapes in text

You want every `[` + digits + `]`. Written as a pattern: `\[(\d+)\]`.

| Piece | Means | Why |
|---|---|---|
| `\[` | a literal `[` | bare `[` starts a character class in regex; the backslash says you mean the character |
| `\d` | any digit | |
| `+` | one or more of the previous thing | `\d+` = at least one digit |
| `(...)` | **capture group** | "this is the part you hand back to me" — without it you'd get `"[2]"`, with it you get `"2"` |
| `\s*` | any whitespace, possibly none | put it **in front** so deleting the marker also eats the space before it |

That last one is not decoration. Without it, `"threshold is 40 lakh [1]."` becomes `"threshold is 40 lakh ."` — an orphan space before the full stop, on every sentence.

**Compile it once, at module level.** Same reasoning as the module-level `llm` (Day 7) and the module-level embeddings (Day 6): build the expensive object at import, reuse it per call.

---

## Concept 3 — `split_citations` is the *inverse* of `format_docs`

Look at what `format_docs` has been doing since Day 7:

```python
blocks.append(f"[Source {i}: {source}, page {page}]\n{doc.page_content}")
```

It turns documents into **numbered text**. The new function turns **numbered text back into documents**. They are a matched pair, so they live next to each other in the same file.

```python
CITE_RE = re.compile(r"\s*[\[【](\d{1,2})(?!\d)[^\]】]*[\]】]")

def split_citations(text, docs):
    """Split a model answer into (clean prose, the docs it actually pointed at)."""
    numbers = sorted({int(n) for n in CITE_RE.findall(text)})     # set = dedup, sorted = stable order
    used = [docs[n - 1] for n in numbers if 1 <= n <= len(docs)]  # guard: model can invent [9]
    clean = CITE_RE.sub("", text).strip()

    if not used:
        print("[cite] no markers found - falling back to all retrieved docs")
        return clean, docs

    return clean, used
```

Three lines, three separate ideas:

**`{...}` is a set comprehension — that's the dedup.** Curly braces with no `key: value` build a set, and a set cannot hold the same value twice. An answer citing `[2]` in three sentences would otherwise map to the same document three times and print three identical pills. `sorted()` then gives a stable order and hands back a list. (`sorted` and `int()` are separate jobs from the dedup — this was worth getting straight.)

**The `if 1 <= n <= len(docs)` guard is not paranoia.** The model can and does emit `[9]` when it was handed 5 blocks. Without the guard, `docs[8]` raises `IndexError` and the whole request 500s.

**`.strip()` only trims the two ends of the string.** It is *not* what cleans the prose — `\s*` inside the regex is doing that, marker by marker. `.strip()` is there for the model's own padding, the stray `\n` or `\n\n` that models habitually wrap their output in.

⭐ **Interview tip:** notice you already do this everywhere — `route_node`, `grade_node`, `rewrite_node`, and `condense` all end in `.content.strip()`. **Every LLM output gets normalised at the boundary.** Treat the model like any other untrusted input source: clean it once, where it enters your code.

---

## Concept 4 — Change what flows through the pipe, not every station

`generate_node` used to end:

```python
return {"answer": llm.invoke(messages).content}
```

Now:

```python
    raw = llm.invoke(messages).content
    clean, used = split_citations(raw, state["documents"])

    # narrowing documents here is deliberate: after this desk the folder holds
    # the chunks we CITED, not the 5 we fetched. unique_sources() reads it as-is.
    return {"answer": clean, "documents": used}
```

The interesting half is `"documents": used`. Look at `ask()`:

```python
return {"answer": result["answer"], "sources": unique_sources(result["documents"])}
```

`unique_sources` already reads whatever is in `state["documents"]` at the end. So narrowing that list from 5 chunks to the 1 the model pointed at makes the pills narrow **by themselves**:

- `unique_sources` — unchanged
- `ask()` — unchanged
- `routes/chat.py` — unchanged
- `App.jsx` — unchanged

⭐ **Interview tip:** that is the shape to look for in a refactor. **Change what flows through the pipe, not every station along it.** Same reason Day 17's history endpoint was 8 lines.

The cost is a small **meaning shift**: after this node, `state["documents"]` no longer means "what we retrieved", it means "what we cited". That is exactly the kind of thing the next reader will get wrong, so it gets a comment.

---

## Concept 5 — The assert that failed on purpose

First run after the prompt change:

```
AssertionError: expected a citation
    assert "Source:" in a, "expected a citation"
```

Correct behaviour. That assert encoded the **old** deal. You changed the deal, and the test caught you.

⭐ **A test that fails when you deliberately change behaviour is a test earning its keep.** The bad outcome would have been silence.

Rule 3 has two clauses, so it takes two asserts — one passing does not imply the other:

```python
    assert CITE_RE.search(a), "expected a [n] citation marker"      # DO point
    assert ".pdf" not in a, "model wrote a filename instead of a marker"   # DON'T name
```

And note **where** each check lives:

| File | Function | Text it sees | What it proves |
|---|---|---|---|
| `generator.py` | `answer()` | **raw** — no stripping | the model *emits* markers |
| `graph.py` | `ask()` | post-`split_citations` | the markers are *gone* |

Same regex, opposite expectation, pinning both ends of the pipeline.

---

## Concept 6 — The model has its own dialect, and `temperature=0` is not determinism

Second run of the **same question**:

```
* **Suppliers of goods** – ... exceeds **₹ 40 lakhs** ...【2†L14-L16】.
```

Those are **full-width CJK brackets** with a `†` and a line range. The model did not invent that for you — `【n†Lx-Ly】` is a citation format baked into `gpt-oss`'s training. You asked for square brackets; under pressure it reverted to its native habit.

⭐ **A prompt rule competes with the model's training, and does not always win.**

And the run before that gave `[2][4]` — same question, same prompt, same `temperature=0`. Temperature 0 kills sampling randomness but **does not make a hosted model deterministic**: batching and expert routing on a Mixture-of-Experts model shift the result run to run. Remember that before you ever write *"temperature=0, so it's reproducible"* in a design doc.

The fix is not a sterner prompt — that's a coin flip. Teach the regex the model's dialect:

```python
CITE_RE = re.compile(r"\s*[\[【](\d{1,2})(?!\d)[^\]】]*[\]】]")
```

| Piece | Means |
|---|---|
| `[\[【]` | character class: **either** kind of opening bracket |
| `(\d{1,2})` | capture one or two digits |
| `(?!\d)` | **negative lookahead** — and the next character must *not* be a digit |
| `[^\]】]*` | swallow the `†L14-L16` junk (anything that isn't a closing bracket) |
| `[\]】]` | close with either kind of bracket |

The lookahead is the subtle one. Without it, `[2024]` matches: `\d{1,2}` takes `20`, `[^\]】]*` takes `24`, `]` closes. The index guard would reject source 20 — but `.sub()` would still have **deleted a year from the user's answer**. With `(?!\d)`, `20` fails the lookahead, backtracks to `2`, fails again, and the whole match is abandoned.

Verified directly:

```
'single GST system 【3】 .'   ->  'single GST system .'   found ['3']
'turnover [2][4].'          ->  'turnover.'             found ['2','4']
'x 【2†L14-L16】.'            ->  'x.'                    found ['2']
'in [2024] the rule'        ->  unchanged               found []
```

---

## Concept 7 — An assert that passes when the feature is absent

The graph's new assert:

```python
assert not CITE_RE.search(a["answer"]), "marker must be stripped before the user sees it"
```

Run it and it passed. Look closer at *why it might have passed*:

- the model emitted markers and `split_citations` stripped them ✅ — or —
- the model emitted **no markers at all**, `used or docs` quietly fell back to all five chunks, and there was nothing to strip.

**Both satisfy the assert.** The test is satisfied by success and by total failure alike.

⭐ **An assert that passes when the feature is entirely missing is not testing the feature.**

The cheap fix is not a cleverer assert — it's to stop the fallback being silent:

```python
    if not used:
        print("[cite] no markers found - falling back to all retrieved docs")
        return clean, docs
```

Now the run tells you which branch fired, in the same `[route]`/`[grade]`/`[decide]` style the graph already prints. No `[cite]` line appeared → markers were found and mapped → the narrowing is real.

> **`ponytail:` note left in the code.** The fallback returns *all* docs rather than *none* — showing zero citations would be worse than showing too many. Tighten only if the model actually starts misbehaving.

---

## Concept 8 — Old rows are old code's output

Then the browser still showed `【3】` in a bubble. The regex demonstrably strips `【3】`. So what happened?

That bubble never went through today's code. It came out of **Postgres**. The model wrote it *before* the fix, it was saved as text with the marker in it, and `GET /history` simply handed the stored string back.

⭐ **Any time you change how data is produced, everything already in the database is still the old shape.** Your fix cleans answers on the way out of the graph; it cannot retroactively clean rows written last week. This is the entire reason migrations and backfills exist as a discipline.

The way to check yourself: DevTools → Application → Local Storage → delete `sessionId` → reload → ask fresh. **Clean session, clean bubble.**

---

## Concept 9 — The second bug was real: citations vanish on refresh

Every bubble lost its pills after a refresh, not just the old one. Cause, deferred deliberately on Day 17: the `messages` table has `role` and `content` and nothing else. Day 14's source list is computed per query and thrown away.

An answer with no citations is arguably worse than no answer — so this belongs on a branch called `fix/citation-accuracy`.

### Why a column, not a table

Sources belong to exactly one message and are never queried on their own. You will never ask *"which messages cite page 46?"*. A separate `sources` table with a foreign key is the textbook answer and buys nothing here. **One column on the row that owns it.**

### Why `JSONB`, not `TEXT`

The value is a list of dicts: `[{"source": "gst.pdf", "page": 46}]`. You *could* `json.dumps` into a `TEXT` column and `json.loads` on the way out. But Postgres has a native JSON type, and psycopg2's `Json` adapter hands a Python list straight in and a Python list straight back.

⭐ **Rung 4 of the laziness ladder: native platform feature over app code.** There is no `json.loads` anywhere in your codebase.

### Why the column must be nullable

The table already has rows — the ones in your screenshot. `ADD COLUMN ... NOT NULL` with no default is **rejected outright**, because Postgres cannot invent values for rows that already exist. Nullable means old rows get `NULL` and show no pills, which is exactly what they show today.

⭐ **A migration has to be true for the data already there, not just the data you're about to write.**

```python
        # migration: the table predates sources (Day 13). Nullable, so the rows
        # already in there stay valid - they just have no pills.
        cur.execute("ALTER TABLE messages ADD COLUMN IF NOT EXISTS sources JSONB")
```

`IF NOT EXISTS` keeps `init_db()` idempotent — same property as the `CREATE TABLE IF NOT EXISTS` above it, so it can run on every boot forever.

### The default argument that protected every caller

```python
def save_message(session_id, role, content, sources=None):
    ...
            (session_id, role, content, Json(sources) if sources else None),
```

`sources=None` by default, so **every existing call still works untouched** — the user-message call in `chat.py` does not have to know this parameter exists.

⭐ That is what a default argument is *for*: extending a function without breaking its callers.

---

## Concept 10 — Change a return shape, grep the callers

`get_history` now selects three columns, so it returns 3-tuples where it used to return 2-tuples. Every unpack site is broken — and Python raises at **runtime**, not import time, so nothing warns you.

Don't guess. Find them:

```
findstr /s /n "get_history" backend\*.py      :: cmd
grep -rn "get_history" backend/                # bash
```

⭐ **Change a function's return shape, grep its callers before you run anything.** The ticket names one caller; the grep names all of them. This is the same discipline as fixing a bug at the shared function rather than at the one path the report mentioned.

Two sites, two different needs:

```python
# rag/chat.py — condense needs role and content, but must still unpack three
convo = "\n".join(f"{role}: {content}" for role, content, _ in history)

# routes/chat.py — the endpoint wants all three
return [{"role": role, "content": content, "sources": sources or []}
        for role, content, sources in rows]
```

**The `_` convention.** A single underscore is an ordinary variable name — nothing magic about it — but by universal convention it means *"I'm forced to name this slot and I don't intend to use it."* A reader sees `_` and knows it was ignored on purpose, not forgotten.

Why `condense` doesn't want the sources: it flattens history into text for the LLM to read, so the model can resolve *"and for services?"* against the topic. Citations are metadata about *where an answer came from* — noise in that prompt, and noise costs tokens.

---

## Concept 11 — `response_model` is a whitelist, not a description

`Message` declared only `role` and `content`. Add `"sources"` to the returned dict and…​ nothing happens. No error. The endpoint returns exactly what it returned yesterday.

⭐ **`response_model=list[Message]` doesn't merely document the shape — it filters the output.** Any key not declared on the model is **dropped on the way out**, silently.

```python
class Message(BaseModel):
    role: str
    content: str
    sources: list[Source] = []      # user rows and pre-migration rows have none
```

And a second, sharper trap right behind it. Old rows come back as SQL `NULL`, which psycopg2 hands you as Python `None`. A Pydantic default fills in only when the key is **absent**; passing `None` explicitly is a *value*, and `list[Source]` rejects it. Hence:

```python
"sources": sources or []
```

⭐ **Interview tip:** "missing key" and "key present with value `None`" are different events to a validation layer. Most people learn this the hard way exactly once.

---

## Concept 12 — You built the whole pipe and poured nothing in

At this point:

- the column exists ✅
- `save_message` accepts a `sources` argument ✅
- `get_history` selects it ✅
- `Message` declares it ✅
- the endpoint returns it ✅

…​and the pills still would not come back, because **every new row would store `NULL`, exactly like the old ones**. Nothing ever *wrote* the value:

```python
save_message(session_id, "assistant", result["answer"], result["sources"])
```

⭐ Plumbing bugs hide at whichever end you weren't looking at. When a feature is "wired end to end but does nothing", walk the data path in **write order** — produce, store, read, transport, render — and name what each step does. The empty step is the bug.

The frontend half was one line, because `MessageBubble` already renders `message.sources` and does not care whether they arrived from a live `POST` or from history:

```jsx
setMessages(rows.map((r) => ({ role: r.role, text: r.content, sources: r.sources })))
```

⭐ Day 18's component split paying rent: the render path had exactly **one** place to teach.

That `.map` is still the Day 17 translation layer — backend says `content`, frontend messages say `text`. It now carries two fields across the boundary instead of one.

---

## Concept 13 — Working for the wrong reason

Sitting in `database.py` since Day 13:

```python
sid = f"selftest-{uuid.uuid4}"
```

No parentheses. That does not call `uuid4()` — it formats the **function object**, which renders as `<function uuid4 at 0x000001F...>`. That memory address happens to differ per process, so the session id happens to be unique per run, so the test happens to pass.

⭐ **Working for the wrong reason.** Run it somewhere addresses get reused and the "isolated" self-test starts accumulating rows across runs, and `assert len(rows) == 2` begins failing for reasons that make no sense. Line 65 got it right (`uuid.uuid4()`), which is what makes line 54 obviously a slip rather than a belief.

---

## The bugs — five, and every single one silent

| # | Bug | Why nothing caught it |
|---|---|---|
| 1 | `assert "Source:" in a` after the prompt change | *did* fail loudly — the one honest failure of the day |
| 2 | `【2†L14-L16】` not matched by `\[(\d+)\]` | markers simply not found; fallback returned all 5 and looked normal |
| 3 | `used or docs` fallback firing invisibly | assert `not CITE_RE.search(...)` is satisfied by success **and** by total absence |
| 4 | `Message` missing `sources` | `response_model` drops undeclared keys with no warning |
| 5 | `uuid.uuid4` without `()` | the function's repr contains a per-process address, so it looked unique |
| bonus | `{"sources": "gst.pdf"}` in the new assert | `sources` vs `source` — Day 16 bug 7, Day 18 bug 2, now Day 19 |

⭐ That last one is the third occurrence of the same bug across three days. **Typos in identifiers throw; typos in strings and dict keys cannot.** Read strings character by character; skimming them is how they survive.

---

## 60-second recall

- The model may **point** (`[2]`), never **name** (`file.pdf, page 12`). Pointing is reading; naming is recall, and recall is where it fabricates.
- `split_citations` is the **inverse of `format_docs`** — one numbers the blocks, the other reads the numbers back.
- `{...}` in a comprehension = **set** = dedup. `(?!\d)` = negative lookahead, keeps `[2024]` from being eaten.
- Narrow `state["documents"]` in `generate_node` and the pills narrow by themselves — **change what flows through the pipe, not every station**.
- `temperature=0` ≠ deterministic on a hosted MoE model.
- A **prompt rule competes with training** and doesn't always win; accept the model's dialect in the parser.
- An assert satisfied by the feature being **absent** is not a test. Make the fallback print.
- **Old rows are old code's output.** Fixes apply going forward only.
- New column on a populated table must be **nullable**; `ADD COLUMN IF NOT EXISTS` keeps `init_db()` idempotent.
- `JSONB` + psycopg2's `Json` = no `json.loads` anywhere.
- Change a return shape → **grep the callers first**. `_` = deliberately ignored slot.
- `response_model` is a **whitelist**; undeclared fields are dropped silently. And a Pydantic default does not cover an explicit `None`.

---

## Interview flashcards

**Q. How do you stop an LLM hallucinating citations?**
Don't let it produce them. Hand it numbered context blocks, have it emit a marker you designed (`[2]`), parse the marker, and read the real filename and page off your own metadata. The model points; your code names. Generalises to all structured extraction: parse a designed token, never prose.

**Q. Your RAG app returns 5 sources for every answer. What's wrong?**
Retrieved ≠ used. Retrieval picked 5 candidates; the generator may have used one. Citing all 5 makes citations unfalsifiable. Track which chunks the answer actually drew on and report only those.

**Q. `temperature=0` — is the output reproducible?**
No. It removes sampling randomness, not non-determinism. Batching and expert routing on hosted MoE models change results between identical calls. Don't build a test that depends on exact output text.

**Q. How do you add a NOT NULL column to a table with existing rows?**
You don't, not directly — Postgres has no value for the existing rows. Either make it nullable, or supply a `DEFAULT`, or do it in phases: add nullable, backfill, then add the constraint.

**Q. What does FastAPI's `response_model` actually do?**
Validates *and filters*. It coerces the return value into the declared model and drops anything undeclared. A field you forgot to declare disappears without an error — which is why "I returned it but the client doesn't see it" is usually a model problem, not a serialisation problem.

**Q. A function's return shape changed. What's your first move?**
Grep its callers before running anything. Runtime unpacking errors only surface on the code path you happen to exercise; the grep finds the sibling caller you'd otherwise ship broken.

---

## Self-test

1. Why is a filename in the answer prose less trustworthy than the identical filename in a pill, when both describe the same chunk?
2. `numbers = sorted({int(n) for n in CITE_RE.findall(text)})` — name the job each of `{}`, `sorted`, and `int` is doing. What breaks if you drop the braces?
3. The model emits `[2]`, `[2]`, and `[7]`, and `docs` has 5 entries. What is `used`?
4. Why does `generate_node` write `documents` back into state when it only computed an *answer*?
5. `assert not CITE_RE.search(answer)` passes. Name two completely different situations that produce that pass.
6. `【3】` shows up in the browser but the regex provably strips it. Where is it coming from?
7. Why can't `ALTER TABLE messages ADD COLUMN sources JSONB NOT NULL` run against your table?
8. You added `"sources"` to the returned dict and the client sees no change, with no error anywhere. What did you forget?
9. Why doesn't a Pydantic `= []` default rescue you when the database hands back `None`?
10. `f"selftest-{uuid.uuid4}"` passes its test every time. Why is it still a bug?

---

## What's deliberately still broken

- **Rows written before today keep their markers.** No backfill was run. They age out of the 20-message window naturally.
- **The refusal text is still wrong for a greeting** (Day 18's deferral, untouched). Week 5, with a new router category.
- **`sources` still lists every chunk the model pointed at, not the specific sentence each supports.** Sentence-level attribution is a much bigger job than this was.
- **The model still occasionally references facts "elsewhere in the GST rules"** — an uncited claim, which rule 1 forbids. Phrased as a hedge, so it slips past. Logged, not chased.
- **`get_conn()` still opens a fresh TCP+TLS connection per call.** Pool it in Week 6.
- **`session_id` is still unauthenticated.** Week 5, with logins.

---

**Next:** Tutorial 21 — the tax calculator. Deterministic arithmetic in a probabilistic app, and why marginal slabs are the most misunderstood idea in Indian personal finance.

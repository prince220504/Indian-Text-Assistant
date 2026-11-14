# 32 — `GET /sessions`: one row per chat

Day 31 left a one-way door: log out, log back in, and your old chat is gone from the screen. It's still in Postgres — the app just has no way to *list* it. The sidebar will fix that, and the sidebar needs a backend list to read.

This session answers:

> **how do you turn a table of messages into a list of chats?**

---

## Where we were

`feature/conversations-sidebar`, session 1 of 2-3.

| | What | Files |
|---|---|---|
| **S1 — this one** | `GET /sessions` → `[{session_id, title, last_at}]`, newest first, mine only | `database.py` · `routes/chat.py` |
| S2 | sidebar component, New chat / Calculator / Log out move into it, open/close toggle | frontend |
| S3 (maybe) | option B titles — 1 Groq call per chat | decided after seeing A's titles |

**0 new dependencies.** 0 frontend changes. Asserts **57 → 61** (3 sidebar + 1 Form-16 fix, see the end).

---

## The concept: many rows → one row

`messages` has **one row per message**. The sidebar wants **one row per chat**. So we must squash many rows into one.

> **Analogy — dhobi's register.** The dhobi writes one line per shirt: "Sharma ji, shirt, Monday". You ask: *"list my customers, latest first, with what they gave first."* He doesn't rewrite the book — he **groups the lines by name**, and for each group reads off the first item and the latest date. That's `GROUP BY`.

```sql
SELECT session_id,
       LEFT((array_agg(content ORDER BY created_at) FILTER (WHERE role = 'user'))[1], 40) AS title,
       MAX(created_at) AS last_at
FROM messages
WHERE user_id = %s
GROUP BY session_id
ORDER BY last_at DESC
```

Read it inside-out:

| Piece | Does |
|---|---|
| `WHERE user_id = %s` | only **my** rows — the same lock as `/history` (`t30`) |
| `GROUP BY session_id` | one bucket per chat |
| `array_agg(content ORDER BY created_at)` | the bucket's messages → one list, oldest first |
| `FILTER (WHERE role = 'user')` | only user messages go into that list |
| `[1]` | the first one — **Postgres arrays start at 1, not 0** |
| `LEFT(..., 40)` | cut to 40 chars = **option A title**, 0 LLM calls |
| `MAX(created_at)` | when the chat was last touched |
| `ORDER BY last_at DESC` | newest chat on top |

> ⭐ **Interview tip:** in a `GROUP BY` query, every column must be **grouped or aggregated**. `content` alone is an error — Postgres can't guess which of ten messages you meant. `array_agg(...)[1]` and `MAX(...)` are you telling it *which one*.

### Why `FILTER`? (your answer)

> "Both the user's question and the assistant's answer are stored. If the assistant's row got picked, the first 40 characters of the *answer* would become the chat's title."

Exactly. Today the user's row is always saved first, so the title would come out right even without `FILTER` — but that's an **accident of save order** in `rag/chat.py`, not a rule. `FILTER` turns the accident into a rule.

> ⭐ **Don't lean on accidental order — say what you mean in the query.**

### Pre-login rows: hidden for free

Rows from before Day 30 have `user_id = NULL`. `NULL = 7` is NULL, not TRUE, and `WHERE` keeps only TRUE. They never show up. Nothing to write.

---

## The code

### `database.py` — under `get_history`

```python
def get_sessions(user_id):
    """One row per chat for ONE user, newest first: (session_id, title, last_at). Title = first question, cut at 40."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT session_id, ... ORDER BY last_at DESC""",   # the query above
            (user_id,),
        )
        return cur.fetchall()
```

`(user_id,)` — the trailing comma makes it a tuple. Without it, `(user_id)` is just `user_id` in brackets.

### Self-check — 3 new asserts, after the stranger test

```python
sessions = get_sessions(owner)
assert sessions[0][0] == sid, "newest chat is not on top"
assert sessions[0][1] == "What is the GST registration threshold?"[:40], "title is not the first user message"
assert get_sessions(stranger) == [], "sidebar leaked a stranger's chats"
```

`owner` is a brand-new user made seconds earlier, so they have exactly one chat. **A fresh user per run = old rows can't pollute the test.** The three asserts cover the three things that would go wrong *silently*: order, title source, isolation.

### `routes/chat.py` — the route

```python
class SessionSummary(BaseModel):
    session_id: str
    title: str | None    # None only if a chat somehow has no user row
    last_at: datetime    # Pydantic sends it as an ISO string

@router.get("/sessions", response_model=list[SessionSummary])
def sessions_route(user_id: int = Depends(current_user)):
    rows = get_sessions(user_id)
    return [{"session_id": sid, "title": title, "last_at": last_at} for sid, title, last_at in rows]
```

Same shape as `/history`: `Depends(current_user)` hands over `user_id` from the token; the request never says who you are. Tuples → dicts with the same list comprehension.

- **`last_at: datetime`** — JSON has no date type, so Pydantic sends `"2026-10-25T10:12:03+00:00"`. The frontend won't even display it; it's there so the order is checkable.
- **`title: str | None`** — `FILTER` gives `NULL` for a chat with zero user rows. Can't happen today. But with plain `str`, one odd row would make Pydantic **500 the whole list**. ⭐ **One bad row shouldn't kill the sidebar.**

---

## Bugs this session

| # | Bug | Loud or silent | How found |
|---|---|---|---|
| 1 | `FILTER (WHERE role == 'user')` — Python's `==` inside SQL | **loud** — Postgres: `operator does not exist: text == unknown` | hint: "compare line 99 with line 102" |
| 2 | Swagger answered the GST question with the refusal | **silent** — `200 OK` | log said `[route] Form-16` for a GST question |

### Bug 2, in detail — the word `"string"`

Swagger's "Try it out" pre-fills **every** field, optional ones included:

```json
{ "question": "...", "session_id": "string", "doc_text": "string", "filename": "string" }
```

So the backend received a "Form 16" whose whole text was the word `string`. The model read it, found no GST threshold in it, and refused. **The refusal was correct for that input** — the pipeline worked perfectly on garbage.

The clue was one line *above* the one that looked scary:

```
[route] Form-16 (attached document)      ← a GST question should say GST
[cite] no markers found - falling back to all retrieved docs
```

Fix: delete `doc_text` and `filename` from the Swagger body.

> ⭐ **If it's silent, look at a string.** This time literally the string `"string"`. Same family as Day 30's "Swagger fakes examples from `pattern`" — new victim: optional fields.

### The `[cite]` line — not a bug, but noise

On the Form-16 path, the model rarely writes `[1]`, so `split_citations` prints its fallback message — and then `ask()` throws those docs away anyway (`sources = [] if doc_text`). Harmless, but it fires nearly every time on that path.

> ⭐ **An always-on warning hides the real one** (Day 30's `InsecureKeyLengthWarning`). The day the corpus path really loses its citations, you'll have learned to skip this line.

**Fixed on this branch** — branch per *feature*, not per fix (your call, and the project rule).

**Root cause, not the print.** Deleting the `print` would kill a real warning on the corpus path. The problem: `split_citations` does two jobs —

1. **strip** `[n]` markers out of the prose
2. **map** markers → chunks (with the fallback + warning)

The Form-16 path needs job 1 only: the model might still write `[1]`, and that must never reach the user. Job 2 is pointless, because `ask()` drops the docs.

> 🧾 **Analogy:** the CA's assistant stamps "receipt missing!" on every page of *your own* salary slip. You're holding it — there's no receipt to attach. The stamp is right on client files and wrong on yours. Don't throw away the stamp; skip it for your own documents.

`graph.py`, `generate_node`, between `raw = ...` and `split_citations(...)`:

```python
if state.get("doc_text"):
    return {"answer": CITE_RE.sub("", raw).strip()}
```

Same regex `split_citations` uses, so it's reused, not rewritten. Plus one assert under the Form-16 test:

```python
assert not CITE_RE.search(e["answer"]), "citation marker leaked into the Form-16 answer"
```

> ⭐ **Test the risk of the fix, not the symptom.** The risk here isn't the print coming back. It's the early return forgetting to strip. This assert fails if it does.

Asserts **60 → 61**. Run: `[route] Form-16` with no `[cite]` line under it.

---

## Swagger smoke test

| # | Do | Expect | Got |
|---|---|---|---|
| 1 | `GET /sessions`, no token | 401 | ✅ |
| 2 | log in, Authorize, `GET /sessions` | my chats, newest first, titles = my first questions | ✅ |
| 3 | `POST /chat` with only `question` + `session_id` | `[route] GST`, cited answer | ✅ |
| 4 | fresh account, `GET /sessions` | `[]` | ✅ |

---

## Flashcards

- **Many rows → one row per X?** → `GROUP BY X`, and aggregate every other column.
- **First value in a group, in order?** → `(array_agg(col ORDER BY t))[1]` — arrays are **1-based**.
- **Aggregate only some rows of the group?** → `FILTER (WHERE ...)` after the aggregate.
- **SQL equality?** → `=`. `==` is Python.
- **Why `title: str | None`?** → one NULL row must not 500 the whole list.
- **Why a fresh user in the self-check?** → old rows can't pollute `sessions[0]`.
- **Swagger answer looks wrong but returned 200?** → check what Swagger pre-filled.

## Self-test

1. Drop `FILTER (WHERE role = 'user')`. Does any test fail today? Why not — and why keep it anyway?
2. Remove `MAX(created_at)` and put plain `created_at` in the `SELECT`. What does Postgres say?
3. A pre-Day-30 row has `user_id = NULL`. Walk through why it never appears in anyone's sidebar.
4. You change `title: str | None` back to `title: str`, and one chat has no user row. What does the browser get?
5. A GST question returns the refusal in Swagger with `200 OK`. What's the first log line you read?

# 30 — User-scoped chat: the token finally gates something

Day 29 built a ticket machine. `POST /login` handed out signed JWTs, and nothing in the app ever asked to see one. Anyone could still type any `session_id` and read that chat.

This session answers:

> **how does a route know *who* is asking, and how does the database make sure they only see their own rows?**

---

## Where we were

`feature/auth-logins`, session 3 of 4.

| | What | Files |
|---|---|---|
| S1 (Day 28) | `users` table + password hashing | `database.py` |
| S2 (Day 29) | `/register` · `/login` · JWT mint + verify | `routes/auth.py` |
| **S3 — this one** | `user_id` on `messages`, gate on `/chat` + `/history` | `database.py` · `routes/auth.py` · `routes/chat.py` · `rag/chat.py` |
| S4 | login screen, token in `localStorage`, `Authorization` header | `pages/Login.jsx` · `App.jsx` · `pages/Chat.jsx` |

This is the session that kills **debt #10**: `session_id` was client-supplied and unauthenticated, so guessing an id meant reading the chat.

---

## The concept: locker number vs. locker owner

> **Analogy.** Before today, `session_id` was a **bank locker number**. Say the number at the counter, the locker opens. The number was the only key.
>
> After today, the clerk first checks your **Aadhaar** (the JWT), then looks for a locker with **this number AND your name on it**. Give a stranger's number and the answer is *"no locker found"*, never *"that locker isn't yours"*, because the second sentence confirms the locker exists.

So `session_id` changes job:

| | Before | After |
|---|---|---|
| `session_id` answers | whose chat **and** which chat | **which** of my chats |
| `user_id` comes from | nowhere | the token, only |
| foreign `session_id` | full history | `[]` |

### Why `[]` and not 404 (decided Day 29)

A 404 that says "not yours" is a **different response** from "doesn't exist". Any difference is an oracle. It's login's email-enumeration leak one layer up. The filter makes both cases look identical, because to the query they *are* identical: zero matching rows.

---

## Chunk 1 — the column (`database.py`)

```python
        # migration (Day 30): who owns the row. Nullable - pre-login rows get NULL,
        # and NULL = anything is never TRUE, so no query can ever reach them.
        # REFERENCES = Postgres itself refuses a user_id that isn't in users.
        cur.execute("ALTER TABLE messages ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)")
```

Three ideas packed in one line:

- **`IF NOT EXISTS`** — same trick as Day 13's `sources` migration. Safe on every startup.
- **Nullable** — old rows can't be given an owner (nobody knows whose they were). They get `NULL`.
- **`REFERENCES users(id)`** — a foreign key. The DB refuses `user_id = 999` if user 999 doesn't exist. A DB constraint beats app code: it can't be forgotten in one code path.

> ⭐ **`NULL = 5` is not FALSE. It's NULL.** SQL has three truth values, and `WHERE` keeps only rows that are TRUE. So `WHERE user_id = 7` can never match a NULL row. The pre-login rows became unreachable orphans **for free** — no cleanup code, no `DELETE`.

Then both functions take `user_id` first, and the read filters on both columns:

```python
               WHERE user_id = %s AND session_id = %s
```

### The bug of the day: a retyped block lost a line

The `user_id` migration was meant to go *under* the `sources` migration. It replaced it instead. My instruction said "under" but didn't show the surrounding lines, so it read as "replace".

Why nothing broke: the Neon DB **already had** the `sources` column from Day 13. It would only crash on a **fresh** database, which means Week 6 deploy day, on the very first message.

> ⭐ **A migration you delete doesn't fail today. It fails on the next empty database.** Today's DB remembers every migration you ever ran; a new one remembers only what's still in the file.

---

## Chunk 2 — the proof (`database.py` self-test)

```python
    owner = create_user(f"owner-{uuid.uuid4()}@example.com", "longenough")
    stranger = create_user(f"stranger-{uuid.uuid4()}@example.com", "longenough")
    ...
    # THE S3 test: right session_id, wrong person -> nothing.
    assert get_history(stranger, sid) == [], "user filter leaked rows - a stranger read someone else's chat"
```

Real users, not a made-up `1`, because the foreign key would refuse a user that doesn't exist. Asserts **14 → 15**.

**Side quest:** the first run died with `could not translate host name ... Name or service not known`. Not code. *Translate host name* = DNS. It died inside `connect`, before any SQL. `nslookup` worked a minute later — a network blip.

> ⭐ **Read the exception's own words before the stack trace.** "host name" = network, not logic.

---

## Chunk 3 — the gate (`routes/auth.py`)

> **Analogy.** `/chat` used to be a railway platform with no TC. Now there's a TC at the gate. Valid ticket → you walk through, and the TC tells the train who you are. No ticket → you never reach the platform.

```python
bearer = HTTPBearer()     # reads "Authorization: Bearer <token>"; 401 if the header is missing

def current_user(creds: HTTPAuthorizationCredentials = Depends(bearer)):
    """The gate. A route that takes Depends(current_user) gets a verified user_id - or never runs."""
    return decode_token(creds.credentials)
```

How `Depends` works: FastAPI sees `user_id: int = Depends(current_user)` in a route's signature and runs `current_user` **before** the route body. If it raises 401, the body never executes. The route can't forget the check, because the check isn't in the route.

Dependencies chain: `current_user` itself depends on `bearer`. FastAPI resolves the whole chain — header → token string → verified id — before your code sees anything.

`HTTPBearer` is built into FastAPI: **no new dependency**. It also gives Swagger the 🔒 **Authorize** button.

> ⭐ **Interview tip:** "validate at the trust boundary" (Day 29) made *structural*. One gate function; every protected route opts in with one parameter. Not an `if token...` copy-pasted into every route.

### Two cleanups in the same file

1. **Stale docstring.** `decode_token` said *"The only gate S3 will use"*. Now `current_user` is the gate → *"current_user is the only caller."* Third docstring bug in five days (26, 28, 30). The line above the code is never type-checked.
2. **The warning that wasn't ours.** `InsecureKeyLengthWarning: The HMAC key is 19 bytes`. Real `JWT_SECRET` = 64 chars. The 19 bytes was the *test's* forged key, `"not-the-real-secret"`. Lengthened to 38.

> ⭐ **An always-on warning is noise that hides the real one.** If the real secret ever got too short, it would print this exact same line — and you'd have learned to scroll past it.

---

## Chunk 4 — wiring it through (`routes/chat.py` + `rag/chat.py`)

```python
def chat_route(req: ChatRequest, user_id: int = Depends(current_user)):
    return chat(user_id, req.question, req.session_id, req.doc_text, req.filename)
```
```python
def history_route(session_id: str, limit: int = 20, user_id: int = Depends(current_user)):
    rows = get_history(user_id, session_id, limit)
```

`rag/chat.py`'s `chat()` takes `user_id` first and passes it to `get_history` and both `save_message` calls.

> ⭐ **Interview tip — identity comes from what you can verify, never from what the client says.** If `ChatRequest` had a `user_id` field, an attacker types `"user_id": 1` and becomes user 1. The token is signed; the JSON body isn't.

Before editing, we grepped the callers of `chat()`: exactly 3 (the route + 2 self-test lines). Changing a signature without knowing every caller is how you ship a crash in a path you didn't run.

---

## Step 5 — Swagger smoke test (the only real proof)

The self-tests call functions directly, which skips HTTP. Nothing in the suite has seen the gate reject a request. So:

| # | Do | Got |
|---|---|---|
| 1 | no Authorize → `GET /history/smoke-1` | **401** `Not authenticated` |
| 2 | register user A | 200 + token |
| 3 | Authorize as A → `/chat` → `/history/smoke-1` | answer · 2 rows |
| 4 | Authorize as **B** → `/history/smoke-1` | **`[]`** ← the S3 proof |
| 5 | Authorize with `abc` | **401** `Invalid token.` |

### The weird email in Swagger

The register example showed `7A<Z|vJki+...@X&R2Q...`. Not a bug: Swagger **generates** an example from the `pattern` regex, and that string really matches it. It's a live demo of how loose a format check is. Fix: `examples=["..."]` on the `Field`.

> ⚠️ `examples` — **plural, a list**. Singular `example=` is the Day 29 trap: Pydantic v2 silently files unknown kwargs under `json_schema_extra`. Reloading `/docs` and seeing the example is the proof you typed the right name.

---

## Flashcards

| Q | A |
|---|---|
| What does `session_id` mean after S3? | *Which* of my chats. Not *whose*. |
| Where does `user_id` come from? | The verified token. Never the request body. |
| Stranger asks for your `session_id` — response? | `[]`. Same as a session that doesn't exist. |
| Why not 404? | Different response = oracle. Confirms the session exists. |
| Why does `WHERE user_id = 7` skip old rows? | `NULL = 7` is NULL, not TRUE; `WHERE` keeps only TRUE. |
| What does `REFERENCES users(id)` buy? | Postgres refuses a `user_id` that isn't a real user. |
| What does `Depends(current_user)` do? | Runs the gate before the route; 401 = route body never runs. |
| Why did the deleted `sources` migration not crash? | The live DB already had the column. A fresh DB would crash. |
| Why fix a harmless warning? | An always-on warning trains you to ignore the real one. |
| `example=` vs `examples=` in Pydantic v2? | `examples=[...]` is real; `example=` is silently swallowed. |

## Self-test

1. Delete only `= Depends(current_user)` from `history_route`, leaving `user_id: int`. What breaks, and what does the error look like? *(It doesn't break — `user_id` becomes a required query param. Anyone can type `?user_id=1`. Silent, and worse than a crash.)*
2. Why can't the test use `save_message(1, sid, ...)` with a hard-coded `1`?
3. You deploy to a brand-new Neon database. Which line in `init_db` must run before the `user_id` migration, and why?
4. Someone suggests returning 403 for a foreign `session_id` "to be more helpful". What do you say?
5. Swagger shows a weird random email. Is your validator broken?

**Next (S4):** the browser gets a login screen, keeps the token in `localStorage`, and sends `Authorization: Bearer` on every fetch.

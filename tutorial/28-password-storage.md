# 28 — Password storage: the one column you must never fill honestly

> Day 28. Session 1 of 4 for logins. `requirements.txt` + `backend/database.py` only.
> No routes yet, no token yet, no frontend yet. This session is about one question:
> **what do you actually put in the database when a user picks a password?**
>
> Answer: not the password.

---

## Where we were

Everything built so far has had the same hole in it, marked in `routes/chat.py` since Day 13:

```python
session_id: str     # client-supplied. NOT authentication - anyone who guesses an id reads that chat
```

Guess someone's `session_id`, read their conversation. That debt is why Day 26 refused to store Form 16 text server-side at all — *the cabinet has no lock yet, and your salary is in that paper.*

This feature builds the lock. Four sessions:

| | What | Files |
|---|---|---|
| **S1 — this one** | `users` table + password hashing | `requirements.txt` · `database.py` |
| S2 | `POST /register` · `POST /login` · JWT | `routes/auth.py` · `main.py` |
| S3 | `user_id` on `messages`, protect `/chat` + `/history` | `database.py` · `routes/chat.py` · `rag/chat.py` |
| S4 | login screen, token in `localStorage`, `Authorization` header | `pages/Login.jsx` · `App.jsx` · `pages/Chat.jsx` |

The conversations sidebar unblocks after S3 — that is the session where `GET /sessions` can finally filter by something that isn't guessable.

---

## The concept: why passwords are never stored

> **Analogy.** Your bank does not keep a photocopy of your signature in a drawer. If a thief breaks the drawer open, every customer's signature is now his. Instead the bank keeps something it can *compare against* your signature, but which cannot be turned back into one.

Your `messages` table lives on Neon — a server you do not own, reachable over the internet. Assume one day it leaks. What is in the `users` table on that day?

**Not the password. A hash** — a one-way function:

```
"mypassword123"       →  hash()  →  "$2b$12$Kj8f...3kP"
"$2b$12$Kj8f...3kP"   →  ???     →  no way back
```

Login still works, because hashing is *repeatable*: hash whatever they typed, compare to the stored hash, equal means right password. The server never knows the password itself once that request ends.

### The word that gets interviews wrong

A hash is **not decrypted.** Not SHA-256, not bcrypt, not any hash. There is no reverse function, no key, not even a slow one. Encryption is two-way and has a key; hashing is one-way and has none. Saying "decrypt the hash" tells the interviewer you think a hash is a cipher.

So what does a thief do with a leaked hash column? **He guesses.**

```
guess "password"    → hash it → compare to the stolen hash → no
guess "123456"      → hash it → compare → no
guess "prince2005"  → hash it → compare → MATCH
```

He never reverses anything. He runs the *same forward direction you do*, over a dictionary of likely passwords, and watches for a collision. That is a **brute-force** (or dictionary) attack.

### Which is why speed is the flaw

| | one hash | one billion guesses |
|---|---|---|
| SHA-256 | ~0.000001 s | **minutes on a GPU** |
| bcrypt, cost 12 | ~0.3 s | **~10,000 years** |

Same attack, same direction. The only thing that changed is the **price per guess**. 0.3 s is invisible on one login and ruinous across a billion.

**⭐ Interview tip.** *"How do you store passwords?"* → bcrypt (or argon2/scrypt), per-password salt, tunable work factor. Never SHA-256 or MD5 — wrong tool, too fast. Never encryption — encryption is reversible by design, which is the opposite of what you want. And phrase the attack right: *"a fast hash lets an attacker brute-force the leaked hashes offline; bcrypt's work factor makes each guess expensive enough that brute force stops paying."*

### Salt

bcrypt also mixes random bytes into each password. Without a salt, two users who both chose `india123` get **the same hash** — crack one, get both — and an attacker can pre-compute a giant password→hash lookup table once and reuse it on every breach forever (a **rainbow table**). A per-password salt makes every stored hash unique even when the passwords are identical, and makes pre-computation worthless.

The salt lives *inside* the output string. That `$2b$12$Kj8f...` is **algorithm + cost + salt + hash**, all in one field — so there is no second column to design, store, or forget.

---

## The ladder, out loud

- **Rung 5 — does an installed dependency do this?** No. Nothing in `requirements.txt` hashes passwords. We need one.
- Every FastAPI tutorial reaches for `passlib[bcrypt]`. **Skipped.** `passlib` is barely maintained and currently throws a version-detection warning against modern `bcrypt`. It is a wrapper over the thing we actually want.
- `bcrypt` on its own is **two function calls.**

```
bcrypt
```

One line in `requirements.txt`. Total dependency cost for this entire auth feature: **two packages** (`bcrypt` now, `PyJWT` in S2). No `passlib`, no `python-jose`, no auth framework.

---

## Chunk 2 — the table

```python
cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
    id             SERIAL       PRIMARY KEY,
    email          TEXT         UNIQUE NOT NULL,
    password_hash  TEXT         NOT NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
""")
```

Four columns, and each one is a decision.

**`id SERIAL PRIMARY KEY`, not email as the key.** An email is a *contact detail* and people change them. A primary key is a permanent name for a row, and in S3 every message will carry a `user_id` pointing here. If the key were the email, changing an email would mean rewriting every message row. An integer never has to change.

**`password_hash`, not `password`.** The column name is documentation. Anyone reading this schema in a year knows what belongs there — and would feel the wrongness of putting plaintext in a column called `password_hash`. ⭐ **Name columns after what they hold, not what they are about.**

**No `name`, no `phone`, no `is_active`, no `role`.** YAGNI. Nothing in the app asks for them. Same call as Day 14's skipped route stubs.

### `UNIQUE` is not a validation, it is a race fix

You could check the email in Python instead: `SELECT` it, if a row comes back say "already registered", otherwise `INSERT`. That reads fine and it is **broken**. Two people register the same email in the same moment:

```
request A: SELECT → nothing found
request B: SELECT → nothing found     ← B ran before A inserted
request A: INSERT → ok
request B: INSERT → ok                ← duplicate account, both passed the check
```

Two rows, one email, and login is now ambiguous. That gap between *check* and *act* is a **race condition**, and no amount of Python closes it, because the two requests are separate processes that cannot see each other.

`UNIQUE` is enforced by Postgres at write time, inside the same operation as the insert. There is no gap. B's `INSERT` fails, full stop.

**⭐ Interview tip (and rung 4 of the ladder in the wild):** *a DB constraint beats app-level validation, because the constraint has no race.* You still want a friendly message in Python — but the Python is UX and the constraint is correctness.

> **The stale docstring.** Adding this table made line 17 a lie: `"""Create the messages table..."""`. Nothing errors when a docstring goes stale. Day 26's bug was also a docstring — a different kind, same blind spot. **The line above the code is the code's only description of itself, and it is never type-checked.**

---

## Chunk 3a — the hashing pair

```python
def hash_password(password):
    """Plaintext in, bcrypt hash out. gensalt() makes a fresh random salt; it ends up inside the result."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password, password_hash):
    """True if the plaintext matches the stored hash - bcrypt reads the salt and cost back out of the hash."""
    return bcrypt.checkpw(password.encode(), password_hash.encode())
```

Three things worth the ink.

**`.encode()` / `.decode()` — bcrypt works on bytes, not `str`.** A Python `str` is a sequence of *characters*; bcrypt is a cryptographic function over *bytes*. It refuses to guess which encoding your characters are in, so you say it: `.encode()` gives UTF-8 bytes going in, `.decode()` gives a `str` back for the TEXT column. ⭐ Day 25 taught this boundary from the other side — *JSON is text, a PDF is bytes.* Same wall, crossed the other way.

**`verify_password` takes the hash, not the salt.** You never store a salt separately and never pass one in. `checkpw` parses `$2b$12$<salt><hash>`, pulls the salt and cost back out of the stored string, re-hashes your guess exactly the same way, and compares. A self-describing format is why one column is enough.

**Why `checkpw` and not `hash_password(p) == stored`?** Two reasons, and the second is the interesting one.

1. A fresh `gensalt()` means a different salt, so the two hashes would never match. The comparison would reject every correct password.
2. `checkpw` compares in **constant time** — it does not bail out early on the first wrong byte. A plain `==` on secrets leaks information through *how long it took to say no*, which is a **timing attack**.

⭐ **Never `==` two secrets.** Use the library's compare. (Python's own version of this is `hmac.compare_digest`.)

---

## Chunk 3b — the two queries

```python
def create_user(email, password):
    """Register one user. Return the new id, or None if that email is already taken."""
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                "INSERT INTO users (email, password_hash) VALUES (%s, %s) RETURNING id",
                (email.strip().lower(), hash_password(password)),
            )
            return cur.fetchone()[0]
    except psycopg2.errors.UniqueViolation:
        return None

def get_user_by_email(email):
    """Return (id, password_hash) for a login attempt, or None if there's no such user."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, password_hash FROM users WHERE email = %s", (email.strip().lower(),))
        return cur.fetchone()
```

**`.strip().lower()` in both — and it has to be both.** This closes chunk 2's loose end. `UNIQUE` compares raw strings, so `Prince@x.com` and `prince@x.com` are two different rows as far as Postgres is concerned. Normalising on the way **in** makes the constraint actually mean "one account per email". Normalising on the way **out** means you can sign up as `Prince@X.com ` (trailing space and all) and still log in typing `prince@x.com`.

⭐ **Normalise at every door, or the constraint guards a shape your users never type.** A guard on one side only is worse than no guard, because it looks like it works.

**`RETURNING id` — Postgres hands back the `SERIAL` it just generated.** The alternative is insert, then `SELECT` the row back to find its id: two round trips, and another gap in between. One statement, no gap. Same reflex as the `UNIQUE`.

**The `try` wraps the `with`, not the inside.** This is deliberate and easy to get backwards. A failed `INSERT` poisons the transaction — Postgres refuses everything else on that connection until someone rolls it back. `with get_conn() as conn` rolls back automatically **when an exception leaves the block**. Put the `except` *inside* and you swallow the exception before `with` ever sees it, so it tries to commit a dead transaction instead.

⭐ **Let the context manager see the exception, then catch it outside.**

**Why catch it here at all, instead of in the route?** Because this is the one place that knows the email is a duplicate, and `None` is a shape the caller cannot misread. The route stays dumb — exactly like `routes/chat.py` is one line over `chat()`, and exactly like Day 25 put the real work in `extract_text()` and left the route as guards.

### Two accepted tradeoffs, both deliberate

**Account enumeration.** Returning `None` only for a duplicate lets someone probe which emails have accounts here. Every register form on the internet leaks this; the only real alternative is to always say "check your email" and send a confirmation link. Not worth it for this project. **But in S2 the *login* route must not leak it** — "no such user" and "wrong password" have to produce the same response, because *there* the probe is free and the prize is bigger.

**bcrypt refuses passwords over 72 bytes** — a hard limit of the algorithm, not of the library. Nothing caps the length yet, so a 100-character password raises `ValueError` and becomes a 500. S2 fixes it where every other limit in this project lives: a Pydantic `Field` at the trust boundary, next to `doc_text`'s `max_length=200_000`. ⭐ Day 26 again: *a guard protects the endpoint it sits on, not the data.*

---

## Chunk 4 — the check

Ten asserts, one line each, on a path where being wrong is a breach. `database.py` goes from 4 asserts to 14; the project from **39 to 49**.

```python
    # --- users (Day 28) ---
    email = f"selftest-{uuid.uuid4()}@example.com"

    uid = create_user(email, "correct-horse")
    assert uid is not None, "first registration should succeed"

    assert create_user(email, "whatever") is None, "UNIQUE did not stop the duplicate email"
    assert create_user(f"  {email.upper()}  ", "whatever") is None, "normalisation leak - case/space made a second account"

    row = get_user_by_email(email)
    assert row is not None and row[0] == uid, "lookup did not find the user we just made"

    stored = row[1]
    assert stored != "correct-horse", "password stored in PLAINTEXT"
    assert stored.startswith("$2b$"), f"not a bcrypt hash: {stored[:10]}"
    assert verify_password("correct-horse", stored), "right password rejected"
    assert not verify_password("wrong-horse", stored), "wrong password accepted"

    assert hash_password("x") != hash_password("x"), "same hash twice - the salt is not random"

    assert get_user_by_email(f"nobody-{uuid.uuid4()}@example.com") is None, "lookup invented a user"

    print("OK - users: hashing, salt, verify, UNIQUE, normalisation")
```

Two of these are doing more work than they look like.

**`hash_password("x") != hash_password("x")`** reads like a bug. It is the salt test. Hash the *same* password twice and the results must **differ**, because each call draws a fresh random salt. The day that line could be written as `==`, salting is broken and one cracked password unlocks every user who chose it. ⭐ **A test that looks backwards is often the one testing the non-obvious property.**

**`stored != "correct-horse"`** is the dumbest assert in the file and the one you would most regret not having. It is the only line that catches someone "simplifying" `hash_password` out of `create_user` six months from now.

The rest are shape and behaviour: `$2b$` proves it is really bcrypt and not some other string that happened to land in the column, right password in, wrong password out, duplicate blocked, case-and-space duplicate blocked, unknown email returns `None` rather than inventing a row.

```
python -m backend.database
```

```
table ready
OK - write, read, order, isolation
OK - users: hashing, salt, verify, UNIQUE, normalisation
```

⭐ Known ceiling, matching Day 13's behaviour exactly: these write real rows to Neon and leave them. Every run adds a `selftest-<uuid>@example.com` user. If the table gets noisy, `DELETE FROM users WHERE email LIKE 'selftest-%'`.

---

## What S1 did *not* do

Nothing can log in yet. There is no route, no token, no session. All that exists is the ability to *store a user safely and check a password* — and that was the part worth getting right on its own, because it is the part you cannot fix later. A leaked table is leaked forever; a bad route is a redeploy.

---

## Flashcards

**Q.** Can a bcrypt hash be decrypted?
**A.** No hash can. There is no reverse function and no key. An attacker guesses forward and watches for a collision.

**Q.** Then why does a *slow* hash help, if reversal was already impossible?
**A.** It raises the price per guess. Brute force stops paying, not stops working.

**Q.** Why is SHA-256 the wrong choice?
**A.** It is fast by design. Billions of guesses per second on a GPU.

**Q.** Where is the salt stored?
**A.** Inside the hash string — `$2b$12$<salt><hash>` is algorithm, cost, salt and hash in one field.

**Q.** What does a salt prevent?
**A.** Identical passwords producing identical hashes, and pre-computed rainbow tables.

**Q.** Why `checkpw` instead of `==`?
**A.** A fresh salt means the hashes would never match, and `==` on secrets leaks timing.

**Q.** Why `UNIQUE` on email instead of a Python check?
**A.** The Python check has a gap between `SELECT` and `INSERT`; two simultaneous registrations both pass it. The constraint has no gap.

**Q.** Why `id SERIAL` rather than email as the primary key?
**A.** Emails change. `user_id` will be referenced from every message row, and a key should never need rewriting.

**Q.** Why `.strip().lower()` on *both* insert and lookup?
**A.** Insert-only makes `UNIQUE` meaningful; lookup-only lets people log in as they typed. You need both or the guard only half works.

**Q.** Why is the `try` outside the `with` and not inside?
**A.** `with` only rolls back when the exception leaves the block. Catching inside means committing a poisoned transaction.

---

## Self-test

1. An attacker steals the whole `users` table. Walk through exactly what he can and cannot do with it.
2. You swap `bcrypt.gensalt()` for a single hard-coded salt string. Which assert in chunk 4 fails, and what real-world attack just became possible?
3. `create_user` is changed to store `password` directly. Which two asserts fail? Which one would still pass, and why is that the dangerous one?
4. Someone moves the `except psycopg2.errors.UniqueViolation` to inside the `with` block. The duplicate-email test still returns `None`. What is now wrong anyway?
5. In S2, why must the login route give the same answer for "email not found" and "wrong password", when `create_user` is allowed to admit "email taken"?
6. A user picks a 90-character password. Trace what happens today, and name the exact file and line where the fix belongs.

---

**Files touched:** `requirements.txt` · `backend/database.py`.
**Asserts:** 39 → **49** (database 4 → 14).
**Previous:** `tutorial/27-file-upload-ui.md` · **Next:** S2 — `routes/auth.py`, register, login, and the JWT.

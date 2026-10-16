# 29 — Login routes and JWT: the ticket the server does not remember issuing

Day 28 taught the app to *store* a user safely. Nothing could log in. This session answers the next question:

> **once the password checks out, how does the server remember you on the next request?**

HTTP has no memory. Every request arrives as a stranger. `POST /chat` has no idea that two seconds ago you proved who you were.

---

## Where we were

`feature/auth-logins`, session 2 of 4.

| | What | Files |
|---|---|---|
| S1 (Day 28) | `users` table + password hashing | `requirements.txt` · `database.py` |
| **S2 — this one** | `POST /register` · `POST /login` · JWT mint + verify | `routes/auth.py` · `main.py` |
| S3 | `user_id` on `messages`, protect `/chat` + `/history` | `database.py` · `routes/chat.py` |
| S4 | login screen, token in `localStorage`, `Authorization` header | `pages/Login.jsx` · `App.jsx` · `pages/Chat.jsx` |

S1 deliberately left three debts. All three are paid in this file: the 72-byte password cap, the no-email-leak login, and `JWT_SECRET`.

---

## The concept: what a JWT actually is

> **Analogy.** You buy a multiplex ticket in Pune. The counter stamps it and hands it back. At screen 4, the usher does **not** phone the counter to ask "did this person pay?" — the usher just looks at the stamp. The stamp is hard to forge, so **the stamp is the proof.**

A JWT is that stamped ticket. The server stamps it at login, hands it to the browser, and forgets it ever existed. On every later request the browser sends it back, and the server checks the stamp instead of checking a database.

### Why it exists — the thing it replaces

The obvious alternative is a `sessions` table: login writes a random row, every request runs a `SELECT` to see whether that row still exists.

| | sessions table | JWT |
|---|---|---|
| cost per request | one DB round trip | zero queries |
| server remembers you | yes | **no** |
| can you log someone out? | `DELETE` the row | **no — only expiry** |

That middle row is the whole trade. We already know `get_conn()` opens a fresh TCP+TLS connection on every call (debt #11), so "one DB round trip per request" is not cheap here. We take the trade and accept the bottom row.

### Under the hood: three base64 chunks

```
eyJhbGciOiJIUzI1NiJ9 . eyJzdWIiOiI3IiwiZXhwIjoxNzkxfQ . 4Af9kQ...
└── header ──────────┘  └── payload (claims) ───────┘  └ signature ┘
```

Two things people get wrong, and both are interview bait.

**1. The payload is encoded, not encrypted.** Anyone can paste a JWT into jwt.io and read `{"sub": "7"}`. Base64 is not a secret — it is a transport format, like writing on the outside of an envelope.

> **So no password, no PAN, no salary ever goes inside a token.** Only the user id and the expiry.

**2. Only the signature is secret.** The signature is `HMAC(header.payload, JWT_SECRET)`. An attacker can *edit* the payload to `{"sub": "1"}` as freely as they like — they just cannot recompute the matching signature without the secret, so `jwt.decode()` throws it out.

That is the exact shape of Day 28's bcrypt lesson, seen again:

> **The defence is never "you cannot read the input." It is "you cannot produce the matching output."**

Direct consequence: **a leaked `JWT_SECRET` is every account at once**, because the secret is the only thing standing between an attacker and `sub: 1`. Which is why it lives in `.env` beside `GROQ_API_KEY` and never in code.

### Why `exp` is not optional

There is no table to delete a row from, so a token cannot be un-issued. A stolen token stays valid until it expires on its own. **The expiry is the only logout the server has.** 24 hours here; shorter is safer and more annoying.

---

## Chunk 0 — the secret

```
python -c "import secrets; print(secrets.token_hex(32))"
```

Into `.env` as the value, and into `.env.example` as the *recipe* — the committed file carries the shape, never the value.

> **`secrets`, not `random`.** ⭐ `random` is a Mersenne Twister: observe enough output and the rest is predictable. `secrets` pulls from the OS entropy pool. Wrong module on a secret path is a real CVE class, not a style nit.

And 32 bytes is not arbitrary. PyJWT *warns* below it — a short HMAC secret can be brute-forced **offline**, because the attacker already holds a signed token and can guess locally, forever, with no rate limit to stop them.

---

## Chunk 1 — the trust boundary

```python
class AuthRequest(BaseModel):
    """Both /register and /login take the same two fields, so one model serves both."""
    email: str = Field(min_length=3, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=8, max_length=72)   # 72 = bcrypt's hard ceiling
```

### `max_length=72` — S1's deferred bug, paid

bcrypt does not truncate a long password; modern `bcrypt` **raises**. Without the cap, a user with a 100-character passphrase gets a **500 Internal Server Error** — our crash, for their perfectly valid input.

> ⭐ **Validate at the trust boundary, not at the failure site.** In the Pydantic model it becomes a clean `422` naming the field, which is exactly where `doc_text`'s 200k cap already lives. Catching bcrypt's error deeper down would also "work" — but then every future caller of `hash_password` has to remember the same guard. **One guard at the door, not one per corridor.**

And it is **72 bytes, not 72 characters**. A `str` constraint counts characters, and one Devanagari character is 3 bytes in UTF-8, so 72 characters of Hindi is ~200 bytes and still raises. The `Field` is the cheap 95% guard, not a proof.

### `min_length=8` and nothing else

No "one capital, one digit, one symbol". Those rules produce `Password1!` — predictable — and length beats character classes. Length-only is the current NIST position.

### The email argument — he pushed back, and he was right

The first draft had no pattern at all, on the grounds that regex cannot prove an address exists. He objected: validating email is standard practice whether or not you send mail. Splitting that properly:

| | Can a format check do it? |
|---|---|
| prove the address exists | **No.** `prince@gmai.com` passes every regex and bounces. Only a confirmation email proves this. |
| catch a typo at the door | **Yes.** `prince.gmail.com`, a trailing comma, a half-pasted address. |

The second row is the real value, and it is bigger than it looks here: **we never send mail, so nobody would ever find out.** The user registers successfully with an address that can never receive a password reset. ⭐ Day 27's family again — a wrong *string* that throws nothing.

So: add the check, don't add the dependency.

```
^[^@\s]+@[^@\s]+\.[^@\s]+$
```

Read it as fences: *something*, `@`, *something*, `.`, *something* — and no whitespace or second `@` anywhere.

> **Why not `EmailStr`?** It needs the `email-validator` package. What it buys over that one line is RFC pedantry — quoted local parts, bracketed comments, IP-literal domains — forms nobody types and that do not change the bounce outcome. ⭐ **A new dependency has to beat the one-liner at something you will actually notice.** Auth stays at 2 deps: `bcrypt`, `PyJWT`.

The cost is a worse `422` message ("string does not match regex"). A `field_validator` with custom text replaces it later, same place, still no dep.

### `raise RuntimeError` at import time

```python
JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET missing - add it to .env ...")
```

Same shape as `DATABASE_URL` in `database.py`. A missing secret kills the server **at boot**, loudly. The alternative is a server that starts fine and fails on the first login attempt.

> ⭐ **Fail at startup, not at first use.** A config bug should be impossible to deploy, not merely likely to be noticed.

### The import-order landmine

The first version called `os.getenv` but never `load_dotenv()`. It worked — purely because the line above imported `backend.database`, whose module body runs `load_dotenv()` first. **The secret was loading as a side effect of an unrelated import.** Reorder those two lines, or drop the `database` import later, and `JWT_SECRET` is suddenly `None`.

> ⭐ **Never depend on another module's import side effects.** One explicit `load_dotenv()` makes `auth.py` stand alone. It is idempotent, so calling it twice costs nothing.

---

## 🐛 The bug of the day: a typo the library *accepted*

Typed `min_lenght=3`. The file imported with zero output. Then:

```
annotation=str  json_schema_extra={'min_lenght': 3}  metadata=[MaxLen(max_length=254)]
```

**Pydantic v2 swallows unknown `Field` keywords into `json_schema_extra`.** The typo did not become a constraint — it became schema metadata nobody reads. Look at `metadata`: `MaxLen` is present, there is no `MinLen`. The constraint is simply **absent**.

There *is* a `PydanticDeprecatedSince20` warning naming `'min_lenght'` exactly. He never saw it, because **Python hides `DeprecationWarning` by default outside `__main__`** — the module was imported, so the warning was filtered.

> That is why the import check printed nothing. Not "no problem found", but **"the one message that would have told you was suppressed."**

> ⭐ **A new bug family, worse than Day 27's.** `onclick` at least had a correct spelling that did *something*. Here the library **actively absorbs** the misspelling and stores it. A typo in a **constraint name silently removes the constraint.** Dict keys, JSX props, and now kwargs landing in a `**extra` bag.

⭐ Interview tip: this is the argument for `-W error::DeprecationWarning` in CI. The library *did* warn; the default filter ate it.

And the sting — in this file the bug had **zero symptoms**. The `pattern` already requires `a@b.c`, five characters minimum, so nothing 3 characters long could ever reach the length check. It bites the day the pattern relaxes.

> ⭐ **A dead guard is worse than no guard: it is a guard you will trust.**

---

## Chunk 2 — mint and verify

```python
def create_token(user_id, email):
    payload = {
        "sub": str(user_id),      # 'subject' = who this token is about. Spec says string, PyJWT enforces it
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_TTL_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Session expired. Please log in again.")
    except jwt.InvalidTokenError:          # bad signature, tampered payload, garbage string
        raise HTTPException(401, "Invalid token.")
    return int(payload["sub"])
```

### `algorithms=[...]` is the security of the whole file

It is plural, and PyJWT makes it mandatory, because of this: **the token's own header says which algorithm it uses.** If the library trusted that header —

- attacker sends `{"alg": "none"}` with an empty signature
- a naive verifier reads "no algorithm required", checks nothing
- attacker is logged in as `sub: 1`

> ⭐ **The algorithm-confusion attack: never let the attacker's data choose how you verify the attacker's data.**

The nastier variant is `RS256` → `HS256`. A server that verifies with a *public* key but accepts `HS256` can be fed a token the attacker signed using that public key as the HMAC secret — and it validates, because the public key is public. Naming your accepted algorithms closes both doors.

⭐ If an interviewer asks "what's wrong with JWT", this is the answer they are fishing for.

### The `except` order is load-bearing

`jwt.ExpiredSignatureError` **is a subclass of** `jwt.InvalidTokenError`. Flip those two clauses and the expiry branch becomes dead code — every expired session reports "Invalid token."

> ⭐ **Narrow `except` first, always.** Python takes the first clause that *matches*, not the best one.

Here the two messages differ on purpose: "expired" tells a legitimate user to log in again; "invalid" tells an attacker nothing.

### `datetime.now(timezone.utc)`, never `utcnow()`

`utcnow()` returns a **naive** datetime — correct UTC numbers, no tzinfo attached — so anything comparing it against an aware datetime either crashes or silently reads it as local time. On an IST machine that is a 5½-hour error in a token lifetime. Deprecated in 3.12 for exactly this reason.

### `str(user_id)` out, `int(payload["sub"])` back

PyJWT ≥ 2.10 rejects a non-string `sub` outright, so the cast out forces the cast back.

> ⭐ Your DB id is an int, your token carries a string: **convert at both doors.** Same discipline as `.strip().lower()` on email.

---

## 🐛 The test that passed for the wrong reason

First probe at the signature check mangled the last 3 characters of a token:

```
DecodeError: Invalid crypto padding
```

It raised a 401, so it *looked* like proof. Read the exception's own words: the base64 was unparseable, so it died **before any HMAC comparison happened**. It proved the `except` clause works. It did not test the signature at all.

> ⭐ **A passing test proves the path that ran, not the path you meant.** A negative test has to fail for the reason you claim.

Real forgery keeps the base64 valid — which is assert #2 below.

---

## Chunk 3 — the two counters

```python
@router.post("/register", response_model=TokenResponse)
def register_route(body: AuthRequest):
    email = body.email.strip().lower()
    user_id = create_user(email, body.password)
    if user_id is None:            # None = UNIQUE violation = that email is taken
        raise HTTPException(409, "That email is already registered.")
    return {"token": create_token(user_id, email), "user_id": user_id, "email": email}


@router.post("/login", response_model=TokenResponse)
def login_route(body: AuthRequest):
    email = body.email.strip().lower()
    user = get_user_by_email(email)          # (id, password_hash) or None

    # ponytail: deliberately identical message for both branches - no email-existence oracle.
    # Timing still differs (bcrypt only runs when the row exists); dummy-hash fix if it ever matters.
    if user is None or not verify_password(body.password, user[1]):
        raise HTTPException(401, "Invalid email or password.")

    return {"token": create_token(user[0], email), "user_id": user[0], "email": email}
```

`/register` logs you straight in — it returns a token, so the frontend needs no second call.

### Why register admits "already taken" but login refuses to

S1's debt (a). The asymmetry is a decision, not sloppiness.

| | Can we hide it? | Why |
|---|---|---|
| **register** | **No** | Either the account is created or it is not, and a real person who forgot they signed up needs to be told which. "Something went wrong" is a dead end. |
| **login** | **Yes, and we must** | The probe is free and repeatable, and the prize is bigger: a list of confirmed accounts to point a password-spray at. |

So login returns the **same status and the same string** for "no such user" and "wrong password".

> ⭐ **Interview framing: that is an enumeration oracle.** Any response difference — status code, message text, **response time** — that distinguishes "exists" from "doesn't" is an oracle. The fix is not clever crypto; it is returning the identical thing.

### The hole left open on purpose

`or` short-circuits. When `user is None`, Python never evaluates the right side, so **bcrypt never runs** and the response returns in ~2 ms. A real user's wrong password runs bcrypt — deliberately slow — at ~250 ms.

**The timing leaks what the message does not.** The fix is to always run bcrypt, against a throwaway hash when the row is missing. Skipped: a ~100× harder attack than reading a message, and nobody is timing a tax app. The `ponytail:` comment names the ceiling so it stays a decision rather than an oversight.

### `user[1]`, `user[0]`

Bare tuple indexing, because `get_user_by_email` returns a raw `fetchone()`. ⭐ Positional indexing breaks **silently** if someone reorders the `SELECT`. `psycopg2.extras.RealDictCursor` makes it `user["id"]` — not worth changing one call site today, worth knowing it is the fix when a third caller appears.

---

## Chunk 4 — the check

Seven asserts, **49 → 56**. All pure functions: **no database, no HTTP, runs offline.**

```python
    # 1. round trip - the only happy path
    assert decode_token(create_token(7, "a@b.com")) == 7

    # 2. forged: valid base64, valid structure, signed with the WRONG secret. The real signature test.
    forged = jwt.encode({"sub": "1", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
                        "not-the-real-secret-but-long-enough-to-be-quiet", algorithm=JWT_ALGORITHM)
    raises_401(forged, "Invalid")

    # 3. expired: OUR secret, genuine signature, exp in the past. Must say 'expired', not 'invalid'
    stale = jwt.encode({"sub": "7", "exp": datetime.now(timezone.utc) - timedelta(seconds=1)},
                       JWT_SECRET, algorithm=JWT_ALGORITHM)
    raises_401(stale, "expired")

    # 4. the payload is PUBLIC - no secret needed to read it. This is why no password goes in a token
    peek = jwt.decode(create_token(7, "a@b.com"), options={"verify_signature": False})
    assert peek["email"] == "a@b.com", peek

    # 5. the trust boundary
    rejects(email="prince.gmail.com")      # no @ - the typo the regex catches
    rejects(password="short")              # under 8
    rejects(password="x" * 73)             # over bcrypt's 72-byte ceiling
```

Three of them earn their keep for non-obvious reasons:

- **#2** is signed with a *different secret*, so the base64 parses, the structure is perfect, the `exp` is in the future — the only thing wrong is the HMAC. This is the test the mangled-string probe failed to be.
- **#3** pins the `except` order. Swap the two clauses and this line fails. The dead-code bug, made visible.
- **#4** decodes a token **with no secret at all** and reads the email out. It asserts that something *works* which you would normally call a weakness. ⭐ Same spirit as Day 28's `hash_password("x") != hash_password("x")`: it documents a property of the design. If someone later adds `"pan"` or `"salary"` to the payload, **this assert keeps passing while quietly becoming the proof of a leak.**

> **The warning that was the test working.** The first version of #2 used a 19-byte fake secret and PyJWT printed `InsecureKeyLengthWarning`. Not a bug — the length check doing its job on a deliberately fake key. Lengthened the string anyway: **a warning in a passing suite trains you to skim output.**

---

## 🐛 `ModuleNotFoundError: No module named 'backed'`

Server would not start. One `grep` over the repo for `backed`: **zero hits.** Which locates the typo in a single step — no file contains that string, so it came from outside the code. He had typed `uvicorn backed.main:app`.

> ⭐ **A `ModuleNotFoundError` quotes the name Python was *asked* for, never a file.** The error already names the wrong string; the only job is finding which door it came through.

---

## The smoke test the asserts could not do

The asserts never touched HTTP or Neon. Five checks in Swagger (`/docs`):

| Where | Body | Expect |
|---|---|---|
| `/register` | `prince@test.com` / `correct-horse` | **200** + token |
| `/register` | same again | **409** already registered |
| `/login` | same | **200** + a *different* token |
| `/login` | right email, wrong password | **401** Invalid email or password. |
| `/login` | unknown email, wrong password | **byte-identical to the row above** |

That last row is debt (a) paid, verified on the wire. All five passed.

> ⭐ The token in row 3 differs from row 1 although nothing changed, because `exp` moved. Same reason two bcrypt hashes of one password differ: **fresh output per call is normal for anything carrying a timestamp or a salt.**

---

## What S2 did *not* do

Nothing is protected yet. `/chat` and `/history` still take a client-supplied `session_id` and hand over anyone's chat (debt #10). `decode_token` exists and **nothing calls it** — that is S3's whole job, plus `user_id` on `messages`. There is still no login screen; that is S4.

---

## Flashcards

| Q | A |
|---|---|
| Three parts of a JWT? | header · payload (claims) · signature, base64, dot-joined |
| Is the payload secret? | **No.** Encoded, not encrypted — readable by anyone |
| So what is secret? | only `JWT_SECRET`, used to compute the signature |
| What does a leaked `JWT_SECRET` cost? | **every account** — the attacker can mint `sub: 1` |
| Why no `sessions` table? | zero DB queries per request; the cost is you cannot log anyone out |
| How do you log someone out then? | you don't — `exp` is the only expiry mechanism |
| Why is `algorithms=[...]` a list, and mandatory? | the token's own header names its algorithm; trusting it allows `alg: none` and `RS256→HS256` |
| Why `ExpiredSignatureError` before `InvalidTokenError`? | expired is a **subclass** of invalid — reversed, the expiry branch is dead code |
| `utcnow()` vs `now(timezone.utc)`? | `utcnow()` is **naive** — no tzinfo, silently read as local time (5½ h off in IST) |
| Why `str(user_id)` in the token? | the spec says `sub` is a string and PyJWT ≥ 2.10 enforces it → cast back with `int()` |
| Register leaks "email taken" — why is that OK? | unavoidable, and a real user needs to know. Login must not: free probe, bigger prize |
| What is an enumeration oracle? | any response difference — code, text, **timing** — that reveals whether an account exists |
| Where does a length cap belong? | the trust boundary (Pydantic `Field`), not the failure site |
| Why 72 and not 100? | bcrypt hard-fails above 72 **bytes**; uncapped = a 500 on valid input |
| `secrets` or `random` for a secret? | `secrets` — `random` is predictable from enough output |
| Pydantic + a misspelled `Field` kwarg? | **swallowed into `json_schema_extra`** — the constraint silently vanishes |
| Why didn't you see the deprecation warning? | `DeprecationWarning` is filtered by default outside `__main__` |

---

## Self-test

1. An attacker edits a token's payload from `sub: 7` to `sub: 1`. Why does it fail, and what exactly would they need to make it succeed?
2. You find a token in a log file. You have no secret. What can you read out of it, and what does that tell you to never put in one?
3. Someone swaps the two `except` clauses in `decode_token`. Nothing throws, every test but one still passes. Which test fails, and what does a user see?
4. `/login` returns the same message whether the email exists or not. Name the channel that still leaks the answer, and the fix.
5. Why does the 72-byte cap belong in `AuthRequest` instead of inside `hash_password`?
6. `min_lenght=3` imported cleanly and ran for an hour without a symptom. Explain both halves: why Python didn't object, and why the constraint's absence changed nothing *yet*.
7. `python -c "import backend.routes.auth"` printed nothing. Give two different reasons that could mean, and say how to tell them apart.
8. Day 28 said "a hash is never decrypted." State the same idea about a JWT signature in one sentence.

---

**Next: S3 — `user_id` on `messages`, and `decode_token` finally gets a caller.** That is the session where debt #10 dies and `GET /sessions` becomes safe to build.

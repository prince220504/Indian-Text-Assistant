# 31 — Login screen: the browser finally carries the pass

Day 30 put a TC at the gate: `/chat` and `/history` refuse any request without a valid token. Swagger could send one. The browser couldn't — so the real app answered every chat with 401.

This session answers:

> **where does the token live in a React app, and how does every request carry it?**

---

## Where we were

`feature/auth-logins`, session 4 of 4 — the last one.

| | What | Files |
|---|---|---|
| S1 (Day 28) | `users` table + password hashing | `database.py` |
| S2 (Day 29) | `/register` · `/login` · JWT mint + verify | `routes/auth.py` |
| S3 (Day 30) | `user_id` on `messages`, gate on `/chat` + `/history` | backend |
| **S4 — this one** | login screen, token in `localStorage`, `Authorization` header | `pages/Login.jsx` (new) · `App.jsx` · `pages/Chat.jsx` |

**0 new dependencies.** 0 backend changes.

---

## The concept: who holds the pass?

> **Analogy — housing society gate pass.** The guard at the gate (`App.jsx`) checks: pass in hand? No → send to the office (`<Login>`). Yes → let in. Inside, every flat door (`/chat`, `/history`) also wants to *see* the pass. So the pass must be held by someone both the guard and the flat can reach.

Who uses `token`?

| Component | Does what with it |
|---|---|
| `Login` | **creates** it (gets it from the server) |
| `App` | **decides** Login screen vs. the app |
| `Chat` | **sends** it in the header |

React rule: **state lives in the lowest component that every user sits under.** Common parent = `App`. So:

- `token` state lives in `App`
- goes **down** to `Chat` as a prop
- comes **up** from `Login` through a callback, `onLogin`

This is called **lifting state up**.

### Two places, one pass

| | Where | Survives refresh? | Re-renders the screen? |
|---|---|---|---|
| **pocket** | `localStorage` | ✅ | ❌ |
| **hand** | React `useState` | ❌ | ✅ |

You need both. `App` reads the pocket **once** on startup (lazy initializer — same trick as `sessionId` in `t18`), then writes both together on every change.

### Why only `App.jsx` touches `localStorage` (the question that took two tries)

Forget the analogy, count files. Tomorrow we rename the key `"token"` → `"authToken"`. How many files change?

- **Our way:** `App.jsx` only. **1 file.**
- If `Login.jsx` also did `setItem("token", ...)`: **2 files.** Forget one → login saves `"token"`, refresh reads `"authToken"`, finds nothing → kicked to login on every refresh. Silent.

> **Everything about the token lives in one place, so two copies can't disagree.** One copy can't go out of sync with itself.

> ⭐ **Interview tip — `localStorage` vs. httpOnly cookie.** Token in `localStorage` is readable by **any JavaScript on the page**. One XSS bug (an injected `<script>`) → attacker reads it, sends it home, is you for 24 h. The alternative is an **httpOnly cookie**: JS can't read it at all, but the browser attaches it automatically on every request — so another site can trigger requests as you (**CSRF**) and you need CSRF tokens. Trade: XSS risk vs. CSRF work. We chose `localStorage` (decided Day 30). `react-markdown` doesn't render raw HTML, which shrinks our XSS surface.

---

## Step 6 — `pages/Login.jsx`

### One function, two doors

```jsx
// one screen, two doors. /register and /login take the SAME body and
// return the SAME shape {token, user_id, email} -- so one function serves both.
function Login({ onLogin }) {
  ...
  async function submit(path) {        // path = "login" | "register"
    ...
      const res = await fetch(`http://localhost:8000/${path}`, { ... });
      const data = await res.json();
      if (!res.ok) {
        // 401/409 send detail as a string; 422 (Pydantic) sends a LIST of problems
        setError(typeof data.detail === "string"
          ? data.detail
          : "Enter a valid email and a password of 8-72 characters.");
        return;                          // finally still runs -- busy gets cleared
      }
      onLogin(data.token);               // hand the pass UP to App. App owns it.
```

Because Day 29 made both endpoints take `{email, password}` and return the same shape, the frontend needs **one** function with the URL as the only difference.

### Why the `typeof` check

What the server sends back on failure:

```json
// 409 / 401 — detail is TEXT
{ "detail": "Email already registered" }

// 422 — detail is a LIST of boxes
{ "detail": [ { "type": "string_pattern_mismatch", "loc": ["body","email"], "msg": "..." } ] }
```

React can print text. React **cannot** print a list of objects → it throws `Objects are not valid as a React child` → **white page.** One badly typed email would crash the whole app. The check: text → show it; not text → show our own sentence.

### The screen — two buttons, one form

```jsx
<form onSubmit={(e) => { e.preventDefault(); submit("login"); }}>
  <input type="email" ... onChange={(e) => setEmail(e.target.value)} />
  <input type="password" ... onChange={(e) => setPassword(e.target.value)} />
  {error && <p className="text-sm text-red-600">{error}</p>}
  <button disabled={busy}>Log in</button>
  {/* type="button" -- without it, this ALSO submits the form = Log in */}
  <button type="button" onClick={() => submit("register")} disabled={busy}>Register</button>
</form>
```

- **Enter key = Log in**, because Log in is the form's default submit button.
- **`type="button"` on Register** — a `<button>` inside a `<form>` defaults to `type="submit"`. Without it, clicking Register would run `submit("register")` **and** submit the form → `submit("login")`. Same trap as the ✕ on the attachment chip (`t27`).
- **`type="password"`** hides the characters. Native, zero code.

---

## Step 7 — `App.jsx`: the gate

```jsx
const [token, setToken] = useState(() => localStorage.getItem("token"));

function handleLogin(t) {
  localStorage.setItem("token", t);   // pocket: survives refresh
  setToken(t);                        // hand: triggers re-render -> gate opens
}

function handleLogout() {
  localStorage.removeItem("token");
  localStorage.removeItem("sessionId");   // next person on this browser starts a fresh chat
  setToken(null);
}

// the gate: no pass, no entry. Nothing below this line renders.
if (!token) return <Login onLogin={handleLogin} />;
```

Then a **Log out** button in the nav (`ml-auto` pushes it to the right edge) and `<Chat token={token} onLogout={handleLogout} />`.

Naming: `handleLogin`, not `login` — `login` vs. the component `Login` differ only by case, the Day 22 landmine family.

### Bugs of the day: two, both in one button

**1. `onclick` — again.** Day 27's exact bug, second time.

```jsx
<button onclick={handleLogout}>     // ❌ renders, hovers, does nothing
<button onClick={handleLogout}>     // ✅
```

React only knows `onClick`. An unknown lowercase prop gets passed to the DOM as a plain attribute and ignored. No error. No warning you'd notice.

> ⭐ **If it's silent, look at a string.** JSX prop names *are* strings to React — it can't tell `onclick` is a typo of `onClick`.

**2. Button inside the `NavLink`.** Fixing #1 by retyping the button moved it *inside* `<NavLink to="/calculator">…</NavLink>`.

- Anything inside a link **is** the link → clicking Log out would also navigate to `/calculator`.
- `ml-auto` only pushes a **direct child** of the flex `<nav>` → button stops sitting at the right edge.

Fix: the button is a **sibling** of the NavLinks, after `</NavLink>`, not inside it.

> ⭐ **A retyped line loses whatever was least load-bearing** — and sometimes *gains* a wrong position. Fixing a bug by retyping is how bug #2 gets in.

---

## Step 8 — `Chat.jsx`: show the pass at every door

The backend remembers nothing between requests (no session table, Day 29). So **every** call to `/chat` and `/history` carries the token:

```
Authorization: Bearer eyJhbGciOi...
```

`Bearer` = *whoever bears (holds) this is allowed*. Like a cinema ticket — no name check. That's exactly why a leaked token is dangerous.

```jsx
function Chat({ token, onLogout }) {
  ...
  const res = await fetch(`http://localhost:8000/history/${sessionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) return onLogout();      // expired/invalid pass -> back to the gate
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
```

Same two lines in the `/chat` fetch. `/upload` stays untouched — public, stores nothing (decided Day 30).

Traps:
- **Space after `Bearer`.** `Bearer${token}` → server sees garbage → 401 → instant logout loop. String = silent.
- **Backticks**, not quotes. `"Bearer ${token}"` sends the literal text `${token}`.

### Why handle 401 at all (his words, Day 31)

> Token expires after 24 hours but `localStorage` still has that token. Because of that mismatch the user gets 401, so we handle 401 — call `onLogout()` and the user makes a new token.

Without it: `App` thinks you're logged in (the pocket isn't empty), every request fails, you're stuck in a broken chat forever. **Expired pass = escorted out, not trapped inside.**

### Why the 401 check goes *before* `!res.ok`

`res.ok` means 200–299. A 401 is also `!res.ok`. If the general check ran first, it would `throw` → `catch` → an `Error: HTTP 401` bubble, and the 401 line would never be reached.

> ⭐ **Specific check before general check.** Same rule as Day 29's `except ExpiredSignatureError` before `except InvalidTokenError` (`t29`). Same pattern, second language.

---

## Step 9 — browser smoke test: 10/10

| # | Do | Got |
|---|---|---|
| 1 | load page | login screen ✅ |
| 2 | register with `short` password | red sentence, **no white page** (422) ✅ |
| 3 | register `a@test.com` / `password123` | chat opens ✅ |
| 4 | register same email again | "already registered" (409) ✅ |
| 5 | GST question | cited answer ✅ |
| 6 | **F5** | still logged in, history still there ✅ |
| 7 | Log out | login screen ✅ |
| 8 | wrong password | red error, same text as unknown email ✅ |
| 9 | register B | **empty chat — B sees none of A's** ✅ |
| 10 | log out → log in as A | fresh empty chat ✅ |

### "A's old chat is gone!" — no, it's unreachable

Log out removed `sessionId`. Logging back in, `Chat` mounts, finds no `sessionId`, mints a fresh uuid, asks `/history/<new-id>` → `[]`.

A's old rows are **still in Postgres**, tagged `user_id = A` and the old `session_id`. Nobody holds that old id anymore. Same one-way door as **New chat** (`t23`).

> The browser's pocket was the only place that remembered *which* chats A had. The fix is to make the **database** remember: `GET /sessions` filtered by `user_id`. That's the **Conversations sidebar** — the next feature, and exactly why it was ordered right after logins.

---

## Flashcards

| Q | A |
|---|---|
| Where does `token` state live, and why? | `App` — the lowest component above every user of it (Login, App's gate, Chat). |
| What is "lifting state up"? | State moves to the common parent; goes down as props, comes up through callbacks. |
| `localStorage` vs. `useState` for the token? | Pocket (survives refresh) vs. hand (re-renders). Need both, written together. |
| Why does only `App.jsx` touch `localStorage`? | One place → two copies can't disagree. |
| Why `typeof data.detail === "string"`? | 422's `detail` is a list of objects; rendering it = white page. |
| Why `type="button"` on Register? | A button in a form defaults to submit → would also run Log in. |
| `onclick` vs. `onClick`? | Only `onClick` works. `onclick` renders and silently does nothing. |
| What does `Bearer` mean? | Whoever holds it is allowed. No name check. |
| Why handle 401 in the frontend? | Expired token still sits in `localStorage` → stuck forever without it. |
| Why 401 check before `!res.ok`? | Specific before general — `!res.ok` also catches 401 and throws first. |
| `localStorage` token risk? | Any XSS reads it. httpOnly cookie avoids that, costs CSRF handling. |
| Why does A see an empty chat after logging back in? | `sessionId` was cleared; old rows exist but no key reaches them. Sidebar fixes it. |

## Self-test

1. You move `localStorage.setItem("token", ...)` into `Login.jsx` and delete it from `handleLogin`. Does anything break immediately? What breaks later?
2. Remove `type="button"` from Register. Click Register with a new email. Which endpoints get called, in what order?
3. Write `Authorization: \`Bearer${token}\`` (no space). Describe exactly what the user sees.
4. Swap the order: `!res.ok` check first, `401` check second. Let a token expire. What does the user see?
5. Why is `/upload` allowed to skip the `Authorization` header?
6. An interviewer asks "why not just store the JWT in a cookie?" Answer in two sentences.

**Next:** open PR #11 (all 4 sessions), then the **Conversations sidebar** — `GET /sessions` filtered by `user_id`.

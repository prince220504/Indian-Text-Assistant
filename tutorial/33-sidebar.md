# 33 — The sidebar: lifting `sessionId`, the `key` trick, and logout's checklist

Day 32 built `GET /sessions`. Today the browser uses it: a ChatGPT-style left sidebar with **+ New chat · Tax Calculator** on top, your chats in the middle (newest first), **Log out** alone at the bottom, and a ☰ toggle. Clicking an old chat opens it — the "re-login shows an empty chat" one-way door from Day 31 is closed.

This session answers:

> **when two components need the same piece of state, where does it live — and what changes when you move it?**

---

## Where we were

`feature/conversations-sidebar`, session 2.

| | What | Files |
|---|---|---|
| S1 (`t32`) | `GET /sessions` → `[{session_id, title, last_at}]` | backend |
| **S2 — this one** | sidebar replaces the top nav, click a chat = open it, ☰ toggle on desktop + phone | `App.jsx` · `pages/Chat.jsx` |
| S3 (maybe) | option B titles — 1 Groq call per chat | your call, after looking at A's titles |

**0 new dependencies. 0 backend changes. 0 new files.**

---

## Concept 1 — lifting state up (again)

`sessionId` used to live inside `Chat`. The sidebar lives in `App`, **outside** `<Routes>`, because it must stay on screen on every page. Clicking a chat in the sidebar must change `sessionId`; `Chat` must read it.

> 📺 **Analogy — the TV remote.** If it lives in one kid's room (`Chat`), nobody in the hall (`App` / sidebar) can change the channel. Put it in the living room — the common parent — and everyone can use it.

Same move as `token` on Day 31. `App` now owns it:

```jsx
// lifted from Chat: the sidebar (here) picks the chat, Chat (below) reads it
const [sessionId, setSessionId] = useState(() => {
  const saved = localStorage.getItem("sessionId");
  if (saved) return saved;
  const fresh = crypto.randomUUID();
  localStorage.setItem("sessionId", fresh);
  return fresh;
});

// ONE function for both: open an old chat, or open a brand-new id (= New chat)
function openChat(id) {
  localStorage.setItem("sessionId", id);   // refresh lands back on this chat
  setSessionId(id);
  navigate("/");                           // clicked from /calculator? the chat has to actually show
}
```

**New chat is just `openChat(crypto.randomUUID())`.** No separate function. Opening an old chat and starting a new one are the same action with a different id.

`navigate("/")` lives inside `openChat` so every caller gets it for free: if you're on `/calculator` and click a chat, setting `sessionId` alone would change nothing — `Chat` isn't on screen there.

---

## Concept 2 — the `key` trick

When `sessionId` changes, `Chat` must throw away its old messages, the attached Form 16, the half-typed input — and fetch the new history. Its mount effect has `[]` deps, so it never refetches. The old `newChat` reset things by hand (`setMessages([])`, `setDoc(null)`) and *still* missed the input box.

The lazy fix is one prop:

```jsx
<Route path="/" element={<Chat key={sessionId} token={token} sessionId={sessionId} onLogout={handleLogout} onSent={loadSessions} />} />
```

**When a component's `key` changes, React destroys it and builds a brand-new one.** Every `useState` goes back to its starting value; the mount effect runs again. You write zero reset code — and you can't forget a piece of state, because there's no list to forget from.

The mount-effect comment in `Chat.jsx` now says:

```jsx
// [] = run once PER MOUNT. App remounts us (key={sessionId}) on every chat switch.
```

> ⭐ **Interview tip:** "How do you reset a component's state when a prop changes?" → `key={thatProp}`. Not a `useEffect` that watches the prop and calls five setters.

Your smoke proved it: send a message, + New chat, and the input is blank, no attachment — without a single reset line.

---

## Concept 3 — lifting state up changes how long it lives

I asked: *A logs out, B logs in on the same browser. Which `sessionId` does B get?*

Your answer was "a different one, because the credentials are different." **Wrong — and the reason is the lesson.** `sessionId` has nothing to do with login. It's a random uuid. Trace it:

| Step | `localStorage` | `App` state `sessionId` |
|---|---|---|
| A chatting | `"abc-123"` | `"abc-123"` |
| A clicks Log out (old code: `removeItem("sessionId")`) | *removed* | **still `"abc-123"`** |
| `<Login>` shows — `App` is **still mounted**, it's the one drawing `<Login>` | — | `"abc-123"` |
| B logs in | — | **`"abc-123"`** ← A's id |

The old line cleaned the **pocket** (`localStorage`) but not the **hand** (state). The lazy initializer runs once, on first mount — and `App` never remounts.

When `sessionId` lived in `Chat`, logout **unmounted** `Chat`, so its state died for free. Inside `App`, it lives until the tab closes.

> 🧠 **Moving state up moves its lifetime up too.**

Not a data leak — the backend filters by the token's `user_id`, so B's `/history/abc-123` is `[]` (`t30`). But B's messages get saved under A's chat id — two people sharing one `session_id`. Silent mess.

Fix — logout does what New chat does, pocket **and** hand in one call:

```jsx
openChat(crypto.randomUUID());   // next person on this browser starts a fresh chat
```

### The logout checklist

Then the same question again for the new `sessions` list — and this time it *is* a privacy leak. Without `setSessions([])`, B's screen shows A's chat titles until B's fetch returns — and forever if B's fetch fails. Those titles are A's first questions ("my salary is 14L…").

```jsx
function handleLogout() {
  localStorage.removeItem("token");
  openChat(crypto.randomUUID());   // next person on this browser starts a fresh chat
  setSessions([]);                 // A's chat titles must not survive into B's screen
  setToken(null);
}
```

> 🧠 **Rule: anything in `App` state that belongs to a user gets reset in `handleLogout`.** Every time you add state to `App`, ask: "is this A's data?" So far: `token` · `sessionId` · `sessions`. The sidebar's `open` is **not** user data — it stays.

> ⭐ **Interview tip:** "The backend checks auth, so the frontend is safe" is wrong. Stale client state is its own leak. The classic case: a shared computer.

---

## Concept 4 — data down, events up

`App` owns the list. Only `Chat` knows **when** a message got saved — and a brand-new chat only appears in `/sessions` after its first message. So `Chat` must tell `App` "I sent one, refetch."

Third time you've used this shape (`onLogin`, `onLogout`, now `onSent`): **data goes down as props, events come up as callbacks.**

`App.jsx`:

```jsx
const [sessions, setSessions] = useState([]);   // [{session_id, title, last_at}], newest first

async function loadSessions() {
  try {
    const res = await fetch("http://localhost:8000/sessions", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) return handleLogout();   // same rule as Chat: dead pass -> gate
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setSessions(await res.json());
  } catch (err) {
    console.error("sessions load failed:", err);     // empty sidebar is survivable
  }
}

// [token], not []: App never remounts, so login has to be the trigger
useEffect(() => {
  if (token) loadSessions();
}, [token]);
```

`Chat.jsx`, in `handleSubmit`, right after the answer arrives:

```jsx
const data = await res.json();        // { answer, sources }
onSent();    // row is in Postgres now -> App refetches the sidebar
```

### Rules of hooks — why the effect sits above the gate

`useEffect` (and `useNavigate`, and `useState(open)`) must be **above** `if (!token) return <Login ... />`. React matches hooks by **call order**, not by name. A hook below an early return runs on some renders and not others, the order shifts, and React crashes with *"Rendered more hooks than during the previous render."*

> ⭐ **Interview tip:** "Why can't hooks go inside `if`s or after early returns?" → React identifies each hook by its position in the call sequence.

---

## Concept 5 — the layout

```jsx
<div className="h-screen flex bg-gray-100">
  {open && (
    <aside className="fixed inset-y-0 left-0 z-10 w-64 bg-white border-r flex flex-col gap-2 p-3 md:static">
      ☰ (close) · + New chat · Tax Calculator
      <nav className="flex-1 overflow-y-auto ...">  {/* the chat list */}  </nav>
      Log out
    </aside>
  )}
  <main className="flex-1 overflow-y-auto p-4">
    <div className="h-10">{!open && ☰ (open)}</div>
    <Routes>...</Routes>
  </main>
</div>
```

| Piece | Does |
|---|---|
| `flex flex-col` on the aside | stacks the buttons vertically |
| `flex-1` on the list | **the spring** — eats all spare height, pushes Log out to the bottom. No margin maths. |
| `{open && <aside>}` | closed = **not rendered at all**, not hidden. Same trick as `{historyLoading && ...}` |
| `fixed ... md:static` | phone: sidebar floats over the chat · desktop (`md:` = ≥768px): sits beside it |
| `useState(() => window.innerWidth >= 768)` | desktop starts open, phone starts closed |
| `truncate` on a chat row | long title → one line + `…` |
| `s.session_id === sessionId ? "bg-gray-200 font-medium" : ...` | highlights the chat you're in |
| `{s.title ?? "Untitled"}` | `title` can be `null` — that's why Day 32 typed it `str \| None` |

Each row is a `<button>` with `key={s.session_id}` and `onClick={() => openChat(s.session_id)}`. The old `Chat` NavLink is gone — the list *is* the way back to chat now.

### The layout-shift fix

You spotted it: open the sidebar and the chat box jumps **up**; close it and it drops **down**. Cause: the open-☰ button only rendered when closed, so it added ~40px above the chat, then took them away.

Fix: a row that's **always** there, 40px tall; only the ☰ inside it comes and goes.

```jsx
{/* h-10 row is ALWAYS here, so the chat never jumps when ☰ comes and goes */}
<div className="h-10">
  {!open && <button onClick={() => setOpen(true)} aria-label="Open sidebar" className="px-2 text-xl">☰</button>}
</div>
```

> ⭐ **Layout shift** — UI popping in or out moves everything below it. Reserve the space. Google scores it (CLS, a Core Web Vital), so it's an interview word.

The chat still slides **sideways** on toggle (centred in full width vs. leftover width). That's intended — ChatGPT and Claude do the same.

---

## Bugs this session

| # | Bug | Loud or silent | How found |
|---|---|---|---|
| 1 | `onSent={loadSessions}` added as a **second, bare `<Chat>`** directly inside `<Routes>` instead of onto the existing `<Route>` line | **loud** — Router: "not a `<Route>` component" | **my instruction** — "route line, add one prop" with no anchor shown |
| 2 | `onSent()` pasted into `handleUpload`, not `handleSubmit` — both have `const data = await res.json();` | **silent** — upload refetched pointlessly, sends never did | hint: "which function are you inside?" |
| 3 | `session.map` instead of `sessions.map` | **loud** — `ReferenceError` | hint: compare with line 37 |
| 4 | `<chat ... />` lowercase | **silent** — empty main area, at most a yellow warning | hint: compare with line 3 |
| 5 | chat box jumped up/down on ☰ toggle | **visible**, not an error | you spotted it — my layout |

### Bug 4 in detail — lowercase is a string in disguise

In JSX, **lowercase = HTML tag, Capitalized = your component**. `<div>` compiles to the string `"div"`; `<Chat>` compiles to the variable `Chat`. So `<chat>` became a made-up HTML element called "chat" — no import needed, no error, nothing inside it.

> ⭐ **Interview tip:** "Why must React components start with a capital letter?" → that's how JSX tells your components from built-in tags.

> ⭐ **If it's silent, look at a string** — and a lowercase tag *is* a string.

### Bugs 1 and 2 — the anchor rule

"Add it under X" where X appears **twice** in the file, or where X is a description ("the route line") instead of the real text, is the same trap as Day 30. Bug 1 was my fault: you said so, and you were right.

> ⭐ **Before pasting under an anchor, Ctrl+F it. Two hits = ask which.** And on my side: always show the anchor line itself.

### Not bugs — noise from outside

- `visualizer.js` / `content.js` "Content Security Policy … unsafe-eval" in the console → **browser extensions** (`chrome-extension://…`). 0 hits in the repo. ⭐ Same rule as Day 29: an error naming a file you can't find came from outside the code. Filter the console or use Incognito.
- Backend `psycopg2.OperationalError: … SSL error: unexpected eof while reading` → Neon hung up mid-handshake (usually waking from auto-suspend). One-off, not today's code. Every `get_conn()` is a fresh TCP + TLS connection, and the sidebar added DB calls (each send = `/chat` + `/sessions`), so more chances to hit a bad one. Real fix: a **connection pool**, parked for Week 6.
- Many `sessions` lines in the console → `console.log` runs on every render of `App`, and dev **StrictMode renders twice** on purpose.

---

## Browser smoke

| # | Do | Expect | Got |
|---|---|---|---|
| 1 | load | sidebar: ☰ · New chat · Calculator · list · Log out at the bottom | ✅ |
| 2 | click an old chat | its messages load, row highlighted | ✅ |
| 3 | Calculator → click a chat | back on the chat | ✅ |
| 4 | ☰ / ☰ | closes / opens, chat doesn't jump vertically | ✅ |
| 5 | phone view (Ctrl+Shift+M), reload | starts closed; opens floating over the chat | ✅ |
| 6 | log out → log in as another user | only their list | ✅ |
| + | send in a new chat | list grows by 1, new chat on top | ✅ |

---

## Flashcards

- **Two components need the same state?** → lift it to their closest common parent.
- **Moved state up — what else changed?** → its lifetime. It now outlives whatever the child used to outlive.
- **Reset all of a component's state when X changes?** → `key={X}`.
- **Child needs to tell parent something happened?** → parent passes a callback prop (`onSent`), child calls it.
- **New state in `App`?** → "is this a user's data?" → yes = a line in `handleLogout`.
- **Hooks below an early return?** → never. React tracks hooks by call order.
- **`<chat>` vs `<Chat>`?** → HTML tag string vs your component.
- **Push the last item to the bottom of a column?** → `flex-1` on the item before it.
- **Something pops in and moves the page?** → reserve its space (layout shift / CLS).
- **Console error from a file not in the repo?** → extension or tooling, not your code.

## Self-test

1. Delete `key={sessionId}`. You click an old chat. What does the screen show, and why?
2. Delete `setSessions([])` from `handleLogout`. Describe exactly what user B sees, and when it goes away (or doesn't).
3. Move the `useEffect` for sessions below `if (!token) return <Login .../>`. What happens on the first render after login?
4. Why does `navigate("/")` live inside `openChat` instead of on each button?
5. Change `[token]` to `[]` on the sessions effect. Log out, log in as someone else. What's in the sidebar?
6. Why is `open` *not* reset in `handleLogout`?

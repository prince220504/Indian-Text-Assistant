# Tutorial 18 — Surviving a Refresh: `GET /history`, `localStorage`, `useEffect` — Week 4 D3a

> **What you'll be able to recall after re-reading this:** why the messages were never lost even though the screen was empty; the difference between a path parameter and a query parameter, and who decides which is which; what `localStorage` can and cannot hold; why the `useEffect` dependency array is the whole exam; why an effect callback can never be `async`; and why "flash of empty state" is not a bug you can delete, only a bug you can stop lying about.
>
> **How to use this doc:** read top-to-bottom once. After that jump to any boxed **Analogy**, the **Two stores** table, the **60-second recall**, or the **Interview flashcards**.

---

## Where this fits

```
WEEK 1   PDFs → chunks → embeddings → ChromaDB          ✅ Tutorials 01-06
WEEK 2   retriever → generator → memory                 ✅ Tutorials 07-09
WEEK 2.5 the pipeline as a graph: route/grade/rewrite   ✅ Tutorials 10-12
WEEK 3   the graph, reachable over HTTP, with sessions  ✅ Tutorials 13-15
WEEK 4   D1 the toolchain: Vite + React + Tailwind      ✅ Tutorial 16
         D2 the chat UI, calling POST /chat             ✅ Tutorial 17
         D3a the chat survives a refresh                ▲ you are here
         D3b components, markdown, auto-scroll          → Tutorial 19
```

Yesterday the app worked. Today it **remembers** — and the interesting part is that the memory was already there the whole time.

---

## Concept 1 — The bug that wasn't a data-loss bug

Day 16 ended with a working chat. Then you pressed F5 and everything vanished.

The instinct is "the messages are gone." They are not. Open Neon, `SELECT * FROM messages` — every single one is sitting there, exactly as Day 13 wrote it. Nothing was lost.

So what actually broke? Two separate things, and separating them is the whole lesson:

```
Postgres  →  has every message of every session, forever
Browser   →  after refresh, has no idea WHICH session was his
             and no way to ASK for it even if it did
```

Two truths that stopped pointing at each other. Line 15 of `App.jsx` was:

```jsx
const [sessionId] = useState(() => crypto.randomUUID());
```

Every refresh mints a **brand-new UUID**. So the browser walks up to the server and asks about a conversation that was born four milliseconds ago. Of course it's empty. The old conversation is still in the database, perfectly intact, addressed by an id nobody remembers.

> **🧠 Analogy — the bank passbook.** The bank (Postgres) has your full ledger, going back years. You walk in without your account number — the clerk cannot find you. The ledger is not lost; it's **unreachable**. `localStorage` is writing the account number on a card you keep in your wallet, so it survives you going home and coming back. `GET /history/{id}` is the counter window where you show the card and the clerk reads the ledger back to you. Day 16 built the deposit window (`POST /chat`). Today you build the withdrawal window.

⭐ **Interview tip:** "the server is stateless, the client carries the key." This is the REST idea in one line. The server keeps no memory of *who is talking to it* — every request carries its own identity. In this project that identity is `session_id`; in a real app it's a JWT or a session cookie. Same shape. That is why `POST /chat` has demanded `session_id` in its body since Day 13.

**Diagnosis, in order:**

| Symptom | Cause | Fix |
|---|---|---|
| chat looks empty after refresh | browser forgot the id | `localStorage` |
| even with the id, nothing to load | no endpoint served history | `GET /history/{session_id}` |

Two fixes, in that order — the endpoint first, because you can test it without touching React at all.

---

## Concept 2 — Path parameters vs query parameters

Day 16's endpoint took its data in the **body**:

```
POST /chat     body: {"question": "...", "session_id": "..."}
```

Today's takes it in the **URL**:

```
GET /history/abc-123?limit=20
```

Why the difference? The rule of thumb is about *what the request means*:

- **GET** = "give me a thing." It's a read. It has no body — some browsers, proxies and caches will silently drop one, so nobody relies on it. The identity of the thing you want goes **in the URL**.
- **POST** = "here is some data, do something with it." The data goes in the body.

Now, inside the URL, there are two slots:

| | looks like | means | FastAPI decides by |
|---|---|---|---|
| **path param** | `/history/{session_id}` | *which* resource | the name appears in the route string |
| **query param** | `?limit=20` | how to *filter/shape* it | the name does **not** appear in the route string |

That's the actual rule, and it surprises people: you don't declare "this is a query parameter" anywhere. FastAPI looks at your function's arguments, checks which names appear inside `{...}` in the path, and everything left over becomes a query parameter automatically.

```python
@router.get("/history/{session_id}")
def history_route(session_id: str, limit: int = 20):
#                 └── in the path → path param
#                                   └── not in the path → query param, default 20
```

Rename one and not the other and FastAPI raises at **startup**, not at request time. Good failure — loud and early.

> **🧠 Analogy — the library counter.** The path says *which shelf and which book*. The query string says *how you want it handed over* — first 20 pages, large print, in reverse. Change the query and you get the same book differently. Change the path and you get a different book.

---

## Concept 3 — The endpoint

```python
from ..database import get_history          # already existed since Day 13. Nothing new to write.

class Message(BaseModel):
    role: str        # "user" or "assistant"
    content: str

@router.get("/history/{session_id}", response_model=list[Message])
def history_route(session_id: str, limit: int = 20):
    """Withdrawal window: hand over an id, get that session's messages back, oldest first."""
    rows = get_history(session_id, limit)
    return [{"role": role, "content": content} for role, content in rows]
```

Eight lines, and **not one of them queries the database**. `get_history()` was written on Day 13 and has been sitting unused by HTTP for four days. That is what a well-cut function buys you: the new feature is a *route*, not a *feature*.

Three details:

**1. The comprehension is a translation, not decoration.** `get_history()` returns a list of tuples — `[("user", "..."), ("assistant", "...")]`. `response_model=list[Message]` wants things with a `role` and a `content`. Tuples have neither. The comprehension unpacks each row and names the pieces. Get it wrong and **Pydantic shouts** — you get a 500 with a validation error naming the exact field. ⭐ That's the trust-boundary lesson again (Day 14's `Source.answer`, Day 16's `{s.sources}`): the *typed* side of the boundary fails loudly, the *untyped* side fails silently.

**2. `oldest first` in the docstring is a promise the database already keeps.** Look back at Day 13:

```python
ORDER BY created_at DESC
LIMIT %s
...
return cur.fetchall()[::-1]
```

You want the **last** 10 messages, in **reading** order. Sorting ascending and taking 10 gives you the *first* 10 — the wrong end of the conversation. So: sort newest-first, take 10, then flip. ⭐ **Interview tip:** "DESC + LIMIT + reverse in the application" is the standard recipe for "the most recent N, in chronological order." It comes up constantly — chat, logs, notifications, feeds.

**3. There are no sources in a history row.** The `messages` table has four columns: `session_id`, `role`, `content`, `created_at`. Citations were never stored — Day 14's `sources` list is built at query time from chunk metadata and thrown away after the response. So a reloaded conversation comes back **citation-less**. That's a real limitation, deliberately accepted: storing them means a schema migration and a JSONB column, and today is not that day.

---

## Concept 4 — `localStorage`

The browser gives every origin a small key-value store that survives refresh, tab close, and reboot. The entire API worth knowing:

```js
localStorage.setItem("key", "value")
localStorage.getItem("key")        // → string, or null if never set
localStorage.removeItem("key")
```

Three facts that get asked in interviews:

- **Strings only.** Store an object and you must `JSON.stringify` going in and `JSON.parse` coming out. `setItem("x", {a:1})` silently stores the string `"[object Object]"` — a *silent* failure, exactly the family Day 16 warned about.
- **Synchronous.** No `await`. The read blocks the main thread. Fine for a 36-character UUID; a genuinely bad idea for megabytes.
- **Per-origin.** Origin = scheme + host + port. `localhost:5173` and your future Vercel domain have **separate stores**. ⭐ Same definition of "origin" that drives CORS (Day 16) — worth learning once, it pays twice.

### What we store — and what we deliberately don't

We save **the session id only**. Not the messages.

That's the important design call. It would be easy to dump the whole `messages` array into `localStorage` and reload instantly with no network call at all. Don't. You'd then have the conversation in **two** places — Postgres and the browser — and the moment they disagree (another tab, another device, a failed write) you have no way to say which one is right. Keep one source of truth. `localStorage` holds the *key*, Postgres holds the *data*.

> **🧠 Analogy — cloakroom token.** The token in your pocket is small and means nothing on its own. The coat is in the cloakroom. Nobody photocopies the coat into their pocket.

### The read-or-create pattern

```jsx
const [sessionId] = useState(() => {
  const saved = localStorage.getItem("sessionId");
  if (saved) return saved;                       // returning customer
  const fresh = crypto.randomUUID();             // first visit
  localStorage.setItem("sessionId", fresh);
  return fresh;
});
```

Day 16 taught the lazy initializer (`useState(() => ...)`) as a *tidiness* thing: the eager form works, it just re-runs a throwaway computation every render. **Today it stops being tidiness.** This function performs a **write**. In the eager form, that write would fire on every single render. Here it happens to be idempotent, so you'd never notice — which is exactly how people ship a `fetch` or an analytics event that fires forty times and can't work out why.

⭐ **Interview tip:** the lazy initializer isn't an optimisation, it's a *correctness* tool the moment the initializer has a side effect.

**Verify it without any React knowledge at all:** DevTools → Application → Local Storage → `http://localhost:5173`. The `sessionId` key is there, and it does not change when you refresh.

---

## Concept 5 — `useEffect`

`App()` is called on every render. Its job is one thing: **take state, return JSX**. Nothing else. Fetching, timers, subscriptions, writing to the DOM directly — none of those are "returning JSX," and doing them in the function body is how you build an infinite loop:

```
fetch → setState → re-render → App() runs again → fetch → …
```

`useEffect` is the sanctioned escape hatch: *"after you're done rendering, also do this."*

```jsx
useEffect(() => { /* the side effect */ }, [dependency, list]);
```

### The dependency array is the whole exam

| You write | The effect runs |
|---|---|
| *(no array at all)* | after **every** render ← the infinite-loop factory |
| `[]` | **once**, after the first render |
| `[sessionId]` | first render, plus any render where `sessionId` changed |

"Load the history once when the app opens" → `[]`.

> **🧠 Analogy — the waiter.** The render is the waiter carrying the plate to the table. `useEffect` is what he does *after the plate lands* — go back and tell the kitchen something. Try to do it while walking and you drop the plate.

### Why the callback cannot be `async`

```jsx
useEffect(async () => { ... }, []);   // ❌ never do this
```

`useEffect` reads the **return value** of your callback and treats it as a *cleanup function* — the thing React calls when the component unmounts. An `async` function always returns a Promise. React would try to call a Promise as if it were a function.

So you declare an inner async function and call it:

```jsx
useEffect(() => {
  async function loadHistory() { ... }
  loadHistory();
}, []);
```

⭐ **Interview tip:** this shape looks like a style quirk and isn't — it's forced by the cleanup contract. Being able to say *why* is the difference between having copied the pattern and having understood it.

### The effect itself

```jsx
useEffect(() => {
  async function loadHistory() {
    try {
      const res = await fetch(`http://localhost:8000/history/${sessionId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json();   // [{role, content}, ...]  -- content, not text
      setMessages(rows.map((r) => ({ role: r.role, text: r.content })));
    } catch (err) {
      console.error("history load failed:", err);   // an empty chat is survivable
    } finally {
      setHistoryLoading(false);
    }
  }
  loadHistory();
}, []);
```

Everything Day 16 taught is reused verbatim: `if (!res.ok) throw` (fetch does **not** throw on 4xx/5xx), two `await`s, `try/catch/finally`.

Three new things worth stopping on:

**1. `content` → `text` is a real translation layer.** The backend field is `content`. Your message objects use `text`. Drop the `.map` and every restored bubble renders **blank** — no error, no red screen. That is Day 16's bug 7 (`{s.sources}` for `{s.source}`) wearing a different hat, and it's the same reason: JavaScript reading a property that doesn't exist gets `undefined`, and React renders `undefined` as nothing at all.

> Worth naming the underlying choice: the frontend and backend use different words for the same field. You could rename one to match. Keeping them separate is defensible — the API contract shouldn't be dictated by a React component's internals — but *the price is a mapping layer you must never forget*.

**2. No `sources` on restored messages.** History rows don't carry them, so `m.sources?.length > 0` evaluates `undefined > 0` → `false` → no pills rendered. The `?.` you wrote yesterday is the only reason this doesn't crash with *"cannot read properties of undefined."* Restored bubbles come back bare; new ones in the same session still get pills.

**3. `console.error`, not an error bubble.** Match the loudness to the damage. A failed history load means "you start with an empty chat" — annoying, recoverable, and the user can just carry on. A failed `POST /chat` means "the question you just typed vanished" — that one gets a visible bubble. ⭐ Different failures deserve different volume; treating them the same is how apps become either noisy or dishonest.

---

## Concept 6 — Flash of empty state

It works. Then you hard-refresh and watch the chat sit empty for a beat before the messages appear.

**That is not a bug in your code.** It's the shape of the pattern:

```
1. browser parses JS, React renders        ← messages = []  → EMPTY CHAT IS PAINTED HERE
2. useEffect fires (after paint, by design)
3. fetch → FastAPI → new psycopg2 connection → Neon → rows come back
4. setMessages(rows) → re-render           ← history finally appears
```

Steps 1 and 4 are separated by a full network round trip. The name for the gap is **flash of empty state** (cousin of "flash of unstyled content").

⭐ **Interview tip:** `useEffect` runs *after* paint, deliberately. React would rather put something on screen fast than block the browser on your fetch. So "fetch inside an effect" **always** means at least one render with no data. That single fact is why React Query, Suspense, and server-side rendering all exist — every one of them is an answer to this gap.

### Why yours is slower than it needs to be

Two known debts, both already logged, neither today's problem:

- **`get_conn()` opens a fresh TCP + TLS connection to Neon on every single call.** No pool. That handshake is most of the delay you can see.
- **Neon's free tier sleeps the compute when idle.** The first request after a pause pays a cold start on top.

The real fix is a connection pool (`psycopg2.pool`, or SQLAlchemy's) — Week 6, when deployment makes latency something a user actually feels.

### What you *can* do today

You cannot remove the wait. You can stop lying about it.

An empty chat says **"you have no history."** That's a false statement while a request is in flight. Three lines make it honest:

```jsx
const [historyLoading, setHistoryLoading] = useState(true);
// ... setHistoryLoading(false) in the effect's finally ...
{historyLoading && <p className="text-gray-400">Loading history...</p>}
```

Note the `finally` — same lesson as Day 16's `loading`. Put it in the `try` and one thrown error leaves the message on screen forever.

> **The general principle:** when you can't make it fast, make it **truthful**. A spinner doesn't reduce the wait by a millisecond; it changes it from "broken" to "working."

---

## What changed today

| File | Change |
|---|---|
| `backend/routes/chat.py` | `+ Message` model, `+ GET /history/{session_id}`, `+ get_history` import (~10 lines) |
| `frontend/src/App.jsx` | `sessionId` reads/writes `localStorage`; `useEffect` loads history on mount; `historyLoading` state + line |

Untouched: `database.py`, `graph.py`, `generator.py`, `chat.py`, `main.py`. And `retriever.py`, for the **twelfth** consecutive day.

**Asserts: still 14.** The frontend has no test framework, and the endpoint is eight lines of glue over `get_history()` — which already has three asserts covering write, read, order, and session isolation. ⭐ YAGNI applies to tests too: test the logic, not the wiring.

---

## 60-second recall

- Messages were never lost. The **browser forgot the key**, and there was **no window to ask through**.
- `GET` puts identity in the URL because GET has no body. **Path param** = which resource (name appears in the route string). **Query param** = how to shape it (name doesn't). FastAPI decides by matching names — you never declare it.
- `get_history()` already existed. The new feature was a **route**, not a feature.
- `DESC + LIMIT + reverse` = the last N in reading order. `ASC + LIMIT` gives the wrong end.
- `localStorage`: strings only, synchronous, per-origin. Store the **key**, not the data — two copies of the truth is a bug generator.
- Lazy initializer stops being tidiness and becomes **correctness** as soon as it has a side effect.
- `useEffect` dep array: none = every render, `[]` = once, `[x]` = when `x` changes.
- The effect callback can't be `async` because its return value is the **cleanup function**.
- `content` → `text` mapping is silent if you get it wrong. Restored messages have no `sources`; `?.` is why nothing crashes.
- Flash of empty state is structural, not a bug. When you can't make it fast, make it honest.

---

## Interview flashcards

**Q. Where should the chat history live — server or `localStorage`?**
Server. `localStorage` holds the session key only. Two copies of the same data have no tiebreaker when they disagree; and history in the browser is invisible to any other device.

**Q. What decides whether a FastAPI function argument is a path parameter or a query parameter?**
Whether its name appears inside `{}` in the route string. Everything not in the path becomes a query parameter automatically.

**Q. Why can't a `useEffect` callback be `async`?**
Because `useEffect` treats the callback's return value as the cleanup function, and an `async` function returns a Promise. Declare an inner async function and call it.

**Q. What does `useEffect(fn)` with no dependency array do?**
Runs after every render. Combined with a `setState` inside, that's an infinite loop.

**Q. Your list loads from an API and the page flashes empty first. Bug?**
No — effects run after paint by design, so there's always at least one render without data. Fix the *honesty* with a loading state; fix the *speed* with caching, a connection pool, or SSR.

**Q. Get the last 10 messages of a conversation in chronological order.**
`ORDER BY created_at DESC LIMIT 10`, then reverse in the application. Ascending + LIMIT returns the first 10, which is the wrong end.

**Q. Why do restored messages have no citation pills?**
The `messages` table stores `role` and `content` only. Sources are computed from chunk metadata at query time and never persisted. Fixing it means a schema change — a deliberate deferral.

---

## Self-test

1. You delete the `[]` from `useEffect(..., [])`. Predict exactly what happens and why. *(Both halves: what runs, and what makes it never stop.)*
2. Someone "optimises" your code by also saving `messages` to `localStorage` so reloads are instant. Name one concrete situation where the app is now wrong.
3. `history_route` is renamed to take `sid: str` while the route string stays `/history/{session_id}`. When does it break — startup, or the first request?
4. Delete the `.map` in the effect and pass `rows` to `setMessages` directly. What does the screen show, and what does the console show?
5. `setHistoryLoading(false)` is moved from `finally` into the `try`, just after `setMessages`. Describe the user-visible symptom, and say which Day 16 bug it rhymes with.
6. Why does `localStorage.setItem("user", {name: "Prince"})` not throw, and what do you get back from `getItem`?

---

**Next:** Tutorial 19 — Week 4 D3b: splitting `MessageBubble` and `SourceCard` out of `App.jsx` (props as the concept), rendering markdown so `**bold**` stops showing literal asterisks, and auto-scrolling to the newest message.

# Tutorial 17 — State, Fetch, and the First Full-Stack Round Trip — Week 4 D2

> **What you'll be able to recall after re-reading this:** why a plain variable can't drive a UI and `useState` can (two separate reasons, most people name only one); why `push` doesn't re-render; what a controlled input is and why the letter you type takes a round trip through React; why `fetch` doesn't throw on a 500; the stale-closure bug that eats a message and the one-line fix; and why every single bug you hit today was silent.
>
> **How to use this doc:** read top-to-bottom once. After that jump to any boxed **Analogy**, the **Bug museum**, the **60-second recall**, or the **Interview flashcards**.

---

## Where this fits

```
WEEK 1   PDFs → chunks → embeddings → ChromaDB          ✅ Tutorials 01-06
WEEK 2   retriever → generator → memory                 ✅ Tutorials 07-09
WEEK 2.5 the pipeline as a graph: route/grade/rewrite   ✅ Tutorials 10-12
WEEK 3   the graph, reachable over HTTP, with sessions  ✅ Tutorials 13-15
WEEK 4   D1 the toolchain: Vite + React + Tailwind      ✅ Tutorial 16
         D2 the chat UI, calling POST /chat             ▲ you are here
```

Sixteen days of pipeline. Today a human being typed a question into a box and the whole thing answered — retriever, grader, router, Groq, Postgres, all of it — with citations you can trust. **This is the day the project became an app.**

---

## Concept 1 — Why `useState` exists

Start with the thing that *doesn't* work, because the reason it fails is the entire mental model.

```jsx
function App() {
  let count = 0;
  return <button onClick={() => count++}>{count}</button>;
}
```

Click it. Nothing happens. Not "the wrong number appears" — **nothing at all**. Two independent reasons, and you need both:

**Reason 1 — nobody told React.** Your component is *just a function*. React calls it, it returns JSX, React puts that on screen, and then React forgets about it until something tells it otherwise. `count++` is plain JavaScript. No message is sent. No re-render is scheduled. React has no idea your variable exists, let alone that it changed.

**Reason 2 — even if it re-rendered, the value is gone.** A re-render means React calls `App()` again. Line 1 runs again. `let count = 0`. Reset to zero. A local variable is born and dies inside one function call; it cannot carry information from one render to the next.

`useState` fixes **both**:

```jsx
const [count, setCount] = useState(0);
```

- React **stores** the value in its own memory, attached to this component instance, *outside* your function. It survives re-renders. `useState(0)` only uses that `0` on the very first render; afterwards React hands back whatever is currently stored and ignores the argument.
- `setCount` is the **doorbell**. It writes the new value into React's memory *and* marks the component dirty so React calls your function again.

> **🧠 Analogy — the kirana shop whiteboard.** A local variable is the shopkeeper counting stock on his fingers: the number vanishes the second he puts his hand down, and nobody else in the shop learns anything. `useState` is the whiteboard on the wall — it stays there (survives), and rewriting it is a public act everyone sees (notifies). A customer asks "how much atta left?" and he doesn't recount the shelves; he reads the board.

| | plain variable | `useState` |
|---|---|---|
| survives a re-render | ❌ reset every call | ✅ React holds it |
| triggers a re-render | ❌ silent | ✅ setter notifies |

⭐ **Interview tip:** "Why not just use a variable?" The complete answer names **both** — persistence across renders *and* scheduling the re-render. Naming only one is the standard half-answer.

### The declarative idea underneath

This is what people mean by "React is declarative":

```
UI = f(state)
```

You describe *what the screen looks like for a given state*. You never write *steps to change the screen*. In vanilla JS you hold two things — your data, and the DOM — and you hand-sync them forever; they drift apart and that drift is the bug. React deletes one of the two. The DOM becomes a mirror. State is the only truth.

**Under the hood:** the setter marks the component dirty → React re-runs your function → gets fresh JSX → diffs it against the previous tree (the virtual DOM) → patches only the DOM nodes that actually differ.

### Why `push` is broken

```js
messages.push(newMsg);      // ✗ nothing happens
setMessages([...messages, newMsg]);   // ✓
```

React compares by **reference**. `push` mutates the array in place — same array, same reference — so React's check says "identical, nothing to do." You must hand it a **new** array. The spread `[...messages, newMsg]` copies the old items into a fresh array and appends.

⭐ **Interview tip:** this generalises. Never mutate state. New array, new object, always. `concat`, spread, `map`, `filter` return new things; `push`, `splice`, `sort`, direct assignment mutate.

---

## Concept 2 — Controlled inputs

An `<input>` in plain HTML holds its own text. The browser owns it. That's a **second whiteboard** — the exact thing React exists to abolish.

So React does something that feels backwards the first time:

```jsx
<input value={input} onChange={(e) => setInput(e.target.value)} />
```

Read it as a loop:

1. The box **displays** whatever `input` state says. Only that. Nothing else.
2. You press a key. The box does **not** update itself. It fires `onChange`.
3. Your handler writes the new text into state.
4. State changed → re-render → the box now displays the new text.

The letter you typed takes a **round trip through React** before you see it. That feels absurd and it is precisely the point: state is the only truth, the DOM is downstream.

> **🧠 Analogy.** The shopkeeper doesn't let a customer scribble on the whiteboard directly. The customer *tells* him, he writes it, and everyone reads the board. One writer, one truth.

⭐ **Interview tip — controlled vs uncontrolled:** controlled = the value lives in React state (this). Uncontrolled = the DOM keeps the value and you yank it out with a `ref` when you need it. Controlled is the default answer because validation, disabling, and programmatic clearing all become trivial.

⭐ **The half-controlled trap:** keep `onChange` but drop `value={input}` and it *looks* fine while being subtly broken — you can no longer clear the box from code. `setInput("")` runs, state is empty, the box still shows the old text because nothing binds it.

---

## Concept 3 — `fetch`, promises, and the two awaits

> **🧠 Analogy — the puncture shop token.** You leave your bike for a repair. The shop doesn't freeze the entire street until it's done — it hands you a **token** and says come back later. The token is not the bike. It's a *promise of* the bike.

`fetch(...)` returns immediately with a **Promise** — a receipt, not the data. `await` means "sit here until this token is redeemable."

**Why not just block?** JavaScript is **single-threaded**. Blocking freezes the whole tab: no typing, no scrolling, no animation, nothing. `await` releases the thread so the browser stays alive, and resumes your function when the reply lands.

⭐ **Interview tip:** `async` on a function means two things — it may use `await` inside, and it **always returns a Promise**, even if the body says `return 5`.

### Why two awaits

```js
const res  = await fetch(url, {...});   // status + headers have arrived
const data = await res.json();           // body finished downloading, and parsed
```

HTTP arrives in pieces. The first `await` resolves as soon as the **status line and headers** are in — the body may still be streaming down the wire. `.json()` waits for the rest and parses it. Two waits because two things finish at two different times.

### ⭐ The one that catches people: `fetch` does not throw on 500

```js
if (!res.ok) throw new Error(`HTTP ${res.status}`);
```

`fetch` rejects **only** on a *network* failure — DNS dead, server unreachable, connection dropped, CORS blocked. A `404` or a `500` is a **successfully delivered response** that happens to carry a bad status code. As far as `fetch` is concerned the delivery worked perfectly.

So you check `res.ok` (true for 200–299) yourself. Skip that line and a 500 flows into `res.json()`, which fails on the error page's HTML with a confusing parse error, and you go debugging the wrong thing.

> Compare: Python's `requests` behaves the same way — you call `.raise_for_status()`. Same design, same trap.

---

## Concept 4 — The stale closure

This is the subtle one, and it is worth slowing down for.

```js
setMessages([...messages, userMsg]);   // before the await
const data = await fetch(...);          // ← two seconds pass
setMessages([...messages, botMsg]);     // ✗ BROKEN — user's message vanishes
```

Why: `messages` is a `const` captured when *this render's* function ran. It's a **snapshot**, frozen at that moment. During the `await`, React re-rendered with a new array — but your still-running function is holding the old one. You spread the stale snapshot and overwrite the new state with it. The user's own message disappears from the screen.

The fix is one character's worth of thinking:

```js
setMessages((prev) => [...prev, botMsg]);   // ✓
```

Pass a **function** to the setter. React calls it with whatever the value is **at the moment it applies the update**. No snapshot is involved, so there's nothing to go stale.

> **🧠 Analogy.** You glance at the whiteboard, walk to the back room for ten minutes, come back, and rewrite the board from memory. Everything anyone wrote while you were gone is erased. The functional form is "read the board *at the instant* you write on it."

⭐ **Interview tip — the rule:** if the new state is derived from the old state, use the functional updater. Always. It costs nothing and it is immune to staleness. This also matters for rapid clicks, batched updates, and anything inside a `setTimeout`.

---

## Concept 5 — Conditional rendering, and Day 14 cashing in

Only assistant messages carry `sources`. User bubbles don't. Error bubbles don't. So that block must render *sometimes*.

JSX has no `if`. Slots take **expressions**, and React renders `undefined`, `null`, `false` and `true` as **nothing at all**. So:

```jsx
{m.sources?.length > 0 && (
  <div>...</div>
)}
```

`&&` short-circuits: falsy left side → evaluates to that falsy value → React renders nothing. Truthy left side → evaluates to the JSX → it renders.

Two guards in that one line:

- **`?.`** — optional chaining. User bubbles have no `sources` key at all, and `m.sources.length` would throw `Cannot read properties of undefined`. `?.` yields `undefined` instead of exploding.
- **`> 0`** — not bare `.length`.

⭐ **Interview tip — the `&&` trap:** React ignores `false` and `undefined`, but it **does render the number `0`**. So `{items.length && <List/>}` prints a bare, mysterious **0** on the page when the list is empty. Always compare to get a real boolean: `items.length > 0`.

### And the actual point of the day

Look at what shipped:

```
model's prose:  "(Sources: gst-concept-2019.pdf page 46; gst-concept-2019.pdf page 20)"
your pills:      gst-concept-2019.pdf p.46
                 gst-concept-2019.pdf p.19
                 gst-concept-2018.pdf p.18
                 gst-faq.pdf          p.31
                 gst-concept-2019.pdf p.20
```

The model was handed five chunks and **silently mentioned two**. It dropped `gst-faq.pdf` and `gst-concept-2018.pdf` entirely, without a word. On Day 14 it had also swapped a normal hyphen for U+2011 in a filename.

Meanwhile `data.sources` is an array assembled from the `{source, page}` metadata your ingestion pipeline stamped onto every chunk back on **Day 4**, carried untouched through the graph, and validated by Pydantic at the boundary.

⭐ **Render the array, never the prose.** One is data you own end to end. The other is a language model doing a confident impression of data. Day 14 taught it; today you can see it on screen in the same pixels.

---

## The code

`frontend/src/App.jsx`, whole file, in the order it was built.

### State

```jsx
const [messages, setMessages] = useState([]);            // the conversation
const [input, setInput]       = useState("");            // the composer box
const [loading, setLoading]   = useState(false);         // request in flight?
const [sessionId]             = useState(() => crypto.randomUUID());
```

Two details in that last line:

- **No setter destructured.** You never change it. Destructuring only what you use is an honest signal to the next reader.
- **`useState(() => ...)` — the lazy initializer.** Passing a *function* means React calls it exactly once, on mount. Passing `useState(crypto.randomUUID())` would generate a brand-new UUID on **every single render**; React throws all of them away and keeps the first, so it "works" — while being wasteful and lying to anyone reading it.

### The handler

```jsx
async function handleSubmit(e) {
  e.preventDefault();
  if (!input.trim() || loading) return;

  const question = input;
  setMessages((prev) => [...prev, { role: "user", text: question }]);
  setInput("");
  setLoading(true);

  try {
    const res = await fetch("http://localhost:8000/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, session_id: sessionId }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();                     // { answer, sources }
    setMessages((prev) => [
      ...prev,
      { role: "assistant", text: data.answer, sources: data.sources },
    ]);
  } catch (err) {
    setMessages((prev) => [
      ...prev,
      { role: "assistant", text: `Error: ${err.message}` },
    ]);
  } finally {
    setLoading(false);
  }
}
```

Line by line, the parts that matter:

| line | why it's there |
|---|---|
| `e.preventDefault()` | a native `<form>` submit **reloads the page**, wiping all state. Forget it and the app appears to "do nothing" — actually it does everything, then throws it away |
| `\|\| loading` | no double-send while a request is already in flight |
| `const question = input` | captured *before* `setInput("")`. The request body must not depend on state you're about to clear |
| `JSON.stringify` | the network carries **text**, not objects |
| `{ question, session_id: sessionId }` | matches the API contract exactly — `POST /chat` takes `{question, session_id}` |
| `if (!res.ok) throw` | because `fetch` won't |
| `finally` | runs on success **and** on failure. Without it, one error leaves `loading` stuck `true` forever and the app is dead until refresh |

### The render

```jsx
{messages.map((m, i) => (
  <div key={i} className={m.role === "user" ? "ml-auto max-w-[80%]" : "mr-auto max-w-[80%]"}>
    <div className={m.role === "user"
        ? "bg-blue-100 p-3 rounded-lg"
        : "bg-gray-100 p-3 rounded-lg whitespace-pre-wrap"}>
      {m.text}
    </div>

    {m.sources?.length > 0 && (
      <div className="flex flex-wrap gap-2 mt-2">
        {m.sources.map((s, j) => (
          <span key={j} className="text-xs bg-white border border-gray-300 rounded-full px-2 py-1 text-gray-600">
            {s.source} · p.{s.page}
          </span>
        ))}
      </div>
    )}
  </div>
))}
```

- **`{messages.map(...)}`** — JSX has no loop syntax. You render a list by turning an array of *data* into an array of *JSX*. `map` is the entire templating engine.
- **`key={i}`** — React needs a stable identity per list item to diff efficiently. ⭐ **Interview tip:** array index is acceptable **only** for append-only lists like a chat log. On a list that gets reordered, sorted or filtered, index keys cause real bugs — React reuses the wrong DOM node and things like input values jump between rows.
- **Two nested divs, on purpose.** The outer one owns **layout** (`ml-auto`, width). The inner owns **appearance** (background, padding). That's why the source pills sit outside the coloured bubble but stay aligned under it. Mixing layout and appearance onto one element is what makes CSS painful three weeks later.
- **`whitespace-pre-wrap`** — the backend returns markdown with real newlines, and HTML collapses whitespace by default. This preserves the line breaks. (Rendering markdown properly — bold, lists — is a later job.)
- **Nested `.map`** — outer over messages, inner over that message's sources. Each level needs its own `key`, hence `j`.

### Loading state

```jsx
<button disabled={loading} className="... disabled:bg-gray-400">
  {loading ? "..." : "Send"}
</button>
```

`disabled:` is a Tailwind **variant** — styles that apply only while the element is disabled. No JavaScript involved.

---

## The CORS moment that didn't happen

Day 12 predicted it: *the first CORS error will look like a broken API even though curl and Swagger pass.*

It didn't fire — because `allow_origins=["http://localhost:5173"]` had been sitting in `main.py` since Day 12. The prediction was right about the mechanism; the bill had already been paid.

Delete that middleware and this exact frontend code breaks instantly **while curl keeps working perfectly**.

⭐ **Interview tip:** CORS is enforced by the **browser**, not the server. The server merely *states* who is allowed, in a response header. The browser is the one that refuses to hand the response to your JavaScript. That's why command-line tools are never affected and why "but the API works!" is the classic wrong conclusion.

---

## 🐛 Bug museum — every bug today, and the one thing they share

| # | what was typed | should have been | what the computer did |
|---|---|---|---|
| 1 | `crypto.randonUUID()` | `randomUUID` | 💥 `TypeError`, red screen, console |
| 2 | `bg-grey-100` | `bg-gray-100` | 🤫 nothing. No grey. |
| 3 | `mini-h-screent` | `min-h-screen` | 🤫 nothing. Page not full height. |
| 4 | `'HTTP ${res.status}'` | `` `HTTP ${res.status}` `` | 🤫 nothing — until an error, which then prints `${res.status}` literally |
| 5 | `${err.message` | `${err.message}` | 🤫 nothing (valid string with wrong quotes) |
| 6 | `whitespace=pre-wrap` | `whitespace-pre-wrap` | 🤫 nothing. Newlines still collapse. |
| 7 | `{s.sources}` | `{s.source}` | 🤫 nothing. Empty pill. |

**Six of seven were silent.** And every one was a character-level typo **inside a string or an attribute**.

⭐ **The lesson, stated plainly:** typos in JavaScript **identifiers** blow up loudly — the engine looks the name up and fails. Typos in **strings** — class names, object keys, URLs, env var names — cannot blow up, because a string is always a valid string. Nothing checks it. The compiler is happy. The browser is happy. Only the pixels are wrong.

Bug 7 is Day 14's bug wearing a different hat: back then it was `Source.answer` instead of `Source.source` in Pydantic — and **Pydantic shouted** (`ResponseValidationError`) because it validates at the trust boundary. JavaScript reads a missing property, hands you `undefined`, React renders `undefined` as nothing, and draws an empty pill. Same mistake, one language catches it, the other shrugs.

**Two habits that pay for themselves:**
1. Keep the DevTools console open *before* you start guessing.
2. When a region of the page looks unstyled, don't debug logic — read that element's `className` character by character.

---

## ⏱️ 60-second recall

- Component = a function. React calls it, it returns JSX, React diffs and patches the DOM.
- `useState` does **two** jobs: persists a value across renders, **and** notifies React to re-render.
- Never mutate state. New array / new object. `push` = same reference = no re-render.
- Controlled input: `value` from state, `onChange` writes state. The typed letter round-trips through React.
- `fetch` returns a Promise. Two awaits: one for headers, one for the parsed body.
- `fetch` does **not** throw on 4xx/5xx. Check `res.ok` yourself.
- Deriving new state from old? Use the functional updater `setX(prev => ...)` — immune to stale closures across an `await`.
- `finally { setLoading(false) }` or a single error freezes the app.
- `{cond && <JSX/>}` for conditional render. `?.` for maybe-missing. `> 0` not bare `.length` (React renders `0`).
- `key` on every mapped element. Index only for append-only lists.
- CORS is enforced by the **browser**. curl is never affected.
- Render the **sources array**, never the model's prose citations.

---

## 🎴 Interview flashcards

**Q: Why can't you use a normal variable for UI state in React?**
A: Two reasons. It doesn't survive a re-render (the function runs again and re-declares it), and changing it doesn't tell React to re-render. `useState` solves both — React stores the value outside your function, and the setter schedules the update.

**Q: Why doesn't `array.push()` update the UI?**
A: React compares by reference. `push` mutates in place, so the reference is unchanged and React's check finds nothing new. You must pass a new array.

**Q: Controlled vs uncontrolled component?**
A: Controlled — the value lives in React state, bound with `value` + `onChange`. Uncontrolled — the DOM keeps the value, you read it with a `ref`. Controlled is the default because validation, disabling and programmatic clearing all become trivial.

**Q: Does `fetch` throw on a 404?**
A: No. It rejects only on network-level failure — unreachable server, DNS, dropped connection, CORS block. A 404 or 500 is a successfully delivered response. Check `res.ok` yourself.

**Q: Why two `await`s for one request?**
A: The first resolves when status and headers arrive; the body may still be streaming. `.json()` waits for the body to finish and parses it.

**Q: What's a stale closure in a React event handler?**
A: State variables are captured per render. If you `await` inside a handler and then read the captured variable, you're reading a snapshot from *before* the await, ignoring anything that changed meanwhile. Fix: the functional updater `setX(prev => ...)`, which React calls with the current value at apply time.

**Q: Why is array index a bad `key`?**
A: Keys give list items identity across renders. If the list is reordered or filtered, index keys make React associate the wrong DOM node with the wrong data — stale content, input values jumping rows. Fine only for append-only lists.

**Q: `{items.length && <List/>}` — what's wrong?**
A: When the array is empty, that evaluates to `0`, and React renders the number 0 on screen. Use `items.length > 0 &&`.

**Q: Why does the browser block a cross-origin request when curl doesn't?**
A: CORS is a browser security policy, not a server one. The server just declares allowed origins in a response header; the browser enforces it by refusing to hand the response to page JavaScript. Non-browser clients don't participate.

**Q: Why render a sources array instead of the citations in the model's answer text?**
A: The prose is generated tokens — the model retypes filenames from memory and can alter or omit them (it dropped 3 of 5 sources here, and swapped a hyphen for U+2011 on Day 14). The array comes from chunk metadata your own pipeline attached and validated. Never ask an LLM to reproduce a value you already hold.

---

## ✅ Self-test

1. Explain, without looking, the *two* jobs `useState` does.
2. You call `setMessages` twice in a row in one handler, both times as `[...messages, x]`. What happens and why?
3. Your `fetch` gets a 500 from the backend. Where does the code fail if you forgot `if (!res.ok)`, and why is the error message confusing?
4. Why is `useState(() => crypto.randomUUID())` different from `useState(crypto.randomUUID())`? Does the second one actually break anything?
5. A user bubble has no `sources` key. Trace what `m.sources?.length > 0` evaluates to, step by step.
6. Why did `bg-grey-100` produce no error at all, while `crypto.randonUUID()` produced a red screen?
7. The button shows `...` while loading, but a request throws before `setLoading(false)`. What would the app look like if `finally` were a plain `}` — and is the app recoverable?
8. Someone deletes the CORS middleware from `main.py`. Which of these still work: curl, Swagger UI at `/docs`, your React app? Why?

---

## What's still missing (deliberately)

- **`GET /history/{session_id}`.** Postgres holds every message, but nothing serves them back. Refresh the page and the chat looks empty — and `crypto.randomUUID()` hands you a brand new session on top of that. ~8 lines in `routes/chat.py`; `get_history()` already exists.
- **Markdown rendering.** The answer arrives as markdown (`**bold**`, `-` lists) and renders as literal asterisks. `whitespace-pre-wrap` only saved the newlines.
- **Auto-scroll** to the newest message.
- **Components.** `App.jsx` is one file doing everything. `MessageBubble` and `SourceCard` come out of it when there's a second reason to.
- **Zero new asserts.** Still 14. The frontend has no test yet; the backend contract it depends on is already covered.

---

**Next:** Week 4 D3 — splitting components out, `GET /history`, and surviving a page refresh.

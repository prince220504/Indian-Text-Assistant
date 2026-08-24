# Tutorial 19 — Props, Markdown, and a Parking Ticket: `MessageBubble`, `react-markdown`, `useRef` — Week 4 D3b

> **What you'll be able to recall after re-reading this:** what a component actually *is* mechanically and where the `props` object comes from; why a child may never edit its props, and what that buys you when debugging; why `key` is not a prop; why `**bold**` rendered as literal asterisks and why that is a *security feature*, not a bug; that "markdown" is not one format; why Tailwind deleted your bullet points; what `useRef` does that `useState` doesn't; and the partition lesson — why a set of rules fails on the input it never admitted existed.
>
> **How to use this doc:** read top-to-bottom once. After that jump to any boxed **Analogy**, the **three-variable table**, the **60-second recall**, or the **Interview flashcards**.

---

## Where this fits

```
WEEK 1   PDFs → chunks → embeddings → ChromaDB          ✅ Tutorials 01-06
WEEK 2   retriever → generator → memory                 ✅ Tutorials 07-09
WEEK 2.5 the pipeline as a graph: route/grade/rewrite   ✅ Tutorials 10-12
WEEK 3   the graph, reachable over HTTP, with sessions  ✅ Tutorials 13-15
WEEK 4   D1 the toolchain: Vite + React + Tailwind      ✅ Tutorial 16
         D2 the chat UI, calling POST /chat             ✅ Tutorial 17
         D3a the chat survives a refresh                ✅ Tutorial 18
         D3b components, markdown, auto-scroll          ▲ you are here
WEEK 5   calculator, upload, Hindi                      → next
```

Day 16 made it work. Day 17 made it remember. **Today makes it readable** — and not one backend line was needed for any of it.

---

## Concept 0 — The bug that was waiting in the file

Before any new code, one bug from Day 17 was sitting in `handleSubmit`:

```jsx
} finally {
  setHistoryLoading(false);   // ← wrong state
}
```

Symptom: ask one question, get an answer, and the Send button stays greyed out **forever**. `loading` was set to `true` and nothing ever set it back.

The cause is copy-paste debt. On Day 17 you wrote the mount effect's `try/catch/finally` first, reused its shape in `handleSubmit`, and the *shape* got copied while the *variable name* didn't. Two loading states now exist:

| state | owns | reset in |
|---|---|---|
| `historyLoading` | the one-time load on mount | the effect's `finally` |
| `loading` | one question in flight | `handleSubmit`'s `finally` |

Both are booleans. Both have a setter of the same shape. Nothing in JavaScript can tell you that you reached for the wrong one, because **both names exist and both calls are valid**.

⭐ **Interview tip:** this is the same family as Day 16's string typos, one level up. There the code was valid because *a string is always a valid string*. Here the code is valid because *both identifiers really exist*. Valid code, wrong meaning — the compiler is not the last line of defence, the screen is.

---

## Concept 1 — What a component actually is

`App.jsx` had grown to 129 lines: five states, two async functions, a mount effect, a `.map` and a nested `.map`. Everything worked. But finding `handleSubmit` meant scrolling past 25 lines of bubble JSX every single time.

> **🧠 Analogy — the dabbawala tiffin box.** The box design is one thing: same shape, same lid, same handle, made once in a factory. What goes *inside* changes per customer — one gets dal-roti, another rajma-rice. The factory does not design a new box per meal. It makes **one box**, and the meal is **passed in**. A React component is the box design. **Props are what you pass in.**

Mechanically, there is no magic here at all:

**A component is a plain JavaScript function that returns JSX.**

That's the whole definition. You had already written one — `App` is a function that returns JSX.

### Where `props` comes from

React calls your function and hands it **exactly one argument**: an object holding every attribute written on the tag.

```jsx
<MessageBubble message={m} theme="dark" />
```

JSX is not HTML. Vite compiles that line into a function call, roughly:

```js
React.createElement(MessageBubble, { message: m, theme: "dark" })
```

Look at the second argument. **The parent built that object.** React takes it and calls:

```js
MessageBubble({ message: m, theme: "dark" })
```

That object is `props`. Attribute name becomes key. No registration, no wiring, no framework ceremony.

So the direction is: **parent writes the attributes → React packs them into one object → React passes it as the child's first argument.** The child never creates its own props. It only reads what was handed down. *The tiffin box does not fill itself.*

### Two ways to write the signature

```jsx
// A: take the whole props object
function MessageBubble(props) {
  return <div>{props.message.text}</div>;
}

// B: destructure in the signature — what everyone actually writes
function MessageBubble({ message }) {
  return <div>{message.text}</div>;
}
```

B is not React syntax. It is ordinary JavaScript object destructuring — the same thing you have been doing since Day 16 with `const [input, setInput] = useState("")`, only with an object instead of an array.

---

## Concept 2 — Why a child may not edit its props

Not "cannot" in the sense that the language stops you. Type `message.text = "hi"` and JavaScript will happily do it and never complain.

**React just won't notice.**

Recall Day 16: `useState` does **two** jobs — it holds the value across renders, *and* it schedules the re-render. Assigning to a prop does neither. You mutated an object nobody is watching, so the screen keeps showing the old text. Then some unrelated thing triggers a re-render, the parent rebuilds props from *its* state, and your edit silently vanishes.

The real rule underneath: **only the owner of a piece of state may change it, and only through its setter.**

And here is what the rule buys you. `messages` lives in `App`. If `MessageBubble` were allowed to edit it, then "why is this bubble showing the wrong text?" would mean auditing every component that ever received that message. With one-way flow there is exactly one answer: **whoever calls `setMessages`**. In your app that is two places, both in `App.jsx`. You debug by reading one file.

⭐ **Interview tip — one-way data flow.** State flows **down** as props; events flow **up** as callbacks. A child that needs a change does not make it — it calls a function the parent passed down:

```jsx
<MessageBubble message={m} onDelete={() => removeMessage(i)} />
```

The child fires `onDelete`. The parent performs the `setMessages`. **Ownership never moves.** Contrast the jQuery era, where any file could reach in and mutate any DOM node — and finding who changed a value meant searching the whole codebase.

---

## Concept 3 — Build inner first

Two components came out of `App.jsx`, and the order matters: **build the innermost one first**, so the outer one can import something that already exists.

`SourceCard` → `MessageBubble` → `App` shrinks.

### `frontend/src/components/SourceCard.jsx`

```jsx
// One citation pill. Data comes from chunk metadata (Day 4), not the model's prose.
// props: { source: "gst-faq.pdf", page: 12 }
function SourceCard({ source, page }) {
  return (
    <span className="text-xs bg-white border border-gray-300 rounded-full px-2 py-1 text-gray-600">
      {source} . p.{page}
    </span>
  );
}

export default SourceCard;
```

Three things worth noticing:

- **It takes two plain values, not an object.** The parent writes `<SourceCard source={s.source} page={s.page} />`. `SourceCard` does not know a "source object" exists anywhere. Smaller contract, easier to reuse.
- **`export default`** — without it the file is a sealed box and nothing can import it.
- **No state, no hooks.** Same props in, same JSX out, every time. ⭐ That is a **pure / presentational component** — the easiest kind to test, and the cheapest kind for React to skip re-rendering.

### `frontend/src/components/MessageBubble.jsx`

```jsx
import SourceCard from "./SourceCard";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// One chat message + its citation pills.
// props: { message: { role, text, sources? } }
function MessageBubble({ message }) {
  const isUser = message.role === "user";

  return (
    <div className={isUser ? "ml-auto max-w-[80%]" : "mr-auto max-w-[80%]"}>
      <div
        className={
          isUser
            ? "bg-blue-100 p-3 rounded-lg whitespace-pre-wrap"
            : "bg-gray-100 p-3 rounded-lg markdown"
        }
      >
        {isUser ? message.text : (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
        )}
      </div>

      {/* restored history has no sources column -- ?. is why this doesn't throw */}
      {message.sources?.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {message.sources.map((s, j) => (
            <SourceCard key={j} source={s.source} page={s.page} />
          ))}
        </div>
      )}
    </div>
  );
}

export default MessageBubble;
```

- **`"./SourceCard"`** — the `./` is mandatory. Write `"SourceCard"` and the bundler goes hunting in `node_modules` and fails. The `.jsx` extension is optional; Vite resolves it.
- **`const isUser`** — the same ternary condition appeared twice. Named once, read twice. Not clever, just less to re-parse at 3am.
- **`message` is passed whole; `source`/`page` are passed split.** Deliberate. `MessageBubble` genuinely needs the whole message object. `SourceCard` needs two strings. *Pass the smallest thing that does the job.*

### And `App.jsx` collapses to

```jsx
{messages.map((m, i) => (
  <MessageBubble key={i} message={m} />
))}
```

Twenty-five lines became three. The other twenty-two still exist — they just live in a file you only open when bubbles are broken.

⭐ **A refactor with a visible change is a refactor with a bug.** The screen after this step must look pixel-identical to the screen before it. That is the whole test.

---

## Concept 4 — `key` is not a prop

`key` moved from the inner `<div>` onto `<MessageBubble>` — because the rule is: **`key` goes on whatever the `.map` returns.** That is now the component.

But `key` never reaches the component. React strips it out and uses it for its own list-diffing. Try to read `props.key` inside `SourceCard` and you get `undefined`.

`key={i}` is still fine here for the reason established on Day 16: **index keys are safe for append-only lists.** Messages are only ever pushed onto the end, never inserted or reordered.

---

## Concept 5 — Why `**bold**` showed as `**bold**`

`{message.text}` puts a **string** into the DOM. React sets it as text, character by character. React has no idea markdown exists. `*` is just an asterisk.

⭐ **And that is deliberate — it is a security feature.** React escapes everything you interpolate. If it interpreted your string as markup, then a model (or a user) emitting `<script>steal()</script>` would get it **executed**. React's default is *text stays text*, which is why XSS is hard to write by accident in React. The escape hatch exists and is named `dangerouslySetInnerHTML` — named specifically to scare you.

So the model sends markdown, React shows characters. Nothing is broken. There is simply **no translator in between**.

### Why `whitespace-pre-wrap` fooled you

That Tailwind class made newlines survive, so the text *looked* half-formatted and the problem looked half-solved. But it is a **CSS** property. It only changes how whitespace is displayed. It parses nothing. Line breaks worked; `**` never could.

### The ladder

1. Regex-replace `**x**` → `<strong>`. **No.** That forces `dangerouslySetInnerHTML`, so you now own an XSS hole *and* a half-broken parser that dies on nested lists, tables and code fences. Your model already emits `|` tables.
2. Write a real markdown parser. Absolutely not.
3. **`npm i react-markdown`** — a parser plus a renderer that emits real React elements, never raw HTML, so the escaping above stays intact.

⭐ **Interview tip:** "don't hand-roll a parser" is a real engineering rule, not a preference. Markdown, HTML, dates, CSV, email addresses — every one of them has a spec longer than you think and a library that already read it. Your regex handles the three cases you tested and silently mangles the forty you didn't.

### Passing the text as children

```jsx
<ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
```

The string sits *between* the tags, not in an attribute. ⭐ **Anything between a component's tags arrives as `props.children`** — an ordinary prop with a reserved name. `<div>hi</div>` has always worked exactly this way.

Note also that `whitespace-pre-wrap` **swapped sides**: the user bubble keeps it (raw string, newlines must survive), the assistant bubble must lose it, because react-markdown now emits real `<p>` and `<li>` elements and `pre-wrap` would double every blank line into a gap.

And only the assistant gets markdown. The user typed literal characters — if he types `*`, he means `*`.

---

## Concept 6 — "Markdown" is not one format

Bold started working. Tables still showed `|`.

react-markdown implements **CommonMark** — the actual standardised core: bold, italics, links, lists, code, headings. **Tables are not in CommonMark.** They are a GitHub extension, **GFM** (GitHub Flavored Markdown), along with strikethrough, task lists and autolinks.

So the model emits GFM — it learned markdown from GitHub, like everyone — and the renderer speaks CommonMark. The table syntax was not broken; it was **unrecognised**, so it fell through as plain text. Exactly the same shape as `**` being literal: no translator for that particular thing.

⭐ **Interview tip:** when a markdown feature "doesn't work", the first question is *which flavour*, not *which bug*. CommonMark, GFM, MDX, and the original 2004 Perl script are all different formats wearing the same name.

react-markdown is built on **remark**, a plugin pipeline, so GFM is one plugin away:

```
npm i remark-gfm
```

```jsx
<ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
```

The array is because plugins stack — math, footnotes, emoji. You needed one.

---

## Concept 7 — Then Tailwind ate the bullet points

Tables rendered. They had no borders, and the lists had no bullets. **Completely different cause.**

Tailwind ships a **preflight reset** that strips browser defaults: `ul` loses its bullets, `table` loses its borders, `h1` loses its size. Tailwind assumes you will style every element with utility classes.

Which you cannot do here — because **react-markdown generates those tags, not you.** There is no line of your JSX to put `list-disc` on.

That is why the bubble carries a plain `markdown` class: a hook to hang real CSS on. At the bottom of `frontend/src/index.css`:

```css
/* react-markdown output -- Tailwind preflight strips these defaults,
   and we can't put utility classes on tags the library generates. */
.markdown ul { list-style: disc; padding-left: 1.25rem; }
.markdown ol { list-style: decimal; padding-left: 1.25rem; }
.markdown p, .markdown ul, .markdown ol, .markdown table { margin-bottom: 0.5rem; }
.markdown table { border-collapse: collapse; }
.markdown th, .markdown td { border: 1px solid #d1d5db; padding: 0.25rem 0.5rem; }
```

⭐ **Interview tip:** utility-first CSS has exactly one blind spot — **HTML you did not write**. Markdown renderers, `dangerouslySetInnerHTML`, and third-party widgets all produce tags with no place to hang a class. Every utility framework needs an answer for it (Tailwind's official one is the `@tailwindcss/typography` plugin and its `prose` class; five lines of plain CSS is the version that adds no dependency).

---

## Concept 8 — `useRef`, the parking ticket

A long answer arrives and renders below the fold. The browser keeps the scroll position it had; it has no idea the new content matters.

To fix it you must call `element.scrollIntoView()` — a method on a real DOM node. But **you never create DOM nodes.** You write JSX; React creates them. You hold no variable pointing at the real `<div>`.

You *could* call `document.querySelector(...)`. ⭐ **Don't.** That reaches around React into the DOM React owns, and breaks the moment React re-renders and swaps the node out. React hands you a supported handle instead.

> **🧠 Analogy — the parking ticket.** You don't carry the car. You carry a small stub with the slot number on it. Later you hand over the stub and get the car back. `useRef()` gives you a box with a single field, `.current`. Hand that box to React via `ref={...}` on a JSX element, and once React has built the real DOM node it **drops the node into `.current`**. Now you hold the car.

### The one thing to remember

**Changing `.current` does NOT trigger a re-render.** That is the entire difference from `useState`.

| | survives a re-render | triggers a re-render |
|---|---|---|
| plain `let` variable | ❌ | ❌ |
| `useState` | ✅ | ✅ |
| `useRef` | ✅ | ❌ |

`useState` had **two** jobs (Day 16). `useRef` has the first one only. Use it for things the screen does not depend on: DOM nodes, timer ids, a "have I already done this" flag.

⭐ **Interview tip:** *"when do you reach for `useRef` over `useState`?"* → **when the value must persist but the UI must not react to it.** Putting a DOM node in `useState` would set state during render, which sets state, which renders — an infinite loop.

### The code, in three pieces

```jsx
// 1. the box
const bottomRef = useRef(null);

// 2. scroll to newest whenever the list grows or the spinner toggles
useEffect(() => {
  bottomRef.current?.scrollIntoView({ behavior: "smooth" });
}, [messages, loading]);

// 3. a zero-height marker, after the last bubble
<div ref={bottomRef} />
```

- **The empty div is on purpose.** Scrolling the *last message* into view lands the **top** of it in the viewport — on a long answer you'd see only its first line. A zero-height marker placed after everything lands the **bottom** in view. Cheap and exact.
- **`?.` is load-bearing.** On the first render React has not built the node yet, so `.current` is still `null`.
- **Deps `[messages, loading]`.** A new message scrolls; the loading spinner appearing scrolls again so the `...` stays visible. `[]` would fire once and never again; no array at all would fire on every render, forever.
- **`behavior`, not `behaviour`.** It is an options-object key, so the British spelling is not an error — it is an **unknown key, silently ignored**, and the scroll simply jumps instead of gliding. Day 16's lesson, third appearance.

---

## Concept 9 — `hii` came back with a GST answer

Not a frontend problem, and worth writing down because the diagnosis generalises.

Typing `hii` produced a full GST registration answer, and the server log said `[route] GST`. The router looked broken. It wasn't.

**The router never saw `hii`.** Trace what actually reached it:

```
you type "hii"
   ↓
chat() loads history from Postgres  → full of GST turns
   ↓
condense() sees non-empty history   → makes an LLM call (Day 8)
   prompt says: "Fill in anything the follow-up left implicit"
   ↓
"hii" is maximally implicit, so the model fills in EVERYTHING
   → "What are the GST registration requirements...?"
   ↓
route_node sees a GST question      → routes GST. Correctly.
```

⭐ **Interview tip:** when a pipeline stage looks wrong, check **what actually arrived at it**. The router's input is not the user's input — a rewriter sits in front of it. Debug at the boundary, not at the symptom.

### Two different rewriters, easy to confuse

| | `condense` (Day 8) | `rewrite_node` (Day 10) |
|---|---|---|
| lives | `chat.py`, **outside** the graph | inside the graph |
| runs | every turn that has history | only when the grader says `no` |
| job | resolve pronouns/topic from history | retrieval found junk, try different words |

The log showed `[grade] yes`, so `rewrite_node` correctly stayed asleep — while `condense` had already rewritten the question, silently, before anything printed.

### The actual defect: a partition with a hole

The obvious objection is that `CONDENSE_PROMPT` *already* had a rule for this:

> *"If the follow-up is already standalone, return it unchanged."*

But read what that rule's condition really is. **"Already standalone"** is a property of *questions* — it asks whether a question stands on its own or leans on the previous turn. The rules split the world into two buckets:

- standalone **question** → return unchanged
- follow-up **question** → fill in what's implicit

Both assume the input **is a question**. `hii` is neither. The model has to file it somewhere, it looks like the fragment case — short, no subject, obviously leaning on context — so the "fill in what's implicit" rule wins.

⭐ **Interview tip — and this is not really about prompts.** A set of rules is a **partition of the input space**. The bug is almost never that a rule is wrong; it is that the rules do not **cover**. Identical failure shape to a `switch` with no `default`, an `if/elif` with no `else`, or a router with no `General` category — which is exactly the case you *did* think about on Day 11.

The fix is not a stronger version of an existing rule. It is a **new bucket**, on a different axis, checked first:

```
- If the follow-up is a greeting, thanks, or not a question at all, return it UNCHANGED.
```

Old rules ask *"how complete is this question?"*. The new rule asks *"is this a question?"*. And because an LLM prompt is prose, **order carries weight** — it goes first.

After the fix, `hii` reaches the router unchanged → `General` → `decide_after_route` skips retrieval → `generate_node` returns `REFUSAL` directly. **One LLM call instead of seven** — Day 11's win, now visible in the log.

### Correct, and still wrong

The refusal string is written for *"I don't have that document"*, and a greeting is not asking for a document. So the pipeline is right and the product is off.

⭐ **"Correct but wrong" is its own bug class**: nothing violated the spec, the spec never covered greetings. Same partition lesson, one layer up. Deliberately left for Week 5 — greeting handling is a new category plus a canned reply, not a fix, and today's branch is named `react-chat-ui`. **Don't grow scope on a branch that names its scope.**

---

## What changed today

| File | Change |
|---|---|
| `frontend/src/components/SourceCard.jsx` | **new** — one citation pill, pure, 2 props |
| `frontend/src/components/MessageBubble.jsx` | **new** — one message + pills, markdown for assistant only |
| `frontend/src/App.jsx` | 25 lines of JSX → 3; `useRef` + scroll effect; `setLoading` bug fixed |
| `frontend/src/index.css` | 5 CSS rules for react-markdown output |
| `backend/rag/chat.py` | one new `CONDENSE_PROMPT` rule: not-a-question → unchanged |
| deps | `react-markdown`, `remark-gfm` |

Asserts: **still 14.** The frontend has no test harness, and the backend contract it leans on is already covered.

---

## 60-second recall

- A component is **a function that returns JSX**. Nothing more.
- Props come from the **parent**; React packs the JSX attributes into one object and passes it as the first argument.
- Props are **read-only**. Data down, events up. One owner per piece of state.
- **`key` is not a prop** — React eats it. Put it on whatever the `.map` returns.
- A component with no state and no hooks is **presentational**: same props in, same JSX out.
- React renders strings as **text**, always. That's XSS protection, not a missing feature.
- **`whitespace-pre-wrap` is CSS** — it preserves newlines, it parses nothing.
- **Markdown is not one format.** CommonMark ≠ GFM. Tables need `remark-gfm`.
- **Tailwind preflight strips defaults**, and you can't put utility classes on tags a library generated → one plain CSS hook class.
- **`useRef` persists without re-rendering.** `useState` does both jobs; `useRef` does the first.
- Scroll to an **empty marker div** after the list, not to the last message.
- A pipeline stage's input **is not the user's input**. Debug at the boundary.
- Rules are a **partition**. Ask what input falls in no bucket.

---

## Interview flashcards

**Q. What is a React component, mechanically?**
A plain JavaScript function that takes one object (`props`) and returns JSX. React calls it; you never do.

**Q. Where does the `props` object come from?**
The parent. JSX attributes compile into the second argument of `React.createElement`, which React passes to your function.

**Q. What happens if a child assigns to `props.message.text`?**
JavaScript allows it, React never notices — no re-render is scheduled, and the next real render rebuilds props from the parent's state and wipes it.

**Q. A child needs to delete an item from a list the parent owns. How?**
The parent passes down a callback (`onDelete`); the child calls it. State down, events up — ownership never moves.

**Q. Can you read `props.key` inside a component?**
No, it's `undefined`. React strips `key` for list reconciliation; it never reaches the component.

**Q. Why does `{"**bold**"}` render as literal asterisks in React?**
React escapes interpolated strings and inserts them as text. That's the XSS protection; opting out means `dangerouslySetInnerHTML`.

**Q. Bold works but `|` tables don't. Why?**
Tables aren't in CommonMark — they're a GFM extension. Add `remark-gfm` to `remarkPlugins`.

**Q. Your markdown renders but the lists have no bullets. What broke?**
Nothing broke — Tailwind's preflight reset removed the browser default `list-style`, and you can't put a utility class on a `<ul>` a library generated. Style it via a hook class (or the typography plugin).

**Q. `useState` vs `useRef`?**
Both survive re-renders. Only `useState` triggers one. `useRef` is for values the UI does not depend on: DOM nodes, timer ids, flags.

**Q. Why scroll to an empty div instead of the last message?**
`scrollIntoView` on a tall element lands its top in the viewport, so you'd see the first line of a long answer. A zero-height marker after the list lands the bottom.

**Q. Your router picks the wrong category for a greeting. Where do you look first?**
At the router's *actual input*. A condense/rewrite step upstream may have replaced the user's text before the router ever saw it.

---

## Self-test

1. `MessageBubble` is changed to `function MessageBubble(message)` — no braces. What renders, and why is there no error at import time?
2. You move `key={i}` from `<MessageBubble>` onto the inner `<div>` inside the component. Does the UI change? Does React complain? What did you lose?
3. `whitespace-pre-wrap` is left on the assistant bubble after react-markdown is wired in. Describe the visual symptom.
4. A teammate replaces `react-markdown` with a regex that turns `**x**` into `<strong>x</strong>` plus `dangerouslySetInnerHTML`. Name two distinct failures — one security, one correctness.
5. `bottomRef` is changed to `const [bottom, setBottom] = useState(null)` with `ref={setBottom}`. Predict what happens on the first render and why.
6. You delete `loading` from the scroll effect's dependency array. What still works, and what silently stops working?
7. `condense` is moved *after* `route_node` instead of before it. Give one question that now gets routed wrongly, and say why Day 8 put it first.
8. The `markdown` class is renamed to `md` in `MessageBubble.jsx` only. What breaks, and would the console tell you?

---

**Next:** Week 5 — the tax calculator route, Form 16 upload and Q&A, and the Hindi toggle. The frontend is now three files instead of one, which is what makes adding a second screen a change rather than a rewrite.

# 22 — Two screens: React Router and the calculator UI

**Day 21 · Week 5 D2 · branch `feature/tax-calculator`**

Day 20 built `POST /calculate` — a file with no LLM in it, 10 asserts, correct numbers.
Nobody could use it. It lived in Swagger.

Today it got a face, and the app grew from one screen to two.

---

## 1. The problem: one app, two jobs

Until today `App.jsx` *was* the chat. The file was the screen.

Now there are two screens. Three questions fall out of that immediately:

1. How does the user get from one to the other?
2. How does the app know which one to show?
3. What happens to the chat's state when they leave and come back?

Question 3 is the one that decides everything else.

---

## 2. `<a>` vs `<Link>` — the whole reason routers exist

> **Analogy — the shop and the shutter.**
> `<a href>` is pulling the shutter down, locking up, and reopening the shop from scratch.
> Everything inside — the customers, the half-written bill, the tea on the counter — is gone.
> `<Link>` is walking from the front counter to the back room. Same shop, still open.

An `<a href="/calculator">` triggers a **full page load**. The browser throws away the entire
JavaScript heap and rebuilds it. Every `useState` in the app resets.

Concretely, in *this* app, that means:

| State | Survives `<a>`? | Why |
|---|---|---|
| `messages` | ❌ | plain `useState`, lives in memory |
| `input` | ❌ | same |
| `loading` | ❌ | same |
| `sessionId` | ✅ | Day 17 parked it in `localStorage` |

So the chat would look **empty** until the history `fetch` came back — a visible flash of
nothing, on every single tab click. Not a crash. Just bad.

`<Link>` intercepts the click, calls `preventDefault()`, and pushes the new URL onto the
**History API** instead. No reload. React re-renders only the part inside `<Routes>`.

> ⭐ **Interview tip.** "SPA routing" means exactly this: the URL changes, the document does
> not. The back button still works because you pushed real history entries — you did not
> fake navigation with a `useState` tab switcher.

**Precision that matters:** `<Link>` doesn't re-render *the page*. It re-renders **only what
is inside `<Routes>`**. Anything outside — the nav bar, and any state living above it —
is untouched. That's why the nav bar is written outside `<Routes>` and not inside each page.

---

## 3. The three pieces

```
main.jsx    <BrowserRouter>      provides the current URL
App.jsx       <Routes>           the switchboard
                <Route>          one entry in it
```

**`BrowserRouter` is a context provider.** Same rule as any provider: it must sit *above*
everything that uses it. `<Routes>`, `<Route>` and `<Link>` all read from it, and throw
outside it. So it wraps `<App />` in `main.jsx`, not inside App.

```jsx
// main.jsx
<StrictMode>
  <BrowserRouter>
    <App />
  </BrowserRouter>
</StrictMode>
```

That change renders nothing differently. It only makes routing *available*.

**`Routes` is the container, `Route` is one entry.** Plural holds singular:

```jsx
<Routes>
  <Route path="/"           element={<Chat />} />
  <Route path="/calculator" element={<Calculator />} />
</Routes>
```

Note `element={<Chat />}` — an actual **element**, angle brackets and all. Not
`component={Chat}`. That's v6+ syntax, and every older tutorial you find will have it wrong.

---

## 4. `NavLink` — the router already knows

A `NavLink` is a `Link` that knows whether it points at the current URL. Its `className`
can be a **function** that receives `{ isActive }`:

```jsx
const tab = ({ isActive }) =>
  `px-4 py-2 rounded-lg text-sm font-medium ${
    isActive ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-200"
  }`;

<NavLink to="/" className={tab}>Chat</NavLink>
```

> ⭐ **The router already knows which route is active — never duplicate that into a
> `useState`.** A `const [activeTab, setActiveTab] = useState("chat")` alongside a URL that
> also says `/chat` is two sources of truth, and they *will* drift the first time someone
> deep-links or presses Back.

Same instinct as Day 19's `generate_node` narrowing `documents`: one source of truth,
everything downstream reads from it.

---

## 5. The split: move, don't rewrite

`App.jsx` was doing two jobs — app shell *and* chat screen. It became:

```
App.jsx              nav bar + <Routes>.  Owns nothing. No state, no fetch.
pages/Chat.jsx       the entire old App.jsx, renamed
pages/Calculator.jsx new
```

The Chat move was a **pure move**. Three edits and nothing else:

1. `./components/MessageBubble` → `../components/MessageBubble` (one level deeper now)
2. `function App()` → `function Chat()`
3. `export default App` → `export default Chat`

> ⭐ **A refactor is verified by *nothing changing*.** If the app looks even slightly
> different afterwards, you introduced a bug. The moment you mix a move with an
> improvement, you lose the ability to tell which one broke it.

One consequence had to be cleaned up: `Chat.jsx`'s outer div still carried
`min-h-screen bg-gray-100 flex items-center justify-center p-4`. The shell owns the
background and padding now, so the page div shrank to `max-w-2xl mx-auto`. Layout
responsibilities moved up; the page stopped fighting its own container.

---

## 6. The file-name bug Windows hid

The page file was first saved as `chat.jsx`, lowercase. On Windows it worked perfectly.

> **NTFS (Windows) is case-insensitive.** `import Chat from "./pages/Chat"` happily finds
> `chat.jsx`.
> **ext4 (Linux) is case-sensitive.** It does not.

Week 6 deploys the frontend to Vercel — Linux. The build would have failed there with
`Could not resolve "./pages/Chat"` **on a file that is right there in the repo**.

> ⭐ **Interview tip.** This is the classic "works on my machine, 404s in CI" bug. Same
> family as Day 20's silent bugs: the *environment*, not the language, decides whether it
> speaks up.

And git on Windows sometimes won't record a pure case rename, so it takes two moves:

```
ren src\pages\chat.jsx chat_tmp.jsx
ren src\pages\chat_tmp.jsx Chat.jsx
```

**Then the caches fought back.** A case-only rename poisons every index that stored the old
name. All three showed up in one session:

| Cache | Symptom | Fix |
|---|---|---|
| Vite | `Failed to resolve ./pages/Chat` in the browser | `rmdir /s /q node_modules\.vite`, restart |
| VSCode language service | red squiggle on a line that actually works | `Ctrl+Shift+P` → Developer: Reload Window |
| git index | old casing still tracked | `git ls-files` to check |

> ⭐ **When a red line disagrees with a working app, trust the app and suspect a stale
> index.**

---

## 7. Four bugs, and what they teach about loud vs silent

Today's bugs sorted themselves neatly into two piles.

| Bug | Typed | Should be | Loud? |
|---|---|---|---|
| `<BrowserRoute>` | identifier | `<BrowserRouter>` | 🔊 `ReferenceError` |
| `<Navlink>` | identifier | `<NavLink>` | 🔊 `ReferenceError` |
| `<Routes path=…>` nested | identifier | `<Route>` | 🔊 router error |
| `path="/Calculator"` | **string** | `/calculator` | 🔇 **blank page** |

> ⭐ **Typos in identifiers throw. Typos in strings cannot.**
> JSX treats a capitalised tag as a *variable reference*, so `<Navlink>` is a missing
> variable and the runtime shouts. But `path="/Calculator"` is just a string the router
> compares against another string. No match, no route, no error, no warning — a blank
> panel and total silence.

URLs are **case-sensitive on every OS**, always. `to="/calculator"` and
`path="/Calculator"` never meet.

That makes this the **fourth string-typo bug in the project** (`sources` vs `source` ×3,
now this one).

> ⭐ **Debug reflex: if it's silent, look at a string.**

A fifth one was self-inflicted and worth naming: the instruction comments from the tutorial
step got pasted into `Chat.jsx` as code, and `App.jsx` got the new imports pasted *on top of*
the old body instead of replacing it — leaving two copies of the chat component in the repo
at once. A comment describing a migration that is over is worse than no comment. Same lesson
as Day 20's stale `PENDING.md`, at small scale.

---

## 8. The calculator UI

Almost all of it is Day 16's fetch pattern, unchanged: `try` / `catch` / `finally`, the
`res.ok` guard, `loading` state. Four things were new.

### 8a. A number input's value is a string. Always.

`<input type="number">` hands you `"1300000"`, not `1300000`. And an empty box gives `""` —
not `0`, not `null`.

```
Number("")      // 0
Number("abc")   // NaN
JSON.stringify({ income: NaN })   // '{"income":null}'  <- silently null!
```

That `null` hits `Field(ge=0)` on the backend and returns **422** with no clue why.

The fix: keep the state as the **string the user typed**, and convert once, at the moment
you send.

```jsx
const [income, setIncome] = useState("");   // STRING -- mirrors the input box
...
body: JSON.stringify({ income: Number(income), salaried }),   // convert HERE
```

> ⭐ **Convert at the boundary, not in five places downstream.** Exactly the same rule as
> Day 19's `.strip()` on every LLM output. State mirrors the input box; the network gets
> a number.

### 8b. Checkboxes use `checked`, not `value`

```jsx
<input type="checkbox"
       checked={salaried}
       onChange={(e) => setSalaried(e.target.checked)} />
```

Reading `e.target.value` on a checkbox returns the literal string `"on"` — truthy forever,
regardless of the box. Another silent one.

### 8c. `result` starts as `null`, not `{}`

`null` means "haven't calculated yet", and that's what the `&&` short-circuit tests:

```jsx
{result && ( <table> … </table> )}
```

An empty object `{}` is truthy, so the table would render immediately — full of `undefined`.
The initial value *is* the meaning here.

Also `setResult(null)` inside `catch`: **stale numbers on screen are worse than none.** A tax
figure that silently belongs to the previous question is the worst possible failure mode for
this particular app.

### 8d. Indian number formatting is native

₹12,25,000 is not what Western grouping produces — that would be 1,225,000. The browser
already knows the lakh/crore system:

```js
(1225000).toLocaleString("en-IN")   // "12,25,000"
```

> ⭐ `Intl` is built into every browser. Adding a currency package to do this would be a
> dependency for one line the platform already has.

### 8e. The table rows are data

Six near-identical `<tr>` blocks typed by hand is six chances to mislabel one:

```jsx
const ROWS = [
  ["Taxable income", "taxable_income"],
  ["Standard deduction", "deduction"],
  ["Tax as per slabs", "tax_before_cess"],
  ["Less: 87A rebate", "rebate"],
  ["Health & education cess (4%)", "cess"],
];
...
{ROWS.map(([label, key]) => ( <tr key={key}> … </tr> ))}
```

Same lesson as Day 20's `SLABS`: **rules from a table → store the table.** The label and
the response key sit side by side on one line, so a mismatch is visible instead of buried
30 lines apart.

---

## 9. Verified live

Both servers up, clicked through the nav:

| income | salaried | total tax |
|---|---|---|
| 13,00,000 | no | ₹78,000 |
| 13,00,000 | yes | ₹66,300 |
| 12,00,000 | no | ₹0 |
| 12,50,000 | no | ₹70,200 |

That last pair is **the cliff** — ₹50,000 more income, ₹70,200 more tax, because 87A stops
applying entirely above ₹12L taxable. Marginal relief is deliberately not built.

Three router behaviours confirmed by hand:

1. URL reads `/calculator`, and the active tab highlight follows it — no state tracking it.
2. Back to Chat: **messages still there**, no refetch flicker. The `<Link>` lesson, visible.
3. Browser **Back** button returns to the calculator. Free, from the History API.

---

## 10. Flashcards

| Q | A |
|---|---|
| `<a>` vs `<Link>`? | `<a>` reloads the document and wipes all React state; `<Link>` pushes onto the History API and re-renders only `<Routes>` |
| Where does `BrowserRouter` go? | Above everything that routes — in `main.jsx`, wrapping `<App />`. It's a context provider |
| `Routes` vs `Route`? | `Routes` is the switchboard (container), `Route` is one entry |
| v6 route syntax? | `element={<Chat />}` — an element, not `component={Chat}` |
| How does the active tab highlight? | `NavLink`'s `className` as a function receiving `{ isActive }` — never a `useState` |
| Why did lowercase `chat.jsx` work locally? | NTFS is case-insensitive; Linux (Vercel) is not |
| Why is `path="/Calculator"` silent? | It's a **string**, not an identifier — no match, no error, blank page |
| What type is `<input type="number">`'s value? | A string. `""` when empty |
| Why `result = null` and not `{}`? | `{}` is truthy → table renders full of `undefined` |
| Why `setResult(null)` in `catch`? | Stale tax numbers on screen are worse than none |
| How to format ₹12,25,000? | `n.toLocaleString("en-IN")` — native `Intl`, no library |

---

## 11. Self-test

1. You replace `<Link to="/calculator">` with `<a href="/calculator">`. Name every piece of
   state that dies, and the one that survives. Why does that one survive?
2. `<Navlink>` throws but `path="/Calculator"` doesn't. Explain the difference in terms of
   what JSX does with each.
3. Why can't the active-tab highlight be a `useState` in `App.jsx`? Give a concrete sequence
   of user actions that breaks it.
4. `income` state is `""`. What exactly reaches the backend, and what status comes back?
5. The chat's outer div lost `min-h-screen bg-gray-100`. Who owns those now, and why is that
   the right owner?
6. Your Vercel build fails with `Could not resolve "./pages/Chat"` but the file is visibly in
   the repo. First thing you check?

---

## 12. Where this leaves the product

Both halves now run in one app. Which makes an existing tension **visible** rather than
theoretical:

- `/calculator` confidently answers **income-tax** questions.
- `/` **refuses** income-tax questions — the corpus is GST-only, so those route straight to
  the refusal with `sources: []`.

Two halves of one product disagreeing about their own scope, now one nav click apart. That
is a product decision, not a bug, and it needs settling before deploy.

**Next:** PR #7, then Week 5's remaining extras.

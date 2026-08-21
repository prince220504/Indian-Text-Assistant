# Tutorial 16 — Vite + React + Tailwind Scaffold — Week 4 D1

> **What you'll be able to recall after re-reading this:** why "it downloads the model every time" was the wrong diagnosis; where environment variables have to be set when a library does work at *import* time; what Vite, React and Tailwind each actually do (three different jobs people blur into one); why Tailwind v4 threw away its config file; and why `classname` is a silent bug and `class` is a loud one.
>
> **How to use this doc:** read top-to-bottom once. After that jump to any boxed **Analogy**, the **60-second recall**, or the **Interview flashcards**.

---

## Where this fits

```
WEEK 1   PDFs → chunks → embeddings → ChromaDB          ✅ Tutorials 01-06
WEEK 2   retriever → generator → memory                 ✅ Tutorials 07-09
WEEK 2.5 the pipeline as a graph: route/grade/rewrite   ✅ Tutorials 10-12
WEEK 3   the graph, reachable over HTTP, with sessions  ✅ Tutorials 13-15
WEEK 4   D1 the toolchain: Vite + React + Tailwind      ▲ you are here
         D2 the chat UI, calling POST /chat
```

Three weeks of backend. Today the dining room gets built.

---

## Concept 0 — The bug that wasn't a bug

Every time you ran *anything* — the server, a self-check — this appeared:

```
Warning: You are sending unauthenticated requests to the HF Hub...
Loading weights: 100%|##########| 103/103 [00:00<00:00, 3313.47it/s]
```

The read was: "the embedding model re-downloads on every run." Reasonable. It's a progress bar, progress bars mean downloads.

It wasn't. Two commands settled it:

```
ls ~/.cache/huggingface/hub
→ models--sentence-transformers--all-MiniLM-L6-v2     # already there
```

and the bar's own timing: `[00:00<00:00, 3313.47it/s]`. **103 items in under a second.** No network on earth is that fast. Those 103 items are *tensors being read off your own disk into RAM* — the model has 103 weight arrays, and loading them is the bar.

> **🧠 Analogy — the library card.** You think you're re-buying the book every morning. You're not. The book is on your shelf. What you're watching is you *opening* it and flipping to the right page. The noise looked like a purchase because it had a receipt printer attached.

> ⭐ **Interview tip — a progress bar is not evidence of network I/O.** Before optimising a "slow download", check (a) the cache directory and (b) the elapsed time the tool itself is printing. "It re-downloads every time" is one of the most commonly wrong diagnoses in the ML tooling world, and the fix people reach for — pinning, vendoring, mirroring — solves a problem they don't have.

Two separate noises, two separate switches:

| noise | source | switch |
|---|---|---|
| `Loading weights: 103/103` | `huggingface_hub` progress bars | `HF_HUB_DISABLE_PROGRESS_BARS=1` |
| `unauthenticated requests to the HF Hub` | hub phoning home to check for a newer version | `HF_HUB_OFFLINE=1` |

The second one is the interesting one: even fully cached, the library makes a **network call on every start** to ask "is there a newer revision?" That's a real cost — latency on boot, and a hard failure if you're offline.

---

## Concept 1 — Where an env var has to be set

Obvious answer: `.env`, we already have one, `load_dotenv()` reads it. **That doesn't work here.** Trace why:

```python
# generator.py
from .retriever import retrieve      # line 1 — this import RUNS retriever.py top to bottom
load_dotenv()                        # line ~8 — far too late
```

And `retriever.py` line 10:

```python
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
```

That is **module-level code**. The model loads *during the import*, before `load_dotenv()` has run a single instruction. The env vars would be set minutes after the library already read them.

> ⭐ **Interview tip — configuration must be in place before the code that reads it runs.** A library that does work at import time (loads a model, opens a connection, reads a flag) narrows your window to *before the first import*. This is why `os.environ` shims sit at the very top of entrypoints, above the import block, in a lot of ML code — it looks like bad style and it's the only thing that works.

So where's the one place that always runs first? **`backend/__init__.py`.** Python guarantees a package's `__init__.py` executes before any of its submodules. Every entrypoint in this project goes through it:

```
uvicorn backend.main:app          → backend/__init__.py, then main.py
python -m backend.rag.retriever   → backend/__init__.py, then rag/, then retriever.py
python -m backend.database        → backend/__init__.py, then database.py
```

One file, six lines, all callers covered:

```python
import os

# HF loads the embedding model at import time (retriever.py line 10), so these
# must be set BEFORE transformers is imported - .env/load_dotenv() runs too late.
# This __init__ is the one file every entrypoint runs first.
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
os.environ.setdefault("HF_HUB_OFFLINE", "1")
```

**`setdefault`, not `=`.** `setdefault` only writes if the key is absent, so `HF_HUB_OFFLINE=0 python -m backend.rag.retriever` still works from the shell when you genuinely want to fetch. Hard assignment would make the file a wall you'd have to edit to get past.

> ⭐ **Interview tip — the fix goes where all the callers meet.** Same instinct as a bug fix: one guard in the shared path beats a guard in every caller. Four entrypoints, one `__init__.py`.

### The ceiling on this (marked, not hidden)

`HF_HUB_OFFLINE=1` means: **if the model isn't cached, the first run fails instead of downloading it.** Fine today (it's cached). The day you switch embedding models, you warm the cache once:

```
HF_HUB_OFFLINE=0 python -m backend.rag.retriever
```

Known ceiling with a known escape hatch. That's the difference between a shortcut and a trap.

---

## Concept 2 — Three tools, three jobs

People say "React app" and mean all three. They're separate and they're interviewed separately.

| Tool | Job | Would you notice if it vanished? |
|---|---|---|
| **Vite** | Dev server + production bundler | Nothing serves your files; nothing turns JSX into JS |
| **React** | UI library — describes *what the screen looks like for a given state* | You'd write DOM manipulation by hand |
| **Tailwind** | CSS via class names | You'd write a `.css` file |

> **🧠 Analogy — kitchen and dining room.** The FastAPI backend is a kitchen with a service window. `POST /chat` is the window: slide in `{question, session_id}`, get back `{answer, sources}`. The kitchen doesn't know or care who's at the window — curl, Swagger, React, a Hindi app in Week 5. The frontend is the dining room. Its *only* jobs are: take what the customer typed, walk it to the window, put what comes back on the table.

The rule that falls out of the analogy: **no tax logic ever goes in React.** The moment you're tempted to compute a slab in JavaScript, that belongs in the kitchen. The dining room presents; it does not cook.

> ⭐ **Interview tip — why Vite is fast.** In dev it ships **native ES modules straight to the browser** — there is no bundling step at all while you develop. Webpack rebuilt the whole bundle on every save; Vite re-sends only the one file you changed. That's the entire pitch. (It *does* bundle for production, with Rollup, because hundreds of module requests over the network is a different problem than hundreds over localhost.)

What we ran:

```
npm create vite@latest frontend -- --template react
cd frontend
npm install tailwindcss @tailwindcss/vite
```

React 19 + Vite 8. `frontend/` matches the folder structure the project planned in Week 1.

---

## Concept 3 — Tailwind v4 deleted its config

If you find a tutorial telling you to run `npx tailwindcss init`, create `tailwind.config.js`, add a PostCSS config, and list your file paths in a `content: []` array — **that's v3.** All of it is gone in v4.

v4 is a **Vite plugin**. Two edits total.

```js
// frontend/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'   // NEW

export default defineConfig({
  plugins: [react(), tailwindcss()],          // NEW
})
```

```css
/* frontend/src/index.css — the ENTIRE file */
@import "tailwindcss";
```

**What a Vite plugin is:** a hook into the build pipeline. Vite reads each file on its way to the browser, and a plugin says "when you see a file like X, let me transform it first." `react()` turns JSX into real JavaScript. `tailwindcss()` reads your CSS, scans your JSX for class names, and generates only the CSS you actually used.

> ⭐ **Interview tip — "doesn't Tailwind bloat the bundle?"** No, and the reason matters. Tailwind isn't a big CSS framework you use 2% of. It **generates** CSS from the class names found in your source. Utilities you never wrote don't exist in the output — there's nothing to purge, because nothing was ever there.

`main.jsx` imports `index.css`. That one import is the whole of Tailwind. Leave it alone.

---

## Concept 4 — `className`, and the bug it causes

The smoke test:

```jsx
function App() {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-xl shadow-md">
        <h1 className="text-2xl font-bold text-slate-800">Indian Tax Assistant</h1>
        <p className="text-slate-500 mt-2">Frontend is alive.</p>
      </div>
    </div>
  )
}

export default App
```

**`className`, not `class`.** JSX compiles to JavaScript objects, and `class` is a reserved word in JS. Same reason it's `htmlFor` instead of `for`.

**Every class is one CSS property.** `p-8` = padding. `rounded-xl` = border-radius. `flex items-center justify-center` = the classic centering trio. You are not learning a framework's opinions — you're learning CSS with shorter names, which is why the knowledge transfers.

### The bug (guided, found in one look)

Typed `classname` on the outer `<div>` — lowercase `n`. The page rendered. No red screen, no crash. The inner white card was styled perfectly; the outer wrapper had **no grey background and no centering**, so the card sat in the top-left.

> ⭐ **Interview tip — HTML attributes are case-insensitive; JSX attributes are not.** In a `.html` file, `CLASS`, `class` and `Class` all work. In JSX they're **JavaScript object keys**, which are case-sensitive. React sees an unknown key, passes it through to the DOM as a literal `classname="..."` attribute, the browser ignores it, and nothing applies. React does print `Warning: Invalid DOM property 'classname'. Did you mean 'className'?` — **in the DevTools console**, which you only see if you open it.

Same family as Day 13's `uuid.uuid4` without parens: **valid code, wrong meaning, no exception.** The loud bugs are cheap. These are the expensive ones.

> ⭐ **Interview tip — open the console before you start guessing.** Half of "React isn't working" is a warning that has been sitting in the console the whole time, naming the exact problem in plain English.

---

## What got built today

```
frontend/
├── index.html
├── vite.config.js       ← + tailwindcss() plugin
├── package.json
└── src/
    ├── main.jsx         ← imports index.css (untouched)
    ├── index.css        ← one line: @import "tailwindcss";
    └── App.jsx          ← smoke test, no logic yet
```

Deleted: `App.css` and Vite's spinning-logo demo. **Scaffold only** — no chat UI, no fetch, no state. Getting the toolchain green is its own hour, and a scaffold that renders is a real checkpoint: if the card is centered on grey, then Vite, the React plugin, the Tailwind plugin and the CSS import are *all four* wired correctly. One screenshot tests the whole chain.

`frontend/.gitignore` (shipped by Vite) already ignores `node_modules` and `dist`. Git honours nested `.gitignore` files, so nothing needed adding at the repo root.

---

## 60-second recall

- `Loading weights: 103/103` was **tensors loading from disk**, not a download. Check the cache dir and the elapsed time before optimising.
- `HF_HUB_DISABLE_PROGRESS_BARS=1` kills the bar; `HF_HUB_OFFLINE=1` kills the per-boot network check.
- They go in **`backend/__init__.py`** because HF loads the model at *import* time and `load_dotenv()` runs too late. `setdefault` so the shell can still override.
- Ceiling: offline mode means a new model fails instead of downloading. Warm it once with `HF_HUB_OFFLINE=0`.
- **Vite** = dev server + bundler, fast because dev mode ships native ES modules. **React** = UI for a given state. **Tailwind** = CSS as class names, generated from what you actually used.
- Tailwind v4 = a Vite plugin + `@import "tailwindcss";`. No config file, no `content` array. Config-file tutorials are v3.
- `className` not `class` (reserved word). Lowercase `classname` **silently** does nothing — React warns in the console only.
- Frontend presents, backend computes. No tax logic in React.

---

## Interview flashcards

**Q: Your model "downloads on every run". How do you check?**
A: Look at the cache directory first, then at the elapsed time the progress bar itself prints. 103 items in under a second is disk, not network. The common fix — pinning or vendoring — solves a problem that isn't there.

**Q: A library reads an env var at import time. Where do you set it?**
A: Before the first import of that library — a package `__init__.py`, or above the import block in the entrypoint. `.env` + `load_dotenv()` is too late, because the import that triggers the read happens first.

**Q: Why `os.environ.setdefault` instead of assignment?**
A: It leaves the shell in control. A hard assignment makes the file a wall you have to edit to override a one-off run.

**Q: Why is Vite faster than Webpack in development?**
A: It doesn't bundle in dev. It serves native ES modules to the browser and re-sends only the changed file. It still bundles for production, where request count matters.

**Q: Does Tailwind bloat your CSS?**
A: No — it generates CSS from the class names present in your source, so utilities you never used are never emitted. It's a generator, not a library you subset.

**Q: `class` vs `className` in JSX?**
A: `class` is a reserved word in JavaScript and JSX attributes are object keys. Getting the casing wrong (`classname`) doesn't throw — React forwards it to the DOM as an unknown attribute and the styles silently don't apply.

---

## Self-test

1. The bar said `103/103` and finished in under a second. What are the 103 things, and how do you prove it isn't a download?
2. Why can't `HF_HUB_OFFLINE` live in `.env`?
3. Why `backend/__init__.py` specifically, and not the top of `main.py`?
4. What does `HF_HUB_OFFLINE=1` break, and what's the escape hatch?
5. Which of the three tools would you lose JSX support from?
6. You copy a Tailwind tutorial that says to create `tailwind.config.js`. What's wrong with it?
7. `classname` vs `className` — which one crashes, and why is that the good outcome?

<details>
<summary>Answers</summary>

1. The 103 weight tensors of `all-MiniLM-L6-v2`, being read from the local cache into RAM. Proof: `~/.cache/huggingface/hub/models--sentence-transformers--all-MiniLM-L6-v2` already exists, and no network transfers 103 files in 0.03s.
2. Because `retriever.py` builds `HuggingFaceEmbeddings` at module level, so the model loads during the `from .retriever import retrieve` on line 1 of `generator.py` — before `load_dotenv()` has run.
3. Python runs a package's `__init__.py` before any submodule, so it covers **every** entrypoint: `uvicorn backend.main:app`, `python -m backend.rag.retriever`, `python -m backend.database`. Putting it in `main.py` would only fix the server.
4. If a model isn't cached, the run fails instead of downloading. Warm the cache once with `HF_HUB_OFFLINE=0 python -m backend.rag.retriever`.
5. Vite — specifically the `@vitejs/plugin-react` plugin, which transforms JSX into JavaScript. React is the library you're calling; it doesn't compile anything.
6. It's Tailwind v3. v4 is a Vite plugin with a single `@import "tailwindcss";` — no config file, no `content` array.
7. Neither crashes. That's the problem: `classname` is forwarded to the DOM as an unknown attribute, the styles silently don't apply, and the only signal is a console warning. A crash would have been cheaper.

</details>

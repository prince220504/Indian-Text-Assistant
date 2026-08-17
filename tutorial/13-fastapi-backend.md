# Tutorial 13 — FastAPI: Putting a Counter on the Office — Week 3 D1

> **What you'll be able to recall after re-reading this:** why a browser cannot call your Python; what FastAPI does and what uvicorn does (two different jobs); why `/chat` is a POST and `/health` is a GET; what Pydantic buys you at the trust boundary; what "cold start" means and why import-time model loading is good news; why CORS blocks you and who grants the permission; and — the long half of the session — what `__init__.py` actually does, why it alone fixes nothing, and why `python -m` exists.
>
> **How to use this doc:** read top-to-bottom the first time. After that jump to any boxed **Analogy**, the **60-second recall**, or the **Interview flashcards**.

---

## Where this fits

```
WEEK 1   PDFs → chunks → embeddings → ChromaDB          ✅ Tutorials 01-06
WEEK 2   retriever → generator → memory                 ✅ Tutorials 07-09
WEEK 2.5 the pipeline as a graph: route/grade/rewrite   ✅ Tutorials 10-12
WEEK 3   the graph, reachable over HTTP                 ▲ you are here
WEEK 4   React, calling this API
```

Everything before today was `python something.py`. One user, one machine, one language. Today the pipeline gets a **front door**.

The rule of the day, and it held: **`rag/` does not learn that HTTP exists.** No node, no prompt, no assert changed because of FastAPI. `main.py` translates HTTP↔Python and nothing else.

---

## Concept 1 — Why an API at all

> **🧠 Analogy — the bank counter.** Your RAG graph is the bank's back office: vaults, ledgers, staff who know where every file is. A customer never walks into the back office. They come to a **counter**, slide a filled form through a window, get a slip back.
>
> FastAPI is the counter. The window is a **URL**. The form is **JSON**. The slip is **JSON**. The back office does not change at all — same clerks, same vault. You added a window.

Why can't React just `import chat.py`? Two independent reasons, and most people only name the first:

1. **Language.** A browser runs JavaScript. It does not have a Python interpreter.
2. **Machine.** Even if it did — `chat.py` lives on your laptop, and in Week 6 on Railway. The frontend lives on Vercel. Code on machine A cannot import a file on machine B. The only wire between them is the network, and the only thing a browser speaks on that wire is HTTP.

An API is the translation layer for both problems at once.

---

## Concept 2 — FastAPI and uvicorn are two different things

This confuses people for months, so get it straight now.

| | job |
|---|---|
| **FastAPI** | Knows which function handles which URL. Validates input. Serialises output. Builds the docs. **Cannot touch the network.** |
| **uvicorn** | Opens TCP port 8000. Parses raw HTTP bytes off the socket. Hands FastAPI a request object. Writes the response back on the wire. |

FastAPI is the counter *design*. Uvicorn is the building with a door in it.

You saw the proof in your very first response headers:

```
server: uvicorn                    ← uvicorn wrote the headers
content-type: application/json     ← FastAPI serialised the body
```

```bash
uvicorn backend.main:app --reload
#       └──┬───┘ └┬┘
#      module    the FastAPI() object inside it
```

`backend.main:app` is not magic naming — it's "import this module, find this variable." Rename the variable to `api` and you write `backend.main:api`.

`--reload` watches your files and restarts on save. **Dev only.** In production it's wasted processes and a file watcher you don't want; Week 6's Procfile drops it.

---

## Concept 3 — GET, POST, and the first route

```python
@app.get("/health")
def health():
    """Cheap liveness check - proves the server is up without touching the LLM."""
    return {"status": "ok"}
```

The decorator is the entire trick. It runs at import time and writes one row into a routing table: *GET `/health` → call `health()`*. The function itself is an ordinary Python function; the decorator is what makes it reachable from the internet.

You return a **dict**, not a string. FastAPI serialises to JSON and sets the header. No `json.dumps`, no manual `Content-Type`.

### Why `/health` exists and why it must stay dumb

Railway, Kubernetes, and load balancers ping a health endpoint every few seconds to decide "is this box alive, do I keep sending it traffic?"

> ⭐ **Interview tip:** a health check must be **cheap**. One that calls Groq bills you every 5 seconds and reports *unhealthy* whenever the vendor is slow — even though your app is perfectly fine. Health checks answer "am I running", not "is the whole world working."

### Why `/chat` is a POST

| | GET | POST |
|---|---|---|
| data rides in | the URL | the request **body** |
| meaning | "give me something" | "here is data, do something" |
| expected to be | safe + idempotent | neither |

A question *could* be `GET /chat?q=What+is+GST`, but questions are long, contain `&` `?` `%`, and end up in browser history, server logs and proxy caches.

> ⭐ **Interview tip:** GET is supposed to be **idempotent** — calling it twice changes nothing. Your `/chat` appends to `history` and bills Groq. That is not idempotent. POST.

---

## Concept 4 — Pydantic: validation at the trust boundary

```python
class ChatRequest(BaseModel):
    question: str

class ChatResponse(BaseModel):
    answer: str

@app.post("/chat", response_model=ChatResponse)
def chat_route(req: ChatRequest):
    """Counter clerk: take the question, hand it to the graph, return the answer."""
    return ChatResponse(answer=chat(req.question))
```

> **🧠 Analogy.** Pydantic is the form printed on the counter window. The customer cannot hand you a napkin with scribbles on it. Either they fill in *that* form, or the counter rejects it — and the clerk in the back is never interrupted by garbage.

**`req: ChatRequest` — the type hint IS the wiring.** FastAPI sees a Pydantic type in the signature and concludes "this comes from the request body." Missing key, wrong type, malformed JSON → **422 Unprocessable Entity**, and your function never runs.

**`response_model=ChatResponse`** validates on the way *out* too — it guarantees the shape React will receive, and publishes that shape in the docs so Week-4-you reads the contract instead of guessing it.

> ⭐ **Interview tip:** this is **validation at the trust boundary**. Everything past `main.py` is your code and may trust its inputs. Everything before it is the internet and may not. One place, at the edge — not scattered defensive checks in every function.

> ⭐ **Interview tip:** the same type annotation does **three** jobs — parsing, validation, and OpenAPI documentation. That's why FastAPI can generate a live test UI at `/docs` from nothing but your function signature. You wrote one decorator and got a web page you never designed.

### The naming trap

The route function is called `chat_route`, not `chat` — because `chat` is already the imported function. Shadow it and `chat(req.question)` would call **itself**. Infinite recursion, and Python says nothing at import time. The URL comes from the decorator, never from the function name, so you are free to pick a non-colliding name.

---

## Concept 5 — Cold start

Adding one import made boot slow, and printed `Loading weights 103/103`. That's your MiniLM embedding model being read off disk into RAM, because `from backend.rag.chat import chat` drags in `chat → graph → generator + retriever`, and Day 6/7 built those objects at **module level**.

That's not a bug — it's the design working:

- Module-level = loaded **once per process**, at import.
- Every request after the first reuses the already-loaded model and the already-open Chroma connection.
- One slow boot, thousands of fast requests.

> ⭐ **Interview tip:** this is **cold start**, and it's why model-loading apps fit badly on serverless — each cold invocation can pay the multi-second load. A long-running process (Railway, a container) amortises it. It's also the second reason `/health` must not touch the model: the health check must answer while the heavy path is busy.

---

## Concept 6 — CORS, the error that will confuse you in Week 4

> **🧠 Analogy.** Your browser is a paranoid security guard. A page loaded from `localhost:5173` (Vite) tries to POST to `localhost:8000` (your API). Different port = **different origin**. The guard's default rule: *a page may not read responses from a site it didn't come from.*
>
> Without that rule, any random page you open could quietly `fetch("https://yourbank.com/accounts")` **using your logged-in cookies** and read the reply.

So the block is a feature, not a defect. CORS is how a server says "no really, I'm expecting them" — it sends `Access-Control-Allow-Origin` and the guard stands down.

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],   # Vite dev server (Week 4)
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Two things almost everyone gets wrong:

> ⭐ **CORS is enforced by the browser, not the server.** curl, Postman, `requests` — all ignore it completely. Your Swagger test passed because Swagger is served *from the same origin as the API*. So this error appears only in Week 4, only from a browser, and never in your terminal tests. It will look like the API is broken. It won't be.

> ⭐ **The permission is granted by the receiving server.** `main.py` decides who may call it. Which makes `allow_origins=["*"]` a real decision — *any website on the internet may call this API from a user's browser* — not a formality. Name the origin. `"*"` chosen "until I know my frontend URL" is how a dev API ends up permanently open in production.

**Middleware** = a layer wrapping every request, in and out. You saw the stack in that traceback: `ProxyHeaders → ErrorMiddleware → ExceptionMiddleware → your route`. Yours joins that chain. It has to be middleware, not a per-route thing, because it must also answer the browser's **preflight `OPTIONS`** request — which never reaches your function at all.

---

## Concept 7 — The import problem, and what `__init__.py` really does

This started as a shortcut and became the best half of the session.

`rag/chat.py` line 1 said `from generator import llm` — flat, no package. That works when you run `python chat.py` *inside* `backend/rag/`, because Python puts the script's own folder on `sys.path`. Uvicorn runs from somewhere else, so `generator` is invisible.

The first version was two lines in `main.py`:

```python
sys.path.append(str(Path(__file__).parent / "rag"))
from chat import chat
```

Then you asked the right question: *why not add `__init__.py` and do it properly?*

### The answer that matters

**`__init__.py` marks a folder as a package. It does not change how names are resolved.** Import resolution only ever asks: *is there a `<name>.py` or `<name>/` in one of the directories on `sys.path`?*

Trace `from rag.chat import chat`, standing in `backend/`:

1. `sys.path` contains `backend/`. Python finds `backend/rag/`, sees `__init__.py` ✅
2. Loads `backend/rag/chat.py`. Line 1: `from generator import llm`.
3. Python searches `sys.path` for `generator`. `sys.path` has **`backend/`**, not `backend/rag/`. No `backend/generator.py` exists.
4. `ModuleNotFoundError`.

> ⭐ **Being inside a package does not put your siblings on the path.** That single sentence is the whole confusion. The proof was already sitting in your repo: `backend/ingestion/__init__.py` has existed since Week 1, and `embed_and_store.py` still says `from chunk_docs import chunk_pdf` — so those scripts *still* only run from inside `ingestion/`. You'd made the package and kept script-style imports. The marker was doing nothing.

### The fix: relative imports

```python
from .retriever import retrieve                 # generator.py
from .generator import llm                      # chat.py
```

One dot = "the package I live in." Relative means *my neighbour*, so the subpackage keeps working however it's nested — rename `backend/` to `api/` and `rag/` doesn't notice.

`retriever.py` changed nothing. **Seventh straight day untouched.**

> ⭐ **The most reused module in a codebase is usually the one with the fewest imports of its own.** Not a coincidence — nothing can force it to change.

### The cost, paid honestly

| import style | `python chat.py` from `rag/` | `python -m backend.rag.chat` from root |
|---|---|---|
| flat (before) | ✅ | ❌ |
| `from .generator import ...` | ❌ `attempted relative import with no known parent package` | ✅ |

Converting **breaks the command you had been using to run your six asserts**. That's the real price — not the four edited lines.

### Why `python -m`

`-m` means "import this as a module *inside its package*, then run it." It puts the current directory on `sys.path` (so `backend` is findable) and sets `__package__` to `backend.rag` — which is exactly what the leading dot needs to resolve against. Running a path directly sets no package context at all, so the dots have nothing to be relative *to*.

> ⭐ **Interview tip:** same mechanism as `python -m pip install` — it guarantees you're using the pip belonging to the interpreter you just named, not whichever `pip.exe` wins on PATH.

### Why we anchored at the repo root

Two layouts were valid. The difference is **where you stand when you run things**:

```
run from backend/          run from repo root/        ← chosen
uvicorn main:app           uvicorn backend.main:app
```

Week 6's Procfile sits at the repo root and will run `uvicorn backend.main:app`. `requirements.txt` is already at the root for the same reason.

> ⭐ **"It works on my machine" is very often just a different working directory.** Develop standing where your deployment will stand, and that class of bug never gets a chance to exist.

### Absolute in the entry point, relative inside the package

```python
from backend.rag.chat import chat      # main.py - entry point, absolute
from .generator import llm             # rag/chat.py - inside the package, relative
```

The top-level module states plainly where things come from; the package's internals stay portable.

---

## Concept 8 — The vendor pulled the model out from under you

Mid-session, every request died with:

```
groq.NotFoundError: 404 - The model `llama-3.3-70b-versatile` does not exist or you do not have access to it.
```

Nothing to do with FastAPI. Groq deprecated it — the **second** deprecation on this project (3.1 → 3.3 → gone).

**First diagnostic move: separate authentication from authorisation.** An invalid key returns **401**. You got **404 model_not_found** — meaning Groq authenticated you fine and then said "that model no longer exists." The key was never the problem.

**Second move: ask the API, don't guess.**

```python
from groq import Groq
print('\n'.join(sorted(m.id for m in Groq().models.list().data)))
```

(Bare `urllib` gets a 403 from Groq's edge — use the SDK.)

Every Llama was gone. Chose `openai/gpt-oss-120b`, and deliberately **not** `groq/compound` — those are agentic systems with built-in web search, and your entire design says *answer only from my documents*. A model that can quietly browse breaks the grounding guarantee your asserts protect.

The change was **one string** in `generator.py`. Not the prompts, not the graph, not the retriever, not the asserts.

> ⭐ **`ChatGroq` is an adapter.** The vendor's model is a swappable part behind a stable interface — the payoff of never letting the LLM leak past `generator.py`.

> ⭐ **Anything the vendor can change without asking you belongs in config, not in source.** Week 6: `os.getenv("GROQ_MODEL", "...")`, so the next deprecation is an env-var edit, not a code change and redeploy.

**And then the six asserts earned their keep.** New brain, same contract — still cites, still refuses with the *exact* string. That's a model swap **proven** safe rather than assumed safe. That is what a regression test is for.

---

## What the run exposed (filed for Week 4)

The new model answers well, and cites like this:

```
(Source: gst‑concept‑2019.pdf, page 46)
```

Two defects hiding in that line:

1. Those aren't ASCII hyphens — the model typeset them as **U+2011 non-breaking hyphens**. Readable, but no longer matching any real filename. "Click the source to open the PDF" would 404.
2. In another run it cited `gst-concept-2018.pdf, page 33` for a chunk that came from **page 18**. It invented a page number.

Don't fix this with a prompt rule (Day 11: *a prompt rule is a request*). The citations already exist as clean `{source, page}` metadata on your Document objects — stamped there on Day 4.

> ⭐ **Don't ask an LLM to reproduce a value you already hold.** Week 4: `/chat` returns `{"answer": ..., "sources": [...]}` — prose from the model, citations from state.

---

## Bugs of the day

| Bug | Loud or silent? | Lesson |
|---|---|---|
| `"openai/gept-oss-120b"` | Loud, but **only from the server**, 400ms away over the network | **Sixth consecutive session with the typo inside a string.** Python fine, linter fine, only Groq objects. |
| `hear` vs `here` in a comment | Silent | Same pattern. You proofread code and skim prose. |
| `KeyboardInterrupt` traceback on save | Noise, not a bug | `--reload` runs a watcher parent + a server child; saving mid-boot kills the child inside `import uvicorn`. Read what came *after* it: `Application startup complete`. |

> ⭐ **The habit worth taking from six-for-six:** when a value crosses a boundary — a model id, a URL, an env var name, a JSON key — **read it back against the source, don't proofread it by eye.** Your eye autocorrects `gept` to `gpt`. Copy-paste it, or diff it against the list.

---

## What we deliberately skipped

| Skipped | Add when |
|---|---|
| Postgres / persistent chat history | Week 3 D2. `history` is still a module-level global — every user shares one conversation. **This is the one real design step of the week.** |
| Sources in the `/chat` response | Week 4, when the UI has a SourceCard to put them in. Also fixes the fake hyphens and invented page numbers. |
| `async def` routes | When something is genuinely I/O-bound and awaitable. `chat()` is sync and blocking; FastAPI already runs sync routes in a threadpool (that's `run_in_threadpool` in your traceback). Making it `async def` without awaiting anything would block the event loop — **worse**, not better. |
| Auth / rate limiting | Before a public URL exists. Week 6, at the latest. |
| Model id in `.env` | Week 6, with the other deploy config. Third deprecation will feel cheap. |
| Fixing `ingestion/`'s flat imports | It's run-once code that already ran. Convert it if it ever gets imported by something. |
| An HTTP-level test (`TestClient`) | The route is three lines with no logic. The six asserts cover everything underneath, and Swagger covers the wire. Add one when a route grows a branch. |

---

## 60-second recall

1. **A browser can't import Python** — different language *and* different machine. HTTP is the only wire.
2. **FastAPI routes and validates; uvicorn owns the socket.** Two libraries, two jobs.
3. **The decorator makes a function reachable**; the URL never comes from the function name.
4. **`/health` must be cheap** — no DB, no LLM. It answers "am I running".
5. **POST for anything not idempotent.** `/chat` appends history and spends money.
6. **The type hint is the wiring** — Pydantic parses, validates, and documents from one annotation.
7. **Validate at the trust boundary**, once, at the edge — inside is your code and may be trusted.
8. **Cold start:** module-level objects load once per process; slow boot buys fast requests.
9. **CORS is enforced by the browser and granted by the server.** Invisible in curl, only appears in Week 4.
10. **`__init__.py` marks a package; it does not change name resolution.** Siblings are not on the path.
11. **Relative imports inside a package, absolute in the entry point.**
12. **`python -m` gives a module its package context** — that's what makes the leading dot resolvable.
13. **Stand where your deployment stands.** Working-directory mismatch is a whole family of "works on my machine".
14. **401 vs 404**: auth failure vs the thing genuinely being gone. Read the status code before debugging your code.
15. **Anything a vendor can change without asking belongs in config.**
16. **Asserts are what makes a swap provable.** Same six tests, new model, still green.

---

## Interview flashcards

**Q: What's the difference between FastAPI and uvicorn?**
A: FastAPI is the ASGI application — routing, validation, serialisation, OpenAPI generation. Uvicorn is the ASGI server — it owns the socket, parses HTTP, and calls the app. The app can't listen on a port; the server doesn't know your routes. The ASGI interface is the contract between them, which is why you can swap uvicorn for hypercorn without touching your code.

**Q: Why does FastAPI use type hints for request bodies?**
A: One annotation drives three things: parsing the body, validating it (returning 422 automatically), and generating the OpenAPI schema that powers `/docs`. It puts the contract in the function signature instead of in a comment, so it can't drift from the code.

**Q: Where should input validation live in a web app?**
A: At the trust boundary — the edge where untrusted input enters. Validate once there, then let internal code assume valid input, rather than scattering defensive checks throughout. In FastAPI that's the Pydantic model on the route.

**Q: Your API works in curl but the browser says "blocked by CORS policy". What's wrong?**
A: Nothing on the wire — CORS is a browser-side rule, so non-browser clients never see it. The server must return `Access-Control-Allow-Origin` for the frontend's origin. Fix it on the API (in FastAPI, `CORSMiddleware`), name the exact origins rather than `*`, and remember preflight `OPTIONS` requests must be handled too — which is why it's middleware, not a route.

**Q: What is cold start, and how does it interact with loading an ML model?**
A: The first-request cost of a fresh process: imports, model weights, DB connections. Loading at module level pays it once per process, so long-lived servers amortise it across thousands of requests, while serverless may pay it per cold invocation. It's the main argument for a container/long-running process for model-backed apps, and the reason health checks must not touch the loaded model.

**Q: You add `__init__.py` to a folder and imports still fail. Why?**
A: `__init__.py` only marks the directory as a package; it doesn't add anything to `sys.path`. Modules inside a package don't see their siblings as top-level names — `from generator import x` inside a package still searches `sys.path`, not the package directory. Use relative imports (`from .generator import x`) or fully-qualified ones.

**Q: Why `python -m package.module` instead of `python package/module.py`?**
A: `-m` imports the module within its package, setting `__package__` so relative imports resolve, and puts the current directory on `sys.path`. Running the file path directly gives it no package context, so any relative import raises "attempted relative import with no known parent package".

**Q: A vendor deprecates the model your app hardcodes. What's the immediate fix and what's the real fix?**
A: Immediate: query the provider's models endpoint for what your account can actually use, and swap the id. Real fix: move the id to configuration so it's an env-var change rather than a code change and redeploy — anything the vendor can change unilaterally is config. And keep the vendor behind an adapter so the swap touches one file. Then re-run the test suite: the tests are what turn "probably fine" into "proven fine".

---

## Self-test

1. Someone tells you the API is broken because the browser console says "blocked by CORS policy", but `curl` works fine. What is your one-sentence diagnosis, and which file do you edit?
2. Change `question: str` to `question: str | None = None`. What does `POST /chat` with `{}` do now — and where does it fail instead?
3. Why would making `chat_route` an `async def` (without changing `chat()`) make the server *worse* under concurrent load? (Hint: find `run_in_threadpool` in the traceback you pasted.)
4. Delete `backend/rag/__init__.py` but keep everything else. What is the exact error, and at which import line?
5. You move `main.py` to the repo root. List every line that has to change, in every file.
6. `history` is a module-level list in `chat.py`. Two people hit `POST /chat` at the same time from different laptops. Describe exactly what each of them sees. (This is Week 3 D2's entire reason for existing.)

---

**Next:** Week 3 D2 — `database.py`. Neon Postgres, a `messages` table, and killing the global `history` list so a conversation belongs to a session instead of to the server process.

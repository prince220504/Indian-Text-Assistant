# Tutorial 15 — Real Citations + Routers — Week 3 D3

> **What you'll be able to recall after re-reading this:** why asking an LLM to retype a filename is a bug even when it "works"; the difference between data your code *holds* and data a model *reproduces*; why `in` on a dict is not the operator you think it is; why a negative assert is the one that rots silently; how `response_model` validates on the way **out**; and what `APIRouter` actually does (and doesn't) cost.
>
> **How to use this doc:** read top-to-bottom once. After that jump to any boxed **Analogy**, the **60-second recall**, or the **Interview flashcards**.

---

## Where this fits

```
WEEK 1   PDFs → chunks → embeddings → ChromaDB          ✅ Tutorials 01-06
WEEK 2   retriever → generator → memory                 ✅ Tutorials 07-09
WEEK 2.5 the pipeline as a graph: route/grade/rewrite   ✅ Tutorials 10-12
WEEK 3   D1 the graph, reachable over HTTP              ✅ Tutorial 13
         D2 memory that survives users and restarts     ✅ Tutorial 14
         D3 citations you can actually click            ▲ you are here
WEEK 4   React, calling this API
```

Two debts came due today. One was filed on **Day 12** (the model mistypes its own citations) and one on **Day 13** (an assert that tested the model's prose and flaked). They turned out to be the same debt.

---

## Concept 1 — The bug that was green

Before today, `/chat` returned one field:

```json
{ "answer": "...GST threshold is ₹20 lakhs... (Source: gst‑concept‑2019.pdf, page 46)" }
```

The citation is **inside the prose**. Which means the model *typed it*. It read `[Source 1: gst-concept-2019.pdf, page 46]` in the context we built, and wrote it back out.

Mostly correctly. Two observed failures:

| what the model wrote | what's actually true |
|---|---|
| `gst‑concept‑2019.pdf` with **U+2011 non-breaking hyphens** | `gst-concept-2019.pdf` with ordinary hyphens |
| `page 33` | the chunk was page 18 |

The first one is invisible. Two strings that look pixel-identical, and `open("gst‑concept‑2019.pdf")` raises `FileNotFoundError`. In Week 4 that's a "View source" link that 404s and nobody can explain why.

> **🧠 Analogy — the clerk reading the receipt aloud.** You hand a clerk a receipt and ask him to *read the amount into a new form*. He copies ₹1,180 as ₹1,180 — most of the time. Sometimes ₹1,108. Nothing crashes, nobody notices, and you find out at audit. The receipt was in your hand the whole time. You should have stapled it, not dictated it.

> ⭐ **Interview tip — never ask an LLM to reproduce a value you already hold.** Generation is a probability distribution over tokens. Even at `temperature=0` it is *picking* the filename, not *copying* it. If a value exists in your program's memory, pass it through your program.

And we *did* already hold it. **Day 4** stamped `{source, page}` onto every chunk's `metadata` at split time. It has been riding along in `state["documents"]` through every node, all week, unread.

---

## Concept 2 — Reading it back out

```python
def unique_sources(docs):
    """Pull {source, page} off each chunk's metadata, drop duplicates, keep order."""
    seen = []
    for d in docs:
        s = {"source": d.metadata["source"], "page": d.metadata["page"]}
        if s not in seen:      # 5 docs max - a list scan is cheaper than making dicts hashable
            seen.append(s)
    return seen
```

**Why dedup:** the retriever returns `k=5` chunks. Two of them can come off the *same page* of the same PDF — a long paragraph split at 600 characters. The run proved it: five chunks came back, four unique sources.

**Why a list and not a `set`:** `dict` is unhashable, so `set()` refuses. The alternatives are tuples (positional, easy to swap) or `frozenset` (ugly). With five items, `if s not in seen` is an O(n²) scan over *five things*. Correct, boring, done.

Then `ask()` stops throwing the rest of the state away:

```python
def ask(question: str) -> dict:
    result = app.invoke({"question": question, "retries": 0, "documents": []})
    # documents is seeded to [] so this key always exists - refusal path just yields no sources
    return {"answer": result["answer"], "sources": unique_sources(result["documents"])}
```

That seeded `documents: []` from Day 9 pays off here. The refusal path (`Income-Tax`/`TDS` → skip retrieval) never runs `retrieve_node`, so nothing ever writes that key. Because it was seeded, `unique_sources([])` returns `[]` instead of raising `KeyError`.

> ⭐ **Interview tip — changing a return *shape* is a breaking change even when nothing type-checks it.** Python will not warn you. The discipline is: grep for callers *before* you edit the signature, not after the traceback.

**Dict, not tuple.** `answer, sources = ask(q)` works today and breaks the day a third field appears — and a swapped tuple order fails *silently*. Named fields survive growth, and JSON is a dict anyway.

### The limit we deliberately kept

`sources` is **every retrieved chunk**, not only the ones the model actually leaned on. Narrowing it would mean asking the model which ones it used — straight back to trusting prose. So the frontend label is "sources consulted", and that's honest.

---

## Concept 3 — `in` is not one operator

Changing the return shape broke the self-checks in a way worth memorising:

```python
a = ask("What is the GST registration threshold?")   # now a dict
assert "Source:" in a
```

This does **not** raise `TypeError`. `in` dispatches on the container:

| container | `x in c` asks |
|---|---|
| `list`, `tuple`, `set` | is `x` one of the values? |
| `str` | is `x` a substring? |
| `dict` | is `x` one of the **keys**? |

So `"Source:" in a` asks *"is `Source:` a key of this dict?"* → `False` → the assert fires on a perfectly good answer.

Loud failure. Annoying, but safe. Then the same mistake in `chat.py`:

```python
assert "don't have enough information" not in a2      # a2 is a dict
```

`not in` a dict with keys `answer`/`sources` → always `True` → **the assert can never fail again**. Retrieval could break completely and this stays green.

> ⭐ **Interview tip — negative asserts rot silently.** `not in`, `!=`, `assert not x`: when the container or the shape changes underneath them, "broken" and "healthy" both evaluate to pass. A positive assert at least screams when the ground moves.

Same family as Day 13's `uuid.uuid4` without parens: **valid Python, silent, test passed for the wrong reason.**

---

## Concept 4 — Asserts that test *your* code

Old (graph.py):

```python
assert "Source:" in a, "expected a citation"
```

That tests **the model's prose**. On Day 13 it failed because the model wrote `Sources:` — and the "fix" was deleting a colon. `temperature=0` means *pick the highest-probability token*, not *emit the same string forever*; batching, model version, and context all shift it. That assert was a coin flip that had been landing heads.

New:

```python
assert a["sources"], "no citations returned"
assert all(s["source"].endswith(".pdf") for s in a["sources"]), "bad filename"
...
assert b["sources"] == [], "refusal must cite nothing"
```

Every one of those is a property **your code** guarantees. The only prose assert left is the refusal string — and that string is pinned by your own `REFUSAL` constant in `generator.py`, so it's your code too.

> ⭐ **Interview tip — assert on what your code guarantees, never on what the model happened to say.** The test suite for an LLM app should still pass if the vendor swaps the model underneath you. Yours now does (it survived exactly that on Day 12).

---

## Concept 5 — Validating on the way out

```python
class Source(BaseModel):
    source: str    # filename, straight from Day 4's chunk metadata
    page: int

class ChatResponse(BaseModel):
    answer: str
    sources: list[Source]
```

**Why not `list[dict]`?** Because that tells FastAPI nothing: no validation, and `/docs` renders an empty blob. Declaring the two fields means a chunk missing `page` becomes a **500 in your process**, with a stack trace, instead of a silently broken card in Week 4's React.

You saw it work, on your own typo:

```
'loc': ('response', 'sources', 0, 'answer'), 'msg': 'Field required',
'input': {'source': 'gst-concept-2019.pdf', 'page': 46}
```

Read `loc` right-to-left: *the `answer` field, of item 0, of `sources`, of the response.* And `input` shows what you actually handed it. The error names both shapes — it's never a framework bug, it's a mismatch, and it hands you the diff.

> ⭐ **Interview tip — validate at the trust boundary in *both* directions.** Day 12 gave you `ChatRequest` (validating in). `response_model=` validates out. Same annotation, same one-line cost, and it turns a frontend mystery into a backend stack trace.

Note the route body is now a plain `return chat(...)` — a **dict**. FastAPI reads `response_model=` and converts + validates it. Returning `ChatResponse(...)` by hand is identical; this is just less typing for the same guarantee.

---

## Concept 6 — `APIRouter`

`main.py` had app setup, CORS, `init_db`, two Pydantic models and a route in one file. Fine at two routes. Week 5 adds calculator and upload and it's a junk drawer.

> **🧠 Analogy — the building and the counters.** `main.py` is the bank *building*: the doors, the security guard (CORS), raising the shutter in the morning (`init_db`). Each counter — chat, calculator, upload — is its own desk with its own forms. You don't renovate the building to add a desk.

```python
# backend/routes/chat.py
router = APIRouter()

@router.post("/chat", response_model=ChatResponse)
def chat_route(req: ChatRequest): ...
```

```python
# backend/main.py
from backend.routes.chat import router as chat_router
app.include_router(chat_router)
```

Three things to keep:

- **`router as chat_router`** — every route file names its own `router`. Renaming at the *import site* keeps them apart without inventing a different variable name in each file.
- **`/health` stays in `main.py`.** It describes the *building*, not a counter. Put it in `routes/chat.py` and deleting the chat feature deletes your load balancer's heartbeat.
- **No `calculator.py` / `upload.py` stubs.** Empty files "for later" are scaffolding. Later can scaffold for itself.

> ⭐ **Interview tip — `include_router()` runs at import time.** It copies the router's routes into the app's routing table — the same table Day 12's decorator wrote one row into. A router is an organizing tool that has *vanished* by the time a request arrives. Zero per-request cost.

---

## 60-second recall

- Citations were **prose the model retyped**; now they're **data your code read** from Day 4's `metadata`.
- `unique_sources(docs)` → `[{"source": ..., "page": ...}]`, deduped (two chunks can share a page).
- `ask()` returns `{"answer", "sources"}`; `chat()` passes it through; only `answer` is saved to history (history feeds `condense`, sources don't).
- `in` on a **dict checks keys**. Negative asserts (`not in`) rot silently when the shape changes.
- Asserts now test properties **your code** guarantees, not the model's wording.
- `response_model=` = validation on the way out. `list[Source]`, never `list[dict]`.
- `APIRouter` + `include_router()` = organizing only, resolved at import, free at request time.

---

## Interview flashcards

**Q: Your RAG app cites sources. How do you guarantee the citation is real?**
A: Never let the model produce it. Metadata is stamped onto every chunk at split time and travels with the retrieved documents; the API reads it out of state and returns it as structured data. The model's prose citation is decoration — the array is the truth.

**Q: `temperature=0`, so the output is deterministic — can I assert on it?**
A: No. `temperature=0` is argmax token selection, not a stability guarantee; batching, model version and context change it. Assert on what your code guarantees. Ours survived a forced model swap mid-project because of that.

**Q: What does `"x" in some_dict` check?**
A: Keys. Not values, not items. It's the reason a shape change turned one assert into a permanent false-pass.

**Q: Why declare a response model instead of returning a dict?**
A: Validation on the way out plus a real OpenAPI schema. A malformed field becomes a 500 in my process with a stack trace, instead of a broken UI in the client with no explanation.

**Q: What does `APIRouter` cost at runtime?**
A: Nothing. `include_router()` copies routes into the app's routing table at import time. It's file organization, not indirection.

---

## Self-test

1. The model wrote `gst‑concept‑2019.pdf` and the file is `gst-concept-2019.pdf`. What is different, and why is this the *worst* kind of bug?
2. Why does `unique_sources` use a list and `not in` instead of a `set`?
3. `documents` is seeded to `[]` in `ask()`. Which code path breaks if you remove that seed?
4. Why is `assert "..." not in some_dict` more dangerous than `assert "..." in some_dict`?
5. Which single assert in the whole project still reads the model's prose, and why is that one acceptable?
6. Why does `/health` live in `main.py` and not in `routes/chat.py`?

<details>
<summary>Answers</summary>

1. U+2011 non-breaking hyphens instead of ASCII hyphens. It renders identically, so no human review catches it, and it only fails later at file-open or link-follow time.
2. `dict` is unhashable so `set()` won't take it; with five items an O(n²) scan is cheaper than the code needed to make them hashable.
3. The refusal path (`Income-Tax`/`TDS`), which skips `retrieve_node` — nothing ever writes `documents`, so `result["documents"]` would raise `KeyError`.
4. Because when the shape changes underneath it, it evaluates `True` and passes forever. The positive form fails loudly instead.
5. `assert "don't have enough information" in b["answer"]` — acceptable because that string is pinned by the `REFUSAL` constant in `generator.py`, i.e. it's still your code, not the model's choice of words.
6. It describes the application, not the chat feature. Deleting or replacing the chat router must not take the load balancer's liveness probe with it.

</details>

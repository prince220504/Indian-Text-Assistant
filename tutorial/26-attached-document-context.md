# 26 — The document in the request body

**Day 26 · Week 5 (Form 16 upload, session 2 of 2 — backend) · branch `feature/form16-upload`**

Session 1 built `POST /upload`: a PDF goes in, `{filename, pages, text}` comes back. Then the
text was **thrown away**. The endpoint worked and did nothing useful.

Today it becomes useful. The question — *"how much tax was deducted from my salary?"* — gets
answered from a document that exists nowhere in the corpus, was never embedded, and is never
stored.

The whole feature is **20 lines across three files**. The interesting part is a bug it
uncovered on the way out: a refusal that arrived with four source citations attached.

---

## 1. The real problem: two requests, no memory

HTTP has no memory. `POST /upload` finishes, the process moves on, the bytes are garbage
collected. `POST /chat` is a completely separate request that knows nothing about it.

So the design question isn't "how do I answer questions about a PDF." It's narrower and
harder:

> **Where does the text live between the upload request and the chat request?**

Three candidate homes. This is the whole design session:

| Where it lives | What it costs |
|---|---|
| **ChromaDB** (embed it like the corpus) | Rejected Day 25. One shared store, **no `user_id`** — a stranger's GST question could retrieve chunks of your salary slip |
| **Postgres**, keyed by `session_id` | New column, new migration — and it **inherits** the `session_id` security debt (§10: guess an id, read that chat; now also read that salary) |
| **The browser** | Zero storage. Zero migration. Zero new debt. The server never keeps the document at all |

The browser wins, and it wins for free — because session 1 **already returns the text to the
client**. `{filename, pages, text}` was built in the last session without knowing this was
the reason it mattered.

> 📦 **The photocopy-at-the-counter analogy.**
> Option 1 is the clerk filing your Form 16 in a shared cabinet that has no name labels — any
> clerk pulling any file might pull yours.
> Option 2 is filing it in a drawer labelled with your queue number, where anyone who knows
> the number can open the drawer.
> Option 3 is you **keeping the paper in your hand**, holding it up at the window each time
> you ask something, and taking it home with you. The office never has a copy to lose.

> ⭐ **Interview tip.** "Stateless about user data" is a **security** property, not a laziness
> one. Nothing stored means nothing to leak, nothing to authorise, nothing to encrypt at rest,
> nothing to delete when a user asks. **The cheapest fix for a data-protection problem is not
> collecting the data.**

### The ceiling on this design

Say the honest limit out loud: a 2-page Form 16 is ~3-4k tokens, re-sent with **every**
question in that conversation. Fine for `openai/gpt-oss-120b`'s context window.

A 200-page annual report is not fine. At that size you'd be forced back to chunk + embed +
retrieve — and then you'd have to solve the `user_id` problem you just dodged.

> ⭐ **Per-request context only works because the document is small.** That's not a
> limitation you hide, it's the condition the design depends on.

---

## 2. Retrieval is a workaround, not a goal

This is the sentence to keep from today:

> **The 600/100 splitter and the vector store exist because 2106 chunks can't fit in a prompt.
> Two pages can.**

Look at what the attached-document path skips:

```
corpus question:   route → retrieve → grade → (rewrite → retrieve → grade)* → generate
attached document: route → generate
```

No embedding model. No similarity search. No relevance grader. No rewrite loop. **One LLM
call** instead of the 3-7 a corpus question costs. And the answer is *more* accurate, because
there was never a chance of fetching the wrong chunk — there is only one chunk.

> ⭐ **Interview tip.** RAG is not a feature you add because it's modern. It's a workaround
> for a context window too small to hold the knowledge. When the document fits, **skip the
> whole machine.** People who reach for a vector DB to answer questions about one PDF have
> mistaken the workaround for the goal.

---

## 3. A category the *model* doesn't decide

§8 of `CLAUDE.md` says adding a router category = one `ROUTE_PROMPT` bullet + one tuple entry
in `route_node` + re-run the substring collision check.

`Form-16` breaks that rule, on purpose.

```python
def route_node(state: GraphState):
    """Desk 0: reception. Reads the question, names the counter. Answers nothing."""

    # they attached a document: it IS the context. Nothing to classify, so no LLM call.
    if state.get("doc_text"):
        print("[route] Form-16 (attached document)")
        return {"category": "Form-16"}

    raw = llm.invoke(ROUTE_PROMPT.format(question=state["question"])).content.strip()
    ...
```

No prompt bullet. No tuple entry. No collision check — `Form-16` never goes through that loop.

Why: **the model isn't deciding this one.** Whether a document was attached is a *fact about
the request*, not a judgement about the question. There is nothing to classify.

> ⭐ **A category the model picks needs a prompt bullet. A category the request shape decides
> needs code.** Asking an LLM a question you already know the answer to is the most common way
> agentic pipelines get slow and flaky.

This is the **second** node in the graph with no `llm.invoke` — `greet_node` was the first, for
the same reason (Day 22). Same principle, stated generally:

> ⭐ **When the output doesn't depend on the model's reading of the input, don't pay for a
> model call.** Day 11 took the out-of-corpus path from 7 calls to 1 on exactly this insight.

### `.get()`, not `["doc_text"]`

```python
if state.get("doc_text"):      # not state["doc_text"]
```

`GraphState` is a `TypedDict`, which is a **type-checker fiction**. At runtime it is a plain
`dict`. Nothing enforces the keys, nothing fills in defaults. `ask()` seeds `doc_text`, but
`route_node` is also reachable from a bare `app.invoke({...})` in some future self-check — and
there, `state["doc_text"]` is a `KeyError` at runtime, not a type error at import.

`.get()` returns `None` → falsy → normal path. That's the whole reason `dict.get` exists.

---

## 4. The fall-through that was right for the wrong reason

Trace `decide_after_route` with `category == "Form-16"` **before** changing anything:

- not `"Greeting"` → skip
- not in `("GST", "Income-Tax", "TDS")` → skip
- falls to `return 'generate'` ✅

Correct destination. **Zero lines needed.** But the line above it prints:

```
[decide] no documents for Form-16 - skipping retrieval
```

Which is a lie — there *are* documents, `ask()` seeded them. So one explicit branch went in:

```python
    if state["category"] == "Form-16":
        return "generate"     # documents already in the folder - attached by ask(), not retrieved
```

Two reasons that one line is worth typing:

> ⭐ **A right answer for the wrong reason is the worst kind to leave behind.** The next person
> changes the `else` branch for a `General` reason and silently breaks Form 16. An explicit
> branch costs one line and pins the *intent*.

> ⭐ **A log line that lies is a debugging trap you set for yourself.** Day 24 cost a long
> session because four separate things stated something false — the notes, a fiscal year, the
> grader, a page number. `[decide] no documents for Form-16` would have been the fifth.

---

## 5. `ask()` — seeding the folder instead of filling it

```python
def ask(question: str, doc_text: str | None = None, filename: str | None = None) -> dict:
    """Public entry point. Returns the answer AND the citations behind it."""
    # an attached document IS the context: one Document, no splitter, no embeddings, no retrieval.
    docs = [Document(page_content=doc_text, metadata={"source": filename})] if doc_text else []

    # retries must be seeded - nodes read it before anything writes it
    result = app.invoke({"question": question, "retries": 0, "documents": docs, "doc_text": doc_text})

    # no pills on the attached-doc path: the text has no page numbers (Day 25) and the
    # user is holding the file - a citation to a document in their hand is noise.
    sources = [] if doc_text else unique_sources(result["documents"])
    return {"answer": result["answer"], "sources": sources}
```

`retrieve_node` *writes* `documents`. Here `ask()` **pre-writes** it, and the graph simply
never visits the desk that would have overwritten it. The shared-state design paid off: no new
node, no new edge, no change to `generate_node`.

### `str | None`, not `str`

The default is `None`, so the annotation must admit `None`. §14 already lists *"a Pydantic
default not covering `None`"* as a past silent bug.

### The metadata has no `page` key — and that's the lesson

Day 25 deliberately dropped page tracking (`"\n".join(page.get_text() for page in doc)`), with
a recorded reason: *no `{source, page}` on Form 16 text, because the user is holding the
document.*

So `unique_sources` — which reads `d.metadata["page"]` — can't run on this path. Three ways out:

| Option | Cost |
|---|---|
| `page: int = 0` or `page: int \| None` on the `Source` model | Loosens the contract for every consumer; `SourceCard` starts rendering "page None" |
| Invent `page: 1` | A **lie**, and a durable one — `save_message` writes it to JSONB and it survives every refresh forever |
| **Return `[]`** | Zero lines changed anywhere else |

> ⭐ **Don't fabricate data to fit a shape. Ask whether the shape is needed on that path.**
> The pill would be noise anyway: the user attached the file, they know what it is.

---

## 6. `response_model` is a two-way gate

Here's why `[]` specifically, and why it mattered more than it looks.

```python
class Source(BaseModel):
    source: str
    page: int          # required, no default
```

If `ask()` had returned `[{"source": "form16.pdf"}]`, FastAPI would validate it against
`list[Source]` **on the way out**, fail, and raise a `ValidationError` — a **500**, on a
request where the user did nothing wrong.

`[]` validates against `list[Source]` perfectly. An empty list has no items to check.

> ⭐ **Interview tip.** Most people think Pydantic guards *incoming* data. `response_model`
> guards **outgoing** data too, and the two failure modes are opposites:
> - an **extra** field is silently **dropped** (§14 has this as a real bug from Day 14)
> - a **missing required** field **raises**
>
> Know which one you're walking into.

---

## 7. Two doors into the same room need two locks

```python
class ChatRequest(BaseModel):
    question: str
    session_id: str
    # capped here because THIS is the trust boundary - /upload's 5 MB guard doesn't protect this route.
    doc_text: str | None = Field(None, max_length=200_000)
    filename: str | None = None
```

Run the Day 25 habit — **ask what the design makes possible, including for an attacker.**

`/upload` caps the file at 5 MB. But nothing forces anyone to *use* `/upload`. A `POST /chat`
carrying 50 MB of `doc_text` in a JSON body goes straight into a Groq prompt: your API key,
your bill, and a context-length error at best.

> ⭐ **A guard protects the endpoint it sits on, not the data.** The 5 MB check lives on
> `/upload` and knows nothing about `/chat`.

`Field(None, max_length=200_000)` makes Pydantic reject it with a **422 before your code
runs** — zero lines of validation logic. 200k chars ≈ 50k tokens, far past any real Form 16.

### One more thing that makes "we don't store it" true

```python
    save_message(session_id, "user", question)
    save_message(session_id, "assistant", result["answer"], result["sources"])
```

Both lines **unchanged**. That's the whole privacy design, and it's an *audit*, not an
intention: two writes on this path, neither takes `doc_text`.

> ⭐ On a real system the audit includes your **logs** — `print()` and structured logging are
> writes too. Note that `[route] Form-16 (attached document)` deliberately does **not** print
> the text.

### Field names match all the way up

`doc_text` and `filename` — same words in `ChatRequest`, `chat()`, and `ask()`. §3 records the
pain of the one place they don't match (`content` in the backend vs `text` in `Chat.jsx`, with
a `.map` as the translator). Don't open a second one for free.

> ⭐ **Optional-with-default fields are backwards compatible.** `Chat.jsx` still sends
> `{question, session_id}` and keeps working untouched — which is exactly why backend and
> frontend could be split across two sessions.

---

## 8. The bug the new test flushed out: a refusal with citations

The Form 16 asserts never got to run. This blew up first:

```
[route] Income-Tax
[grade] no
[rewrite] ...
[grade] no
[decide] giving up after 2 rewrites
[cite] no markers found - falling back to all retrieved docs
OUT-OF-CORPUS:
I don't have enough information in my documents to answer that.
SOURCES: [{'source': 'income-tax-memorandum.pdf', 'page': 12}, ...]

AssertionError: refusal must cite nothing
```

Nothing typed today touches the refusal path. **This bug was latent since Day 19.**

### Why it passed for five days and failed today

Read the first line of the log: `[route] Income-Tax`.

On Day 24 the same question routed to **`General`** — §7 even recorded it: *"passes for a
weaker reason than intended."* `General` skips retrieval → `documents` stays `[]` → `sources`
comes back `[]` → assert green, for the wrong reason.

Today the router said `Income-Tax`. So it **did** retrieve, graded `no` twice, gave up, and
reached `generate` with 4 documents in the folder. Then:

1. `generate_node` sees non-empty `documents` → makes the LLM call
2. the model correctly refuses — nothing in those docs is about professional tax
3. `split_citations` finds no `[n]` markers, because **a refusal has no facts to cite**
4. its `ponytail:` fallback fires: *"no markers = model ignored rule 3, return all docs"*
5. `generate_node` narrows `documents` to those "cited" docs
6. `unique_sources` dutifully lists all four

The user-visible result: **"I don't have enough information"** with four confident source pills
under it. Worse than a failing test — a lie to the user, and `save_message` writes it to
Postgres where it survives forever.

> ⭐ **Interview tip.** The fallback's assumption — *no markers means the model forgot to
> cite* — was true when written and false for one case it never considered: **no markers can
> also mean there was nothing to cite.** One symptom, two causes, opposite correct responses.

> ⭐ **`temperature=0` is not determinism.** Same question, same prompt, different category
> five days later. **A test whose path depends on a model's judgement will eventually take the
> other path** — which means a green suite is evidence about the paths that ran, not about the
> paths that exist.

### Where the guard goes, and why

```python
    raw = llm.invoke(messages).content
    clean, used = split_citations(raw, state["documents"])

    # a refusal has no facts, so it has nothing to cite. Without this, split_citations'
    # no-markers fallback hands back all 5 retrieved docs and the UI shows pills under
    # "I don't have enough information" - a lie, and save_message persists it.
    if REFUSAL in clean:
        return {"answer": clean, "documents": []}
```

In `generate_node` (`graph.py`), **not** in `split_citations` (`generator.py`). The reasoning,
in order:

1. **Blast radius is identical.** `grep split_citations` → one caller, `graph.py:136`. So
   there's no reuse argument either way. *(The habit matters more than the answer here: grep
   the callers before touching a shared function.)*
2. **Ownership.** `split_citations` answers exactly one question: *which docs did these markers
   point at?* It's a pure text↔docs mapper. "Refusals show no sources" is a **policy about
   what the user sees** — and `generate_node` already owns that policy, on the line directly
   below, where it narrows `documents` to the cited ones. One decision, one place.
3. **The fallback stays correct.** Weakening it would break its real job: a genuine answer
   where the model forgot rule 3 *should* still show sources. **Guard the case, don't weaken
   the rule.**

> ⭐ `REFUSAL in clean`, not `clean == REFUSAL`. The model often pads the exact string with an
> extra sentence. Day 10's rule — never `==` a model's output — is why the existing assert
> already reads `"don't have enough information" in b["answer"]`.

---

## 9. The check

```python
    # attached-document path: answer must come from the request body, not the corpus
    form16 = """FORM 16 PART B
Employee: Test Kumar
Gross Salary: 1450000
Standard Deduction: 75000
Total Tax Deducted: 112500"""
    e = ask("What is my gross salary?", doc_text=form16, filename="form16.pdf")
    print(f"FORM-16:\n{e['answer']}\nSOURCES: {e['sources']}\n")
    assert "1450000" in e["answer"].replace(",", ""), "did not read the attached document"
    assert "don't have enough information" not in e["answer"], "refused a question its own context answers"
    assert e["sources"] == [], "attached doc has no page metadata - must cite nothing"
```

Two deliberate choices:

**`.replace(",", "")` before checking.** The model may write `14,50,000` (Indian grouping),
`1,450,000` (Western), or bare digits. Stripping commas makes all three pass.
> ⭐ **Assert the fact, not the formatting** — otherwise you're testing the model's typography
> and the test flickers for no reason.

**`1450000` appears nowhere in the 9 PDFs.** That's the point. If it shows up in the answer,
the text came from the request body. The test would pass *trivially* if the number were
something the corpus already knew.

Result — and note what's missing from the trace:

```
[route] Form-16 (attached document)
FORM-16:
Your gross salary is ₹1,450,000.
SOURCES: []
```

No `[grade]`. No `[rewrite]`. No retrieval. **Asserts 36 → 39.**

### Then the contract, in Swagger

`uvicorn backend.main:app --reload` → `/docs` → `POST /chat`, once **with** `doc_text`
(→ `112500`, `sources: []`), once **without it at all**, same `session_id` (→ GST answer with
pills). The second call is the real test: it proves the new fields are genuinely optional, and
it proves `condense` doesn't derail when the history holds a Form 16 turn.

> ⭐ Swagger proves the **JSON contract** and nothing else. It proves nothing about CORS (§5) —
> that's enforced by the **browser**. Next session's test is the real browser.

---

## 10. Flashcards

| Question | Answer |
|---|---|
| Where does the Form 16 text live between the two requests? | **The browser.** Re-sent with every question; server stores nothing |
| Why not ChromaDB? | One shared store, no `user_id` — a stranger's query could retrieve your salary |
| Why not Postgres? | Works, but inherits the `session_id` debt (guess an id → read the doc) and needs a migration |
| What breaks this design? | A large document. ~2 pages fits the window; 200 pages forces chunk+embed and re-opens the `user_id` problem |
| Why no `ROUTE_PROMPT` bullet for `Form-16`? | The model isn't deciding it. Presence of bytes is a fact about the request, not a judgement |
| Which nodes make no LLM call? | `greet_node` and the `Form-16` branch of `route_node` |
| `state.get("doc_text")` vs `state["doc_text"]`? | `TypedDict` is a type-checker fiction; at runtime it's a `dict` with no defaults, so `[...]` can `KeyError` |
| Why `sources == []` on the attached path? | The text has no page metadata (Day 25) and a citation to the file in your hand is noise |
| Why not just fake `page: 1`? | It's a lie that `save_message` persists to JSONB forever |
| What does `response_model` do to an *extra* field vs a *missing required* one? | Drops it silently · raises a 500 |
| Why cap `doc_text` on `/chat` when `/upload` already caps 5 MB? | A guard protects the endpoint it sits on, not the data. Two doors, two locks |
| Why did the refusal bug hide for 5 days? | The router sent the test question to `General` (no retrieval) until today, when it picked `Income-Tax` |
| Why did `split_citations` return 4 docs for a refusal? | Its no-markers fallback assumes "model forgot to cite"; a refusal has *nothing* to cite |
| Why fix it in `generate_node` and not `split_citations`? | `split_citations` is a pure mapper; "refusals show no sources" is policy, and `generate_node` already owns that policy |

---

## 11. Self-test

1. A colleague says "just embed the Form 16 into Chroma with the rest of the corpus, it's the
   same pipeline." Give the one-sentence reason that's wrong here, and name what would have to
   exist first for it to be right.
2. `ask()` seeds `state["documents"]` and the graph never runs `retrieve_node`. Explain why no
   new node or edge was needed, in terms of how LangGraph state works.
3. `route_node` returns `{"category": "Form-16"}` without calling the model. Name the other
   node that does this and state the shared principle in one sentence.
4. You change `Source.page` to `int | None` instead of returning `[]`. List two places that
   decision shows up later.
5. The refusal bug: write the assert that would have caught it on Day 19, and say why the
   existing suite didn't.
6. `temperature=0` didn't make the router deterministic. What does that tell you about a
   green test suite in an LLM pipeline?
7. Why does `assert "1450000" in e["answer"].replace(",", "")` beat
   `assert "14,50,000" in e["answer"]`?
8. The Swagger test passed. Name one class of bug it structurally cannot catch.

---

## 12. What changed

| File | Change |
|---|---|
| `backend/rag/graph.py` | `doc_text` in `GraphState` · `route_node` short-circuit (no LLM call) · `Form-16` branch in `decide_after_route` · `ask(question, doc_text, filename)` seeds one `Document` · **refusal guard in `generate_node`** · 3 asserts |
| `backend/rag/chat.py` | `chat()` grew `doc_text`/`filename`, passes them to `ask()`. **Both `save_message` calls unchanged** |
| `backend/routes/chat.py` | `ChatRequest.doc_text` (`Field(None, max_length=200_000)`) + `filename`, both optional · route passes 4 args |

**Commits:** 2 code (`fix(rag): refusal must not cite sources` first — it's independent and
pre-existing — then `feat(rag): answer questions about an attached document`) + 1 `docs:`.
Split with `git add -p`, reading each hunk header rather than typing a memorised `n`/`y`
sequence — Day 25's lesson is that `git add -p` splits by **distance, not meaning**.

**Asserts 36 → 39.** Frontend (`<input type="file">` + `FormData` in `Chat.jsx`) is next
session — and the one gotcha waiting there: ⭐ **do not set `Content-Type` by hand**, the
browser has to write the multipart `boundary` itself.

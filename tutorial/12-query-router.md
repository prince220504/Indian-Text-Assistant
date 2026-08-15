# Tutorial 12 — The Query Router + Wiring Memory In — Week 2.5 D3

> **What you'll be able to recall after re-reading this:** what a query router is and why it sits *in front of* the expensive part; why a branch with no documents should route into an existing exit instead of a new node; why an empty string is not the same as "no evidence"; when NOT to call the LLM at all; the difference between a prompt rule and a `return`; and why memory must run before routing.
>
> **How to use this doc:** read top-to-bottom the first time. After that jump to any boxed **Analogy**, the **60-second recall**, or the **Interview flashcards**.

---

## Where this fits

```
QUERY PIPELINE
  D1  question  → retriever → 5 chunks              ✅ Tutorial 07
  D2  5 chunks  → generator → cited answer          ✅ Tutorial 08
  D3  follow-up → condense → (D1 → D2)              ✅ Tutorial 09
  W2.5 D1  the same pipeline, rebuilt as a GRAPH    ✅ Tutorial 10
  W2.5 D2  grader + retry cycle                     ✅ Tutorial 11
  W2.5 D3  router at the front + memory wired in    ▲ you are here — graph complete
```

Same file — `backend/rag/graph.py` — sixth day in a row. `retriever.py` untouched again. `generator.py` changed for the first time since Day 7, by two lines, and you'll see why.

The finished graph:

```
question
   ↓ condense()          ← chat.py, OUTSIDE the graph
 [route]  ← Desk 0, reception
   ├── GST ────────→ [retrieve] → [grade] ──yes──→ [generate] → END
   │                     ↑           │
   │                     └─[rewrite]─┘ no (max 2)
   └── Income-Tax / TDS / General ───→ [generate] → END   (empty docs → refusal)
```

---

## Concept 1 — What a router is

> **🧠 Analogy — the reception counter.** Same sarkari office. Right now every person who walks in goes straight to Desk 1, who searches the whole almirah. But the almirah only holds **GST** files.
>
> Someone walks in with a TDS question. Desk 1 still searches. Pulls 5 GST files. Checker says "wrong almirah." Desk 3 rewrites the form. Desk 1 searches again. "Wrong almirah." Rewrite. "Wrong almirah." Give up.
>
> **Five desks' worth of work to learn something the man at the door could have told you in one word.**

A **query router** is a classifier at the entrance. It reads the question, says one word — `GST` / `Income-Tax` / `TDS` / `General` — and points at a counter. It retrieves nothing, answers nothing, judges no documents.

### Why today, and not on Day 1

Because on Day 1 there was nothing to route *to*. A router is only worth its call once the branches behave differently. That happened yesterday: D2 built an expensive retry loop, and D2's run exposed its weakness — the rewrites got **longer and worse**, bolting GST vocabulary onto an income-tax question.

The instinct is to write a better rewrite prompt. That's the wrong fix.

> ⭐ **Interview tip:** the fix for a bad retry is usually not a better retry — it's **not entering the loop**. A router is a *cheap classifier in front of an expensive loop*. Same shape as a cache check, a permission check, a feature flag: fail early, where failing costs one call instead of seven.

**Measured on the exact same out-of-corpus question:**

| | after D2 | after D3 |
|---|---|---|
| LLM calls | 7 (1 route-less retrieve + 3 grade + 2 rewrite + 1 generate) | **1** (route only) |
| answer | refusal, eventually | refusal, immediately |
| refusal produced by | a prompt rule the model chose to follow | a `return` statement |

The retry loop didn't get deleted. It's still there for **GST questions worded badly** — which is what it was always for. It just stopped being handed questions it could never win.

---

## Concept 2 — What the doc-less branches do

The corpus is GST-only. So the router creates **live branches with no documents behind them**. What does the TDS branch actually do?

Tempting: add a `refuse_node` that writes a refusal message. Wrong, twice over:

1. The refusal string **already exists** inside `generator.py`'s `SYSTEM_PROMPT`, and your asserts match on it. A second copy is a second truth, and second truths drift.
2. You'd be adding a node whose entire job is to do nothing.

The actual move: route the doc-less branches **straight to `generate`, with empty documents**.

> ⭐ **Interview tip:** *don't add a branch that duplicates behaviour you already have — route into the existing one.* This is D2's "one exit, every branch must reach it," applied one level up.

Which drags a D2 bug straight back:

```python
def generate_node(state: GraphState):
    context = format_docs(state["documents"])   # ← nobody wrote this key on the TDS path
```

`TypedDict` creates nothing at runtime — no defaults, no keys. On the TDS path `retrieve_node` never runs, so `documents` was never written → **`KeyError`**. Same fix as yesterday's `retries: 0`: seed it.

```python
app.invoke({"question": question, "retries": 0, "documents": []})
```

> ⭐ **Any key a node may read before some other node writes it must be seeded at `invoke()`.** And read-before-write is decided by *all the paths*, not the happy one. Every new branch is a new chance to skip a writer.

---

## Concept 3 — The bug: an empty string is not a message

Prediction going in: empty documents → empty context → the generator's Rule 2 ("if the context does not contain the answer, refuse") fires. Clean, zero new code.

What actually came back:

```
[route] TDS
[decide] no documents for TDS - skipping retrieval
OUT-OF-CORPUS:
The TDS rate on rent under section 194I is 2% for plant and machinery,
and 10% for land and building. (Source: Income Tax Act, section 194I)
```

It hallucinated the answer **and hallucinated a citation.** Precisely what the refusal rule exists to prevent.

Why: `format_docs([])` returns `""`. So the prompt read `Context:` followed by nothing. To the model that isn't "no evidence, refuse" — it's **no instruction at all**. Rule 2 says *"if the context does not contain the answer"*, which reads as being about a context that **exists and falls short**. An absent context isn't a context that falls short.

> ⭐ **Absence and emptiness are different things.** Same bug family as null-vs-empty-list, `""` vs `None`, a missing header vs a blank one. Every layer that treats "nothing" as a value has to decide *which* nothing it means.

And note who caught it: **Day 7's assert**, written for an entirely different reason, in its first run of the day. Second time that pair has paid for itself.

---

## Concept 4 — Don't ask a model a question you already know the answer to

Prince's instinct on being asked *"should we still call Groq here?"*: **yes, because that's how the system works.**

Half right — Groq *is* the engine. The question is what it's for.

An LLM call is for **the parts you cannot decide yourself**: which words answer this, are these chunks relevant, how should this be reworded. Real judgment.

Zero documents retrieved? The answer is decided **before** the call. Sending it anyway pays money and latency for a coin flip — and this run, the coin came up hallucination.

> ⭐ **Interview tip:** *a model call is the most expensive, slowest, least deterministic branch in your program.* Use it where you have no rule. Where you do have a rule, write the rule. You don't call an API to compute `2+2`.

The deeper version, and the sentence to keep:

> ⭐ **A prompt rule is a request. A `return` is a guarantee.**

For behaviour that must never break — refusals, safety, money, auth — prefer code you control over a sentence you hope the model honours. Keep the prompt rule too (it still covers "context exists but is off-topic"), but don't let it be the *only* thing standing between you and a fabricated citation.

**Evidence from the very same session:** `generator.py`'s own refusal run now emits

```
I don't have enough information in my documents to answer that.
(Source: None of the provided sources)
```

Rule 3 ("always cite") wrestling Rule 2 ("reply *exactly*"), and the model splitting the difference. Harmless here — the assert uses `in`. But on the graph's TDS path this **cannot** happen, because there the refusal is a `return`, not a request. Prompt rules don't compose; code does.

---

## Concept 5 — One string, one home

Before the guard could be written, the refusal had to stop being prose. It lived inside `SYSTEM_PROMPT` as English. Retyping it in `graph.py` would create two copies that drift apart, while the asserts match only one.

```python
# generator.py
REFUSAL = "I don't have enough information in my documents to answer that."

SYSTEM_PROMPT = f"""...
2. If the context does not contain the answer, reply exactly: "{REFUSAL}" Do not guess.
..."""
```

One definition. The prompt *asks* the model for it; `graph.py` *returns* it directly. Change the wording once and both paths move together — including the asserts, which match a substring of it.

> ⭐ Prompts are strings, so anything you'd extract as a constant in code, extract in a prompt. `f"""` costs nothing. (Careful: `USER_PROMPT` stays a plain string — it has `{context}` / `{question}` placeholders that `.format()` fills later. Making *that* an f-string would blow up at import.)

---

## Concept 6 — Memory goes in front of everything

`chat.py` was still calling Day 7's `answer()` — the old straight line. It never saw the router, the grader, or the retry loop. Two lines:

```python
from graph import ask          # was: from generator import answer

reply = ask(standalone)        # was: answer(standalone)
```

The order is the whole lesson: `condense()` → `ask()`. Memory resolves the question **before** the router sees it.

Watch it in the run:

```
Q2: And for services?
REWRITTEN: What is the GST registration threshold for suppliers of services?
[route] GST
```

`"And for services?"` is **unroutable** — no category, no keywords, nothing to embed. After condensing it's plainly GST. Had routing run first, the router would have shrugged `General`, hit the doc-less branch, and refused a question the corpus answers perfectly.

> ⭐ **Interview tip:** memory is a *question-fixer*, not a pipeline stage. It must run before **anything** that reads the question — routing, retrieval, grading, all of them. Fix the input first, or every stage downstream reasons about the wrong sentence.

### Why condense isn't a node

`history` is a module-level global. Put it in a node and the graph starts carrying per-user state — and Week 3 will have concurrent HTTP requests sharing one list, cross-contaminating conversations. Keeping condense **outside** the graph means the graph stays stateless (any request, any user, safe), and Week 3 only has to move `history` into Postgres without touching the graph at all.

> ⭐ Push mutable per-user state to the edges of a system. The pure core stays testable and concurrency-safe.

---

## The code

```python
ROUTE_PROMPT = """You are the reception desk of an Indian tax helpdesk.

Classify the question into exactly one category:
- GST        (goods and services tax: registration, turnover, returns, input credit)
- Income-Tax (salary, deductions, slabs, ITR filing)
- TDS        (tax deducted at source, sections 194x, Form 16/26AS)
- General    (anything else, including non-tax questions)

Do not answer the question. Output only the category name, nothing else.

Question: {question}"""

def route_node(state: GraphState):
    """Desk 0: reception. Reads the question, names the counter. Answers nothing."""
    raw = llm.invoke(ROUTE_PROMPT.format(question=state["question"])).content.strip()

    # never == a model's output (Day 10). Match loosely, default to the safe branch.
    for name in ("GST", "Income-Tax", "TDS"):
        if name.lower() in raw.lower():
            category = name
            break
    else:
        category = "General"      # for/else: runs only if no break fired

    print(f"[route] {category}")
    return {"category": category}

def decide_after_route(state: GraphState):
    """Pure router. Reads the category already in state, names the next desk."""
    if state["category"] == "GST":
        return "retrieve"
    print(f"[decide] no documents for {state['category']} - skipping retrieval")
    return "generate"             # empty documents -> the refusal
```

Three details worth pausing on:

**Same three prompt rules, third time.** *Don't answer / output only the thing / be exact.* D8's condense, D10's rewrite, D11's router. That's the shape of every classifier and rewriter prompt you will ever write — the hard part is always stopping the model from being helpful.

**No `==` against raw model output** (D10's lesson). `"GST."`, `"Category: GST"`, `"**GST**"` all survive substring matching.

**`for/else`.** The `else` runs only when the loop finished **without** `break`. So an output matching nothing falls to `General` — the branch that refuses.

> ⭐ **Unknown input must land on the safe branch, never the expensive one.** Same reason a firewall default-denies.

**And `==` *is* fine in `decide_after_route`** — because there you're comparing against a value **your own node wrote**, not the model's raw text. The messy comparison already happened at the boundary.

> ⭐ **Normalise model output once, at the boundary. Everything downstream compares clean values.**

---

## Bugs of the day

| Bug | Loud or silent? | Lesson |
|---|---|---|
| 3 typos in `ROUTE_PROMPT` (`Classfiy`, `slabes`, `ITR filling`) — **zero** in Python | Silent | **Prompts are code no linter checks.** 4th session running, every typo in a string. You proofread code and skim prose. |
| `filling` vs `filing` — survived the first fix pass | Silent | **A wrong token that exists beats a wrong token that doesn't.** Same family as D9's `retriever`, D10's stale edge, D7's `page_contents`. Nothing flags a real word in the wrong place. |
| Docstring left *below* the new guard in `generate_node` | Silent | A docstring is only a docstring when it is the **first statement** in the function. Anywhere else it's a string expression that's evaluated and discarded — `__doc__` is `None`, IDE hover goes blank. |
| Empty context → hallucinated answer **and** citation | Loud (assert) | Concept 3. Mine, not yours — and the reason the assert exists. |

---

## What we deliberately skipped

| Skipped | Add when |
|---|---|
| A `refuse_node` for doc-less branches | When the UI must explain *which* category it refused and why. `generate`'s exit already carries the right string. |
| Per-category retrievers / separate collections | When income-tax and TDS PDFs actually land. The router already writes `category` — the retriever will read it and filter, and that's the whole change. |
| A cheaper router (keyword match, tiny local model) | If routing latency shows up in a profile. One Groq call at temperature 0 is fine at this scale. |
| `condense` as a graph node | Week 3, once `history` lives in Postgres keyed by session. Today it would put per-user state inside a shared graph. |
| Confidence / "ask a clarifying question" on `General` | When you have a UI that can ask. Today `General` correctly refuses. |
| An assert for the routing itself | Day 7's two asserts already force both branches — the in-corpus one can only pass through `GST`, the out-of-corpus one only through the skip path. Zero new asserts, full coverage. |

---

## 60-second recall

1. **A router is a cheap classifier in front of an expensive loop.** Fail early, where failing costs one call instead of seven.
2. **The fix for a bad retry is usually not entering the loop**, not a better retry prompt.
3. **Route doc-less branches into the exit you already have** — don't add a node that duplicates behaviour.
4. **Every new branch is a new read-before-write risk.** Seed `documents: []` exactly like `retries: 0`.
5. **An empty string is not a message.** Blank context reads as "no instruction", not "no evidence" — the model happily filled the void, citation and all.
6. **Don't call a model for an answer you already know.** Zero documents ⇒ the refusal is decided before the call.
7. **A prompt rule is a request; a `return` is a guarantee.** Guarantees for refusals, safety, money.
8. **Prompt rules don't compose** — "reply exactly" plus "always cite" produced `(Source: None of the provided sources)`.
9. **One string, one home.** `REFUSAL` as a constant, `f"""` in the prompt, `return` in the code.
10. **Normalise model output once at the boundary**; `==` is safe only against values your own code wrote.
11. **Unknown output → the safe branch.** `for/else` defaults to `General`.
12. **Memory runs before routing** — "And for services?" is unroutable until condense fixes it.
13. **Keep per-user state outside the graph** so the graph stays stateless for Week 3's concurrency.

---

## Interview flashcards

**Q: What does a query router do in an agentic RAG system, and where does it belong?**
A: It's a classifier node at the entry point that labels the question by domain and writes that label to state; a conditional edge then routes on it. It belongs in front of retrieval, because its whole value is deciding *whether* the expensive path runs at all. Downstream it also lets each branch use its own collection, retriever settings, or prompt.

**Q: Your corpus only covers one of the router's categories. What should the other branches do?**
A: Route to the existing terminal node with empty documents, so the one refusal path already in the system produces the answer. Don't add a dedicated failure node duplicating a string that already exists — one definition, one exit, and every branch still reaches it.

**Q: Empty retrieved context — will the LLM refuse?**
A: Not reliably. An empty context block reads as *no instruction*, not *no evidence*, so the model falls back on parametric knowledge — in our run it invented both an answer and a source citation. When zero documents come back the answer is already determined, so return the refusal in code instead of asking the model for it.

**Q: When should you NOT call the LLM in an LLM application?**
A: Whenever the output is already determined by a rule you can write. Model calls are the most expensive, slowest and least deterministic branch available — spend them on judgment (relevance, classification, phrasing), not on decisions your own code just made.

**Q: You need a refusal message that must never vary. Prompt rule or code?**
A: Code. A prompt rule is a request the model may reinterpret, and multiple rules interfere with each other — "reply exactly X" plus "always cite" gave us X with a fake citation stapled on. Keep the prompt rule for the fuzzy case (context exists but is irrelevant) and guarantee the deterministic case with a `return`.

**Q: Why is `==` unsafe on a model's output but safe in the routing function?**
A: The node does loose matching once, at the boundary, and writes a normalised value into state. The edge compares against that normalised value — written by our code, not the model. Normalise once at the edge of the system; compare cleanly everywhere inside.

**Q: Conversation memory and query routing — which runs first, and why?**
A: Memory. A follow-up like "And for services?" carries no topic, so a router would classify it as General and a retriever would embed nonsense. Condense resolves it into a standalone question first; every stage that reads the question needs the fixed version.

---

## Self-test

1. Delete `"documents": []` from `ask()`. Which of the two `__main__` questions still passes, and what is the exact exception on the other?
2. Swap the order in `chat()` so `ask()` runs before `condense()`. Trace what the Q2 run prints, line by line.
3. `route_node` checks `("GST", "Income-Tax", "TDS")` in that order with substring matching. Write a question that gets misrouted by the ordering. (Hint: which category names contain words the others also use?)
4. Why is `SYSTEM_PROMPT` safe to make an f-string but `USER_PROMPT` is not? What is the exact error if you convert `USER_PROMPT` too?
5. Income-tax PDFs finally land in the corpus. List every line you'd change to make the Income-Tax branch live. (Should be short — that's the point of the router.)
6. Argue the opposite side: the router costs one extra LLM call on **every** question, including the GST ones that never needed it. At what corpus/traffic mix does the router stop paying for itself?

---

**Next:** the PR for the whole `feature/langgraph-agentic-rag` branch — then Week 3, FastAPI: `main.py`, CORS, Postgres, and the chat route that finally calls `chat()` over HTTP.

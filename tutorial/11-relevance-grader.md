# Tutorial 11 — Relevance Grader + the First Conditional Edge — Week 2.5 D2

> **What you'll be able to recall after re-reading this:** why bad retrieval can't be fixed downstream; what a relevance grader does and what it must *not* do; why a retry must change its input; how a conditional edge works and why it must stay pure; why a cycle needs a counter *inside* the state; and why "giving up" must still produce an answer.
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
  W2.5 D2  grader + retry cycle                     ▲ you are here
```

Same file — `backend/rag/graph.py`. Yesterday added zero behavior on purpose. Today is where the graph earns its import: the first **cycle** and the first edge chosen at runtime by a model.

This is the payoff for a problem you saw on **Day 6** and wrote down: the retriever returns 5 chunks, hits 1–3 on topic, hits **4 and 5 drift**. You've been feeding that junk to the generator for four days.

---

## Concept 1 — Why the junk can't be fixed later

Tempting fix: tell the generator to ignore irrelevant chunks. It already does — that's what the "only use the context" rule buys you. It doesn't help.

Consider the bad case. The question is worded vaguely, so **all 5 chunks** come back useless. The generator behaves perfectly: it emits the refusal string, *"I don't have enough information in my documents."* Meanwhile the answer is sitting in your corpus, three chunks away, filed under different words.

> ⭐ This is Day 8's lesson wearing a new costume: **"the bad retrieval already happened — nothing downstream can undo it."** Day 8 fixed the *question* before retrieval. Today fixes the *result* after it, by going back and retrieving again.

The generator can only ever be as good as the chunks it's handed. To improve the answer you must improve the fetch.

---

## Concept 2 — The checker at Desk 1.5

> **🧠 Analogy — the checker.** Same sarkari office. Desk 1 (peon) pulls files from the almirah based on the words on your form. Desk 2 (officer) writes the reply.
>
> Insert a **checker between them**. He answers nothing, writes nothing, signs nothing. He looks at what the peon brought and says one word: *"correct almirah"* or *"wrong almirah, go again."*
>
> And when he says go again, he does **not** hand back the same form. He **rewrites the form in better words** first. Same form back = same files back. Forever.

Three new pieces in the graph:

| Piece | Job | What it must NOT do |
|---|---|---|
| `grade_node` | Read `state["documents"]`, ask the LLM "useful, yes/no?", write the verdict to state | Answer the question. Filter or edit the documents. |
| `decide_after_grade` | Read the verdict already in state, return the **name of the next node** | Call an LLM. Write to state. |
| `rewrite_node` | Rephrase `state["question"]`, bump `retries`, edge back to `retrieve` | Keep the wording it was given. |

Note the shape of the third one. **`rewrite → retrieve` is a cycle.** The file goes *backwards* through the office — the thing a LangChain chain (a DAG) structurally cannot do, and the reason LangGraph is in this project at all.

---

## Concept 3 — The grader

```python
GRADE_PROMPT = """You are grading whether retrieved documents are useful for answering a question.

Question: {question}

Documents:
{context}

Are these documents relevant enough to answer the question?
Answer with exactly one word: yes or no. Nothing else."""


def grade_node(state: GraphState):
    """Desk 1.5: the checker. Reads the chunks, says yes/no. Answers nothing."""
    context = format_docs(state["documents"])   # same formatter the generator uses

    prompt = GRADE_PROMPT.format(context=context, question=state["question"])
    verdict = llm.invoke(prompt).content.strip().lower()   # bare string = one human message

    print(f"[grade] {verdict}")     # so you can watch the graph decide
    return {"grade": "yes" if verdict.startswith("yes") else "no"}
```

Four decisions worth keeping:

**`format_docs` is Day 7's, untouched.** The grader sees *exactly* what the generator would see. Judging a different rendering than the one being judged is meaningless.

**One call, not five.** The LangGraph tutorial grades each document separately and filters the list. That's 5 LLM calls per turn to buy a partial filter — when the very next step is "rewrite the whole query and refetch anyway." Start coarse; split per-document later if the coarse grader proves too blunt.

**`.startswith("yes")`, never `== "yes"`.** You asked for one word. The first real run answered `no.` — with a full stop. Anything not clearly a yes falls through to `"no"`, so a garbled reply costs one retry and never a crash.

> ⭐ **Interview tip:** never string-equality a model's output. Normalise (`.strip().lower()`) and match loosely, with the safe branch as the default. A strict `==` on the happy path (`"yes."` ≠ `"yes"`) would mark *good* documents as junk and loop for nothing.

**The verdict goes into state.** Which is a concept of its own →

---

## Concept 4 — Nodes think, edges route

Why not just call the LLM inside `decide_after_grade` and skip the state key? It would still be "agentic" — the model would still be picking the path. Three practical reasons:

1. **An edge can be evaluated more than once, and LangGraph assumes it's cheap.** A network call in a router is a billable round-trip you can't see or cache.
2. **The verdict would vanish.** Inside the edge it lives in a local variable for a microsecond and is gone. In state it's a record — loggable, debuggable ("why did it retry here?"), and in Week 4 streamable to the UI as *"checking sources…"*. **A state key is a record; a local variable is a rumour.**
3. **You lose the seam.** Same lesson as Day 9's "don't wrap `answer()` as one node." A node can be tested, replaced, or re-run alone. Logic buried in an edge can only be exercised by running the whole graph.

> ⭐ **Interview tip:** *"Nodes do work and leave evidence in state. Edges only read that evidence and name the next node."*

Hence one extra key in `GraphState`:

```python
class GraphState(TypedDict):
    question: str               # what the user asked (rewrite_node may change this)
    documents: List[Document]   # chunks the retriever fetched
    answer: str                 # final cited answer
    retries: int                # how many times we've rewritten + retried
    grade: str                  # "yes"/"no" - the grader's verdict, read by the edge
```

---

## Concept 5 — A retry that doesn't change its input is an infinite loop

Retrieval is embedding similarity. Same string in → same vector → same neighbours → **the same 5 chunks, every time, forever.** So the loop body isn't "try again", it's "ask differently, then try again".

```python
REWRITE_PROMPT = """The following question did not retrieve useful documents from a
corpus of Indian government tax documents.

Rewrite it to be more likely to match that corpus: use formal tax vocabulary
(turnover, threshold, supplier, registration, exemption) and be specific.

Do not answer the question. Output only the rewritten question, nothing else.

Original question: {question}"""


def rewrite_node(state: GraphState):
    """Desk 3: the form was worded badly. Rewrite it and send the file back to Desk 1."""
    better = llm.invoke(REWRITE_PROMPT.format(question=state["question"])).content.strip()

    print(f"[rewrite] {better}")
    # bump the counter here - this node runs exactly once per loop trip
    return {"question": better, "retries": state["retries"] + 1}
```

**What "better words" means here:** the user writes *"do I need to register?"* — vague, embeds near nothing in particular. Your corpus is written in government English: *turnover*, *threshold*, *aggregate*, *supplier of goods*. The rewrite drags the question toward that vocabulary.

Same family as Day 8's condense — an LLM call whose entire output *becomes the next query* — so the same three prompt rules apply, and for the same reasons: **don't answer it**, **output only the question**, **no preamble** (a `"Sure! Here's..."` would get embedded and searched for).

---

## Concept 6 — The counter lives in the state

A cycle can spin forever: retrieve → "no" → rewrite → retrieve → "no" → …

LangGraph has a `recursion_limit` (default 25) that eventually **throws**. That's a crash, not a decision — a smoke alarm, not a plan. So you bound it yourself.

```python
MAX_RETRIES = 2     # loop guard. LangGraph's recursion_limit is only a backstop.

def decide_after_grade(state: GraphState) -> str:
    """Pure router. Reads the verdict already in state, names the next desk."""
    if state["grade"] == "yes":
        return "generate"

    if state["retries"] >= MAX_RETRIES:
        # out of tries - let the generator produce its honest refusal
        print(f"[decide] giving up after {state['retries']} rewrites")
        return "generate"

    return "rewrite"
```

Two placement rules, both easy to get wrong:

**Why the counter is in state, not a module-level variable.** Nodes are stateless functions; the state dict is the *only* thing that survives between them. A global would also be shared across every concurrent user in Week 3 — one user's retries would exhaust another's budget.

**Why `rewrite_node` bumps it, not the router.** The router runs on **every** pass and only reads. `rewrite_node` runs **only when a lap actually happens** — so incrementing there counts trips exactly. ⭐ *Count where the trip happens, not where it's checked.*

---

## Concept 7 — Giving up must still produce an answer

The failure branch returns **`"generate"`, not `END`**. This looks wrong until you trace it.

Return `END` and the graph halts with `answer` **never written** — no node has run that writes it. Then `ask()` does `result["answer"]` on a state with no such key → **`KeyError`**. The program crashes on precisely the case the feature exists to handle.

Return `"generate"` and the generator runs with the junk it has, finds nothing relevant, and emits the exact refusal you built on Day 7.

> ⭐ **Interview tip:** *"A user-facing pipeline has one exit, and every branch must reach it. Failure is a kind of answer, not a skipped answer."*

And note what it reuses: no `fail_node`, no separate error path, no new refusal string. The generator already knows how to say "I don't know" — the give-up branch just walks into it.

---

## Concept 8 — Wiring, and the key you must seed

```python
workflow = StateGraph(GraphState)

workflow.add_node("retrieve", retrieve_node)
workflow.add_node("grade", grade_node)
workflow.add_node("rewrite", rewrite_node)
workflow.add_node("generate", generate_node)

workflow.set_entry_point("retrieve")
workflow.add_edge("retrieve", "grade")      # always check before answering

workflow.add_conditional_edges(
    "grade",                # from this node
    decide_after_grade,     # run this to pick the next one
    {"generate": "generate", "rewrite": "rewrite"},   # returned string -> node name
)

workflow.add_edge("rewrite", "retrieve")    # the cycle: back to Desk 1 with new words
workflow.add_edge("generate", END)          # file leaves the office

app = workflow.compile()
```

```
        ┌──────────────────────────────┐
        │                              │
        ▼                              │
   [retrieve] ──► [grade] ──?──► [rewrite]
                     │
                     └──?──► [generate] ──► END
```

**That third argument is a mapping**, `{returned_string: node_name}`. Here it's identity and looks redundant — it exists so a router can return *domain* words (`"good"` / `"junk"`) decoupled from node names. Same string-indirection idea as Day 9.

**`retrieve` now points at `grade`, not `generate`.** That seam is exactly why Day 9 refused to wrap `answer()` as a single node. Yesterday's restraint bought today's insertion for free.

And the one line in `ask()`:

```python
def ask(question: str) -> str:
    # retries must be seeded - nodes read it before anything writes it
    result = app.invoke({"question": question, "retries": 0})
    return result["answer"]
```

> ⭐ **Interview tip:** a `TypedDict` is a dict with type hints — **it creates no keys and no defaults at runtime**. Any state key a node *reads before writing* must be seeded at invoke time. Write-only keys (`documents`, `answer`, `grade`) are fine unseeded.

---

## The self-check that stays (again)

**Zero new asserts today.** The Day 7 pair still covers it, and now covers more:

```python
if __name__ == "__main__":
    a = ask("What is the GST registration threshold?")
    assert "Source:" in a, "expected a citation"

    b = ask("What is the TDS rate on rent under section 194I?")
    assert "don't have enough information" in b, "model hallucinated outside its corpus"
```

The out-of-corpus question is now **forced** to walk the entire new path: junk retrieved → graded no → rewrite → retry → no again → `MAX_RETRIES` hit → generate → refusal. Assert #2 passing proves the cycle **and** the guard, for free.

### Actual run

```
[grade] yes
IN_CORPUS:
The GST registration threshold for suppliers of services is Rs. 20 lakhs, and Rs. 10 lakhs
in certain cases, such as in the States of Manipur, Mizoram, Nagaland, and Tripura. For
suppliers of goods, the threshold is Rs. 40 lakhs, and Rs. 20 lakhs in certain cases.
(Source: gst-concept-2019.pdf, page 46)

[grade] no.
[rewrite] What is the rate of Tax Deducted at Source (TDS) applicable to payments of rent,
as per the provisions of Section 194I of the Income-tax Act, 1961, and are there any
exemptions or threshold limits below which a supplier of rental services is not required
to register for tax purposes or deduct TDS on such payments?
[grade] no.
[rewrite] ...considering the registration threshold and exemption limits prescribed for
small suppliers of rental services?
[grade] no.
[decide] giving up after 2 rewrites
OUT-OF-CORPUS:
I don't have enough information in my documents to answer that.
(Source: gst-concept-2019.pdf, gst-faq.pdf)

OK - graph matches the Day 7 pipeline
```

Three things the output proves without an assert:

1. **The happy path costs exactly +1 LLM call.** `[grade] yes` → straight to generate. That flat tax is the price of the whole feature.
2. **The guard fired precisely.** Three grades, two rewrites, then a *decision* to stop — not a recursion-limit exception.
3. **`.startswith()` earned its keep on the very first run:** `[grade] no.` came back with a full stop attached.

---

## The honest weakness (read the rewrites)

They got **longer and worse**. Rewrite 2 bolted on *"annual turnover"*, *"Goods and Services Tax"*, *"small suppliers of rental services"* — dragging an **income-tax** question toward **GST** vocabulary, because `REWRITE_PROMPT` names GST-flavoured words and the corpus behind them. Each lap compounds the drift, exactly like Day 8's warning about storing the rewrite instead of the original.

Two readings, both true:

- **This run was unwinnable.** The corpus is GST-only; no TDS document exists to find. No rewrite could ever succeed, so "give up after 2" is the *correct* outcome and the drift cost nothing real.
- **The mechanism is genuinely weak, and D3 fixes it properly.** The right answer to "TDS question, GST corpus" isn't *rewrite harder* — it's the **query router** declining to send it down a branch with no documents behind it. Rewriting is for badly-worded questions, not for questions about things you don't have. Today's node can't tell those apart.

Which is why `MAX_RETRIES = 2` is not optional: it's the only thing stopping a doomed loop from embarrassing itself.

---

## The bugs that day (worth remembering)

**1. Three typos, all inside triple-quoted prompts, none in Python.** Third session running with that exact pattern (Day 8: `noting else`; Day 9: clean code, prompt typos). Cause is mechanical: the editor red-underlines code, never strings.

> ⭐ **Prompts are code that no linter checks.** Reread them like code.

**2. Registered the wrong node names.** `add_node("generate", generate_node)` appeared twice and `grade_node` was never registered — from *editing* yesterday's lines instead of replacing the block. This one at least fails loudly at `.compile()`: an edge names `"grade"`, no such node.

**3. The dangerous one — `add_edge("retrieve", "generate")` left in place** where `add_edge("rewrite", "retrieve")` belonged. Both node names are real, so **it compiles and runs**. It just silently wires the checker out of the loop.

> ⭐ Same family as Day 9's `retriever` and Day 7's `page_contents`: **a wrong thing that exists is worse than one that doesn't.** The debugging habit that catches all three: list every name you `add_node`, list every name your edges mention, compare the two lists.

---

## What was deliberately skipped

| Skipped | Add when |
|---|---|
| Per-document grading (filter the 5 down) | If the one-shot grader proves too blunt. 5× the calls for a partial filter, when the next step refetches everything anyway. |
| A dedicated `fail_node` / distinct "gave up" message | When the UI needs to explain *why* it gave up. The generator's existing refusal is a correct answer today. |
| Structured output / function-calling for the yes-no | `.strip().lower().startswith()` is 3 method calls vs a schema. Add when the grader needs to return reasons too. |
| The query router | W2.5 D3 — and it's the real fix for the rewrite-drift above. |
| Wiring `chat.py`'s condense in | W2.5 D3, at the front of the graph. |

---

## 60-second recall

1. **Bad retrieval can't be patched downstream** — the generator only ever sees the chunks it was handed. Fix the fetch.
2. **The grader judges, never answers.** It reads documents, writes one word to state.
3. **Nodes think and leave evidence in state; edges only read state and name the next node.**
4. **A retry that doesn't change its input is an infinite loop with extra steps.** Same query → same embedding → same chunks.
5. **The retry counter lives in the state**, because state is the only thing that survives between nodes (and won't be shared across users later).
6. **Bump the counter in the node that causes the lap**, not in the router that merely checks it.
7. **Giving up returns `"generate"`, not `END`** — `END` skips the only node that writes `answer`, so `result["answer"]` raises `KeyError`. Failure is a kind of answer.
8. **`recursion_limit` is a backstop, not a plan.** Bound your own loops.
9. **Never `==` a model's output.** Normalise and match loosely, with the safe branch as default.
10. **Seed every state key that gets read before it's written.** `TypedDict` creates nothing at runtime.
11. **This is the first genuinely agentic step:** the model, not an `if` you wrote, chooses the edge.

---

## Interview flashcards

**Q: What is a relevance grader in agentic RAG and why does it exist?**
A: A node between retrieval and generation that asks an LLM whether the retrieved chunks can actually answer the question. It exists because vector similarity returns the *nearest* chunks, never necessarily *relevant* ones — top-k always returns k results, even when the corpus has nothing. Without a grader the generator either works around junk or refuses while the answer sits three chunks away under different wording.

**Q: Why rewrite the query on failure instead of just retrieving again?**
A: Retrieval is deterministic on the input string — same query, same embedding, same neighbours. Retrying unchanged is an infinite loop. The rewrite moves the question toward the corpus's vocabulary, which is the only variable that changes what comes back.

**Q: How do you stop an agentic retry loop from running forever?**
A: A counter in the graph state, incremented by the node that causes the lap, checked by the conditional edge against a max. LangGraph's `recursion_limit` is a backstop that throws — a crash, not a decision. And the counter must be in state, not a global, so it doesn't leak across concurrent sessions.

**Q: Why keep the LLM call in a node instead of in the conditional edge?**
A: Edges are assumed cheap and can be evaluated repeatedly; a network call there is invisible cost. Worse, the verdict wouldn't be recorded in state — nothing to log, debug, or stream to a UI. Nodes do work and leave evidence; edges route on that evidence.

**Q: What should the "give up" branch of a retry loop do?**
A: Route to the node that produces the user-facing answer, not to `END`. `END` leaves the answer key unwritten and the caller blows up on a missing key. Every branch must reach the single exit — failure is a kind of answer, and the generator's grounded refusal already is one.

**Q: Grade each document separately or all at once?**
A: Per-document gives a usable filter and costs k calls per turn; one-shot costs a single call and only tells you go/no-go. If the failure response is "rewrite and refetch everything anyway", one-shot is the right trade. Split it when you want to keep the good 3 of 5 rather than discard all 5.

---

## Self-test

1. Set `MAX_RETRIES = 0` and predict the out-of-corpus run's output *exactly*, line by line, including which `print`s appear.
2. Change the give-up branch to return `END`. What is the exact exception, and on which line of `ask()`?
3. `rewrite_node` returns `{"question": better}` — it overwrites the user's original wording in state. Which Day 8 lesson does that violate, and why is it tolerable here but not in `chat.py`?
4. If `grade_node` used `verdict == "yes"` instead of `.startswith()`, describe a run where good documents get thrown away.
5. Delete `"retries": 0` from `ask()`. Which question (in-corpus or out) still passes, and why does only one of them crash?
6. Argue the opposite side: the corpus is GST-only, so no rewrite can ever rescue a TDS question. Is `rewrite_node` dead weight today? What does it actually buy before D3's router lands?

---

**Next:** W2.5 D3 — the **query router** (GST / Income-Tax / TDS / General), wiring `chat.py`'s condense step in at the front, and the PR.

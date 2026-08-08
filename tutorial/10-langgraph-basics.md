# Tutorial 10 — LangGraph Basics (state, nodes, edges) — Week 2.5 D1

> **What you'll be able to recall after re-reading this:** what a state graph is and why LLM apps need one; the four pieces of LangGraph (state, node, edge, conditional edge); why a node returns only the keys it changed; why node names are strings and not function references; where to split a pipeline into nodes; and what "agentic" actually means.
>
> **How to use this doc:** read top-to-bottom the first time. After that jump to any boxed **Analogy**, the **60-second recall**, or the **Interview flashcards**.

---

## Where this fits

Week 2 finished a working RAG pipeline, three stateless components stacked up:

```
QUERY PIPELINE
  D1  question  → retriever → 5 chunks           ✅ Tutorial 07
  D2  5 chunks  → generator → cited answer       ✅ Tutorial 08
  D3  follow-up → condense → (D1 → D2)           ✅ Tutorial 09
  ──────────────────────────────────────────────
  W2.5  the same pipeline, rebuilt as a GRAPH    ▲ you are here
```

New file — `backend/rag/graph.py`. Today it adds **zero new behavior**. It rewires what already works into a graph, and proves it by reusing Day 7's exact asserts. Tomorrow the grader and the retry loop go in — and they only fit because of the wiring done today.

---

## Concept 1 — The govt office file

> **🧠 Analogy — the sarkari file folder.** You submit a form at a government office. A physical file folder is created for it. It moves desk to desk: a clerk stamps it, a verifier checks it, an officer signs it.
>
> Two things make this work:
>
> 1. **The file carries everything.** Desk 3 never phones Desk 1. Whatever Desk 1 knew, it wrote *into the file*. The file is the only memory in the building.
> 2. **A desk can send it back.** The verifier finds a mistake → the file goes *back* to the clerk's desk, not forward. Same file, second lap.
>
> That is a state graph. The file = **state**. Each desk = **node**. The arrows = **edges**. "Send it back if it's wrong" = **conditional edge**.

---

## Concept 2 — Why not just write Python?

Honest question, and you should be suspicious of every framework that can't answer it.

The Day 6→8 pipeline is a straight line, and plain functions handle straight lines perfectly. Week 2.5 adds a **cycle**: grade the retrieved chunks → if they're junk, rewrite the query → retrieve *again*. You can absolutely write that as a `while` loop. Nothing stops you.

Here's what the `while` loop costs you as nodes get added:

| | Plain Python | LangGraph |
|---|---|---|
| Passing data | Thread 6 arguments through 5 functions; every caller must know its callee's signature | One typed dict; nodes never call each other |
| Branching | `if` inside the caller — the caller now knows the whole topology | Conditional edge returns a label; the graph routes |
| Showing progress in the UI | A loop can't say where it is | Stream per-node events → "Routing… Retrieving… Rewriting…" |
| Infinite retry | Write your own counter, remember to check it | Recursion limit built in |
| Inspecting the design | Read the code and simulate it in your head | The graph is data — print it, draw it, trace it |

The theme underneath all five rows: **the graph is a description, not control flow.** Once the shape of your app is data rather than nesting, things you couldn't do to an `if` become easy.

> **Rule of thumb:** straight line → plain functions are correct, don't import anything. The moment there's a **cycle or a decision an LLM makes**, you want a graph.

---

## Concept 3 — Why state, not arguments

You already met this lesson on Day 8, in a different costume. Say it precisely:

Arguments are fine while the path is a straight line: `retrieve(q)` → `generate(q, docs)`. They break the moment the path **branches**. If `grade` can send the file to `rewrite` *or* to `generate`, every node needs to know its possible successors and their signatures — and adding a node means editing the nodes around it.

With shared state, **no node knows any other node exists.** Each one reads the folder, stamps its box, drops it back. Routing is the graph's job, not the node's.

> ⭐ **Interview tip:** *"Arguments couple caller to callee. Shared state decouples them — that's what lets you rewire the graph without touching node code."*

---

## Concept 4 — The four pieces (this is all of LangGraph)

| Piece | What it is | In our app |
|---|---|---|
| **State** | A `TypedDict`. The file folder. Fixed shape. | `{question, documents, answer}` |
| **Node** | A plain Python function, `state → dict` | `retrieve_node`, `generate_node`, later `grade`, `rewrite`, `route` |
| **Edge** | A fixed arrow. Always A → B. | `retrieve → generate` |
| **Conditional edge** | A function `state → "name of the next node"` | tomorrow: grade says `"generate"` or `"rewrite"` |

That's the whole API surface worth knowing. Everything else is convenience on top.

```python
class GraphState(TypedDict):
    """The file folder that moves desk to desk.

    Every node gets this whole dict and returns only the keys it changed.
    """
    question: str               # what the user asked
    documents: List[Document]   # chunks the retriever fetched
    answer: str                 # final cited answer
```

**Two rules that trip everyone:**

1. **A node returns only what it changed** — `return {"documents": docs}`, not the whole state. LangGraph merges it in. You stamp one box on the form; you don't rewrite the form.
2. **Nodes take no argument except state.** Need the question? `state["question"]`. The file-carries-everything rule, enforced by the framework.

---

## Concept 5 — The nodes

```python
def retrieve_node(state: GraphState):
    """Desk 1: fetch chunks for the question, stamp them into the file."""
    docs = retrieve(state["question"])   # Day 6 component, unchanged
    return {"documents": docs}           # only the key we changed


def generate_node(state: GraphState):
    """Desk 2: read the chunks already in the file, write a cited answer."""
    context = format_docs(state["documents"])

    messages = [
        ("system", SYSTEM_PROMPT),
        ("human", USER_PROMPT.format(context=context, question=state["question"])),
    ]

    return {"answer": llm.invoke(messages).content}
```

Notice what these two functions are: **the body of Day 7's `answer()`, cut in half.** Nothing new was written. `retriever.py` and `generator.py` were not edited at all — the graph imports `retrieve`, `format_docs`, `SYSTEM_PROMPT`, `USER_PROMPT` and `llm` and reuses them as they are. Four days of stateless components, zero rewrites. That's the payoff for keeping them stateless.

### Why not make `answer()` a single node?

It would work today. It blocks you tomorrow.

`answer()` welds retrieve and generate into one function. The grader has to sit **between** those two steps — look at the chunks, then decide. If they're fused there is no seam to insert it at.

> ⭐ **Interview tip:** *"Node granularity = wherever you might need to branch."* Too coarse and you can't route; too fine and the graph is noise. **Split at decision points.**

---

## Concept 6 — Wiring, and the compile seam

```python
workflow = StateGraph(GraphState)

workflow.add_node("retrieve", retrieve_node)   # "name in graph" -> function
workflow.add_node("generate", generate_node)

workflow.set_entry_point("retrieve")   # where the file gets created
workflow.add_edge("retrieve", "generate")
workflow.add_edge("generate", END)     # file leaves the office

app = workflow.compile()               # description -> runnable
```

Three things worth burning in:

**Node names are strings.** `"retrieve"` is the label the graph routes on; `retrieve_node` is the code. They are deliberately not the same thing. A function *reference* would mean the grader holds its successor's code — coupling again. A string means the grader knows only a label and the graph resolves it, the same reason web routes are `"/users"` and not a pointer to a handler. Bonus: strings serialize, so they're what shows up in streaming and tracing — Week 4's "Retrieving…" indicator reads these exact labels.

**`.compile()` is the seam.** Before it, you are *describing* a graph and may add nodes and edges in any order. After it, you hold an immutable runnable. **Describe → compile → invoke.**

**`END` is a sentinel** LangGraph gives you — "file leaves the office, no next desk."

```python
def ask(question: str) -> str:
    """Public entry point. Same signature as Day 7's answer()."""
    result = app.invoke({"question": question})   # seed the file with one key
    return result["answer"]                       # full final state comes back
```

You seed **only `question`**. The other two keys don't exist yet; each node fills its own as the file moves along. And `invoke` hands back the **entire final state**, not just the last node's return value — hence `result["answer"]`.

---

## Concept 7 — What "agentic" means

Everything above is still a fixed pipeline drawn in a new notation. The word *agentic* only becomes true tomorrow, when the grader's conditional edge decides where the file goes next.

> **A pipeline is agentic when an LLM chooses the edge — not when an `if` you wrote chooses it.**

That's the definition, and it's the whole distinction between a chain and an agent.

> ⭐ **Interview tip:** *"A LangChain chain is a DAG — data flows one way, no cycles. LangGraph is a state machine — cycles allowed. It's agentic when the model picks the transition."*

---

## The self-check that stays

The same two asserts as Day 7. That is the point, not laziness: if the graph is wired correctly it must behave **identically** to `answer()`. Reusing the old signals is the cheapest possible proof that a rewiring didn't change behavior.

```python
if __name__ == "__main__":
    # happy path: graph must produce the same cited answer as Day 7's answer()
    a = ask("What is the GST registration threshold?")
    print(f"IN-CORPUS:\n{a}\n")
    assert "Source:" in a, "expected a citation"

    # refusal path: graph must not leak the model's own tax knowledge
    b = ask("What is the TDS rate on rent under section 194I?")
    print(f"OUT-OF-CORPUS:\n{b}\n")
    assert "don't have enough information" in b, "model hallucinated outside its corpus"

    print("OK - graph matches the Day 7 pipeline")
```

### Actual run

```
IN-CORPUS:
The GST registration threshold for suppliers of services is Rs. 20 lakhs, and Rs. 10 lakhs
in certain cases, such as in the States of Manipur, Mizoram, Nagaland, and Tripura. For
suppliers of goods, the threshold is Rs. 40 lakhs, and Rs. 20 lakhs in certain cases.
(Source: gst-concept-2019.pdf, page 46)

OUT-OF-CORPUS:
I don't have enough information in my documents to answer that.
(Source: None of the provided sources)

OK - graph matches the Day 7 pipeline
```

Both paths behave exactly as they did on Day 7. **A refactor is proven by tests that didn't change.**

---

## The bug that day (worth remembering)

First version imported the wrong name:

```python
from retriever import retriever      # ← the retriever OBJECT
...
docs = retriever(state["question"])  # TypeError at runtime
```

`retriever.py` contains **two** similarly named things: the retriever object (`vectorstore.as_retriever(...)`) and the `retrieve()` wrapper function around it. The import **succeeds** — that name really does exist in the module. It just isn't callable with `(query)`.

> ⭐ **Interview tip:** same lesson as Day 7's `page_contents` typo. Python checks that a name exists, never that it's callable or the right shape. **A wrong name that exists is worse than one that doesn't** — it survives one extra layer before exploding.

---

## What was deliberately skipped

| Skipped | Add when |
|---|---|
| Conditional edges / the grader | Tomorrow (W2.5 D2) — it's the whole point of the week. |
| The router node | W2.5 D3. Also blocked on the corpus: routing to Income-Tax/TDS branches is pointless while only GST PDFs are ingested. |
| Wiring `chat.py`'s condense step in | After the graph is complete. Memory belongs at the front; adding it mid-refactor hides which change broke what. |
| Checkpointers / persistence / streaming | Week 3–4, when there's a session and a UI to need them. |

---

## 60-second recall

1. **A state graph is a file moving desk to desk.** The file carries everything; a desk can send it back.
2. **Four pieces:** state (TypedDict), node (`state → dict`), edge (fixed arrow), conditional edge (`state → next node's name`).
3. **A node returns only the keys it changed.** LangGraph merges it into the state.
4. **Nodes take no arguments except state.** Anything they need was written into the file upstream.
5. **Arguments couple caller to callee; state decouples them.** That's what makes rewiring cheap.
6. **Split into nodes at decision points** — wherever you might one day need to branch.
7. **Node names are strings** so routing is by label, not by code reference — and labels serialize into traces and UI.
8. **`.compile()` is the seam:** describe → compile → invoke.
9. **Seed only what you know** (`{"question": ...}`); `invoke` returns the whole final state.
10. **Agentic = the LLM picks the edge.** A graph with only fixed edges is still just a pipeline.

---

## Interview flashcards

**Q: What is LangGraph and when would you use it over a chain?**
A: LangGraph models an LLM app as a state machine — a typed shared state, nodes that read and write it, and edges (some conditional) between them. A LangChain chain is a DAG: one direction, no cycles. You reach for a graph when the app has cycles or decisions — retry after a quality check, tool loops, human-in-the-loop. For a straight line, plain functions are the right answer and a graph is overhead.

**Q: What makes a RAG system "agentic"?**
A: The control flow isn't fixed. An LLM decides what happens next — which route to take, whether the retrieved documents are good enough, whether to rewrite the query and try again. If every transition is an `if` you wrote, it's a pipeline no matter what library drew it.

**Q: Why does state live in a shared dict instead of function arguments?**
A: Arguments couple each node to its successor's signature, so branching means every node must know the topology. A shared state means nodes are independent of each other and the graph owns routing — you can rewire it without editing node code.

**Q: Why does a node return a partial dict?**
A: LangGraph merges the returned keys into the state. Returning only what changed keeps nodes small and makes concurrent/parallel nodes possible without them clobbering each other's fields.

**Q: How do you decide where one node ends and the next begins?**
A: At decision points. If you might ever need to branch, retry, or show progress between two steps, they're two nodes. Fusing retrieve and generate into one node makes it impossible to insert a relevance grader between them.

**Q: How do you stop an agentic loop from running forever?**
A: A retry counter in the state checked by the conditional edge, plus LangGraph's built-in recursion limit as the backstop. Bound it in the design, don't rely only on the framework's ceiling.

---

## Self-test

1. Change `generate_node` to `return {"documents": [], "answer": ...}`. Predict what breaks — and what *doesn't*.
2. Add the edges in a different order (`generate → END` before `retrieve → generate`). Does it still work? Why does the answer tell you something about what `.compile()` does?
3. `ask()` seeds only `question`. What happens if a node reads `state["answer"]` before anything has written it?
4. You want a "Retrieving… Generating…" indicator in the UI. Why is that easy with a graph and hard with a `while` loop?
5. Sketch tomorrow's graph on paper: five nodes, and mark which arrow is conditional.
6. Argue the opposite side: for *this* two-node linear graph specifically, is LangGraph justified today? What exactly are you paying for it right now, and what are you buying?

---

**Next:** W2.5 D2 — the **relevance grader** and the first conditional edge. The junk hits 4 and 5 from Tutorial 07 finally get dealt with.

"""LangGraph version of the RAG pipeline. Nodes read/write one shared state."""

from typing import TypedDict, List
from langchain_core.documents import Document
from langgraph.graph import StateGraph, END
from .retriever import retrieve
from .generator import format_docs, SYSTEM_PROMPT, USER_PROMPT, llm, REFUSAL, split_citations, CITE_RE

class GraphState(TypedDict):
    """The file folder that moves desk to desk.
    
    Every node gets this whole dict and returns only the key it changed.
    """
    question: str       # what the user asked
    documents: List[Document]   # chunks the retriever fetched
    answer: str        # final cited answer
    retries: int       # how many times we've rewritten + retried
    grade: str         # "yes"/"no" the grader's verdict, read by the edge
    category: str      # "GST"/"Income-Tax"/"TDS"/"General" - which counter this question belongs at

GRADE_PROMPT = """You are grading whether retrieved documents are useful for answering a question.

Question: {question}

Documents:
{context}

Are these documents relevant enough to answer the question?
Answer with exactly one word: yes or no. Nothing else."""

ROUTE_PROMPT = """You are the reception desk of an Indian tax helpdesk.

Classify the question into exactly one category:
- GST   (goods and services tax: registration, turnover, returns, input credit)
- Income-Tax   (salary, deductions, slabs, ITR filing)
- TDS   (tax deducted at source, sections 194x, Form 16/26AS)
- General   (anything else, including non-tax questions)

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

# corpus is GST-only today. other categories have live branches with no documents
# behind them - send them straight to the refusal instead of burning a retry loop.
def decide_after_route(state: GraphState):
    """Pure router. Reads the category already in state, names the next desk."""
    if state["category"] == "GST":
        return "retrieve"

    print(f"[decide] no documents for {state['category']} - skipping retrieval")
    return 'generate'    # empty documents -> generator's own refusal

def retrieve_node(state: GraphState):
    """Desk 1: fetch chunks for the question, stamp them into the file."""
    docs = retrieve(state["question"])     # Day 6 component, unchanged
    return {"documents": docs}      # only the key we changed

def grade_node(state: GraphState):
    """Desk 1.5: the checker. Reads the chunks, says yes/no. Answer nothing."""
    context = format_docs(state["documents"])     # same formatter the generator uses

    prompt = GRADE_PROMPT.format(context=context, question=state["question"])
    verdict = llm.invoke(prompt).content.strip().lower()     # bare string = one human message

    print(f"[grade] {verdict}")       # so you can watch the graph decide
    return {"grade": "yes" if verdict.startswith("yes") else "no"}

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

def generate_node(state: GraphState):
    """Desk 2: read the chunks already in the file, write a cited answer."""
    context = format_docs(state["documents"])

    # zero documents: the answer is already decided. Don't pay for a call we know the answer to.
    if not state['documents']:
        return {"answer": REFUSAL}

    messages = [
        ("system", SYSTEM_PROMPT),
        ("human", USER_PROMPT.format(context=context, question=state["question"])),
    ]

    raw = llm.invoke(messages).content
    clean, used = split_citations(raw, state["documents"])

    # narrowing documents here is deliberate: after this desk the folder holds
    # the chunks we CITED, not the 5 we fetched. unique_sources() reads it as-is.
    return {"answer": clean, "documents": used}

MAX_RETRIES = 2       # loop guard. LangGraph's recursion_limit is only a backstop.

def decide_after_grade(state: GraphState):
    """Pure router. Reads the verdict already in state, names the next desk."""
    if state["grade"] == "yes":
        return "generate"

    if state["retries"] >= MAX_RETRIES:
        # out of tries - let the generator produce its honest refusal
        print(f"[decide] giving up after {state['retries']} rewrites")
        return "generate"

    return "rewrite"
    
# --- wire the desks together -------------------------------------------
workflow = StateGraph(GraphState)

workflow.add_node("retrieve", retrieve_node)       # "name in graph"  -> function
workflow.add_node("grade", grade_node)
workflow.add_node("rewrite", rewrite_node)
workflow.add_node("generate", generate_node)
workflow.add_node("route", route_node)

workflow.set_entry_point("route")    # where the file gets created
workflow.add_edge("retrieve", "grade")   # always check before answering

workflow.add_conditional_edges(
    "route",
    decide_after_route,
    {"retrieve": "retrieve", "generate": "generate"},
)

workflow.add_conditional_edges(
    "grade",          # from this node
    decide_after_grade,    # run this to pick the next one
    {"generate": "generate", "rewrite":"rewrite"},      # returned string -> node name
)

workflow.add_edge("rewrite", "retrieve")       # the cycle: back to Desk 1 with new words
workflow.add_edge("generate", END)      # file leaves the office

# compile once at import time - turns the description into a runnable
app = workflow.compile()

def unique_sources(docs):
    """Pull {source, page} off each chunk's metadata, drop duplicates, keep order.
    
    Day 4 stamped this metadata on. We read it - the model never retypes it.
    """
    seen = []
    for d in docs:
        s = {"source": d.metadata["source"], "page": d.metadata["page"]}
        if s not in seen:        # 5 docs max - a list scan is cheaper than making dicts hashable
            seen.append(s)
    return seen

def ask(question: str) -> dict:
    """Public entry point. Returns the answer AND the citations behind it."""
    # retries must be seeded - nodes read it before anything writes it 
    result = app.invoke({"question": question, "retries": 0, "documents": []})    # seed the file with one key
    # documents is seeded to [] so this key always exists - refusal path just yields no sources
    return {"answer": result["answer"], "sources": unique_sources(result["documents"])}      # full final state comes back

if __name__ == "__main__":
    # happy path: graph must produce the same cited answer as Day 7's answer()
    a = ask("What is the GST registration threshold?")
    print(f"IN_CORPUS:\n{a['answer']}\nSOURCES: {a['sources']}\n")
    assert a["sources"], "no citation returned"      # our code guarantees this
    assert all(s["source"].endswith(".pdf") for s in a["sources"]), "bad filename"
    assert not CITE_RE.search(a["answer"]), "marker must be stripped before the user sees it"

    # refusal path: graph must not leak the model's own tax knowledge
    b = ask("What is the TDS rate on rent under section 194I?")
    print(f"OUT-OF-CORPUS:\n{b['answer']}\nSOURCES: {b['sources']}\n")
    assert "don't have enough information" in b["answer"], "model hallucinated outside its corpus"
    assert b["sources"] == [], "refusal must cite nothing"

    print("OK - graph matches the Day 7 pipeline")

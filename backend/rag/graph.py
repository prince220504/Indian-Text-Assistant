"""LangGraph version of the RAG pipeline. Nodes read/write one shared state."""

from typing import TypedDict, List
from langchain_core.documents import Document
from langgraph.graph import StateGraph, END
from retriever import retrieve
from generator import format_docs, SYSTEM_PROMPT, USER_PROMPT, llm

class GraphState(TypedDict):
    """The file folder that moves desk to desk.
    
    Every node gets this whole dict and returns only the key it changed.
    """
    question: str       # what the user asked
    documents: List[Document]   # chunks the retriever fetched
    answer: str        # final cited answer

def retrieve_node(state: GraphState):
    """Desk 1: fetch chunks for the question, stamp them into the file."""
    docs = retrieve(state["question"])     # Day 6 component, unchanged
    return {"documents": docs}      # only the key we changed

def generate_node(state: GraphState):
    """Desk 2: read the chunks already in the file, write a cited answer."""
    context = format_docs(state["documents"])

    messages = [
        ("system", SYSTEM_PROMPT),
        ("human", USER_PROMPT.format(context=context, question=state["question"])),
    ]

    return {"answer": llm.invoke(messages).content}

# --- wire the desks together -------------------------------------------
workflow = StateGraph(GraphState)

workflow.add_node("retrieve", retrieve_node)       # "name in graph"  -> function
workflow.add_node("generate", generate_node)

workflow.set_entry_point("retrieve")    # where the file gets created
workflow.add_edge("retrieve", "generate")
workflow.add_edge("generate", END)      # file leaves the office

# compile once at import time - turns the description into a runnable
app = workflow.compile()

def ask(question: str) -> str:
    """Public entry point. Same signature as Day 7's answer()."""
    result = app.invoke({"question": question})     # seed the file with one key
    return result["answer"]        # full final state comes back

if __name__ == "__main__":
    # happy path: graph must produce the same cited answer as Day 7's answer()
    a = ask("What is the GST registration threshold?")
    print(f"IN_CORPUS:\n{a}\n")
    assert "Source:" in a, "expected a citation"

    # refusal path: graph must not leak the model's own tax knowledge
    b = ask("What is the TDS rate on rent under section 194I?")
    print(f"OUT-OF-CORPUS:\n{b}\n")
    assert "don't have enough information" in b, "model hallucinated outside its corpus"

    print("OK - graph matches the Day 7 pipeline")

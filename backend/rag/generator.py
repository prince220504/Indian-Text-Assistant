import os 
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from retriever import retrieve   # our Day 6 component

# .env sits at repo root; load it so GROQ_API_KEY lands in os.environ
load_dotenv()

# fail loud + early if key missing - better than a confusing 401 later
if not os.getenv("GROQ_API_KEY"):
    raise RuntimeError("GROQ_API_KEY missing from .env")

def format_docs(docs):
    """Flatten retrieved Documents into one labelled text block for the prompt."""
    blocks = []
    for i, doc in enumerate(docs,start=1):
        source = doc.metadata.get("source", "unknown")
        page = doc.metadata.get("page", "?")
        blocks.append(f"[Source {i}: {source}, page {page}]\n{doc.page_content}")
    return "\n\n".join(blocks)

SYSTEM_PROMPT = """You are a tax assistant for Indian freelancers and small business owners.

Rules you must follow:
1. Answer ONLY using the context provided below. Do not use any outside knowledge.
2. If the context does not contain the answer, reply exactly: "I don't have enough information in my documents to answer that." Do not guess.
3. Always cite your sources at the end, like: (Source:filename.pdf, page 12) 
4. Answer in plain, simple English. Explain tax jargon if you use it.
"""

USER_PROMPT = """Context:
{context}

Question: {question}"""

# module-level: build the client once, reuse for every question
llm = ChatGroq(
    model="llama-3.3-70b-versatile",
    temperature=0,  # factual task - same question must give same answer
)

def answer(query):
    """Retrieve context for the query, then ask the LLM for cited answer."""
    docs = retrieve(query)   # Day 6 component: 5 chunks
    context = format_docs(docs)    # -> one labelled text block

    messages = [
        ("system", SYSTEM_PROMPT),
        ("human", USER_PROMPT.format(context=context, question=query)),
    ]

    response = llm.invoke(messages)   # the actual Groq API call
    return response.content     #.content = just the text

if __name__ == "__main__":
    # happy path: in-corpus question must produce a cited answer
    a = answer("What is the GST registeration thershold?")
    print(f"IN-CORPUS:\n{a}\n")
    assert "Source:" in a, "expected a citation"

    # refusal path: out-of-corpus question must NOT be answered from memory
    b = answer("What is the TDS rate on rent under section 194I?")
    print(f'OUT-OF-CORPUS:\n{b}\n')
    assert "don't have enough information" in b, "model hallucinated outside its corpus"

    print("OK = grounded + refuses")

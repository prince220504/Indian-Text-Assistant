import os 
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from .retriever import retrieve   # our Day 6 component
import re

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

# The model cites in two dialects: our [2], and gpt-oss's own 【2†L14-L16】.
# Accept both - a prompt rule competes with training and doesn't always win.
# \d{1,2} + (?!\d) so a bare year like [2024] is never eaten as a citation.
CITE_RE = re.compile(r"\s*[\[【](\d{1,2})(?!\d)[^\]】]*[\]】]")

def split_citations(text, docs):
    """Split a model answer into (clean prose, the docs it actually pointed at).
    
    The model is trusted to point ("[2]"), never to retype a filename - the
    metadata is read off the chunk, as Day 4 stamped it.
    """
    numbers = sorted({int(n) for n in CITE_RE.findall(text)})       # set = dedup, sorted = stable order
    used = [docs[n-1] for n in numbers if 1 <= n <= len(docs)]     # guard: model can invent [9]
    clean = CITE_RE.sub("", text).strip()

    # ponytail: no markers = model ignored rule 3; fall back to all retrieved docs.
    # rather than showing zero citations. Tighten only if it actually misbehaves.
    if not used:
        print("[cite] no markers found - falling back to all retrieved docs")
        return clean, docs

    return clean, used

# the exact refusal. One definition - the prompt asks for it, code can also return it.
REFUSAL = "I don't have enough information in my documents to answer that."

# a greeting is not a failed question - it deserves its own words, not the refusal.
# canned on purpose: the answer never depends on what they typed, so no LLM call.
GREETING = """Hello! I'm a tax assistant for Indian freelancers and small business owners.

I can help with two things:
- **GST questions** answered from official government documents, with the source cited.
- **Income tax** for FY 2025-26 under the new regime - use the calculator tab.

Ask me something like *"What is the GST registration threshold?"*"""

SYSTEM_PROMPT = f"""You are a tax assistant for Indian freelancers and small business owners.

Rules you must follow:
1. Answer ONLY using the context provided below. Do not use any outside knowledge.
2. If the context does not contain the answer, reply exactly: "{REFUSAL}" Do not guess.
3. Cite with a numbered marker like [1] or [2] immediately after each fact you take from the context, matching the source numbers above. Never write filenames or page numbers in your answer - the marker is the whole citation.
4. Answer in plain, simple English. Explain tax jargon if you use it.
"""

USER_PROMPT = """Context:
{context}

Question: {question}"""

# module-level: build the client once, reuse for every question
llm = ChatGroq(
    model="openai/gpt-oss-120b",
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
    assert CITE_RE.search(a), "expected a [n] citation marker"
    assert ".pdf" not in a, "model wrote a filename instead of a marker"

    # refusal path: out-of-corpus question must NOT be answered from memory
    b = answer("What is the TDS rate on rent under section 194I?")
    print(f'OUT-OF-CORPUS:\n{b}\n')
    assert "don't have enough information" in b, "model hallucinated outside its corpus"

    print("OK = grounded + refuses")

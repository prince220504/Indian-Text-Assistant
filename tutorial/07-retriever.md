# Tutorial 07 — The Retriever (reusable search component) — Week 2 D1

> **What you'll be able to recall after re-reading this:** why a one-shot test script is not a component; why expensive setup goes at module level and cheap work goes inside the function; what `as_retriever()` gives you that `similarity_search()` doesn't; why `.invoke()` is everywhere in LangChain; and why `k=5` always returns 5 chunks even when only 3 are any good.

>
> **How to use this doc:** read top-to-bottom the first time. After that jump to any boxed **Analogy**, the **60-second recall**, or the **Interview flashcards**.

---

## Where this fits

Week 1 built the **ingestion pipeline** and proved it works ([Tutorials 01–06](06-test-retrieval.md)) — 1033 GST vectors on disk, `similarity_search` returning on-topic hits. Week 2 builds the **query pipeline**: retriever → generator → chain.

```
INGESTION (Week 1):  PDFs → chunks → vectors → disk            ✅ done, merged
QUERY (Week 2):      question → RETRIEVER → generator → answer  ▲ you are here (retriever)
```

New file — `backend/rag/retriever.py`.

---

## Concept 1 — A script is not a component

Day 6's `test_ingestion.py` did the right thing the wrong way. It opened ChromaDB, searched once, printed, and died. That's a **script** — run it, look at output, done.

Week 2's generator needs that same search **every time a user asks a question**. Copy-pasting those four lines into the generator would work, but then the search logic lives in two places, and next week in three.

A **retriever** is that search logic wrapped into one reusable thing: loaded once, called forever.

> **🧠 Analogy — the library peon.** Day 6 = you walked into the library yourself, found the librarian, asked one question, walked out. Next question? Walk in again, find her again. A retriever = you **hire a peon** who already stands beside the librarian all day. You shout a question, he brings 5 books. No walking, no re-finding.

The "walking" is the slow part: loading a 90 MB embedding model into RAM and opening the vector store. Do it **once**, not per question.

---

## Concept 2 — Expensive setup outside, cheap work inside

This is the whole design of the file, and it's a general rule far beyond RAG.

Python runs **top-level code once**, the first time the module is imported. Code inside a function runs **every single call**.

| | Where it goes | Why |
|---|---|---|
| Load embedding model (~90 MB, 2–5 s) | **module level** | one-time cost, reuse forever |
| Open ChromaDB (SQLite handle) | **module level** | setup, not per-request work |
| Search for chunks | **inside `retrieve()`** | cheap, and the question changes every time |

Put the model load inside `retrieve()` and 10 user questions = 10 model loads = 30+ seconds burned for nothing.

```python
import os
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma

# 2-levels-up, anchored to THIS file — works from any working directory
CHROMA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "chroma_db")

# ↓ module level: runs ONCE at import
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

vectorstore = Chroma(
    persist_directory=CHROMA_DIR,
    embedding_function=embeddings,
)
```

> **Note the path trick.** `os.path.dirname(__file__)` anchors to the file's own location, not the terminal's working directory. Day 5 taught this the hard way: `chunk_docs.py` used a cwd-relative path, and running from `backend/ingestion/` blew up with `FileNotFoundError: 'data\docs'`. Anchor to `__file__` and the file works from anywhere.

---

## Concept 3 — Same model, both sides. Always.

`embedding_function=embeddings` must be **the same model** used during ingestion (`all-MiniLM-L6-v2`).

An embedding model doesn't just produce numbers — it invents its own **coordinate system**. `all-MiniLM-L6-v2` maps text into a 384-dimension space of its own design. `all-mpnet-base-v2` maps into a completely different 768-dimension space.

Your 1033 chunks live in MiniLM's space. Embed the *question* with a different model and you're comparing Mumbai's latitude against Delhi's map. Cosine similarity still returns a number, so nothing crashes — you just get nonsense chunks.

> **The dangerous case isn't the crash.** Different dimensions (384 vs 768) → loud dimension-mismatch error. Annoying, but honest. Swap to a *different* model that also outputs 384 dims → **no error, no warning, silently wrong answers forever**. Loud failure is a gift.

---

## Concept 4 — `similarity_search()` vs `as_retriever()`

Two ways to search the same store, same results, different shape:

| | `vectorstore.similarity_search(q, k=5)` | `vectorstore.as_retriever(search_kwargs={"k": 5})` |
|---|---|---|
| Returns | a list of Documents | a **Retriever object** |
| Called with | the query, every time | `.invoke(query)` |
| `k` lives | in the call | **baked into the object** |
| Chains / LangGraph can consume it | ❌ no | ✅ yes |

`similarity_search` is a raw method on one specific class. `as_retriever()` wraps it into a **standard LangChain component** — which is exactly what the Week 2 chain and the Week 2.5 graph nodes know how to plug in.

```python
retriever = vectorstore.as_retriever(search_kwargs={"k": 5})


def retrieve(query: str):
    """Ask a question, get back 5 relevant chunks (list of Documents)."""
    return retriever.invoke(query)
```

**Why `retrieve()` exists when `retriever.invoke()` already works:** it adds no logic — it's a **named door**. `retrieve(state["question"])` reads clean inside a graph node. And when you later add filtering (only GST docs, say), you change one place instead of every caller.

---

## Concept 5 — Everything in LangChain is a Runnable

⭐ **Interview tip.** Retriever, LLM, prompt template, chain, graph — every LangChain 1.x component exposes the **same** `.invoke()` method. That shared contract is the **Runnable interface**, and it's the entire reason you can pipe components together with `|`:

```python
chain = prompt | llm | parser   # each one is a Runnable
```

Old tutorials use `retriever.get_relevant_documents(q)` — deprecated. Use `.invoke()`.

If an interviewer asks "how does LangChain compose things?" the answer is one sentence: *everything is a Runnable, everything has `.invoke()`, so anything can pipe into anything.*

---

## Concept 6 — Leave a check behind, not a print

```python
if __name__ == "__main__":
    docs = retrieve("What is the GST registration threshold?")

    assert len(docs) == 5, f"expected 5 chunks, got {len(docs)}"
    assert docs[0].page_content.strip(), "top chunk is empty"

    for i, d in enumerate(docs, start=1):
        print(f"\n--- Hit {i} | {d.metadata['source']} p.{d.metadata['page']} ---")
        print(d.page_content[:200])
```

Day 6 printed and you eyeballed it — fine for a one-shot test. But this file gets **imported by the generator** next week. If the Chroma path breaks or ingestion is re-run wrong, you want a loud failure, not a quiet zero-hit list. Two asserts = the smallest thing that breaks when retrieval breaks.

Run from **repo root**:

```bash
python backend/rag/retriever.py
```

---

## The run — and what the results actually taught

```
--- Hit 1 | gst-concept-2019.pdf p.46 ---   GST has increased the threshold…      ✅ on-topic
--- Hit 2 | gst-concept-2019.pdf p.19 ---   the threshold limit of turnover…      ✅ on-topic
--- Hit 3 | gst-concept-2018.pdf p.18 ---   the threshold limit of turnover…      ✅ on-topic
--- Hit 4 | gst-faq.pdf p.31 ---            a person in India, other than…        ⚠️ drifting
--- Hit 5 | gst-concept-2019.pdf p.20 ---   determination of value of supply…     ⚠️ drifting
```

Hits 1–3 nail it. Hits 4–5 matched on **vocabulary** ("person", "supply", "GST"), not on your actual question.

**This is not a bug.** `k=5` means *"give me 5."* Chroma ranks everything by distance and hands back the top 5 — it has no way to say *"honestly, only 3 of these are relevant."* It always fills the quota.

⭐ **Interview tip — this is the exact problem the Relevance Grader solves.** Naive RAG stuffs all 5 chunks into the LLM prompt, junk included; the model gets distracted or hallucinates from the irrelevant context. **Agentic RAG** (Week 2.5) adds a grader node: an LLM reads each chunk and asks *"does this actually answer the question?"*, drops the duds, and if **nothing** survives → rewrites the query and retries. Your hits 4–5 are the live evidence for why that node exists.

---

## 60-second recall

1. **Script → component.** Day 6 searched once and died; the retriever is loaded once and called forever.
2. **Module level = expensive setup** (embedding model, Chroma handle). **Inside the function = per-question work** (the search).
3. **`Chroma(...)` opens, `Chroma.from_documents(...)` builds.** Query reads; ingestion writes. Never rebuild at query time.
4. Argument names differ: `from_documents` takes `embedding=`, `Chroma()` takes `embedding_function=` (the tool for embedding *future queries*).
5. **Same embedding model on both sides**, or silent garbage.
6. **`as_retriever()`** makes a standard component chains/graphs can plug in; `similarity_search()` is a raw method they can't.
7. **`.invoke()`** is the universal Runnable verb — that's what `|` piping is built on.
8. **`k=5` always returns 5**, good or not. The Relevance Grader (Week 2.5) is what filters the duds.

---

## Interview flashcards

**Q: Why load the embedding model at module level instead of inside the retrieval function?**
A: It's a ~90 MB model load taking seconds. Module-level code runs once at import; function-body code runs per call. Per-question reloading would add seconds to every request for zero benefit. General rule: expensive setup outside, cheap per-request work inside.

**Q: What happens if the query embedding model differs from the ingestion one?**
A: The stored vectors and the query vector live in different coordinate spaces, so cosine similarity is meaningless. Different dimensions crash loudly; same dimensions fail **silently** with wrong results — the worse case.

**Q: `similarity_search()` or `as_retriever()` — which and why?**
A: `as_retriever()` for anything composed. It returns a Runnable that chains and LangGraph nodes accept, with `k` baked in. `similarity_search()` is a raw class method, fine for a quick script.

**Q: What is the Runnable interface?**
A: LangChain's shared contract — every component (prompt, LLM, retriever, chain, graph) implements `.invoke()`. That uniformity is what makes `prompt | llm | parser` composition possible. `.get_relevant_documents()` is the deprecated pre-Runnable API.

**Q: Your retriever returned 5 chunks but only 3 are relevant. Bug?**
A: No. `k` is a fixed quota — the vector store returns the k nearest by distance and cannot judge relevance. Filtering is a separate concern, handled by a relevance-grading step in agentic RAG, which can also trigger a query rewrite and retry when nothing is relevant.

**Q: Why anchor paths to `__file__` instead of a relative path?**
A: Relative paths resolve against the *working directory*, so the script breaks depending on which folder you run it from. `os.path.dirname(__file__)` anchors to the file's own location and works from anywhere.

---

## Self-test

1. Move `embeddings = HuggingFaceEmbeddings(...)` inside `retrieve()`. What still works, what gets worse, and by roughly how much for 10 questions?
2. Why does `Chroma()` name its parameter `embedding_function` while `from_documents()` names it `embedding`?
3. You change `search_kwargs={"k": 5}` to `k=20`. What improves? What gets worse? (Hint: think about what eventually goes into the LLM prompt.)
4. Someone re-runs `embed_and_store.py` with a different model name but forgets to update `retriever.py`. Which line in `retriever.py` catches it, and would you get an error or silence?
5. Write one sentence explaining why `retrieve()` is worth having when it only forwards to `retriever.invoke()`.

---

**Next:** Tutorial 08 — the generator (Groq `llama-3.3-70b-versatile`): feeding retrieved chunks into a prompt and getting a **source-cited** answer back.

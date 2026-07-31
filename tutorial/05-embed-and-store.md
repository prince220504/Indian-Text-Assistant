# Tutorial 05 — Embedding Chunks & Storing in ChromaDB

> **What you'll be able to recall after re-reading this:** what "embedding" a chunk actually produces and why we do it *once at ingestion*, not per query; how `HuggingFaceEmbeddings` wraps a local model so LangChain can call it; how `Chroma.from_documents` embeds + writes vectors *and* their `{source, page}` metadata to disk in one call; and why the store survives a restart (persist-to-disk).

>
> **How to use this doc:** read top-to-bottom the first time. After that jump to any boxed **Analogy**, the **60-second recall**, or the **Interview flashcards**.

---

## Where this fits

Week 1 is the **ingestion pipeline** ([Tutorial 01](01-rag-foundations.md)). Day 4 cut every page into small overlapping chunks, each carrying `{source, page}` metadata ([Tutorial 04](04-splitting-chunks.md)). But a chunk is still **text** — the vector DB can't search text by meaning. Day 5 turns each chunk into numbers and files it away.

```
[download] → [extract text] → [split into chunks] → [embed] → [store in ChromaDB]
                                                       ▲ you are here (Day 5)
```

New file — `backend/ingestion/embed_and_store.py`. This is the **last arrow** of ingestion. After today the librarian has read every book.

---

## Concept 1 — What is "embedding" a chunk?

> **🧠 Analogy — GPS coordinates for meaning**
> A street address is text — "hard to compare two addresses by *closeness*." A **GPS coordinate** `(19.07, 72.87)` is numbers — now "how close are these two places?" is math. Embedding does the same for *meaning*: it turns a chunk of text into a list of ~384 numbers (a **vector**) so that two chunks about the same topic land near each other in number-space.

- **Input:** a chunk of text (`"TDS on professional fees is 10% under 194J..."`).
- **Output:** a fixed-length list of floats, e.g. `[0.02, -0.31, 0.88, ...]` (384 numbers for `all-MiniLM-L6-v2`).
- **The property that makes it useful:** similar meaning → vectors close together (small cosine distance). That's how retrieval finds the right chunks later.

> **⭐ Interview tip:** embeddings are computed **once, at ingestion time** — not per query. At query time you only embed the *question* (one short vector) and do a cosine search against the pre-stored chunk vectors. Ingestion is the slow, one-time cost; queries stay cheap.

---

## Concept 2 — The model runs local (no API, free)

```python
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
```

- **`all-MiniLM-L6-v2`** — a small sentence-transformers model. Good enough for retrieval, tiny, fast on CPU.
- **Local** — no API key, no per-call cost, works offline *after* the first download.
- **First run downloads ~90MB** from HuggingFace and caches it. Slow once, instant every run after.

**Why the `HuggingFaceEmbeddings` wrapper?** The raw sentence-transformers model has its own method names. `Chroma` doesn't know them. `HuggingFaceEmbeddings` is a thin **adapter** that gives the model LangChain's standard embedding interface (`embed_documents`, `embed_query`) — so `Chroma` can call it without caring which model is inside.

> **🧠 Analogy — the power adapter.** Your laptop charger (the model) has a foreign plug. `HuggingFaceEmbeddings` is the travel adapter that makes it fit the LangChain socket (`Chroma`). Same power, standard shape.

---

## Concept 3 — `Chroma.from_documents`: embed + store in one call

```python
db = Chroma.from_documents(
    documents=chunks,            # list of Document(.page_content, .metadata)
    embedding=embeddings,        # the adapter from Concept 2
    persist_directory=CHROMA_DIR # where to write on disk
)
```

One call does three things:

1. **Embeds** every chunk's `.page_content` → a vector (calls the model).
2. **Stores** each vector *next to* its `.metadata` (`{source, page}`) — so the citation rides with the vector.
3. **Persists** to `persist_directory` on disk.

> **⭐ In `langchain_chroma` (new package) persistence is automatic** — `from_documents` with a `persist_directory` writes to disk itself. The old `db.persist()` call from `langchain_community` days is gone. Don't add it.

**Why metadata beside the vector matters:** at query time you retrieve the closest vectors, and each one *already knows* its source file and page. That's what turns a raw answer into a **cited** answer — the whole point of this project.

---

## Concept 4 — Persist-to-disk: the store survives a restart

`CHROMA_DIR` points at `data/chroma_db/`. After the run you'll see:

```
data/chroma_db/
├── chroma.sqlite3              ← the store (vectors + metadata + text)
└── <uuid>/                     ← HNSW index files
```

**The proof it persisted:** close Python, open a *fresh* process, and reconnect **without re-embedding**:

```python
db = Chroma(persist_directory="data/chroma_db",
            embedding_function=HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2"))
print(db._collection.count())   # 1033
```

`1033` comes back — the vectors were read off disk, not recomputed. That's the whole reason ingestion is a **run-once** script: embed once, query forever.

---

## Concept 5 — The scanned PDF flows through, no guard needed

Same `gst-circular.pdf` (scanned image, 0 chunks) from Days 3–4. Here the loop is:

```python
chunks = chunk_pdf(filename)   # gst-circular.pdf → []
all_chunks.extend(chunks)      # extend([]) adds nothing — no-op
```

`extend([])` is a **no-op** — an empty list flows straight through, no crash. The print shows `gst-circular.pdf: 0 chunks`, which self-documents the skip. Day 4's peek crashed only because it *indexed* `[0]` on the empty file; we never index here, so **no `if chunks:` guard is needed.** Adding one would be dead code for a case that already works.

> **⭐ Interview tip:** knowing *when not* to add a guard is as senior as knowing when to. `extend([])`, `sum([])`, `"".join([])`, `for x in []` — all safely no-op on empty input. Guarding them is noise.

---

## What actually ran

```
gst-concept-2018.pdf: 140 chunks
gst-concept-2019.pdf: 188 chunks
gst-faq.pdf: 670 chunks
gst-instruction-2024.pdf: 35 chunks
gst-circular.pdf: 0 chunks
Total chunks: 1033
Stored 1033 vectors in .../data/chroma_db
```

Then the fresh-process reconnect returned `1033`. Store confirmed on disk.

**One bump along the way — the relative-path trap.** First run (from inside `backend/ingestion/`) crashed:

```
FileNotFoundError: [WinError 3] The system cannot find the path specified: 'data\docs'
```

`DOCS_DIR` in `chunk_docs.py` is a **relative** path, so it resolves against *where you run from*, not where the file lives. Run from `backend/ingestion/` → it looks for `backend/ingestion/data/docs` → gone. Running from the **repo root** made `data/docs` resolve, so it worked. (`CHROMA_DIR` in the new file is anchored to `__file__` and doesn't have this problem — the real fix for `DOCS_DIR` is the same `os.path.dirname(__file__)` trick, a future cleanup.)

> **⭐ Interview tip:** relative paths depend on the current working directory (cwd); a script that "works sometimes" often has a cwd-relative path. Anchoring to `__file__` makes it run-from-anywhere.

---

## 60-second recall

- **Embedding** = text → a list of ~384 numbers (a vector) where similar meaning = close vectors. Done **once at ingestion**; queries only embed the question.
- **`all-MiniLM-L6-v2`** runs **local, free**; first run downloads ~90MB then caches.
- **`HuggingFaceEmbeddings`** is the **adapter** giving the model LangChain's interface so `Chroma` can call it.
- **`Chroma.from_documents(documents, embedding, persist_directory)`** embeds + stores vector **and** `{source,page}` metadata **and** persists — all in one call. No manual `.persist()` in `langchain_chroma`.
- Store lands in `data/chroma_db/chroma.sqlite3`; a fresh process reconnects and counts **1033** without re-embedding = persistence proven.
- Scanned `gst-circular.pdf` = 0 chunks; `extend([])` no-ops it through — no guard needed.

## Interview flashcards

| Q | A |
|---|---|
| What does embedding produce? | A fixed-length vector of floats where similar meaning → close vectors (cosine). |
| When are chunk embeddings computed? | Once, at ingestion. Query time only embeds the question. |
| Why the `HuggingFaceEmbeddings` wrapper? | Adapter — gives the local model LangChain's standard embed interface so `Chroma` can use it. |
| What three things does `Chroma.from_documents` do? | Embed each chunk, store vector + metadata, persist to disk. |
| Do you call `db.persist()` in `langchain_chroma`? | No — `from_documents` with `persist_directory` persists automatically. |
| How do you prove it persisted? | Fresh process: `Chroma(persist_directory=...).._collection.count()` returns 1033 without re-embedding. |
| Why did the first run throw `FileNotFoundError`? | `DOCS_DIR` is cwd-relative; run from the wrong folder it can't find `data/docs`. Run from repo root fixed it. |

## Self-test (cover the answers)

1. Why is ingestion the slow step but queries stay cheap? → *All chunk vectors are embedded once at ingestion; a query only embeds the short question and does cosine search.*
2. What does `HuggingFaceEmbeddings` actually add over the raw model? → *A LangChain-standard interface (adapter) so `Chroma` can call the model.*
3. Name the three jobs `Chroma.from_documents` does in one call. → *Embed chunks, store vectors + metadata, persist to disk.*
4. How do you verify the store survived without re-embedding? → *Reconnect in a fresh process with `persist_directory` and check `_collection.count()` == 1033.*
5. The first run crashed with `FileNotFoundError: 'data\docs'`. Root cause? → *`DOCS_DIR` is a relative path; it resolves against cwd. Running from repo root (not `backend/ingestion/`) fixed it.*
6. What's the Day 6 next step? → *Query the store — e.g. "TDS rate for freelancers" — and verify the retrieved chunks + citations, then PR + merge.*

# Tutorial 04 — Splitting Text into Chunks (RecursiveCharacterTextSplitter)

> **What you'll be able to recall after re-reading this:** why we cut a page's text into small overlapping chunks instead of embedding whole pages; what `chunk_size=600` and `chunk_overlap=100` actually do; why "recursive" means "try nice boundaries before hard-cutting"; and the one method — `create_documents` — that splits *and* stamps citation metadata onto every chunk for free.

>
> **How to use this doc:** read top-to-bottom the first time. After that jump to any boxed **Analogy**, the **60-second recall**, or the **Interview flashcards**.

---

## Where this fits

Week 1 is the **ingestion pipeline** ([Tutorial 01](01-rag-foundations.md)). Day 3 extracted clean text per page ([Tutorial 03](03-chunk-docs.md)). But a page's text is still one big blob — too big to embed and too broad to retrieve precisely. Day 4 cuts those blobs into **chunks**.

```
[download] → [extract text] → [split into chunks] → embed → store in ChromaDB
                                  ▲ you are here (Day 4)
```

Same file as Day 3 — `backend/ingestion/chunk_docs.py`, part 2.

---

## Concept 1 — Why split at all?

> **🧠 Analogy — the poster vs the index cards**
> Photocopy a 300-page tax book onto **one giant poster**. Someone asks "TDS rate for freelancers?" — you hand them the whole poster. Useless; they wanted one paragraph. Instead, cut the book into **index cards**, one idea each. Now hand over just the 2–3 cards that answer the question. That's chunking.

Two hard reasons it's required:

1. **Embedding models have a size limit.** The model that turns text → numbers reads only a small amount at once (a few hundred words). Feed a whole page, it truncates or chokes. A small chunk fits.
2. **Retrieval precision.** At query time we fetch the *most similar* chunks. A whole-page chunk is about ~10 topics at once → its meaning "fingerprint" is blurry. A small chunk is about *one* thing → sharp fingerprint → better match.

---

## Concept 2 — The two numbers: 600 / 100

```python
splitter = RecursiveCharacterTextSplitter(
    chunk_size=600,      # each chunk ~600 characters
    chunk_overlap=100,   # repeat last 100 chars into the next chunk
)
```

- **`chunk_size=600`** → each chunk is roughly 600 characters.
- **`chunk_overlap=100`** → each chunk re-includes the **last 100 chars** of the previous one.

**Why overlap?** A cut can land mid-idea:

```
chunk 1: "...for freelancers TDS is"
chunk 2: "10% under section 194J..."
```

The "10%" got split from "TDS". Neither chunk alone answers cleanly. Overlap doesn't *un-cut* chunk 1 — it makes chunk 2 **back up 100 chars** and re-include the tail, so chunk 2 becomes `"...for freelancers TDS is 10% under section 194J..."`. The full idea now lives **complete inside at least one chunk**. Overlap = safety margin against bad cuts.

> **⭐ Interview tip:** chunk_size/overlap is a **tuning knob**, not a magic number. Too big = blurry retrieval; too small = one idea fragments across chunks. 600/100 is a sane default for prose docs. "How'd you pick chunk size?" → doc structure + embedding model's token limit + retrieval tests.

---

## Concept 3 — Why "Recursive"?

It does **not** blindly slice at character 600. It tries boundaries in order, biggest first:

paragraph break (`\n\n`) → line break (`\n`) → sentence/space → last resort: hard cut mid-word.

So near the 600 mark it prefers cutting at a paragraph gap, keeping chunks clean. "Recursive" = it falls **down** that list of separators until a chunk fits the size. Only if nothing else works does it chop mid-word.

---

## Concept 4 — `create_documents`: split AND cite in one call

The citation trick. The splitter has a method:

```python
chunks = splitter.create_documents(texts, metadatas=metadatas)
```

You hand it **two parallel lists**: the page texts, and a matching metadata dict per text. It splits each text into chunks **and stamps that text's metadata onto every chunk it produced**. We never loop to copy page numbers by hand — `create_documents` carries them.

```python
def chunk_pdf(filename):
    path = os.path.join(DOCS_DIR, filename)
    pages = extract_pdf(path)                              # list of (page_num, text)

    texts = [text for page_num, text in pages]            # just the page texts
    metadatas = [{"source": filename, "page": page_num}   # one dict per page = the citation
                 for page_num, text in pages]

    chunks = splitter.create_documents(texts, metadatas=metadatas)
    return chunks
```

Each chunk comes back as a **`Document`** object with two fields:
- **`.page_content`** — the chunk's text.
- **`.metadata`** — the dict `{"source": ..., "page": ...}`.

That's exactly the shape ChromaDB wants next (Day 5). The metadata rides *with* the embedding, so every retrieved chunk knows its own origin.

> **⭐ `split_text` vs `create_documents`:** `split_text(one_string)` returns plain strings — **no metadata**, citations lost. `create_documents(texts, metadatas)` returns `Document`s with metadata attached. For a RAG pipeline that must cite sources, you want `create_documents`.

---

## Concept 5 — Same empty-PDF trap, one rung higher

Running over all 5 PDFs:

```
gst-circular.pdf: 0 chunks          ← the scanned image PDF from Day 3
gst-concept-2018.pdf: 140 chunks
gst-concept-2019.pdf: 188 chunks
gst-faq.pdf: 670 chunks
gst-instruction-2024.pdf: 35 chunks
Total: 1033 chunks
```

`gst-circular.pdf` yields **0 chunks** (Day 3's skip-empty guard already dropped its pages). Then the peek block crashed:

```
IndexError: list index out of range
```

**Why:** the peek did `chunk_pdf(pdf_files[0])[0]`. `pdf_files[0]` is `gst-circular.pdf` — the empty one — so `chunk_pdf(...)` returned `[]`, and `[0]` on an empty list crashes. The `if total_chunks:` guard saw 1033 (true), but the code then re-indexed the *first specific file*, which happened to be the empty one. **The guard checked the wrong thing.**

**The fix — collect all chunks, sample from the pile:**

```python
all_chunks = []
for filename in pdf_files:
    chunks = chunk_pdf(filename)
    all_chunks.extend(chunks)
    print(f"{filename}: {len(chunks)} chunks")

if all_chunks:                       # any chunk anywhere?
    sample = all_chunks[0]           # first real chunk, never the empty file
    print(sample.metadata)           # {'source': 'gst-concept-2018.pdf', 'page': 1}
    print(sample.page_content[:200])
```

Now the sample comes from the whole collection, so an empty *first* file can't crash it.

> **⭐ Interview tip:** "handle empty/garbage input gracefully instead of assuming clean data" is the robustness instinct interviewers probe. Deleting the bad PDF fixes *this* run; making the code survive *any* empty PDF fixes it forever. Robust code > deleting the file.

**Should you delete `gst-circular.pdf`?** It contributes 0 chunks either way. Keeping it is harmless (and Week 5+ could add OCR to rescue it). We kept it — the fix is in the code, not the data.

---

## 60-second recall

- **Split** because embedding models have a size limit **and** small chunks retrieve more precisely (sharp fingerprint vs blurry page).
- **`chunk_size=600`** ≈ 600 chars/chunk. **`chunk_overlap=100`** re-includes the previous 100 chars so a mid-idea cut still lands complete in at least one chunk.
- **Recursive** = try paragraph → line → sentence → word boundaries before hard-cutting.
- **`create_documents(texts, metadatas)`** splits *and* stamps `{source, page}` onto every chunk → `Document(.page_content, .metadata)`. `split_text` loses metadata.
- 5 GST PDFs → **1033 chunks** (circular = 0, still).
- Peek crashed on `pdf_files[0]` (the empty circular). Fix: collect **`all_chunks`** and sample from the pile — guard the right thing.

## Interview flashcards

| Q | A |
|---|---|
| Why split docs into chunks? | Embedding model size limit + precise retrieval (one idea = sharp fingerprint). |
| What does `chunk_overlap` prevent? | An idea cut across a boundary being lost — the tail is re-included in the next chunk. |
| Why "recursive" splitter? | Tries big→small separators (paragraph→line→sentence→word) before a hard mid-word cut. |
| `split_text` vs `create_documents`? | `split_text` → plain strings, no metadata. `create_documents` → `Document`s with metadata (citations). |
| How does the page number reach the chunk? | `metadatas` list passed to `create_documents`; each chunk inherits its source text's dict. |
| Why did the peek crash on a "working" run? | `pdf_files[0]` was the empty scanned PDF → `[]`, and `[0]` on it crashes; guard checked total, not that file. |

## Self-test (cover the answers)

1. Two reasons we chunk instead of embedding whole pages? → *Embedding size limit; and small chunks retrieve more precisely.*
2. A sentence gets cut across chunks 1 and 2. How does overlap save the answer? → *Chunk 2 backs up 100 chars and re-includes the tail, so the full idea sits complete in chunk 2.*
3. Which method keeps citation metadata, `split_text` or `create_documents`? → *`create_documents` — it returns `Document`s with `.metadata`.*
4. The run printed 1033 total chunks, then crashed with `IndexError`. Why? → *The peek indexed `pdf_files[0]`, the empty scanned PDF (0 chunks); `[0]` on an empty list crashes. Fixed by sampling from `all_chunks`.*
5. What's the Day 5 next step? → *Embed each chunk into a vector and persist to ChromaDB.*

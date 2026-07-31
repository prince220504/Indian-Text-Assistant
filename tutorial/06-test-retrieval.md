# Tutorial 06 — Testing Retrieval (similarity_search) — Week 1 Closer

> **What you'll be able to recall after re-reading this:** how query time *flips* ingestion around — you embed only the question, not the corpus; how `similarity_search(query, k)` reconnects to the on-disk store and returns the k nearest chunks with their citations attached; why the same embedding model must be used at query and ingestion time; and how to read the results to know retrieval actually works.

>
> **How to use this doc:** read top-to-bottom the first time. After that jump to any boxed **Analogy**, the **60-second recall**, or the **Interview flashcards**.

---

## Where this fits

Week 1 built the **ingestion pipeline** end to end: download → extract → split → embed → store ([Tutorials 01–05](05-embed-and-store.md)). Day 5 left **1033 vectors** sitting on disk in `data/chroma_db/`. Day 6 asks the only question that matters: *does asking it a question return the right chunks?* If yes, Week 1 is done.

```
INGESTION (Days 2–5):  embed 1033 chunks ONCE → store on disk        ✅
QUERY     (Day 6):     embed ONLY the question → search → top-k hits  ▲ you are here
```

New file — `backend/ingestion/test_ingestion.py`.

---

## Concept 1 — Query time is ingestion, mirrored

Ingestion was the expensive direction: turn *every* chunk into a vector, once. Query is the cheap direction: turn *one* question into a vector, then find its neighbours.

> **🧠 Analogy — the library you already indexed.** Ingestion = the librarian read all 1033 index cards and filed each by topic-location. A query is a visitor asking one question. The librarian doesn't re-read the library — she embeds *the question* into the same topic-location scheme and walks straight to the nearest shelf. Fast, because the hard work already happened.

- **You do NOT rebuild the store.** You **reconnect** to it.
- **You embed only the question** — one short vector.
- **Cosine search** returns the k chunks whose vectors sit closest to the question's vector.

---

## Concept 2 — Reconnect, don't rebuild

```python
CHROMA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "chroma_db")

embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
db = Chroma(persist_directory=CHROMA_DIR, embedding_function=embeddings)
```

Two things must match Day 5 exactly:

1. **Same `CHROMA_DIR`** — point at the store that already exists.
2. **Same model `all-MiniLM-L6-v2`** — see Concept 4.

> **⭐ `Chroma(...)` vs `Chroma.from_documents(...)`:** `from_documents` (Day 5) *creates* — it embeds a list of docs and writes them. `Chroma(persist_directory=..., embedding_function=...)` (today) *opens* an existing store, embeds nothing up front. Also note the parameter name flips: `embedding=` in `from_documents`, **`embedding_function=`** here. Easy trip-up.

---

## Concept 3 — `similarity_search`: ask and get cited chunks

```python
def run_query(query, k=5):
    print(f"\nQ: {query}\n" + "=" * 60)
    results = db.similarity_search(query, k=k)
    for i, doc in enumerate(results, start=1):
        src = doc.metadata.get("source", "?")
        page = doc.metadata.get("page", "?")
        print(f"\n[{i}] {src} - page {page}")
        print(doc.page_content[:200].strip())
```

- **`similarity_search(query, k=5)`** — embeds `query`, does cosine search, returns the 5 nearest chunks as `Document`s (each with `.page_content` + `.metadata`).
- **`.metadata.get("source"/"page")`** — pulls the citation. `.get(key, default)` is safe if a key is ever missing.
- **`[:200]`** — preview only; a chunk is ~600 chars, no need to dump it all.

The citation is the payoff: it rode from Day 4's `create_documents` → Day 5's store → back out here, untouched. Every retrieved chunk knows its own `source` and `page`.

---

## Concept 4 — Same model at both ends (non-negotiable)

The question and the chunks must be embedded by the **same model**, or cosine distance is meaningless.

> **🧠 Analogy — two maps, different scales.** Ingestion plotted every chunk on a map drawn to one scale. If you plot the question on a *different* map (a different model), "closest point" compares coordinates from two incompatible grids — garbage. Same model = same map = distances mean something.

⭐ Interview one-liner: *"Query and corpus embeddings must come from the same model — they have to share one vector space for similarity to be valid."*

---

## What actually ran

Query: **"What is the GST registration threshold?"**

```
[1] gst-concept-2019.pdf - page 46   ...GST has increased the threshold...
[2] gst-concept-2019.pdf - page 19   ...the threshold limit of turnover below which... exempted from GST...
[3] gst-concept-2018.pdf - page 18   ...the threshold limit of turnover below which... exempted from GST...
[4] gst-faq.pdf - page 31            ...(looser — a registered-person definition)...
[5] gst-concept-2019.pdf - page 20   ...(looser — list of GST provisions)...
```

**How to read this as "working":**
- **Hits 1–3 are dead on** — they literally discuss the turnover threshold below which supplies are exempt. The question never used the word "turnover"; the model matched *meaning*, not keywords. That's semantic retrieval proven.
- **Every hit is cited** — `source` + `page`. Citations survived the whole pipeline.
- **Hits span multiple files** (concept-2019, concept-2018, faq) — it searched the entire store, not one document.
- **Hits 4–5 are looser** — expected. Pure vector search casts a slightly wide net. Week 2's LLM generator + Week 2.5's **relevance-grader node** (drop useless chunks, rewrite + retry) tighten precision. Retrieval's job here is only to surface *candidates*.

> **⭐ Why a GST query, not "TDS for freelancers"?** The store holds **only 5 GST PDFs** so far (income-tax/TDS docs come later). Ask about TDS and you'd get the *closest GST chunks* — semantically nearest, but not actually about TDS. Always test with a query your corpus can answer, or you can't tell "retrieval is broken" from "the answer isn't in the data."

---

## 60-second recall

- Query time **mirrors** ingestion: embed **only the question**, search, get top-k. Don't rebuild the store — **reconnect** with `Chroma(persist_directory=..., embedding_function=...)`.
- **Same model** (`all-MiniLM-L6-v2`) at query and ingestion — one shared vector space, or cosine is meaningless.
- **`similarity_search(query, k=5)`** → 5 nearest `Document`s, each `.page_content` + `.metadata` (`source`, `page`).
- Result read as working: **top hits on-topic by meaning + every hit cited + spans files**. Loose tail hits are normal — later nodes tighten.
- Test with a query the corpus (GST-only) can answer.

## Interview flashcards

| Q | A |
|---|---|
| What gets embedded at query time? | Only the question — one vector. The corpus was embedded once at ingestion. |
| `Chroma(...)` vs `Chroma.from_documents(...)`? | `from_documents` creates + embeds docs; `Chroma(persist_directory=..., embedding_function=...)` opens an existing store. |
| Param name for the embedder when opening a store? | `embedding_function=` (vs `embedding=` in `from_documents`). |
| Why must the same model be used at both ends? | Query and chunk vectors must share one vector space or cosine distance is meaningless. |
| How do you know retrieval "works"? | Top hits are on-topic by meaning (not keyword), each carries source+page, and they span the corpus. |
| Why not test with a TDS query? | Corpus is GST-only; you'd get nearest-GST chunks and couldn't distinguish broken retrieval from missing data. |

## Self-test (cover the answers)

1. Does a query re-embed the 1033 chunks? → *No — it embeds only the question and searches the pre-built store.*
2. Which constructor opens an existing store without embedding docs, and what's the embedder param called? → *`Chroma(persist_directory=..., embedding_function=...)`.*
3. Your query returns chunks from three different PDFs. Good or bad sign? → *Good — it searched the whole store, not one doc.*
4. The word "turnover" wasn't in the question but top hits are about turnover thresholds. What does that prove? → *Semantic (meaning) match, not keyword match — embeddings working.*
5. Why did we pick a GST question over a TDS one? → *The store holds only GST docs; a TDS query can't be answered, so you couldn't tell broken retrieval from missing data.*
6. What Week-2 mechanisms tighten the loose tail hits? → *The LLM generator and the relevance-grader node (drop bad chunks, rewrite + retry).*

# Tutorial 01 — RAG Foundations

> **What you'll be able to recall after re-reading this:** why RAG exists, how embeddings turn meaning into numbers, and how a vector store (ChromaDB) finds the right paragraph fast. These three ideas are the pillars the entire Tax Assistant stands on.
>
> **How to use this doc:** read it top-to-bottom the first time (the story builds). After that, jump straight to any boxed **Analogy**, the **60-second recall**, or the **Interview flashcards** whenever you need to refresh one piece.

---

## The big picture (read this first)

We're building a chatbot that answers Indian tax questions from official government documents. The whole system is called **RAG**. By the end of this doc you'll understand the three moving parts:

1. **RAG** — the overall strategy (why we don't just ask Gemini directly).
2. **Embeddings** — how the machine turns *meaning* into *numbers* so it can search.
3. **Vector store (ChromaDB)** — where those numbers live and how they're searched fast.

They stack: RAG needs embeddings to search, and embeddings need a vector store to live in. Let's build them up one at a time.

---

## Concept 1 — What is RAG (Retrieval-Augmented Generation)?

### The problem first — why do we even need this?

Imagine you ask ChatGPT or Gemini:

> *"What is the TDS rate for a freelancer earning 8 lakhs in India for FY 2024-25?"*

The model will confidently give you an answer. But here's the scary part: **it might be completely wrong, and it will sound just as confident as when it's right.** This is called **hallucination**.

Why does this happen? An LLM is like a very well-read student who read millions of books but then had to walk into the exam hall with **no books allowed** — a closed-book exam. It answers from fuzzy memory. For general knowledge ("What is the capital of India?") that memory is fine. But for **precise, changing, official facts** like Indian tax rules — which update every budget, have exact section numbers, exact rates — fuzzy memory is dangerous. The model may:

- Mix up old tax slabs with new ones.
- Invent a section number of the Income Tax Act that doesn't exist.
- Give a rate that was correct in 2019 but changed in 2023.

For a tax assistant, a confident wrong answer is worse than no answer. Someone could file taxes incorrectly.

### The solution — RAG turns the closed-book exam into an open-book exam

**RAG = Retrieval-Augmented Generation.** Break the name into its two working parts:

- **Retrieval** — before answering, *go fetch* the relevant pages from the official documents.
- **Augmented Generation** — *generate* the answer, but *augmented* (helped) by those fetched pages.

> **🧠 Analogy — the exam hall**
> A closed-book exam student guesses from memory. An **open-book exam** student says "wait, let me flip to the exact page in the official tax handbook, read it, *then* answer." The second student is far more accurate — not because they're smarter, but because they're **grounded in the source**.

That's exactly what RAG does. When the user asks about TDS for freelancers, our system:

1. **Retrieves** the actual paragraphs from the official government TDS document.
2. Hands those paragraphs to the LLM and says: *"Answer using ONLY this text, and cite where you got it."*

Now the LLM isn't guessing from memory — it's reading the real rule and summarizing it. And it can **show its source** ("According to Section 194J...") so the user can trust and verify.

### The two phases of RAG

Every RAG system has two separate pipelines. This split is the single most important mental model for the whole project:

- **Phase 1 — Ingestion (done once, ahead of time).** We take the government PDFs, cut them into small pieces, and store them in a searchable database. Think of it as **building the library and organizing the shelves before any student arrives.** (This is all of Week 1.)
- **Phase 2 — Query (happens every time a user asks something).** User types a question → we search the library for the most relevant pieces → we hand those pieces + the question to the LLM → LLM writes a grounded, cited answer. (Weeks 2 onward.)

```
INGESTION (once):   Govt PDFs → cut into chunks → store in searchable DB
                    (build & organize the library)

QUERY (every ask):  User question → find relevant chunks → LLM reads them → cited answer
                    (student flips to the right page, then answers)
```

### How retrieval and generation work together

The magic is the handoff. Retrieval doesn't answer anything — it just *finds the right pages*. Generation doesn't search anything — it just *writes a good answer from pages it's given*. Neither is smart alone:

- Retrieval without generation = you get raw messy legal paragraphs, hard to read.
- Generation without retrieval = fluent confident hallucination.
- **Together** = the LLM's fluent writing *grounded* in real retrieved facts. Best of both.

### ⚠️ The one thing people get wrong: RAG does NOT train the model

This is the #1 misconception. **RAG does not train or fine-tune the LLM.** The model's brain is never touched.

- **Training / fine-tuning** = you change the model's internal weights by feeding it data. The knowledge gets baked *inside* the model.
- **RAG** = the model stays frozen. At the **moment the user asks**, we search our database, paste the relevant paragraphs into the prompt next to the question, and send both to the untouched LLM. The tax rule never enters the model's memory — it **rides along with the question, every time, as context.**

Why this is better:

- Tax changes next year? With training you'd retrain the model. With RAG you just **drop the new PDF into the database.** Done in minutes.
- The model can **cite** the exact paragraph, because it literally had that text in front of it. A trained model can't cite — the knowledge is dissolved into billions of weights.

> **Quick correction to keep in your head**
> ❌ "RAG trains the LLM on new tax rules."
> ✅ "RAG **fetches** the relevant tax document at question-time and **hands it to** the untouched LLM as context, so the LLM answers from the real text instead of memory."

---

## Side-quest — Training vs Fine-tuning vs RAG

I used both "training" and "fine-tuning" above. They're the **same kind of action** (both change the model's weights), just at different stages.

> **🧠 Analogy — becoming a doctor**
> - **Training (from scratch)** = the full MBBS degree. Take someone who knows nothing and teach them *everything*. Enormous cost, needs a whole university.
> - **Fine-tuning** = a specialization course *after* the degree. The doctor already knows medicine — now a short focused course makes them a *cardiologist*. Cheaper, but the brain still changes.
> - **RAG** = hand the doctor the latest medical journal article and say "read this, then answer." Cheap, instant, and they can point to the article. ← **this is us.**

| | Training (pre-training) | Fine-tuning | RAG |
|---|---|---|---|
| Starting point | Blank model, knows nothing | Already-smart model | Already-smart model |
| Data size | Billions of sentences (whole internet) | Small, focused set (thousands) | None — docs fetched live |
| Cost | Millions $, months, GPU farm | Cheaper, hours–days, some GPUs | Cheapest, no GPU training |
| Touches model weights? | ✅ Yes | ✅ Yes | ❌ **No — model frozen** |
| Can cite sources? | ❌ No | ❌ No | ✅ **Yes** |
| Update when law changes | Retrain | Re-fine-tune | **Swap a PDF** |

Who does what: **Meta / OpenAI / Google** do the pre-training. We just *use* the finished model (Groq's Llama). We do **neither** training nor fine-tuning — we do RAG.

---

## Concept 2 — Vector Embeddings

In Concept 1 I kept saying "the system *finds* the relevant paragraph." But how? A computer doesn't understand meaning like we do. If a user asks about *"freelancer taxes"* and the document says *"professional fee TDS,"* how does the machine know those are related? Different words entirely. **Embeddings solve this.**

### The core idea — turn meaning into numbers

Computers can't compare *meaning*, but they're brilliant at comparing *numbers*. So the trick is: **convert every piece of text into a list of numbers that captures its meaning.** That list is called an **embedding** (also called a **vector** — same thing).

```
"freelancer tax"        →  [0.82, 0.13, 0.91, 0.05, ...]
"professional fee TDS"  →  [0.79, 0.16, 0.88, 0.07, ...]   ← very close numbers!
"pizza recipe"          →  [0.02, 0.95, 0.11, 0.77, ...]   ← very different numbers
```

Notice: the two tax-related texts got **similar numbers**, and the unrelated pizza text got **very different numbers** — even though "freelancer tax" and "professional fee TDS" share zero words. That's the whole point: **embeddings capture meaning, not spelling.**

> **🧠 Analogy — GPS coordinates for meaning**
> Every place on Earth becomes two numbers (latitude, longitude). Once places are numbers, the computer instantly knows **Mumbai and Pune are close** and **Mumbai and Chennai are far** — it knows nothing about cities, it just compares numbers.
> Embeddings do the same, but for *meaning* instead of *location*. Every sentence becomes a point in "meaning-space." Similar meanings land close; unrelated meanings land far apart.
> One difference from GPS: GPS uses 2 numbers; our embedding model uses **384 numbers** per text. More numbers = more nuance. Same principle.

### How do we measure "closeness"? — Cosine similarity

Once two texts are vectors (points in space), we need a number for *how close* they are. The standard measure is **cosine similarity**.

Imagine drawing an arrow from the origin to each text's point. Cosine similarity measures the **angle between the two arrows**:

- Arrows pointing the **same direction** (small angle) → similarity near **1.0** → very similar meaning.
- Arrows at **right angles** → similarity near **0** → unrelated.
- Arrows pointing **opposite** → near **-1** → opposite meaning.

So "freelancer tax" vs "professional fee TDS" → tiny angle → cosine ≈ 0.9 → the system says "these match, retrieve this chunk!" You never compute this by hand — **ChromaDB does it for you** — but knowing *what* it measures (angle between meaning-arrows) is the interview-worthy part.

### Why this beats keyword search

- **Keyword search** (Ctrl+F) matches *exact words*. Search "freelancer tax" and it completely misses a paragraph titled "professional fee TDS" — zero shared words, so it returns nothing. The user gets "no results" even though the perfect answer was sitting right there.
- **Semantic search** (embeddings) matches *meaning*. It finds that paragraph because the meanings are close, not the words.

This is why RAG feels smart — it retrieves the *right* content even when the user's wording is totally different from the document's. Huge for tax, where citizens say everyday words ("I do freelance work") but the law uses formal terms ("professional and technical services").

### Why sentence-transformers (not word2vec)?

Old tools like **word2vec** make embeddings for **single words**. Problem: meaning lives in the *whole sentence*. "I do not owe tax" and "I do owe tax" share almost all the same words but mean opposite things — word-level embeddings fumble this.

**sentence-transformers** embeds an **entire sentence or paragraph** as one vector, capturing full meaning including word order and context. Bonus: it runs **locally on your machine, completely free, no API key** — which is why Week 1 needs no keys.

### One timing detail (important)

- **Document embeddings are made once, during ingestion (Week 1).** We embed every chunk and store the numbers.
- **At query-time we embed only the user's question** (fresh) and compare it against the pre-stored document embeddings.

That's why ingestion is a separate one-time pipeline: we do the expensive embedding of thousands of chunks upfront, so each user question stays fast.

---

## Concept 3 — ChromaDB (the Vector Store)

We now have embeddings — meaning turned into numbers. New problem: our tax documents produce **thousands of chunks**, each with its own embedding. When a user asks, we embed the question and must find the closest chunks. The naive way — compare against *all* thousands one by one — gets slow. We need a database built for this: a **vector database**. Ours is **ChromaDB**.

### Vector database vs normal database

- A **normal database** (like the PostgreSQL we'll use in Week 3) is built for **exact matches**. "Find the user whose email is `x@y.com`." Like a library shelved alphabetically: great if you know the exact title, useless if you say "something *like* this."
- A **vector database** is built for **similarity**. "Find the chunks whose *meaning* is closest to this question." It wants *nearest neighbours* in meaning-space.

> **🧠 Analogy — the librarian**
> A normal library shelves books alphabetically. A **vector database is a librarian who has read every book** and, when you describe a theme, instantly says "these five books are closest to what you mean" — even if you never named a title. That "closest by meaning" search is exactly what RAG's retrieval step needs.

**We use both databases in this project:** ChromaDB to find relevant tax chunks, PostgreSQL to store who-asked-what chat history. Different jobs.

### What HNSW means (in plain words)

Comparing the question against *all* thousands of vectors is slow. ChromaDB avoids that with an indexing algorithm called **HNSW** (Hierarchical Navigable Small World). Skip the math — keep the intuition:

> **🧠 Analogy — finding a house in a huge city**
> The slow way: knock on every single door. The smart way: fly to the right *city* → drive to the right *neighbourhood* → walk to the right *street* → the house. Each step zooms in and skips millions of wrong doors.
> HNSW builds that kind of **zoom-in map** over the vectors. It hops through a few layers — rough zone → finer → finest — and lands on the nearest neighbours after checking only a tiny fraction of the data. Search stays fast even with huge collections.

### Why we persist ChromaDB to disk

"Persist" means **save to your hard drive** instead of keeping only in memory (RAM). RAM is wiped every time your program stops. If ChromaDB lived only in RAM, every restart would erase all embeddings and force you to re-ingest every PDF (the slow embedding step) again.

Instead we tell ChromaDB to **persist to a folder on disk** (`data/chroma_db/`). We ingest **once**; the embeddings are saved as files. Next start, ChromaDB just *loads* them instantly. That's why `data/chroma_db/` is in our folder structure — and why it's gitignored (large generated data, not source code).

### What a query returns

When we query ChromaDB (you'll see this in the Week 1 test), we hand it the user's question and get back the top-N closest chunks. Each result carries three things:

- **The document text** — the actual chunk of tax content.
- **The metadata** — extra info we stored alongside it: which PDF, which page/section. **This is what lets us show source citations** ("from GST_Act.pdf, page 12").
- **The distance / similarity score** — how close this chunk was to the question.

That metadata is gold for our project — it's how the final answer gets its "cited source" badge, the whole trust factor of a tax assistant.

---

## How the three concepts connect (the full picture)

```
   INGESTION  (Week 1, run once)
   ────────────────────────────────────────────────────────────
   Govt PDF ─▶ chunks ─▶ [sentence-transformers] ─▶ embeddings ─▶ ChromaDB (disk)
                          (Concept 2: meaning→numbers)            (Concept 3: stored, indexed)

   QUERY  (every user question)
   ────────────────────────────────────────────────────────────
   Question ─▶ [embed the question] ─▶ ChromaDB finds closest chunks (cosine + HNSW)
                                            │
                                            ▼
                          chunks + question ─▶ frozen LLM ─▶ cited answer
                                                (Concept 1: RAG = grounded generation)
```

- **RAG** is the strategy: answer from fetched documents, not memory.
- **Embeddings** are how we make text searchable by meaning.
- **ChromaDB** is where embeddings live and how the search runs fast.

---

## ⭐ Interview flashcards

Quick Q → A. Cover the answer, test yourself.

- **Explain RAG in simple terms.** → It fetches relevant documents at question-time and gives them to the LLM as context, so the answer is grounded in real sources instead of the model's fuzzy memory.
- **Why RAG instead of fine-tuning?** → Fine-tuning changes model weights (costly, needs redoing when tax law changes, can't cite). RAG keeps the model frozen and injects the current document at query-time — updating is just swapping a PDF, and every answer is traceable to its source.
- **How do you update the chatbot when tax slabs change?** → Re-ingest the new document into the vector store. Never retrain the model.
- **Semantic vs keyword search?** → Keyword matches exact words; semantic matches meaning via embeddings, so it finds relevant text even when the wording differs.
- **What embedding model and why?** → sentence-transformers (e.g. `all-MiniLM-L6-v2`) — embeds whole sentences, runs locally for free, fast enough for a laptop.
- **How does ChromaDB find similar docs so fast?** → HNSW indexing — an approximate nearest-neighbour algorithm that navigates layered graphs to find close vectors without scanning the whole collection.
- **What is cosine similarity?** → The angle between two meaning-arrows: ≈1 = very similar, ≈0 = unrelated.
- **Why two databases (ChromaDB + PostgreSQL)?** → Different jobs: ChromaDB for meaning-based retrieval, PostgreSQL for structured chat history.

---

## 60-second recall (TL;DR)

- **RAG** = open-book exam for an LLM. Fetch official pages, hand them to a **frozen** model, get a **cited** answer. Two phases: **ingestion** (once, build the library) and **query** (every ask, flip to the right page). It does **not** train the model.
- **Embeddings** = meaning turned into a list of numbers. Similar meanings → close numbers (even with no shared words). Closeness measured by **cosine similarity** (angle). Beats keyword search because it matches *meaning*, not spelling. We use **sentence-transformers** (local, free).
- **ChromaDB** = a vector database — a librarian who read every book. Finds nearest-by-meaning chunks fast via **HNSW** (zoom-in map). **Persisted to disk** so we ingest once. Returns text + **metadata** (page/section = citations) + score.

---

## Self-test (answer out loud, in your own words)

1. Why can't we just ask Gemini directly about Indian tax rules? What does RAG add?
2. What's the difference between training, fine-tuning, and RAG?
3. What is an embedding, and why do "freelancer tax" and "professional fee TDS" get similar embeddings despite sharing no words?
4. Why would keyword search fail on that same example?
5. Normal DB vs vector DB — when would you use each?
6. Why do we persist ChromaDB to disk?
7. Besides the chunk text, what does a ChromaDB query return, and why does it matter for *our* project?

If any answer feels shaky, jump back to that concept's section above.

---

*Tutorial 01 — covers Week 1, Day 1. Next: Tutorial 02 will cover the ingestion code (`download_docs.py`, chunking, embed & store) as we build it.*

# Tutorial 03 — Extracting Text from the PDFs (PyMuPDF)

> **What you'll be able to recall after re-reading this:** why a PDF is a *layout*, not text; how `fitz` (PyMuPDF) opens a PDF and pulls words out page-by-page; why we keep the page number glued to each page's text (citations); and how a simple char-count check catches scanned/image PDFs before they poison the pipeline.
>
> **How to use this doc:** read top-to-bottom the first time. After that jump to any boxed **Analogy**, the **60-second recall**, or the **Interview flashcards**.

---

## Where this fits

Week 1 is the **ingestion pipeline** (see [Tutorial 01](01-rag-foundations.md)). Day 2 downloaded the PDFs ([Tutorial 02](02-download-docs.md)). But a downloaded PDF is not yet usable — it's a file full of *drawing instructions*, not clean text. Before we can embed anything, we must **pull the words out**. That's this script: `backend/ingestion/chunk_docs.py` (part 1).

```
[download PDFs] → [load + extract text] → split into chunks → embed → store in ChromaDB
                        ▲ you are here (Day 3)
```

> Note the filename says "chunk", but Day 3 only does the **extract** half. **Splitting** into 600/100 chunks is Day 4 — same file, next step.

---

## Concept 1 — A PDF is a picture of a page, not text

When *you* look at a PDF you see words. But the file itself stores something like *"draw this letter-shape at x=100, y=250; that one at x=112…"*. It's a **layout format**, built for human eyes, not a clean stream of text a program can read.

> **🧠 Analogy — the scanned newspaper**
> A PDF is like a scanned newspaper page. *You* read the headline fine. But a program handed the raw scan sees pixels/coordinates, not the sentence. Someone has to *transcribe* it back into text first. That transcriber is our PDF library.

So step one of ingestion is **extraction**: turn the layout back into a plain string we can embed.

---

## Concept 2 — PyMuPDF (`fitz`) opens the PDF

**PyMuPDF** is the tool. Package name is `pymupdf`, but you **import it as `fitz`** — a historical quirk, just memorize it.

```python
import fitz

doc = fitz.open(path)   # open the PDF -> document object
```

> **🧠 Analogy — the librarian**
> `fitz` is a librarian who can flip open any book, read a page aloud, and hand you the transcript. You give it a file path; it gives you something you can walk page by page.

A `doc` behaves like a **list of pages** — you loop over it to get each page.

---

## Concept 3 — Extract text per page, keep the page number

```python
def extract_pdf(path):
    doc = fitz.open(path)
    pages = []
    for page_num, page in enumerate(doc, start=1):   # start=1 -> human page numbers
        text = page.get_text()                       # pull words out of this page
        if text.strip():                             # skip blank / image-only pages
            pages.append((page_num, text))
    doc.close()
    return pages
```

Three things worth locking in:

- **`page.get_text()`** is the actual extraction — returns that page's words as one string.
- **`enumerate(doc, start=1)`** loops the pages *and* counts them. `start=1` because humans say "page 1", not "page 0". That counter **is** our citation page number.
- We return a **list of `(page_num, text)` tuples** — the page number stays glued to its text.

**Why keep the page number?** So the bot can cite *"— GST FAQ, page 12"*. The user (a freelancer) can then **open that page and check it himself** instead of blindly trusting the LLM (which can hallucinate). Trust-but-verify. It also helps *you* debug — a wrong answer points you at the exact chunk that misled it.

> **⭐ Interview tip:** "How do you cite sources in RAG?" → You attach **metadata** (source filename + page number) to each chunk **at ingestion time**. The vector DB stores it next to the embedding, so every retrieved chunk carries its origin for free. Lose the page boundary during extraction = no citation possible later.

---

## Concept 4 — The garbage check: scanned / image PDFs

When we ran it over all 5 PDFs, four gave clean tax English. One did not:

```
gst-circular.pdf: 4 pages, 0 chars    ← zero text!
```

`gst-circular.pdf` is a **scanned image PDF** — its pages are *pictures* of text, with no text layer underneath. `get_text()` finds nothing to pull, so it returns empty strings. Feed those empty strings downstream and you poison the vector DB with blank chunks.

This is exactly why the run-block prints a **preview** of page 1:

```python
if pages:                                     # only peek if we actually got pages
    print("  preview:", pages[0][1][:120].replace("\n", " "))
```

- Readable English/tax words in the preview = extraction worked.
- `����` or empty = image-only PDF (silent poison if you don't check).

**How we handled it — the lazy way (no OCR):** we did *not* add OCR (Tesseract) — that's a heavy extra dependency + slowness for **one** bad file when we have 4 good ones. Instead, one guard drops empty pages:

```python
if text.strip():          # blank/image-only page -> skip
    pages.append((page_num, text))
```

Now `gst-circular` yields **0 pages** instead of 4 empty ones, and never reaches the vector DB.

> **⭐ Interview tip:** "What breaks a PDF RAG pipeline?" → **scanned/image PDFs** (no text layer). Detect with a char-count check at ingestion; the real fix needs OCR. Naming this shows real-world experience.

---

## Concept 5 — Two bugs we hit (and the Python idioms behind them)

Fixing the empty-page problem *created* a second bug — a good lesson in reading tracebacks.

**Bug: `IndexError: list index out of range`.** After skipping empty pages, `gst-circular`'s `pages` became `[]`. The preview line then asked for `pages[0]` — index 0 of an empty list. Crash.

**The fix — truthiness of a list:**

```python
if pages:                 # empty list [] is FALSY; non-empty list is TRUTHY
    print("  preview:", pages[0][1][:120].replace("\n", " "))
```

An empty list `[]` is **falsy** in Python, a non-empty list is **truthy**. So `if pages:` means "only if there's something in it." (A wrong first attempt — `if pages == ' ':` — compared a *list* to a *space string*; that's never equal, so the preview silently never ran. No crash, but no output either. Moral: a guard that never fires is as bad as no guard.)

> **⭐ Interview tip:** empty containers (`[]`, `{}`, `""`, `0`, `None`) are all **falsy** in Python. Idiomatic emptiness check is `if not mylist:` / `if mylist:` — not `len(mylist) == 0`.

---

## 60-second recall

- A **PDF = layout (drawing instructions), not text.** Extraction turns it back into a string.
- **PyMuPDF**, imported as **`fitz`**. `fitz.open(path)` → a doc you loop over as pages.
- **`page.get_text()`** pulls the words. **`enumerate(doc, start=1)`** gives human page numbers.
- Keep **`(page_num, text)`** together → page number is the **citation** the user can verify.
- **0 chars = scanned/image PDF.** Detect with a char-count/preview check; skip empty pages (`if text.strip():`). No OCR (ponytail — one bad file isn't worth the dependency).
- **`if pages:`** guards the `[0]` access — empty list is falsy.
- Splitting into 600/100 chunks is **Day 4**, not today.

## Interview flashcards

| Q | A |
|---|---|
| Why can't you just read a PDF as text? | It's a layout format (glyph coordinates), not a text stream — needs extraction. |
| PyMuPDF import name? | `import fitz` (package is `pymupdf`). |
| How do you extract text from a page? | `page.get_text()`. |
| Why `enumerate(doc, start=1)`? | Loop pages *and* count them from 1 = human page number = citation metadata. |
| A PDF extracts to 0 chars — why? | Scanned/image PDF, no text layer. Real fix = OCR; cheap fix = skip it. |
| How do you cite sources in RAG? | Attach source + page metadata to each chunk at ingestion; DB stores it with the embedding. |
| `if pages:` vs `if pages == ' ':`? | First checks list truthiness (correct). Second compares a list to a string — always False. |

## Self-test (cover the answers)

1. You extract a PDF and get `0 pages, 0 chars`, but it opens fine in a viewer. What kind of PDF is it? → *A scanned/image PDF — pixels, no text layer. Needs OCR to read.*
2. Why do we store the page number alongside the text? → *So the bot can cite a page the user can open and verify himself — and so you can debug which chunk misled it.*
3. After skipping empty pages, `pages[0]` crashed with `IndexError`. Why, and the fix? → *`pages` was `[]`; guard with `if pages:` (empty list is falsy).*
4. Why did we NOT add OCR for the one image PDF? → *Heavy dependency + slowness for a single bad file when 4 good ones exist — skip it instead (ponytail/YAGNI).*
5. What's the Day 4 next step in this same file? → *Split the extracted text into 600/100 overlapping chunks.*

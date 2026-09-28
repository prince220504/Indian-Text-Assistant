# 24 — Widening the corpus: rank 17, and four things that lied to you

**Day 24 · Week 5 (corpus fix) · branch `feature/income-tax-corpus`**

The job looked like re-running Week 1. Download four PDFs, rebuild the vector store, open
two categories in the router. One session, mostly backend, nothing new to learn.

The code changes were indeed tiny — **20 insertions across 3 files.** Here is the whole
feature:

```python
-    if state["category"] == "GST":
+    if state["category"] in ("GST", "Income-Tax", "TDS"):
```

The session was not tiny, because four separate things told you something false along the
way: your own notes, a PDF's fiscal year, a relevance grader, and a page number. Learning
to catch each is the actual content of today.

---

## 1. The scope split you were closing

Before today, the product contradicted itself. `POST /calculate` computed income tax to the
rupee. The chat, one tab away, refused every income-tax question:

> I don't have enough information in my documents to answer that.

Not a bug — the corpus was five GST PDFs and nothing else. `decide_after_route` sent
`Income-Tax` and `TDS` straight to the refusal on purpose (Day 11), because routing them to
a retriever with no matching documents just burns a retry loop.

> ⭐ **Interview tip.** This is the most visible kind of technical debt: not slow code, not
> ugly code — **two features that disagree about what the product can do.** A reviewer
> notices it in thirty seconds, before they read a single line.

---

## 2. 403 vs 404 — read the *number*, not just "it failed"

`incometaxindia.gov.in` hard-blocks bots. Known since Day 2; it's why the GST corpus came
from `cbic-gst.gov.in`. So the plan was always a hand download in a browser.

Two links returned **404** for you. Every URL on that domain returned **403** to Claude's
tools.

> 📦 **The building analogy.**
> **403 Forbidden** = the guard at the gate refuses to let you in. He knows exactly where
> room 402 is; he won't take you there.
> **404 Not Found** = you're inside, walking the corridor, and there is no room 402.

Those are opposite facts about the same request, and they point at opposite fixes:

| Code | Means | Fix |
|---|---|---|
| 403 | Server refuses *you* | Change **who** is asking (browser, UA, different tool) |
| 404 | Server answered, path is dead | Change **what** you ask for (new URL) |

Your 404 proved your browser was *not* blocked — the files had simply moved in a site
redesign. So no better link could have helped; the fix had to be you navigating.

> ⭐ **Interview tip.** "The API is down" is not a bug report. 403, 404, 429, 500 and 502
> have four different on-call responses. Reading the status code is the whole first step,
> and skipping it is how people spend an hour rotating credentials on a 404.

Second lesson from the same dead end: the menu path went stale too. On a redesigned site,
**use the search box, not the navigation.** A site's search index moves with the site; your
memory of its menu does not.

---

## 3. Your notes lied (twice)

`CLAUDE.md` said `load_all_chunks()` loops "a hardcoded list of the 5 GST PDFs", so today
needed a directory scan. Opening the file:

```python
for filename in os.listdir(DOCS_DIR):
    if filename.endswith(".pdf"):
```

Already a directory scan. Already filtered to `.pdf`. Nothing to do. A review had also
warned that an unfiltered scan would choke on `desktop.ini` — a real Windows hazard, aimed
at code that hadn't existed for weeks.

Then it happened in the other direction. The `income-tax-memorandum.pdf` first line reads
`FINANCE BILL, 2026`. Claude called it stale, because `CLAUDE.md` says the calculator
encodes **FY 2025-26** — and judged the PDF against the notes.

You corrected it: FY 2026-27 is *current*. Today is September 2026. The memorandum is the
newest document in the corpus. **The notes were the stale thing, and so is the calculator.**

> ⭐ **Interview tip.** Docs, comments and READMEs are **claims about the code, not the
> code.** They were true once. When a doc and the file disagree, the file wins — always,
> without discussion. Read the file.
>
> And "which of these is out of date?" is frequently a question about **today's date**, not
> about either artifact. Anchor on the calendar, not on the document that happens to be
> open.

Two consequences got written down and deliberately *not* fixed:

- the corpus now holds **two fiscal years**, so a slab question can retrieve either. Citations
  stay honest — the user can see which PDF answered — so this is an acceptable ceiling.
- **the calculator is a year behind.** Real, but it's money logic with 10 asserts and
  hand-traced expected values behind it. Separate branch, separate day. Never mix a money
  change into a corpus branch.

---

## 4. Check a document before you ingest it

Four PDFs landed in `data/docs/`. Before embedding anything, they were profiled — pages,
characters per page, empty pages, and keyword counts:

| File | pages | chars/page | est. chunks | signal |
|---|---|---|---|---|
| `tds-on-salaries.pdf` | 55 | 2580 | ~283 | `TDS` ×218, `Form 16` ×9, `rebate` ×14 |
| `tds-rate-chart.pdf` | 7 | 3724 | ~52 | `194` ×100 |
| `income-tax-budget-2025.pdf` | 78 | 1438 | ~224 | `slab` ×7, `standard deduction` ×5 |
| `income-tax-memorandum.pdf` | 100 | 2137 | ~427 | `12,00,000` ×4 |

Two checks matter more than the rest.

**`chars/page` near zero means an image scan.** `gst-circular.pdf` has been in the corpus
since Week 1 at **4 pages, 0 chars, 4 empty pages**. It contributes nothing and *always
has*. `load_all_chunks()` has no guard, so it no-ops silently — you see `0 chunks` only if
you read the line.

**Keyword counts tell you whether the file answers the questions users ask.** This is also
what killed a candidate: `Finance_Bill.pdf` is 232 pages with **zero** `slab`, zero
`rebate`, zero `standard deduction` — pure amendment legalese, *"in section 194, for the
words…"*. It would have added ~2,900 chunks that outnumber all of GST and answer nothing.

> ⭐ **Interview tip. More corpus is not better corpus.** Retrieval is a **competition** —
> every query ranks against everything. A new document doesn't get its own shelf; it goes in
> the same pile and must out-score every rival. So an irrelevant corpus doesn't sit there
> harmlessly, it **degrades answers that used to work.** "Just add more docs" is the wrong
> instinct.

> ⭐ And: **`chars > 0` is not `text is good`.** The guard you'd write catches *empty*. The
> memorandum was non-empty, extractable, official — and no automated check on earth catches
> "wrong fiscal year". Only reading the first line does.

---

## 5. The import that had been broken for seven days

```
python -m backend.ingestion.embed_and_store
```

```
ModuleNotFoundError: No module named 'chunk_docs'
```

Read the last line only. Not "file missing", not a syntax error. Python looked for a
**top-level** module named `chunk_docs`.

```python
from chunk_docs import chunk_pdf, DOCS_DIR   # absolute import
```

Absolute means *"find `chunk_docs` at the top of `sys.path`"*, and `sys.path[0]` is the repo
root — which holds `backend/`, `data/`, `frontend/` and no `chunk_docs.py`. The file lives at
`backend/ingestion/chunk_docs.py`.

It worked in Week 1 because you ran it *from inside* `backend/ingestion/`, making that folder
`sys.path[0]`. Day 12 moved everything to run from the root and converted `rag/` — four lines,
`from .generator import llm`. `ingestion/` was never touched, because you hadn't re-run
ingestion since Week 1.

One character fixes it:

```python
from .chunk_docs import chunk_pdf, DOCS_DIR
```

> ⭐ **Interview tip. A refactor's blast radius includes code you didn't run.** Day 12's
> asserts all went green — none of them import `ingestion/`. **Passing tests prove the paths
> the tests take, and nothing else.** This bug was written, committed, merged, PR-reviewed
> and shipped. Running the thing found it.

---

## 6. Determinism is why a rebuild is safe

`Chroma.from_documents` on an existing directory **appends**. Running it as-is would have
given you a second copy of all 1033 GST vectors — duplicate hits, every citation twice.

So: `rmdir /s /q data\chroma_db`, then rebuild from source.

> ⭐ **Interview tip.** Rebuild-from-source beats incremental-append when the source is small
> and cheap to re-read. Append logic means tracking **what's already in there** — state you
> maintain and can get wrong. ~2000 local embeddings cost a couple of minutes and zero API
> calls. Deleting is the lazy correct move.

The rebuild output:

```
gst-circular.pdf: 0 chunks
gst-concept-2018.pdf: 140 chunks
gst-concept-2019.pdf: 188 chunks
gst-faq.pdf: 670 chunks
gst-instruction-2024.pdf: 35 chunks
income-tax-budget-2025.pdf: 251 chunks
income-tax-memorandum.pdf: 469 chunks
tds-on-salaries.pdf: 300 chunks
tds-rate-chart.pdf: 53 chunks

Total chunks: 2106
Stored 2106 vectors in ...\data\chroma_db
```

`140 + 188 + 670 + 35 = 1033`. **Exactly** the Day 5 count, reproduced 19 days later.

> ⭐ **Interview tip.** That's not luck, it's **determinism**, and it's the most valuable
> property an ingestion pipeline has. `RecursiveCharacterTextSplitter` has no randomness —
> same bytes in, same chunks out. It's what makes wipe-and-rebuild *safe* instead of scary.
> Put anything non-deterministic in the pipeline — an LLM, a timestamp, set iteration order —
> and you lose it, and then you do migrations forever instead of rebuilds.

Note also that you **predicted ≈2019 before running.**

> ⭐ **Knowing the expected number beforehand is the difference between running a script and
> testing one.** A rebuild that printed `1033` would look identical to success: same green
> output, same `Stored` line. Only the prediction catches it.

And: `Total chunks` prints *before* `HuggingFaceEmbeddings` even loads. Everything expensive
happens after it, silently, for minutes. **The last `print` is the only one that means
"done"** — a run killed mid-embed leaves a `chroma_db` folder that exists, opens fine, holds
nothing, and `Chroma(...)` never complains.

---

## 7. The one-line feature, and why it was one line

```python
if state["category"] in ("GST", "Income-Tax", "TDS"):
    return "retrieve"
```

`ROUTE_PROMPT` needed **no change.** `Income-Tax` and `TDS` have been real categories since
Day 11, back when neither had a single document behind it. That looked like dead code — *why
classify `TDS` if `TDS` always refuses?*

> ⭐ **Interview tip. Classify by what the thing is, not by what you currently do with it.**
> Because Day 11 named the categories honestly, today is a one-line change. Had the router
> only known `GST` and `Not-GST`, today would be a prompt rewrite plus re-testing the
> classifier plus new asserts.

### The bug hiding in that line

First attempt:

```python
if state["category"] in ("GST", "Income-Tax", "TDS", "Greeting"):   # ← wrong
```

`"Greeting"` came from the tuple in `route_node`, where it genuinely belongs — that loop
matches category names against the model's text. Here it means *"send greetings to the
retriever."*

It works perfectly. The `if` above it catches `Greeting` and returns `"greet"` first, so this
line never sees one. **Zero visible symptom. No test fails.**

> ⭐ **Interview tip. A wrong condition masked by an earlier `return` is a trap set for your
> future self.** Someone reorders those two blocks, or inserts a case above them, and `hii`
> starts hitting the retriever — and **the diff that breaks it is not the diff that contains
> the bug.** Worse, dead-but-wrong code reads as *intentional*: the next person sees
> `"Greeting"` listed under `retrieve` and assumes greetings are meant to be searched.

Same species as Day 22's `onclick`: copied text, right-looking, silent. **Bug 27, silent 20.**

### And the comment

The old comment said *"corpus is GST-only today"* and *"other categories have no documents"*.
Both false as of this commit. It was deleted rather than patched — and on review, not
replaced, because `if category == "Greeting": return "greet"` needs no gloss and line 68's
`print` already explains why `General` skips retrieval.

> ⭐ **A stale comment is worse than no comment**, because it's what the next reader trusts
> over the code. When a comment needs a new case, **rewrite it, don't inject into it** (Day
> 22, where an injected clause left a dangling half-sentence). And YAGNI applies to comments:
> if the code now carries the fact, the comment is debt.

---

## 8. A test that encoded a limitation as if it were a rule

```python
# refusal path: graph must not leak the model's own tax knowledge
b = ask("What is the TDS rate on rent under section 194I?")
assert "don't have enough information" in b["answer"]
assert b["sources"] == []
```

Making TDS retrievable **must** break this. That's correct behaviour, not a regression.

The wrong move is editing it until it's green. The right question: **what was it protecting?**
Not "TDS refuses" — that was incidental. The invariant is *the generator must refuse rather
than answer from pretraining.* `openai/gpt-oss-120b` knows plenty of Indian tax law; Rules 1
and 2 of `SYSTEM_PROMPT` exist to stop it using that.

So keep both asserts byte-identical and change the **input**: find a question that's still
out-of-corpus.

> ⭐ **Interview tip.** When a test breaks because the feature changed, don't force it green
> and don't delete it. **Re-express the invariant against the new behaviour.** Forcing it
> green keeps a test that proves nothing; deleting it loses real coverage.

### Finding an out-of-corpus question — empirically

Three constraints, and the third is the subtle one:

1. **tax-shaped enough** to route to `GST`/`Income-Tax`/`TDS`, or it lands in `General`, skips
   retrieval, and you're testing the Day-11 shortcut instead of the hallucination guard
2. **genuinely absent** from all 9 PDFs
3. **something the model definitely knows from pretraining** — otherwise the test passes for
   the wrong reason. A refusal only proves restraint if the model *could* have answered.

Constraint 2 is not a matter of opinion:

> ⭐ **Absence is an empirical claim.** "The corpus doesn't cover X" is a fact about 2106
> chunks. Your intuition about 9 PDFs you've never fully read is worthless. Check it, or the
> test rests on a belief that rots the next time someone adds a file.

Grepping candidates across all 9 PDFs:

| candidate | hits |
|---|---|
| `capital gain` | 51 |
| `customs duty` | 26 |
| `excise duty` | 25 |
| `advance tax` | 6 |
| **`professional tax`** | **0** |
| `gift tax`, `road tax`, `property tax` | 0 |

`professional tax` wins all three constraints: absent, and a tax every salaried Indian
actually pays, so the model knows it cold.

```python
b = ask("What is the professional tax deducted from salary in Karnataka?")
```

It routed to `General`, not `Income-Tax` — so the assert passes for the weaker reason
(shortcut, not guard). Noted, not fixed.

---

## 9. The main event: rank 17

The new TDS assert, asserting the *opposite* of the old one:

```python
d = ask("What is the TDS rate on rent under section 194I?")
assert d["sources"], "TDS is in the corpus - must cite something"
assert "don't have enough information" not in d["answer"]
```

It failed. The trace:

```
[route] TDS
[grade] no
[rewrite] What is the applicable TDS rate on rent under Section 194I, taking into account
          the payer's turnover, the supplier's registration status, ...
[grade] no
[rewrite] ...
[grade] no
[decide] giving up after 2 rewrites
TDS: I don't have enough information in my documents to answer that.
```

Routing worked. Retrieval returned `tds-rate-chart.pdf`. The grader said no, three times.

### Wrong turn #1 — accusing the grader

The 194-I text was found in the corpus at `tds-rate-chart.pdf` **pages 1 and 5**, and pages 1
and 5 *were* retrieved. Conclusion drawn: the grader threw away a correct chunk, because
PyMuPDF flattens the rate table into unreadable prose —

```
Section 194H: Commission or brokerage 2 Section 194-I: Rent a) Plant & Machinery 2
b) Land or building or furniture or fitting 10 Section 194-IA: ...
```

— and because the question says `194I` while every mention in the corpus is `194-I`.

`GRADE_PROMPT` was loosened accordingly: accept partial matches, accept flattened tables,
treat `194-I` as `194I`, reject only if off-topic.

**Same result. Still three `no`s.**

### Wrong turn #2 — page ≠ chunk

Printing the *full text* of all five retrieved chunks:

```
--- 1 {'source': 'tds-rate-chart.pdf', 'page': 2}   HAS 194-I: False
--- 2 {'source': 'tds-rate-chart.pdf', 'page': 5}   HAS 194-I: False
--- 3 {'source': 'income-tax-budget-2025.pdf', 'page': 10}  HAS 194-I: False
--- 4 {'source': 'tds-rate-chart.pdf', 'page': 1}   HAS 194-I: False
--- 5 {'source': 'income-tax-budget-2025.pdf', 'page': 19}  HAS 194-I: False
```

**Not one chunk contained `194-I`.** The grader was right all three times.

The error: `tds-rate-chart.pdf` averages **3724 chars per page**, and chunks are 600 chars.
That's ~7 chunks per page. "Page 1 contains the answer" and "the retrieved chunk from page 1
contains the answer" are completely different claims.

> 📦 **A page is a shelf; a chunk is a book on it.** Finding a fact "on page 1" tells you the
> shelf. Retrieval hands you one book. Six others on that shelf don't have it.

> ⭐ **Interview tip.** `{source, page}` metadata is a **citation**, not an index. It's there
> so a human can go look. Debugging retrieval requires the **chunk text**, and nothing else
> will do. Two wrong diagnoses came out of trusting a page number.

Note also what the retry loop did:

```
[rewrite] ...the payer's turnover, the supplier's registration status...
```

*Turnover* and *registration status* are **GST** concepts. The rewriter dragged a TDS question
toward the majority of the corpus. **A retry can move away from the answer.**

### The actual measurement

Where does the 194-I chunk rank?

| query | rank of the 194-I chunk |
|---|---|
| `What is the TDS rate on rent under section 194I?` | **17** |
| `TDS rate on rent for land or building` | **not in top 30** |
| `Section 194-I Rent Plant Machinery land building rate` | **1** |

`k=5` cannot reach rank 17. Phrased naturally, without the section number, the answer isn't
in the top 30 of 2106.

> ⭐ **Interview tip — the big one.** **Dense embeddings encode *aboutness*, not identifiers.**
> `194I` and `194J` differ by one character that carries the entire meaning; to a 384-dim
> sentence embedding they're near-identical strings in near-identical prose. This is the known
> weakness of dense retrieval: strong on *"what is this about"*, weak on **exact codes,
> section numbers, SKUs, dates, part numbers**. The keyword-stuffed query hits rank 1 because
> it matched the chunk's *vocabulary* — which is BM25's job, done accidentally by a vector.
>
> The production fix is **hybrid search**: BM25 keyword scores unioned with dense vectors, so
> a literal `194-I` token match scores too.
>
> And: **retrieval quality is measurable.** Pick queries, find the rank of the known-correct
> chunk. *"Retrieval feels bad"* is not a bug report. *"Correct chunk at rank 17, k=5"* is.

### Two decisions

**Revert `GRADE_PROMPT`.** It fixed a layer that wasn't broken.

> ⭐ **Revert a fix that didn't fix it.** Leaving it in "because it might help" means the next
> failure has two suspects instead of one. Same reason you delete dead code instead of
> commenting it out.

The loosened prompt also had a second flaw: the original strict line was left *above* the new
loose lines, so the prompt instructed both.

> ⭐ **Prompts fail by ambiguity, not by error.** Contradictory instructions don't throw — the
> model silently picks one, usually the last. That's the worst failure mode to debug, because
> there's no line to point at. It would have "worked", by accident.

**Change the test question** to what the corpus answers well — the rent *threshold*, which two
retrieved chunks already carried (`TDS threshold on rent has been increased to ₹ 6 Lakh from
₹ 2.4 Lakh`):

```python
d = ask("What is the TDS threshold on rent per year?")
```

```
[route] TDS
[grade] yes
TDS: The TDS threshold on rent is **₹ 6 lakh per year**.
SOURCES: [{'source': 'income-tax-budget-2025.pdf', 'page': 10}, ...]
```

This is not lowering the bar to get green. The invariant that changed today is *TDS questions
now get cited answers instead of a refusal* — that's what it checks. The identifier miss is a
separate defect, recorded where someone will hit it.

→ skipped: hybrid BM25 retrieval. Add when users actually ask by section number.

### Which layer was load-bearing

Before loosening the grader, one safety question had to be answered: does higher recall let
pretrained knowledge leak?

No. **The grader is a retry trigger, not the safety net.** `SYSTEM_PROMPT` Rule 1
(only-context) and Rule 2 (exact refusal) are the hallucination guard — and the professional-tax
assert proves they hold.

> ⭐ **Interview tip.** Know **which layer is load-bearing for safety.** Two components both
> look like they gate correctness; only one does. Tightening the wrong one costs recall and
> buys nothing.

---

## 10. The string nobody tested

`GREETING`, written Day 22, was still telling the truth of Day 22:

> I can help with **two things**:
> - **GST questions** answered from official government documents, with the source cited.
> - **Income tax** for FY 2025-26 under the new regime — **use the calculator tab.**

Chat had answered income tax and TDS for about ten minutes by then.

> ⭐ **Interview tip. The widening and the promise are two separate edits, and only one of
> them is enforced.** 31 asserts prove the routing works; not one reads that string. A
> capability you shipped but still tell users you don't have is invisible.

Note the greeting assert is `c["answer"] == GREETING` — your constant compared against
itself. It passes no matter what the string says, including typos. Exact-match is still
right (Day 22: *loose match what the model wrote, exact match what your code wrote*), but
understand what it does and doesn't cover: it protects the **plumbing**, never the **prose**.

---

## 11. Flashcards

| Q | A |
|---|---|
| 403 vs 404? | 403 = server refuses *you* → change who asks. 404 = path is dead → change what you ask for. |
| Doc and code disagree? | Code wins. Docs are claims about code. |
| "Which is stale?" | Often a question about **today's date**, not either artifact. |
| `chars/page ≈ 0` in a PDF? | Image-only scan. Extracts empty, no-ops silently, contributes nothing. |
| Is more corpus better? | No. Retrieval is competitive — irrelevant chunks degrade answers that worked. |
| `ModuleNotFoundError` on a sibling file? | Absolute import inside a package. Add the `.` |
| Why is wipe-and-rebuild safe? | The splitter is deterministic: same bytes in, same chunks out. |
| `Total chunks: N` printed — done? | No. Embedding happens after. Only the last `print` means done. |
| Wrong item in a tuple, no symptom? | An earlier `return` masks it. The diff that breaks it won't be the diff that has it. |
| A test breaks because the feature changed? | Re-express the invariant. Don't force green, don't delete. |
| Proving "the corpus doesn't cover X"? | Grep it. Absence is empirical. |
| `{source, page}` for debugging retrieval? | Useless — that's a citation. ~7 chunks per page. Print chunk text. |
| Why does dense retrieval miss `194I`? | Embeddings encode aboutness, not identifiers. Fix = hybrid BM25. |
| "Retrieval feels bad"? | Not a bug report. "Correct chunk at rank 17 with k=5" is. |
| Fix didn't fix it? | Revert it. Two suspects next time otherwise. |
| Contradictory lines in a prompt? | No error — model silently picks one. Worst thing to debug. |
| Which layer stops hallucination? | `SYSTEM_PROMPT` rules 1 & 2. The grader is only a retry trigger. |

---

## 12. Self-test

1. A teammate says "the tax API is broken, I get an error." What's your first question, and
   what four answers lead to four different actions?
2. `CLAUDE.md` says a function takes a hardcoded list. The function takes a directory scan.
   Which do you trust, and why is this not a close call?
3. A PDF extracts 0 characters. Where in this pipeline does that fail, and why is there no
   error message?
4. Explain why adding 1073 good chunks could make an existing GST answer *worse*.
5. `from chunk_docs import chunk_pdf` worked in Week 1 and throws in Week 5. Nothing in either
   file changed. What changed?
6. You predicted 2019 chunks and got 2106. Why is predicting first the important part, not
   being right?
7. You add `"Greeting"` to a tuple where it doesn't belong and every test passes. Describe the
   day this bites, and why the commit that breaks it won't be the commit that caused it.
8. An assert says a TDS question must be refused. You just made TDS answerable. Name the three
   possible moves and say which is right.
9. You need an out-of-corpus test question. Why is "something the model definitely knows" a
   requirement and not a nice-to-have?
10. You find a fact on page 1 of a PDF, and the retriever returned a chunk whose metadata says
    page 1. Why is that not the same chunk?
11. The 194-I chunk ranks 1st for a keyword-stuffed query and 17th for a natural one. What does
    that tell you about the retriever, and what's the fix?
12. You loosen a prompt, the behaviour doesn't change, and the failure has another cause. What
    do you do with the prompt change?
13. `assert c["answer"] == GREETING` passes with three typos in `GREETING`. Is the assert wrong?
14. Two features disagree about what the product can do. Why is that worse debt than slow code?

---

## 13. What shipped

**3 files, 20 insertions, 12 deletions. 29 → 31 asserts.**

| File | Change |
|---|---|
| `backend/ingestion/embed_and_store.py` | `from .chunk_docs import …` — relative sibling import |
| `backend/rag/graph.py` | `in ("GST", "Income-Tax", "TDS")`; stale comment deleted; refusal assert → professional tax; TDS assert flipped to expect citations |
| `backend/rag/generator.py` | `GREETING` names all three covered topics |

Corpus **1033 → 2106 chunks**, 5 → 9 PDFs (8 useful; `gst-circular.pdf` is still an image scan).

Parked, deliberately:

- **hybrid BM25 retrieval** — exact-section questions fail (rank 17). Add when users ask by section number.
- **calculator slabs are FY 2025-26** — current FY is 2026-27. Money logic, own branch.
- **corpus spans two fiscal years** — citations keep it honest. A `year` metadata filter is the eventual fix.
- **professional-tax assert routes `General`** — passes for a weaker reason than intended.
- **PyMuPDF flattens tables.** `page.find_tables()` exists. Every rate chart in the corpus has this damage.

**Bugs: 1 typed (`"Greeting"` in the tuple), 1 silent.** 27 across Days 16-24, 20 silent.
Plus two wrong diagnoses by Claude — grader blamed, then a page number trusted — both caught
by printing the actual data.

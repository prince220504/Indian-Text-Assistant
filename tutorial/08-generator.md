# Tutorial 08 — The Generator (Groq + grounded, cited answers) — Week 2 D2

> **What you'll be able to recall after re-reading this:** why an LLM hallucinates and what actually stops it; why "answer only from the context" is *not enough* on its own; the difference between the system and user message and why the rules must live in system; why `format_docs` keeps metadata; why `temperature=0` for a factual assistant; and how `.invoke()` returns an `AIMessage`, not a string.

>
> **How to use this doc:** read top-to-bottom the first time. After that jump to any boxed **Analogy**, the **60-second recall**, or the **Interview flashcards**.

---

## Where this fits

Week 1 built ingestion (Tutorials 01–06). Week 2 D1 built the **retriever** ([Tutorial 07](07-retriever.md)) — ask it a question, get 5 chunks of GST PDF text back. It answers nothing; it fetches.

```
INGESTION (Week 1):  PDFs → chunks → vectors → disk               ✅ merged
QUERY (Week 2):      question → retriever → GENERATOR → answer     ▲ you are here
```

New file — `backend/rag/generator.py`. This is the part that **reads** the 5 chunks and **writes** the answer.

---

## Concept 1 — The junior clerk

> **🧠 Analogy — the junior clerk at a CA office.** A client walks in with a tax question. The clerk does **not** answer from memory — he's junior, his memory is unreliable, and a wrong answer means the client files a wrong return and gets a notice.
>
> Office rule: the **peon** (the retriever, Tutorial 07) fetches 5 relevant pages from the govt circular files and drops them on the desk. The clerk then:
> 1. Reads **only** those 5 pages.
> 2. Writes the answer in plain language.
> 3. Notes at the bottom: *"as per FAQ on GST, page 42"* — so the client can verify.
> 4. If the 5 pages don't cover it, he says **"I don't know, sir."** He does not invent a number.
>
> That clerk is `generator.py`. Groq's Llama is his brain. The **office rule is the prompt you write.**

---

## Concept 2 — Hallucination, and the two-part cure

An LLM with no context is a **confident liar**. Ask Llama *"what's the GST registration threshold?"* cold and it answers — maybe ₹20 lakh, maybe ₹40 lakh, maybe a number that changed in 2019. It has no internal signal separating *remembering* from *inventing*.

RAG fixes it by changing the question asked. Not:

> "What is the GST registration threshold?"

But:

> "Here are 5 pieces of official govt text. **Using only these**, what is the GST registration threshold? If they don't say, reply 'I don't know'. Cite which document and page you used."

Same model, same frozen weights, nothing fine-tuned — the answer is now **grounded**. This is the Day 1 "open-book exam" finally being taken.

### Why the restriction alone fails

"Answer only from the context" is a **restriction** — it says what the model *can't* use. It gives the model nowhere to go when the context is empty.

An LLM always produces a next token. There is no built-in abstain button, and it's trained to be helpful — a blank answer reads as failure to it. Restrict it *without* an exit and it does the only thing it can: stretches the context until something answer-shaped falls out. It grabs a nearby number from an unrelated paragraph and presents it as the threshold.

`"say I don't know"` is the **exit**.

| | Result |
|---|---|
| Restriction only | Creative. Model bends the context to produce *something*. |
| Restriction **+ exit** | Grounded. Model has a legal way to fail. |
| Restriction + exit + **citation** | Verifiable. A human can check the page. |

⭐ **Interview tip:** *"You must give the model a permitted failure mode, or it will invent a success."* Asked "how do you reduce hallucination in RAG?", most candidates say only "instruct it to use the context". Naming all three layers — grounding instruction, explicit escape hatch, citations — is what sounds like you've shipped one.

---

## Concept 3 — `format_docs`: the LLM can't eat Python objects

`retrieve(query)` returns a list of `Document` objects. Each is a box with two compartments:

```python
Document(page_content="...the actual GST text...",
         metadata={"source": "faq-on-gst.pdf", "page": 42})
```

Groq's API takes **one string**. So 5 boxes must be flattened into one text block.

The lazy version works and is wrong:

```python
"\n".join(d.page_content for d in docs)   # ✗ throws metadata away
```

`metadata` is `{source, page}` — the citation data you stamped onto every chunk back on Day 4 ([Tutorial 04](04-splitting-chunks.md)). Throw it away here and the model receives 5 anonymous walls of text. Now re-read the rule *"always cite your sources"* — cite them **how?** No filename, no page, nothing to copy. The model either refuses to cite or **invents a plausible-looking citation**, which is worse than none: a fake page number a user might actually go check.

> **A citation instruction is only as good as the labels in the context.** The prompt can't cite what the formatter discarded.

So flatten **with the label attached**:

```
[Source 1: faq-on-gst.pdf, page 42]
...text of chunk 1...

[Source 2: gst-concept-2019.pdf, page 7]
...text of chunk 2...
```

```python
def format_docs(docs):
    """Flatten retrieved Documents into one labelled text block for the prompt."""
    blocks = []
    for i, doc in enumerate(docs, start=1):
        source = doc.metadata.get("source", "unknown")
        page = doc.metadata.get("page", "?")
        blocks.append(f"[Source {i}: {source}, page {page}]\n{doc.page_content}")
    return "\n\n".join(blocks)
```

- `enumerate(docs, start=1)` — same trick as the PyMuPDF page loop in Tutorial 03. Humans count from 1.
- `.get("source", "unknown")` not `["source"]` — a chunk missing metadata gives a fallback instead of crashing the whole answer.
- `"\n\n".join(...)` — blank line between blocks. LLMs read whitespace structure; a clear gap signals *5 separate documents*, not one run-on wall.

The model never needs to know what a PDF is. It copies the label sitting above the text. **That's all a citation is, mechanically.**

---

## Concept 4 — System vs user message

You don't send a chat model one string. You send a **list of messages**, each with a role:

| Role | Who's speaking | What goes here |
|---|---|---|
| `system` | the office manager | standing rules — identity, tone, constraints |
| `user` (`"human"` in LangChain) | the client | this turn's question + the fetched pages |
| `assistant` | the model | its reply (becomes memory in D3) |

Back to the CA office: **system** is the rule sheet pinned above the desk — never changes, applies to every client. **user** is today's client walking up with a question and a stack of files.

⭐ **Interview tip — "difference between system and user prompt?"** System carries *behaviour that persists across turns*; user carries *this turn's payload*. Practical consequence: grounding rules go in `system`, never in `user`, because once you add conversation memory the old user messages scroll out of the window and get truncated — **the system message stays pinned.** Rules pasted into the user message quietly stop applying a few turns in. That's a real bug people ship.

```python
SYSTEM_PROMPT = """You are a tax assistant for Indian freelancers and small business owners.

Rules you must follow:
1. Answer ONLY using the context provided below. Do not use any outside knowledge.
2. If the context does not contain the answer, reply exactly: "I don't have enough information in my documents to answer that." Do not guess.
3. Always cite your sources at the end, like: (Source: filename.pdf, page 12)
4. Answer in plain, simple English. Explain tax jargon if you use it.
"""

USER_PROMPT = """Context:
{context}

Question: {question}"""
```

Three deliberate choices:

- **"Do not use any outside knowledge"** — without it the model blends half-remembered training GST with the context. The blend is the dangerous output: it *looks* grounded, cites a real page, and slips in a number that page never said.
- **`reply exactly: "..."`** — an exact refusal string beats "say you don't know". A vague instruction produces a vague refusal that trails off into a guess. An exact string is easy to obey, and the Week 2.5 grader can literally string-match it to detect failed retrieval.
- **`{context}` / `{question}`** — plain Python `str.format` placeholders, filled per call.

---

## Concept 5 — `temperature=0`

An LLM picks each next word from a probability distribution. **Temperature** controls how much randomness is allowed in that pick.

| Temperature | Behaviour | Good for |
|---|---|---|
| `0` | always the most likely token; same input → same output | facts, extraction, RAG |
| `0.7` | sometimes the 2nd or 5th choice | chat, brainstorming |
| `1.5` | wandering, inventive | poetry, fiction |

*"What is the GST registration threshold?"* has exactly one correct answer. An assistant that says ₹20 lakh on Monday and ₹40 lakh on Tuesday is worse than useless.

**Keep these two failure modes separate — they are different layers:**

| Problem | Cause | Fix |
|---|---|---|
| Model invents facts it never read | no context / no rules | retrieval + prompt rules |
| Same question gives a different answer each run | random sampling | `temperature=0` |

Prompt rules can't fix the second: the rules are obeyed *and* the sampling is still random.

⭐ **Interview tip:** "What temperature for RAG?" → `0`, and the reason is **reproducibility**, not just accuracy. You cannot debug, test, or evaluate a system whose output changes on identical input.

---

## Concept 6 — The call

```python
# module-level: build the client once, reuse for every question
llm = ChatGroq(
    model="llama-3.3-70b-versatile",
    temperature=0,        # factual task — same question must give same answer
)


def answer(query):
    """Retrieve context for the query, then ask the LLM for a cited answer."""
    docs = retrieve(query)                       # Tutorial 07 component: 5 chunks
    context = format_docs(docs)                  # -> one labelled text block

    messages = [
        ("system", SYSTEM_PROMPT),
        ("human", USER_PROMPT.format(context=context, question=query)),
    ]

    response = llm.invoke(messages)              # the actual Groq API call
    return response.content                      # .content = just the text
```

- **`llm` module level, `answer()` per call** — same rule as the retriever (Tutorial 07, Concept 2). Building the client reads config and sets up an HTTP session; no reason to redo it per question.
- **`("system", ...)` tuples** — LangChain accepts plain `(role, text)` pairs and converts them into `SystemMessage` / `HumanMessage`. `"human"` is LangChain's name for the `user` role.
- **`.invoke(...)`** — the universal Runnable verb again. Retriever `.invoke` → docs. LLM `.invoke` → message. One verb, whole framework.
- **`response.content`** — `.invoke` returns an `AIMessage` (text + token counts + metadata), **not a string**. `.content` pulls the text out.

### Loading the key

```python
import os
from dotenv import load_dotenv

load_dotenv()

if not os.getenv("GROQ_API_KEY"):
    raise RuntimeError("GROQ_API_KEY missing from .env")
```

`load_dotenv()` reads the gitignored `.env` and copies its values into `os.environ` — the same place real environment variables live. Why bother? On Railway (Week 6) there **is** no `.env`; you set `GROQ_API_KEY` in the dashboard and it arrives as a real env var. `os.getenv(...)` reads it either way. **Same code local and deployed** — that's the whole point of the pattern.

The `raise` guard is three lines that save twenty minutes: without it, a missing key surfaces later as a cryptic `401 Unauthorized` from Groq's servers. **Fail at the boundary, not deep inside.**

---

## The self-check that stays

Testing only the happy path proves nothing about rule 2 — and rule 2 is the one that matters. So the `__main__` tests **both paths**, permanently:

```python
if __name__ == "__main__":
    # happy path: in-corpus question must produce a cited answer
    a = answer("What is the GST registration threshold?")
    print(f"IN-CORPUS:\n{a}\n")
    assert "Source:" in a, "expected a citation"

    # refusal path: out-of-corpus question must NOT be answered from memory
    b = answer("What is the TDS rate on rent under section 194I?")
    print(f"OUT-OF-CORPUS:\n{b}\n")
    assert "don't have enough information" in b, "model hallucinated outside its corpus"

    print("OK - grounded + refuses")
```

The out-of-corpus question is chosen carefully: **real Indian tax law, zero coverage in the GST-only corpus.** The model definitely saw section 194I during training. If it answers, it reached into memory despite rule 1 — hallucination caught red-handed.

Why keep it after passing by hand once? Because Week 2.5 edits `SYSTEM_PROMPT` while building the grader. If a reworded rule quietly kills the refusal, this file screams on the next run instead of you shipping a confident-liar bot. Two asserts, permanent guard.

### Actual run

```
IN-CORPUS:
The GST registration threshold for small businesses is as follows:
- For suppliers of services, the threshold is Rs 20 lakhs (Rs 10 lakhs in certain cases).
- For suppliers of goods, the threshold is Rs 40 lakhs (Rs 20 lakhs in certain cases).
- In case of North Eastern States, the threshold is Rs 10 lakhs for small businesses.

(Source: gst-concept-2019.pdf, page 46, gst-concept-2018.pdf, page 33)

OUT-OF-CORPUS:
I don't have enough information in my documents to answer that. (Source: None)

OK - grounded + refuses
```

Correct thresholds, special-category states, **verifiable page numbers**, and it cited **two** documents unprompted — the label format is legible to the model. Then the refusal fires word-for-word on a question the model certainly "knows".

Note the refusal still appended `(Source: None)` — rule 3 said *always* cite, so it obeyed both rules at once. Harmless; Week 2.5's grader intercepts these before a user ever sees them.

---

## Bugs hit while building (find-them-yourself log)

| Bug | Symptom | Lesson |
|---|---|---|
| `doc.page_contents` | `AttributeError` at **runtime**, after a 90 MB model load and a Chroma hit | Attribute typos are never import-time errors — that's why every component gets a `__main__` self-check before wiring it into anything bigger |
| `]` placed after the content instead of after the page label | label malformed, citation garbled | The label format *is* the citation contract |
| `that.""` — stray quote in the refusal string | prompt text wrong; the grader's exact match would break silently later | A prompt is code — typos in it are bugs |

---

## 60-second recall

1. **The generator reads what the retriever fetched and writes the answer.** Retriever fetches, generator answers.
2. **Hallucination cure has three layers:** grounding instruction, **explicit escape hatch**, citations.
3. **Restriction without an exit produces creativity.** No permitted failure mode → the model invents a success.
4. **`format_docs` must keep metadata** — a citation instruction is only as good as the labels in the context.
5. **Rules go in `system`, payload in `user`.** System stays pinned; user messages get truncated once memory exists.
6. **Exact refusal string** > vague "say you don't know" — obeyable, and string-matchable by the grader.
7. **`temperature=0`** for reproducibility. Different layer from grounding.
8. **`.invoke()` returns an `AIMessage`**, not a string — `.content` is the text.
9. **`load_dotenv()` + `os.getenv`** = same code local and on Railway.
10. **Test the refusal path, not just the happy path** — the refusal is the rule that actually matters.

---

## Interview flashcards

**Q: How do you reduce hallucination in a RAG system?**
A: Three layers. (1) Grounding instruction in the system prompt — answer only from the retrieved context, no outside knowledge. (2) An explicit escape hatch — an exact "I don't know" sentence, because a model with no permitted failure answer will invent a success to avoid producing nothing. (3) Citations with source and page, so a human can verify. Retrieval quality filtering (a relevance grader) sits on top.

**Q: Difference between the system and user message?**
A: System carries behaviour that persists across turns — identity, constraints, tone. User carries this turn's payload. Grounding rules belong in system because user messages are truncated first when conversation history exceeds the context window; system stays pinned.

**Q: Why `temperature=0` for RAG?**
A: Reproducibility above all — you can't debug, test, or evaluate a system whose output changes on identical input. It also stops the model from picking a lower-probability, less-supported phrasing. It does *not* address hallucination from missing context; that's the prompt's and retriever's job.

**Q: Your model cites a page number that doesn't exist. What went wrong?**
A: Most likely the context sent to the model had no source labels — the formatter dropped `metadata` — so the model fabricated a plausible citation to satisfy the "always cite" rule. Fix in the formatter: label each chunk with its `{source, page}` before it reaches the prompt.

**Q: What does `llm.invoke(messages)` return?**
A: An `AIMessage` — the generated text in `.content`, plus response metadata like token usage and finish reason. Not a plain string.

**Q: Why is `ChatGroq` built at module level?**
A: Same principle as the embedding model — client construction (config, HTTP session) is setup, not per-request work. Per-question work goes in the function.

**Q: Why load API keys with `python-dotenv` instead of hardcoding or reading a config file?**
A: `load_dotenv()` populates `os.environ` from a gitignored `.env` locally, while in production the platform injects real env vars. The application code reads `os.getenv` in both cases, so nothing changes between local and deploy, and no secret enters git.

---

## Self-test

1. Delete rule 2 (the exact refusal sentence) and ask a TDS question. Predict what the model does *before* you run it.
2. Replace `format_docs` with `"\n".join(d.page_content for d in docs)`. What exactly happens to the citation line, and why is that worse than getting no citation at all?
3. Move the grounding rules from `SYSTEM_PROMPT` into `USER_PROMPT`. It works today. In which week does it break, and why?
4. `answer()` currently sends all 5 chunks, including the 2 junk hits from Tutorial 07. Name one way that hurts the answer, and say which future node fixes it.
5. `response.content` — what else is on the object, and which field would you log to track your Groq spend?
6. Why is the out-of-corpus test question chosen from **income tax** rather than something nonsensical like "what is the capital of Mars"?

---

**Next:** Tutorial 09 — wiring retriever + generator into a chain with **conversation memory**, so follow-up questions like *"and for services?"* actually work.

# Tutorial 09 — Conversation Memory (the standalone-question rewrite) — Week 2 D3

> **What you'll be able to recall after re-reading this:** why "adding memory" to a RAG bot is *not* pasting the chat history into the prompt; what a condense / standalone-question step is and why it must run **before** retrieval; why `condense()` returns early on an empty history; why history stores the user's original words and not the rewrite; and what `ConversationalRetrievalChain` was actually doing under the hood.
>
> **How to use this doc:** read top-to-bottom the first time. After that jump to any boxed **Analogy**, the **60-second recall**, or the **Interview flashcards**.

---

## Where this fits

Week 2 D1 built the **retriever** ([Tutorial 07](07-retriever.md)) — question in, 5 chunks out. D2 built the **generator** ([Tutorial 08](08-generator.md)) — 5 chunks in, grounded cited answer out. Both are **stateless**: they know nothing about anything you asked before.

```
QUERY PIPELINE
  D1  question  → retriever → 5 chunks          ✅
  D2  5 chunks  → generator → cited answer      ✅
  D3  follow-up → CONDENSE → (D1 → D2)          ▲ you are here
```

New file — `backend/rag/chat.py`. It does not replace anything. It sits **on top** and neither component below learns that conversations exist.

---

## Concept 1 — The help-desk counter

> **🧠 Analogy — the govt help desk.** You walk up and ask: *"What is the GST registration threshold?"* The clerk answers. Then you say:
>
> *"and for services?"*
>
> You did not repeat "GST", you did not repeat "registration threshold". You leaned on what was already said. Every human handles this without noticing.
>
> Now imagine the desk works like this: the clerk never fetches files himself. He shouts your question through a window to a **peon** in the record room, and the peon brings back 5 pages. The peon has been in the record room all day. He has heard nothing. He hears only the sentence *"and for services?"* — and goes looking for files about services.
>
> The peon is your retriever. It does not have amnesia by accident; it is **stateless by design**.

---

## Concept 2 — Why the obvious fix is the wrong fix

Ask anyone how to add memory to a chatbot and you get: *"keep the messages in a list and put them in the prompt."* For a plain LLM chatbot that is completely correct. For RAG it is a trap.

Trace `"and for services?"` through the pipeline as written on Day 7:

```
"and for services?"
     ↓ embed
vector meaning roughly "something about services"
     ↓ Chroma similarity search
5 chunks about services in general — mostly junk
     ↓ generator
"I don't have enough information in my documents to answer that."
```

Now add history to the generator's prompt. What changes? The generator now *understands* the question perfectly. And it still has **only those 5 junk chunks** to answer from — it never sees your documents, only what the retriever handed it. So it refuses, or worse, stretches the junk into an answer.

> **The bad retrieval already happened. Nothing downstream can undo it.**

That single line is the whole tutorial. History in the generator's prompt fixes *comprehension*. The failure was in *fetching*. Wrong layer.

| Where you put the memory | Fixes | Doesn't fix |
|---|---|---|
| Generator prompt | model understands the follow-up | retriever fetched the wrong chunks |
| **Before retrieval (condense)** | **the query itself is self-contained** | — |

---

## Concept 3 — The condense step

One extra LLM call, one job: **translate a follow-up into a question that stands on its own.** It does not answer anything.

```
history:    Q: What is the GST registration threshold?
            A: Rs 20 lakh for services, Rs 40 lakh for goods...
follow-up:  "and for services?"
                    ↓  condense LLM call
standalone: "What is the GST registration threshold for suppliers of services?"
                    ↓
            retrieve() → answer()   ← Day 6 + Day 7, completely untouched
```

The rewritten string is self-contained, so the stateless retriever does the right thing while remaining stateless. Memory lives in exactly one new place.

**The cost is real and it is the price of admission:** two LLM calls per turn instead of one. The condense call is small (a few hundred tokens, no retrieved context in it), and there is no cheaper correct option. Every conversational RAG system pays it.

⭐ **Interview tip:** this is precisely what LangChain's `ConversationalRetrievalChain` does internally — its "question generator" *is* this step. We built it as ~25 plain lines instead of importing the class, because the class hides the one idea worth understanding. (It is also deprecated in LangChain 0.3, so knowing the mechanism outlives knowing the import.)

---

## Concept 4 — Memory is a list

```python
# ponytail: plain list, not ConversationBufferMemory - it IS a list with ceremony
history = []
```

`ConversationBufferMemory` (also deprecated) stores tuples in a list and gives you methods to put things in and take things out. That is a list. Module level, same reasoning as the embedding model and the Groq client: it must survive across calls.

---

## Concept 5 — The condense prompt

```python
CONDENSE_PROMPT = """Given the conversation below and a follow-up question,
rewrite the follow-up as a STANDALONE question that makes sense on its own.

Rules:
- Fill in anything the follow-up left implicit (topic, subject, tax type).
- Do NOT answer the question. Output only the rewritten question, nothing else.
- If the follow-up is already standalone, return it unchanged.

Conversation:
{history}

Follow-up question: {question}

Standalone question:"""
```

Every line earns its place:

- **"Do NOT answer the question"** — you are handing an LLM a question and a pile of conversation. Its every instinct is to answer. If it answers, that answer becomes your search query. Garbage into Chroma.
- **"Output only the rewritten question, nothing else"** — without it you get *"Sure! The standalone question is: ..."* and that preamble gets embedded along with the query.
- **"If already standalone, return it unchanged"** — the no-op case must be explicitly permitted. Same shape as Day 8's escape-hatch lesson: **a model given no legal way to do nothing will do something.**
- **Ends with `Standalone question:`** — the prompt stops mid-sentence, so the most natural continuation is the question itself. Cheap steering.

---

## Concept 6 — The early return

```python
def condense(question):
    """Rewrite a follow-up into a standalone question using the chat history."""
    if not history:
        return question   # nothing to resolve against - and no anchor = model invents context

    convo = "\n".join(f"Q: {q}\nA: {a}" for q, a in history)
    prompt = CONDENSE_PROMPT.format(history=convo, question=question)
    return llm.invoke(prompt).content.strip()   # .strip() - this string gets embedded
```

**Two reasons for the guard, and the second is the interesting one.**

1. **Nothing to resolve.** Turn one has no backward references. No work to do, and you skip a paid API call.
2. **An empty history invites invention.** The model must still emit something. With no conversation to anchor to, it fills the gap from imagination: *"What is the GST registration threshold?"* comes back as *"What is the GST registration threshold for freelancers in Maharashtra for FY 2024-25?"* — and your retrieval is now **worse than if you had done nothing at all.**

Same failure family as Tutorial 08, Concept 2: give the model no material and no exit, and it invents. Here the exit is the `if` statement in Python, not a sentence in the prompt.

**`.strip()`** — this string goes straight into `retrieve()` and gets embedded into a vector. A trailing newline is noise in that vector. Two words of insurance.

**`llm.invoke(prompt)`** takes a bare string here, not the `[("system", ...), ("human", ...)]` list from Day 7. Both are valid: a plain string is treated as a single human message. One instruction, one message, no ceremony needed.

---

## Concept 7 — The turn

```python
def chat(question):
    """One conversational turn: resolve the follow-up, answer it, remember it."""
    standalone = condense(question)      # memory applied BEFORE retrieval
    reply = answer(standalone)           # Day 6 + Day 7 pipeline, untouched and stateless

    history.append((question, reply))    # store what the user actually typed, not the rewrite
    return reply
```

Four lines. The whole memory feature. The work went into deciding **where** the rewrite happens, not into machinery — that is what a correct design buys you.

### Why store `question` and not `standalone`?

Both keep memory functional, so the tiebreak is elsewhere. Two reasons:

- **Drift.** Turn 3 would condense against turn 2's rewrite, which condensed against turn 1's rewrite. Errors compound: one wrong assumption baked into an early rewrite silently poisons every later one. Storing the real words re-anchors every rewrite to what the user actually said.
- **Reuse.** In Week 3 this list goes to Postgres and to the React chat window. Users must see their own words, not the machine's paraphrase of them.

---

## The self-check that stays

```python
if __name__ == "__main__":
    q1 = "What is the GST registration threshold?"
    print(f"Q1: {q1}\nA1: {chat(q1)}\n")

    q2 = "And for services?"
    standalone = condense(q2)   # extra call, only so we can SEE the rewrite
    print(f"Q2: {q2}\nREWRITTEN: {standalone}\n")
    assert "GST" in standalone, "condense lost the topic from history"

    a2 = chat(q2)
    print(f"A2: {a2}\n")
    assert "don't have enough information" not in a2, "follow-up broke retrieval"

    print("OK - follow-up resolved + answered")
```

Two asserts, two different failures:

- `"GST" in standalone` catches the **condense step** dropping the topic — the direct unit check.
- The refusal string **absent** from `a2` catches the **end-to-end** failure. If condense silently returns something useless, retrieval fetches garbage and Day 7's refusal fires. **Day 7's safety feature is now Day 8's test signal** — that is what an exact refusal string buys you (Tutorial 08, Concept 4).

### Actual run

```
Q1: What is the GST registration threshold?
A1: The GST registration threshold for suppliers of services is Rs. 20 lakhs, and for
certain cases, it is Rs. 10 lakhs. For suppliers of goods, the threshold is Rs. 40 lakhs,
and for certain cases, it is Rs. 20 lakhs. (Source: gst-concept-2019.pdf, page 46)

Q2: And for services?
REWRITTEN: What is the GST registration threshold for suppliers of services?

A2: The GST registration threshold for suppliers of services is Rs. 20 lakhs. However,
in certain cases, such as in the States of Manipur, Mizoram, Nagaland, and Tripura, the
threshold is Rs. 10 lakhs. (Source: gst-concept-2019.pdf, page 46 and page 20)

OK - follow-up resolved + answered
```

Two things worth staring at:

1. The rewrite contains the word **"suppliers"** — which appears nowhere in `"And for services?"`. It came out of **A1**. That is the history doing its job, visibly.
2. A2 found the Manipur / Mizoram / Nagaland / Tripura ₹10 lakh detail that A1 had compressed into "certain cases". Nothing changed in the retriever or the generator — the *query* got narrower, so the retrieved chunks got narrower. **Better question in, better retrieval out.** Query quality is a retrieval lever, not just a UX nicety.

---

## What was deliberately skipped

| Skipped | Add when |
|---|---|
| History size cap | Every turn grows the condense prompt. Add `history[-5:]` in `condense()` once real conversations get long enough to notice the token cost. |
| Multiple concurrent conversations | `history` is one global list — fine for a script. Week 3 moves it per-session into Postgres. |
| `ConversationalRetrievalChain` / `ConversationBufferMemory` | Never. Both deprecated in LangChain 0.3, and both hide the one concept in this file. |

---

## 60-second recall

1. **Retriever and generator are stateless.** The conversation layer sits on top; they never learn about it.
2. **Memory goes before retrieval, not after.** Retrieval happens first and cannot be fixed after the fact.
3. **History in the generator's prompt fixes comprehension, not fetching.** The generator only sees the chunks the retriever already picked.
4. **Condense = one extra LLM call** that rewrites a follow-up into a standalone question. Cost of admission for conversational RAG.
5. **The condense prompt must forbid answering** — otherwise the answer becomes your search query.
6. **Empty history → return the question unchanged.** No anchor means the model invents context and makes retrieval worse.
7. **`.strip()` the rewrite** — it gets embedded; whitespace is noise in the vector.
8. **Store the user's original words in history**, not the rewrite: avoids compounding drift, and it's what the UI and DB need.
9. **Day 7's exact refusal string is now a test signal** for broken retrieval.
10. **A better question retrieves better chunks.** Query rewriting is a retrieval-quality lever.

---

## Interview flashcards

**Q: How do you add conversation memory to a RAG system?**
A: Not by pasting history into the answering prompt. Retrieval runs first and is stateless, so a follow-up like "and for services?" embeds to a meaningless vector and fetches junk — and no amount of history downstream fixes chunks that were never retrieved. You add a condense step *before* retrieval: one small LLM call takes the history plus the follow-up and emits a standalone, self-contained question, which then goes through the normal retrieve → generate pipeline.

**Q: What is a standalone-question rewrite?**
A: Turning a context-dependent follow-up into a question that makes sense with no conversation attached — "and for services?" becomes "What is the GST registration threshold for services?". It's what LangChain's `ConversationalRetrievalChain` calls its question generator.

**Q: What does that cost you?**
A: One extra LLM call per turn. It's small — history plus one question, no retrieved documents — and there's no cheaper correct alternative.

**Q: Why skip the condense call when history is empty?**
A: Nothing to resolve, so it's a wasted call — and worse, with no history to anchor on the model tends to invent qualifiers (locations, financial years) that were never asked for, which degrades retrieval below the do-nothing baseline.

**Q: Do you store the original question or the rewritten one in history?**
A: The original. Rewrites condensed off earlier rewrites compound errors, and the UI and chat-history database need the user's actual words.

**Q: Your bot answers the first question well but fails on every follow-up. Where do you look?**
A: The query that reaches the vector store. Log the string being embedded — almost always it's the raw follow-up, meaning there is no condense step, or it ran but returned a preamble like "Sure, here's the question:" that polluted the embedding.

---

## Self-test

1. Delete the `if not history` guard and run `chat()` on a fresh conversation. Predict what the rewritten first question looks like *before* you run it.
2. Remove `"Do NOT answer the question"` from `CONDENSE_PROMPT`. What exactly ends up inside `retrieve()`?
3. Change `history.append((question, reply))` to append `standalone` instead. It passes the current test. Describe a 3-turn conversation where it goes wrong.
4. Why does the second assert check for the *absence* of the refusal string rather than the presence of a citation?
5. `condense()` sends the full answer text of every past turn. Name one problem with that at turn 20, and the one-line fix.
6. The condense call uses the same `llm` as the generator — `llama-3.3-70b-versatile` at `temperature=0`. Argue for using a smaller, cheaper model for this step instead.

---

**Next:** Week 2.5 — LangGraph. The 4-node agentic graph, and the **relevance grader** that finally deals with the junk hits 4 and 5 from Tutorial 07.

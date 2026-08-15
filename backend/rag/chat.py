from generator import llm   # reuse Day 7's pipeline + the same Groq client
from graph import ask    # Day 9-11 graph replaces Day 7's answer()

# conversation so far: list of (question, answer) tuples.
# plain list, not conversationBufferMemory - it IS a list with ceremony 
history = []

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

def condense(question):
    """Rewrite a follow-up into a standalone question using the chat history."""
    if not history:
        return question     # nothing to resolve against - and no anchor = model invents context

    # flatten history into plain text the LLM can read
    convo = "\n".join(f"Q: {q}\nA: {a}" for q, a in history)

    prompt = CONDENSE_PROMPT.format(history=convo, question=question)
    return llm.invoke(prompt).content.strip()   # .strip() - this string gets embedded

def chat(question):
    """One conversational turn: resolve the follow-up, answer it, remember it."""
    standalone = condense(question)   # memory applied BEFORE retrieval
    reply = ask(standalone)   # full graph: route -> retrieve -> grade -> generate

    history.append((question, reply))   # store what the user actually typed, not the rewrite
    return reply

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

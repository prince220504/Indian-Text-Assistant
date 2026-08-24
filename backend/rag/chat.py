from .generator import llm   # reuse Day 7's pipeline + the same Groq client
from .graph import ask    # Day 9-11 graph replaces Day 7's answer()
from ..database import get_history, save_message   # Day 13: memory lives in Postgres now


CONDENSE_PROMPT = """Given the conversation below and a follow-up question,
rewrite the follow-up as a STANDALONE question that makes sense on its own.

Rules:
- Fill in anything the follow-up left implicit (topic, subject, tax type).
- Do NOT answer the question. Output only the rewritten question, nothing else.
- If the follow-up is already standalone, return it unchanged.
- If the follow-up is a greeting, thanks, or not a question at all, return it UNCHANGED.

Conversation:
{history}

Follow-up question: {question}

Standalone question:"""

def condense(question, history):
    """Rewrite a follow-up into a standalone question using the chat history."""
    if not history:
        return question     # nothing to resolve against - and no anchor = model invents context

    # flatten history into plain text the LLM can read
    convo = "\n".join(f"{role}: {content}" for role, content in history)

    prompt = CONDENSE_PROMPT.format(history=convo, question=question)
    return llm.invoke(prompt).content.strip()   # .strip() - this string gets embedded

def chat(question, session_id):
    """One conversational turn: resolve the follow-up, answer it, remember it."""
    history = get_history(session_id)   # per-session, from Postgres - no global, no mixing
    standalone = condense(question, history)   # memory applied BEFORE retrieval
    result = ask(standalone)   # full graph: route -> retrieve -> grade -> generate
    # {"answer": ..., "sources": [...]}

    save_message(session_id, "user", question)   # store what the user actually typed, not the rewrite
    save_message(session_id, "assistant", result["answer"])   # only prose goes in history
    return result

if __name__ == "__main__":
    import uuid
    from ..database import init_db

    init_db()
    sid = f"selftest-{uuid.uuid4()}"     # isolated session, so reruns start with empty memory

    q1 = "What is the GST registration threshold?"
    a1 = chat(q1, sid)
    print(f"Q1: {q1}\nA1: {a1['answer']}\nSOURCES: {a1['sources']}\n")

    q2 = "And for services?"
    standalone = condense(q2, get_history(sid))   # extra call, only so we can SEE the rewrite
    print(f"Q2: {q2}\nREWRITTEN: {standalone}\n")
    assert "GST" in standalone, "condense lost the topic from history"

    a2 = chat(q2, sid)
    print(f"A2: {a2['answer']}\nSOURCES: {a2['sources']}\n")
    assert "don't have enough information" not in a2["answer"], "follow-up broke retrieval"

    assert len(get_history(sid)) == 4, "turns not persisted as 2 rows each"

    print("OK - follow-up resolved + answered")

"""The /chat counter. Owns its request/response shapes and nothing else."""

from fastapi import APIRouter
from pydantic import BaseModel
from ..rag.chat import chat
from ..database import get_history

router = APIRouter()

class ChatRequest(BaseModel):
    question: str
    session_id: str     # client-supplied. NOT authentication - anyone who guesses an id reads that chat (Week 5: real auth)

class Source(BaseModel):
    source: str     # filename, straight from Day 4's chunk metadata
    page: int

class ChatResponse(BaseModel):
    answer: str
    sources: list[Source]

@router.post("/chat", response_model=ChatResponse)
def chat_route(req: ChatRequest):
    """Counter clerk: take the question, hand it to the graph, return answer + citations."""
    return chat(req.question, req.session_id)

class Message(BaseModel):
    role: str        # "user" or "assistant"
    content: str
    sources: list[Source] = []      # user rows and pre-migration rows have none

@router.get("/history/{session_id}", response_model=list[Message])
def history_route(session_id: str, limit: int = 20):
    """Withdrawal window: hand over an id, get that session's messages back, oldest first."""
    rows = get_history(session_id, limit)
    return [{"role": role, "content": content, "sources": sources or []} for role, content, sources in rows]

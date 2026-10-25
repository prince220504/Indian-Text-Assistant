"""The /chat counter. Owns its request/response shapes and nothing else."""

from fastapi import APIRouter, Depends
from datetime import datetime
from pydantic import BaseModel, Field
from ..rag.chat import chat
from ..database import get_history, get_sessions
from .auth import current_user

router = APIRouter()

class ChatRequest(BaseModel):
    question: str
    session_id: str     # WHICH of my chats - not WHOSE. Ownership comes from the token (Day 30)
    # capped here because THIS is the trust boundary - /upload's 5 MB guard doesn't protect this route.
    doc_text: str | None = Field(None, max_length=200_000)
    filename: str | None = None

class Source(BaseModel):
    source: str     # filename, straight from Day 4's chunk metadata
    page: int

class ChatResponse(BaseModel):
    answer: str
    sources: list[Source]

@router.post("/chat", response_model=ChatResponse)
def chat_route(req: ChatRequest, user_id: int = Depends(current_user)):
    """Counter clerk: take the question, hand it to the graph, return answer + citations."""
    return chat(user_id, req.question, req.session_id, req.doc_text, req.filename)

class Message(BaseModel):
    role: str        # "user" or "assistant"
    content: str
    sources: list[Source] = []      # user rows and pre-migration rows have none

@router.get("/history/{session_id}", response_model=list[Message])
def history_route(session_id: str, limit: int = 20, user_id: int = Depends(current_user)):
    """Withdrawal window: your token + a session_id -> that session's messages, oldest first. someone else's id -> []."""
    rows = get_history(user_id, session_id, limit)
    return [{"role": role, "content": content, "sources": sources or []} for role, content, sources in rows]

class SessionSummary(BaseModel):
    session_id: str
    title: str | None  # First question cut at 40; None only if a chat somehow has no user row
    last_at: datetime  # Pydantic sends it as an ISO string

@router.get("/sessions", response_model=list[SessionSummary])
def sessions_route(user_id: int = Depends(current_user)):
    """Sidebar list: your chats only, newest first. No token -> 401, no chat -> []."""
    rows = get_sessions(user_id)
    return [{"session_id": sid, "title": title, "last_at": last_at} for sid, title, last_at in rows]


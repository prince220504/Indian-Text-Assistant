"""The /chat counter. Owns its request/response shapes and nothing else."""

from fastapi import APIRouter
from pydantic import BaseModel
from ..rag.chat import chat

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

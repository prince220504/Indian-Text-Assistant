from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from backend.rag.chat import chat
from backend.database import init_db

app = FastAPI(title="Indian Tax Assistant API")

init_db()     # idempotent - creates the messages table on boot if it isn't there

@app.get("/health")
def health():
    """Cheap liveness check - proves the server is up without touching the LLM."""
    return {"status": "ok"}

class ChatRequest(BaseModel):
    question: str
    session_id: str   # client-supplied. NOT authentication - anyone who guesses an id reads that chat (Week 5: real auth)

class ChatResponse(BaseModel):
    answer: str

@app.post("/chat", response_model=ChatResponse)
def chat_route(req: ChatRequest):
    """Counter clerk: take the question, hand it to the graph, return the answer."""
    return ChatResponse(answer=chat(req.question, req.session_id))

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],     # Vite dev server (Week 4)
    allow_methods=["*"],
    allow_headers=["*"],
)

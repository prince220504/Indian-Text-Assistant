from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from backend.rag.chat import chat

app = FastAPI(title="Indian Tax Assistant API")

@app.get("/health")
def health():
    """Cheap liveness check - proves the server is up without touching the LLM."""
    return {"status": "ok"}

class ChatRequest(BaseModel):
    question: str

class ChatResponse(BaseModel):
    answer: str

@app.post("/chat", response_model=ChatResponse)
def chat_route(req: ChatRequest):
    """Counter clerk: take the question, hand it to the graph, return the answer."""
    return ChatResponse(answer=chat(req.question))

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],     # Vite dev server (Week 4)
    allow_methods=["*"],
    allow_headers=["*"],
)

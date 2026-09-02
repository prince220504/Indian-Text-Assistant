from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from backend.database import init_db
from backend.routes.chat import router as chat_router
from backend.routes.calculator import router as calculator_router

app = FastAPI(title="Indian Tax Assistant API")

init_db()     # idempotent - creates the messages table on boot if it isn't there

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],     # Vite dev server (Week 4)
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)     # plugs the /chat counter into the building
app.include_router(calculator_router)     # plugs the /calculate counter into the building

@app.get("/health")
def health():
    """Cheap liveness check - proves the server is up without touching the LLM."""
    return {"status": "ok"}


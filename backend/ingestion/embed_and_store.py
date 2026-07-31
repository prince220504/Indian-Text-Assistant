import os 
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma 
from chunk_docs import chunk_pdf, DOCS_DIR

CHROMA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "chroma_db")

def load_all_chunks():
    all_chunks = []
    for filename in os.listdir(DOCS_DIR):
        if filename.endswith(".pdf"):
            chunks = chunk_pdf(filename)
            all_chunks.extend(chunks)
            print(f"{filename}: {len(chunks)} chunks")
    return all_chunks

def embed_and_store():
    chunks = load_all_chunks()
    print(f"\nTotal chunks: {len(chunks)}")

    embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

    db = Chroma.from_documents(
        documents=chunks,
        embedding=embeddings,
        persist_directory=CHROMA_DIR,
    )
    print(f"Stored {len(chunks)} vectors in {CHROMA_DIR}")
    return db

if __name__ == "__main__":
    embed_and_store()

import os 
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma

CHROMA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "chroma_db")

embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
db = Chroma(persist_directory=CHROMA_DIR, embedding_function=embeddings)

def run_query(query, k=5):
    print(f"\nQ: {query}\n" + "=" * 60)
    results = db.similarity_search(query, k=k)
    for i, doc in enumerate(results, start=1):
        src = doc.metadata.get("source", "?")
        page = doc.metadata.get("page", "?")
        print(f"\n[{i}] {src} - page {page}")
        print(doc.page_content[:200].strip())

if __name__ == "__main__":
    run_query("What is the GST registration threshold?")

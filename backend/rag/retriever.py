import os
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma

# same 2-levels-up trick as embed_and_store.py - anchored to THIS file,
# so it works no matter which folder you run python from 
CHROMA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "chroma_db") 

# SAME model as ingestion. different model = different meaning-space = junk results
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

# Chroma(...) not chroma.from_documents(...) - from_documents BUILDS a new store,
# this one OPENS the existing one. we are reading, not writing.
vectorstore = Chroma(
    persist_directory=CHROMA_DIR,
    embedding_function=embeddings,
)

# turn the vectorstor into a standard LangChain Retriever component.
# search_kwargs={"k":5} = "always bring back 5 chunks", baked in.
retriever = vectorstore.as_retriever(search_kwargs={"k":5})

def retrieve(query:str):
    """Ask a question, get back 5 relevant chunks (list of Documents)."""
    return retriever.invoke(query)

if __name__ == "__main__":
    docs = retrieve("What is the GST registration threshold?")

    assert len(docs) == 5, f"expected 5 chunks, got {len(docs)}"
    assert docs[0].page_content.strip(), "top chunk is empty"

    for i,d in enumerate(docs, start=1):
        print(f"\n--- Hit {i} | {d.metadata['source']} p.{d.metadata['page']} ---")
        print(d.page_content[:200])

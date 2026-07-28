import os  
import fitz # PyMupdf - opens PDFs, extracts text
from langchain_text_splitters import RecursiveCharacterTextSplitter

# folder where D2 saved the downloaded PDFs
DOCS_DIR = os.path.join("data", "docs")

def extract_pdf(path):
    """Open one PDF, return list of (page_number, text) tuples."""
    doc = fitz.open(path) # open the PDF -> document object
    pages = []
    for page_num, page in enumerate(doc, start=1): # start=1 -> human page numbers
        text = page.get_text()   # pull words out of this page
        if text.strip():
            pages.append((page_num, text)) 
    doc.close()    # free the file
    return pages   

splitter = RecursiveCharacterTextSplitter(
    chunk_size=600,   # each chunk ~600 characters
    chunk_overlap=100, # repeat last 100 chars into next chunk (safety margin) 
)    

def chunk_pdf(filename):
    """Extract one PDF, split into ~600-char chunks, tag each with (source, page)."""
    path = os.path.join(DOCS_DIR, filename)
    pages = extract_pdf(path)   # list of (page_num, text)

    texts = [text for page_num, text in pages]  # just the page texts
    metadatas = [{"source": filename, "page":page_num} for page_num, text in pages]   # one dict per page = the citaion

    chunks = splitter.create_documents(texts, metadatas=metadatas)
    return chunks   # list of Document(page_content, metadata)

if __name__ == "__main__":
    pdf_files = [f for f in os.listdir(DOCS_DIR) if f.endswith(".pdf")]
    print(f"Found {len(pdf_files)} PDFs\n")

    all_chunks = []
    for filename in pdf_files:
        chunks = chunk_pdf(filename)
        all_chunks.extend(chunks)
        print(f"{filename}: {len(chunks)} chunks")

    print(f"\nTotal chunks across all PDFs: {len(all_chunks)}")

    # peek: first chunk + its citaion to confirm metadata rides along
    if all_chunks:
        sample = all_chunks[0]
        print("\nSample chunk metadata:", sample.metadata)
        print("Sample chunk text:", sample.page_content[:200].replace("\n"," "))

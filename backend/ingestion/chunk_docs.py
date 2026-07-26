import os  
import fitz # PyMupdf - opens PDFs, extracts text

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

if __name__ == "__main__":
    pdf_files = [f for f in os.listdir(DOCS_DIR) if f.endswith(".pdf")]
    print(f"Found {len(pdf_files)} PDFs\n")

    for filename in pdf_files:
        path = os.path.join(DOCS_DIR, filename)
        pages = extract_pdf(path)
        total_chars = sum(len(text) for page_num, text in pages)
        print(f"{filename}: {len(pages)} pages, {total_chars} chars")
        # peek at page 1 text to confirm it's real words, not garbage
        if pages != []:
            print("  preview:", pages[0][1][:120].replace("\n", " "), "\n")

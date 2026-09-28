"""The /upload counter. Takes a Form 16 PDF, hands back its text."""

import fitz
from fastapi import APIRouter, File, UploadFile, HTTPException
from pydantic import BaseModel

router = APIRouter()

MAX_BYTES = 5 * 1024 * 1024      # 5 MB. A Form 16 is 2-3 pages; anything bigger is not a Form 16.


class UploadResponse(BaseModel):
    """What the client gets back. Same pattern as ChatResponse - the shape is the contract."""
    filename: str
    pages: int
    text: str

def extract_text(data):
    """Bytes in, (page_count, text) out. Raises HTTPException with a human message on each failure mode."""
    try:
        doc = fitz.open(stream=data, filetype="pdf")    # stream = not a path: the bytes never hit disk
    except Exception:
        raise HTTPException(400, "Could not open this PDF. The file may be corrupted.") 

    # a locked PDF opens fine and even reports page_count - it only fails at get_text(). Check before reading
    if doc.needs_pass:
        raise HTTPException(400, "This PDF is password-protected. Remove the password and upload again.")

    pages = doc.page_count
    text = "\n".join(page.get_text() for page in doc)
    doc.close()

    # Day 24's gst-circular.pdf: 4 pages, 0 chars. A scan is pages of pictures, not words.
    if not text.strip():
        raise HTTPException(400, "No text found - this looks like a scanned image, not a text PDF.")

    return pages, text


@router.post("/upload", response_model=UploadResponse)
async def upload_route(file: UploadFile = File(...)):
    """Take one PDF, validate it hard, return its text."""

    # cheap check first: costs nothing, rejects the obvious. NOT security - a filename is client-supplied.
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are accepted.")

    data = await file.read()       
    # ponytail: not a real memory guard - the read above already happened. Real cap belongs in the proxy (Week 6).
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File too large. Maximum size is 5 MB.")

    pages, text = extract_text(data)

    return {"filename": file.filename, "pages":pages, "text":text}

if __name__ == "__main__":
    def make_pdf(text=None, encrypt=False):
        """Build a one-page PDF in memory. No text = a 'scan'. encrypt = a PAN-locked Form 16."""
        d = fitz.open()
        page = d.new_page()
        if text:
            page.insert_text((72,72), text)
        if encrypt:
            return d.tobytes(encryption=fitz.PDF_ENCRYPT_AES_256, owner_pw="o", user_pw="u")
        return d.tobytes()

    def fails_with(data, snippet):
        """Assert extract_text rejects bytes with a message containing snippet."""
        try:
            extract_text(data)
        except HTTPException as e:
            assert snippet in e.detail, f"wrong message: {e.detail}"
            return 
        assert False, f"expected a 400 mentioning {snippet!r}, but it sucessded"

    pages, text = extract_text(make_pdf("GROSS SALARY 1200000"))
    assert pages == 1, pages
    assert "SALARY" in text, text

    fails_with(b"this is not a pdf at all", "corrupted")
    fails_with(make_pdf("secret", encrypt=True), "password-protected")
    fails_with(make_pdf(), "scanned image")

    print("upload self-check: 5 check passed")

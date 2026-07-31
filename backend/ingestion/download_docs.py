import os
import requests

# Where downloaded PDFs land (relative to repo root - run script from root)
DOCS_DIR = 'data/docs'

# (url, filename) pairs - official govt tax PDFs only
DOCS = [
    ("https://cbic-gst.gov.in/pdf/01072018-GST-Concept-Status.pdf", "gst-concept-2018.pdf"),
    ("https://cbic-gst.gov.in/pdf/01042019_GST-Concept-Status.pdf", "gst-concept-2019.pdf"),
    ("https://cbic-gst.gov.in/aces/Documents/faq-on-gst.pdf", "gst-faq.pdf"),
    ("https://cbic-gst.gov.in/pdf/GST-Circular.pdf", "gst-circular.pdf"),
    ("https://cbic-gst.gov.in/pdf/instruction-02-2024-GST-12082024.pdf", "gst-instruction-2024.pdf"),
] 

# govt sites reject Python's default agent with 403 - pretend to be a browser
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
           "AppleWebKit/537.36 (KHTML, like Gecko)"
           "Chrome/120.0 Safari/537.36"}

def download_all():
    os.makedirs(DOCS_DIR, exist_ok=True) # create data/docs/ if missing

    for url, filename in  DOCS:
        path = os.path.join(DOCS_DIR, filename)

        if os.path.exists(path):
            print(f"skip(exists): {filename}")
            continue

        print(f"downloading: {filename} ...")
        resp = requests.get(url, headers=HEADERS, timeout=60)
        resp.raise_for_status()  # crash loudly on 403/404/500

        with open(path, "wb") as f:  # "wb" = write BINARY
            f.write(resp.content)
        print(f" saved {len(resp.content):,} bytes")

if __name__ == "__main__":
    download_all()

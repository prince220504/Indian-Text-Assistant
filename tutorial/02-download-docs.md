# Tutorial 02 — Downloading the Government Docs

> **What you'll be able to recall after re-reading this:** why the ingestion pipeline starts by downloading official govt PDFs, how to fetch a file with `requests`, why a browser `User-Agent` matters, and the small Python idioms that make the script safe to re-run (`os.makedirs`, `os.path.exists`, `"wb"`, `if __name__ == "__main__"`).
>
> **How to use this doc:** read top-to-bottom the first time. After that jump to any boxed **Analogy**, the **60-second recall**, or the **Interview flashcards**.

---

## Where this fits

Week 1 is the **ingestion pipeline** — building the library before any student arrives (see [Tutorial 01](01-rag-foundations.md)). A library needs books first. So the very first step is: **bring the official documents onto our disk.** That's this one script: `backend/ingestion/download_docs.py`.

The whole pipeline, and the arrow we just built:

```
[download PDFs] → load text → split into chunks → embed → store in ChromaDB
      ▲ you are here (Day 2)
```

---

## Concept 1 — Why official `.gov.in` PDFs only?

Our chatbot **cites its sources**. If it cites a random tax blog and that blog is wrong, a freelancer files taxes wrong and loses real money. So we feed it only **primary-source government documents** — the actual rulebooks.

> **🧠 Analogy — the courtroom**
> A lawyer doesn't quote a gossip column in court. They quote the actual law. Same here: only documents from official bodies (CBIC for GST, Income Tax Department, CBDT circulars) count as evidence. Rule of thumb: if the domain isn't a government one (`.gov.in`), it doesn't go in.

For Day 2 we downloaded 5 GST PDFs from **cbic-gst.gov.in** (the official GST portal): the *GST Concept & Status* booklets, the *FAQ on GST*, a circular, and a 2024 instruction.

> **Note on blocked sites:** `incometaxindia.gov.in` refused every automated download (see Concept 3). Income-tax / TDS docs get added later by grabbing working links from a browser. The download list is just a Python list — you extend it any time.

---

## Concept 2 — Fetching a file with `requests`

`requests` is *the* standard Python HTTP library. To download a file:

```python
resp = requests.get(url, headers=HEADERS, timeout=60)
resp.raise_for_status()          # throw if server said 403/404/500
with open(path, "wb") as f:      # "wb" = write BINARY
    f.write(resp.content)        # .content = raw bytes
```

Three things worth locking in:

- **`resp.content`** is the raw **bytes** of the file. (`resp.text` would be decoded string — wrong for a PDF.)
- **`"wb"` = write binary.** A PDF is bytes, not text. Open it in `"w"` (text mode) and the file corrupts. Binary files → always `"b"`.
- **`resp.raise_for_status()`** turns a bad HTTP status into a Python exception. Without it, a server error page gets silently saved *as if it were your PDF*. Fail loud, not quiet.

> **⭐ Interview tip:** `resp.content` (bytes) vs `resp.text` (decoded string) is a common gotcha. Files → `.content` + `"wb"`. JSON/HTML → `.text` or `.json()`.

---

## Concept 3 — The `403` and the `User-Agent` header

When we first tried the govt URLs with a plain automated client, the server replied:

```
403 text/html
```

`403 Forbidden` — the server **refused**. Not because the file was missing (that's `404`), but because it recognised us as a bot. Every HTTP request carries a **`User-Agent`** header saying who's asking. Python's default is literally `python-requests/2.34`, and many govt servers block that on sight.

The fix: **send a browser's User-Agent** so we look like Chrome.

```python
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                         "AppleWebKit/537.36 (KHTML, like Gecko) "
                         "Chrome/120.0 Safari/537.36"}
```

> **🧠 Analogy — the dress code**
> A club bouncer turns away anyone in a tracksuit (`python-requests`). Put on a suit (a browser User-Agent) and you walk in. The server only glances at what you're *wearing*, not who you *are*.

> **⭐ Interview tip:** "My scraper gets 403 but the site works in my browser" → first thing to try is a browser `User-Agent` header. (Some sites need a `Referer` too. A few — like `incometaxindia.gov.in` — use heavier bot protection that a header alone won't beat.)

---

## Concept 4 — Making the script safe to re-run

Two idioms keep the script from breaking or wasting bandwidth on repeat runs (**idempotency** — running twice does no harm):

```python
os.makedirs(DOCS_DIR, exist_ok=True)   # (1) create folder, don't crash if it exists

for url, filename in DOCS:
    path = os.path.join(DOCS_DIR, filename)
    if os.path.exists(path):           # (2) already downloaded → skip
        print(f"skip (exists): {filename}")
        continue
```

- **`os.makedirs(..., exist_ok=True)`** — creates `data/docs/` at runtime. `exist_ok=True` = "don't crash if it's already there." This is why we never `mkdir` by hand; the script works on a fresh clone.
- **`os.path.exists(path)` + `continue`** — the skip. Re-run the script and it downloads nothing (proved this on Day 2: second run printed 5 × `skip (exists)`). Kind to the govt servers, fast for us.
- **`os.path.join`** — builds the path with the right separator (`\` on Windows, `/` on Linux). Never hand-glue paths with `+`.

---

## Concept 5 — `if __name__ == "__main__":`

```python
if __name__ == "__main__":
    download_all()
```

Python sets a hidden variable `__name__`:
- **Run the file directly** (`python download_docs.py`) → `__name__ == "__main__"` → the block runs → downloads happen.
- **Import the file** (`from ingestion import download_docs`) → `__name__ == "download_docs"` → block skipped → you just get the functions, no surprise downloads.

> **🧠 Analogy — the light switch by the door**
> "If *I* am the one who walked in, turn on the lights." If someone just borrows a tool from the room (imports it), the lights stay off. The file behaves as both a runnable **script** and an importable **module**.

> **⭐ Interview tip:** classic Python question — this guard is what lets one file be both a script and a module.

---

## 60-second recall

- **First ingestion step = download official govt PDFs** to `data/docs/`. Only `.gov.in` sources (blogs can be wrong → wrong tax filing).
- **`requests.get(url, headers=..., timeout=...)`** → `.raise_for_status()` → write `resp.content` with `"wb"` (binary).
- **`403` = bot blocked** → send a **browser `User-Agent`**. (`404` = not found — different problem.)
- **Safe re-run:** `os.makedirs(exist_ok=True)` + skip when `os.path.exists(path)`.
- **`if __name__ == "__main__":`** = "run me → do the work; import me → stay quiet."
- Data folders are **gitignored** — PDFs live locally, never pushed.

## Interview flashcards

| Q | A |
|---|---|
| `resp.content` vs `resp.text`? | `.content` = raw bytes (files, `"wb"`). `.text` = decoded string (HTML/JSON). |
| Site returns 403 to my script but works in browser? | Send a browser `User-Agent` header first. |
| 403 vs 404? | 403 = refused (allowed to exist, you're blocked). 404 = not found. |
| Why `"wb"` not `"w"`? | PDF is binary; text mode corrupts it. |
| What does `raise_for_status()` do? | Raises an exception on 4xx/5xx so you don't save an error page as your file. |
| What makes the script safe to re-run? | `os.makedirs(exist_ok=True)` + `os.path.exists` skip = idempotent. |
| `if __name__ == "__main__":`? | True only when run directly; lets the file be both script and module. |

## Self-test (cover the answers)

1. You download a PDF and it won't open — corrupted. What's the likely one-character bug? → *Opened the file in `"w"` instead of `"wb"`.*
2. Your scraper gets `403 Forbidden` but the URL works in Chrome. First fix? → *Add a browser `User-Agent` header.*
3. Why don't we create `data/docs/` by hand before running? → *`os.makedirs(..., exist_ok=True)` makes it at runtime, so it works on a fresh clone.*
4. Run the script twice — why does the second run download nothing? → *The `os.path.exists(path)` check hits → `continue` skips each already-present file.*

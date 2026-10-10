# 25 — The first endpoint that doesn't speak JSON

**Day 25 · Week 5 (Form 16 upload, session 1 of 2) · branch `feature/form16-upload`**

Every endpoint in this project so far has taken JSON and given JSON back. `POST /chat`,
`POST /calculate`, `GET /history/{id}` — three different jobs, one content type.

Today's endpoint takes a **file**. That one difference drags in a new content type, a new
FastAPI type, a dependency that wasn't installed, a Python keyword you hadn't used in this
project, and four failure modes that don't exist when your input is a number.

The endpoint is 25 lines. The reasons are the lesson.

---

## 1. Why a PDF can't ride inside JSON

The answer fits in three words each way:

- **JSON is text.**
- **A PDF is bytes.**

Text can't hold arbitrary bytes. There is no key you can type a PDF into.

> 📦 **The ITR filing analogy.**
> Filing your return online, the form fields — name, PAN, gross income — are typed text.
> That's JSON. But the Form 16 attachment isn't typed into a box. You click *Choose File*
> and the browser ships the whole file alongside the form.
> **Two different things travelling in one envelope: filled-in fields, and attachments.**

That envelope format is **`multipart/form-data`**. The body gets split into parts, each with
its own little header:

```
Content-Type: multipart/form-data; boundary=----X

------X
Content-Disposition: form-data; name="file"; filename="form16.pdf"
Content-Type: application/pdf

%PDF-1.4  ...raw bytes...
------X--
```

`boundary=----X` is a random separator. The parser reads until it sees `----X` again — that's
how it knows where the file ends without being told its length upfront.

> ⭐ **Interview tip.** "Why can't you upload a file as JSON?" The answer is **binary
> safety**. You *technically* can, by base64-encoding the bytes into a string — but base64
> inflates the payload ~33% and forces the whole file into memory on both ends. Multipart
> streams the raw bytes with no encoding. That's why every file upload on the web uses it.

**What this changes in code:** Pydantic is out. `ChatRequest(BaseModel)` parses a JSON body;
a multipart body has no JSON body to parse. You declare the file as a **parameter**, not a
model.

Notice the asymmetry that shows up in the finished file:

| | Request | Response |
|---|---|---|
| `POST /chat` | `ChatRequest(BaseModel)` | `ChatResponse(BaseModel)` |
| `POST /upload` | **`file: UploadFile = File(...)`** | `UploadResponse(BaseModel)` |

The response is still JSON, so Pydantic still owns it. The request is multipart, so Pydantic
never sees it.

---

## 2. `UploadFile` vs `bytes`, and what `File(...)` actually is

```python
async def upload_route(file: UploadFile = File(...)):
```

Two pieces of syntax worth naming.

**`File(...)` is a marker, not a default value.** FastAPI reads it and learns "this parameter
comes from a multipart form field named `file`". The `...` is Python's `Ellipsis`, used here
to mean **required**. Same trick as `Field(ge=0)` in the calculator — the right-hand side
isn't a value, it's an instruction to the framework.

**`UploadFile`, never `bytes`.** Declaring the type as `bytes` makes FastAPI load the entire
file into RAM before your function runs — a 500 MB upload is 500 MB of RAM. `UploadFile`
hands you a **spooled temp file**: small files stay in memory, large ones spill to disk
automatically.

**`async def` / `await file.read()`.** Reading an uploaded file touches disk (see: spooling).
`await` means *this might take a moment; go serve another request while you wait, then come
back here.* Your other routes are plain `def` because they do CPU or blocking work.

> ⭐ **Interview tip.** In FastAPI, `def` routes run in a **threadpool**; `async def` routes
> run on the **event loop**. Getting it backwards — blocking work inside `async def` —
> freezes the whole server for every user, because the one event loop is stuck. It is the
> single most common FastAPI performance bug.

---

## 3. Cheap check first, authoritative check second

```python
if not (file.filename or "").lower().endswith(".pdf"):
    raise HTTPException(400, "Only PDF files are accepted.")
```

A `.exe` renamed to `form16.pdf` sails straight through this. So why is it here?

| Check | Cost | Knows the truth? |
|---|---|---|
| filename ends in `.pdf` | free — runs **before** a single byte is read | no |
| `fitz.open()` parses it | expensive — needs the whole file read and parsed | **yes** |

**Cheap filter first, authoritative check second.** The filename check isn't security; it's
there so 99% of honest mistakes (`resume.docx`, `photo.jpg`) cost you nothing. The parse is
the security boundary.

> ⭐ **Interview tip.** The filename and the `Content-Type` header on an upload are both
> **client-supplied** — the attacker types them. Never treat either as proof of anything. The
> only thing that tells you what a file *is*, is parsing it.

**`(file.filename or "")`** — `UploadFile.filename` is typed `str | None`. A multipart part
with no `filename` gives you `None`, and `None.lower()` is an `AttributeError`, which FastAPI
turns into a **500**. A malformed request must be a 400, never a 500.

### The size check is in the wrong place, on purpose

```python
data = await file.read()
# ponytail: not a real memory guard - the read above already happened.
if len(data) > MAX_BYTES:
    raise HTTPException(413, "File too large. Maximum size is 5 MB.")
```

By the time you measure the size, the bytes are already in memory. A real cap lives in the
web server or reverse proxy, **before your code runs**. The check stays because it's one line
and it does stop the file reaching `fitz` — but it gets a comment saying what it is not.

> ⭐ A shortcut with a comment naming its ceiling reads as *intent*. The same shortcut without
> one reads as *ignorance*. That difference is free.

---

## 4. The password-protected Form 16 — and notes that lied

Banks and employers ship Form 16 **PAN-locked**. This is not an edge case, it's the common
case. `CLAUDE.md` claimed `fitz.open()` raises on an encrypted PDF.

It doesn't. Measured, on an AES-256 encrypted PDF built in memory:

```
fitz.open(stream=...)  →  does NOT raise. Succeeds.
doc.needs_pass         →  1
doc.page_count         →  1          ← works fine!
page.get_text()        →  ValueError: document closed or encrypted
```

So a locked Form 16 **opens successfully**, reports its page count happily, and only explodes
when you reach for the words.

If you'd relied on `try: fitz.open(...)` alone, every PAN-locked Form 16 would become a
**500 Internal Server Error** with no explanation, and the user would have no idea the
password was the problem. That is why `needs_pass` is its own check — and why it must come
**before** any `get_text()`.

> ⭐ **Docs are claims about code. When they disagree, the file wins.** You learned this on
> Day 24 against your own notes. It applies to Claude's statements too. The fix is the same
> either way: *run it.*

---

## 5. Don't copy structure whose reason has expired

Day 3's `extract_pdf()` returned `[(page_num, text), ...]`, and Day 4 turned those page
numbers into `{source, page}` metadata on every chunk. That metadata is the entire citation
system — 2106 chunks depend on it.

Today's extraction throws all of that away:

```python
text = "\n".join(page.get_text() for page in doc)
```

One joined string. No tuples, no page numbers, no metadata.

Because the *reason* expired. Page numbers exist so an answer can say **which of 9 government
PDFs** a fact came from. A Form 16 is two pages the user is holding in their hand. "Page 2 of
your own Form 16" is not a citation, it's noise.

> ⭐ **Copy structure from old code only if the reason for it still applies.** The most
> convincing wrong code in any codebase is code that was right somewhere else.

### And `except Exception` is deliberately broad

```python
except Exception:
    raise HTTPException(400, "Could not open this PDF. The file may be corrupted.")
```

Normally a code smell. Here you genuinely don't care *which* PyMuPDF failure fired — corrupt
header, truncated file, an actual `.exe`. The user gets the same 400 either way, and you must
not leak an internal parser error to the client.

---

## 6. The dependency that isn't installed

FastAPI does **not** ship a multipart parser. Most APIs never accept files, so it's an
optional extra. The moment a route declares `File(...)`, the app refuses to start:

```
RuntimeError: Form data requires "python-multipart" to be installed.
```

> ⭐ A dependency that only one endpoint needs is still a dependency. It goes into
> `requirements.txt` in the **same commit** as the code that needs it — otherwise Railway
> builds fine in Week 6 and crashes on boot.

---

## 7. Making the guards testable

The happy path was proven in thirty seconds through Swagger. The four failure paths weren't —
and that's where all the logic is.

Same move as Day 20's calculator: pull the logic out of the route into a plain function, put
a thin route on top.

```python
def extract_text(data):
    """Bytes in, (page_count, text) out. Raises HTTPException with a human message."""
```

```python
    pages, text = extract_text(data)
    return {"filename": file.filename, "pages": pages, "text": text}
```

> ⭐ **`HTTPException` works from anywhere in the call stack**, not only inside a route
> function. FastAPI catches it wherever it's raised. That's what makes this split free — no
> error codes to plumb, no custom exception type to translate at the boundary.

### The test PDFs build themselves

No fixture files, no committed sample PDFs. `fitz` writes its own inputs:

```python
def make_pdf(text=None, encrypt=False):
    """Build a one-page PDF in memory. No text = a 'scan'. encrypt = a PAN-locked Form 16."""
    d = fitz.open()
    page = d.new_page()
    if text:
        page.insert_text((72, 72), text)
    if encrypt:
        return d.tobytes(encryption=fitz.PDF_ENCRYPT_AES_256, owner_pw="o", user_pw="u")
    return d.tobytes()
```

A PDF with no text drawn on it **is** an image-only scan, as far as `get_text()` is concerned.
The scanned-document case — the one `gst-circular.pdf` has silently hit since Week 1 — is one
default argument.

### Assert the message, not just the raise

```python
def fails_with(data, snippet):
    try:
        extract_text(data)
    except HTTPException as e:
        assert snippet in e.detail, f"wrong message: {e.detail}"
        return
    assert False, f"expected a 400 mentioning {snippet!r}, but it succeeded"
```

> ⭐ **A test that asserts only "it raised" is half a test.** Without the snippet check, a
> corrupt PDF reporting *"password-protected"* passes — and your user goes hunting for a
> password that doesn't exist. On a user-facing error path, **the message is the feature.**

**Asserts 31 → 36.**

---

## 8. `git add -p` splits by distance, not by meaning

`backend/main.py` had two unrelated changes: the upload wiring, and the deletion of a
`BaseModel` import left behind by Day 14. The plan was two commits.

Git gave **one hunk**. Line 2 (the deletion) and line 6 (the import) are 4 lines apart,
inside `-p`'s default 3-line context, so they arrived joined. `y` took both.

> ⭐ **`git add -p` separates by proximity, not by intent.** Changes closer than ~6 lines
> can't be split with `y`/`n`/`s` — only `e`, hand-editing the hunk. Cheap to know now; the
> day it's two real features instead of one dead import, you won't be surprised.

---

## 9. The decision for session 2

The endpoint returns the text and forgets it. Next session connects it to chat. Two designs:

| | **A — into ChromaDB** | **B — per-request context** |
|---|---|---|
| How | chunk, embed, store; the retriever finds it like any other doc | keep the text against the `session_id`, paste it into the prompt |
| Graph changes | none | a branch that uses the Form 16 instead of retrieved docs |

**Chosen: B.** And the deciding fact is not accuracy, it's privacy:

> ChromaDB is **one shared store** and there is no `user_id` column anywhere in this project
> yet. A Form 16 holds a real person's PAN, employer, and exact salary. Put it in the shared
> store and a stranger's GST question can retrieve your payslip.

Two supporting reasons, both real, both secondary: Day 24 measured that retrieval is a
competition — every extra document degrades every query — and a 2-page Form 16 fits in the
context window with room to spare, so the vector store buys you nothing here.

> ⭐ **"Which design is more accurate?" is often the wrong first question.** Ask what each one
> makes *possible* — including for an attacker. A data-leak risk outranks a ranking
> improvement every time.

---

## 10. Flashcards

| Q | A |
|---|---|
| Why can't a PDF go in a JSON body? | JSON is text, PDF is bytes |
| What is `boundary=` for? | random separator marking where each part ends |
| `File(...)` — what's the `...`? | `Ellipsis`, meaning **required**; the whole call is a marker, not a default |
| `UploadFile` vs `bytes` param | `bytes` loads all into RAM; `UploadFile` spools to disk |
| `def` vs `async def` in FastAPI | `def` → threadpool, `async def` → event loop; blocking in `async def` freezes the server |
| Is the filename check security? | No. Cheap filter. The **parse** is the boundary |
| Locked PDF: does `fitz.open()` raise? | **No.** It succeeds, `needs_pass` is 1, `get_text()` raises |
| Why check `needs_pass` before `get_text()`? | otherwise every PAN-locked Form 16 is a 500 with no explanation |
| Why no `{source, page}` on Form 16 text? | citations identify *which of 9 PDFs*; the user is holding this one |
| Can `HTTPException` be raised outside a route? | Yes — FastAPI catches it anywhere in the call stack |
| Why does `python-multipart` exist separately? | FastAPI ships no multipart parser; most APIs never take files |
| What makes a PDF a "scan" to `get_text()`? | no text layer — a page with nothing drawn on it is the same case |
| Why assert the error *message*? | on user-facing paths the message is the feature; "it raised" passes with the wrong one |
| Why `except Exception` here? | every parse failure gets the same 400; never leak parser internals |

---

## 11. Self-test

1. A teammate declares `file: bytes` instead of `UploadFile`. What breaks, and only when?
2. The filename check doesn't stop a renamed `.exe`. Argue for keeping it anyway, in one
   sentence.
3. `MAX_BYTES` is checked after `await file.read()`. Say precisely what that check does and
   does not protect.
4. A user uploads a PAN-locked Form 16 and the code has no `needs_pass` check. Trace exactly
   what the user sees.
5. Your notes say a library raises on bad input. What do you do before writing the `except`?
6. Why does Form 16 text carry no page metadata when all 2106 corpus chunks do?
7. Write the failure that `assert raised` passes but `fails_with(data, snippet)` catches.
8. `git add -p` refuses to split your two changes. Why, and what's the fix?
9. Form 16 into the shared vector store: name the specific bad outcome, not "it's insecure".
10. `except Exception` is usually a smell. Defend it in this function in one sentence.

---

## 12. What shipped

**2 files changed + 1 new, 2 commits. 31 → 36 asserts.**

| File | Change |
|---|---|
| `backend/routes/upload.py` | **new.** `UploadResponse`, `extract_text(data)`, `POST /upload`, self-check with in-memory PDFs |
| `backend/main.py` | import + `include_router(upload_router)`; unused `BaseModel` import deleted |
| `requirements.txt` | `python-multipart` |

Guards, all four tested: non-PDF filename · over 5 MB · corrupt bytes · password-protected ·
image-only scan.

Parked, deliberately:

- **the real size cap** belongs in the proxy, Week 6. The `len(data)` check is not a memory guard.
- **nothing is stored yet.** The text is returned and forgotten — session 2 wires it to the session.
- **no frontend.** A third screen is one `<Route>` + one `<NavLink>` (Day 21).
- **OCR for scanned Form 16s.** Rejected with a clear message instead. Add when a user complains.

**Bugs: 3 typed (`endwith`, dropped `or ""`, a comment contradicting the line below it), 0
silent.** All three caught by reading before running.

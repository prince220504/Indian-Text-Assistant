# 27 — The file upload UI: attach-in-chat

> Day 27. Session 3 of 3 for Form 16. `pages/Chat.jsx` only — one file, three chunks, half an hour.
> Backend was already finished: `tutorial/25` built `POST /upload`, `tutorial/26` wired `doc_text` through the graph.
> This is the half the user can see.

---

## Where we were

Two endpoints sitting there with nobody calling them.

`POST /upload` takes a PDF and gives back `{filename, pages, text}`.
`POST /chat` takes an optional `doc_text` and, when it is present, skips retrieval entirely and answers from that text.

The frontend knew about neither. Day 27's whole job was the glue.

---

## The design question, asked and answered on Day 26

**Where does the extracted text live between the two requests?**

The request to `/upload` finishes. The response comes back. Then, maybe thirty seconds later, the user types a question and a *second*, completely separate request goes to `/chat`. HTTP has no memory between those two. Something has to hold the text.

Three candidates:

| Where | Cost | Verdict |
|---|---|---|
| ChromaDB | embed it, store it, now it is a shared vector store with no `user_id` | No |
| Postgres `messages` | a column, a migration, and the payslip now sits behind a `session_id` anyone can guess | No |
| **React state** | zero lines of storage code — `/upload` already handed the text back | **Yes** |

> **Analogy.** You carry your own photocopy of Form 16 to the CA every visit. The CA's office keeps no file cabinet for it. Not because a cabinet would be hard — because their cabinet has no lock yet, and your salary is in that paper.

**⭐ Interview tip:** *stateless about user data is a security property, not laziness.* The cheapest possible fix for a data-protection problem is not collecting the data. There is no breach of a thing you never stored.

So: `const [doc, setDoc] = useState(null)` and that is the entire persistence layer.

```jsx
// the attached Form 16 lives HERE, in the browser, for as long as the tab is open.
// Never stored server-side -- the session_id debt means the DB isn't safe for a payslip.
const [doc, setDoc] = useState(null);     // { filename, text } or null
const [uploading, setUploading] = useState(false);
```

Note what is *not* in there: `pages`. The response has three fields, we keep two. Nothing on screen needs the page count, so it does not enter state.

Note also the deliberate ceiling: **refresh the tab and the attachment is gone**, while the conversation survives (that is Day 17's `localStorage` session key plus Postgres). Asymmetric on purpose. The messages are safe to persist; the payslip is not.

---

## Chunk 1 — the upload handler, and the one header you must not write

```jsx
async function handleUpload(e) {
  const file = e.target.files[0];
  if (!file) return;                  // user opened the picker and hit Cancel
  setUploading(true);
  try {
    const form = new FormData();
    form.append("file", file);        // "file" = the field name /upload expects
    const res = await fetch("http://localhost:8000/upload", {
      method: "POST",
      body: form,                     // NO headers -- browser writes the multipart boundary
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();    // { filename, pages, text }
    setDoc({ filename: data.filename, text: data.text });
  } catch (err) {
    alert(`Upload failed: ${err.message}`);   // ponytail: alert, real toast when there are 3 of them
  } finally {
    setUploading(false);
    e.target.value = "";              // lets you re-pick the SAME file later
  }
}
```

### The header rule

Every other `fetch` in this project looks like:

```js
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ ... }),
```

This one has **no `headers` at all**, and that is not an oversight.

> **⭐ Interview tip — why you must not set `Content-Type` on a `FormData` POST.**
> A multipart body is several parts glued together, separated by a random string called the **boundary**. The full header the server needs is `multipart/form-data; boundary=----WebKitFormBoundaryXy7z...`. The browser *generates* that boundary when it serialises the `FormData`, so only the browser knows it. Write the header by hand and you send `multipart/form-data` with no boundary — the server has no idea where one part ends and the next begins, and the parse fails. Pass a `FormData` as `body` and leave `headers` alone: the browser fills in the correct header, boundary included.

Day 25's lesson was *JSON is text, a PDF is bytes*, which is why `/upload` is the only endpoint with no Pydantic request model. This is the same fact seen from the client: the only endpoint whose `Content-Type` the client is not allowed to state.

### The two lines that are easy to not write

**`if (!file) return;`** — `onChange` fires when the picker closes, including when the user hits Cancel. Then `files` is empty and `files[0]` is `undefined`. Without the guard, `form.append("file", undefined)` sends the literal string `"undefined"` as a file, and the backend's `.pdf` filename guard turns it into a 400. A failure, but a confusing one.

**`e.target.value = ""` in `finally`** — a file input only fires `onChange` when its value *changes*. Pick `form16.pdf`, remove the chip, pick `form16.pdf` again: same value, no event, nothing happens, and the UI just looks broken. Clearing the value after every attempt means every pick is a change. In `finally`, so it runs after a failed upload too — otherwise retrying the same file silently does nothing.

**`ponytail:` on the `alert`.** An `alert` is the laziest error surface that actually informs the user. The comment names the upgrade path so the shortcut reads as a decision rather than as ignorance.

---

## Chunk 2 — sending it, and `undefined` vs `null`

```jsx
body: JSON.stringify({
  question,
  session_id: sessionId,
  doc_text: doc?.text,        // undefined when nothing attached -> key omitted by stringify
  filename: doc?.filename,
}),
```

> **⭐ Interview tip.** `JSON.stringify` **drops object keys whose value is `undefined`.** `JSON.stringify({a: 1, b: undefined})` is `'{"a":1}'`, not `'{"a":1,"b":null}'`.

That single fact is why this is two lines and not an `if`. With nothing attached, `doc` is `null`, `doc?.text` short-circuits to `undefined`, and the key vanishes — the body on the wire is byte-for-byte the two-key body we have been sending since Day 16. The backend's `Field(None, …)` never even sees the field.

`null` would also have worked here (Pydantic's `Optional` accepts it), but `?.` gives `undefined` for free and sends fewer bytes. And **be careful about generalising this** — §14 already records a bug where *a Pydantic default did not cover `None`*. `undefined`-and-omitted is the safer shape to lean on, because it exercises the server's default rather than its validator.

### Clearing it

```jsx
function newChat() {
  const fresh = crypto.randomUUID();
  localStorage.setItem("sessionId", fresh);
  setSessionId(fresh);
  setMessages([]);
  setDoc(null);         // new conversation, old payslip goes with it
}
```

One line, and it is the kind of line that is obvious in hindsight and invisible when you write the feature. "New chat" that keeps the previous person's payslip attached is a bug with real consequences. Adding state means auditing every place that resets state.

---

## Chunk 3 — the UI, and the ternary that is also the clear button

```jsx
{/* attachment row */}
<div className="flex items-center gap-2 mb-2 text-sm">
  {doc ? (
    <span className="flex items-center gap-2 bg-blue-50 text-blue-800 px-2 py-1 rounded">
      @ {doc.filename}
      {/* without type="button" this submits the form */}
      <button type="button" onClick={() => setDoc(null)}
              className="text-blue-600 hover:text-red-600">
        X
      </button>
    </span>
  ) : (
    <label className="text-gray-500">
      Attach Form 16 (PDF): {" "}
      <input type="file" accept="application/pdf" onChange={handleUpload} disabled={uploading} />
    </label>
  )}
  {uploading && <span className="text-gray-400">reading PDF...</span>}
</div>
```

Three things worth naming.

**`accept="application/pdf"`** — the native platform already filters the file picker. No library, no validation code. It is a convenience and not a guard, which is exactly why Day 25 put the real `.pdf` check on the server: *cheap filter first, authoritative check second*, and anything the client does is a cheap filter by definition.

**`doc ? chip : picker`** — one ternary gives the whole lifecycle. There is no "attached" boolean, no separate clear handler, no third state. `doc === null` *is* the empty state and `setDoc(null)` *is* the clear button. The one piece of state that had to exist is the one piece of state that exists.

**`type="button"`** — the chip's ✕ lives inside the page, and the composer below is a `<form>`. A `<button>` with no `type` defaults to `type="submit"`. Had it ended up inside the form, clicking ✕ would have submitted the chat. Cheap to write, annoying to diagnose.

**`{" "}`** — an explicit space. JSX collapses whitespace that sits next to a line break, so `PDF):` and the `<input>` would have touched without it.

---

## Four prop-name bugs in one session

Every single mistake typed today was in the same family, and §14 of `CLAUDE.md` had already written the family down: *typos in identifiers throw; typos in strings, dict keys and JSX prop names cannot.*

| Typed | Should be | Why nothing complained |
|---|---|---|
| `err.messages` | `err.message` | Reading a missing property of an object is `undefined`, not an error. The alert would have said "Upload failed: undefined" — and only on the error path, which no happy-path test visits. |
| `onclick` | `onClick` | React matches event props case-sensitively. An unrecognised lowercase prop is passed through to the DOM as an attribute. Button renders, button does nothing. |
| `onchage` → `onchange` | `onChange` | Two separate fixes: the spelling of "change", then the capital. Same cause as above. |
| `/* ... */` bare inside a tag | `{/* ... */}` above the tag | A comment in JSX needs braces, because inside a tag the parser is reading attributes, not JavaScript. |

> **⭐ Interview tip.** A typo in a *variable* name is free to make — the runtime throws and points at the line. A typo in a *string, a key, or a prop name* costs real time, because the only thing that notices is a human reading the line. That is the whole reason the debug order in §14 is: console open first, then read the line character by character, then suspect logic.

Four bugs, zero exceptions, zero red text. The `onclick` one rendered a perfectly good-looking button.

---

## What the run proved, and one thing it accidentally proved

Attach → chip appears. Ask a question → answer comes from the document. No source pills, because `sources` is `[]` on this path (Day 26: *don't fabricate data to fit a shape*). Click ✕ → picker returns, GST question cites normally again.

The accident: the PDF attached in testing was **a résumé, not a Form 16**, and it worked fine.

> **⭐ Interview tip.** Nothing in this stack checks that the PDF *is* a Form 16. `/upload` extracts text from any PDF; the `Form-16` category means only "the text arrived in the request body". The category name describes the *intended* use, not an enforced one. That is fine — generic document Q&A is a feature, not a defect — but know the difference between a label and a validation, and never let a label's confidence leak into a user-facing promise.

It also closes the loop on Day 26's design note: the category a *model* picks needs a prompt bullet, the category the *request shape* decides needs code. `Form-16` is decided by `state.get("doc_text")` being non-empty, so a résumé satisfies it exactly as well as a payslip does.

---

## Flashcards

**Q.** Why no `Content-Type` header on the upload `fetch`?
**A.** The browser generates the multipart `boundary` when it serialises `FormData`. Hand-writing the header omits the boundary and the server cannot parse the body.

**Q.** Where does the extracted text live between `/upload` and `/chat`?
**A.** React state in the browser. Never server-side — `session_id` is unauthenticated, so the DB is not safe for a payslip.

**Q.** Why does the `doc_text` key disappear when nothing is attached?
**A.** `doc?.text` is `undefined`, and `JSON.stringify` omits keys whose value is `undefined`.

**Q.** Why clear `e.target.value` after an upload?
**A.** A file input only fires `onChange` when its value changes. Without clearing, re-picking the same file is silent.

**Q.** Why `type="button"` on the ✕?
**A.** A `<button>` defaults to `type="submit"`.

**Q.** Why does the attachment vanish on refresh when the conversation does not?
**A.** Deliberate asymmetry. Messages persist (Postgres + the `localStorage` session key); the document is held only in memory because it should not be stored.

---

## Self-test

1. You set `headers: { "Content-Type": "multipart/form-data" }` on the upload fetch. What breaks, and why does the error come from the server rather than the browser?
2. `doc` is `null` and you write `doc_text: doc.text` instead of `doc?.text`. Does that throw? Where?
3. The user attaches a PDF, asks a question, then clicks **New chat** and asks another. Which line stops the second answer from being about the payslip?
4. A `<button>` with `onclick={fn}` renders without any console error but never fires. Explain in terms of what React does with props it does not recognise.
5. Someone uploads a 4 MB résumé and gets a confident answer about their "Form 16". Which layer should reject it, and what would that cost?

---

**Files touched:** `frontend/src/pages/Chat.jsx` only.
**Backend:** untouched — both halves shipped Days 25–26.
**Asserts:** still 39 (no frontend tests, none planned).
**Previous:** `tutorial/26-attached-document-context.md` · **Next:** logins + `user_id`.

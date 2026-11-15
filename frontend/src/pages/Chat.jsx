import { useEffect, useRef, useState } from "react";
import MessageBubble from "../components/MessageBubble";
import Icon from "../components/Icon";
import { API } from "../api";

// shown on an empty chat; a click puts the question in the box, the user still presses Send
const EXAMPLES = [
  "Is income up to ₹12 lakh tax-free under the new regime?",
  "When do I have to register for GST as a freelancer?",
  "What is the TDS rate on rent paid by a business?",
];

function Chat({ token, sessionId, onLogout, onSent }) {
  // the whiteboard: every message so far
  // each item: {role: "user" | "assistant", text: "...", sources?, error? }
  const [messages, setMessages] = useState([]);

  // what's currently typed in the input box
  // a question typed on the landing page before sign-up waits here, never auto-sent
  const [input, setInput] = useState(() => sessionStorage.getItem("pendingQuestion") ?? "");
  const inputRef = useRef(null);
  useEffect(() => { sessionStorage.removeItem("pendingQuestion"); }, []);

  const [historyLoading, setHistoryLoading] = useState(true);

  // parking ticket for the empty div at the bottom of the list
  const bottomRef = useRef(null);

  const [loading, setLoading] = useState(false);

  // the attached Form 16 lives HERE, in the browser, for as long as the tab is open.
  // The file's text is never stored server-side (answers drawn from it are, like any answer).
  const [doc, setDoc] = useState(null);    // { filename, text } or null
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  // on mount: ask the server what this session already said.
  // [] = run once PER MOUNT. App remounts us (key={sessionId}) on every chat switch.
  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await fetch(`${API}/history/${sessionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) return onLogout();   // expired/invalid pass -> back to the gate
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rows = await res.json();     // [{role, content, sources}, ...]  -- note: content, not text
        setMessages(rows.map((r) => ({ role: r.role, text: r.content, sources: r.sources })));
      } catch (err) {
        console.error("history load failed:", err);    // empty chat is a survivable failure
      } finally {
        setHistoryLoading(false);
      }
    }
    loadHistory();
  }, []);

  // the message just before the newest one = the question a fresh answer belongs to
  const questionRef = useRef(null);

  // answer arrived -> pin its question to the top, answer reads top-down below it; otherwise follow the bottom
  useEffect(() => {
    if (!loading && messages.at(-1)?.role === "assistant" && questionRef.current) {
      questionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, loading]);

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API}/upload`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        // 400/413 carry a readable detail string from the backend
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.detail === "string" ? data.detail : `HTTP ${res.status}`);
      }
      const data = await res.json();
      setDoc({ filename: data.filename, text: data.text });
    } catch (err) {
      setUploadError(`Couldn’t read that PDF: ${err.message}`);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!input.trim() || loading) return;      // no double-send while one is in flight

    const question = input;
    setMessages((prev) => [...prev, { role: "user", text: question }]);   // NEW array, not push
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          question,
          session_id: sessionId,
          doc_text: doc?.text,     // undefined when nothing attached -> key omitted by stringify
          filename: doc?.filename,
        }),
      });
      if (res.status === 401) return onLogout();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);     // fetch won't do this for us
      const data = await res.json();        // { answer, sources }
      onSent();    // row is in Postgres now -> App refetches the sidebar
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: data.answer, sources: data.sources },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", error: true, text: `That question didn’t go through (${err.message}). Check your connection and send it again.` },
      ]);
    } finally {
      setLoading(false);   // runs on success AND on failure -- never leave it stuck spinning
    }
  }

  function pickExample(q) {
    setInput(q);
    inputRef.current?.focus();
  }

  const empty = !historyLoading && messages.length === 0;

  return (
    <div className="chat">
      <div className="thread">
        {historyLoading && (
          <div className="skeleton" aria-label="Loading this chat">
            <span /><span /><span />
          </div>
        )}

        {empty && (
          <div className="empty">
            <h1>What do you want to know?</h1>
            <p>Ask about GST, income tax or TDS. Each answer lists the document and page it came from.</p>
            <ul className="examples">
              {EXAMPLES.map((q) => (
                <li key={q}>
                  <button type="button" onClick={() => pickExample(q)}>{q}</button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} ref={i === messages.length - 2 ? questionRef : null} />
        ))}

        {loading && (
          <div className="thinking" role="status">
            <span className="thinking__bar keep-motion" aria-hidden="true" />
            Reading the documents…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="composer-wrap">
        <form className="composer" onSubmit={handleSubmit}>
          <div className="composer__meta">
            {doc ? (
              <span className="chip">
                Attached: {doc.filename}
                {/* type="button" -- without it this submits the form */}
                <button type="button" onClick={() => setDoc(null)} aria-label={`Remove ${doc.filename}`}>
                  <Icon name="close" />
                </button>
              </span>
            ) : uploading ? (
              <span role="status">Reading your PDF…</span>
            ) : uploadError ? (
              <span className="field-help--error" role="alert">{uploadError}</span>
            ) : (
              <span>Attach a Form 16 PDF to ask about your own numbers.</span>
            )}
          </div>

          <div className="composer__row">
            <label className="attach" aria-disabled={uploading} title="Attach Form 16 (PDF)">
              <Icon name="clip" />
              <span className="visually-hidden">Attach Form 16 (PDF)</span>
              <input
                type="file" accept="application/pdf" className="visually-hidden"
                onChange={handleUpload} disabled={uploading}
              />
            </label>
            <label htmlFor="question" className="visually-hidden">Your question</label>
            <input
              id="question"
              ref={inputRef}
              className="input"
              name="question"
              autoComplete="off"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={doc ? "Ask about your Form 16…" : "Ask a tax question…"}
            />
            <button type="submit" className="btn btn--primary" disabled={loading}>
              {loading ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Chat;

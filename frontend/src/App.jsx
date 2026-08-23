import { useEffect, useState } from "react";

function App() {
  // the whiteboard: every message so far
  // each item: {role: "user" | "assistant", text: "..." }
  const [messages, setMessages] = useState([]);

  // what's currently typed in the input box
  const [input, setInput] = useState("");

  const [historyLoading, setHistoryLoading] = useState(true)

  // one session id for the whole conversation, now surviving refresh.
  // localStorage holds only the KEY -- the messages themselves live the Postgres.
  const [sessionId] = useState(() => {
    const saved = localStorage.getItem("sessionId");
    if (saved) return saved;
    const fresh = crypto.randomUUID();
    localStorage.setItem("sessionId", fresh);
    return fresh;
  });

  const [loading, setLoading] = useState(false);

  // on mount: ask the server what this session already said.
  // [] = run once. Postgres is the source of truth; React just mirrors it.
  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await fetch(`http://localhost:8000/history/${sessionId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rows = await res.json();     // [{role, content}, ...]  -- note: content, not text
        setMessages(rows.map((r) => ({ role: r.role, text: r.content })))
      } catch (err) {
        console.error("history load failed:", err);    // empty chat is a survivable failure
      } finally {
        setHistoryLoading(false);
      }
    }
    loadHistory();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!input.trim() || loading) return;      // no double-send while one is in flight

    const question = input;
    setMessages((prev) => [...prev, {role: "user", text:question }]);   // NEW array, not push
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("http://localhost:8000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json"},
        body: JSON.stringify({question, session_id: sessionId}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);     // fetch won't do this for us
      const data = await res.json();        // { answer, sources }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: data.answer, sources:data.sources },
      ]);
    } catch (err){
      setMessages((prev) => [
        ...prev,
        { role:"assistant", text: `Error: ${err.message}` },
      ]);
    } finally {
      setHistoryLoading(false);   // runs on success AND on failure -- never leave it stuck spinning
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow p-6">
        <h1 className="text-xl font-bold mb-4">Indian Tax Assistant</h1>

        {/* the conversation */}
        <div className="space-y-3 mb-4 min-h-[200px]">
          {historyLoading && <p className="text-gray-400">Loading history...</p>}
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "ml-auto max-w-[80%]" : "mr-auto max-w-[80%]"}>
              <div 
                className={
                  m.role === "user"
                  ? "bg-blue-100 p-3 rounded-lg"
                  : "bg-gray-100 p-3 rounded-lg whitespace-pre-wrap"
                }
              >
                {m.text}
              </div>
              {/* trustworthy citaions -- from chunk metadata, not from the model's prose */}
              {m.sources?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {m.sources.map((s, j) => (
                    <span 
                      key={j}
                      className="text-xs bg-white border border-gray-300 rounded-full px-2 py-1 text-gray-600"
                    >
                      {s.source} . p.{s.page}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* the composer */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input 
            className="flex-1 border rounded-lg px-3 py-2"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a GST question..."
          />
          <button 
            disabled={loading} 
            className="bg-blue-600 text-white px-4 py-2 rounded-lg disabled:bg-gray-400">
              {loading ? "..." : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default App

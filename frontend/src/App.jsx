import { useEffect, useState } from "react";
import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import Chat from "./pages/Chat";
import Calculator from "./pages/Calculator";
import Login from "./pages/Login";

// ClassName as a FUNCTION -- the router hands us isActive, so no useState needed
const tab = ({ isActive }) =>
  `px-4 py-2 rounded-lg text-sm font-medium ${
    isActive ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-200"
  }`;

function App() {
  // read the pocket ONCE on startup (lazy initializer, same trick as sessionId)
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const navigate = useNavigate();

  // desktop starts open, phone starts closed. NOT user data -> logout leaves it alone
  const [open, setOpen] = useState(() =>  window.innerWidth >= 768);

  // lifted from Chat: the sidebar (here) picks the chat, Chat (below) reads it
  const [sessionId, setSessionId] = useState(() => {
    const saved = localStorage.getItem("sessionId");
    if (saved) return saved;
    const fresh = crypto.randomUUID();
    localStorage.setItem("sessionId", fresh);
    return fresh;
  });

  // ONE function for both: open an old chat, or open a brand-new id (= New chat)
  function openChat(id){
    localStorage.setItem("sessionId", id);     // refresh lands back on this chat
    setSessionId(id);
    navigate("/");                             // clicked from /calculator? the chat has to actually show
  }

  const [sessions, setSessions] = useState([]);     // [{session_id, title, last_at}], newest first

  async function loadSessions() {
    try {
      const res = await fetch("http://localhost:8000/sessions", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) return handleLogout();    // same rule as Chat: dead pass -> gate
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSessions(await res.json());
    } catch (err) {
      console.error("sessions load failed:", err);   // empty sidebar is survivable
    }
  }

  // [token], not []: App never remounts, so login has to be the trigger
  useEffect(() => {
    if (token) loadSessions();
  }, [token]);

  function handleLogin(t) {
    localStorage.setItem("token", t);        // pockets: survives refresh
    setToken(t);                             // hand: triggers re-render -> gate opens
  }

  function handleLogout() {
    localStorage.removeItem("token");
    openChat(crypto.randomUUID());       // next person on this browser starts a fresh chat
    setSessions([]);                     // A's chat titles must not survive into B's screen
    setToken(null);
  }

  // the gate: no pass, no entry. Nothing below this line renders.
  if (!token) return <Login onLogin={handleLogin} />;
  
  return (
    <div className="h-screen flex bg-gray-100">
      {open && (
        <aside className="fixed inset-y-0 left-0 z-10 w-64 bg-white border-r flex flex-col gap-2 p-3 md:static">
          <button onClick={() => setOpen(false)} aria-label="Close sidebar" className="self-start px-2 text-xl">
            ☰
          </button>
          <button onClick={() => openChat(crypto.randomUUID())} className={tab({ isActive: false })}>
            + New Chat
          </button>
          <NavLink to="/calculator" className={tab}>Tax Calculator</NavLink>

          {/* flex-1 = the spring: eats all spare height, pushes Log out to the bottom */}
          <nav className="flex-1 overflow-y-auto mt-2 space-y-1">
            {sessions.map((s) => (
              <button 
                key={s.session_id}
                onClick={() => openChat(s.session_id)}
                className={`w-full text-left truncate px-3 py-2 rounded-lg text-sm ${
                  s.session_id === sessionId ? "bg-gray-200 font-medium" : "hover:bg-gray-100" 
                }`}
              >
                {s.title ?? "Untitled"}
              </button>
            ))}
          </nav>

          <button onClick={handleLogout} className={tab({ isActive: false})}>
            Log Out
          </button>
        </aside>
      )}

      <main className="flex-1 overflow-y-auto p-4">
        {/* h-10 row is ALWAYS here, so the chat never jumps when ☰ comes and goes */}
        <div className="h-10">
          {!open && (
            <button onClick={() => setOpen(true)} aria-label="Open sidebar" className="px-2 text-xl">
              ☰
            </button>
          )}
        </div>
        {/* the swappable part: exactly one of these renders, chosen by the URL */}
        <Routes>
          <Route path="/" element={<Chat key={sessionId} token={token} sessionId={sessionId} onLogout={handleLogout} onSent={loadSessions} />} />
          <Route path="/calculator" element={<Calculator />} />
        </Routes>
      </main>
    </div>
  );
}

export default App

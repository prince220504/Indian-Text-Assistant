import { useEffect, useRef, useState } from "react";
import { Link, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import Chat from "./pages/Chat";
import Calculator from "./pages/Calculator";
import Login from "./pages/Login";
import Landing from "./pages/Landing";
import Icon from "./components/Icon";
import { API } from "./api";
import GlowField from "./components/GlowField";

// matches the CSS breakpoint where the sidebar turns into an overlay (60rem)
const isNarrow = () => window.innerWidth < 960;

// crypto.randomUUID() exists only on https or localhost. A phone opening http://<wifi-ip>:5173 has
// no randomUUID, so build the same v4 UUID from getRandomValues, which works everywhere.
const newId = () =>
  crypto.randomUUID?.() ??
  "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));

function App() {
  // read the pocket ONCE on startup (lazy initializer, same trick as sessionId)
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // desktop starts open, phone starts closed. NOT user data -> logout leaves it alone
  const [open, setOpen] = useState(() => !isNarrow());

  // lifted from Chat: the sidebar (here) picks the chat, Chat (below) reads it
  const [sessionId, setSessionId] = useState(() => {
    const saved = localStorage.getItem("sessionId");
    if (saved) return saved;
    const fresh = newId();
    localStorage.setItem("sessionId", fresh);
    return fresh;
  });

  // ONE function for both: open an old chat, or open a brand-new id (= New chat)
  function openChat(id) {
    localStorage.setItem("sessionId", id);     // refresh lands back on this chat
    setSessionId(id);
    navigate("/chat");                         // clicked from /calculator? the chat has to actually show
    if (isNarrow()) setOpen(false);            // on a phone the overlay would cover the chat you just picked
  }

  const [sessions, setSessions] = useState([]);     // [{session_id, title, last_at}], newest first

  async function loadSessions() {
    try {
      const res = await fetch(`${API}/sessions`, {
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

  // React Router 7 runs navigate() as a transition, so the token reset renders FIRST, while the URL
  // is still /chat -- the gate would bounce to /login. This flag tells the gate "we chose to leave".
  const loggedOut = useRef(false);

  function handleLogin(t) {
    loggedOut.current = false;
    localStorage.setItem("token", t);        // pockets: survives refresh
    setToken(t);                             // hand: triggers re-render -> protected routes open
    navigate("/chat");
  }

  function handleLogout() {
    loggedOut.current = true;
    localStorage.removeItem("token");
    const fresh = newId();   // next person on this browser starts a fresh chat
    localStorage.setItem("sessionId", fresh);
    setSessionId(fresh);
    setSessions([]);                     // A's chat titles must not survive into B's screen
    setToken(null);
    navigate("/", { replace: true });    // back to the front page, not the login screen
  }

  const onCalculator = pathname === "/calculator";

  // the signed-in frame: sidebar + top bar, the page goes where <Outlet /> is
  const shell = (
    <div className="shell">
      <GlowField fixed />
      <a href="#app-main" className="skip-link">Skip to content</a>
      {open && (
        <>
          <button type="button" className="scrim" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside className="sidebar" aria-label="Chats and tools">
            <div className="sidebar__top">
              <Link to="/" className="wordmark" aria-label="Indian Tax Assistant, home"><Icon name="logo" />Indian Tax Assistant</Link>
              <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Close sidebar">
                <Icon name="close" />
              </button>
            </div>

            <button type="button" className="btn btn--primary btn--small" onClick={() => openChat(newId())}>
              <Icon name="plus" /> New chat
            </button>
            <NavLink to="/calculator" className="side-link" aria-current={onCalculator ? "page" : undefined}
              onClick={() => isNarrow() && setOpen(false)}>
              <Icon name="calc" /> Tax calculator
            </NavLink>

            {/* flex: 1 = the spring: eats all spare height, pushes Log out to the bottom */}
            <nav className="chat-list" aria-label="Your chats">
              <span className="chat-list__label">Your chats</span>
              {sessions.length === 0 ? (
                <p className="chat-list__empty">Chats appear here after your first question.</p>
              ) : (
                <ul>
                  {sessions.map((s) => (
                    <li key={s.session_id}>
                      <button
                        type="button"
                        className="chat-item"
                        onClick={() => openChat(s.session_id)}
                        aria-current={!onCalculator && s.session_id === sessionId ? "true" : undefined}
                        title={s.title ?? "Untitled"}
                      >
                        {s.title ?? "Untitled"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </nav>

            <div className="sidebar__foot">
              <button type="button" className="side-link" onClick={handleLogout}>
                <Icon name="logout" /> Log out
              </button>
            </div>
          </aside>
        </>
      )}

      <div className="main">
        {/* the top bar is ALWAYS here, so the page never jumps when the menu button comes and goes */}
        <header className="topbar">
          {!open && (
            <button type="button" className="icon-btn" onClick={() => setOpen(true)} aria-label="Open sidebar">
              <Icon name="menu" />
            </button>
          )}
          <span className="topbar__title">{onCalculator ? "Tax calculator" : "Ask a question"}</span>
        </header>
        <div className="main__body" id="app-main">
          <Outlet />
        </div>
      </div>
    </div>
  );

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={token ? <Navigate to="/chat" replace /> : <Login mode="login" onLogin={handleLogin} />} />
      <Route path="/register" element={token ? <Navigate to="/chat" replace /> : <Login mode="register" onLogin={handleLogin} />} />

      {/* the gate: no pass, no entry -- both tools need a login */}
      <Route element={token ? shell : <Navigate to={loggedOut.current ? "/" : "/login"} replace />}>
        <Route path="/chat" element={<Chat key={sessionId} token={token} sessionId={sessionId} onLogout={handleLogout} onSent={loadSessions} />} />
        <Route path="/calculator" element={<Calculator />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;

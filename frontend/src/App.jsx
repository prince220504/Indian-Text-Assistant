import { useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
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

  function handleLogin(t) {
    localStorage.setItem("token", t);        // pockets: survives refresh
    setToken(t);                             // hand: triggers re-render -> gate opens
  }

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("sessionId");   // next person on this browser starts a fresh chat
    setToken(null);
  }

  // the gate: no pass, no entry. Nothing below this line renders.
  if (!token) return <Login onLogin={handleLogin} />;
  
  return (
    <div className="min-h-screen bg-gray-100 p-4">
      {/* nav lives OUTSIDE <Routes>, so it survives every navigation */}
      <nav className="max-w-2xl mx-auto flex gap-2 mb-4">
        <NavLink to="/" className={tab}>Chat</NavLink>
        <NavLink to="/calculator" className={tab}>Tax Calculator</NavLink>
        <button 
          onClick={handleLogout}
          className="ml-auto px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-600 hover:bg-gray-200"
        >
          Log out
        </button>
      </nav>

      {/* the swappable part: exactly one of these renders, chosen by the URL */}
      <Routes>
        <Route path="/" element={<Chat token={token} onLogout={handleLogout} />} />
        <Route path="/calculator" element={<Calculator />} />
      </Routes>
    </div>
  )
}

export default App

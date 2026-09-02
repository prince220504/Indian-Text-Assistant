import { NavLink, Route, Routes } from "react-router-dom";
import Chat from "./pages/Chat";
import Calculator from "./pages/Calculator";

// ClassName as a FUNCTION -- the router hands us isActive, so no useState needed
const tab = ({ isActive }) =>
  `px-4 py-2 rounded-lg text-sm font-medium ${
    isActive ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-200"
  }`;

function App() {
  return (
    <div className="min-h-screen bg-gray-100 p-4">
      {/* nav lives OUTSIDE <Routes>, so it survives every navigation */}
      <nav className="max-w-2xl mx-auto flex gap-2 mb-4">
        <NavLink to="/" className={tab}>Chat</NavLink>
        <NavLink to="/calculator" className={tab}>Tax Calculator</NavLink>
      </nav>

      {/* the swappable part: exactly one of these renders, chosen by the URL */}
      <Routes>
        <Route path="/" element={<Chat />} />
        <Route path="/calculator" element={<Calculator />} />
      </Routes>
    </div>
  )
}

export default App

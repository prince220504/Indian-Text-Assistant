// Tailwind smoke test. No logic yet - D2 adds the real chat UI.
// If this renders centered on a grey card, the whole toolchain is wired.
function App() {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-xl shadow-md">
        <h1 className="text-2xl font-bold text-slate-800">
          Indian Tax Assistant
        </h1>
        <p className="text-slate-500 mt-2">Frontend is alive.</p>
      </div>
    </div>
  )
}

export default App

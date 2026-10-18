import { useState } from "react";

// one screen, two doors. /register and /login take the SAME body and
// return the SAME shape {token, user_id, email} -- so one function serves both.
function Login({ onLogin }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    async function submit(path) {
        setError("");
        setBusy(true);
        try{
            const res = await fetch(`http://localhost:8000/${path}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json();
            if (!res.ok) {
                // 401/409 send detail as a string; 422 (Pydantic) sends a LIST of problems
                setError(typeof data.detail === "string"
                    ? data.detail
                    : "Enter a valid email and a password of 8-72 characters.");
                return;           // finally still runs -- busy gets cleared
            }
            onLogin(data.token);
        } catch(err) {
            setError(`Server unreachable: ${err.message}`);
        } finally {
            setBusy(false);
        }
    }
    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
            {/* Enter key submits the form = Log in. Register is a separate button. */}
            <form 
                onSubmit={(e) => { e.preventDefault(); submit("login"); }}
                className="w-full max-w-sm bg-white rounded-lg shadow p-6 space-y-3"
            >
                <h1 className="text-xl font-bold">Indian Tax Assistant</h1>

                <input
                   type="email"
                   className="w-full border rounded-lg px-3 py-2"
                   placeholder="Email"
                   value={email}
                   onChange={(e) => setEmail(e.target.value)}
                />
                <input
                   type="password"
                   className="w-full border rounded-lg px-3 py-2"
                   placeholder="Password (8-72 characters)"
                   value={password}
                   onChange={(e) => setPassword(e.target.value)}
                />

                {error && <p className="text-sm text-red-600">{error}</p>}

                <div className="flex gap-2">
                    <button 
                       disabled={busy}
                       className="flex-1 bg-blue-600 text-white py-2 rounded-lg disabled:bg-gray-400"
                    >
                        Log in
                    </button>
                    {/* type="button" -- without it, this ALSO submits the form = Log in */}
                    <button 
                       type="button"
                       onClick={() => submit("register")}
                       disabled={busy}
                       className="flex-1 border border-blue-600 text-blue-600 py-2 rounded-lg disabled:opacity-50"
                    >
                        Register
                    </button>
                </div>
            </form>
        </div>
    );
}

export default Login

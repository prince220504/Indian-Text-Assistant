import { useState } from "react";
import { Link } from "react-router-dom";
import SiteNav from "../components/SiteNav";
import GlowField from "../components/GlowField";
import Icon from "../components/Icon";
import { API } from "../api";

// One component, two doors. /register and /login take the SAME body and
// return the SAME shape {token, user_id, email} -- so one submit serves both.
// mode: "login" | "register"
const COPY = {
    login: {
        title: "Welcome back",
        intro: "Log in to pick up your chats and the calculator where you left them.",
        button: "Log in",
        busy: "Logging in…",
        switchText: "New here?",
        switchLink: "Create an account",
        switchTo: "/register",
    },
    register: {
        title: "Create your account",
        intro: "Your chats are saved to your account, so you can come back to any answer.",
        button: "Create account",
        busy: "Creating account…",
        switchText: "Already have an account?",
        switchLink: "Log in",
        switchTo: "/login",
    },
};

function Login({ onLogin, mode = "login" }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const t = COPY[mode];
    const isRegister = mode === "register";
    const mismatch = isRegister && confirm !== "" && confirm !== password;

    async function handleSubmit(e) {
        e.preventDefault();
        if (busy) return;
        if (isRegister && password !== confirm) {
            setError("The two passwords don’t match. Type the same password in both fields.");
            return;
        }
        setError("");
        setBusy(true);
        try {
            const res = await fetch(`${API}/${mode}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json();
            if (!res.ok) {
                // 401/409 send detail as a string; 422 (Pydantic) sends a LIST of problems
                setError(typeof data.detail === "string"
                    ? data.detail
                    : "Enter a valid email and a password of 8 to 72 characters.");
                return;           // finally still runs -- busy gets cleared
            }
            onLogin(data.token);
        } catch (err) {
            setError(`Can’t reach the server (${err.message}). Check that the backend is running, then try again.`);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="auth-page">
            <GlowField calm />
            <SiteNav hide={mode} />
            <main id="main" className="auth">
                <div className="container auth__grid">
                    <div className="auth__intro">
                        <Link to="/" className="back-link">
                            <Icon name="back" /> Back to home
                        </Link>
                        <h1>{t.title}</h1>
                        <p>{t.intro}</p>
                        <p className="auth__switch">
                            {t.switchText} <Link to={t.switchTo} className="text-link">{t.switchLink}</Link>
                        </p>
                    </div>

                    <form className="glass auth__form" onSubmit={handleSubmit} noValidate>
                        <div className="field">
                            <label htmlFor="email">Email</label>
                            <input
                                id="email" name="email" type="email" autoComplete="email" inputMode="email"
                                spellCheck={false} className="input" required
                                value={email} onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>

                        <div className="field">
                            <label htmlFor="password">Password</label>
                            <input
                                id="password" name="password" type="password"
                                autoComplete={isRegister ? "new-password" : "current-password"}
                                className="input" required minLength={8} maxLength={72}
                                aria-describedby="password-help"
                                value={password} onChange={(e) => setPassword(e.target.value)}
                            />
                            <span id="password-help" className="field-help">{isRegister ? "8 to 72 characters" : ""}</span>
                        </div>

                        {isRegister && (
                            <div className="field">
                                <label htmlFor="confirm">Confirm password</label>
                                <input
                                    id="confirm" name="confirm" type="password" autoComplete="new-password"
                                    className="input" required aria-invalid={mismatch} aria-describedby="confirm-help"
                                    value={confirm} onChange={(e) => setConfirm(e.target.value)}
                                />
                                <span id="confirm-help" className={mismatch ? "field-help field-help--error" : "field-help"}>
                                    {mismatch ? "Doesn’t match the password above" : ""}
                                </span>
                            </div>
                        )}

                        {error && <p className="form-error" role="alert">{error}</p>}

                        <button type="submit" className="btn btn--primary" disabled={busy}>
                            {busy ? t.busy : t.button}
                        </button>
                    </form>
                </div>
            </main>
        </div>
    );
}

export default Login;

import { useEffect, useState } from "react";
import Tilt from "../components/Tilt";
import { API } from "../api";

// the platform already knows lakhs/crores -- no library needed
const inr = (n) => n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

// the total counts up to its value over ~600ms; reduced-motion users see the number at once
function useCountUp(target) {
    const [shown, setShown] = useState(target);
    useEffect(() => {
        if (target == null || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(target); return; }
        let raf;
        const start = performance.now();
        const tick = (now) => {
            const p = Math.min((now - start) / 600, 1);
            setShown(Math.round(target * (1 - Math.pow(1 - p, 3))));
            if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [target]);
    return shown;
}

// label + which key of the response it reads. Data, not six copies of <tr>.
const ROWS = [
    ["Taxable income", "taxable_income"],
    ["Standard deduction", "deduction"],
    ["Tax as per slabs", "tax_before_cess"],
    ["Less: 87A rebate", "rebate"],
    ["Health and education cess (4%)", "cess"],
];

function Calculator() {
    const [income, setIncome] = useState("");     // STRING -- mirrors the input box
    const [salaried, setSalaried] = useState(false);
    const [result, setResult] = useState(null);   // null = not calculated yet
    const [loading, setloading] = useState(false);
    const [error, setError] = useState("");
    const total = useCountUp(result?.total_tax ?? null);

    async function handleSubmit(e) {
        e.preventDefault();
        if (loading) return;
        setError("");

        try {
            setloading(true);
            const res = await fetch(`${API}/calculate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                // convert HERE, at the boundary -- state stays a string
                body: JSON.stringify({ income: Number(income), salaried }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setResult(await res.json());
        } catch (err) {
            setError(`Couldn’t calculate (${err.message}). Check that the backend is running, then try again.`);
            setResult(null);      // stale numbers on screen are worse than none
        } finally {
            setloading(false);
        }
    }

    return (
        <div className="calc">
            <div className="calc__head">
                <h1>Income tax calculator</h1>
                <p>New regime, FY 2025-26 (AY 2026-27)</p>
            </div>

            <div className="calc__grid">
                <form className="calc__form" onSubmit={handleSubmit}>
                    <div className="field">
                        <label htmlFor="income">Gross annual income (₹)</label>
                        <input
                            id="income"
                            name="income"
                            type="number"
                            inputMode="numeric"
                            min="0"
                            className="input"
                            value={income}
                            onChange={(e) => setIncome(e.target.value)}
                            placeholder="1300000"
                        />
                        <span className="field-help">
                            {income !== "" && Number(income) > 0 ? `₹${inr(Number(income))}` : "Before any deductions"}
                        </span>
                    </div>

                    <label className="check">
                        {/* checked, not value. e.target.checked, not e.target.value. */}
                        <input
                            type="checkbox"
                            name="salaried"
                            checked={salaried}
                            onChange={(e) => setSalaried(e.target.checked)}
                        />
                        I am salaried (adds the ₹75,000 standard deduction)
                    </label>

                    <button type="submit" className="btn btn--primary" disabled={loading || income === ""}>
                        {loading ? "Calculating…" : "Calculate tax"}
                    </button>

                    {error && <p className="form-error" role="alert">{error}</p>}
                </form>

                <div aria-live="polite">
                    {/* && short-circuit: nothing renders until result stops being null */}
                    {result ? (
                        // key = the result: a new calculation replays the entrance
                        <Tilt key={JSON.stringify(result)} className="on-cream sheet-card sheet-card--in">
                            <table className="sheet">
                                <caption>Your breakdown</caption>
                                <tbody>
                                    {ROWS.map(([label, key]) => (
                                        <tr key={key}>
                                            <td>{label}</td>
                                            <td>₹{inr(result[key])}</td>
                                        </tr>
                                    ))}
                                    <tr className="sheet__total">
                                        <td>Total tax payable</td>
                                        <td className="lift" aria-label={`₹${inr(result.total_tax)}`}>₹{inr(total ?? 0)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </Tilt>
                    ) : (
                        <div className="calc__result-empty">
                            <p>Enter your income to see the tax, rebate and cess, line by line.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default Calculator;

import { useState } from "react";

// the platform already knows lakhs/crores -- no library needed
const inr = (n) => n.toLocaleString("en-IN", { maximumFractionDigits: 0});

// label + which key of the response it reads. Data, not six copies of <tr>.
const ROWS = [
    ["Taxable income", "taxable_income"],
    ["Standard deduction", "deduction"],
    ["Tax as per slabs", "tax_before_cess"],
    ["Less: 87A rebate", "rebate"],
    ["Health & education cess (4%)", "cess"],
];

function Calculator() {
    const[income, setIncome] = useState("");     // STRING -- mirrors the input box
    const[salaried, setSalaried] = useState(false);
    const[result, setResult] = useState(null);   // null = not calculated yet
    const[loading, setloading] = useState(false);
    const[error, setError] = useState("");

    async function handleSubmit(e) {
        e.preventDefault();
        if (loading) return;
        setError("");
    
        try {
            setloading(true);
            const res = await fetch("http://localhost:8000/calculate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                // convert HERE, at the boundary -- state stays a string
                body: JSON.stringify({ income: Number(income), salaried}),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setResult(await res.json());
        } catch (err) {
            setError(err.message);
            setResult(null);      // stale numbers on screen are worse than none
        } finally {
            setloading(false);
        }
    }

    return (
        <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-lg shadow p-6">
                <h1 className="text-xl font-bold mb-1">Income Tax Calculator</h1>
                <p className="text-sm text-gray-500 mb-4">New regime, FY 2025-26 (AY 2026-27)</p>

                <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                        <label className="block text-sm font-medium mb-1">Gross annual income (₹)</label>
                        <input 
                          type="number"
                          min="0"
                          className="w-full border rounded-lg px-3 py-2"
                          value={income}
                          onChange={(e) => setIncome(e.target.value)}
                          placeholder="1300000"
                        />    
                    </div>

                    <label className="flex items-center gap-2 text-sm">
                        {/* checked, not value. e.target.checked, not e.target.value. */}
                        <input 
                          type="checkbox"
                          checked={salaried}
                          onChange={(e) => setSalaried(e.target.checked)}
                        />
                        I am salaried (adds ₹75,000 standard deduction)
                    </label>

                    <button 
                      disabled={loading || income === ""}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg disabled:bg-gray-400"
                    >
                        {loading ? "..." : "Calculate"}
                    </button>
                </form>

                {error && <p className="mt-4 text-red-600 text-sm">Error: {error}</p>}

                {/* && short-circuit: nothing renders untill result stops being null */}
                {result && (
                    <table className="w-full mt-6 text-sm">
                        <tbody>
                            {ROWS.map(([label, key]) => (
                                <tr key={key} className="border-b">
                                    <td className="py-2 text-gray-600">{label}</td>
                                    <td className="py-2 text-right">₹{inr(result[key])}</td>
                                </tr>
                            ))}
                            <tr className="font-bold">
                                <td className="py-3">Total tax payable</td>
                                <td className="py-3 text-right">₹{inr(result.total_tax)}</td>
                            </tr>
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

export default Calculator

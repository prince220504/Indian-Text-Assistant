# Tutorial 21 — The Water Tank: A Tax Calculator That Doesn't Guess — Week 5 D1

> **What you'll be able to recall after re-reading this:** why a tax slab is a water tank and not a flat percentage; why the rules live in a *list* instead of an `if/elif` chain; how `float("inf")` deletes a special case; why `min(taxable, upper) - lower` is the one line the whole file rests on; why the ₹75,000 deduction is a **parameter** and not an assumption; why the 87A rebate is **not** a 0% slab and why it must run *before* the cess; why ₹12,00,000 and ₹12,50,000 differ by ₹70,200; how to pick test cases that each fail for a *different* reason; why a docstring stopped being a docstring; and why `Field(ge=0)` earns its keep even though the function already clamps.
>
> **How to use this doc:** read top-to-bottom once. After that jump to any boxed **Analogy**, the **order-of-operations table**, the **cliff table**, the **silent-bug table**, the **60-second recall**, or the **Interview flashcards**.

---

## Where this fits

```
WEEK 1   PDFs → chunks → embeddings → ChromaDB          ✅ Tutorials 01-06
WEEK 2   retriever → generator → memory                 ✅ Tutorials 07-09
WEEK 2.5 the pipeline as a graph: route/grade/rewrite   ✅ Tutorials 10-12
WEEK 3   the graph, reachable over HTTP, with sessions  ✅ Tutorials 13-15
WEEK 4   the React chat UI                              ✅ Tutorials 16-19  (PR #5 merged)
WEEK 5   D0 citations that are true and that persist    ✅ Tutorial 20     (PR #6 merged)
         D1 the tax calculator                          ▲ you are here
         D2 the calculator UI                           → next
```

Every line of code before this tutorial had an LLM somewhere in it. This file has none. That is the point of the day.

---

## Concept 0 — Why this file exists at all

Ask the RAG pipeline "what is my tax on ₹13,00,000?" and it will answer. It will also, sometimes, answer ₹1,95,000 — because arithmetic is not what a language model does. It predicts plausible-looking tokens, and `1,95,000` looks extremely plausible next to a 15% slab.

> **🧠 Analogy — the CA reaches for the calculator.** A chartered accountant with thirty years of experience *knows* the slabs cold. Ask her your tax and she still picks up the calculator. Not because she forgot the rates — because knowing the rules and computing the number are two different skills, and only one of them is safe to do in your head.

Two kinds of work, two kinds of tool:

| | Probabilistic | Deterministic |
|---|---|---|
| **Does what** | reads, summarises, cites, rephrases | adds, multiplies, compares |
| **Same input twice** | may differ (you saw this Day 19 — `temperature=0` is not reproducible on a hosted MoE) | identical, always |
| **In this project** | the whole RAG graph | `calculator.py` |
| **Wrong looks like** | a hedge, a hallucinated page number | never, if the asserts pass |

⭐ **Interview tip — this is "tool use", and it's the single most-asked agent design question.** The model decides **what** to do ("this needs a tax computation, income ₹13L, not salaried"). Your code decides **how much** (`₹78,000`). The model's job ends at choosing the tool and filling its arguments. Never let it do the arithmetic and never let it *report* a number it computed itself.

Today built the tool. Wiring the model to call it comes later.

---

## Concept 1 — The water tank

The most expensive misunderstanding in Indian personal finance is this: *"I crossed ₹12 lakh so now I'm in the 15% bracket, so I pay 15% of everything."* That gives ₹1,95,000 on a ₹13L income. The real answer is **₹75,000**.

> **🧠 Analogy — the water tank with taps.** Picture a tall glass tank with taps welded into its wall at fixed heights: 4L, 8L, 12L, 16L, 20L, 24L. Your income is water poured in from the top. Each tap charges rent **only on the water that passes through it** — the tap at 8L never sees the first ₹8 lakh, and the tap at 12L never sees the first ₹12 lakh. Filling the tank to 13L doesn't retroactively make the bottom water expensive.

Pour ₹13,00,000 in and walk up:

| Slab | Water inside it | Rate | Tax |
|---|---|---|---|
| 0 – 4L | ₹4,00,000 | 0% | ₹0 |
| 4L – 8L | ₹4,00,000 | 5% | ₹20,000 |
| 8L – 12L | ₹4,00,000 | 10% | ₹40,000 |
| 12L – 16L | ₹1,00,000 | 15% | ₹15,000 |
| **Total** | | | **₹75,000** |

Only ₹1,00,000 ever meets the 15% rate. This is what "**marginal** rate" means — 15% is the rate on your *next* rupee, never on your whole income.

⭐ **Interview tip:** the same shape appears far outside tax — tiered API pricing, electricity bills, progressive shipping rates, AWS data-transfer tiers. Recognising "this is a marginal/tiered calculation" is worth more than memorising any one rate table.

---

## Concept 2 — Write the table down, don't unroll it

You had two ways to encode seven slabs.

**Way A — an `if/elif` chain.** Seven branches. The ₹24L branch re-derives everything the ₹4L branch already computed. When February's Budget moves one rate, you edit seven places and hope.

**Way B — the table as *data*, plus one loop.** The rates sit in a list you can read side-by-side with the government PDF. A rate change is a one-character edit and the logic never moves.

```python
# Each row = (upper limit of the slab, rate charged inside it).
# Read top to bottom, exactly like the govt table.
SLABS = [
    (400_000, 0.00),        # 0 - 4L      nil
    (800_000, 0.05),        # 4L - 8L     5%
    (1_200_000, 0.10),      # 8L - 12L    10%
    (1_600_000, 0.15),      # 12L - 16L   15%
    (2_000_000, 0.20),      # 16L - 20L   20%
    (2_400_000, 0.25),      # 20L - 24L   25%
    (float("inf"), 0.30),   # above 24L   30%
]
```

⭐ **Interview tip — table-driven logic.** When your rules come from a *published table*, store the table; don't compile it into branches by hand. Same family as a router's route table, a config-driven state machine, or a lookup dict replacing a `switch`. Reviewers spot it in three seconds and it reads as senior.

Two details in that block:

**`400_000` vs `400000`.** Underscores are pure notation — `400_000 == 400000` is `True`. At lakh-and-crore scale they're the difference between code you can proofread and code you can't. Which matters, because…

**…miscounting zeros is a real bug, and it happened today.** Asked when the 87A rebate applies, the answer came back "if income is less than **1,20,000**". The constant says `1_200_000`. That's ₹12 lakh vs ₹1.2 lakh — a factor of ten, in the one number that decides whether a user's bill is ₹0 or ₹70,200. The underscores are there precisely so that error is visible on the page.

**`float("inf")`.** The top slab has no ceiling. You could special-case the last row — "if this is the final slab, ignore the limit". Instead, give it a ceiling nothing can exceed, and all seven rows behave identically. The loop needs zero exceptions.

⭐ **Interview tip — a sentinel value.** *Deleting a special case by choosing a better value* is one of the highest-leverage habits in programming. Related moves you already know: a dummy head node so a linked list has no "first element" case, `float("-inf")` as the starting maximum, a null object instead of a null check.

---

## Concept 3 — The one line everything rests on

```python
def tax_on_slabs(taxable):
    """Tax from the slab table alone. No deduction, no rebate, no cess."""
    tax = 0.0
    lower = 0                      # floor of the slab we are standing in

    for upper, rate in SLABS:
        if taxable <= lower:       # water never reached this slab -> nor any above
            break
        in_this_slab = min(taxable, upper) - lower
        tax += in_this_slab * rate
        lower = upper              # this ceiling is the next slab's floor

    return tax
```

**Where does `lower` come from?** The table only stores ceilings, because every row's floor is the previous row's ceiling. So carry it: start at 0, and after each row the ceiling you just used becomes the next floor. Seven numbers stored, fourteen numbers available.

**`for upper, rate in SLABS`** — Python unpacks each `(ceiling, rate)` tuple straight into two named variables. No `row[0]` or `row[1]` anywhere in the loop body. ⭐ **Tuple unpacking in the loop header** is why a list-of-pairs is pleasant to work with instead of merely compact.

**`min(taxable, upper) - lower`** — the whole file, in one expression. Any slab is in exactly one of three states:

| Income vs the 8L–12L slab | Water inside it | As a formula |
|---|---|---|
| ₹6L — never reached it | none | negative → must not happen |
| ₹10L — partly full | ₹2,00,000 | `taxable - lower` |
| ₹30L — completely full | ₹4,00,000 | `upper - lower` |

Rows 2 and 3 are both `something - lower`, where *something* is whichever is **smaller** — the income, or the slab's ceiling. That's `min`. Row 1 would go negative, so it needs the guard. And notice the guard is `break`, not `continue`: if the water never reached *this* slab, it cannot have reached any slab above it. Stopping early isn't an optimisation, it's the truth about tanks.

### The bug that happened here

The line was typed as:

```python
in_this_slab = min(taxable, upper)          # <- the "- lower" is missing
```

No syntax error. No warning. `tax_on_slabs(1_300_000)` returned `355000.0`, cheerfully. Traced by hand, the four iterations were:

```
0   + 8L×0.05  = 40,000
    + 12L×0.10 = 1,20,000
    + 13L×0.15 = 1,95,000
                 ────────
                 3,55,000
```

And there, in the third line, sits **₹1,95,000** — the exact wrong number from Concept 1, the flat-rate answer the water tank exists to prevent. Each slab was charging tax on all the water beneath it, not just its own.

Two lessons, and the second is the bigger one.

⭐ **Valid code, wrong meaning.** `min(taxable, upper)` is a perfectly good expression that returns a perfectly good number — just not *this* number. Nothing can flag it. Same class as Day 18's `setHistoryLoading` (both identifiers existed, both setters took a boolean) and Day 19's `uuid.uuid4` without parentheses. Your growing list of *silent* bug shapes now has a money entry.

**The hand-trace was the diagnostic.** The trace and the file agreed perfectly — which is exactly why the trace was useful. It wasn't wrong about the code; it was *faithful* to the code, and that let the wrong number surface where it could be recognised. ⭐ **Trace by hand before you run.** Running it would have printed `355000` with no complaint and you'd have believed it.

---

## Concept 4 — The three things that are not slabs

The table is only the middle of the calculation. Three rules wrap around it, and **the order is the specification**, not a style choice.

> **🧠 Analogy — the restaurant bill.** A **discount** comes off before the bill is totalled. A **coupon** is applied to the finished bill. A **service charge** is a percentage of the final amount. Three different things, three different positions on the receipt.

| Rule | Restaurant | Position | Amount |
|---|---|---|---|
| Standard deduction | discount before totalling | **before** the table | ₹75,000, salaried only |
| 87A rebate | coupon on the finished bill | **after** the table | wipes the tax to zero if taxable ≤ ₹12,00,000 |
| Health & education cess | service charge on the total | **after** the rebate | 4% of the tax |

```python
def calculate_tax(income, salaried=False):
    """Full new-regime tax for one financial year.

    income   - gross annual income in rupees
    salaried - True only for salaried people (they get the standard deduction)
    """
    deduction = STANDARD_DEDUCTION if salaried else 0
    taxable = max(0, income - deduction)          # never go negative

    tax = tax_on_slabs(taxable)

    # 87A: the table already charged; the rebate now erases it.
    # Note the test is on TAXABLE INCOME, not on the tax.
    rebate = tax if taxable <= REBATE_87A_LIMIT else 0
    tax -= rebate

    cess = tax * CESS_RATE                        # after the rebate, not before
    total = tax + cess

    return {
        "taxable_income": taxable,
        "deduction": deduction,
        "tax_before_cess": round(tax),
        "rebate": round(rebate),
        "cess": round(cess),
        "total_tax": round(total),
    }
```

### `salaried` is a parameter, not an assumption

The ₹75,000 standard deduction is for salaried people and pensioners. **Freelancers do not get it** — and freelancers are this product's users. So it's an argument, defaulting to `False`.

⭐ **Interview tip — pick defaults so that forgetting is safe.** A caller who omits `salaried` gets the *higher*, correct-for-freelancers tax. Default it the other way and every forgetful caller silently under-reports someone's tax liability. When a default can be wrong in two directions, choose the direction whose failure is loud or harmless.

### `max(0, income - deduction)`

A ₹50,000 freelance year, salaried flag on: ₹50,000 − ₹75,000 = −₹25,000. Negative income through the slab loop produces nonsense. One `max` kills it.

⭐ **Clamp at the boundary where the impossible value is created**, not in the five places downstream that would each need their own guard. This is the same instinct as the ponytail rule "one guard in the shared function beats a guard in every caller".

### Why the rebate is *not* a 0% slab

This is the part everyone gets wrong, including confident people on the internet.

At ₹12,00,000 taxable, the slab table genuinely charges **₹60,000**. The rebate then erases it. Those two descriptions — "there is no tax below 12L" and "the table charges 60,000 and a rebate erases it" — look identical on a ₹12L payslip and behave completely differently one rupee higher.

| | Freelancer, ₹12,00,000 | Freelancer, ₹12,50,000 |
|---|---|---|
| Taxable | ₹12,00,000 | ₹12,50,000 |
| Slab tax | ₹60,000 | ₹67,500 |
| 87A rebate | −₹60,000 | **₹0 — over the line** |
| Cess 4% | ₹0 | ₹2,700 |
| **Bill** | **₹0** | **₹70,200** |

₹50,000 more income, ₹70,200 more tax. That's a **cliff**, and it's why the code must *charge and then erase* rather than pretend the first ₹12L is a 0% slab. (The real Act softens this with **marginal relief** just above the line — deliberately not built yet, and worth knowing you skipped it.)

Two more precision points hiding in one sentence of the law:

- The test is on **taxable income**, never on the tax. A salaried person with gross ₹12,75,000 has taxable ₹12,00,000, qualifies, and pays **zero** — that's where the "₹12.75 lakh is tax-free" headline comes from: 12L + the 75k deduction.
- The law says "does not exceed", which is **`<=`**. Exactly ₹12,00,000 qualifies. ⭐ **Off-by-one at a money boundary is the most common financial bug there is** — and the only defence is a test on *both* sides of the line, which is why the asserts below sit at 12,00,000 and 12,50,000.

### Why cess comes after the rebate

"Cess is on the tax, not the income" is true — it explains `tax * CESS_RATE` instead of `income * CESS_RATE`. It does **not** explain the ordering, because both orderings compute cess on tax. The question is *which* tax.

| Step | Correct: rebate → cess | Wrong: cess → rebate |
|---|---|---|
| Slab tax | ₹60,000 | ₹60,000 |
| — | rebate wipes it → **₹0** | cess 4% → ₹2,400 |
| — | cess = 4% of ₹0 → **₹0** | rebate erases the ₹60,000 → ₹2,400 remains |
| **Bill** | **₹0** ✅ | **₹2,400** ❌ |

The rebate's entire job is to make the bill zero. Charge the cess first and you hand a ₹2,400 bill to someone the law says owes nothing.

⭐ **In a pipeline of money operations, order is the spec, not style.** Same shape as `condense` running before `route` in your graph (Day 18 — put it after and `hii` breaks).

---

## Concept 5 — Tests that each fail for a different reason

Ponytail's rule: non-trivial logic leaves **one runnable check** behind. A money path with a loop, a branch and an ordering dependency qualifies. No pytest, no fixtures — the same `__main__` self-check every other module in this project has.

The skill isn't writing asserts, it's **choosing** them. Six cases, each of which breaks for a reason none of the others cover:

| Case | Expected | Fails if… |
|---|---|---|
| ₹13L freelancer | ₹78,000 | the slab loop is wrong (the exact bug from Concept 3) |
| ₹12L freelancer | ₹0 | the rebate never fires |
| ₹12.5L freelancer | ₹70,200 | the rebate fires when it shouldn't — **the cliff** |
| ₹12.75L salaried | ₹0 | the deduction isn't applied *before* the table |
| ₹15L salaried | ₹97,500 | `salaried=True` is ignored, or the cess is misplaced |
| ₹50k salaried | ₹0 | negative taxable income isn't clamped |

⭐ **A suite where every test breaks on the same bug is one test wearing six hats.** Before adding a case, ask what it catches that nothing else does. If the answer is "nothing", it's decoration.

```python
if __name__ == "__main__":
    # Freelancer, 13L: 20k + 40k + 15k = 75,000, plus 4% cess.
    r = calculate_tax(1_300_000)
    assert r["tax_before_cess"] == 75_000, r
    assert r["total_tax"] == 78_000, r

    # Freelancer, exactly 12L: table charges 60,000, 87A wipes it.
    r = calculate_tax(1_200_000)
    assert r["rebate"] == 60_000, r
    assert r["total_tax"] == 0, r

    # 50k over the line: NO rebate at all, full bill. The cliff.
    r = calculate_tax(1_250_000)
    assert r["rebate"] == 0, r
    assert r["total_tax"] == 70_200, r

    # Salaried, 12.75L: deduction drops taxable to 12L -> rebate -> zero.
    r = calculate_tax(1_275_000, salaried=True)
    assert r["taxable_income"] == 1_200_000, r
    assert r["total_tax"] == 0, r

    # Salaried, 15L: taxable 14.25L -> 93,750 + 3,750 cess.
    r = calculate_tax(1_500_000, salaried=True)
    assert r["total_tax"] == 97_500, r

    # Income below the deduction must not go negative.
    assert calculate_tax(50_000, salaried=True)["total_tax"] == 0

    print("[calculator] all asserts passed")
```

**The `, r` after each assert** is the whole dict as the failure message. Bare `AssertionError` tells you nothing; `AssertionError: {'taxable_income': 1300000, 'tax_before_cess': 355000, ...}` tells you *which* number went wrong and by how much. ⭐ Three characters, free debugging.

Run it from the repo root — `python -m backend.routes.calculator` — and the project's assert count goes **17 → 27**.

---

## Concept 6 — The route is glue

```python
router = APIRouter()


class TaxRequest(BaseModel):
    income: float = Field(ge=0, description="Gross annual income in rupees")
    salaried: bool = False


class TaxResponse(BaseModel):
    taxable_income: float
    deduction: float
    tax_before_cess: float
    rebate: float
    cess: float
    total_tax: float


@router.post("/calculate", response_model=TaxResponse)
def calculate(req: TaxRequest):
    return calculate_tax(req.income, req.salaried)
```

Plus two lines in `main.py` — an import and an `include_router` — exactly as `chat.py` was wired on Day 14.

**Nothing here computes tax.** It converts JSON into arguments and a dict into JSON. This is Day 17's lesson repeating: *get the function right and the endpoint is glue*. Write the endpoint first and the tax logic ends up tangled with HTTP, untestable without a running server.

**Why `POST` and not `GET`?** Genuinely arguable — a calculation has no side effects, so `GET /calculate?income=1300000` is defensible REST. `POST` wins here because it matches the existing `/chat`, keeps income out of URLs and server access logs, and hands Pydantic a body to validate. ⭐ **Consistency inside one API beats REST purity across it.**

**The handler is one line only because the dict keys already match the response model exactly.** ⭐ Name a function's output keys to match the API contract and the entire adapter layer stops existing.

### `Field(ge=0)` — validate at the trust boundary

`calculate_tax` already has `max(0, ...)`, so why reject negatives at the edge?

Because they're different jobs. `max(0, ...)` protects against a **legitimate** small income (₹50,000 minus a ₹75,000 deduction). `Field(ge=0)` rejects an **illegitimate request** — income of −5000 is not a small income, it's a malformed one, and answering it with a cheerful ₹0 pretends the request made sense.

Tested it, and it returns **422 Unprocessable Entity** before your function is ever called. ⭐ **Validate at the trust boundary; clamp inside the domain.** Both, not either.

⭐ And remember Day 19's trap, still live here: **`response_model` is a whitelist, not a description.** Add a seventh key to the dict and forget to declare it on `TaxResponse`, and FastAPI deletes it from the response with no error anywhere.

---

## The bugs — 2 code, 1 conceptual, all silent

| # | Bug | Why nothing caught it | Class |
|---|---|---|---|
| 1 | `min(taxable, upper)` missing `- lower` | valid expression, valid number, wrong meaning — returned ₹3,55,000 with a straight face | **valid code, wrong meaning** (3rd sighting: Day 18, Day 19, today) |
| 2 | module docstring pushed below the imports | a string expression in the middle of a file is legal Python; it just evaluates and is thrown away. `__doc__` silently became `None` | **position-dependent syntax** |
| 3 | "rebate applies below 1,20,000" | ten times off, in the number that decides ₹0 vs ₹70,200 | **miscounted zeros** |

Bug 2 is new and worth keeping. Adding `from fastapi import APIRouter` *above* the docstring demoted it from documentation to litter. Nothing lints it, nothing throws; `help()`, IDE hovers, and any doc tooling just go blank. Confirm it yourself the way it was confirmed today:

```
python -c "import backend.routes.calculator as c; print(c.__doc__)"
```

`None` before the fix, the docstring after. The rule: **docstring first, then imports** — that's the only position Python accepts.

Also fixed in passing: `main.py`'s comment said `/calculator` while the route is `/calculate`. ⭐ Comments that name a route go stale the moment the route moves; either match it or don't name it.

---

## 60-second recall

- **Marginal slabs = water tank with taps.** Each tap charges only the water passing through *it*. ₹13L → **₹75,000**, never ₹1,95,000.
- **Rules from a published table live in a list**, not an `if/elif` chain. One loop reads it.
- **`float("inf")` is a sentinel** — it deletes the "last row has no ceiling" special case.
- **`min(taxable, upper) - lower`** covers partly-full and completely-full in one expression. `break`, not `continue`, when the water never arrived.
- **Order is the spec:** deduction → slabs → rebate → cess. Cess before the rebate bills ₹2,400 to someone who owes ₹0.
- **The rebate is not a 0% slab.** The table charges ₹60,000 at ₹12L; 87A erases it. ₹50,000 more income → ₹70,200 more tax. That cliff is real.
- **The rebate tests taxable income, and it's `<=`.** ₹12,00,000 exactly still qualifies.
- **`salaried=False` by default** — forgetting the flag must fail *safely*.
- **Pick test cases that each fail for a different reason.** Test both sides of every boundary.
- **`assert x == y, r`** — pass the dict as the message.
- **The route is glue.** Function first, endpoint second, `Field(ge=0)` at the edge, 422 before your code runs.
- **Docstring first, then imports.** Otherwise it's just a string.

---

## Interview flashcards

**Q. Your user says "I earn ₹13 lakh so I'm in the 15% bracket." What's wrong with that sentence?**
Nothing about the bracket — everything about what it implies. 15% is the **marginal** rate: the rate on the *next* rupee. Only ₹1,00,000 of a ₹13L income is inside the 12L–16L slab. The bill is ₹75,000 (+4% cess), not ₹1,95,000.

**Q. Why is the slab table a list of tuples instead of an `if/elif` chain?**
Table-driven logic. The rules come from a published table, so store the table and loop it once. A rate change is a one-number edit instead of seven branch edits, and the code is diff-able against the source PDF.

**Q. What does `float("inf")` buy you?**
It's a sentinel that removes a special case: the top slab has no ceiling, so give it one nothing can exceed. All rows then behave identically and the loop needs no exception.

**Q. Explain `min(taxable, upper) - lower`.**
The water sitting inside this slab. `upper` if the slab is completely full, `taxable` if it's partly full — `min` picks whichever is smaller — minus this slab's floor, which is the previous slab's ceiling.

**Q. Why must the 87A rebate run before the cess?**
The rebate's purpose is a zero bill. Compute cess first and the rebate can only erase the tax, leaving ₹2,400 of cess owed by someone whose tax is nil.

**Q. Is the ₹12 lakh threshold a 0% slab?**
No. The table genuinely charges ₹60,000 at ₹12L; the rebate erases it. The distinction is invisible at ₹12L and worth ₹70,200 at ₹12.5L.

**Q. The function already clamps with `max(0, ...)`. Why also validate `income >= 0` at the API?**
Different jobs. The clamp handles a legitimate small income; the validator rejects a malformed request. Trust boundaries reject, domain logic clamps.

**Q. `min(taxable, upper)` instead of `min(taxable, upper) - lower` — how would you catch that in review?**
You can't catch it by reading for errors, because there is no error: valid code, wrong meaning. You catch it with a hand-traced example whose right answer you know independently — here, the ₹1,95,000 appearing mid-sum is the tell.

**Q. Your agent needs to answer "what's my tax on 13 lakh?" — where does the LLM stop?**
At choosing the tool and filling its arguments. The model decides *what* (`calculate_tax`, income=1300000, salaried=False); the code decides *how much*. The model never computes and never re-reports a number it derived itself.

---

## Self-test

1. Freelancer, gross ₹20,00,000. Compute taxable income, tax before cess, cess, total — by hand, then check with the function.
2. Why does the loop `break` rather than `continue` when `taxable <= lower`?
3. Change `REBATE_87A_LIMIT` comparison from `<=` to `<`. Which single assert fails, and why is that the right one to fail?
4. A salaried person earns exactly ₹12,75,000. Explain in two sentences why they pay ₹0 while a freelancer at the same gross pays ₹70,200 — wait, what does the freelancer actually pay? Work it out.
5. You add a `"slab_breakdown"` key to the returned dict but don't touch `TaxResponse`. What does the API return, and what error do you see?
6. Why is `calculate_tax(1_300_000, True)` worse than `calculate_tax(1_300_000, salaried=True)`, given they do the same thing?
7. Marginal relief above ₹12L wasn't built. Describe, in one sentence, what it's supposed to fix.

---

## What's next

**Week 5 D2 — the calculator UI.** An income input, a salaried toggle, and a breakdown table wired to `POST /calculate`. Since Day 18 split `App.jsx` into components, a second screen is a change rather than a rewrite.

Worth naming now: the corpus is **GST-only**, so the RAG side *refuses* income-tax questions while the calculator answers them. Two halves of one product disagreeing about whether income tax is in scope — a product problem, not a bug, and it needs a decision before deploy.

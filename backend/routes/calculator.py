"""New-regime income tax calculator, FY 2025-26 (AY 2026-27).

Deterministic: no LLM in this file. Numbers in, numbers out.
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field

# Each row = (upper limit of the slab, rate charged inside it).
# Read top to bottom, exactly like the govt table.
SLABS = [
    (400_000, 0.00),     # 0-4L       nil
    (800_000, 0.05),     # 4L-8L      5%
    (1_200_000, 0.10),   # 8L-12L     10%
    (1_600_000, 0.15),   # 12-16L     15%
    (2_000_000, 0.20),   # 16L-20L    20%
    (2_400_000, 0.25),   # 20L-24L    25%
    (float("inf"), 0.30),   # above 24L  30%
]

STANDARD_DEDUCTION = 75_000     # salaried only - freelancers do NOT get this
REBATE_87A_LIMIT = 1_200_000    # taxable income at or below this -> tax becomes zero
CESS_RATE = 0.04                # health & education cess, on top of the tax

def tax_on_slabs(taxable):
    """Tax from the slab table alone. No deduction, no rebate, no cess."""
    tax = 0.0
    lower = 0         # floor of the slab we are standing in

    for upper, rate in SLABS:
        if taxable <= lower:      # water never reached this slab -> nor any above
            break
        in_this_slab = min(taxable, upper) - lower
        tax += in_this_slab * rate
        lower = upper       # this ceiling is the next slab's floor

    return tax

def calculate_tax(income, salaried=False):
    """Full new-regime tax for one financial year.
    income   - gross annual income in rupees
    salaried - True only for salaried people (they get the standard deduction)
    """
    deduction = STANDARD_DEDUCTION if salaried else 0
    taxable = max(0, income - deduction)

    tax = tax_on_slabs(taxable)

    # 87A: the table already charged; the rebate now erases it.
    # Note the test is on TAXABLE INCOME, not on the tax.
    rebate = tax if taxable <= REBATE_87A_LIMIT else 0
    tax -= rebate

    cess = tax * CESS_RATE
    total = tax + cess

    return {
        "taxable_income": taxable,
        "deduction": deduction,
        "tax_before_cess": round(tax),
        "rebate": round(rebate),
        "cess": round(cess),
        "total_tax": round(total),
    }

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


if __name__ == "__main__":
    # Freelance, 13L: 20k + 40k + 15k = 75,000, plus 4% cess.
    r = calculate_tax(1_300_000)
    assert r["tax_before_cess"] == 75_000, r
    assert r["total_tax"] == 78_000, r

    # Freelance, exactly 12L: table charges 60,000, 87A wipes it.
    r = calculate_tax(1_200_000)
    assert r["rebate"] == 60_000, r
    assert r["total_tax"] == 0, r

    # 50k over the line: NO rebate at all, full bill, The cliff.
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

    print("[calculator] all assert passed")
    print("13L freelancer:", calculate_tax(1_300_000))
    print("12L freelancer:", calculate_tax(1_200_000))
    print("13L salaried:", calculate_tax(1_300_000, True))
    print("12L salaried:", calculate_tax(1_200_000, True))

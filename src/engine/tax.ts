/**
 * New tax regime, FY 2026-27 (AY 2027-28). Slabs are unchanged from FY 2025-26.
 * Only the new regime is modelled; old-regime deductions (80C etc.) are not.
 */
const SLABS: Array<{ upTo: number; rate: number }> = [
  { upTo: 400_000, rate: 0 },
  { upTo: 800_000, rate: 0.05 },
  { upTo: 1_200_000, rate: 0.1 },
  { upTo: 1_600_000, rate: 0.15 },
  { upTo: 2_000_000, rate: 0.2 },
  { upTo: 2_400_000, rate: 0.25 },
  { upTo: Infinity, rate: 0.3 },
];

export const STANDARD_DEDUCTION = 75_000;
export const REBATE_LIMIT = 1_200_000; // taxable income up to this pays nil (Sec 87A)
export const CESS = 0.04;

export const EQUITY_LTCG_RATE = 0.125;
export const EQUITY_LTCG_EXEMPT = 125_000;
export const EQUITY_STCG_RATE = 0.2;
export const FD_TDS_THRESHOLD = 50_000; // per bank per year; 1,00,000 for seniors. Only affects cash flow, not tax owed.
export const DICGC_LIMIT = 500_000;

function slabTax(taxable: number): number {
  let tax = 0;
  let prev = 0;
  for (const s of SLABS) {
    if (taxable > prev) tax += (Math.min(taxable, s.upTo) - prev) * s.rate;
    prev = s.upTo;
    if (taxable <= s.upTo) break;
  }
  return tax;
}

/** Total tax including cess, with Sec 87A rebate and marginal relief just above 12 lakh. */
export function incomeTax(grossIncome: number, salaried = true): number {
  const taxable = Math.max(0, grossIncome - (salaried ? STANDARD_DEDUCTION : 0));
  let tax = slabTax(taxable);
  if (taxable <= REBATE_LIMIT) tax = 0;
  else tax = Math.min(tax, taxable - REBATE_LIMIT);
  return tax * (1 + CESS);
}

/**
 * Tax on the next rupee of interest income, cess included.
 * Measured over a 10k step so the marginal-relief zone just above 12 lakh shows up honestly
 * (every extra rupee there is taxed ~100%).
 */
export function marginalRate(grossIncome: number, salaried = true): number {
  const step = 10_000;
  return (incomeTax(grossIncome + step, salaried) - incomeTax(grossIncome, salaried)) / step;
}

export function emi(principal: number, annualRatePct: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0;
  const r = annualRatePct / 12 / 100;
  if (r === 0) return principal / months;
  const f = Math.pow(1 + r, months);
  return (principal * r * f) / (f - 1);
}

export function totalInterest(principal: number, annualRatePct: number, months: number): number {
  return emi(principal, annualRatePct, months) * months - principal;
}

/** Outstanding principal after `paid` instalments. */
export function balanceAfter(principal: number, annualRatePct: number, months: number, paid: number): number {
  const r = annualRatePct / 12 / 100;
  const e = emi(principal, annualRatePct, months);
  if (r === 0) return Math.max(0, principal - e * paid);
  const f = Math.pow(1 + r, paid);
  return Math.max(0, principal * f - (e * (f - 1)) / r);
}

export type Affordability = 'comfortable' | 'stretch' | 'unaffordable';

/**
 * Fixed-obligation-to-income ratio. Lenders typically cap total EMIs at 40-50% of net income;
 * under 35% is the common comfort rule of thumb.
 */
export function affordability(totalEmi: number, monthlyIncome: number): { foir: number; verdict: Affordability } {
  const foir = monthlyIncome > 0 ? totalEmi / monthlyIncome : Infinity;
  const verdict: Affordability = foir <= 0.35 ? 'comfortable' : foir <= 0.45 ? 'stretch' : 'unaffordable';
  return { foir, verdict };
}

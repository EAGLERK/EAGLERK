import { addMonthsToDate, afterTaxRate, daysBetween, effectiveYield, fdMaturity, rdMaturity } from './deposits';
import { equityPostTax } from './instruments';
import { realReturn } from './projection';
import { DICGC_LIMIT } from './tax';
import type { AssetClass, Investment, InvestmentKind, Liability, Rates } from './types';

const DAYS_PER_MONTH = 30.4375;

export const KIND_LABEL: Record<InvestmentKind, string> = {
  savings: 'Savings account',
  fd: 'Fixed deposit',
  rd: 'Recurring deposit',
  ppf: 'PPF',
  nps: 'NPS',
  epf: 'EPF',
  mutual_fund: 'Mutual fund',
  stocks: 'Stocks',
  gold: 'Gold',
  other: 'Other',
};

export function elapsedMonths(inv: Investment, today: string): number {
  return Math.max(0, daysBetween(inv.startDate, today) / DAYS_PER_MONTH);
}

export function installmentsPaid(inv: Investment, today: string): number {
  if (inv.kind !== 'rd') return 0;
  if (today < inv.startDate) return 0;
  return Math.min(inv.tenureMonths, Math.floor(elapsedMonths(inv, today)) + 1);
}

export function investedAmount(inv: Investment, today: string): number {
  return inv.kind === 'rd' ? inv.amount * installmentsPaid(inv, today) : inv.amount;
}

export function currentValue(inv: Investment, today: string): number {
  if (inv.currentValue !== undefined && inv.currentValue !== null && !Number.isNaN(inv.currentValue)) return inv.currentValue;
  const m = Math.min(elapsedMonths(inv, today), inv.tenureMonths || Infinity);
  if (inv.kind === 'fd' && inv.rate > 0) return fdMaturity(inv.amount, inv.rate, m);
  if (inv.kind === 'rd' && inv.rate > 0) {
    const paid = installmentsPaid(inv, today);
    let v = 0;
    for (let k = 0; k < paid; k++) v += inv.amount * Math.pow(1 + inv.rate / 400, (4 * Math.max(0, m - k)) / 12);
    return v;
  }
  return investedAmount(inv, today);
}

export interface Maturity {
  date: string;
  value: number;
  interest: number;
  daysLeft: number;
}

export function maturity(inv: Investment, today: string): Maturity | null {
  if ((inv.kind !== 'fd' && inv.kind !== 'rd') || !inv.tenureMonths || !inv.rate) return null;
  const value = inv.kind === 'fd' ? fdMaturity(inv.amount, inv.rate, inv.tenureMonths) : rdMaturity(inv.amount, inv.rate, inv.tenureMonths);
  const principal = inv.kind === 'fd' ? inv.amount : inv.amount * inv.tenureMonths;
  const date = addMonthsToDate(inv.startDate, inv.tenureMonths);
  return { date, value, interest: value - principal, daysLeft: daysBetween(today, date) };
}

export function assetSplit(inv: Investment, value: number): Record<AssetClass, number> {
  const z = { cash: 0, debt: 0, equity: 0, gold: 0, other: 0 };
  switch (inv.kind) {
    case 'savings': z.cash = value; break;
    case 'fd': case 'rd': case 'ppf': case 'epf': z.debt = value; break;
    case 'gold': z.gold = value; break;
    case 'stocks': z.equity = value; break;
    case 'mutual_fund':
    case 'nps': {
      const e = Math.min(100, Math.max(0, inv.equityPct ?? (inv.kind === 'nps' ? 50 : 100))) / 100;
      z.equity = value * e;
      z.debt = value * (1 - e);
      break;
    }
    default: z.other = value;
  }
  return z;
}

export interface Holding {
  inv: Investment;
  invested: number;
  value: number;
  gain: number;
  /** Annual rate used for comparison, in % */
  pretax: number;
  posttax: number;
  real: number;
  rateSource: 'yours' | 'assumed';
  flags: string[];
}

const ASSUMED_KEY: Partial<Record<InvestmentKind, string>> = {
  savings: 'savings', ppf: 'ppf', gold: 'gold', nps: 'nps', stocks: 'index', epf: 'ppf', other: 'fd',
};

export function evaluateHolding(inv: Investment, today: string, rates: Rates, marginal: number): Holding {
  const value = currentValue(inv, today);
  const invested = investedAmount(inv, today);
  const years = Math.max(1, elapsedMonths(inv, today) / 12);
  const infl = rates.inflation ?? 5;

  let pretax = inv.rate;
  let rateSource: Holding['rateSource'] = 'yours';
  if (!(pretax > 0)) {
    rateSource = 'assumed';
    if (inv.kind === 'mutual_fund') {
      const e = inv.equityPct ?? 100;
      pretax = e >= 65 ? rates.index : e > 35 ? rates.hybrid : rates.shortDebt;
    } else pretax = rates[ASSUMED_KEY[inv.kind] ?? 'fd'] ?? 0;
  }

  let posttax = pretax;
  switch (inv.kind) {
    case 'fd': case 'rd': posttax = afterTaxRate(effectiveYield(pretax), marginal); break;
    case 'savings': posttax = afterTaxRate(pretax, marginal); break;
    case 'ppf': case 'epf': case 'nps': case 'other': break;
    case 'mutual_fund': {
      const e = inv.equityPct ?? 100;
      if (e <= 35) posttax = afterTaxRate(pretax, marginal);
      else posttax = equityPostTax(pretax, years);
      break;
    }
    case 'stocks': case 'gold': posttax = equityPostTax(pretax, years); break;
  }

  const flags: string[] = [];
  const real = realReturn(posttax, infl);
  if ((inv.kind === 'fd' || inv.kind === 'rd' || inv.kind === 'savings') && real < 0.5) {
    flags.push(real < 0 ? 'Loses money after tax and inflation' : 'Barely beats inflation after tax');
  }
  if (inv.kind === 'fd' && inv.amount > DICGC_LIMIT) flags.push('Above the Rs 5 lakh DICGC cover for one bank');
  const mat = maturity(inv, today);
  if (mat && mat.daysLeft >= 0 && mat.daysLeft <= 30) flags.push(`Matures in ${mat.daysLeft} day(s): decide where it goes next`);
  if (inv.kind === 'savings' && value > 300_000) flags.push('Large idle balance earning savings-account interest');

  return { inv, invested, value, gain: value - invested, pretax, posttax, real, rateSource, flags };
}

export interface Portfolio {
  holdings: Holding[];
  total: number;
  invested: number;
  byClass: Record<AssetClass, number>;
  liabilities: number;
  netWorth: number;
  /** Value-weighted after-tax return of everything held, in % */
  blendedPosttax: number;
  emergency: number;
}

export function buildPortfolio(investments: Investment[], liabilities: Liability[], today: string, rates: Rates, marginal: number): Portfolio {
  const holdings = investments.map((i) => evaluateHolding(i, today, rates, marginal));
  const byClass: Record<AssetClass, number> = { cash: 0, debt: 0, equity: 0, gold: 0, other: 0 };
  let total = 0;
  let invested = 0;
  let weighted = 0;
  let emergency = 0;
  for (const h of holdings) {
    total += h.value;
    invested += h.invested;
    weighted += h.value * h.posttax;
    if (h.inv.emergency) emergency += h.value;
    const s = assetSplit(h.inv, h.value);
    (Object.keys(s) as AssetClass[]).forEach((k) => (byClass[k] += s[k]));
  }
  const owed = liabilities.reduce((a, l) => a + l.outstanding, 0);
  return { holdings, total, invested, byClass, liabilities: owed, netWorth: total - owed, blendedPosttax: total > 0 ? weighted / total : 0, emergency };
}

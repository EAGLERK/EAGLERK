import { afterTaxRate, effectiveYield } from './deposits';
import { futureValueLump, futureValueSip, realReturn } from './projection';
import { EQUITY_LTCG_EXEMPT, EQUITY_LTCG_RATE, EQUITY_STCG_RATE } from './tax';
import type { Rates } from './types';

export type TaxKind = 'slab' | 'equity' | 'exempt';

export interface Instrument {
  id: string;
  name: string;
  rateKey: string;
  tax: TaxKind;
  /** 1 capital-safe, 2 low, 3 medium, 4 high, 5 very high */
  risk: 1 | 2 | 3 | 4 | 5;
  /** Shortest horizon (years) where this makes sense, either from a lock-in or from volatility. */
  minYears: number;
  /** Illustrative bad-year return in %. Not drawn from a verified dataset. */
  badYear: number;
  where: string;
  note: string;
  /** Interest is compounded and quoted as a nominal rate (FD/RD style). */
  quarterly?: boolean;
  minAge?: number;
}

export const INSTRUMENTS: Instrument[] = [
  { id: 'savings', name: 'Savings account', rateKey: 'savings', tax: 'slab', risk: 1, minYears: 0, badYear: 0, where: 'Your bank', note: 'Keep only a month or two of spending here. After tax it loses to inflation.' },
  { id: 'fd', name: 'Bank fixed deposit', rateKey: 'fd', tax: 'slab', risk: 1, minYears: 0.5, badYear: 0, where: 'Any scheduled bank, net banking', note: 'Interest is taxed at your slab every year. DICGC insures Rs 5 lakh per depositor per bank. TDS applies above Rs 50,000 interest per bank.', quarterly: true },
  { id: 'rd', name: 'Bank recurring deposit', rateKey: 'rd', tax: 'slab', risk: 1, minYears: 0.5, badYear: 0, where: 'Any scheduled bank, net banking', note: 'Good for forcing a monthly habit. Same tax as FD. A missed instalment costs a penalty.', quarterly: true },
  { id: 'sfbFd', name: 'Small finance bank FD', rateKey: 'sfbFd', tax: 'slab', risk: 2, minYears: 1, badYear: 0, where: 'SFB app or branch', note: 'Higher rate, same Rs 5 lakh DICGC cover. Never put more than Rs 5 lakh in one bank.', quarterly: true },
  { id: 'ppf', name: 'PPF', rateKey: 'ppf', tax: 'exempt', risk: 1, minYears: 7, badYear: 0, where: 'Post office or SBI/major bank', note: 'Rs 500 to Rs 1.5 lakh a year. 15-year lock-in; partial withdrawal from year 7. Interest and maturity are tax-free. Rate is reset every quarter.' },
  { id: 'nsc', name: 'NSC (5 yr)', rateKey: 'nsc', tax: 'slab', risk: 1, minYears: 5, badYear: 0, where: 'Post office', note: 'Government-backed. Interest is taxed at slab each year even though it is paid at maturity.' },
  { id: 'scss', name: 'Senior Citizens Savings Scheme', rateKey: 'scss', tax: 'slab', risk: 1, minYears: 5, badYear: 0, where: 'Post office or bank', note: 'Age 60+ only (55+ if retired under VRS). Limit Rs 30 lakh. Quarterly payout.', minAge: 60 },
  { id: 'liquid', name: 'Liquid fund', rateKey: 'liquid', tax: 'slab', risk: 1, minYears: 0, badYear: 0, where: 'Direct plan via AMC site or an MF platform', note: 'Parking for emergency money. Gains are taxed at your slab. T+1 redemption. Not insured.' },
  { id: 'arbitrage', name: 'Arbitrage fund', rateKey: 'arbitrage', tax: 'equity', risk: 2, minYears: 0.5, badYear: -1, where: 'Direct plan via AMC site or an MF platform', note: 'Taxed like equity: 12.5% on gains after 12 months, 20% before. Often beats FDs after tax for higher slabs.' },
  { id: 'shortDebt', name: 'Short-duration debt fund', rateKey: 'shortDebt', tax: 'slab', risk: 2, minYears: 2, badYear: -3, where: 'Direct plan via AMC site or an MF platform', note: 'Gains taxed at slab. NAV can dip when rates rise, and the RBI just hiked, so avoid it for money you need within two years.' },
  { id: 'hybrid', name: 'Balanced advantage / hybrid fund', rateKey: 'hybrid', tax: 'equity', risk: 3, minYears: 3, badYear: -20, where: 'Direct plan via AMC site or an MF platform', note: 'Lower swings than pure equity. Good first step for someone nervous about markets.' },
  { id: 'gold', name: 'Gold ETF', rateKey: 'gold', tax: 'equity', risk: 3, minYears: 5, badYear: -15, where: 'Demat account', note: 'Hedge, not a growth engine. Keep it to 5-10% of your portfolio.' },
  { id: 'nps', name: 'NPS (Tier 1)', rateKey: 'nps', tax: 'exempt', risk: 3, minYears: 10, badYear: -15, where: 'eNPS, bank, or any POP', note: 'Locked until 60. At exit 60% can be taken out tax-free; the rest must buy an annuity, which is taxable when paid. Treated as tax-free here, which flatters it slightly.' },
  { id: 'index', name: 'Nifty 50 index fund', rateKey: 'index', tax: 'equity', risk: 4, minYears: 5, badYear: -35, where: 'Direct plan via AMC site or an MF platform', note: 'Lowest-cost way to own the market. Expect to see -30% at some point and not sell.' },
  { id: 'midcap', name: 'Midcap / flexi-cap fund', rateKey: 'midcap', tax: 'equity', risk: 5, minYears: 7, badYear: -45, where: 'Direct plan via AMC site or an MF platform', note: 'Higher expected return, deeper drawdowns, and many active funds trail the index. Cap at a quarter of your equity.' },
];

export function instrumentRate(inst: Instrument, rates: Rates): number {
  return rates[inst.rateKey] ?? 0;
}

/** Annual after-tax return in %, ignoring the Rs 1.25 lakh equity exemption (which only helps small gains). */
export function postTaxReturn(inst: Instrument, rates: Rates, marginal: number, years = 5): number {
  const pre = instrumentRate(inst, rates);
  const base = inst.quarterly ? effectiveYield(pre) : pre;
  if (inst.tax === 'exempt') return base;
  if (inst.tax === 'slab') return afterTaxRate(base, marginal);
  return equityPostTax(base, years);
}

/** Equity-taxed return: tax is paid once at exit on the gain, so annualise the after-tax multiple. */
export function equityPostTax(pretaxPct: number, years: number): number {
  const t = years >= 1 ? EQUITY_LTCG_RATE : EQUITY_STCG_RATE;
  const span = Math.max(years, 1 / 12);
  const multiple = Math.pow(1 + pretaxPct / 100, span);
  return (Math.pow(1 + (multiple - 1) * (1 - t), 1 / span) - 1) * 100;
}

export interface Ranked {
  inst: Instrument;
  pretax: number;
  posttax: number;
  real: number;
  eligible: boolean;
  /** Why it is ruled out, or the main caveat if it is not. */
  reason: string;
  verdict: 'best' | 'good' | 'avoid' | 'unsuitable';
}

const MAX_RISK = { conservative: 3, moderate: 4, aggressive: 5 } as const;

export function maxRiskFor(risk: keyof typeof MAX_RISK, years: number): number {
  const byHorizon = years < 3 ? 2 : years < 5 ? 3 : 5;
  return Math.min(MAX_RISK[risk], byHorizon);
}

export function rankInstruments(opts: {
  rates: Rates;
  marginal: number;
  years: number;
  risk: keyof typeof MAX_RISK;
  age: number;
}): Ranked[] {
  const { rates, marginal, years, risk, age } = opts;
  const infl = rates.inflation ?? 5;
  const cap = maxRiskFor(risk, years);
  const rows: Ranked[] = INSTRUMENTS.map((inst) => {
    const pretax = instrumentRate(inst, rates);
    const posttax = postTaxReturn(inst, rates, marginal, years);
    const real = realReturn(posttax, infl);
    let reason = '';
    let eligible = true;
    if (inst.minAge && age < inst.minAge) {
      eligible = false;
      reason = `Needs age ${inst.minAge}+`;
    } else if (years < inst.minYears) {
      eligible = false;
      reason = inst.risk >= 3 ? `Too short: needs ${inst.minYears}+ years or a bad market year can leave you down` : `Lock-in or exit cost makes sense only for ${inst.minYears}+ years`;
    } else if (inst.risk > cap) {
      eligible = false;
      reason = `Risk level ${inst.risk} is above what a ${risk} investor with a ${years.toFixed(1)}-year horizon should hold`;
    } else if (real < 0.5) {
      reason = 'Barely beats inflation after tax';
    }
    return { inst, pretax, posttax, real, eligible, reason, verdict: 'good' as Ranked['verdict'] };
  });
  rows.sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.real - a.real);
  const eligible = rows.filter((r) => r.eligible);
  eligible.forEach((r, i) => {
    r.verdict = r.real < 0.5 ? 'avoid' : i < 3 ? 'best' : 'good';
  });
  rows.filter((r) => !r.eligible).forEach((r) => (r.verdict = 'unsuitable'));
  return rows;
}

export interface Corpus {
  invested: number;
  gross: number;
  tax: number;
  net: number;
  real: number;
}

/** What a lump sum and/or monthly SIP is worth after tax and inflation at the end of `years`. */
export function corpusAfterTax(
  inst: Instrument,
  rates: Rates,
  marginal: number,
  flows: { lump: number; monthly: number; years: number },
): Corpus {
  const { lump, monthly, years } = flows;
  const months = Math.round(years * 12);
  const invested = lump + monthly * months;
  const infl = rates.inflation ?? 5;
  const pre = instrumentRate(inst, rates);
  const base = inst.quarterly ? effectiveYield(pre) : pre;
  const deflate = (v: number) => v / Math.pow(1 + infl / 100, years);

  if (inst.tax === 'equity') {
    const gross = futureValueLump(lump, base, years) + futureValueSip(monthly, base, months);
    const gains = Math.max(0, gross - invested);
    const rate = years >= 1 ? EQUITY_LTCG_RATE : EQUITY_STCG_RATE;
    const taxable = years >= 1 ? Math.max(0, gains - EQUITY_LTCG_EXEMPT) : gains;
    const tax = taxable * rate;
    return { invested, gross, tax, net: gross - tax, real: deflate(gross - tax) };
  }
  const rate = inst.tax === 'slab' ? afterTaxRate(base, marginal) : base;
  const gross = futureValueLump(lump, base, years) + futureValueSip(monthly, base, months);
  const net = futureValueLump(lump, rate, years) + futureValueSip(monthly, rate, months);
  return { invested, gross, tax: gross - net, net, real: deflate(net) };
}

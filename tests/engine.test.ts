import { describe, expect, it } from 'vitest';
import { ratesFromAssumptions, DEFAULT_ASSUMPTIONS } from '../src/engine/assumptions';
import { affordability, balanceAfter, emi, totalInterest } from '../src/engine/loan';
import { fdMaturity, rdMaturity, effectiveYield, monthsBetween, addMonthsToDate } from '../src/engine/deposits';
import { incomeTax, marginalRate } from '../src/engine/tax';
import { futureValueSip, requiredMonthly, monthsToReach, realReturn } from '../src/engine/projection';
import { parseStatement, parseDate } from '../src/engine/csv';
import { categorize } from '../src/engine/categorize';
import { averages, insights, summarize } from '../src/engine/cashflow';
import { corpusAfterTax, equityPostTax, INSTRUMENTS, rankInstruments } from '../src/engine/instruments';
import { buildPortfolio, currentValue, maturity } from '../src/engine/portfolio';
import { planGoal, earliestMonths } from '../src/engine/goals';
import { buildAdvice, equityShare, projectWealth } from '../src/engine/advisor';
import type { Goal, Investment, Profile, Txn } from '../src/engine/types';

const rates = ratesFromAssumptions(DEFAULT_ASSUMPTIONS);
const close = (a: number, b: number, tol = 1) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe('loans', () => {
  it('matches standard EMI figures', () => {
    close(emi(1_000_000, 9, 60), 20_758.3, 0.5); // Rs 10L, 9%, 5 yr
    close(emi(5_000_000, 8.5, 240), 43_391, 1); // Rs 50L, 8.5%, 20 yr
  });
  it('total interest = emi * n - principal', () => {
    close(totalInterest(1_000_000, 9, 60), 20_758.3 * 60 - 1_000_000, 30);
  });
  it('balance reaches ~0 at the end and equals principal at the start', () => {
    expect(balanceAfter(1_000_000, 9, 60, 0)).toBeCloseTo(1_000_000, 4);
    close(balanceAfter(1_000_000, 9, 60, 60), 0, 0.01);
  });
  it('handles zero rate and zero principal', () => {
    expect(emi(120_000, 0, 12)).toBe(10_000);
    expect(emi(0, 9, 12)).toBe(0);
  });
  it('classifies FOIR', () => {
    expect(affordability(30_000, 100_000).verdict).toBe('comfortable');
    expect(affordability(40_000, 100_000).verdict).toBe('stretch');
    expect(affordability(50_000, 100_000).verdict).toBe('unaffordable');
    expect(affordability(1, 0).verdict).toBe('unaffordable');
  });
});

describe('deposits', () => {
  it('FD with quarterly compounding', () => {
    close(fdMaturity(100_000, 7, 12), 107_185.9, 0.5);
    close(effectiveYield(7), 7.1859, 0.001);
  });
  it('RD is between simple and fully-compounded bounds', () => {
    const v = rdMaturity(1000, 7, 12);
    expect(v).toBeGreaterThan(12_000 + 1000 * 0.07 * (78 / 12) * 0.95);
    expect(v).toBeLessThan(12_000 + 1000 * 0.07 * (78 / 12) * 1.05);
  });
  it('date helpers', () => {
    expect(monthsBetween('2026-01-31', '2026-03-30')).toBe(1);
    expect(addMonthsToDate('2026-01-31', 1)).toBe('2026-02-28');
  });
});

describe('tax (new regime FY26-27)', () => {
  it('nil up to 12.75L gross for a salaried person', () => {
    expect(incomeTax(1_200_000)).toBe(0);
    expect(incomeTax(1_275_000)).toBe(0);
  });
  it('15L gross pays 97,500', () => {
    close(incomeTax(1_500_000), 97_500, 1);
  });
  it('marginal relief just above the rebate cliff', () => {
    close(incomeTax(1_280_000), 5_200, 1); // taxable 12.05L: tax capped at the 5,000 excess, +4% cess
  });
  it('marginal rate is the slab rate plus cess inside a slab', () => {
    close(marginalRate(2_000_000), 0.208, 0.002);
    expect(marginalRate(900_000)).toBe(0);
  });
});

describe('projection', () => {
  it('required monthly matches annuity maths', () => {
    close(requiredMonthly(1_000_000, 0, 12, 60), 12_244, 2);
    expect(requiredMonthly(100, 1_000, 8, 12)).toBe(0);
  });
  it('round trip: SIP of required amount reaches the target', () => {
    const m = requiredMonthly(2_500_000, 100_000, 10, 84);
    const grown = 100_000 * Math.pow(1 + 0.1 / 12, 84) + futureValueSip(m, 10, 84);
    close(grown, 2_500_000, 1);
  });
  it('monthsToReach agrees with futureValueSip', () => {
    const n = monthsToReach(1_000_000, 0, 12_245, 12);
    expect(n).toBeGreaterThanOrEqual(59);
    expect(n).toBeLessThanOrEqual(60);
    expect(monthsToReach(1e9, 0, 1, 0, 24)).toBe(Infinity);
  });
  it('real return', () => {
    close(realReturn(7.1, 5), 2.0, 0.001);
  });
});

describe('statement import', () => {
  const hdfc = `Account Statement,,,,,
Customer: X,,,,,
Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance
01/10/26,UPI-SWIGGY-9876@ybl,0000,01/10/26,"1,250.50",,98000
01/10/26,UPI-SWIGGY-9876@ybl,0000,01/10/26,"1,250.50",,96750
03/10/26,NEFT-ACME CORP-SALARY OCT,0001,03/10/26,,"1,20,000.00",216750
05/10/26,ACH D- HDFC BANK LTD-EMI LOAN,0002,05/10/26,"18,000.00",,198750
,,,,,,
`;
  it('parses preamble, indian number format, debit/credit columns', () => {
    const r = parseStatement(hdfc);
    expect(r.rows).toHaveLength(4);
    const sal = r.rows.find((x) => x.category === 'Salary')!;
    expect(sal).toMatchObject({ amount: 120_000, type: 'income', date: '2026-10-03' });
    expect(r.rows[0]).toMatchObject({ amount: 1250.5, type: 'expense', category: 'Food & Dining' });
    expect(r.rows.find((x) => x.description.includes('EMI'))!.category).toBe('EMI');
  });
  it('keeps two identical same-day rows but with distinct ids; re-import is idempotent', () => {
    const a = parseStatement(hdfc).rows;
    const b = parseStatement(hdfc).rows;
    expect(new Set(a.map((x) => x.id)).size).toBe(a.length);
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
  });
  it('handles a single Dr/Cr amount column and other date styles', () => {
    const r = parseStatement(`Txn Date,Description,Amount,Dr/Cr
12-Oct-2026,Zomato order,450.00,Dr
2026-10-13,Salary credit,50000,Cr`);
    expect(r.rows.map((x) => [x.type, x.amount])).toEqual([['expense', 450], ['income', 50_000]]);
  });
  it('reports unreadable files instead of throwing', () => {
    expect(parseStatement('hello\nworld').warnings.length).toBeGreaterThan(0);
  });
  it('dates are day-first', () => {
    expect(parseDate('03/04/2026')).toBe('2026-04-03');
    expect(parseDate('31/13/2026')).toBeNull();
  });
  it('categorises by direction', () => {
    expect(categorize('SALARY', 'income')).toBe('Salary');
    expect(categorize('SALARY', 'expense')).toBe('Other');
    expect(categorize('Zerodha SIP', 'expense')).toBe('Investments');
  });
});

const T = (date: string, amount: number, type: 'income' | 'expense', category: string): Txn => ({ id: date + category + amount, date, description: category, amount, type, category, source: 'manual' });

describe('cashflow', () => {
  const txns = [
    T('2026-07-01', 100_000, 'income', 'Salary'),
    T('2026-07-05', 20_000, 'expense', 'Rent'),
    T('2026-07-09', 5_000, 'expense', 'Food & Dining'),
    T('2026-07-10', 15_000, 'expense', 'Investments'),
    T('2026-08-01', 100_000, 'income', 'Salary'),
    T('2026-08-05', 20_000, 'expense', 'Rent'),
    T('2026-08-09', 5_000, 'expense', 'Food & Dining'),
    T('2026-09-01', 100_000, 'income', 'Salary'),
    T('2026-09-05', 20_000, 'expense', 'Rent'),
    T('2026-09-09', 12_000, 'expense', 'Food & Dining'),
  ];
  it('investments are savings, not spend', () => {
    const s = summarize(txns, '2026-07');
    expect(s).toMatchObject({ income: 100_000, spend: 25_000, invested: 15_000, saved: 75_000, needs: 20_000, wants: 5_000 });
    expect(s.savingsRate).toBeCloseTo(0.75);
  });
  it('averages over months that have data', () => {
    const a = averages(txns, '2026-09', 3);
    expect(a.months).toBe(3);
    close(a.spend, (25_000 + 25_000 + 32_000) / 3, 0.01);
    expect(averages(txns, '2026-12', 1).months).toBe(0);
  });
  it('flags a category spike against the prior average', () => {
    const msgs = insights(txns, '2026-09').map((i) => i.text);
    expect(msgs.some((m) => m.startsWith('Food & Dining') && m.includes('140%'))).toBe(true);
  });
});

describe('instruments', () => {
  const marginal = 0.208; // 20L gross
  it('PPF beats a taxable FD at a high slab', () => {
    const ppf = INSTRUMENTS.find((i) => i.id === 'ppf')!;
    const fd = INSTRUMENTS.find((i) => i.id === 'fd')!;
    const r = rankInstruments({ rates, marginal, years: 10, risk: 'moderate', age: 30 });
    const real = (id: string) => r.find((x) => x.inst.id === id)!.real;
    expect(real('ppf')).toBeGreaterThan(real('fd'));
    expect(ppf.tax).toBe('exempt');
    expect(fd.tax).toBe('slab');
  });
  it('FD after tax at 30% slab can fall below inflation', () => {
    const r = rankInstruments({ rates, marginal: 0.312, years: 3, risk: 'conservative', age: 30 });
    expect(r.find((x) => x.inst.id === 'fd')!.real).toBeLessThan(0);
  });
  it('equity is not eligible for a 2-year horizon; SCSS not for a 30-year-old', () => {
    const r = rankInstruments({ rates, marginal, years: 2, risk: 'aggressive', age: 30 });
    expect(r.find((x) => x.inst.id === 'index')!.eligible).toBe(false);
    expect(r.find((x) => x.inst.id === 'scss')!.eligible).toBe(false);
    expect(r.find((x) => x.inst.id === 'ppf')!.eligible).toBe(false);
  });
  it('conservative investors can still hold hybrid funds but not midcap', () => {
    const r = rankInstruments({ rates, marginal, years: 15, risk: 'conservative', age: 30 });
    expect(r.find((x) => x.inst.id === 'hybrid')!.eligible).toBe(true);
    expect(r.find((x) => x.inst.id === 'midcap')!.eligible).toBe(false);
  });
  it('equity exit tax is annualised, not shaved', () => {
    const t = equityPostTax(11, 10);
    expect(t).toBeLessThan(11);
    expect(t).toBeGreaterThan(11 * (1 - 0.125)); // exit tax drags less than a flat 12.5% haircut
  });
  it('corpus: tax-free PPF lump sum equals pure compounding; equity applies the 1.25L exemption', () => {
    const ppf = INSTRUMENTS.find((i) => i.id === 'ppf')!;
    close(corpusAfterTax(ppf, rates, 0.3, { lump: 100_000, monthly: 0, years: 10 }).net, 100_000 * Math.pow(1.071, 10), 0.5);
    const idx = INSTRUMENTS.find((i) => i.id === 'index')!;
    const small = corpusAfterTax(idx, rates, 0.3, { lump: 0, monthly: 5_000, years: 3 });
    expect(small.tax).toBe(0); // gains under 1.25L
    const big = corpusAfterTax(idx, rates, 0.3, { lump: 0, monthly: 20_000, years: 15 });
    close(big.tax, (big.gross - big.invested - 125_000) * 0.125, 0.5);
    expect(big.real).toBeLessThan(big.net);
  });
});

describe('portfolio', () => {
  const today = '2026-10-29';
  const fd: Investment = { id: 'a', kind: 'fd', name: 'SBI FD', institution: 'SBI', startDate: '2026-04-29', amount: 100_000, rate: 7, tenureMonths: 12 };
  const rd: Investment = { id: 'b', kind: 'rd', name: 'RD', institution: 'SBI', startDate: '2026-07-01', amount: 5_000, rate: 6.5, tenureMonths: 12 };
  it('accrues FD value from the start date', () => {
    close(currentValue(fd, today), fdMaturity(100_000, 7, 6), 120);
  });
  it('RD counts instalments paid so far', () => {
    const v = currentValue(rd, today);
    expect(v).toBeGreaterThan(5_000 * 4);
    expect(v).toBeLessThan(5_000 * 4.5);
  });
  it('maturity info', () => {
    const m = maturity(fd, today)!;
    expect(m.date).toBe('2027-04-29');
    close(m.value, 107_185.9, 0.5);
    expect(m.daysLeft).toBe(182);
  });
  it('builds net worth and flags weak holdings', () => {
    const sav: Investment = { id: 'c', kind: 'savings', name: 'Savings', institution: 'HDFC', startDate: '2020-01-01', amount: 400_000, rate: 3, tenureMonths: 0, currentValue: 400_000, emergency: true };
    const p = buildPortfolio([fd, rd, sav], [{ id: 'l', name: 'Car loan', outstanding: 200_000, rate: 9, emi: 8_000 }], today, rates, 0.312);
    expect(p.netWorth).toBeCloseTo(p.total - 200_000);
    expect(p.emergency).toBe(400_000);
    expect(p.byClass.cash).toBe(400_000);
    const s = p.holdings.find((h) => h.inv.id === 'c')!;
    expect(s.flags.some((f) => f.includes('idle'))).toBe(true);
    expect(s.flags.some((f) => f.includes('Loses money'))).toBe(true);
  });
});

describe('goals', () => {
  const ctx = { today: '2026-10-29', rates, monthlyIncome: 150_000, existingEmi: 0, marginal: 0.208, annualIncome: 1_800_000 };
  const car: Goal = { id: 'g', kind: 'car', name: 'Car', price: 1_200_000, targetMonth: '2028-10', downPaymentPct: 20, loanRate: 9.25, loanYears: 4, extraCostPct: 12, saved: 0 };
  it('prices the car at target and splits cash vs loan', () => {
    const p = planGoal(car, ctx);
    expect(p.months).toBe(24);
    close(p.priceAtTarget, 1_200_000 * Math.pow(1.04, 2), 1);
    close(p.downPayment, p.priceAtTarget * 0.2, 0.01);
    close(p.upfront, p.priceAtTarget * 0.32, 0.01);
    close(p.loanAmount, p.priceAtTarget * 0.8, 0.01);
    close(p.emi, emi(p.loanAmount, 9.25, 48), 0.01);
    close(p.lifetimeCost, p.priceAtTarget + p.extraCost + p.interest, 0.01);
    // 26k EMI on a 1.5L income is 17%: the strict 10% car rule fails, everything else passes
    expect(p.checks.filter((c) => !c.ok).map((c) => c.label)).toEqual(['Car EMI within 10% of income']);
    expect(p.vehicleId).toBe('rd');
  });
  it('required monthly actually reaches the up-front cash', () => {
    const p = planGoal(car, ctx);
    const grown = futureValueSip(p.requiredMonthly, p.vehicleReturn, p.months);
    close(grown, p.upfront, 5);
  });
  it('flags a stretched house loan and the RBI LTV minimum', () => {
    const house: Goal = { id: 'h', kind: 'house', name: 'House', price: 9_000_000, targetMonth: '2031-10', downPaymentPct: 15, loanRate: 8.75, loanYears: 25, extraCostPct: 7, saved: 0 };
    const p = planGoal(house, { ...ctx, monthlyIncome: 120_000, existingEmi: 10_000 });
    expect(p.verdict).not.toBe('comfortable');
    const ltv = p.checks.find((c) => c.label.startsWith('Lender minimum'))!;
    expect(ltv.ok).toBe(false); // price at target is above Rs 75 lakh => 25% minimum
    expect(p.tenures.map((t) => t.years)).toEqual([10, 15, 20, 25, 30]);
    expect(p.tenures[0].interest).toBeLessThan(p.tenures[4].interest);
  });
  it('earliest date falls as monthly saving rises', () => {
    const slow = earliestMonths(car, 10_000, ctx);
    const fast = earliestMonths(car, 25_000, ctx);
    expect(fast).toBeLessThan(slow);
    expect(earliestMonths(car, 0, ctx, 60)).toBe(Infinity);
  });
});

describe('advisor', () => {
  const profile: Profile = { name: 'T', age: 30, monthlyIncome: 150_000, monthlyExpenses: 70_000, annualGrossIncome: 1_800_000, salaried: true, risk: 'moderate', emergencyMonths: 6, hasTermInsurance: false, hasHealthInsurance: true };
  const goals: Goal[] = [
    { id: 'g1', kind: 'bike', name: 'Bike', price: 200_000, targetMonth: '2027-10', downPaymentPct: 30, loanRate: 11, loanYears: 2, extraCostPct: 10, saved: 0 },
    { id: 'g2', kind: 'car', name: 'Car', price: 1_200_000, targetMonth: '2029-10', downPaymentPct: 20, loanRate: 9.25, loanYears: 4, extraCostPct: 12, saved: 0 },
  ];
  const portfolio = buildPortfolio([], [], '2026-10-29', rates, 0.208);
  const base = { profile, income: 150_000, spend: 70_000, currentInvestedPerMonth: 10_000, portfolio, liabilities: [], goals, rates, marginal: 0.208, today: '2026-10-29' };

  it('never allocates more than the monthly surplus and orders the steps correctly', () => {
    const a = buildAdvice(base);
    expect(a.capacity).toBe(80_000);
    expect(a.allocated).toBeLessThanOrEqual(80_000 + 0.01);
    expect(a.allocated + a.unallocated).toBeCloseTo(80_000, 1);
    const order = a.lines.map((l) => l.step);
    expect(order.indexOf('safety')).toBeLessThan(order.indexOf('goal'));
    expect(order.lastIndexOf('goal')).toBeLessThan(order.indexOf('wealth') === -1 ? 99 : order.indexOf('wealth'));
  });
  it('warns when term insurance is missing and reports emergency-fund gap', () => {
    const a = buildAdvice(base);
    expect(a.actions.some((x) => x.text.includes('term plan'))).toBe(true);
    expect(a.emergencyTarget).toBe(420_000);
    expect(a.lines[0].label).toBe('Emergency fund');
  });
  it('prepays expensive debt before investing', () => {
    const a = buildAdvice({ ...base, goals: [], profile: { ...profile, emergencyMonths: 0 }, liabilities: [{ id: 'cc', name: 'Credit card', outstanding: 30_000, rate: 36, emi: 0 }] });
    const idx = a.lines.findIndex((l) => l.step === 'debt');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(a.lines.findIndex((l) => l.step === 'wealth')).toBeGreaterThan(idx);
  });
  it('with costly debt, buffers a quarter of the surplus first, then clears the debt, then tops up the buffer', () => {
    const a = buildAdvice({ ...base, goals: [], liabilities: [{ id: 'cc', name: 'Credit card', outstanding: 30_000, rate: 36, emi: 0 }] });
    expect(a.lines.map((l) => l.step).slice(0, 3)).toEqual(['safety', 'debt', 'safety']);
    expect(a.lines[0].monthly).toBeCloseTo(20_000); // 25% of 80k
    expect(a.lines[1].monthly).toBe(5_000); // 30k outstanding spread over ~6 months
    expect(a.lines[1].why).toContain("6 month");
  });
  it('allocates nothing when spend >= income', () => {
    const a = buildAdvice({ ...base, spend: 160_000 });
    expect(a.lines).toHaveLength(0);
    expect(a.actions.some((x) => x.level === 'bad' && x.text.includes('Spending equals'))).toBe(true);
  });
  it('flags a short-funded goal', () => {
    const a = buildAdvice({ ...base, income: 80_000, profile: { ...profile, emergencyMonths: 0 } });
    expect(a.lines.some((l) => l.short)).toBe(true);
  });
  it('equity share follows 110 - age with caps', () => {
    expect(equityShare(30, 'moderate')).toBe(75);
    expect(equityShare(55, 'moderate')).toBe(55);
    expect(equityShare(30, 'conservative')).toBe(40);
    expect(equityShare(80, 'conservative')).toBe(20);
  });
  it('projection is monotonic and ordered low <= base <= high', () => {
    const pts = projectWealth(500_000, 8, 20_000, 10, 20);
    expect(pts[0].base).toBe(500_000);
    pts.forEach((p, i) => {
      expect(p.low).toBeLessThanOrEqual(p.base);
      expect(p.base).toBeLessThanOrEqual(p.high);
      if (i) expect(p.base).toBeGreaterThan(pts[i - 1].base);
    });
  });
});

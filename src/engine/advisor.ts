import { INSTRUMENTS, rankInstruments, type Instrument, type Ranked } from './instruments';
import { planGoal, type GoalPlan, type PlanContext } from './goals';
import type { Portfolio } from './portfolio';
import { futureValueSip } from './projection';
import type { Goal, Liability, Profile, Rates } from './types';

export type StepTone = 'protect' | 'safety' | 'debt' | 'goal' | 'wealth';

export interface PlanLine {
  step: StepTone;
  label: string;
  /** Instrument or product to use. */
  into: string;
  where: string;
  monthly: number;
  why: string;
  short?: boolean;
}

export interface Action {
  level: 'bad' | 'watch' | 'info';
  text: string;
}

export interface AdvicePlan {
  income: number;
  spend: number;
  capacity: number;
  emergencyTarget: number;
  emergencyHave: number;
  lines: PlanLine[];
  allocated: number;
  unallocated: number;
  actions: Action[];
  equityPct: number;
  wealthMonthly: number;
  goalPlans: Array<{ goal: Goal; plan: GoalPlan; funded: number }>;
  /** Blended after-tax return of the long-term bucket, in %. */
  wealthReturn: number;
}

export interface AdviceInput {
  profile: Profile;
  income: number;
  spend: number;
  currentInvestedPerMonth: number;
  portfolio: Portfolio;
  liabilities: Liability[];
  goals: Goal[];
  rates: Rates;
  marginal: number;
  today: string;
}

const PPF_MONTHLY_CAP = 12_500; // Rs 1.5 lakh a year

function top(r: Ranked[], preferIds?: string[]): Ranked {
  const eligible = r.filter((x) => x.eligible);
  if (preferIds) {
    const hit = eligible.find((x) => preferIds.includes(x.inst.id));
    if (hit) return hit;
  }
  return eligible[0] ?? r[0];
}

/** Equity-oriented share of the long-term bucket: 110 minus age, shifted by risk profile. Conservative is capped at 40%. */
export function equityShare(age: number, risk: Profile['risk']): number {
  const adj = risk === 'conservative' ? -20 : risk === 'aggressive' ? 10 : 0;
  const cap = risk === 'conservative' ? 40 : 75;
  return Math.min(cap, Math.max(20, 110 - age + adj));
}

export function buildAdvice(inp: AdviceInput): AdvicePlan {
  const { profile, portfolio, rates, marginal } = inp;
  const income = inp.income;
  const spend = inp.spend;
  const capacity = Math.max(0, income - spend);
  const existingEmi = inp.liabilities.reduce((a, l) => a + l.emi, 0);

  const ctx: PlanContext = {
    today: inp.today, rates, monthlyIncome: income, existingEmi, marginal,
    annualIncome: profile.annualGrossIncome,
  };

  const actions: Action[] = [];
  const lines: PlanLine[] = [];
  let remaining = capacity;

  // 0. Protection comes before any investing.
  if (!profile.hasHealthInsurance) actions.push({ level: 'bad', text: 'Get health insurance before investing a rupee. One hospital stay can wipe out years of SIPs. Cover of Rs 10 lakh or more for the family is a common starting point.' });
  if (!profile.hasTermInsurance) actions.push({ level: 'bad', text: 'Get a pure term plan if anyone depends on your income. Aim for 10-15x annual income. Skip endowment and ULIP plans that mix insurance with investing.' });

  // 1-2. Emergency fund and expensive debt. While carrying costly debt, only a quarter of the surplus goes to the buffer
  // first; the debt gets the next slice and the buffer is topped up afterwards.
  const emergencyTarget = profile.emergencyMonths * spend;
  const emergencyHave = portfolio.emergency;
  const gap = Math.max(0, emergencyTarget - emergencyHave);
  const bestSafe = Math.max(...INSTRUMENTS.filter((i) => i.risk <= 2).map((i) => rates[i.rateKey] ?? 0));
  const costly = (l: Liability) => l.rate > Math.max(10, bestSafe + 2) && l.outstanding > 0;
  const hasCostlyDebt = inp.liabilities.some(costly);
  const emergencyMonthly = Math.min(remaining, gap / 6);
  const emergencyPick = top(rankInstruments({ rates, marginal, years: 0.5, risk: 'conservative', age: profile.age }), ['liquid', 'fd', 'savings']);
  const emergencyLine = (amt: number, label: string) => {
    lines.push({ step: 'safety', label, into: emergencyPick.inst.name, where: emergencyPick.inst.where, monthly: amt, why: `Target ${profile.emergencyMonths} months of spending (${fmt(emergencyTarget)}); you have ${fmt(emergencyHave)}. Filling the gap of ${fmt(gap)} over about 6 months.` });
    remaining -= amt;
  };
  let emergencyPaid = 0;
  if (gap > 0 && spend > 0 && emergencyMonthly > 0) {
    emergencyPaid = hasCostlyDebt ? Math.min(emergencyMonthly, capacity * 0.25) : emergencyMonthly;
    emergencyLine(emergencyPaid, 'Emergency fund');
  }
  if (gap > 0 && spend > 0 && capacity > 0 && emergencyMonthly < gap / 6) {
    actions.push({ level: 'watch', text: 'Your monthly surplus cannot fill the emergency fund in six months. Pause everything else until it is at least 3 months of spending.' });
  }

  for (const l of [...inp.liabilities].sort((a, b) => b.rate - a.rate)) {
    if (costly(l) && remaining > 0) {
      // Aim to clear it in about 6 months so goals are not starved for longer than that.
      const amt = Math.min(remaining, l.outstanding / 6);
      const months = Math.ceil(l.outstanding / Math.max(amt, 1));
      lines.push({ step: 'debt', label: `Prepay: ${l.name}`, into: 'Extra principal payment', where: 'Your lender', monthly: amt, why: `Paying off ${l.rate}% debt is a guaranteed ${l.rate}% return. No safe investment pays that. Cleared in about ${months} month(s) at this pace; then this ${fmt(amt)} moves to goals and long-term investing.` });
      remaining -= amt;
    } else if (costly(l)) {
      actions.push({ level: 'watch', text: `${l.name} costs ${l.rate}%. Clear it before building long-term investments.` });
    }
  }
  if (hasCostlyDebt && emergencyMonthly - emergencyPaid > 0 && remaining > 0) {
    emergencyLine(Math.min(remaining, emergencyMonthly - emergencyPaid), 'Emergency fund (top-up after debt)');
  }

  // 3. Goals, soonest first.
  const goalPlans: AdvicePlan['goalPlans'] = [];
  const sorted = [...inp.goals].sort((a, b) => a.targetMonth.localeCompare(b.targetMonth));
  for (const g of sorted) {
    const plan = planGoal(g, ctx);
    const funded = Math.min(remaining, plan.requiredMonthly);
    const shortHorizon = plan.years < 3;
    const where = INSTRUMENTS.find((i) => i.id === plan.vehicleId)?.where ?? '';
    if (plan.requiredMonthly > 0) {
      if (funded > 0) lines.push({
        step: 'goal', label: `Goal: ${g.name}`, into: plan.vehicle, where, monthly: funded, short: funded < plan.requiredMonthly - 1,
        why: `${fmt(plan.upfront)} needed in ${plan.months} month(s) for the down payment and fees. ${shortHorizon ? 'Under 3 years, so no equity.' : 'Over 3 years, so some market exposure is reasonable.'}`,
      });
      if (funded < plan.requiredMonthly - 1) actions.push({ level: 'watch', text: `${g.name} is short by ${fmt(plan.requiredMonthly - funded)} a month. Move the date out, lower the price, or raise the down-payment saving.` });
    }
    if (plan.verdict === 'unaffordable') actions.push({ level: 'bad', text: `The ${g.name} EMI of ${fmt(plan.emi)} would push total EMIs to ${(plan.foir * 100).toFixed(0)}% of income. Most lenders will refuse that, and it leaves nothing for saving.` });
    remaining -= funded;
    goalPlans.push({ goal: g, plan, funded });
  }

  // 4. Everything left builds long-term wealth.
  const eq = equityShare(profile.age, profile.risk);
  const wealth = Math.max(0, remaining);
  let wealthReturn = 0;
  if (wealth > 0) {
    const rk = rankInstruments({ rates, marginal, years: 15, risk: profile.risk, age: profile.age });
    const by = (id: string) => rk.find((x) => x.inst.id === id)!;
    const goldPct = eq >= 40 ? 5 : 0;
    const debtPct = 100 - eq - goldPct;
    const equityAmt = (wealth * eq) / 100;
    const midShare = profile.risk === 'aggressive' ? 0.3 : profile.risk === 'moderate' ? 0.2 : 0;
    const parts: Array<{ inst: Instrument; amt: number; why: string }> = [];
    const core = profile.risk === 'conservative' ? 'hybrid' : 'index';
    parts.push({ inst: by(core).inst, amt: equityAmt * (1 - midShare), why: `${eq}% equity-oriented, from 110 minus age and adjusted for a ${profile.risk} profile. ${core === 'index' ? 'An index fund keeps costs low.' : 'A hybrid fund cushions the swings.'}` });
    if (midShare > 0) parts.push({ inst: by('midcap').inst, amt: equityAmt * midShare, why: 'A satellite slice for extra growth. Keep it under a quarter of equity.' });
    if (goldPct) parts.push({ inst: by('gold').inst, amt: (wealth * goldPct) / 100, why: 'Hedge against bad equity years.' });
    const debtAmt = (wealth * debtPct) / 100;
    const ppfAmt = Math.min(debtAmt, PPF_MONTHLY_CAP);
    if (ppfAmt > 0) parts.push({ inst: by('ppf').inst, amt: ppfAmt, why: `${rates.ppf}% tax-free is the best risk-free return available to you. Rs 1.5 lakh a year cap.` });
    if (debtAmt - ppfAmt > 0) parts.push({ inst: by(profile.risk === 'conservative' ? 'fd' : 'shortDebt').inst, amt: debtAmt - ppfAmt, why: 'Rest of the stable portion once PPF is full.' });

    let wsum = 0;
    for (const p of parts.filter((x) => x.amt > 0)) {
      lines.push({ step: 'wealth', label: 'Long-term wealth', into: p.inst.name, where: p.inst.where, monthly: p.amt, why: p.why });
      const r = rk.find((x) => x.inst.id === p.inst.id)!;
      wsum += r.posttax * p.amt;
    }
    wealthReturn = wsum / wealth;
  } else if (capacity > 0) {
    actions.push({ level: 'info', text: 'Your whole surplus is already committed to the steps above. Long-term investing starts once those are funded.' });
  }

  if (capacity <= 0) actions.push({ level: 'bad', text: 'Spending equals or exceeds income. No allocation is possible until that changes. Start in Transactions: find the three biggest non-essential categories.' });
  if (existingEmi > 0 && income > 0 && existingEmi / income > 0.4) actions.push({ level: 'bad', text: `Existing EMIs take ${(existingEmi / income * 100).toFixed(0)}% of income. Do not add new loans.` });
  if (inp.currentInvestedPerMonth > 0 && capacity > 0 && inp.currentInvestedPerMonth < capacity * 0.5) {
    actions.push({ level: 'info', text: `You currently invest about ${fmt(inp.currentInvestedPerMonth)} a month against a surplus of ${fmt(capacity)}. The gap is either sitting idle in a savings account or going untracked.` });
  }

  const allocated = lines.reduce((a, l) => a + l.monthly, 0);
  return {
    income, spend, capacity, emergencyTarget, emergencyHave, lines, allocated, unallocated: Math.max(0, capacity - allocated),
    actions, equityPct: eq, wealthMonthly: wealth, goalPlans, wealthReturn,
  };
}

const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

export interface ProjectionPoint {
  year: number;
  low: number;
  base: number;
  high: number;
}

/** Net worth of today's investments plus the long-term monthly bucket, for 3 return scenarios. Goal money is spent, so it is excluded. */
export function projectWealth(startValue: number, startReturn: number, monthly: number, monthlyReturn: number, years: number): ProjectionPoint[] {
  const out: ProjectionPoint[] = [];
  for (let y = 0; y <= years; y++) {
    const at = (shift: number) => startValue * Math.pow(1 + Math.max(0, startReturn + shift) / 100, y) + futureValueSip(monthly, Math.max(0, monthlyReturn + shift), y * 12);
    out.push({ year: y, low: at(-2.5), base: at(0), high: at(2.5) });
  }
  return out;
}

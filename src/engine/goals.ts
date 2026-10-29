import { affordability, emi, totalInterest, type Affordability } from './loan';
import { equityPostTax, postTaxReturn, INSTRUMENTS } from './instruments';
import { afterTaxRate, effectiveYield } from './deposits';
import { inflate, monthsToReach, requiredMonthly } from './projection';
import type { Goal, GoalKind, Rates } from './types';

export const GOAL_DEFAULTS: Record<GoalKind, Pick<Goal, 'downPaymentPct' | 'loanYears' | 'extraCostPct' | 'name'> & { rateKey: string; growthKey: string }> = {
  car: { name: 'Car', downPaymentPct: 20, loanYears: 4, extraCostPct: 12, rateKey: 'carLoan', growthKey: 'carGrowth' },
  house: { name: 'House', downPaymentPct: 20, loanYears: 20, extraCostPct: 7, rateKey: 'homeLoan', growthKey: 'houseGrowth' },
  bike: { name: 'Bike', downPaymentPct: 20, loanYears: 2, extraCostPct: 10, rateKey: 'bikeLoan', growthKey: 'bikeGrowth' },
  other: { name: 'Goal', downPaymentPct: 100, loanYears: 0, extraCostPct: 0, rateKey: 'fd', growthKey: 'inflation' },
};

export interface RuleCheck {
  ok: boolean;
  label: string;
  detail: string;
}

export interface TenureOption {
  years: number;
  emi: number;
  interest: number;
  foir: number;
  verdict: Affordability;
}

export interface GoalPlan {
  months: number;
  years: number;
  priceAtTarget: number;
  downPayment: number;
  extraCost: number;
  /** Cash needed on the day: down payment plus registration/insurance/stamp duty. */
  upfront: number;
  loanAmount: number;
  loanMonths: number;
  emi: number;
  interest: number;
  /** Price + extra costs + interest over the loan. */
  lifetimeCost: number;
  /** Monthly saving that reaches `upfront` on the target date, after tax on the chosen vehicle. */
  requiredMonthly: number;
  vehicle: string;
  vehicleId: string;
  vehicleReturn: number;
  foir: number;
  verdict: Affordability;
  checks: RuleCheck[];
  tenures: TenureOption[];
}

export function monthsUntil(targetMonth: string, today: string): number {
  const [ty, tm] = targetMonth.split('-').map(Number);
  const [y, m] = today.split('-').map(Number);
  return Math.max(0, (ty - y) * 12 + (tm - m));
}

/** Pick where goal money should sit, by how long it has to wait. Returns after-tax annual return in %. */
export function goalVehicle(months: number, rates: Rates, marginal: number): { id: string; name: string; ret: number } {
  const y = months / 12;
  if (y <= 2) return { id: 'rd', name: 'Recurring deposit / short FD', ret: afterTaxRate(effectiveYield(rates.rd), marginal) };
  if (y <= 5) return { id: 'shortDebt', name: 'Short-duration debt fund', ret: postTaxReturn(INSTRUMENTS.find((i) => i.id === 'shortDebt')!, rates, marginal, y) };
  if (y <= 8) return { id: 'hybrid', name: 'Hybrid / balanced advantage fund', ret: equityPostTax(rates.hybrid, y) };
  return { id: 'index', name: 'Nifty 50 index fund', ret: equityPostTax(rates.index, y) };
}

const TENURES: Record<GoalKind, number[]> = { car: [3, 4, 5, 7], house: [10, 15, 20, 25, 30], bike: [1, 2, 3, 4], other: [] };

export interface PlanContext {
  today: string;
  rates: Rates;
  monthlyIncome: number;
  existingEmi: number;
  marginal: number;
  annualIncome: number;
}

export function planGoal(goal: Goal, ctx: PlanContext): GoalPlan {
  const d = GOAL_DEFAULTS[goal.kind];
  const months = monthsUntil(goal.targetMonth, ctx.today);
  const years = months / 12;
  const growth = ctx.rates[d.growthKey] ?? ctx.rates.inflation ?? 5;
  const priceAtTarget = inflate(goal.price, growth, years);
  const downPayment = (priceAtTarget * goal.downPaymentPct) / 100;
  const extraCost = (priceAtTarget * goal.extraCostPct) / 100;
  const upfront = downPayment + extraCost;
  const loanAmount = Math.max(0, priceAtTarget - downPayment);
  const loanMonths = Math.round(goal.loanYears * 12);
  const e = emi(loanAmount, goal.loanRate, loanMonths);
  const interest = totalInterest(loanAmount, goal.loanRate, loanMonths);
  const veh = goalVehicle(months, ctx.rates, ctx.marginal);
  const need = requiredMonthly(upfront, goal.saved, veh.ret, months);
  const { foir, verdict } = affordability(ctx.existingEmi + e, ctx.monthlyIncome);

  const checks: RuleCheck[] = [];
  const pctIncome = ctx.monthlyIncome > 0 ? (e / ctx.monthlyIncome) * 100 : Infinity;
  const fmtPct = (n: number) => (Number.isFinite(n) ? `${n.toFixed(0)}%` : 'n/a');
  if (loanAmount > 0) {
    checks.push({ ok: foir <= 0.4, label: 'Total EMIs within 40% of income', detail: `With this loan, ${fmtPct(foir * 100)} of monthly income goes to EMIs. Lenders usually stop at 40-50%.` });
  }
  if (goal.kind === 'car') {
    checks.push({ ok: goal.downPaymentPct >= 20, label: '20% down payment', detail: `You plan ${goal.downPaymentPct}%. A car loses roughly 15-20% of its value in year one, so less than 20% down leaves you owing more than it is worth.` });
    checks.push({ ok: goal.loanYears <= 4, label: 'Loan of 4 years or less', detail: `Planned tenure is ${goal.loanYears} years. Longer tenures cut the EMI but cost far more in interest.` });
    checks.push({ ok: pctIncome <= 10, label: 'Car EMI within 10% of income', detail: `EMI is ${fmtPct(pctIncome)} of income. Fuel, insurance and servicing come on top.` });
  } else if (goal.kind === 'bike') {
    checks.push({ ok: goal.downPaymentPct >= 20, label: '20% down payment', detail: `You plan ${goal.downPaymentPct}%. Bike loan rates run high, so every rupee of down payment saves interest at ${goal.loanRate}%.` });
    checks.push({ ok: goal.loanYears <= 3, label: 'Loan of 3 years or less', detail: `Planned tenure is ${goal.loanYears} years. A bike depreciates faster than a loan at this rate gets paid off.` });
    checks.push({ ok: pctIncome <= 5, label: 'Bike EMI within 5% of income', detail: `EMI is ${fmtPct(pctIncome)} of income.` });
  } else if (goal.kind === 'house') {
    const minDp = priceAtTarget <= 3_000_000 ? 10 : priceAtTarget <= 7_500_000 ? 20 : 25;
    checks.push({ ok: goal.downPaymentPct >= minDp, label: `Lender minimum down payment (${minDp}%)`, detail: `RBI loan-to-value limits: up to Rs 30 lakh 90%, Rs 30-75 lakh 80%, above Rs 75 lakh 75%. At this price you need at least ${minDp}% down.` });
    checks.push({ ok: goal.downPaymentPct >= 20, label: '20% down payment (recommended)', detail: `You plan ${goal.downPaymentPct}%. More down means a smaller EMI and a lower insurance and interest bill.` });
    checks.push({ ok: ctx.annualIncome > 0 && goal.price <= ctx.annualIncome * 5, label: 'Price within 5x annual income', detail: ctx.annualIncome > 0 ? `Today's price is ${(goal.price / ctx.annualIncome).toFixed(1)}x annual income. Above 5x, the EMI usually crowds out everything else.` : 'Add your annual income in Settings to check this.' });
    checks.push({ ok: goal.loanYears <= 20, label: 'Tenure of 20 years or less', detail: `Planned tenure is ${goal.loanYears} years. Each extra 5 years adds a large chunk of interest. Prepay when you can.` });
  }
  if (months <= 0 && goal.saved < upfront) {
    checks.push({ ok: false, label: 'Target date has arrived', detail: `You have ${Math.round(goal.saved).toLocaleString('en-IN')} saved against ${Math.round(upfront).toLocaleString('en-IN')} needed. Move the date out.` });
  }

  const tenures: TenureOption[] = TENURES[goal.kind].map((y) => {
    const ee = emi(loanAmount, goal.loanRate, y * 12);
    const a = affordability(ctx.existingEmi + ee, ctx.monthlyIncome);
    return { years: y, emi: ee, interest: totalInterest(loanAmount, goal.loanRate, y * 12), foir: a.foir, verdict: a.verdict };
  });

  return {
    months, years, priceAtTarget, downPayment, extraCost, upfront, loanAmount, loanMonths,
    emi: e, interest, lifetimeCost: priceAtTarget + extraCost + interest,
    requiredMonthly: need, vehicle: veh.name, vehicleId: veh.id, vehicleReturn: veh.ret, foir, verdict, checks, tenures,
  };
}

/** If you can put `monthly` aside, how many months until the up-front cash covers a purchase whose price keeps rising? */
export function earliestMonths(goal: Goal, monthly: number, ctx: PlanContext, cap = 480): number {
  const d = GOAL_DEFAULTS[goal.kind];
  const growth = ctx.rates[d.growthKey] ?? 5;
  const upfrontAt = (m: number) => inflate(goal.price, growth, m / 12) * ((goal.downPaymentPct + goal.extraCostPct) / 100);
  const vehicleRet = (m: number) => goalVehicle(m, ctx.rates, ctx.marginal).ret;
  let bal = goal.saved;
  for (let m = 1; m <= cap; m++) {
    bal = bal * (1 + vehicleRet(m) / 1200) + monthly;
    if (bal >= upfrontAt(m)) return m;
  }
  return Infinity;
}

export { monthsToReach };

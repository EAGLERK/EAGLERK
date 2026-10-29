import { DEFAULT_CATEGORIES, groupOf } from './categories';
import type { Txn } from './types';

export const monthOf = (date: string) => date.slice(0, 7);

export interface CategoryTotal {
  category: string;
  amount: number;
  group: ReturnType<typeof groupOf>;
}

export interface MonthSummary {
  month: string;
  income: number;
  /** Everything spent except money moved into investments. */
  spend: number;
  invested: number;
  /** income - spend. This is what is available to invest or save, whether or not it was. */
  saved: number;
  savingsRate: number;
  needs: number;
  wants: number;
  byCategory: CategoryTotal[];
  txnCount: number;
}

export function summarize(txns: Txn[], month: string): MonthSummary {
  const rows = txns.filter((t) => monthOf(t.date) === month);
  const totals = new Map<string, number>();
  let income = 0;
  let spend = 0;
  let invested = 0;
  let needs = 0;
  let wants = 0;
  for (const t of rows) {
    if (t.type === 'income') {
      income += t.amount;
      continue;
    }
    const g = groupOf(t.category);
    totals.set(t.category, (totals.get(t.category) ?? 0) + t.amount);
    if (g === 'savings') invested += t.amount;
    else {
      spend += t.amount;
      if (g === 'needs') needs += t.amount;
      else wants += t.amount;
    }
  }
  const byCategory = [...totals.entries()]
    .map(([category, amount]) => ({ category, amount, group: groupOf(category) }))
    .sort((a, b) => b.amount - a.amount);
  const saved = income - spend;
  return { month, income, spend, invested, saved, savingsRate: income > 0 ? saved / income : 0, needs, wants, byCategory, txnCount: rows.length };
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthRange(endMonth: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(endMonth, i - count + 1));
}

export function series(txns: Txn[], endMonth: string, count: number): MonthSummary[] {
  return monthRange(endMonth, count).map((m) => summarize(txns, m));
}

export function monthsWithData(txns: Txn[]): string[] {
  return [...new Set(txns.map((t) => monthOf(t.date)))].sort();
}

export interface Averages {
  months: number;
  income: number;
  spend: number;
  invested: number;
  saved: number;
}

/** Average over the last `n` months that have data, ending at `endMonth`. */
export function averages(txns: Txn[], endMonth: string, n = 3): Averages {
  const have = new Set(monthsWithData(txns));
  const used = monthRange(endMonth, n).filter((m) => have.has(m)).map((m) => summarize(txns, m));
  const k = used.length || 1;
  const sum = (f: (s: MonthSummary) => number) => used.reduce((a, s) => a + f(s), 0) / k;
  return { months: used.length, income: sum((s) => s.income), spend: sum((s) => s.spend), invested: sum((s) => s.invested), saved: sum((s) => s.saved) };
}

export interface Insight {
  level: 'good' | 'watch' | 'bad' | 'info';
  text: string;
}

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

export function insights(txns: Txn[], month: string): Insight[] {
  const cur = summarize(txns, month);
  if (cur.txnCount === 0) return [];
  const out: Insight[] = [];

  if (cur.income > 0) {
    const pct = Math.round(cur.savingsRate * 100);
    if (cur.savingsRate >= 0.3) out.push({ level: 'good', text: `You kept ${pct}% of income this month. That is above the 20% minimum most plans assume.` });
    else if (cur.savingsRate >= 0.2) out.push({ level: 'good', text: `Savings rate is ${pct}%, which meets the 20% baseline.` });
    else if (cur.savingsRate >= 0) out.push({ level: 'watch', text: `Savings rate is ${pct}%, under the 20% baseline. Closing the gap needs ${inr(cur.income * 0.2 - cur.saved)} less spending or more income.` });
    else out.push({ level: 'bad', text: `You spent ${inr(-cur.saved)} more than you earned this month.` });

    const needsPct = cur.needs / cur.income;
    const wantsPct = cur.wants / cur.income;
    if (needsPct > 0.5) out.push({ level: 'watch', text: `Needs take ${Math.round(needsPct * 100)}% of income (50/30/20 guideline: 50%). Rent, EMIs and bills are the lever, not daily spending.` });
    if (wantsPct > 0.3) out.push({ level: 'watch', text: `Wants take ${Math.round(wantsPct * 100)}% of income (guideline: 30%).` });
  } else {
    out.push({ level: 'info', text: 'No income recorded for this month, so savings rate cannot be computed.' });
  }

  const prior = monthRange(addMonths(month, -1), 3).map((m) => summarize(txns, m)).filter((s) => s.txnCount > 0);
  if (prior.length) {
    for (const c of cur.byCategory) {
      if (c.group === 'savings') continue;
      const avg = prior.reduce((a, s) => a + (s.byCategory.find((x) => x.category === c.category)?.amount ?? 0), 0) / prior.length;
      if (avg > 0 && c.amount > avg * 1.25 && c.amount - avg > 1000) {
        out.push({ level: 'watch', text: `${c.category} is ${inr(c.amount)}, up ${Math.round((c.amount / avg - 1) * 100)}% on your ${prior.length}-month average of ${inr(avg)}.` });
      }
    }
  }

  const other = cur.byCategory.find((c) => c.category === 'Other');
  if (other && cur.spend > 0 && other.amount / cur.spend > 0.15) {
    out.push({ level: 'info', text: `${Math.round((other.amount / cur.spend) * 100)}% of spend is uncategorised. Recategorise it in Transactions for accurate numbers.` });
  }
  return out;
}

export const categoryNames = () => DEFAULT_CATEGORIES.map((c) => c.name);

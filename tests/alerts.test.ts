import { describe, expect, it } from 'vitest';
import { buildAlerts, type AlertInput } from '../src/engine/alerts';
import type { Txn } from '../src/engine/types';

let n = 0;
const tx = (date: string, amount: number, type: 'income' | 'expense', category = 'Groceries'): Txn => ({ id: `t${n++}`, date, description: category, amount, type, category, source: 'manual' });

const base: AlertInput = { name: 'Asha', today: '2026-11-10', txns: [], goalCount: 0, goalsNeed: 0, surplus: 0, income: 0, existingEmi: 0, signedIn: false, sample: false };
const ids = (i: Partial<AlertInput>) => buildAlerts({ ...base, ...i }).map((a) => a.id);

describe('alerts', () => {
  it('always starts with a welcome note that offers the tour', () => {
    const a = buildAlerts(base).find((x) => x.id === 'welcome')!;
    expect(a.title).toBe('Welcome, Asha');
    expect(a.action?.tab).toBe('#tour');
  });

  it('asks for a first import when there are no transactions, but not for sample data', () => {
    expect(ids({})).toContain('get-started');
    expect(ids({ sample: true })).not.toContain('get-started');
  });

  it('flags a month where spending beat income, using the last complete month', () => {
    const txns = [tx('2026-10-01', 50000, 'income', 'Salary'), tx('2026-10-05', 70000, 'expense', 'Rent'), tx('2026-11-02', 100, 'expense')];
    const a = buildAlerts({ ...base, txns }).find((x) => x.id === 'overspend:2026-10')!;
    expect(a.level).toBe('bad');
    expect(a.body).toContain('₹20,000');
  });

  it('does not flag a month with savings', () => {
    const txns = [tx('2026-10-01', 90000, 'income', 'Salary'), tx('2026-10-05', 30000, 'expense', 'Rent')];
    expect(ids({ txns }).some((x) => x.startsWith('overspend'))).toBe(false);
  });

  it('warns about heavy EMIs and goals that do not fit', () => {
    const r = ids({ income: 100000, existingEmi: 45000, goalCount: 2, goalsNeed: 60000, surplus: 40000 });
    expect(r).toContain('emi-burden');
    expect(r).toContain('goals-gap');
    expect(ids({ income: 100000, existingEmi: 30000, goalCount: 2, goalsNeed: 30000, surplus: 40000 })).not.toContain('emi-burden');
    expect(ids({ income: 100000, existingEmi: 30000, goalCount: 2, goalsNeed: 30000, surplus: 40000 })).not.toContain('goals-gap');
  });

  it('counts uncategorised transactions in buckets, so the id changes only when it grows a lot', () => {
    const many = (k: number) => Array.from({ length: k }, () => tx('2026-10-03', 100, 'expense', 'Other'));
    expect(ids({ txns: many(4) }).some((x) => x.startsWith('uncategorised'))).toBe(false);
    expect(ids({ txns: many(7) })).toContain('uncategorised:0');
    expect(ids({ txns: many(12) })).toContain('uncategorised:1');
  });

  it('reminds to import when the newest transaction is over 35 days old', () => {
    expect(ids({ txns: [tx('2026-09-01', 100, 'expense')] })).toContain('stale:2026-11');
    expect(ids({ txns: [tx('2026-11-05', 100, 'expense')] })).not.toContain('stale:2026-11');
    expect(ids({ txns: [tx('2026-09-01', 100, 'expense')], sample: true })).not.toContain('stale:2026-11');
  });

  it('reminds local-only users to back up after 30 days, but not signed-in users', () => {
    const txns = Array.from({ length: 25 }, (_, k) => tx(`2026-11-0${(k % 9) + 1}`, 100, 'expense'));
    expect(ids({ txns })).toContain('backup:2026-11');
    expect(ids({ txns, lastBackupAt: '2026-11-01' })).not.toContain('backup:2026-11');
    expect(ids({ txns, lastBackupAt: '2026-09-01' })).toContain('backup:2026-11');
    expect(ids({ txns, signedIn: true })).not.toContain('backup:2026-11');
  });

  it('reports sync trouble for signed-in users, most urgent first', () => {
    const a = buildAlerts({ ...base, signedIn: true, sync: 'error', txns: [tx('2026-11-05', 100, 'expense')] });
    expect(a[0].id).toBe('sync-error');
    expect(a[0].level).toBe('bad');
    expect(buildAlerts({ ...base, signedIn: true, sync: 'conflict' })[0].id).toBe('sync-conflict');
    expect(ids({ signedIn: false, sync: 'error' })).not.toContain('sync-error');
  });

  it('keeps stable ids for the same situation', () => {
    const input = { ...base, income: 100000, existingEmi: 45000 };
    expect(buildAlerts(input).map((a) => a.id)).toEqual(buildAlerts(input).map((a) => a.id));
  });
});

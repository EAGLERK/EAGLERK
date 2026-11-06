import { addMonths, insights, monthOf, monthsWithData, summarize } from './cashflow';
import { money } from '../lib/format';
import { emiWords } from '../lib/region';
import type { Txn } from './types';

export type AlertLevel = 'bad' | 'watch' | 'info';

export interface AppAlert {
  /** Stable, so "read" and "already shown on this device" survive reloads. Includes the month where an alert should come back each month. */
  id: string;
  level: AlertLevel;
  title: string;
  body: string;
  action?: { label: string; tab: string };
}

export interface AlertInput {
  name: string;
  today: string;
  txns: Txn[];
  goalCount: number;
  /** What all goals together need to save each month, and what is left over each month. */
  goalsNeed: number;
  surplus: number;
  income: number;
  existingEmi: number;
  lastBackupAt?: string;
  signedIn: boolean;
  sync?: 'saved' | 'saving' | 'error' | 'conflict';
  /** Sample data is made up, so reminders about importing or backing up it would be noise. */
  sample: boolean;
}

const dayNumber = (iso: string) => Math.floor(Date.parse(iso.slice(0, 10) + 'T00:00:00Z') / 86400000);
const monthName = (m: string) => new Date(m + '-01T00:00:00Z').toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const RANK: Record<AlertLevel, number> = { bad: 0, watch: 1, info: 2 };

/**
 * Alerts worked out from the data, never invented. Each rule says why it fired. Month-based rules look at the latest complete
 * month (or the current one early in the month, when there is nothing else), so numbers do not change with every new transaction.
 */
export function buildAlerts(i: AlertInput): AppAlert[] {
  const out: AppAlert[] = [];
  const add = (a: AppAlert) => out.push(a);
  const thisMonth = monthOf(i.today);

  if (i.signedIn && i.sync === 'conflict') add({ id: 'sync-conflict', level: 'bad', title: 'Your changes need a decision', body: 'This account was changed on another device. Choose which version to keep so nothing is lost.' });
  else if (i.signedIn && i.sync === 'error') add({ id: 'sync-error', level: 'bad', title: 'Your changes are not saved', body: 'MyMoney could not reach your account. Your edits are kept here and will be saved when the connection is back.' });

  const months = monthsWithData(i.txns);
  const complete = months.filter((m) => m < thisMonth);
  const review = complete[complete.length - 1] ?? months[months.length - 1];

  if (review) {
    const cur = summarize(i.txns, review);
    if (cur.income > 0 && cur.saved < 0) {
      add({ id: `overspend:${review}`, level: 'bad', title: `You spent more than you earned in ${monthName(review)}`, body: `Spending was ${money(-cur.saved)} above income. Open Transactions to see where it went.`, action: { label: 'See where it went', tab: 'transactions' } });
    }
    // Categories well above the person's own recent average (the same rule the Dashboard notes use).
    const jumps = insights(i.txns, review).filter((n) => n.level === 'watch' && /\bup \d+%/.test(n.text));
    jumps.slice(0, 2).forEach((n, k) => add({ id: `jump:${review}:${n.text.split(' is ')[0]}:${k}`, level: 'watch', title: `${n.text.split(' is ')[0]} spending is up in ${monthName(review)}`, body: n.text, action: { label: 'Review', tab: 'transactions' } }));
  }

  if (i.income > 0 && i.existingEmi / i.income > 0.4) {
    add({ id: 'emi-burden', level: 'watch', title: `${emiWords(true)} take a large share of your income`, body: `Your ${emiWords()} are ${Math.round((i.existingEmi / i.income) * 100)}% of your monthly income. Lenders usually like to see 40% or less, and new loans for goals will add to it.`, action: { label: 'See your loans', tab: 'goals' } });
  }
  if (i.goalCount > 0 && i.goalsNeed > i.surplus) {
    add({ id: 'goals-gap', level: 'watch', title: 'Your goals need more than you have left over', body: `Together they need ${money(i.goalsNeed)} a month and your surplus is ${money(i.surplus)}. Push a date out, trim a price or raise income.`, action: { label: 'Adjust goals', tab: 'goals' } });
  }

  const other = i.txns.filter((t) => t.category === 'Other').length;
  if (other >= 5) add({ id: `uncategorised:${Math.floor(other / 10)}`, level: 'info', title: `${other} transactions are marked Other`, body: 'Give them a category so the Dashboard and your savings rate are accurate.', action: { label: 'Review', tab: 'transactions' } });

  if (!i.sample && i.txns.length > 0) {
    const latest = i.txns.reduce((a, t) => (t.date > a ? t.date : a), '');
    const gap = dayNumber(i.today) - dayNumber(latest);
    if (gap > 35) add({ id: `stale:${thisMonth}`, level: 'info', title: 'No new transactions for a while', body: `The latest one is from ${latest}. Import your newest statement to keep the numbers current.`, action: { label: 'Import a statement', tab: 'transactions' } });
    if (!i.signedIn && i.txns.length >= 20 && (!i.lastBackupAt || dayNumber(i.today) - dayNumber(i.lastBackupAt) > 30)) {
      add({ id: `backup:${thisMonth}`, level: 'watch', title: 'Back up your data', body: 'Your data lives only in this browser, and clearing site data would erase it. Download a backup file now and then.', action: { label: 'Back up', tab: 'settings' } });
    }
  }
  if (!i.sample && i.txns.length === 0) add({ id: 'get-started', level: 'info', title: 'Add your first transactions', body: 'Import a bank statement (CSV or Excel) or add one by hand, and the Dashboard fills in.', action: { label: 'Import a statement', tab: 'transactions' } });

  add({ id: 'welcome', level: 'info', title: i.name.trim() ? `Welcome, ${i.name.trim()}` : 'Welcome to MyMoney', body: 'A one-minute tour shows where everything is.', action: { label: 'Take the tour', tab: '#tour' } });

  return out.sort((a, b) => RANK[a.level] - RANK[b.level]);
}

export { addMonths };

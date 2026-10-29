import type { Category } from './types';

export const DEFAULT_CATEGORIES: Category[] = [
  { name: 'Salary', group: 'income' },
  { name: 'Business / Freelance', group: 'income' },
  { name: 'Interest & Dividends', group: 'income' },
  { name: 'Other Income', group: 'income' },

  { name: 'Rent', group: 'needs' },
  { name: 'EMI', group: 'needs' },
  { name: 'Groceries', group: 'needs' },
  { name: 'Utilities', group: 'needs' },
  { name: 'Transport', group: 'needs' },
  { name: 'Health', group: 'needs' },
  { name: 'Insurance', group: 'needs' },
  { name: 'Education', group: 'needs' },

  { name: 'Food & Dining', group: 'wants' },
  { name: 'Shopping', group: 'wants' },
  { name: 'Entertainment', group: 'wants' },
  { name: 'Subscriptions', group: 'wants' },
  { name: 'Travel', group: 'wants' },
  { name: 'Cash Withdrawal', group: 'wants' },
  { name: 'Other', group: 'wants' },

  { name: 'Investments', group: 'savings' },
];

export const INCOME_CATEGORIES = DEFAULT_CATEGORIES.filter((c) => c.group === 'income').map((c) => c.name);
export const EXPENSE_CATEGORIES = DEFAULT_CATEGORIES.filter((c) => c.group !== 'income').map((c) => c.name);

export function groupOf(category: string) {
  return DEFAULT_CATEGORIES.find((c) => c.name === category)?.group ?? 'wants';
}

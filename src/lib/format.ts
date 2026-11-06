import { currencySymbol, formatMoney as fmtMoney, minorUnits, moneyContext } from './region';

/**
 * An amount in the person's currency. Whole units for anything that is a whole number or is 1,000 or more; below 1,000 a fraction is kept (to the
 * currency's own decimals), so a $4.50 coffee does not become $5. Grouping follows the country: ₹1,25,430, $125,430, 125.430 €.
 */
export function money(n: number): string {
  if (!Number.isFinite(n)) return '-';
  const digits = Number.isInteger(n) || Math.abs(n) >= 1000 ? 0 : minorUnits();
  return fmtMoney(n, digits);
}

/** Always the currency's own decimals when there is a fraction (4.5 becomes 4.50), for amounts a person typed or read from a statement. */
export function moneyExact(n: number): string {
  if (!Number.isFinite(n)) return '-';
  return fmtMoney(n, Number.isInteger(n) ? 0 : minorUnits());
}

/** Short form for charts and tight spaces: ₹1.20 L and ₹1.5 Cr in India, $1.2M and €1,5 Mio. elsewhere. */
export function moneyCompact(n: number): string {
  if (!Number.isFinite(n)) return '-';
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const { country } = moneyContext();
  if (country === 'IN') {
    if (a >= 1e7) return `${sign}${currencySymbol()}${(a / 1e7).toFixed(2)} Cr`;
    if (a >= 1e5) return `${sign}${currencySymbol()}${(a / 1e5).toFixed(2)} L`;
    return money(n);
  }
  if (a < 10_000) return money(n);
  return fmtMoney(n, 1, 'compact');
}

/** The symbol or code to show in a field label, for example "Amount ($)". */
export const cur = (): string => currencySymbol();

export const pct = (n: number, digits = 1): string => (Number.isFinite(n) ? `${n.toFixed(digits)}%` : '-');

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (m: string, withYear = true): string => {
  const [y, mo] = m.split('-').map(Number);
  return withYear ? `${MONTH_NAMES[mo - 1]} ${y}` : MONTH_NAMES[mo - 1];
};

export const todayISO = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const uid = (): string => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

export const monthsText = (m: number): string => {
  if (!Number.isFinite(m)) return 'never at this pace';
  if (m < 12) return `${m} month${m === 1 ? '' : 's'}`;
  const y = Math.floor(m / 12);
  const r = m % 12;
  return `${y} yr${y > 1 ? 's' : ''}${r ? ` ${r} mo` : ''}`;
};

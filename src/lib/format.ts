export const inr = (n: number): string => {
  if (!Number.isFinite(n)) return '-';
  const sign = n < 0 ? '-' : '';
  return `${sign}₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`;
};

/** Rs 12.5 L, Rs 1.2 Cr style used across Indian money apps. */
export const inrCompact = (n: number): string => {
  if (!Number.isFinite(n)) return '-';
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(2)} L`;
  return inr(n);
};

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

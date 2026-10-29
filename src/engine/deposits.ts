/** Indian banks compound FD/RD interest quarterly. */
const COMPOUNDS_PER_YEAR = 4;

export function fdMaturity(principal: number, annualPct: number, months: number): number {
  return principal * Math.pow(1 + annualPct / 100 / COMPOUNDS_PER_YEAR, (COMPOUNDS_PER_YEAR * months) / 12);
}

/**
 * RD maturity. Each monthly instalment is deposited at the start of its month and earns
 * quarterly-compounded interest until maturity. Bank calculators differ from this by a few
 * rupees because they round to whole quarters.
 */
export function rdMaturity(monthly: number, annualPct: number, months: number): number {
  let total = 0;
  for (let k = 0; k < months; k++) {
    total += monthly * Math.pow(1 + annualPct / 100 / COMPOUNDS_PER_YEAR, (COMPOUNDS_PER_YEAR * (months - k)) / 12);
  }
  return total;
}

/** Annualised yield of a quarterly-compounded nominal rate. */
export function effectiveYield(annualPct: number): number {
  return (Math.pow(1 + annualPct / 100 / COMPOUNDS_PER_YEAR, COMPOUNDS_PER_YEAR) - 1) * 100;
}

/** After-tax rate for interest taxed at slab. `marginal` is a fraction, cess included. */
export function afterTaxRate(pretaxPct: number, marginal: number): number {
  return pretaxPct * (1 - marginal);
}

export function monthsBetween(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00Z');
  const b = new Date(to + 'T00:00:00Z');
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) - (b.getUTCDate() < a.getUTCDate() ? 1 : 0);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((new Date(to + 'T00:00:00Z').getTime() - new Date(from + 'T00:00:00Z').getTime()) / 86_400_000);
}

export function addMonthsToDate(date: string, months: number): string {
  const d = new Date(date + 'T00:00:00Z');
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

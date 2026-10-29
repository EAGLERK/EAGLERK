/**
 * Every number the planner assumes lives here, with where it came from.
 *
 *  verified - taken from an official notification as reported by multiple outlets
 *  check    - varies by bank/lender; value is a typical figure, confirm with yours
 *  estimate - a modelling assumption, not a promise or a forecast
 */
export type AssumptionStatus = 'verified' | 'check' | 'estimate';

export interface Assumption {
  key: string;
  label: string;
  value: number;
  status: AssumptionStatus;
  asOf: string;
  source: string;
  group: 'Government & policy' | 'Bank products' | 'Market-linked (modelled)' | 'Price growth' | 'Loans';
}

const SMALL_SAVINGS =
  'Dept. of Economic Affairs notification, 30 Sep 2026 (Oct-Dec 2026 quarter), via Business Today / Angel One / Free Press Journal';

export const DEFAULT_ASSUMPTIONS: Assumption[] = [
  { key: 'repo', label: 'RBI repo rate', value: 5.5, status: 'verified', asOf: '2026-10-07', source: 'RBI MPC, 7 Oct 2026 (+25 bps, stance: calibrated tightening)', group: 'Government & policy' },
  { key: 'cpi', label: 'CPI inflation (latest)', value: 4.82, status: 'verified', asOf: '2026-08', source: 'MoSPI, August 2026 print (new 2024-base series)', group: 'Government & policy' },
  { key: 'inflation', label: 'Planning inflation (long run)', value: 5.0, status: 'estimate', asOf: '2026-10', source: 'RBI projects FY27 CPI at 5.2%; 5% used for long-run planning', group: 'Government & policy' },
  { key: 'ppf', label: 'PPF', value: 7.1, status: 'verified', asOf: '2026-10-01', source: SMALL_SAVINGS, group: 'Government & policy' },
  { key: 'nsc', label: 'NSC (5 yr)', value: 7.7, status: 'verified', asOf: '2026-10-01', source: SMALL_SAVINGS, group: 'Government & policy' },
  { key: 'scss', label: 'SCSS (age 60+)', value: 8.2, status: 'verified', asOf: '2026-10-01', source: SMALL_SAVINGS, group: 'Government & policy' },

  { key: 'savings', label: 'Savings account', value: 3.0, status: 'check', asOf: '2026-10', source: 'Typical large-bank rate; varies 2.5-4%', group: 'Bank products' },
  { key: 'fd', label: 'Bank FD (1-3 yr)', value: 6.75, status: 'check', asOf: '2026-10', source: 'Aggregator sites disagree (6.55-6.80% for SBI 1 yr). Enter your bank\'s rate.', group: 'Bank products' },
  { key: 'rd', label: 'Bank RD (1-3 yr)', value: 6.5, status: 'check', asOf: '2026-10', source: 'Usually 0.1-0.3% under the FD rate. Enter your bank\'s rate.', group: 'Bank products' },
  { key: 'sfbFd', label: 'Small finance bank FD', value: 8.0, status: 'check', asOf: '2026-10', source: 'Typical SFB headline rate; DICGC insures only Rs 5 lakh per depositor per bank', group: 'Bank products' },

  { key: 'liquid', label: 'Liquid fund', value: 5.9, status: 'estimate', asOf: '2026-10', source: 'Repo rate + ~0.4%', group: 'Market-linked (modelled)' },
  { key: 'shortDebt', label: 'Short-duration debt fund', value: 7.0, status: 'estimate', asOf: '2026-10', source: 'Modelled; not guaranteed, NAV can fall', group: 'Market-linked (modelled)' },
  { key: 'arbitrage', label: 'Arbitrage fund', value: 6.2, status: 'estimate', asOf: '2026-10', source: 'Repo rate + ~0.7%; taxed as equity', group: 'Market-linked (modelled)' },
  { key: 'hybrid', label: 'Balanced advantage / hybrid', value: 9.0, status: 'estimate', asOf: '2026-10', source: 'Modelled long-run blend', group: 'Market-linked (modelled)' },
  { key: 'index', label: 'Nifty 50 index fund', value: 11.0, status: 'estimate', asOf: '2026-10', source: 'Conservative long-run assumption; any single decade can differ a lot', group: 'Market-linked (modelled)' },
  { key: 'midcap', label: 'Midcap / flexi-cap fund', value: 12.0, status: 'estimate', asOf: '2026-10', source: 'Modelled; higher return assumed for higher volatility', group: 'Market-linked (modelled)' },
  { key: 'gold', label: 'Gold (ETF)', value: 8.0, status: 'estimate', asOf: '2026-10', source: 'Modelled long-run', group: 'Market-linked (modelled)' },
  { key: 'nps', label: 'NPS (equity-tilted)', value: 9.5, status: 'estimate', asOf: '2026-10', source: 'Modelled; depends on your asset-class choice', group: 'Market-linked (modelled)' },

  { key: 'houseGrowth', label: 'House price growth', value: 6.0, status: 'estimate', asOf: '2026-10', source: 'Varies a lot by city and locality', group: 'Price growth' },
  { key: 'carGrowth', label: 'Car price growth', value: 4.0, status: 'estimate', asOf: '2026-10', source: 'Modelled', group: 'Price growth' },
  { key: 'bikeGrowth', label: 'Bike price growth', value: 4.0, status: 'estimate', asOf: '2026-10', source: 'Modelled', group: 'Price growth' },

  { key: 'homeLoan', label: 'Home loan rate', value: 8.75, status: 'check', asOf: '2026-10', source: 'Typical repo-linked range 8-9.5%; depends on score and lender', group: 'Loans' },
  { key: 'carLoan', label: 'Car loan rate', value: 9.25, status: 'check', asOf: '2026-10', source: 'Typical 8.5-11%', group: 'Loans' },
  { key: 'bikeLoan', label: 'Bike loan rate', value: 11.0, status: 'check', asOf: '2026-10', source: 'Typical 10-15%', group: 'Loans' },
];

export function ratesFromAssumptions(list: Assumption[]): Record<string, number> {
  return Object.fromEntries(list.map((a) => [a.key, a.value]));
}

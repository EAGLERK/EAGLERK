export type ISODate = string; // YYYY-MM-DD

export type CategoryGroup = 'income' | 'needs' | 'wants' | 'savings';

export interface Category {
  name: string;
  group: CategoryGroup;
}

export interface Txn {
  id: string;
  date: ISODate;
  description: string;
  /** Always positive. Direction comes from `type`. */
  amount: number;
  type: 'income' | 'expense';
  category: string;
  source: 'manual' | 'csv' | 'demo';
}

export type RiskProfile = 'conservative' | 'moderate' | 'aggressive';

export interface Profile {
  name: string;
  age: number;
  /** Fallbacks used until there is at least one month of transactions. */
  monthlyIncome: number;
  monthlyExpenses: number;
  /** Annual gross salary-equivalent income, used only to find the tax slab. */
  annualGrossIncome: number;
  salaried: boolean;
  risk: RiskProfile;
  emergencyMonths: number;
  hasTermInsurance: boolean;
  hasHealthInsurance: boolean;
}

export type GoalKind = 'car' | 'house' | 'bike' | 'other';

export interface Goal {
  id: string;
  kind: GoalKind;
  name: string;
  /** Price in today's money. */
  price: number;
  /** YYYY-MM the purchase should happen. */
  targetMonth: string;
  downPaymentPct: number;
  loanRate: number;
  loanYears: number;
  /** Registration, road tax, insurance, stamp duty... as % of price. */
  extraCostPct: number;
  /** Money already set aside for this goal. */
  saved: number;
}

export type InvestmentKind =
  | 'savings'
  | 'fd'
  | 'rd'
  | 'ppf'
  | 'nps'
  | 'epf'
  | 'mutual_fund'
  | 'stocks'
  | 'gold'
  | 'other';

export type AssetClass = 'cash' | 'debt' | 'equity' | 'gold' | 'other';

export interface Investment {
  id: string;
  kind: InvestmentKind;
  name: string;
  institution: string;
  startDate: ISODate;
  /** FD: lump sum. RD: monthly instalment. Others: total amount invested so far. */
  amount: number;
  /** Annual rate in %. Required for FD/RD/PPF, optional elsewhere. */
  rate: number;
  tenureMonths: number;
  /** Manual current value. When empty, FD/RD value is computed from the schedule. */
  currentValue?: number;
  /** For mutual funds: equity share of the fund, 0-100. Debt funds 0, index funds 100. */
  equityPct?: number;
  /** Counts toward the emergency fund. */
  emergency?: boolean;
}

export interface Liability {
  id: string;
  name: string;
  outstanding: number;
  rate: number;
  emi: number;
}

export interface Rates {
  [key: string]: number;
}

import { createContext, useContext, useEffect, useMemo, useReducer, type Dispatch, type ReactNode } from 'react';
import { DEFAULT_ASSUMPTIONS, ratesFromAssumptions, type Assumption } from './engine/assumptions';
import { averages, monthsWithData, addMonths } from './engine/cashflow';
import { buildPortfolio, type Portfolio } from './engine/portfolio';
import { marginalRate } from './engine/tax';
import type { Goal, Investment, Liability, Profile, Rates, Txn } from './engine/types';
import { demoData } from './demo';
import { todayISO } from './lib/format';

export interface AppState {
  version: 1;
  profile: Profile;
  txns: Txn[];
  goals: Goal[];
  investments: Investment[];
  liabilities: Liability[];
  /** User overrides keyed by assumption key. */
  overrides: Record<string, number>;
  onboarded: boolean;
}

export const EMPTY_PROFILE: Profile = {
  name: '',
  age: 30,
  monthlyIncome: 100_000,
  monthlyExpenses: 60_000,
  annualGrossIncome: 1_200_000,
  salaried: true,
  risk: 'moderate',
  emergencyMonths: 6,
  hasTermInsurance: false,
  hasHealthInsurance: false,
};

const initial: AppState = { version: 1, profile: EMPTY_PROFILE, txns: [], goals: [], investments: [], liabilities: [], overrides: {}, onboarded: false };

export type Action =
  | { type: 'profile'; patch: Partial<Profile> }
  | { type: 'addTxns'; txns: Txn[] }
  | { type: 'updateTxn'; id: string; patch: Partial<Txn> }
  | { type: 'deleteTxn'; id: string }
  | { type: 'clearTxns'; source?: Txn['source'] }
  | { type: 'upsertGoal'; goal: Goal }
  | { type: 'deleteGoal'; id: string }
  | { type: 'upsertInvestment'; inv: Investment }
  | { type: 'deleteInvestment'; id: string }
  | { type: 'upsertLiability'; liability: Liability }
  | { type: 'deleteLiability'; id: string }
  | { type: 'override'; key: string; value: number | null }
  | { type: 'loadDemo' }
  | { type: 'startFresh' }
  | { type: 'replace'; state: AppState };

const upsert = <T extends { id: string }>(list: T[], item: T) => (list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]);

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'profile': return { ...s, profile: { ...s.profile, ...a.patch } };
    case 'addTxns': {
      const have = new Set(s.txns.map((t) => t.id));
      return { ...s, txns: [...s.txns, ...a.txns.filter((t) => !have.has(t.id))] };
    }
    case 'updateTxn': return { ...s, txns: s.txns.map((t) => (t.id === a.id ? { ...t, ...a.patch } : t)) };
    case 'deleteTxn': return { ...s, txns: s.txns.filter((t) => t.id !== a.id) };
    case 'clearTxns': return { ...s, txns: a.source ? s.txns.filter((t) => t.source !== a.source) : [] };
    case 'upsertGoal': return { ...s, goals: upsert(s.goals, a.goal) };
    case 'deleteGoal': return { ...s, goals: s.goals.filter((g) => g.id !== a.id) };
    case 'upsertInvestment': return { ...s, investments: upsert(s.investments, a.inv) };
    case 'deleteInvestment': return { ...s, investments: s.investments.filter((i) => i.id !== a.id) };
    case 'upsertLiability': return { ...s, liabilities: upsert(s.liabilities, a.liability) };
    case 'deleteLiability': return { ...s, liabilities: s.liabilities.filter((l) => l.id !== a.id) };
    case 'override': {
      const o = { ...s.overrides };
      if (a.value === null || Number.isNaN(a.value)) delete o[a.key];
      else o[a.key] = a.value;
      return { ...s, overrides: o };
    }
    case 'loadDemo': return { ...s, ...demoData(), onboarded: true };
    case 'startFresh': return { ...initial, onboarded: true };
    case 'replace': return a.state;
  }
}

const KEY = 'mymoney:v1';
/** The app was first called Eaglerk. Keep reading that key so existing data is not lost on upgrade. */
const LEGACY_KEY = 'eaglerk:v1';

/** Fills in anything missing so data saved by an older version (or by the cloud) still loads. */
export function normalizeState(raw: unknown): AppState | null {
  const p = raw as Partial<AppState> | null;
  if (!p || typeof p !== 'object' || p.version !== 1 || !Array.isArray(p.txns)) return null;
  return { ...initial, ...p, profile: { ...EMPTY_PROFILE, ...(p.profile ?? {}) } } as AppState;
}

/** Data this browser saved before accounts existed (or in local-only mode). */
export function readLocalState(): AppState | null {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : null;
  } catch {
    return null; // corrupt or blocked storage
  }
}

export function clearLocalState(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* storage blocked */
  }
}

export const hasUserData = (s: AppState): boolean => s.txns.length + s.goals.length + s.investments.length + s.liabilities.length > 0;

const load = (): AppState => readLocalState() ?? initial;

export interface Derived {
  today: string;
  assumptions: Assumption[];
  rates: Rates;
  marginal: number;
  portfolio: Portfolio;
  /** Monthly figures used for planning: real averages if there is data, profile fallbacks otherwise. */
  plan: { income: number; spend: number; invested: number; fromTransactions: boolean; months: number; existingEmi: number };
  latestMonth: string;
}

const Ctx = createContext<{ state: AppState; dispatch: Dispatch<Action>; d: Derived } | null>(null);

export interface StoreProviderProps {
  children: ReactNode;
  /** Start from this state (the signed-in user's cloud data). Omit to read this browser's saved data. */
  initial?: AppState;
  /**
   * 'local' saves to this browser. A function receives every new state instead (cloud sync), and nothing is
   * written to the browser, so a shared computer keeps no copy after sign-out.
   */
  persistence?: 'local' | ((state: AppState) => void);
}

export function StoreProvider({ children, initial: start, persistence = 'local' }: StoreProviderProps) {
  const [state, dispatch] = useReducer(reducer, undefined, () => start ?? load());

  useEffect(() => {
    if (typeof persistence === 'function') {
      persistence(state);
      return;
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked: keep working in memory */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const d = useMemo<Derived>(() => {
    const today = todayISO();
    const assumptions = DEFAULT_ASSUMPTIONS.map((a) => (a.key in state.overrides ? { ...a, value: state.overrides[a.key] } : a));
    const rates = ratesFromAssumptions(assumptions);
    const marginal = marginalRate(state.profile.annualGrossIncome, state.profile.salaried);
    const portfolio = buildPortfolio(state.investments, state.liabilities, today, rates, marginal);

    const months = monthsWithData(state.txns);
    const thisMonth = today.slice(0, 7);
    const complete = months.filter((m) => m < thisMonth);
    const latestMonth = months[months.length - 1] ?? thisMonth;
    const end = complete[complete.length - 1] ?? latestMonth;
    const avg = averages(state.txns, end, 3);
    const fromTransactions = avg.months > 0 && avg.income > 0;
    const existingEmi = state.liabilities.reduce((a, l) => a + l.emi, 0);
    return {
      today, assumptions, rates, marginal, portfolio, latestMonth,
      plan: {
        income: fromTransactions ? avg.income : state.profile.monthlyIncome,
        spend: avg.months > 0 ? avg.spend : state.profile.monthlyExpenses,
        invested: avg.invested,
        fromTransactions, months: avg.months, existingEmi,
      },
    };
  }, [state]);

  return <Ctx.Provider value={{ state, dispatch, d }}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('StoreProvider missing');
  return v;
}

export { addMonths };

import { supabase } from '../auth/supabase';
import { features } from '../features';
import type { Cmd } from './parse';

/**
 * The optional AI layer. Mitra first tries its own rules, which are instant and run on this device. Only when the rules do not
 * recognise a sentence, and only if the person has this switched on, the sentence goes to an AI model that turns it into one of the
 * same commands. The model never touches data: its answer is checked by `validateCmd`, then goes through the same planner as a typed
 * command, so deleting and changing settings still ask first.
 *
 * The model is called from a Supabase Edge Function (supabase/functions/assistant), which keeps the API key on the server.
 * What is sent: the sentence, today's date, the titles of your notes and the names of the planner settings. No transactions, no amounts from your data.
 */

export const aiAvailable = (): boolean => features.voiceAI && supabase !== null;

export interface AiContext { today: string; notes: string[]; assumptions: string[] }
export type AiResult = { cmd: Cmd } | { reply: string } | { error: 'offline' | 'signin' | 'failed' };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown, max: number, allowEmpty = false): string | null => (typeof x === 'string' && x.trim().length <= max && (allowEmpty || x.trim().length > 0) ? x.trim() : null);
const num = (x: unknown, lo: number, hi: number): number | null => (typeof x === 'number' && Number.isFinite(x) && x > lo && x <= hi ? x : null);
const oneOf = <T extends string>(x: unknown, opts: readonly T[]): T | null => (typeof x === 'string' && (opts as readonly string[]).includes(x) ? (x as T) : null);
const isoDate = (x: unknown, today: string): string | null => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x)) && x <= today && x >= '2000-01-01' ? x : null);

const TABS = ['dashboard', 'transactions', 'goals', 'notes', 'settings', 'investments', 'plan'] as const;
const FIELDS = ['amount', 'category', 'date', 'description'] as const;
const PROFILE = ['name', 'age', 'monthlyIncome', 'monthlyExpenses', 'annualGrossIncome'] as const;

/** Accepts only a well-formed command from the model. Anything else is null. Never throws. */
export function validateCmd(x: unknown, today: string): Cmd | null {
  if (!isObj(x)) return null;
  const t = x.t;
  switch (t) {
    case 'undo': case 'help': case 'saveDrafts': case 'discardDrafts': return { t };
    case 'navigate': { const tab = oneOf(x.tab, TABS); return tab ? { t, tab } : null; }
    case 'theme': { const theme = oneOf(x.theme, ['auto', 'light', 'dark'] as const); return theme ? { t, theme } : null; }
    case 'summary': { const what = oneOf(x.what, ['spend', 'income', 'saved'] as const); return what ? { t, what, period: x.period === 'last' ? 'last' : 'this' } : null; }
    case 'addTxn': {
      const type = oneOf(x.type, ['income', 'expense'] as const);
      const amount = x.amount === null || x.amount === undefined ? null : num(x.amount, 0, 1_000_000_000);
      const description = str(x.description ?? '', 80, true);
      const date = x.date === null || x.date === undefined ? null : isoDate(x.date, today);
      if (!type || description === null || (x.amount != null && amount === null) || (x.date != null && date === null)) return null;
      return { t, type, amount, description, date };
    }
    case 'txnEdit': {
      const target = str(x.target, 60); const field = oneOf(x.field, FIELDS);
      if (!target || !field) return null;
      if (field === 'amount') { const amount = num(x.amount, 0, 1_000_000_000); return amount === null ? null : { t, target, field, value: String(amount), amount }; }
      if (field === 'date') { const date = isoDate(x.date, today); return date === null ? null : { t, target, field, value: date, date }; }
      const value = str(x.value, 80); return value ? { t, target, field, value } : null;
    }
    case 'txnDelete': { const target = str(x.target, 60); return target ? { t, target } : null; }
    case 'noteAddItems': {
      const list = str(x.list, 60);
      const items = Array.isArray(x.items) ? x.items.map((i) => str(i, 60)) : [];
      if (!list || !items.length || items.length > 20 || items.some((i) => i === null)) return null;
      return { t, list, items: items as string[] };
    }
    case 'noteCreate': { const title = str(x.title ?? '', 60, true); const kind = oneOf(x.kind, ['buy', 'sell', 'todo', 'text'] as const); return title !== null && kind ? { t, title, kind } : null; }
    case 'noteQuick': { const text = str(x.text, 200); const as = oneOf(x.as, ['todo', 'text'] as const); return text && as ? { t, text, as } : null; }
    case 'noteTick': { const text = str(x.text, 60); return text && typeof x.done === 'boolean' ? { t, text, done: x.done } : null; }
    case 'noteRemoveItem': { const text = str(x.text, 60); const list = str(x.list, 60); return text && list ? { t, text, list } : null; }
    case 'noteOpen': case 'noteDelete': { const name = str(x.name, 60); return name ? { t, name } : null; }
    case 'setProfile': {
      const field = oneOf(x.field, PROFILE);
      if (!field) return null;
      if (field === 'name') { const v = str(x.value, 40); return v ? { t, field, value: v } : null; }
      const v = num(x.value, 0, 1_000_000_000); return v === null ? null : { t, field, value: v };
    }
    case 'setAssumption': { const label = str(x.label, 60); const value = typeof x.value === 'number' && x.value >= 0 && x.value <= 100 ? x.value : null; return label && value !== null ? { t, label, value } : null; }
    case 'goalPrice': { const goal = str(x.goal, 40); const price = num(x.price, 0, 1_000_000_000_000); return goal && price !== null ? { t, goal, price } : null; }
    case 'goalMonth': { const goal = str(x.goal, 40); const month = typeof x.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(x.month) ? x.month : null; return goal && month ? { t, goal, month } : null; }
    case 'goalAdd': { const kind = oneOf(x.kind, ['car', 'house', 'bike'] as const); return kind ? { t, kind } : null; }
    case 'goalDelete': { const goal = str(x.goal, 40); return goal ? { t, goal } : null; }
    default: return null;
  }
}

/** Reads the edge function's answer: `{ command }`, `{ reply }` or an error. */
export function readAiAnswer(data: unknown, today: string): AiResult {
  if (!isObj(data)) return { error: 'failed' };
  if (data.command !== undefined) { const cmd = validateCmd(data.command, today); return cmd ? { cmd } : { error: 'failed' }; }
  const reply = str(data.reply, 240);
  return reply ? { reply } : { error: 'failed' };
}

/** Asks the model. Resolves to an error value instead of throwing, and gives up after 12 seconds. */
export async function askAI(text: string, ctx: AiContext): Promise<AiResult> {
  if (!supabase) return { error: 'offline' };
  try {
    const call = supabase.functions.invoke('assistant', { body: { text: text.slice(0, 300), today: ctx.today, notes: ctx.notes.slice(0, 30), assumptions: ctx.assumptions.slice(0, 40) } });
    const timeout = new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), 12_000));
    const res = await Promise.race([call, timeout]);
    if (res === 'timeout') return { error: 'offline' };
    if (res.error) {
      const status = (res.error as { context?: { status?: number } }).context?.status;
      return { error: status === 401 || status === 403 ? 'signin' : 'failed' };
    }
    return readAiAnswer(res.data, ctx.today);
  } catch {
    return { error: 'offline' };
  }
}

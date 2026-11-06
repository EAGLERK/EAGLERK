import { addMonths, summarize } from '../engine/cashflow';
import { categorize } from '../engine/categorize';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../engine/categories';
import { newGoal } from '../engine/goals';
import { newItem, newTodo, newText } from '../engine/notes';
import type { Rates, Note, NoteBlock, Txn, Goal } from '../engine/types';
import { cur, money, moneyExact, monthLabel } from '../lib/format';
import type { Action, AppState } from '../store';
import { clean, goalWord, type Cmd, type Tab } from './parse';

/**
 * Turns a parsed command into a plan: what to say, and which changes to make.
 * Nothing in here touches React or the browser, so every rule can be tested with plain objects.
 * Anything that deletes something or changes a setting is wrapped in `ask`, so it only happens after a yes.
 */

export type Effect =
  | { k: 'nav'; tab: Tab }
  | { k: 'theme'; theme: 'auto' | 'light' | 'dark' }
  | { k: 'stage'; txn: Txn }
  | { k: 'editTxn'; id: string; patch: Partial<Txn> }
  | { k: 'dropStaged'; id: string }
  | { k: 'deleteTxn'; txn: Txn }
  | { k: 'dispatch'; action: Action }
  | { k: 'save' }
  | { k: 'discard' }
  | { k: 'openNote'; id: string };

export interface Plan {
  say: string;
  effects?: Effect[];
  /** Waits for a spoken or typed answer before going on. */
  ask?: { kind: 'confirm'; then: Plan } | { kind: 'amount'; cmd: Extract<Cmd, { t: 'addTxn' }> };
  special?: 'undo' | 'help';
}

export interface PlanCtx {
  state: AppState;
  today: string;
  rates: Rates;
  assumptions: Array<{ key: string; label: string; value: number }>;
  /** New, unsaved transactions (newest first) and unsaved changes to saved ones. */
  staged: Txn[];
  edits: Record<string, Partial<Txn>>;
  tabs: Tab[];
  newId: () => string;
  now: string;
}

const TAB_NAME: Record<Tab, string> = { dashboard: 'the Dashboard', transactions: 'Transactions', goals: 'Goals', notes: 'Notes', settings: 'Settings', investments: 'Investments', plan: 'the Plan' };

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const say = (text: string, effects?: Effect[]): Plan => ({ say: text, effects });
const confirm = (question: string, then: Plan): Plan => ({ say: question, ask: { kind: 'confirm', then } });

function dayText(date: string, today: string): string {
  if (date === today) return 'today';
  const y = addDays(today, -1);
  if (date === y) return 'yesterday';
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: date.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric' });
}
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const STOP = new Set(['the', 'a', 'an', 'my', 'of', 'rate', 'rates', 'for', 'to']);
const keyWords = (s: string) => clean(s).split(' ').filter((w) => w && !STOP.has(w));

/* ---------- Finding things by what the person said ---------- */

interface Found { txn: Txn; staged: boolean }

function findTxn(target: string, c: PlanCtx): Found | null {
  const staged: Found[] = c.staged.map((txn) => ({ txn, staged: true }));
  const saved: Found[] = c.state.txns.map((txn) => ({ txn: { ...txn, ...(c.edits[txn.id] ?? {}) }, staged: false }));
  if (target === 'last') return staged[0] ?? saved[saved.length - 1] ?? null;
  const words = keyWords(target);
  if (!words.length) return null;
  const hits = [...staged, ...saved].filter(({ txn }) => {
    const hay = `${txn.description} ${txn.category}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  if (!hits.length) return null;
  // Newest date wins; unsaved rows beat saved ones on the same date.
  return hits.sort((a, b) => b.txn.date.localeCompare(a.txn.date) || Number(b.staged) - Number(a.staged))[0];
}

const describeTxn = (t: Txn, today: string) => `${moneyExact(t.amount)} ${t.description || t.category} on ${dayText(t.date, today)}`;

function findNote(name: string, notes: Note[]): Note | null {
  const n = clean(name);
  if (!n) return null;
  const match = (re: RegExp) => notes.find((x) => re.test(x.title.toLowerCase()));
  if (/^(shopping|grocery|groceries|buy|buying|to buy|purchase|purchases|things to buy|wish list|wishlist)$/.test(n)) return match(/shopping|grocer|buy|purchase|wish/) ?? null;
  if (/^(sell|selling|to sell|things to sell)$/.test(n)) return match(/sell/) ?? null;
  const words = keyWords(n);
  const exact = notes.find((x) => clean(x.title) === n);
  if (exact) return exact;
  if (!words.length) return null;
  return notes.find((x) => { const t = clean(x.title); return words.every((w) => t.includes(w)); }) ?? null;
}

const titleFor = (name: string) => {
  const n = clean(name);
  if (/^(shopping|grocery|groceries)$/.test(n)) return cap(n === 'shopping' ? 'shopping list' : `${n} list`);
  if (/^(buy|buying|to buy|purchase|purchases)$/.test(n)) return 'Things to buy';
  if (/^(sell|selling|to sell)$/.test(n)) return 'Things to sell';
  return cap(n);
};

/** Adds items to the note's first to-do list (filling an empty line first), or as rows if the note is only a table. */
function withItems(note: Note, items: string[], c: PlanCtx): Note {
  const id = c.newId;
  const texts = items.map(cap);
  let blocks: NoteBlock[] = note.blocks;
  const todoAt = blocks.findIndex((b) => b.type === 'todo');
  if (todoAt < 0 && blocks.some((b) => b.type === 'table')) {
    const tAt = blocks.findIndex((b) => b.type === 'table');
    blocks = blocks.map((b, i) => {
      if (i !== tAt || b.type !== 'table') return b;
      const rows = b.rows.filter((r) => r.some((x) => x.trim()));
      return { ...b, rows: [...rows, ...texts.map((t) => b.columns.map((_, ci) => (ci === 0 ? t : '')))] };
    });
  } else if (todoAt < 0) {
    blocks = [...blocks.filter((b) => !(b.type === 'text' && !b.text.trim())), { id: id(), type: 'todo', title: '', items: texts.map((t) => newItem(id, t)) }];
  } else {
    blocks = blocks.map((b, i) => {
      if (i !== todoAt || b.type !== 'todo') return b;
      const kept = b.items.filter((x) => x.text.trim());
      return { ...b, items: [...kept, ...texts.map((t) => newItem(id, t))] };
    });
  }
  return { ...note, blocks, updatedAt: c.now };
}

const upsertNote = (note: Note): Effect => ({ k: 'dispatch', action: { type: 'upsertNote', note } });
const listOf = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/* ---------- Settings that can be changed by voice ---------- */

function bestCategory(word: string, type: 'income' | 'expense'): string | null {
  const w = clean(word);
  const pool = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return pool.find((x) => x.toLowerCase() === w) ?? pool.find((x) => x.toLowerCase().includes(w) || (w.length > 3 && w.includes(x.toLowerCase()))) ?? null;
}

export function plan(cmd: Cmd, c: PlanCtx): Plan {
  const { state } = c;
  const notes = state.notes ?? [];
  switch (cmd.t) {
    case 'navigate':
      if (!c.tabs.includes(cmd.tab)) return say(`${cap(TAB_NAME[cmd.tab])} is not available in this version.`);
      return say(`Opening ${TAB_NAME[cmd.tab]}.`, [{ k: 'nav', tab: cmd.tab }]);

    case 'theme':
      return say(cmd.theme === 'auto' ? 'Colours will follow your device.' : `${cap(cmd.theme)} mode is on.`, [{ k: 'theme', theme: cmd.theme }]);

    case 'help':
      return { say: 'You can add expenses and income, keep notes and lists, open any screen, switch themes, and change your profile, goals and assumptions.', special: 'help' };
    case 'undo':
      return { say: '', special: 'undo' };
    case 'saveDrafts':
      return say(c.staged.length + Object.keys(c.edits).length ? 'Saving your changes.' : 'There is nothing to save.', c.staged.length + Object.keys(c.edits).length ? [{ k: 'save' }] : undefined);
    case 'discardDrafts': {
      const n = c.staged.length + Object.keys(c.edits).length;
      if (!n) return say('There is nothing to discard.');
      return confirm(`Discard ${n} unsaved ${n === 1 ? 'change' : 'changes'}?`, say('Discarded.', [{ k: 'discard' }]));
    }

    case 'summary': {
      const month = cmd.period === 'last' ? addMonths(c.today.slice(0, 7), -1) : c.today.slice(0, 7);
      const s = summarize(state.txns, month);
      const when = `${cmd.period === 'last' ? '' : 'so far in '}${monthLabel(month)}`;
      if (!s.txnCount) return say(`There are no saved transactions for ${monthLabel(month)}.`);
      if (cmd.what === 'spend') return say(`You spent ${money(s.spend)} ${when}.`);
      if (cmd.what === 'income') return say(`You earned ${money(s.income)} ${when}.`);
      return say(s.saved >= 0 ? `You saved ${money(s.saved)} ${when}.` : `You spent ${money(-s.saved)} more than you earned ${when}.`);
    }

    case 'addTxn': {
      if (cmd.amount === null) return { say: `How much was ${cmd.type === 'income' ? 'the income' : cmd.description ? `the ${cmd.description.toLowerCase()} expense` : 'it'}?`, ask: { kind: 'amount', cmd } };
      if (cmd.amount <= 0 || cmd.amount > 1_000_000_000) return say('That amount does not look right. Say it again.');
      const date = cmd.date ?? c.today;
      const category = categorize(cmd.description, cmd.type);
      const txn: Txn = { id: c.newId(), date, description: cmd.description || category, amount: cmd.amount, type: cmd.type, category, source: 'manual' };
      return say(`Added ${cmd.type === 'income' ? 'income' : 'expense'} of ${moneyExact(cmd.amount)}, ${txn.description}, ${dayText(date, c.today)}, under ${category}. Say save to keep it, or undo.`, [{ k: 'nav', tab: 'transactions' }, { k: 'stage', txn }]);
    }

    case 'txnEdit': {
      const f = findTxn(cmd.target, c);
      if (!f) return say(cmd.target === 'last' ? 'There are no transactions yet.' : `I could not find a transaction matching "${cmd.target}".`);
      let patch: Partial<Txn>;
      let what: string;
      if (cmd.field === 'amount') {
        if (!cmd.amount || cmd.amount <= 0) return say('That amount does not look right.');
        patch = { amount: cmd.amount }; what = `amount to ${moneyExact(cmd.amount)}`;
      } else if (cmd.field === 'date') {
        if (!cmd.date) return say('I did not catch the date.');
        patch = { date: cmd.date }; what = `date to ${dayText(cmd.date, c.today)}`;
      } else if (cmd.field === 'category') {
        const cat = bestCategory(cmd.value, f.txn.type);
        if (!cat) return say(`"${cmd.value}" is not one of the categories. Try ${(f.txn.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).slice(0, 4).join(', ')}.`);
        patch = { category: cat }; what = `category to ${cat}`;
      } else {
        patch = { description: cmd.value }; what = `description to ${cmd.value}`;
      }
      return say(`Changed the ${what} on ${describeTxn(f.txn, c.today)}. Say save to keep it, or undo.`, [{ k: 'nav', tab: 'transactions' }, { k: 'editTxn', id: f.txn.id, patch }]);
    }

    case 'txnDelete': {
      const f = findTxn(cmd.target, c);
      if (!f) return say(cmd.target === 'last' ? 'There are no transactions yet.' : `I could not find a transaction matching "${cmd.target}".`);
      if (f.staged) return say(`Removed the unsaved ${describeTxn(f.txn, c.today)}.`, [{ k: 'dropStaged', id: f.txn.id }]);
      return confirm(`Delete ${describeTxn(f.txn, c.today)}?`, say('Deleted. Say undo to bring it back.', [{ k: 'deleteTxn', txn: f.txn }]));
    }

    /* ----- notes ----- */
    case 'noteAddItems': {
      if (!cmd.items.length) return say('I did not catch what to add.');
      const found = findNote(cmd.list, notes);
      const what = listOf(cmd.items.map(cap));
      if (found) return say(`Added ${what} to ${found.title || 'your note'}.`, [upsertNote(withItems(found, cmd.items, c))]);
      const fresh: Note = { id: c.newId(), title: titleFor(cmd.list), updatedAt: c.now, blocks: [] };
      return say(`I made a new list called ${fresh.title} and added ${what}.`, [upsertNote(withItems(fresh, cmd.items, c))]);
    }
    case 'noteCreate': {
      const id = c.newId;
      const note: Note = cmd.kind === 'sell'
        ? { id: id(), title: cmd.title || 'Things to sell', updatedAt: c.now, blocks: [{ id: id(), type: 'table', title: '', columns: ['Item', `Asking price (${cur()})`, 'Status'], rows: [['', '', ''], ['', '', '']] }] }
        : cmd.kind === 'text'
          ? { id: id(), title: cmd.title, updatedAt: c.now, blocks: [newText(id)] }
          : { id: id(), title: cmd.title || (cmd.kind === 'buy' ? 'Things to buy' : 'To-do list'), updatedAt: c.now, blocks: [newTodo(id, '')] };
      return say(`Created ${note.title || 'a new note'}. Opening it.`, [upsertNote(note), { k: 'nav', tab: 'notes' }, { k: 'openNote', id: note.id }]);
    }
    case 'noteQuick': {
      const title = cmd.as === 'todo' ? 'Reminders' : 'Quick notes';
      const found = notes.find((n) => n.title === title);
      const text = cap(cmd.text);
      if (cmd.as === 'todo') {
        const base: Note = found ?? { id: c.newId(), title, updatedAt: c.now, blocks: [] };
        return say(`Added "${text}" to your reminders.`, [upsertNote(withItems(base, [cmd.text], c))]);
      }
      const base: Note = found ?? { id: c.newId(), title, updatedAt: c.now, blocks: [] };
      const at = base.blocks.findIndex((b) => b.type === 'text');
      const blocks: NoteBlock[] = at < 0
        ? [...base.blocks, { id: c.newId(), type: 'text', text }]
        : base.blocks.map((b, i) => (i === at && b.type === 'text' ? { ...b, text: b.text.trim() ? `${b.text.replace(/\s+$/, '')}\n${text}` : text } : b));
      return say(`Noted: ${text}.`, [upsertNote({ ...base, blocks, updatedAt: c.now })]);
    }
    case 'noteTick': {
      const w = keyWords(cmd.text);
      for (const n of notes) {
        for (const b of n.blocks) {
          if (b.type !== 'todo') continue;
          const item = b.items.find((x) => x.text.trim() && w.length && w.every((k) => x.text.toLowerCase().includes(k)) && x.done !== cmd.done);
          if (!item) continue;
          const next: Note = { ...n, updatedAt: c.now, blocks: n.blocks.map((x) => (x.id === b.id && x.type === 'todo' ? { ...x, items: x.items.map((i) => (i.id === item.id ? { ...i, done: cmd.done } : i)) } : x)) };
          return say(`${cmd.done ? 'Ticked off' : 'Unticked'} ${item.text} on ${n.title || 'your note'}.`, [upsertNote(next)]);
        }
      }
      return say(`I could not find "${cmd.text}" on any list.`);
    }
    case 'noteRemoveItem': {
      const n = findNote(cmd.list, notes);
      if (!n) return say(`I could not find a list called "${cmd.list}".`);
      const w = keyWords(cmd.text);
      for (const b of n.blocks) {
        if (b.type === 'todo') {
          const item = b.items.find((x) => x.text.trim() && w.length && w.every((k) => x.text.toLowerCase().includes(k)));
          if (item) return say(`Removed ${item.text} from ${n.title || 'your note'}.`, [upsertNote({ ...n, updatedAt: c.now, blocks: n.blocks.map((x) => (x.id === b.id && x.type === 'todo' ? { ...x, items: x.items.filter((i) => i.id !== item.id) } : x)) })]);
        }
        if (b.type === 'table') {
          const row = b.rows.find((r) => w.length && w.every((k) => (r[0] ?? '').toLowerCase().includes(k)));
          if (row) return say(`Removed ${row[0]} from ${n.title || 'your note'}.`, [upsertNote({ ...n, updatedAt: c.now, blocks: n.blocks.map((x) => (x.id === b.id && x.type === 'table' ? { ...x, rows: x.rows.filter((r) => r !== row) } : x)) })]);
        }
      }
      return say(`I could not find "${cmd.text}" on ${n.title || 'that note'}.`);
    }
    case 'noteOpen': {
      const n = findNote(cmd.name, notes);
      if (!n) return say(`I could not find a note called "${cmd.name}".`);
      return say(`Opening ${n.title || 'your note'}.`, [{ k: 'nav', tab: 'notes' }, { k: 'openNote', id: n.id }]);
    }
    case 'noteDelete': {
      const n = findNote(cmd.name, notes);
      if (!n) return say(`I could not find a note called "${cmd.name}".`);
      return confirm(`Delete the note ${n.title || 'Untitled note'}?`, say('Deleted. Say undo to bring it back.', [{ k: 'dispatch', action: { type: 'deleteNote', id: n.id } }]));
    }

    /* ----- profile, assumptions, goals ----- */
    case 'setProfile': {
      const p = state.profile;
      if (cmd.field === 'name') return confirm(`Change your name to ${cmd.value}?`, say(`Done. Hello, ${cmd.value}.`, [{ k: 'dispatch', action: { type: 'profile', patch: { name: String(cmd.value) } } }]));
      const n = Number(cmd.value);
      if (cmd.field === 'age') {
        if (!Number.isInteger(n) || n < 18 || n > 100) return say('Age should be a whole number between 18 and 100.');
        return confirm(`Change your age from ${p.age} to ${n}?`, say(`Your age is now ${n}.`, [{ k: 'dispatch', action: { type: 'profile', patch: { age: n } } }]));
      }
      if (!(n > 0) || n > 1_000_000_000) return say('That amount does not look right. Say it again.');
      const label = cmd.field === 'monthlyIncome' ? 'monthly take-home' : cmd.field === 'monthlyExpenses' ? 'monthly spending' : 'yearly gross income';
      return confirm(`Change your ${label} from ${money(p[cmd.field])} to ${money(n)}?`, say(`Your ${label} is now ${money(n)}.`, [{ k: 'dispatch', action: { type: 'profile', patch: { [cmd.field]: n } } }]));
    }
    case 'setAssumption': {
      const w = keyWords(cmd.label);
      const hits = w.length ? c.assumptions.filter((a) => { const hay = `${a.label} ${a.key}`.toLowerCase(); return w.every((k) => hay.includes(k)); }) : [];
      if (!hits.length) return say(`I could not find an assumption called "${cmd.label}". Open Settings to see them all.`);
      // A word that is exactly an assumption's key ("inflation", "repo") means that one, even when other labels contain the word.
      const exact = hits.length > 1 ? hits.filter((h) => h.key.toLowerCase() === w.join('')) : [];
      if (exact.length === 1) hits.splice(0, hits.length, exact[0]);
      if (hits.length > 1) return say(`That matches ${hits.slice(0, 3).map((h) => h.label).join(', ')}. Say the full name.`);
      const a = hits[0];
      if (cmd.value < 0 || cmd.value > 100) return say('A rate should be between 0 and 100 percent.');
      return confirm(`Change ${a.label} from ${a.value}% to ${cmd.value}%?`, say(`${a.label} is now ${cmd.value}%.`, [{ k: 'dispatch', action: { type: 'override', key: a.key, value: cmd.value } }]));
    }
    case 'goalAdd': {
      if (state.goals.some((g) => g.kind === cmd.kind)) return say(`You already have a ${cmd.kind} goal. Say change ${cmd.kind} price to set it.`);
      const goal = newGoal(cmd.kind, c.newId(), c.today, c.rates);
      return say(`Added a ${cmd.kind} goal at ${money(goal.price)}. Say its price to change it.`, [{ k: 'dispatch', action: { type: 'upsertGoal', goal } }, { k: 'nav', tab: 'goals' }]);
    }
    case 'goalPrice':
    case 'goalMonth':
    case 'goalDelete': {
      const kind = goalWord(cmd.goal);
      const g: Goal | undefined = kind ? state.goals.find((x) => x.kind === kind) : state.goals.find((x) => x.name.toLowerCase().includes(clean(cmd.goal)));
      if (!g) return say(kind ? `You do not have a ${kind} goal yet. Say add a ${kind} goal first.` : `I could not find a goal called "${cmd.goal}".`);
      if (cmd.t === 'goalDelete') return confirm(`Delete the ${g.name} goal?`, say('Deleted. Say undo to bring it back.', [{ k: 'dispatch', action: { type: 'deleteGoal', id: g.id } }]));
      if (cmd.t === 'goalPrice') {
        if (cmd.price <= 0) return say('That price does not look right.');
        return confirm(`Change the ${g.name} price from ${money(g.price)} to ${money(cmd.price)}?`, say(`The ${g.name} price is now ${money(cmd.price)}.`, [{ k: 'dispatch', action: { type: 'upsertGoal', goal: { ...g, price: cmd.price } } }, { k: 'nav', tab: 'goals' }]));
      }
      return confirm(`Move the ${g.name} target from ${monthLabel(g.targetMonth)} to ${monthLabel(cmd.month)}?`, say(`The ${g.name} target is now ${monthLabel(cmd.month)}.`, [{ k: 'dispatch', action: { type: 'upsertGoal', goal: { ...g, targetMonth: cmd.month } } }, { k: 'nav', tab: 'goals' }]));
    }

    case 'unknown':
      return say(cmd.heard ? `I did not understand "${cmd.heard}". Say help to hear what I can do.` : 'I did not hear anything. Try again.');
  }
}

/** The answer to "how much?" turns the waiting expense into a full one. */
export function withAmount(cmd: Extract<Cmd, { t: 'addTxn' }>, amount: number): Cmd {
  return { ...cmd, amount };
}

import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSUMPTIONS } from '../src/engine/assumptions';
import { newGoal } from '../src/engine/goals';
import type { Note, Txn } from '../src/engine/types';
import { EMPTY_PROFILE, type AppState } from '../src/store';
import { parseCommand } from '../src/voice/parse';
import { plan, type Effect, type PlanCtx } from '../src/voice/plan';

const TODAY = '2026-11-03';
let n = 0;
const newId = () => `id${++n}`;
const tx = (id: string, date: string, description: string, amount: number, type: 'income' | 'expense' = 'expense', category = 'Other'): Txn => ({ id, date, description, amount, type, category, source: 'manual' });

const shopping: Note = { id: 'n1', title: 'Shopping list', updatedAt: '2026-11-01T00:00:00Z', blocks: [{ id: 'b1', type: 'todo', title: '', items: [{ id: 'i1', text: 'Milk', done: false }, { id: 'i2', text: 'Rice', done: true }] }] };
const selling: Note = { id: 'n2', title: 'Things to sell', updatedAt: '2026-11-01T00:00:00Z', blocks: [{ id: 'b2', type: 'table', title: '', columns: ['Item', 'Price', 'Status'], rows: [['Old phone', '8000', 'Listed']] }] };

type Over = Partial<Omit<PlanCtx, 'state'>> & { state?: Partial<AppState> };
function ctx(over: Over = {}): PlanCtx {
  const state: AppState = {
    version: 1, profile: { ...EMPTY_PROFILE, age: 30 }, onboarded: true, overrides: {}, investments: [], liabilities: [], goals: [],
    txns: [tx('t1', '2026-11-01', 'UPI-Swiggy', 400, 'expense', 'Food & Dining'), tx('t2', '2026-11-02', 'Uber ride', 250, 'expense', 'Transport'), tx('t3', '2026-11-01', 'Salary', 100000, 'income', 'Salary')],
    notes: [shopping, selling], ...over.state,
  };
  return { state, today: TODAY, rates: { homeLoan: 8.75 } as never, assumptions: DEFAULT_ASSUMPTIONS, staged: [], edits: {}, tabs: ['dashboard', 'transactions', 'goals', 'notes', 'settings'], newId, now: '2026-11-03T10:00:00Z', ...over, } as PlanCtx;
}
const run = (say: string, over?: Over) => plan(parseCommand(say, TODAY), ctx(over));
const kinds = (p: { effects?: Effect[] }) => (p.effects ?? []).map((e) => e.k);

describe('plan: navigation and theme', () => {
  it('opens a screen', () => {
    expect(run('go to goals').effects).toEqual([{ k: 'nav', tab: 'goals' }]);
  });
  it('declines a screen that is switched off', () => {
    const p = run('open investments');
    expect(p.effects).toBeUndefined();
    expect(p.say).toMatch(/not available/);
  });
  it('switches theme', () => {
    expect(run('dark mode').effects).toEqual([{ k: 'theme', theme: 'dark' }]);
  });
});

describe('plan: transactions', () => {
  it('stages an expense as a draft and says how to keep it', () => {
    const p = run('spent 450 on swiggy yesterday');
    expect(kinds(p)).toEqual(['nav', 'stage']);
    const stage = p.effects![1] as Extract<Effect, { k: 'stage' }>;
    expect(stage.txn).toMatchObject({ amount: 450, type: 'expense', date: '2026-11-02', category: 'Food & Dining', description: 'Swiggy' });
    expect(p.say).toMatch(/say save/i);
  });
  it('asks how much when the amount is missing', () => {
    const p = run('add an expense for coffee');
    expect(p.ask?.kind).toBe('amount');
    expect(p.effects).toBeUndefined();
  });
  it('edits the amount of a named transaction', () => {
    const p = run('change the amount of swiggy to 500');
    expect(p.effects).toContainEqual({ k: 'editTxn', id: 't1', patch: { amount: 500 } });
  });
  it('edits the newest unsaved row for "last"', () => {
    const staged = tx('new1', TODAY, 'Coffee', 120);
    const p = run('change the last transaction to 150', { staged: [staged] });
    expect(p.effects).toContainEqual({ k: 'editTxn', id: 'new1', patch: { amount: 150 } });
  });
  it('rejects an unknown category and names some real ones', () => {
    const p = run('set the category of uber to zebra');
    expect(p.effects).toBeUndefined();
    expect(p.say).toMatch(/not one of the categories/);
  });
  it('asks before deleting a saved row, then deletes only after yes', () => {
    const p = run('delete the swiggy transaction');
    expect(p.effects).toBeUndefined();
    expect(p.ask?.kind).toBe('confirm');
    expect(p.ask && p.ask.kind === 'confirm' && p.ask.then.effects).toEqual([{ k: 'deleteTxn', txn: expect.objectContaining({ id: 't1' }) }]);
  });
  it('drops an unsaved row without asking', () => {
    const staged = tx('new1', TODAY, 'Coffee', 120);
    expect(run('delete the last transaction', { staged: [staged] }).effects).toEqual([{ k: 'dropStaged', id: 'new1' }]);
  });
  it('says so when nothing matches', () => {
    expect(run('delete the zomato transaction').say).toMatch(/could not find/);
  });
});

describe('plan: questions', () => {
  it('answers from saved transactions', () => {
    expect(run('how much did I spend this month').say).toContain('₹650');
    expect(run('how much did I earn this month').say).toContain('₹1,00,000');
  });
  it('says when a month is empty', () => {
    expect(run('how much did I spend last month').say).toMatch(/no saved transactions/);
  });
});

describe('plan: notes', () => {
  const upserted = (p: { effects?: Effect[] }) => {
    const e = p.effects!.find((x) => x.k === 'dispatch') as Extract<Effect, { k: 'dispatch' }>;
    return (e.action as { type: 'upsertNote'; note: Note }).note;
  };
  it('adds items to an existing list', () => {
    const note = upserted(run('add eggs and bread to my shopping list'));
    const block = note.blocks[0] as Extract<Note['blocks'][number], { type: 'todo' }>;
    expect(block.items.map((i) => i.text)).toEqual(['Milk', 'Rice', 'Eggs', 'Bread']);
  });
  it('adds rows to a selling table', () => {
    const note = upserted(run('add bicycle to my sell list'));
    const block = note.blocks[0] as Extract<Note['blocks'][number], { type: 'table' }>;
    expect(block.rows.map((r) => r[0])).toEqual(['Old phone', 'Bicycle']);
  });
  it('makes a new list when none matches', () => {
    const p = run('add paint to my garage list');
    expect(upserted(p).title).toBe('Garage');
    expect(p.say).toMatch(/new list/);
  });
  it('ticks an item and says where', () => {
    const p = run('tick off milk');
    const note = upserted(p);
    expect((note.blocks[0] as { items: Array<{ text: string; done: boolean }> }).items[0]).toMatchObject({ text: 'Milk', done: true });
  });
  it('will not tick what is already ticked', () => {
    expect(run('tick off rice').say).toMatch(/could not find/);
  });
  it('removes an item', () => {
    const note = upserted(run('remove milk from my shopping list'));
    expect((note.blocks[0] as { items: unknown[] }).items).toHaveLength(1);
  });
  it('opens a note by name', () => {
    expect(run('open my shopping list').effects).toEqual([{ k: 'nav', tab: 'notes' }, { k: 'openNote', id: 'n1' }]);
  });
  it('keeps a quick note in one place', () => {
    const note = upserted(run('note down call the bank'));
    expect(note.title).toBe('Quick notes');
    expect(note.blocks[0]).toMatchObject({ type: 'text', text: 'Call the bank' });
  });
  it('asks before deleting a note', () => {
    expect(run('delete my shopping note').ask?.kind).toBe('confirm');
  });
});

describe('plan: settings and goals', () => {
  it('asks before changing the age and reads the old value back', () => {
    const p = run('set my age to 32');
    expect(p.say).toBe('Change your age from 30 to 32?');
    expect(p.ask && p.ask.kind === 'confirm' && p.ask.then.effects).toEqual([{ k: 'dispatch', action: { type: 'profile', patch: { age: 32 } } }]);
  });
  it('rejects an impossible age', () => {
    expect(run('set my age to 4').say).toMatch(/between 18 and 100/);
  });
  it('finds an assumption by a few words', () => {
    const p = run('set house price growth to 7 percent');
    expect(p.ask && p.ask.kind === 'confirm' && p.ask.then.effects).toEqual([{ k: 'dispatch', action: { type: 'override', key: 'houseGrowth', value: 7 } }]);
  });
  it('prefers the exact key when several labels contain the word', () => {
    const p = run('set inflation to 6 percent');
    expect(p.ask && p.ask.kind === 'confirm' && p.ask.then.effects).toEqual([{ k: 'dispatch', action: { type: 'override', key: 'inflation', value: 6 } }]);
  });
  it('says when an assumption is ambiguous', () => {
    expect(run('set loan to 9 percent').say).toMatch(/Say the full name/);
  });
  it('adds a goal and refuses a duplicate', () => {
    expect(kinds(run('add a car goal'))).toEqual(['dispatch', 'nav']);
    const goal = newGoal('car', 'g1', TODAY, { carLoan: 9 } as never);
    expect(run('add a car goal', { state: { goals: [goal] } }).effects).toBeUndefined();
  });
  it('changes a goal price after asking', () => {
    const goal = newGoal('house', 'g2', TODAY, { homeLoan: 8.75 } as never);
    const p = run('set house price to 80 lakh', { state: { goals: [goal] } });
    expect(p.ask?.kind).toBe('confirm');
    expect(p.ask && p.ask.kind === 'confirm' && p.ask.then.effects?.[0]).toMatchObject({ action: { type: 'upsertGoal', goal: { id: 'g2', price: 8000000 } } });
  });
  it('says when the goal does not exist', () => {
    expect(run('set house price to 80 lakh').say).toMatch(/do not have a house goal/);
  });
});

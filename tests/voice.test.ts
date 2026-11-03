import { describe, expect, it } from 'vitest';
import { parseAnswer, parseCommand, type Cmd } from '../src/voice/parse';

const TODAY = '2026-11-03'; // a Tuesday
const p = (s: string): Cmd => parseCommand(s, TODAY);

describe('navigation', () => {
  it.each([
    ['go to goals', 'goals'],
    ['Open the dashboard', 'dashboard'],
    ['show me my transactions', 'transactions'],
    ['take me to settings', 'settings'],
    ['notes', 'notes'],
    ['open notes tab', 'notes'],
    ['hey, go to the home page please', 'dashboard'],
  ])('%s -> %s', (say, tab) => {
    expect(p(say)).toEqual({ t: 'navigate', tab });
  });
});

describe('theme', () => {
  it('reads dark and light', () => {
    expect(p('dark mode')).toEqual({ t: 'theme', theme: 'dark' });
    expect(p('switch to light theme')).toEqual({ t: 'theme', theme: 'light' });
    expect(p('go dark')).toEqual({ t: 'theme', theme: 'dark' });
  });
  it('reads automatic', () => {
    expect(p('match my device theme')).toEqual({ t: 'theme', theme: 'auto' });
  });
});

describe('simple commands', () => {
  it('undo, help, save, discard', () => {
    expect(p('undo')).toEqual({ t: 'undo' });
    expect(p('what can I say?')).toEqual({ t: 'help' });
    expect(p('save changes')).toEqual({ t: 'saveDrafts' });
    expect(p('discard')).toEqual({ t: 'discardDrafts' });
  });
});

describe('transactions', () => {
  it('adds an expense with a date', () => {
    expect(p('add expense 450 for swiggy yesterday')).toEqual({ t: 'addTxn', type: 'expense', amount: 450, description: 'Swiggy', date: '2026-11-02' });
  });
  it('adds an expense said naturally', () => {
    expect(p('I spent 1200 on groceries')).toMatchObject({ t: 'addTxn', type: 'expense', amount: 1200, description: 'Groceries', date: null });
  });
  it('reads income', () => {
    expect(p('got salary 125000')).toMatchObject({ t: 'addTxn', type: 'income', amount: 125000, description: 'Salary' });
    expect(p('received 5000 from rahul')).toMatchObject({ t: 'addTxn', type: 'income', amount: 5000, description: 'Rahul' });
  });
  it('reads lakh amounts and an explicit date', () => {
    expect(p('spent 1.5 lakh on rent on 1st november')).toMatchObject({ t: 'addTxn', type: 'expense', amount: 150000, date: '2026-11-01' });
  });
  it('reads amounts spoken in words', () => {
    expect(p('paid two thousand five hundred for electricity')).toMatchObject({ t: 'addTxn', amount: 2500, description: 'Electricity' });
  });
  it('keeps going when the amount is missing', () => {
    expect(p('add an expense for coffee')).toMatchObject({ t: 'addTxn', amount: null, description: 'Coffee' });
  });
  it('deletes the last one', () => {
    expect(p('delete the last transaction')).toEqual({ t: 'txnDelete', target: 'last' });
  });
  it('deletes by name', () => {
    expect(p('delete the swiggy transaction')).toEqual({ t: 'txnDelete', target: 'swiggy' });
  });
  it('changes the amount of a named transaction', () => {
    expect(p('change the amount of swiggy to 500')).toMatchObject({ t: 'txnEdit', target: 'swiggy', field: 'amount', amount: 500 });
  });
  it('changes the last transaction amount', () => {
    expect(p('change the last transaction to 300')).toMatchObject({ t: 'txnEdit', target: 'last', field: 'amount', amount: 300 });
  });
  it('changes a category', () => {
    expect(p('set the category of uber to travel')).toMatchObject({ t: 'txnEdit', target: 'uber', field: 'category', value: 'Travel' });
  });
  it('renames', () => {
    expect(p('rename uber to cab ride')).toMatchObject({ t: 'txnEdit', target: 'uber', field: 'description', value: 'Cab ride' });
  });
});

describe('questions', () => {
  it('asks what was spent', () => {
    expect(p('how much did I spend this month')).toEqual({ t: 'summary', what: 'spend', period: 'this' });
    expect(p('how much did I spend last month')).toEqual({ t: 'summary', what: 'spend', period: 'last' });
  });
  it('asks what was saved', () => {
    expect(p('how much have I saved')).toMatchObject({ t: 'summary', what: 'saved' });
  });
});

describe('notes', () => {
  it('adds items to a list', () => {
    expect(p('add milk, bread and eggs to my shopping list')).toEqual({ t: 'noteAddItems', list: 'shopping', items: ['milk', 'bread', 'eggs'] });
  });
  it('adds one item without the word list', () => {
    expect(p('add laptop to buy')).toMatchObject({ t: 'noteAddItems', list: 'buy', items: ['laptop'] });
  });
  it('creates lists', () => {
    expect(p('create a shopping list')).toMatchObject({ t: 'noteCreate', kind: 'buy' });
    expect(p('create a note called trip plan')).toEqual({ t: 'noteCreate', title: 'Trip plan', kind: 'text' });
  });
  it('quick notes', () => {
    expect(p('note down call the bank tomorrow')).toEqual({ t: 'noteQuick', text: 'call the bank tomorrow', as: 'text' });
    expect(p('remind me to renew insurance')).toEqual({ t: 'noteQuick', text: 'renew insurance', as: 'todo' });
  });
  it('ticks and unticks', () => {
    expect(p('tick off milk')).toEqual({ t: 'noteTick', text: 'milk', done: true });
    expect(p('mark bread as done')).toEqual({ t: 'noteTick', text: 'bread', done: true });
    expect(p('untick milk')).toEqual({ t: 'noteTick', text: 'milk', done: false });
  });
  it('removes an item', () => {
    expect(p('remove eggs from my shopping list')).toEqual({ t: 'noteRemoveItem', text: 'eggs', list: 'shopping' });
  });
  it('opens and deletes a note', () => {
    expect(p('open my shopping list')).toEqual({ t: 'noteOpen', name: 'shopping' });
    expect(p('delete my trip note')).toEqual({ t: 'noteDelete', name: 'trip' });
  });
});

describe('settings and goals', () => {
  it('sets profile values', () => {
    expect(p('set my age to 32')).toEqual({ t: 'setProfile', field: 'age', value: 32 });
    expect(p('change my monthly income to 1.2 lakh')).toEqual({ t: 'setProfile', field: 'monthlyIncome', value: 120000 });
    expect(p('call me asha')).toEqual({ t: 'setProfile', field: 'name', value: 'Asha' });
  });
  it('sets goal values', () => {
    expect(p('set house price to 80 lakh')).toEqual({ t: 'goalPrice', goal: 'house', price: 8000000 });
    expect(p('add a car goal')).toEqual({ t: 'goalAdd', kind: 'car' });
    expect(p('delete my bike goal')).toEqual({ t: 'goalDelete', goal: 'bike' });
  });
  it('sets an assumption', () => {
    expect(p('set inflation to 6 percent')).toEqual({ t: 'setAssumption', label: 'inflation', value: 6 });
  });
});

describe('unknown input', () => {
  it('does not guess', () => {
    expect(p('what is the weather like')).toMatchObject({ t: 'unknown' });
    expect(p('')).toMatchObject({ t: 'unknown' });
  });
});

describe('answers', () => {
  it('reads yes and no', () => {
    expect(parseAnswer('yes')).toBe('yes');
    expect(parseAnswer('Yeah, do it')).toBe('yes');
    expect(parseAnswer('no thanks')).toBe('no');
    expect(parseAnswer('cancel')).toBe('no');
    expect(parseAnswer('banana')).toBeNull();
  });
});

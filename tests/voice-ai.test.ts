import { describe, expect, it } from 'vitest';
import { readAiAnswer, validateCmd } from '../src/voice/ai';

const TODAY = '2026-11-03';
const v = (x: unknown) => validateCmd(x, TODAY);

describe('validateCmd: what the model may ask for', () => {
  it('accepts a well-formed expense', () => {
    expect(v({ t: 'addTxn', type: 'expense', amount: 250, description: 'Barber', date: '2026-11-02' })).toEqual({ t: 'addTxn', type: 'expense', amount: 250, description: 'Barber', date: '2026-11-02' });
  });
  it('allows a missing amount or date, which Mitra then asks about', () => {
    expect(v({ t: 'addTxn', type: 'expense', amount: null, description: 'Coffee', date: null })).toMatchObject({ amount: null, date: null });
  });
  it('rejects bad amounts, future dates and unknown types', () => {
    expect(v({ t: 'addTxn', type: 'expense', amount: -5, description: 'x', date: null })).toBeNull();
    expect(v({ t: 'addTxn', type: 'expense', amount: '250', description: 'x', date: null })).toBeNull();
    expect(v({ t: 'addTxn', type: 'expense', amount: 5, description: 'x', date: '2026-12-25' })).toBeNull();
    expect(v({ t: 'addTxn', type: 'transfer', amount: 5, description: 'x', date: null })).toBeNull();
    expect(v({ t: 'addTxn', type: 'expense', amount: 1e15, description: 'x', date: null })).toBeNull();
  });
  it('rejects commands that are not on the list', () => {
    expect(v({ t: 'wipeEverything' })).toBeNull();
    expect(v({ t: 'unknown' })).toBeNull();
    expect(v({ t: 'clearTxns' })).toBeNull();
    expect(v(null)).toBeNull();
    expect(v('go to goals')).toBeNull();
    expect(v([])).toBeNull();
  });
  it('checks every field of an edit', () => {
    expect(v({ t: 'txnEdit', target: 'swiggy', field: 'amount', amount: 500 })).toMatchObject({ field: 'amount', amount: 500 });
    expect(v({ t: 'txnEdit', target: 'swiggy', field: 'amount' })).toBeNull();
    expect(v({ t: 'txnEdit', target: 'swiggy', field: 'date', date: '2026-11-01' })).toMatchObject({ date: '2026-11-01' });
    expect(v({ t: 'txnEdit', target: 'swiggy', field: 'category', value: 'Travel' })).toMatchObject({ value: 'Travel' });
    expect(v({ t: 'txnEdit', target: 'swiggy', field: 'colour', value: 'red' })).toBeNull();
  });
  it('limits lists and text', () => {
    expect(v({ t: 'noteAddItems', list: 'shopping', items: ['milk', 'eggs'] })).toEqual({ t: 'noteAddItems', list: 'shopping', items: ['milk', 'eggs'] });
    expect(v({ t: 'noteAddItems', list: 'shopping', items: [] })).toBeNull();
    expect(v({ t: 'noteAddItems', list: 'shopping', items: Array(21).fill('x') })).toBeNull();
    expect(v({ t: 'noteAddItems', list: 'shopping', items: ['ok', 5] })).toBeNull();
    expect(v({ t: 'noteQuick', text: 'x'.repeat(201), as: 'text' })).toBeNull();
  });
  it('checks settings', () => {
    expect(v({ t: 'setProfile', field: 'age', value: 32 })).toEqual({ t: 'setProfile', field: 'age', value: 32 });
    expect(v({ t: 'setProfile', field: 'name', value: 'Asha' })).toMatchObject({ value: 'Asha' });
    expect(v({ t: 'setProfile', field: 'password', value: 'x' })).toBeNull();
    expect(v({ t: 'setAssumption', label: 'inflation', value: 6 })).toMatchObject({ value: 6 });
    expect(v({ t: 'setAssumption', label: 'inflation', value: 600 })).toBeNull();
    expect(v({ t: 'goalMonth', goal: 'house', month: '2030-13' })).toBeNull();
    expect(v({ t: 'goalMonth', goal: 'house', month: '2030-06' })).toMatchObject({ month: '2030-06' });
  });
  it('accepts the no-field commands', () => {
    expect(v({ t: 'undo' })).toEqual({ t: 'undo' });
    expect(v({ t: 'undo', extra: 'ignored' })).toEqual({ t: 'undo' });
  });
});

describe('readAiAnswer', () => {
  it('reads a command, a reply and junk', () => {
    expect(readAiAnswer({ command: { t: 'navigate', tab: 'goals' } }, TODAY)).toEqual({ cmd: { t: 'navigate', tab: 'goals' } });
    expect(readAiAnswer({ reply: 'I cannot do that yet.' }, TODAY)).toEqual({ reply: 'I cannot do that yet.' });
    expect(readAiAnswer({ command: { t: 'nope' } }, TODAY)).toEqual({ error: 'failed' });
    expect(readAiAnswer({ reply: 'x'.repeat(500) }, TODAY)).toEqual({ error: 'failed' });
    expect(readAiAnswer(undefined, TODAY)).toEqual({ error: 'failed' });
  });
});

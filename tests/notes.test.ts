import { describe, expect, it } from 'vitest';
import { createNote, demoNotes, moveBlock, newTable, noteSummary, tableTotals, todoProgress } from '../src/engine/notes';
import type { Note, NoteBlock } from '../src/engine/types';

let n = 0;
const id = () => `id${n++}`;
const NOW = '2026-11-03T10:00:00.000Z';
const table = (rows: string[][], columns = ['Item', 'Price']) => ({ id: id(), type: 'table', title: '', columns, rows }) as Extract<NoteBlock, { type: 'table' }>;

describe('starting a note', () => {
  it('"things to buy" is a to-do list with one empty item', () => {
    const note = createNote('buy', NOW, id);
    expect(note.title).toBe('Things to buy');
    expect(note.blocks).toHaveLength(1);
    const b = note.blocks[0];
    expect(b.type).toBe('todo');
    expect(b.type === 'todo' && b.items).toHaveLength(1);
  });

  it('"things to sell" is a table with a status column and three empty rows', () => {
    const b = createNote('sell', NOW, id).blocks[0];
    expect(b.type).toBe('table');
    if (b.type !== 'table') return;
    expect(b.columns).toEqual(['Item', 'Asking price (₹)', 'Status']);
    expect(b.rows).toHaveLength(3);
    expect(b.rows.every((r) => r.length === 3 && r.every((c) => c === ''))).toBe(true);
  });

  it('a blank note has no title and one text block', () => {
    const note = createNote('blank', NOW, id);
    expect(note.title).toBe('');
    expect(note.blocks.map((b) => b.type)).toEqual(['text']);
  });

  it('every new table row has one cell per column', () => {
    const t = newTable(id, ['A', 'B', 'C', 'D'], 2);
    expect(t.type === 'table' && t.rows.every((r) => r.length === 4)).toBe(true);
  });

  it('gives every block and item its own id', () => {
    const note = demoNotes(NOW, id)[0];
    const ids = [note.id, ...note.blocks.flatMap((b) => [b.id, ...(b.type === 'todo' ? b.items.map((i) => i.id) : [])])];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('summaries', () => {
  const note: Note = { id: 'a', title: 'x', updatedAt: NOW, blocks: [
    { id: '1', type: 'todo', title: '', items: [{ id: 'i1', text: 'Bag', done: true }, { id: 'i2', text: 'Shoes', done: false }, { id: 'i3', text: '', done: false }] },
    { id: '2', type: 'text', text: 'Wait for the sale  today' },
    table([['A', '1']]),
  ] };

  it('counts only items that have text', () => {
    expect(todoProgress(note)).toEqual({ done: 1, total: 2 });
  });

  it('describes the note in one line', () => {
    expect(noteSummary(note)).toBe('1 of 2 done · 1 table · 5 words');
    expect(noteSummary({ blocks: [] })).toBe('Empty');
    expect(noteSummary({ blocks: [{ id: '1', type: 'text', text: 'one' }] })).toBe('1 word');
  });
});

describe('table totals', () => {
  it('sums columns that are mostly numbers, in any Indian or plain format', () => {
    const t = table([['Phone', '8,000'], ['Table', '₹3,500'], ['Cycle', '6000.50']]);
    expect(tableTotals(t)).toEqual([{ column: 'Price', total: 17500.5, count: 3 }]);
  });

  it('ignores text columns and columns with fewer than two numbers', () => {
    expect(tableTotals(table([['Phone', '8,000'], ['Table', '']]))).toEqual([]);
    expect(tableTotals(table([['Phone', 'ask'], ['Table', 'maybe'], ['Cycle', '500']]))).toEqual([]);
  });

  it('tolerates a mostly numeric column with a stray word, and counts brackets as negative', () => {
    const t = table([['a', '100'], ['b', '200'], ['c', '(50)'], ['d', 'tbd'], ['e', '10']]);
    expect(tableTotals(t)[0]).toMatchObject({ total: 260, count: 4 });
  });

  it('names an unnamed column by its position', () => {
    expect(tableTotals(table([['a', '1'], ['b', '2']], ['Item', ''])).map((x) => x.column)).toEqual(['Column 2']);
  });
});

describe('moving blocks', () => {
  const blocks: NoteBlock[] = [{ id: 'a', type: 'text', text: '' }, { id: 'b', type: 'text', text: '' }, { id: 'c', type: 'text', text: '' }];
  it('swaps with the neighbour', () => {
    expect(moveBlock(blocks, 'b', -1).map((b) => b.id)).toEqual(['b', 'a', 'c']);
    expect(moveBlock(blocks, 'b', 1).map((b) => b.id)).toEqual(['a', 'c', 'b']);
  });
  it('does nothing at the ends or for an unknown id, and does not change the original', () => {
    expect(moveBlock(blocks, 'a', -1)).toBe(blocks);
    expect(moveBlock(blocks, 'c', 1)).toBe(blocks);
    expect(moveBlock(blocks, 'zzz', 1)).toBe(blocks);
    expect(blocks.map((b) => b.id)).toEqual(['a', 'b', 'c']);
  });
});

import { parseMoney } from './csv';
import type { Note, NoteBlock, TodoItem } from './types';

export type NoteKind = 'blank' | 'buy' | 'sell';

type Id = () => string;
const rid: Id = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

export const newItem = (id: Id = rid, text = ''): TodoItem => ({ id: id(), text, done: false });
export const newTodo = (id: Id = rid, title = ''): NoteBlock => ({ id: id(), type: 'todo', title, items: [newItem(id)] });
export const newText = (id: Id = rid): NoteBlock => ({ id: id(), type: 'text', text: '' });
export const newTable = (id: Id = rid, columns = ['Item', 'Details', 'Price (₹)'], rowCount = 3): NoteBlock => ({
  id: id(), type: 'table', title: '', columns, rows: Array.from({ length: rowCount }, () => columns.map(() => '')),
});

/** A starting point for a new note: a list of things to buy, a table of things to sell, or an empty page. */
export function createNote(kind: NoteKind, now: string, id: Id = rid): Note {
  if (kind === 'buy') return { id: id(), title: 'Things to buy', updatedAt: now, blocks: [newTodo(id, 'To buy')] };
  if (kind === 'sell') return { id: id(), title: 'Things to sell', updatedAt: now, blocks: [newTable(id, ['Item', 'Asking price (₹)', 'Status'])] };
  return { id: id(), title: '', updatedAt: now, blocks: [newText(id)] };
}

/** How many to-do items are done, across the whole note. */
export function todoProgress(note: Pick<Note, 'blocks'>): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const b of note.blocks) if (b.type === 'todo') for (const i of b.items) { if (!i.text.trim()) continue; total++; if (i.done) done++; }
  return { done, total };
}

/** One line for the notes list: what is in the note. */
export function noteSummary(note: Pick<Note, 'blocks'>): string {
  const { done, total } = todoProgress(note);
  const tables = note.blocks.filter((b) => b.type === 'table').length;
  const bits: string[] = [];
  if (total) bits.push(`${done} of ${total} done`);
  if (tables) bits.push(`${tables} ${tables === 1 ? 'table' : 'tables'}`);
  const words = note.blocks.reduce((a, b) => a + (b.type === 'text' ? b.text.trim().split(/\s+/).filter(Boolean).length : 0), 0);
  if (words) bits.push(`${words} ${words === 1 ? 'word' : 'words'}`);
  return bits.join(' · ') || 'Empty';
}

/** Totals for table columns that are mostly numbers (prices, quantities). Cells may be written like 1,20,000 or ₹8,000. */
export function tableTotals(block: Extract<NoteBlock, { type: 'table' }>): Array<{ column: string; total: number; count: number }> {
  const out: Array<{ column: string; total: number; count: number }> = [];
  block.columns.forEach((name, c) => {
    const cells = block.rows.map((r) => (r[c] ?? '').trim()).filter(Boolean);
    const nums = cells.map((v) => parseMoney(v)).filter((m): m is NonNullable<ReturnType<typeof parseMoney>> => !!m);
    if (nums.length >= 2 && nums.length >= cells.length * 0.6) out.push({ column: name || `Column ${c + 1}`, total: nums.reduce((a, m) => a + m.n, 0), count: nums.length });
  });
  return out;
}

export function moveBlock(blocks: NoteBlock[], id: string, dir: -1 | 1): NoteBlock[] {
  const i = blocks.findIndex((b) => b.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= blocks.length) return blocks;
  const next = [...blocks];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

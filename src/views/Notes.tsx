import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createNote, moveBlock, newItem, newTable, newText, newTodo, noteSummary, tableTotals, todoProgress, type NoteKind } from '../engine/notes';
import type { Note, NoteBlock, TodoItem } from '../engine/types';
import { Icon, type IconName } from '../components/icons';
import { Card } from '../components/ui';
import { useToast } from '../components/feedback';
import { inr } from '../lib/format';
import { useStore } from '../store';

const when = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const STARTS: Array<{ kind: NoteKind; icon: IconName; title: string; hint: string }> = [
  { kind: 'buy', icon: 'todo', title: 'Things to buy', hint: 'A to-do list with checkboxes' },
  { kind: 'sell', icon: 'table', title: 'Things to sell', hint: 'A table with item, price and status' },
  { kind: 'blank', icon: 'notes', title: 'Blank note', hint: 'Start from text, add the rest as you go' },
];

export function Notes() {
  const { state, dispatch } = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const notes = useMemo(() => [...(state.notes ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [state.notes]);
  const open = openId ? notes.find((n) => n.id === openId) : undefined;

  const start = (kind: NoteKind) => {
    const note = createNote(kind, new Date().toISOString());
    dispatch({ type: 'upsertNote', note });
    setChoosing(false);
    setOpenId(note.id);
  };

  if (open) return <NoteEditor key={open.id} note={open} onBack={() => setOpenId(null)} />;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Notes</h1>
          <div className="sub">Lists and tables for what you want to buy, sell or remember</div>
        </div>
        <button className="btn primary" aria-expanded={choosing} onClick={() => setChoosing((c) => !c)}>
          <Icon name={choosing ? 'close' : 'plus'} size={18} />{choosing ? 'Cancel' : 'New note'}
        </button>
      </div>

      {choosing && (
        <Card title="What do you want to keep track of?" sub="Pick a starting point. You can add text, tables and to-do lists to any note.">
          <div className="chooser" role="group" aria-label="Choose a starting point">
            {STARTS.map((s) => (
              <button key={s.kind} className="choice" onClick={() => start(s.kind)}>
                <span className="icon-tile"><Icon name={s.icon} size={22} /></span>
                <b>{s.title}</b>
                <span className="sub">{s.hint}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {notes.length === 0 ? (
        !choosing && (
          <Card>
            <div className="empty-cta">
              <p className="sub">No notes yet. Keep a list of things you want to buy or sell, a table of prices, or a few lines of text.</p>
            </div>
          </Card>
        )
      ) : (
        <ul className="clean chooser notes-list" aria-label="Your notes">
          {notes.map((n) => (
            <li key={n.id}>
              <button className="choice" onClick={() => setOpenId(n.id)} aria-label={`Open ${n.title || 'untitled note'}`}>
                <span className="icon-tile"><Icon name={n.blocks[0]?.type === 'table' ? 'table' : n.blocks[0]?.type === 'todo' ? 'todo' : 'notes'} size={22} /></span>
                <b>{n.title || 'Untitled note'}</b>
                <span className="sub">{noteSummary(n)}</span>
                <span className="sub">Edited {when(n.updatedAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- The editor: a title and a stack of blocks. Everything saves as you type. ---------- */

function NoteEditor({ note: initial, onBack }: { note: Note; onBack: () => void }) {
  const { dispatch } = useStore();
  const { toast } = useToast();
  const [note, setNote] = useState(initial);
  const [status, setStatus] = useState<'saved' | 'saving'>('saved');
  const latest = useRef(note);
  latest.current = note;
  const committed = useRef(initial);
  const timer = useRef(0);
  const gone = useRef(false);
  const [focusBlock, setFocusBlock] = useState<string | null>(null);

  const commit = useCallback(() => {
    window.clearTimeout(timer.current);
    if (!gone.current && latest.current !== committed.current) {
      dispatch({ type: 'upsertNote', note: latest.current });
      committed.current = latest.current;
    }
    setStatus('saved');
  }, [dispatch]);

  // Saves shortly after the last keystroke, when the tab goes to the background, and when the editor closes.
  const change = (fn: (n: Note) => Note) => {
    setNote((n) => ({ ...fn(n), updatedAt: new Date().toISOString() }));
    setStatus('saving');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(commit, 400);
  };
  useEffect(() => {
    const hide = () => { if (document.hidden) commit(); };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', commit);
    return () => { document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', commit); commit(); };
  }, [commit]);

  // Puts the cursor in a block that was just added.
  useLayoutEffect(() => {
    if (!focusBlock) return;
    document.querySelector<HTMLElement>(`[data-block="${focusBlock}"] input:not([type=checkbox]), [data-block="${focusBlock}"] textarea`)?.focus();
    setFocusBlock(null);
  }, [focusBlock, note.blocks.length]);

  const setBlock = (id: string, fn: (b: NoteBlock) => NoteBlock) => change((n) => ({ ...n, blocks: n.blocks.map((b) => (b.id === id ? fn(b) : b)) }));
  const add = (kind: 'text' | 'table' | 'todo') => {
    const block = kind === 'text' ? newText() : kind === 'table' ? newTable() : newTodo();
    change((n) => ({ ...n, blocks: [...n.blocks, block] }));
    setFocusBlock(block.id);
  };
  const removeBlock = (b: NoteBlock) => {
    const at = note.blocks.findIndex((x) => x.id === b.id);
    change((n) => ({ ...n, blocks: n.blocks.filter((x) => x.id !== b.id) }));
    toast(`${b.type === 'text' ? 'Text' : b.type === 'table' ? 'Table' : 'To-do list'} removed`, {
      undo: () => change((n) => ({ ...n, blocks: [...n.blocks.slice(0, at), b, ...n.blocks.slice(at)] })),
    });
  };
  const removeNote = () => {
    const snapshot = latest.current;
    gone.current = true;
    window.clearTimeout(timer.current);
    dispatch({ type: 'deleteNote', id: snapshot.id });
    toast(`${snapshot.title || 'Untitled note'} deleted`, { undo: () => dispatch({ type: 'upsertNote', note: snapshot }) });
    onBack();
  };

  const { done, total } = todoProgress(note);

  return (
    <div className="page note-editor">
      <div className="note-top">
        <button className="btn" onClick={() => { commit(); onBack(); }}><Icon name="back" size={16} />All notes</button>
        <span className="sub note-status" role="status">{status === 'saving' ? 'Saving...' : 'Saved'}</span>
        <button className="btn small danger" onClick={removeNote}><Icon name="trash" size={16} />Delete note</button>
      </div>

      <div>
        <input className="cell-input note-title" aria-label="Note title" placeholder="Untitled note" autoFocus={!initial.title} value={note.title} onChange={(e) => change((n) => ({ ...n, title: e.target.value }))} />
        <div className="sub note-meta">{total ? `${done} of ${total} done · ` : ''}Edited {when(note.updatedAt)}</div>
      </div>

      {note.blocks.map((b, i) => (
        <BlockFrame key={b.id} block={b} first={i === 0} last={i === note.blocks.length - 1} onMove={(d) => change((n) => ({ ...n, blocks: moveBlock(n.blocks, b.id, d) }))} onRemove={() => removeBlock(b)} onTitle={b.type === 'text' ? undefined : (t) => setBlock(b.id, (x) => ({ ...x, title: t }) as NoteBlock)}>
          {b.type === 'text' && <TextBlock block={b} onChange={(text) => setBlock(b.id, (x) => ({ ...x, text }) as NoteBlock)} />}
          {b.type === 'todo' && <TodoBlock block={b} onChange={(items) => setBlock(b.id, (x) => ({ ...x, items }) as NoteBlock)} />}
          {b.type === 'table' && <TableBlock block={b} onChange={(columns, rows) => setBlock(b.id, (x) => ({ ...x, columns, rows }) as NoteBlock)} />}
        </BlockFrame>
      ))}

      <Card title="Add to this note">
        <div className="row">
          <button className="btn" onClick={() => add('text')}><Icon name="text" size={16} />Text</button>
          <button className="btn" onClick={() => add('table')}><Icon name="table" size={16} />Table</button>
          <button className="btn" onClick={() => add('todo')}><Icon name="todo" size={16} />To-do list</button>
        </div>
      </Card>
    </div>
  );
}

const KIND: Record<NoteBlock['type'], { label: string; icon: IconName }> = {
  text: { label: 'Text', icon: 'text' },
  todo: { label: 'To-do list', icon: 'todo' },
  table: { label: 'Table', icon: 'table' },
};

function BlockFrame({ block, first, last, onMove, onRemove, onTitle, children }: { block: NoteBlock; first: boolean; last: boolean; onMove: (d: -1 | 1) => void; onRemove: () => void; onTitle?: (t: string) => void; children: ReactNode }) {
  const k = KIND[block.type];
  return (
    <section className="card block" data-block={block.id} aria-label={k.label}>
      <div className="block-head">
        <span className="block-kind"><Icon name={k.icon} size={16} />{onTitle ? null : k.label}</span>
        {onTitle && block.type !== 'text' && <input className="cell-input block-title" aria-label={`${k.label} name`} placeholder="Name (optional)" value={block.title} onChange={(e) => onTitle(e.target.value)} />}
        <span className="block-controls">
          <button className="btn icon small ghost" aria-label={`Move ${k.label.toLowerCase()} up`} title="Move up" disabled={first} onClick={() => onMove(-1)}><Icon name="up" size={16} /></button>
          <button className="btn icon small ghost" aria-label={`Move ${k.label.toLowerCase()} down`} title="Move down" disabled={last} onClick={() => onMove(1)}><Icon name="down" size={16} /></button>
          <button className="btn icon small ghost danger" aria-label={`Remove ${k.label.toLowerCase()}`} title="Remove" onClick={onRemove}><Icon name="trash" size={16} /></button>
        </span>
      </div>
      {children}
    </section>
  );
}

function TextBlock({ block, onChange }: { block: Extract<NoteBlock, { type: 'text' }>; onChange: (t: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // The box grows with what is typed, so there is no inner scrolling.
  useLayoutEffect(() => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px`; } }, [block.text]);
  return <textarea ref={ref} className="cell-input note-text" aria-label="Note text" rows={3} placeholder="Write here..." value={block.text} onChange={(e) => onChange(e.target.value)} />;
}

function TodoBlock({ block, onChange }: { block: Extract<NoteBlock, { type: 'todo' }>; onChange: (items: TodoItem[]) => void }) {
  const { toast } = useToast();
  const [focusId, setFocusId] = useState<string | null>(null);
  const items = block.items;
  const done = items.filter((i) => i.done && i.text.trim()).length;
  const total = items.filter((i) => i.text.trim()).length;

  useLayoutEffect(() => {
    if (!focusId) return;
    document.querySelector<HTMLInputElement>(`[data-item="${focusId}"]`)?.focus();
    setFocusId(null);
  }, [focusId, items.length]);

  const set = (id: string, patch: Partial<TodoItem>) => onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const addAfter = (index: number) => {
    const item = newItem();
    onChange([...items.slice(0, index + 1), item, ...items.slice(index + 1)]);
    setFocusId(item.id);
  };
  const remove = (index: number, focusPrev = false) => {
    if (items.length === 1) { onChange([{ ...items[0], text: '', done: false }]); return; }
    const prev = items[index - 1] ?? items[index + 1];
    onChange(items.filter((_, i) => i !== index));
    if (focusPrev && prev) setFocusId(prev.id);
  };
  const clearDone = () => {
    const removed = items.filter((i) => i.done);
    const kept = items.filter((i) => !i.done);
    onChange(kept.length ? kept : [newItem()]);
    toast(`${removed.length} completed ${removed.length === 1 ? 'item' : 'items'} cleared`, { undo: () => onChange(items) });
  };

  return (
    <div className="stack">
      <ul className="clean todo-list" aria-label={block.title || 'To-do list'}>
        {items.map((it, index) => (
          <li key={it.id} className={`todo-row ${it.done ? 'done' : ''}`}>
            <label className="todo-box">
              <input type="checkbox" checked={it.done} aria-label={`Done: ${it.text || 'empty item'}`} onChange={(e) => set(it.id, { done: e.target.checked })} />
            </label>
            <input
              className="cell-input" data-item={it.id} aria-label="To-do item" placeholder="Add an item" value={it.text}
              onChange={(e) => set(it.id, { text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); addAfter(index); }
                else if (e.key === 'Backspace' && it.text === '' && items.length > 1) { e.preventDefault(); remove(index, true); }
              }}
            />
            <button className="btn icon small ghost" aria-label={`Remove item ${it.text || index + 1}`} title="Remove item" onClick={() => remove(index)}><Icon name="close" size={16} /></button>
          </li>
        ))}
      </ul>
      <div className="row todo-foot">
        <button className="btn small" onClick={() => addAfter(items.length - 1)}><Icon name="plus" size={16} />Add item</button>
        {done > 0 && <button className="btn small ghost" onClick={clearDone}>Clear completed</button>}
        {total > 0 && <span className="sub todo-count">{done} of {total} done</span>}
      </div>
    </div>
  );
}

function TableBlock({ block, onChange }: { block: Extract<NoteBlock, { type: 'table' }>; onChange: (columns: string[], rows: string[][]) => void }) {
  const { columns, rows } = block;
  const totals = tableTotals(block);
  const setCell = (r: number, c: number, v: string) => onChange(columns, rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)));
  const setHead = (c: number, v: string) => onChange(columns.map((x, j) => (j === c ? v : x)), rows);
  const addRow = () => onChange(columns, [...rows, columns.map(() => '')]);
  const addColumn = () => onChange([...columns, ''], rows.map((r) => [...r, '']));
  const removeRow = (r: number) => onChange(columns, rows.filter((_, i) => i !== r));
  const removeColumn = (c: number) => columns.length > 1 && onChange(columns.filter((_, j) => j !== c), rows.map((r) => r.filter((_, j) => j !== c)));

  return (
    <div className="stack">
      <div className="table-wrap">
        <table className="table notes-table">
          <thead>
            <tr>
              {columns.map((name, c) => (
                <th key={c}>
                  <span className="th-cell">
                    <input className="cell-input head" aria-label={`Column ${c + 1} name`} placeholder={`Column ${c + 1}`} value={name} onChange={(e) => setHead(c, e.target.value)} />
                    {columns.length > 1 && <button className="btn icon small ghost" aria-label={`Remove column ${name || c + 1}`} title="Remove column" onClick={() => removeColumn(c)}><Icon name="close" size={14} /></button>}
                  </span>
                </th>
              ))}
              <th><span className="sr-only">Row actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {columns.map((name, c) => (
                  <td key={c}><input className="cell-input" aria-label={`${name || `Column ${c + 1}`}, row ${r + 1}`} value={row[c] ?? ''} onChange={(e) => setCell(r, c, e.target.value)} /></td>
                ))}
                <td className="actions"><button className="btn icon small ghost" aria-label={`Remove row ${r + 1}`} title="Remove row" onClick={() => removeRow(r)}><Icon name="trash" size={16} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row">
        <button className="btn small" onClick={addRow}><Icon name="plus" size={16} />Add row</button>
        <button className="btn small" onClick={addColumn}><Icon name="plus" size={16} />Add column</button>
        {totals.length > 0 && <span className="sub table-totals">{totals.map((t) => `Total ${t.column}: ${inr(t.total)}`).join(' · ')}</span>}
      </div>
    </div>
  );
}

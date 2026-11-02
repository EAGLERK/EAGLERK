import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Txn } from '../engine/types';
import { parseDate } from '../engine/csv';
import { dialogIn } from '../motion';
import { useStore } from '../store';
import { useToast } from './feedback';

/**
 * Transactions that were imported, typed in or changed are drafts until the person presses Save. Drafts live in memory only:
 * they are not counted on the Dashboard and not stored or synced, so leaving the screen asks what to do with them.
 */

export const rowProblem = (t: Pick<Txn, 'date' | 'amount'>): string | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date) || !parseDate(t.date)) return 'a valid date';
  if (!Number.isFinite(t.amount) || t.amount <= 0) return 'an amount above 0';
  return null;
};

type Edits = Record<string, Partial<Txn>>;

interface DraftsApi {
  /** New rows (imported or typed in) that are not saved yet. */
  added: Txn[];
  /** Changes to saved rows, by row id. */
  edits: Edits;
  count: number;
  /** How many drafts cannot be saved yet (missing date or amount). */
  invalid: number;
  dirty: boolean;
  stage(rows: Txn[]): void;
  edit(id: string, patch: Partial<Txn>): void;
  /** Drops unsaved new rows. */
  dropAdded(ids: string[]): void;
  /** Forgets any unsaved change to a row (for example because the row was deleted). */
  forget(id: string): void;
  save(): boolean;
  discard(): void;
  /** Runs the action now, or after asking, when there are unsaved drafts. */
  guard(action: () => void): void;
  /** Reads the latest answer without waiting for a re-render (used by browser navigation handlers). */
  isDirty(): boolean;
}

const Ctx = createContext<DraftsApi | null>(null);
export const useDrafts = (): DraftsApi => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useDrafts needs a DraftsProvider');
  return c;
};

export function DraftsProvider({ children }: { children: ReactNode }) {
  const { state, dispatch } = useStore();
  const { toast } = useToast();
  const [added, setAdded] = useState<Txn[]>([]);
  const [edits, setEdits] = useState<Edits>({});
  const live = useRef({ added, edits });
  live.current = { added, edits };
  const [asking, setAsking] = useState<null | (() => void)>(null);

  const count = added.length + Object.keys(edits).length;
  const dirty = count > 0;
  const invalid = useMemo(() => {
    const byId = new Map(state.txns.map((t) => [t.id, t]));
    const bad = added.filter((t) => rowProblem(t)).length;
    const badEdits = Object.entries(edits).filter(([id, p]) => byId.has(id) && rowProblem({ ...byId.get(id)!, ...p })).length;
    return bad + badEdits;
  }, [added, edits, state.txns]);

  // Lets the stylesheet lift toasts above the Save bar while it is showing.
  useEffect(() => {
    document.body.dataset.savebar = dirty ? '1' : '';
    return () => { document.body.dataset.savebar = ''; };
  }, [dirty]);

  // The browser's own "leave this page?" warning for closing or reloading the tab.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const stage = useCallback((rows: Txn[]) => setAdded((a) => [...rows, ...a]), []);
  const edit = useCallback((id: string, patch: Partial<Txn>) => {
    if (live.current.added.some((t) => t.id === id)) { setAdded((a) => a.map((t) => (t.id === id ? { ...t, ...patch } : t))); return; }
    const original = state.txns.find((t) => t.id === id);
    if (!original) return;
    setEdits((e) => {
      const merged = { ...e[id], ...patch } as Record<string, unknown>;
      // A value put back to what is saved is no longer a change.
      for (const k of Object.keys(merged)) if (merged[k] === (original as unknown as Record<string, unknown>)[k]) delete merged[k];
      const next = { ...e };
      if (Object.keys(merged).length) next[id] = merged as Partial<Txn>; else delete next[id];
      return next;
    });
  }, [state.txns]);
  const dropAdded = useCallback((ids: string[]) => setAdded((a) => a.filter((t) => !ids.includes(t.id))), []);
  const forget = useCallback((id: string) => setEdits((e) => { if (!(id in e)) return e; const n = { ...e }; delete n[id]; return n; }), []);

  const clear = () => { live.current = { added: [], edits: {} }; setAdded([]); setEdits({}); };

  const save = useCallback(() => {
    const { added: a, edits: e } = live.current;
    if (!a.length && !Object.keys(e).length) return true;
    if (invalid > 0) return false;
    dispatch({ type: 'commitTxns', added: a, edits: e });
    const parts = [a.length ? `${a.length} new` : '', Object.keys(e).length ? `${Object.keys(e).length} changed` : ''].filter(Boolean);
    toast(`Saved ${parts.join(' and ')} ${a.length + Object.keys(e).length === 1 ? 'transaction' : 'transactions'}.`);
    live.current = { added: [], edits: {} };
    setAdded([]);
    setEdits({});
    return true;
  }, [dispatch, invalid, toast]);

  const discard = useCallback(() => {
    const before = live.current;
    const n = before.added.length + Object.keys(before.edits).length;
    if (!n) return;
    clear();
    toast(`Discarded ${n} unsaved ${n === 1 ? 'change' : 'changes'}.`, { undo: () => { live.current = before; setAdded(before.added); setEdits(before.edits); } });
  }, [toast]);

  const guard = useCallback((action: () => void) => {
    const { added: a, edits: e } = live.current;
    if (a.length + Object.keys(e).length === 0) action();
    else setAsking(() => action);
  }, []);

  const api = useMemo<DraftsApi>(
    () => ({ added, edits, count, invalid, dirty, stage, edit, dropAdded, forget, save, discard, guard, isDirty: () => live.current.added.length + Object.keys(live.current.edits).length > 0 }),
    [added, edits, count, invalid, dirty, stage, edit, dropAdded, forget, save, discard, guard],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      {asking && (
        <LeaveDialog
          count={count}
          invalid={invalid}
          onStay={() => setAsking(null)}
          onLeave={() => { const go = asking; clear(); setAsking(null); go(); }}
          onSaveAndLeave={() => { if (save()) { const go = asking; setAsking(null); go(); } }}
        />
      )}
    </Ctx.Provider>
  );
}

function LeaveDialog({ count, invalid, onStay, onLeave, onSaveAndLeave }: { count: number; invalid: number; onStay: () => void; onLeave: () => void; onSaveAndLeave: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (d && !d.open) { d.showModal(); dialogIn(d); } }, []);
  return (
    <dialog ref={ref} className="modal leave" aria-labelledby="leave-title" onCancel={(e) => { e.preventDefault(); onStay(); }}>
      <div className="modal-body">
        <h2 id="leave-title">Save your changes before leaving?</h2>
        <div className="sub">
          You have {count} unsaved {count === 1 ? 'change' : 'changes'} in Transactions. If you leave without saving, {count === 1 ? 'it is' : 'they are'} lost.
          {invalid > 0 && <> {invalid} {invalid === 1 ? 'row needs' : 'rows need'} a valid date and an amount above 0 before saving.</>}
        </div>
        <div className="modal-actions">
          <button className="btn" autoFocus onClick={onStay}>Keep editing</button>
          <button className="btn danger" onClick={onLeave}>Leave without saving</button>
          <button className="btn primary" disabled={invalid > 0} onClick={onSaveAndLeave}>Save and leave</button>
        </div>
      </div>
    </dialog>
  );
}

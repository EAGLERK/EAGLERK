import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { parseStatement } from '../engine/csv';
import { hashText, looksDestructive, sheetLabel, sheetTarget, syncRows } from '../engine/sheets';
import type { SheetLink, Txn } from '../engine/types';
import { inr, uid } from '../lib/format';
import { dialogIn } from '../motion';
import { fetchSheetCsv, sheetMessage } from '../sheets/fetch';
import { useStore } from '../store';
import { useDrafts } from './Drafts';
import { useToast } from './feedback';
import { Icon } from './icons';

/**
 * Google Sheets as a source of transactions. A sheet shared with "Anyone with the link" is read straight from the browser to Google
 * (MyMoney has no server in between). While MyMoney is open it looks again every few minutes, when the tab comes back into view and when the
 * connection returns, and brings in whatever changed. It cannot be told by Google when the sheet changes, and it cannot look while closed.
 */

const EVERY = 60_000; // how often the timer wakes
const STALE = 5 * 60_000; // how old the last look must be before the timer looks again
const SOON = 60_000; // the same, when the tab just came back into view

interface Preview { url: string; urls: string[]; hash: string; rows: Txn[]; warnings: string[]; notes: string[] }

interface SheetsApi {
  checking: ReadonlySet<string>;
  /** When each sheet was last looked at (ms), this session. */
  checkedAt: Readonly<Record<string, number>>;
  openConnect(): void;
  syncNow(id: string): void;
  setAuto(id: string, auto: boolean): void;
  disconnect(id: string): void;
}

const Ctx = createContext<SheetsApi | null>(null);
export const useSheets = (): SheetsApi => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSheets needs a SheetsProvider');
  return c;
};

export function SheetsProvider({ children }: { children: ReactNode }) {
  const { state, dispatch } = useStore();
  const drafts = useDrafts();
  const { toast } = useToast();
  const [checking, setChecking] = useState<ReadonlySet<string>>(new Set());
  const [checkedAt, setCheckedAt] = useState<Record<string, number>>({});
  const [connecting, setConnecting] = useState(false);
  const inflight = useRef(new Set<string>());
  const last = useRef<Record<string, number>>({});

  // Everything the timer and handlers read, so they always see the latest data without being re-created.
  const live = useRef({ state, drafts, toast });
  live.current = { state, drafts, toast };

  const run = useCallback(async (id: string, manual: boolean) => {
    const sheet = live.current.state.sheets?.find((s) => s.id === id);
    if (!sheet || inflight.current.has(id)) return;
    inflight.current.add(id);
    setChecking(new Set(inflight.current));
    const say = (m: string, undo?: () => void) => live.current.toast(m, undo ? { undo } : undefined);
    const fail = (message: string) => {
      if (sheet.error !== message) dispatch({ type: 'updateSheet', id, patch: { error: message } });
      if (manual) say(message);
    };
    try {
      const text = await fetchSheetCsv(sheet.urls);
      const hash = hashText(text);
      // Nothing changed since the last time it was applied: nothing to do. (Pressing Sync now always looks again at the rows.)
      if (!manual && hash === sheet.hash && !sheet.error) return;

      const parsed = parseStatement(text);
      if (!parsed.rows.length) return fail(`I could not find any transactions in the sheet${parsed.warnings[0] ? `: ${parsed.warnings[0]}` : '.'} Your saved transactions were left as they are.`);
      const L = live.current;
      const before = L.state.txns.filter((t) => t.file === sheet.label);
      const res = syncRows(L.state.txns, parsed.rows, sheet.label);
      if (!manual && looksDestructive(before.length, res.removed)) {
        return fail(`The sheet now has far fewer rows (${before.length} before, ${res.rows.length} now), so I kept the old ones. If that is right, press Sync now.`);
      }
      const changed = res.added + res.removed > 0;
      const next: SheetLink = { ...sheet, hash, error: undefined, changedAt: changed ? new Date().toISOString() : sheet.changedAt };
      dispatch({ type: 'syncSheet', file: sheet.label, rows: res.rows, sheet: next });
      const kept = new Set(res.rows.map((r) => r.id));
      before.filter((t) => !kept.has(t.id)).forEach((t) => L.drafts.forget(t.id));
      if (changed) {
        const bits = [res.added ? `${res.added} new` : '', res.removed ? `${res.removed} removed` : ''].filter(Boolean).join(', ');
        // Undo puts the old rows back and remembers this version of the sheet, so the next look does not just bring the change back.
        say(`${sheet.label}: ${bits}.`, () => dispatch({ type: 'syncSheet', file: sheet.label, rows: before, sheet: { ...next, changedAt: sheet.changedAt } }));
      } else if (manual) say('Up to date. Nothing new in the sheet.');
    } catch (e) {
      fail(sheetMessage(e));
    } finally {
      inflight.current.delete(id);
      last.current[id] = Date.now();
      setChecking(new Set(inflight.current));
      setCheckedAt({ ...last.current });
    }
  }, [dispatch]);

  // Looks again while MyMoney is open: now, every minute (when the last look is old enough), and when the tab or connection comes back.
  const ready = state.onboarded;
  useEffect(() => {
    if (!ready) return;
    const tick = (maxAge: number) => {
      if (document.visibilityState !== 'visible') return;
      for (const s of live.current.state.sheets ?? []) if (s.auto && Date.now() - (last.current[s.id] ?? 0) >= maxAge) void run(s.id, false);
    };
    tick(0);
    const timer = window.setInterval(() => tick(STALE), EVERY);
    const back = () => tick(SOON);
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    window.addEventListener('online', back);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', back); window.removeEventListener('focus', back); window.removeEventListener('online', back); };
  }, [ready, run]);

  const api = useMemo<SheetsApi>(() => ({
    checking,
    checkedAt,
    openConnect: () => setConnecting(true),
    syncNow: (id) => void run(id, true),
    setAuto: (id, auto) => { dispatch({ type: 'updateSheet', id, patch: { auto } }); live.current.toast(auto ? 'Automatic updates are on.' : 'Automatic updates are off. The transactions stay; press Sync now to update them.'); },
    disconnect: (id) => {
      const L = live.current;
      const sheet = L.state.sheets?.find((s) => s.id === id);
      if (!sheet) return;
      const rows = L.state.txns.filter((t) => t.file === sheet.label);
      rows.forEach((t) => L.drafts.forget(t.id));
      dispatch({ type: 'removeFile', file: sheet.label });
      dispatch({ type: 'removeSheet', id });
      L.toast(`Removed ${sheet.label} and its ${rows.length} transactions.`, { undo: () => dispatch({ type: 'syncSheet', file: sheet.label, rows, sheet }) });
    },
  }), [checking, checkedAt, dispatch, run]);

  const connect = (p: Preview, name: string, auto: boolean) => {
    const taken = (live.current.state.sheets ?? []).map((s) => s.label);
    const label = sheetLabel(name, taken);
    const sheet: SheetLink = { id: uid(), url: p.url, urls: p.urls, label, auto, hash: p.hash, changedAt: new Date().toISOString() };
    const res = syncRows(live.current.state.txns, p.rows, label);
    dispatch({ type: 'syncSheet', file: label, rows: res.rows, sheet });
    last.current[sheet.id] = Date.now();
    setCheckedAt({ ...last.current });
    setConnecting(false);
    const dup = res.duplicates ? ` ${res.duplicates} were already here from another file.` : '';
    live.current.toast(`Added ${res.rows.length} transactions from ${label}.${auto ? ' It updates by itself while MyMoney is open.' : ''}${dup}`, {
      undo: () => { dispatch({ type: 'removeFile', file: label }); dispatch({ type: 'removeSheet', id: sheet.id }); },
    });
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      {connecting && <ConnectDialog onClose={() => setConnecting(false)} onConnect={connect} />}
    </Ctx.Provider>
  );
}

/* ---------- The dialog: paste a link, see what is in the sheet, add it ---------- */

function ConnectDialog({ onClose, onConnect }: { onClose: () => void; onConnect: (p: Preview, name: string, auto: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [link, setLink] = useState('');
  const [name, setName] = useState('');
  const [auto, setAuto] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => { const d = ref.current; if (d && !d.open) { d.showModal(); dialogIn(d); } }, []);

  const look = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setPreview(null);
    const target = sheetTarget(link);
    if (!target.ok) return setError(target.error);
    setBusy(true);
    try {
      const text = await fetchSheetCsv(target.urls);
      const parsed = parseStatement(text);
      if (!parsed.rows.length) { setError(parsed.warnings[0] ?? 'I could not find transactions in that sheet. It needs a header row with a Date, a Description and an Amount (or Debit and Credit).'); return; }
      setPreview({ url: link.trim(), urls: target.urls, hash: hashText(text), rows: parsed.rows, warnings: parsed.warnings, notes: parsed.notes });
    } catch (err) {
      setError(sheetMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const dates = preview ? preview.rows.map((r) => r.date).sort() : [];
  const moneyIn = preview ? preview.rows.filter((r) => r.type === 'income').reduce((a, r) => a + r.amount, 0) : 0;
  const moneyOut = preview ? preview.rows.filter((r) => r.type === 'expense').reduce((a, r) => a + r.amount, 0) : 0;
  const sample = preview ? [...preview.rows].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3) : [];

  return (
    <dialog ref={ref} className="modal sheet-dialog" aria-labelledby="sheet-title" onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <form className="modal-body" onSubmit={look}>
        <h2 id="sheet-title">Add from Google Sheets</h2>
        <ol className="sheet-steps sub">
          <li>In Google Sheets, press <b>Share</b> and set General access to <b>Anyone with the link</b> (Viewer).</li>
          <li>Copy the link and paste it here.</li>
        </ol>
        <p className="sub">Your sheet needs a header row with <b>Date</b>, <b>Description</b> and <b>Amount</b> (or <b>Debit</b> and <b>Credit</b>). To avoid any guessing about money in and out, add a <b>Type</b> column (Income or Expense) or use Debit and Credit columns. Keep each column to one kind of value, and put the transactions on their own tab.</p>
        <label className="field">
          <span>Link to the sheet</span>
          <input type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" autoFocus placeholder="https://docs.google.com/spreadsheets/d/..." value={link} onChange={(e) => { setLink(e.target.value); setPreview(null); setError(null); }} />
        </label>
        {error && <p className="sheet-error" role="alert">{error}</p>}

        {preview && (
          <div className="sheet-preview" role="status">
            <b>Found {preview.rows.length} {preview.rows.length === 1 ? 'transaction' : 'transactions'}</b>
            <span className="sub">{dates[0]} to {dates[dates.length - 1]} &middot; {inr(moneyIn)} in &middot; {inr(moneyOut)} out</span>
            <ul className="clean sheet-sample">
              {sample.map((r) => <li key={r.id}><span>{r.date}</span><span className="title">{r.description}</span><span className={r.type === 'income' ? 'in' : ''}>{r.type === 'income' ? '+' : '-'}{inr(r.amount)}</span></li>)}
            </ul>
            {[...preview.warnings, ...preview.notes].map((w) => <span key={w} className="sub">{w}</span>)}
            <label className="field">
              <span>Name</span>
              <input value={name} maxLength={40} placeholder="Expenses" onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="check"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />Check for changes automatically while MyMoney is open</label>
          </div>
        )}

        <p className="field-note">Anyone who has this link can read the sheet, so do not put anything in it you would not want a stranger who finds the link to see. MyMoney reads it straight from your device to Google; no MyMoney server is involved.</p>

        <div className="modal-actions">
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          {preview
            ? <button className="btn primary" type="button" onClick={() => onConnect(preview, name || 'Expenses', auto)}>Add {preview.rows.length} {preview.rows.length === 1 ? 'transaction' : 'transactions'}</button>
            : <button className="btn primary" type="submit" disabled={busy || !link.trim()}>{busy ? 'Checking...' : 'Check the sheet'}</button>}
        </div>
      </form>
    </dialog>
  );
}

/* ---------- The list under the import card ---------- */

const ago = (ms: number): string => {
  const m = Math.floor((Date.now() - ms) / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`;
};

export function SheetList() {
  const { state } = useStore();
  const api = useSheets();
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 30_000); return () => window.clearInterval(t); }, []);
  const sheets = state.sheets ?? [];
  if (!sheets.length) return null;
  return (
    <ul className="clean files sheets" aria-label="Connected Google Sheets">
      {sheets.map((s) => {
        const count = state.txns.filter((t) => t.file === s.label).length;
        const busy = api.checking.has(s.id);
        const at = api.checkedAt[s.id];
        return (
          <li key={s.id}>
            <Icon name="table" size={18} />
            <div className="file-info">
              <b>{s.label}</b>
              <span className="sub">
                {count} transactions &middot; {busy ? 'checking...' : at ? `checked ${ago(at)}` : s.changedAt ? `updated ${ago(Date.parse(s.changedAt))}` : 'not checked yet'} &middot; {s.auto ? 'updates by itself while MyMoney is open' : 'automatic updates are off'}
              </span>
              {s.error && <span className="sheet-error" role="status">{s.error}</span>}
            </div>
            <div className="sheet-actions">
              <button className="btn small" disabled={busy} aria-label={`Sync ${s.label} now`} onClick={() => api.syncNow(s.id)}>Sync now</button>
              <label className="check small"><input type="checkbox" checked={s.auto} aria-label={`Update ${s.label} automatically`} onChange={(e) => api.setAuto(s.id, e.target.checked)} />Auto</label>
              <button className="btn small danger" aria-label={`Remove ${s.label}`} onClick={() => api.disconnect(s.id)}><Icon name="trash" size={16} />Remove</button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

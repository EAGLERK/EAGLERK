import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { parseStatement } from '../engine/csv';
import { hashText, looksDestructive, monthOfTab, sheetLabel, sheetTarget, spreadsheetId, splitTabNames, syncRows, tabTarget } from '../engine/sheets';
import type { SheetLink, Txn } from '../engine/types';
import { money, uid, moneyExact } from '../lib/format';
import { dateOrderFor } from '../lib/region';
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

/** One tab (or the one sheet) as read in the dialog, before anything is added. */
interface Preview { url: string; urls: string[]; hash: string; rows: Txn[]; warnings: string[]; notes: string[]; tab?: string; error?: string; outside?: number }
/** What a connection adds: every tab read, and who they belong to when it is one more tab of a spreadsheet already connected. */
interface Adding { previews: Preview[]; title: string; auto: boolean; spreadsheet?: string; group?: string }

interface SheetsApi {
  checking: ReadonlySet<string>;
  /** When each sheet was last looked at (ms), this session. */
  checkedAt: Readonly<Record<string, number>>;
  openConnect(): void;
  /** Opens the dialog to add more tabs to a spreadsheet that is already connected. */
  openAddTabs(group: string): void;
  syncNow(id: string): void;
  setAuto(id: string, auto: boolean): void;
  disconnect(id: string): void;
  disconnectGroup(group: string): void;
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
  const [connecting, setConnecting] = useState<null | { group?: string }>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
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

      const parsed = parseStatement(text, { dateOrder: dateOrderFor(live.current.state.profile.country), defaultYear: sheet.tab ? monthOfTab(sheet.tab)?.year : undefined });
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

  /** Looks at sheets one after another, with a short pause so the screen has taken the last change before the next tab reads the data. */
  const queued = useCallback((id: string, manual: boolean) => {
    chain.current = chain.current.then(() => run(id, manual)).then(() => new Promise<void>((r) => setTimeout(r, 40))).catch(() => undefined);
  }, [run]);

  // Looks again while MyMoney is open: now, every minute (when the last look is old enough), and when the tab or connection comes back.
  const ready = state.onboarded;
  useEffect(() => {
    if (!ready) return;
    const tick = (maxAge: number) => {
      if (document.visibilityState !== 'visible') return;
      for (const s of live.current.state.sheets ?? []) if (s.auto && Date.now() - (last.current[s.id] ?? 0) >= maxAge) queued(s.id, false);
    };
    tick(0);
    const timer = window.setInterval(() => tick(STALE), EVERY);
    const back = () => tick(SOON);
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    window.addEventListener('online', back);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', back); window.removeEventListener('focus', back); window.removeEventListener('online', back); };
  }, [ready, queued]);

  const api = useMemo<SheetsApi>(() => ({
    checking,
    checkedAt,
    openConnect: () => setConnecting({}),
    openAddTabs: (group) => setConnecting({ group }),
    syncNow: (id) => queued(id, true),
    setAuto: (id, auto) => { dispatch({ type: 'updateSheet', id, patch: { auto } }); live.current.toast(auto ? 'Automatic updates are on.' : 'Automatic updates are off. The transactions stay; press Sync now to update them.'); },
    disconnectGroup: (group) => {
      const L = live.current;
      const parts = (L.state.sheets ?? []).filter((s) => s.group === group);
      if (!parts.length) return;
      const saved = parts.map((s) => ({ sheet: s, rows: L.state.txns.filter((t) => t.file === s.label) }));
      saved.forEach(({ sheet, rows }) => { rows.forEach((t) => L.drafts.forget(t.id)); dispatch({ type: 'removeFile', file: sheet.label }); dispatch({ type: 'removeSheet', id: sheet.id }); });
      const n = saved.reduce((a, x) => a + x.rows.length, 0);
      L.toast(`Removed ${parts[0].title ?? 'the spreadsheet'} (${parts.length} tabs) and its ${n} transactions.`, { undo: () => saved.forEach(({ sheet, rows }) => dispatch({ type: 'syncSheet', file: sheet.label, rows, sheet })) });
    },
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
  }), [checking, checkedAt, dispatch, queued]);

  const connect = (add: Adding) => {
    const L = live.current;
    const taken = (L.state.sheets ?? []).map((s) => s.label);
    const multi = add.previews.length > 1 || add.previews[0]?.tab !== undefined;
    const group = multi ? (add.group ?? uid()) : undefined;
    let held = [...L.state.txns]; // rows as they will be after each tab goes in, so the same transaction in two tabs is kept once
    const made: Array<{ sheet: SheetLink; rows: Txn[] }> = [];
    let dup = 0;
    for (const p of add.previews) {
      const label = sheetLabel(p.tab ? `${add.title} · ${p.tab}` : add.title, taken);
      taken.push(label);
      const res = syncRows(held, p.rows, label);
      held = [...held.filter((t) => t.file !== label), ...res.rows];
      dup += res.duplicates;
      const sheet: SheetLink = { id: uid(), url: p.url, urls: p.urls, label, auto: add.auto, hash: p.hash, changedAt: new Date().toISOString(), ...(multi ? { group, tab: p.tab, spreadsheet: add.spreadsheet, title: add.title } : {}) };
      made.push({ sheet, rows: res.rows });
      dispatch({ type: 'syncSheet', file: label, rows: res.rows, sheet });
      last.current[sheet.id] = Date.now();
    }
    setCheckedAt({ ...last.current });
    setConnecting(null);
    const total = made.reduce((a, m) => a + m.rows.length, 0);
    const where = multi ? `${add.title} (${made.length} ${made.length === 1 ? 'tab' : 'tabs'})` : made[0].sheet.label;
    const dupNote = dup ? ` ${dup} were already here from another file or tab.` : '';
    L.toast(`Added ${total} transactions from ${where}.${add.auto ? ' It updates by itself while MyMoney is open.' : ''}${dupNote}`, {
      undo: () => made.forEach(({ sheet }) => { dispatch({ type: 'removeFile', file: sheet.label }); dispatch({ type: 'removeSheet', id: sheet.id }); }),
    });
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      {connecting && <ConnectDialog addTo={connecting.group} onClose={() => setConnecting(null)} onConnect={connect} />}
    </Ctx.Provider>
  );
}

/* ---------- The dialog: paste a link, see what is in the sheet (or in each month's tab), add it ---------- */

const MAX_TABS = 24;

function ConnectDialog({ addTo, onClose, onConnect }: { addTo?: string; onClose: () => void; onConnect: (a: Adding) => void }) {
  const { state } = useStore();
  const existing = addTo ? (state.sheets ?? []).filter((s) => s.group === addTo) : [];
  const ref = useRef<HTMLDialogElement>(null);
  const [link, setLink] = useState('');
  const [mode, setMode] = useState<'one' | 'several'>(addTo ? 'several' : 'one');
  const [tabText, setTabText] = useState('');
  const [title, setTitle] = useState(existing[0]?.title ?? '');
  const [auto, setAuto] = useState(existing[0]?.auto ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Preview[] | null>(null);
  const [sheetId, setSheetId] = useState<string | undefined>(existing[0]?.spreadsheet);

  useEffect(() => { const d = ref.current; if (d && !d.open) { d.showModal(); dialogIn(d); } }, []);
  const reset = () => { setPreviews(null); setError(null); };
  const order = dateOrderFor(state.profile.country);

  const readTab = async (id: string, name: string): Promise<Preview> => {
    const urls = tabTarget(id, name);
    const base = { url: `https://docs.google.com/spreadsheets/d/${id}`, urls, hash: '', rows: [] as Txn[], warnings: [] as string[], notes: [] as string[], tab: name };
    try {
      const text = await fetchSheetCsv(urls);
      const month = monthOfTab(name);
      const parsed = parseStatement(text, { dateOrder: order, defaultYear: month?.year });
      const hash = hashText(text);
      if (!parsed.rows.length) return { ...base, hash, error: parsed.warnings[0] ?? `I could not find transactions on the tab \u201c${name}\u201d. It needs a header row with a Date, a Description and an Amount.` };
      return { ...base, hash, rows: parsed.rows, warnings: parsed.warnings, notes: parsed.notes, outside: month ? parsed.rows.filter((r) => r.date.slice(0, 7) !== month.ym).length : undefined };
    } catch (err) {
      return { ...base, error: sheetMessage(err) };
    }
  };

  const look = async (e: FormEvent) => {
    e.preventDefault();
    reset();
    setBusy(true);
    try {
      if (mode === 'one') {
        const target = sheetTarget(link);
        if (!target.ok) return setError(target.error);
        const text = await fetchSheetCsv(target.urls);
        const parsed = parseStatement(text, { dateOrder: order });
        if (!parsed.rows.length) return setError(parsed.warnings[0] ?? 'I could not find transactions in that sheet. It needs a header row with a Date, a Description and an Amount (or Debit and Credit).');
        setPreviews([{ url: link.trim(), urls: target.urls, hash: hashText(text), rows: parsed.rows, warnings: parsed.warnings, notes: parsed.notes }]);
        return;
      }
      let id = sheetId;
      if (!addTo) {
        const s = spreadsheetId(link);
        if (!s.ok) return setError(s.error);
        id = s.id;
        setSheetId(id);
      }
      const have = new Set(existing.map((s) => (s.tab ?? '').toLowerCase()));
      const names = splitTabNames(tabText).filter((n) => !have.has(n.toLowerCase()));
      if (!names.length) return setError(addTo ? 'Type the names of the new tabs, one per line. The ones listed above are already connected.' : 'Type the tab names, one per line, exactly as they appear at the bottom of the sheet (for example Nov 2026).');
      if (names.length > MAX_TABS) return setError(`Add up to ${MAX_TABS} tabs at a time.`);
      const read = await Promise.all(names.map((n) => readTab(id!, n)));
      // If Google has no tab with a name it may show the first tab instead. Two tabs with identical content are almost certainly that, so say so.
      const firstSeen = new Map<string, string>();
      for (const x of existing) if (x.hash && x.tab) firstSeen.set(x.hash, x.tab);
      for (const p of read) {
        if (p.error || !p.hash) continue;
        const twin = firstSeen.get(p.hash);
        if (twin) p.error = `\u201c${p.tab}\u201d has exactly the same content as \u201c${twin}\u201d. Google may have shown another tab because it has no tab with this name. Check the spelling.`;
        else firstSeen.set(p.hash, p.tab!);
      }
      setPreviews(read);
      if (read.some((p) => p.error)) setError('Some tabs could not be read. Fix the names marked below, then check again.');
    } catch (err) {
      setError(sheetMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const good = previews?.filter((p) => !p.error) ?? [];
  const rows = good.flatMap((p) => p.rows);
  const dates = rows.map((r) => r.date).sort();
  const moneyIn = rows.filter((r) => r.type === 'income').reduce((a, r) => a + r.amount, 0);
  const moneyOut = rows.filter((r) => r.type === 'expense').reduce((a, r) => a + r.amount, 0);
  const several = previews !== null && previews.some((p) => p.tab !== undefined);
  const sample = !several ? [...rows].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3) : [];
  const ready = previews !== null && good.length > 0 && !previews.some((p) => p.error);
  const noun = (n: number) => `${n} ${n === 1 ? 'transaction' : 'transactions'}`;

  return (
    <dialog ref={ref} className="modal sheet-dialog" aria-labelledby="sheet-title" onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <form className="modal-body" onSubmit={look}>
        <h2 id="sheet-title">{addTo ? `Add tabs to ${existing[0]?.title ?? 'this spreadsheet'}` : 'Add from Google Sheets'}</h2>
        {!addTo && (
          <>
            <ol className="sheet-steps sub">
              <li>In Google Sheets, press <b>Share</b> and set General access to <b>Anyone with the link</b> (Viewer).</li>
              <li>Copy the link and paste it here.</li>
            </ol>
            <p className="sub">Your sheet needs a header row with <b>Date</b>, <b>Description</b> and <b>Amount</b> (or <b>Debit</b> and <b>Credit</b>). To avoid any guessing about money in and out, add a <b>Type</b> column (Income or Expense) or use Debit and Credit columns. Keep each column to one kind of value.</p>
            <label className="field">
              <span>Link to the sheet</span>
              <input type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" autoFocus placeholder="https://docs.google.com/spreadsheets/d/..." value={link} onChange={(e) => { setLink(e.target.value); reset(); }} />
            </label>
            <fieldset className="sheet-mode">
              <legend>Which tabs?</legend>
              <label className="check"><input type="radio" name="tabs" checked={mode === 'one'} onChange={() => { setMode('one'); reset(); }} />Just the tab in the link</label>
              <label className="check"><input type="radio" name="tabs" checked={mode === 'several'} onChange={() => { setMode('several'); reset(); }} />Several tabs, for example one per month</label>
            </fieldset>
          </>
        )}
        {addTo && existing.length > 0 && <p className="sub">Already connected: {existing.map((s) => s.tab).join(', ')}.</p>}
        {mode === 'several' && (
          <label className="field">
            <span>{addTo ? 'New tabs' : 'Tab names'}</span>
            <textarea rows={4} value={tabText} autoFocus={!!addTo} spellCheck={false} placeholder={'Nov 2026\nDec 2026'} onChange={(e) => { setTabText(e.target.value); reset(); }} />
            <span className="hint">One per line, written exactly as on the tabs at the bottom of the sheet. Each tab is kept as its own list, named after the tab. A tab named like &ldquo;Nov 2026&rdquo; also tells MyMoney the year for dates written as &ldquo;5 Nov&rdquo;.</span>
          </label>
        )}
        {error && <p className="sheet-error" role="alert">{error}</p>}

        {previews && (
          <div className="sheet-preview" role="status">
            {good.length > 0 && <b>Found {noun(rows.length)}{several ? ` in ${good.length} ${good.length === 1 ? 'tab' : 'tabs'}` : ''}</b>}
            {good.length > 0 && <span className="sub">{dates[0]} to {dates[dates.length - 1]} &middot; {money(moneyIn)} in &middot; {money(moneyOut)} out</span>}
            {several && (
              <ul className="clean sheet-tabs">
                {previews.map((p) => (
                  <li key={p.tab} className={p.error ? 'bad' : ''}>
                    <b>{p.tab}</b>
                    {p.error
                      ? <span>{p.error}</span>
                      : <span className="sub">{noun(p.rows.length)} &middot; {p.rows.map((r) => r.date).sort()[0]} to {p.rows.map((r) => r.date).sort().slice(-1)[0]}{p.outside ? ` · ${p.outside} dated outside this month` : ''}</span>}
                  </li>
                ))}
              </ul>
            )}
            {sample.length > 0 && (
              <ul className="clean sheet-sample">
                {sample.map((r) => <li key={r.id}><span>{r.date}</span><span className="title">{r.description}</span><span className={r.type === 'income' ? 'in' : ''}>{r.type === 'income' ? '+' : '-'}{moneyExact(r.amount)}</span></li>)}
              </ul>
            )}
            {[...new Set(good.flatMap((p) => [...p.warnings, ...p.notes]))].map((w) => <span key={w} className="sub">{w}</span>)}
            {!addTo && ready && (
              <label className="field">
                <span>Name</span>
                <input value={title} maxLength={40} placeholder="Expenses" onChange={(e) => setTitle(e.target.value)} />
              </label>
            )}
            {!addTo && ready && <label className="check"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />Check for changes automatically while MyMoney is open</label>}
          </div>
        )}

        <p className="field-note">Anyone who has this link can read the sheet, so do not put anything in it you would not want a stranger who finds the link to see. MyMoney reads it straight from your device to Google; no MyMoney server is involved.</p>

        <div className="modal-actions">
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          {ready
            ? <button className="btn primary" type="button" onClick={() => onConnect({ previews: good, title: title || existing[0]?.title || 'Expenses', auto, spreadsheet: sheetId, group: addTo })}>Add {noun(rows.length)}{several ? ` from ${good.length} ${good.length === 1 ? 'tab' : 'tabs'}` : ''}</button>
            : <button className="btn primary" type="submit" disabled={busy || (!addTo && !link.trim()) || (mode === 'several' && !tabText.trim())}>{busy ? 'Checking...' : previews ? 'Check again' : mode === 'several' ? 'Check the tabs' : 'Check the sheet'}</button>}
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

  const row = (s: SheetLink, nested: boolean) => {
    const count = state.txns.filter((t) => t.file === s.label).length;
    const busy = api.checking.has(s.id);
    const at = api.checkedAt[s.id];
    return (
      <li key={s.id} className={nested ? 'sheet-tab' : undefined}>
        <Icon name="table" size={18} />
        <div className="file-info">
          <b>{nested ? s.tab : s.label}</b>
          <span className="sub">
            {count} {count === 1 ? 'transaction' : 'transactions'} &middot; {busy ? 'checking...' : at ? `checked ${ago(at)}` : s.changedAt ? `updated ${ago(Date.parse(s.changedAt))}` : 'not checked yet'}{nested ? '' : <> &middot; {s.auto ? 'updates by itself while MyMoney is open' : 'automatic updates are off'}</>}
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
  };

  // Tabs of one spreadsheet sit together under its name; a sheet connected on its own is a single row.
  const seen = new Set<string>();
  const out: ReactNode[] = [];
  for (const s of sheets) {
    if (!s.group) { out.push(row(s, false)); continue; }
    if (seen.has(s.group)) continue;
    seen.add(s.group);
    const parts = sheets.filter((x) => x.group === s.group);
    const total = parts.reduce((a, x) => a + state.txns.filter((t) => t.file === x.label).length, 0);
    out.push(
      <li key={`g-${s.group}`} className="sheet-group">
        <Icon name="table" size={18} />
        <div className="file-info">
          <b>Google Sheet &middot; {s.title}</b>
          <span className="sub">{parts.length} {parts.length === 1 ? 'tab' : 'tabs'} &middot; {total} {total === 1 ? 'transaction' : 'transactions'}</span>
        </div>
        <div className="sheet-actions">
          <button className="btn small" aria-label={`Add tabs to ${s.title}`} onClick={() => api.openAddTabs(s.group!)}>Add tabs</button>
          <button className="btn small danger" aria-label={`Remove all of ${s.title}`} onClick={() => api.disconnectGroup(s.group!)}><Icon name="trash" size={16} />Remove all</button>
        </div>
      </li>,
      ...parts.map((x) => row(x, true)),
    );
  }
  return <ul className="clean files sheets" aria-label="Connected Google Sheets">{out}</ul>;
}

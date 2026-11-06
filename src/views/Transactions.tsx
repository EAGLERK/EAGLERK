import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_CATEGORIES, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../engine/categories';
import { categorize } from '../engine/categorize';
import { monthsWithData } from '../engine/cashflow';
import { readStatementFile } from '../engine/statementFile';
import { dateOrderFor, isIndia, moneyContext } from '../lib/region';
import { SheetList, useSheets } from '../components/Sheets';
import type { Txn } from '../engine/types';
import { Icon } from '../components/icons';
import { Callout, Card, Field, Num } from '../components/ui';
import { rowProblem, useDrafts } from '../components/Drafts';
import { useConfirm, useToast } from '../components/feedback';
import { money, monthLabel, todayISO, uid, cur, moneyExact } from '../lib/format';
import { useStore } from '../store';

const PAGE = 100;

/** Opens the browser's calendar when the date box is clicked (browsers otherwise open it only from the small icon). */
const openCalendar = (e: { currentTarget: HTMLInputElement }) => {
  try { e.currentTarget.showPicker?.(); } catch { /* not allowed right now: the box still works by typing */ }
};

type RowStatus = 'new' | 'edited' | 'saved';

export function Transactions({ openAdd = false, onCloseAdd }: { openAdd?: boolean; onCloseAdd?: () => void }) {
  const { state, dispatch } = useStore();
  const drafts = useDrafts();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [month, setMonth] = useState('all');
  const [category, setCategory] = useState('all');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [adding, setAdding] = useState(openAdd);
  const months = useMemo(() => monthsWithData(state.txns).reverse(), [state.txns]);

  useEffect(() => {
    if (openAdd) setAdding(true);
  }, [openAdd]);

  // Saved rows with their unsaved edits applied, filtered; new unsaved rows are pinned above them so they are never hidden by a filter.
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return state.txns
      .map((t) => (drafts.edits[t.id] ? { ...t, ...drafts.edits[t.id] } : t))
      .filter((t) => (month === 'all' || t.date.startsWith(month)) && (category === 'all' || t.category === category) && (!needle || t.description.toLowerCase().includes(needle)))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [state.txns, drafts.edits, month, category, q]);
  const pinned = useMemo(() => [...drafts.added].sort((a, b) => b.date.localeCompare(a.date)), [drafts.added]);
  const list = useMemo(() => [...pinned.map((t) => ({ t, status: 'new' as RowStatus })), ...rows.map((t) => ({ t, status: (drafts.edits[t.id] ? 'edited' : 'saved') as RowStatus }))], [pinned, rows, drafts.edits]);

  const filtered = month !== 'all' || category !== 'all' || q.trim() !== '';
  const totals = rows.reduce((a, t) => ({ in: a.in + (t.type === 'income' ? t.amount : 0), out: a.out + (t.type === 'expense' ? t.amount : 0) }), { in: 0, out: 0 });

  const closeAdd = () => {
    setAdding(false);
    onCloseAdd?.();
  };

  const remove = (t: Txn, status: RowStatus) => {
    if (status === 'new') { drafts.dropAdded([t.id]); return; }
    const original = state.txns.find((x) => x.id === t.id) ?? t;
    drafts.forget(t.id);
    dispatch({ type: 'deleteTxn', id: t.id });
    toast('Transaction deleted', { undo: () => dispatch({ type: 'addTxns', txns: [original] }) });
  };

  const removeAll = async () => {
    const n = state.txns.length;
    const ok = await confirm({
      title: `Delete all ${n} transactions?`,
      body: 'Every transaction is removed from your data. This cannot be undone. Download a backup from Settings first if you might want them back.',
      confirmLabel: `Delete ${n} transactions`,
      danger: true,
    });
    if (!ok) return;
    dispatch({ type: 'clearTxns' });
    toast(`Deleted ${n} transactions`);
  };

  const shown = list.slice(0, limit);
  const unsavedNote = drafts.added.length ? ` · ${drafts.added.length} not saved yet` : '';

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Transactions</h1>
          <div className="sub">Everything you earned and spent, from statements or added by hand</div>
        </div>
        {/* One primary action per screen: while there are unsaved changes, Save changes is the primary one. */}
        <button className={`btn ${drafts.dirty ? '' : 'primary'}`} aria-expanded={adding} onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} />Add transaction
        </button>
      </div>

      {adding && <AddForm onDone={closeAdd} />}
      <ImportCard />

      <Card
        title="All transactions"
        sub={`${rows.length} shown${unsavedNote} · in ${money(totals.in)} · out ${money(totals.out)}`}
      >
        <div className="form-grid filters" style={{ marginBottom: 12 }}>
          <Field label="Month"><select value={month} onChange={(e) => { setMonth(e.target.value); setLimit(PAGE); }}><option value="all">All months</option>{months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></Field>
          <Field label="Category"><select value={category} onChange={(e) => { setCategory(e.target.value); setLimit(PAGE); }}><option value="all">All categories</option>{DEFAULT_CATEGORIES.map((c) => <option key={c.name}>{c.name}</option>)}</select></Field>
          <Field label="Search"><input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="swiggy, rent, ..." /></Field>
        </div>

        {list.length === 0 ? (
          <div className="empty-cta">
            <p className="sub">{filtered ? 'No transactions match these filters.' : 'No transactions yet. Add one with the button above, or import a bank statement.'}</p>
            {filtered && <button className="btn" onClick={() => { setMonth('all'); setCategory('all'); setQ(''); }}>Clear filters</button>}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table cards txn editable">
              <thead><tr><th>Date</th><th>Description</th><th>Category</th><th className="r">Amount</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {shown.map(({ t, status }) => <TxnRow key={t.id} t={t} status={status} onDelete={() => remove(t, status)} />)}
              </tbody>
            </table>
            {list.length > limit && <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}><button className="btn" onClick={() => setLimit(limit + PAGE)}>Show {Math.min(PAGE, list.length - limit)} more</button></div>}
          </div>
        )}
        {state.txns.length > 0 && (
          <div className="card-foot">
            <span className="sub">Starting over? This removes every transaction, not just the ones shown.</span>
            <button className="btn small danger" onClick={removeAll}><Icon name="trash" size={16} />Delete all</button>
          </div>
        )}
      </Card>

      {drafts.dirty && <SaveBar />}
    </div>
  );
}

/** Appears whenever there is anything unsaved. */
function SaveBar() {
  const drafts = useDrafts();
  const edited = Object.keys(drafts.edits).length;
  const bits = [drafts.added.length ? `${drafts.added.length} new` : '', edited ? `${edited} changed` : ''].filter(Boolean).join(' and ');
  return (
    <div className="savebar" role="region" aria-label="Unsaved changes">
      <div className="savebar-text">
        <b>{drafts.count} unsaved {drafts.count === 1 ? 'change' : 'changes'}</b>
        <span className="sub">{bits}. Highlighted rows are not saved yet.</span>
        {drafts.invalid > 0 && <span className="why bad" role="status">{drafts.invalid} {drafts.invalid === 1 ? 'row needs' : 'rows need'} a valid date and an amount above 0 before saving.</span>}
      </div>
      <div className="row">
        <button className="btn" onClick={drafts.discard}>Discard</button>
        <button className="btn primary" disabled={drafts.invalid > 0} onClick={() => drafts.save()}>Save changes</button>
      </div>
    </div>
  );
}

function TxnRow({ t, status, onDelete }: { t: Txn; status: RowStatus; onDelete: () => void }) {
  const drafts = useDrafts();
  const bad = rowProblem(t);
  const dateBad = bad === 'a valid date';
  const amountBad = bad === 'an amount above 0';
  const label = t.description || 'this transaction';
  const flip = () => {
    const type = t.type === 'income' ? 'expense' : 'income';
    drafts.edit(t.id, { type, category: categorize(t.description, type) });
  };
  return (
    <tr className={status === 'saved' ? undefined : 'unsaved'}>
      <td data-label="Date">
        {status !== 'saved' && <span className="sr-only">{status === 'new' ? 'Unsaved new transaction. ' : 'Unsaved change. '}</span>}
        <input className="cell-input num" type="date" aria-label={`Date for ${label}`} aria-invalid={dateBad || undefined} value={t.date} onClick={openCalendar} onChange={(e) => drafts.edit(t.id, { date: e.target.value })} />
      </td>
      <td className="title">
        <input className="cell-input" aria-label={`Description for ${label}`} value={t.description} placeholder="Description" onChange={(e) => drafts.edit(t.id, { description: e.target.value })} />
      </td>
      <td data-label="Category">
        <select className="inline-input cell-input" aria-label={`Category for ${label}`} value={t.category} onChange={(e) => drafts.edit(t.id, { category: e.target.value })}>
          {(t.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => <option key={c}>{c}</option>)}
        </select>
      </td>
      <td data-label="Amount" className="r">
        <div className={`amt ${t.type === 'income' ? 'good' : ''}`}>
          <button type="button" className="sign" aria-label={t.type === 'income' ? `Money in for ${label}. Change to money out` : `Money out for ${label}. Change to money in`} title={t.type === 'income' ? 'Money in. Click to change to money out.' : 'Money out. Click to change to money in.'} onClick={flip}>{t.type === 'income' ? '+' : '\u2212'}</button>
          <input className="cell-input num" type="number" inputMode="decimal" min={0} step="0.01" aria-label={`Amount for ${label}`} aria-invalid={amountBad || undefined} value={t.amount ? t.amount : ''} placeholder="0.00" onChange={(e) => drafts.edit(t.id, { amount: e.target.value === '' ? 0 : Number(e.target.value) })} />
        </div>
      </td>
      <td className="actions">
        <button className="btn icon small ghost" aria-label={`Delete ${label}`} title="Delete" onClick={onDelete}><Icon name="trash" size={18} /><span className="icon-label">Delete</span></button>
      </td>
    </tr>
  );
}

function AddForm({ onDone }: { onDone: () => void }) {
  const drafts = useDrafts();
  const { toast } = useToast();
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [date, setDate] = useState(todayISO());
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState(0);
  const [cat, setCat] = useState('');
  const auto = categorize(desc, type);
  const chosen = cat && (type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).includes(cat) ? cat : auto;
  const missing = !amount ? 'Enter an amount to add it.' : !date ? 'Choose a date to add it.' : null;

  const add = () => {
    const t: Txn = { id: uid(), date, description: desc || chosen, amount, type, category: chosen, source: 'manual' };
    drafts.stage([t]);
    toast(`${type === 'income' ? 'Income' : 'Expense'} of ${moneyExact(amount)} added to the list. Press Save changes to keep it.`);
    onDone();
  };

  return (
    <Card title="New transaction" sub="Fields marked * are required. It is added to the list below and kept when you press Save changes.">
      <form onSubmit={(e) => { e.preventDefault(); if (!missing) add(); }}>
        <div className="form-grid">
          <Field label="Type"><select value={type} onChange={(e) => { setType(e.target.value as 'income' | 'expense'); setCat(''); }}><option value="expense">Expense</option><option value="income">Income</option></select></Field>
          <Field label="Date" required><input type="date" value={date} max={todayISO()} onClick={openCalendar} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Description"><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={isIndia(moneyContext().country) ? 'UPI-Swiggy, Salary, ...' : 'Coffee shop, Salary, ...'} /></Field>
          <Num label={`Amount (${cur()})`} value={amount} onChange={setAmount} min={0} required />
          <Field label="Category" hint={cat ? undefined : 'Picked from the description'}>
            <select value={chosen} onChange={(e) => setCat(e.target.value)}>{(type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => <option key={c}>{c}</option>)}</select>
          </Field>
        </div>
        <div className="form-actions">
          <button className={`btn ${drafts.dirty ? '' : 'primary'}`} type="submit" disabled={!!missing}>Add to list</button>
          <button className="btn" type="button" onClick={onDone}>Cancel</button>
          {missing && <span className="why" role="status">{missing}</span>}
        </div>
      </form>
    </Card>
  );
}

function ImportCard() {
  const { state, dispatch } = useStore();
  const drafts = useDrafts();
  const { toast } = useToast();
  const picker = useRef<HTMLInputElement>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const sheets = useSheets();

  // Every imported file, with how many rows it brought and the dates they cover.
  const files = useMemo(() => {
    const by = new Map<string, { count: number; from: string; to: string; unsaved: number }>();
    const add = (t: Txn, unsaved: boolean) => {
      if (!t.file) return;
      const f = by.get(t.file) ?? { count: 0, from: t.date, to: t.date, unsaved: 0 };
      f.count += 1;
      if (unsaved) f.unsaved += 1;
      if (t.date < f.from) f.from = t.date;
      if (t.date > f.to) f.to = t.date;
      by.set(t.file, f);
    };
    state.txns.forEach((t) => add(t, false));
    drafts.added.forEach((t) => add(t, true));
    // Files that belong to a connected Google Sheet are listed (with their sync controls) in their own list.
    const sheetFiles = new Set((state.sheets ?? []).map((s) => s.label));
    return [...by.entries()].filter(([name]) => !sheetFiles.has(name));
  }, [state.txns, state.sheets, drafts.added]);

  const importFile = async (f: File) => {
    setWarning(null);
    setNotes([]);
    const result = await readStatementFile(f, { dateOrder: dateOrderFor(state.profile.country) });
    if (!result.rows.length) {
      setWarning(result.warnings[0] ?? `Nothing could be read from ${f.name}.`);
      return;
    }
    const have = new Set([...state.txns, ...drafts.added].map((t) => t.id));
    const fresh = result.rows.filter((r) => !have.has(r.id)).map((r) => ({ ...r, file: f.name }));
    if (!fresh.length) {
      toast(`Nothing new: all ${result.rows.length} rows in ${f.name} are already here.`);
      return;
    }
    drafts.stage(fresh);
    const already = result.rows.length - fresh.length;
    toast(`Read ${fresh.length} transactions from ${f.name}${already ? `, ${already} were already here` : ''}. Check them, fix anything that is off, then press Save changes.`);
    if (result.warnings.length) setWarning(result.warnings.join(' '));
    setNotes(result.notes);
  };

  const remove = (name: string) => {
    const unsaved = drafts.added.filter((t) => t.file === name);
    if (unsaved.length) {
      drafts.dropAdded(unsaved.map((t) => t.id));
      toast(`Dropped ${unsaved.length} unsaved transactions from ${name}.`);
      return;
    }
    const gone = state.txns.filter((t) => t.file === name);
    dispatch({ type: 'removeFile', file: name });
    toast(`Removed ${gone.length} transactions from ${name}.`, { undo: () => dispatch({ type: 'addTxns', txns: gone }) });
  };

  return (
    <Card
      title="Import a bank statement"
      sub={(
        <>
          <div>Works with CSV and Excel statements from any bank, or a Google Sheet that keeps itself up to date. I work out the columns myself.</div>
          <details>
            <summary>Why not connect my bank account directly?</summary>
            <div className="stack sub" style={{ marginTop: 8 }}>
              <p>Connecting to a bank means going through a regulated provider: open-banking aggregators in the UK and Europe, data aggregators in the US, the Account Aggregator framework in India, and similar schemes elsewhere. They need agreements, security audits and a server, and a personal app cannot do that on its own.</p>
              <p>So this app does not pretend to. Download a statement from your bank each month (CSV or Excel), or keep your transactions in a Google Sheet, and bring them in here. Re-importing the same file will not create duplicates.</p>
              <p>Live sync could be added later by putting an aggregator behind a small backend and feeding its output into the same import used here.</p>
            </div>
          </details>
        </>
      )}
      right={(
        <>
          <input
            ref={picker}
            hidden
            type="file"
            aria-label="Choose a statement file"
            accept=".csv,.tsv,.txt,.xlsx,.xls,.htm,.html,.pdf,text/csv,text/plain"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importFile(f); }}
          />
          <button className="btn small" onClick={() => picker.current?.click()}><Icon name="upload" size={16} />Import</button>
          <button className="btn small" onClick={sheets.openConnect}><Icon name="table" size={16} />Google Sheet</button>
        </>
      )}
    >
      {warning && <Callout tone="watch">{warning}</Callout>}
      <SheetList />
      {notes.length > 0 && <Callout tone="info"><span>{notes.join(' ')}</span></Callout>}
      {files.length > 0 && (
        <ul className="clean files" aria-label="Imported files">
          {files.map(([name, f]) => (
            <li key={name}>
              <Icon name="file" size={18} />
              <div className="file-info">
                <b>{name}</b>
                <span className="sub">{f.count} transactions &middot; {f.from} to {f.to}{f.unsaved > 0 && <> &middot; <b className="unsaved-tag">{f.unsaved === f.count ? 'not saved yet' : `${f.unsaved} not saved yet`}</b></>}</span>
              </div>
              <button className="btn small danger" aria-label={`Remove ${name}`} onClick={() => remove(name)}><Icon name="trash" size={16} />Remove</button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

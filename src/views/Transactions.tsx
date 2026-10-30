import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_CATEGORIES, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../engine/categories';
import { categorize } from '../engine/categorize';
import { monthsWithData } from '../engine/cashflow';
import { parseStatement, type CsvResult } from '../engine/csv';
import type { Txn } from '../engine/types';
import { Icon } from '../components/icons';
import { Badge, Callout, Card, Field, Num } from '../components/ui';
import { useConfirm, useToast } from '../components/feedback';
import { inr, monthLabel, todayISO, uid } from '../lib/format';
import { useStore } from '../store';

const PAGE = 100;

export function Transactions({ openAdd = false, onCloseAdd }: { openAdd?: boolean; onCloseAdd?: () => void }) {
  const { state, dispatch } = useStore();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [month, setMonth] = useState('all');
  const [category, setCategory] = useState('all');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [adding, setAdding] = useState(openAdd);
  const [importPending, setImportPending] = useState(false);
  const months = useMemo(() => monthsWithData(state.txns).reverse(), [state.txns]);

  useEffect(() => {
    if (openAdd) setAdding(true);
  }, [openAdd]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return state.txns
      .filter((t) => (month === 'all' || t.date.startsWith(month)) && (category === 'all' || t.category === category) && (!needle || t.description.toLowerCase().includes(needle)))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [state.txns, month, category, q]);

  const filtered = month !== 'all' || category !== 'all' || q.trim() !== '';
  const totals = rows.reduce((a, t) => ({ in: a.in + (t.type === 'income' ? t.amount : 0), out: a.out + (t.type === 'expense' ? t.amount : 0) }), { in: 0, out: 0 });

  const closeAdd = () => {
    setAdding(false);
    onCloseAdd?.();
  };

  const remove = (t: Txn) => {
    dispatch({ type: 'deleteTxn', id: t.id });
    toast('Transaction deleted', { undo: () => dispatch({ type: 'addTxns', txns: [t] }) });
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

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Transactions</h1>
          <div className="sub">Everything you earned and spent, from statements or added by hand</div>
        </div>
        {/* One primary action per screen: while an import is waiting to be confirmed, that becomes the primary one. */}
        <button className={`btn ${importPending ? '' : 'primary'}`} aria-expanded={adding} onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} />Add transaction
        </button>
      </div>

      {adding && <AddForm onDone={closeAdd} />}
      <ImportCard defaultOpen={state.txns.length === 0} onPending={setImportPending} />

      <Card
        title="All transactions"
        sub={`${rows.length} shown · in ${inr(totals.in)} · out ${inr(totals.out)}`}
        right={state.txns.length > 0 && (
          <button className="btn small danger" onClick={removeAll}><Icon name="trash" size={16} />Delete all</button>
        )}
      >
        <div className="form-grid" style={{ marginBottom: 12 }}>
          <Field label="Month"><select value={month} onChange={(e) => { setMonth(e.target.value); setLimit(PAGE); }}><option value="all">All months</option>{months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></Field>
          <Field label="Category"><select value={category} onChange={(e) => { setCategory(e.target.value); setLimit(PAGE); }}><option value="all">All categories</option>{DEFAULT_CATEGORIES.map((c) => <option key={c.name}>{c.name}</option>)}</select></Field>
          <Field label="Search"><input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="swiggy, rent, ..." /></Field>
        </div>

        {rows.length === 0 ? (
          <div className="empty-cta">
            <p className="sub">{filtered ? 'No transactions match these filters.' : 'No transactions yet. Add one with the button above, or import a bank statement.'}</p>
            {filtered && <button className="btn" onClick={() => { setMonth('all'); setCategory('all'); setQ(''); }}>Clear filters</button>}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table cards txn">
              <thead><tr><th>Date</th><th>Description</th><th>Category</th><th className="r">Amount</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {rows.slice(0, limit).map((t) => (
                  <tr key={t.id}>
                    <td data-label="Date" className="num" style={{ whiteSpace: 'nowrap' }}>{t.date}</td>
                    <td className="title" style={{ maxWidth: 360, overflowWrap: 'anywhere' }}>{t.description}</td>
                    <td data-label="Category">
                      <select className="inline-input" aria-label={`Category for ${t.description}`} value={t.category} onChange={(e) => dispatch({ type: 'updateTxn', id: t.id, patch: { category: e.target.value } })}>
                        {(t.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </td>
                    <td data-label="Amount" className={`r num ${t.type === 'income' ? 'good' : ''}`} style={{ whiteSpace: 'nowrap' }}>{t.type === 'income' ? '+' : '-'}{inr(t.amount)}</td>
                    <td className="actions">
                      <button className="btn icon small ghost" aria-label={`Delete ${t.description}`} title="Delete" onClick={() => remove(t)}><Icon name="trash" size={18} /><span className="icon-label">Delete</span></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > limit && <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}><button className="btn" onClick={() => setLimit(limit + PAGE)}>Show {Math.min(PAGE, rows.length - limit)} more</button></div>}
          </div>
        )}
      </Card>
    </div>
  );
}

function AddForm({ onDone }: { onDone: () => void }) {
  const { dispatch } = useStore();
  const { toast } = useToast();
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [date, setDate] = useState(todayISO());
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState(0);
  const [cat, setCat] = useState('');
  const auto = categorize(desc, type);
  const chosen = cat && (type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).includes(cat) ? cat : auto;
  const missing = !amount ? 'Enter an amount to save.' : !date ? 'Choose a date to save.' : null;

  const save = () => {
    const t: Txn = { id: uid(), date, description: desc || chosen, amount, type, category: chosen, source: 'manual' };
    dispatch({ type: 'addTxns', txns: [t] });
    toast(`${type === 'income' ? 'Income' : 'Expense'} of ${inr(amount)} added`);
    onDone();
  };

  return (
    <Card title="New transaction" sub="Fields marked * are required">
      <form onSubmit={(e) => { e.preventDefault(); if (!missing) save(); }}>
        <div className="form-grid">
          <Field label="Type"><select value={type} onChange={(e) => { setType(e.target.value as 'income' | 'expense'); setCat(''); }}><option value="expense">Expense</option><option value="income">Income</option></select></Field>
          <Field label="Date" required><input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Description"><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="UPI-Swiggy, Salary, ..." /></Field>
          <Num label="Amount (₹)" value={amount} onChange={setAmount} min={0} required />
          <Field label="Category" hint={cat ? undefined : 'Picked from the description'}>
            <select value={chosen} onChange={(e) => setCat(e.target.value)}>{(type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => <option key={c}>{c}</option>)}</select>
          </Field>
        </div>
        <div className="form-actions">
          <button className="btn primary" type="submit" disabled={!!missing}>Save transaction</button>
          <button className="btn" type="button" onClick={onDone}>Cancel</button>
          {missing && <span className="why" role="status">{missing}</span>}
        </div>
      </form>
    </Card>
  );
}

function ImportCard({ defaultOpen, onPending }: { defaultOpen: boolean; onPending: (pending: boolean) => void }) {
  const { state, dispatch } = useStore();
  const { toast } = useToast();
  const [open, setOpen] = useState(defaultOpen);
  const [result, setResult] = useState<CsvResult | null>(null);
  const [pasted, setPasted] = useState('');
  const file = useRef<HTMLInputElement>(null);

  const have = new Set(state.txns.map((t) => t.id));
  const fresh = result?.rows.filter((r) => !have.has(r.id)) ?? [];
  const dates = result?.rows.map((r) => r.date).sort() ?? [];

  useEffect(() => {
    onPending(fresh.length > 0);
  }, [fresh.length, onPending]);

  const read = (text: string) => setResult(parseStatement(text));

  return (
    <Card
      title="Import a bank statement"
      sub="Works with any bank that lets you download a CSV"
      right={<button className="btn small" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? 'Hide' : 'Import'}</button>}
    >
      {open && (
        <div className="stack">
          <div className="row">
            <input ref={file} type="file" aria-label="Choose a statement file" accept=".csv,.txt,text/csv" onChange={async (e) => { const f = e.target.files?.[0]; if (f) read(await f.text()); e.target.value = ''; }} />
            <span className="sub">or paste the CSV text:</span>
          </div>
          <textarea className="inline-input" rows={3} aria-label="Paste CSV text" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Date,Narration,Withdrawal Amt.,Deposit Amt.&#10;01/10/26,UPI-SWIGGY,450.00,," />
          {pasted.trim() && <div><button className="btn" onClick={() => read(pasted)}>Read pasted text</button></div>}

          {result && (
            <div className="stack">
              {result.warnings.map((w, i) => <Callout key={i} tone={result.rows.length ? 'watch' : 'bad'}>{w}</Callout>)}
              {result.rows.length > 0 && (
                <>
                  <div className="row">
                    <Badge tone="info">{result.rows.length} rows read</Badge>
                    <Badge tone={fresh.length ? 'good' : 'watch'}>{fresh.length} new</Badge>
                    {result.rows.length - fresh.length > 0 && <Badge>{result.rows.length - fresh.length} already imported</Badge>}
                    <span className="sub">{dates[0]} to {dates[dates.length - 1]}</span>
                  </div>
                  <p className="sub">Categories are guessed from the narration. Check the "Other" rows after importing and fix them in the list below.</p>
                  <div className="form-actions" style={{ marginTop: 0 }}>
                    <button className="btn primary" disabled={!fresh.length} onClick={() => { dispatch({ type: 'addTxns', txns: result.rows }); toast(`Imported ${fresh.length} transactions.`); setResult(null); setPasted(''); }}>Import {fresh.length} transactions</button>
                    <button className="btn" onClick={() => { setResult(null); setPasted(''); }}>Cancel</button>
                    {!fresh.length && <span className="why">Everything in this file is already here.</span>}
                  </div>
                </>
              )}
            </div>
          )}

          <details>
            <summary>Why not connect my bank account directly?</summary>
            <div className="stack sub" style={{ marginTop: 8 }}>
              <p>In India, a live feed of your bank transactions has to go through the RBI&rsquo;s Account Aggregator framework: you consent to an AA, and the data goes only to regulated financial-information users. A personal app cannot plug into that directly, and screen-scraping net banking breaks your bank&rsquo;s terms and puts your credentials at risk.</p>
              <p>So this app does not pretend to do it. Download a statement from net banking each month (CSV or Excel saved as CSV) and import it. Re-importing the same file will not create duplicates.</p>
              <p>If you want live sync later, the clean path is to put an AA gateway provider behind a small backend and feed its output into the same import function used here.</p>
            </div>
          </details>
        </div>
      )}
    </Card>
  );
}

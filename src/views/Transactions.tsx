import { useMemo, useRef, useState } from 'react';
import { DEFAULT_CATEGORIES, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../engine/categories';
import { categorize } from '../engine/categorize';
import { monthsWithData } from '../engine/cashflow';
import { parseStatement, type CsvResult } from '../engine/csv';
import type { Txn } from '../engine/types';
import { Badge, Callout, Card, Field, Num } from '../components/ui';
import { inr, monthLabel, todayISO, uid } from '../lib/format';
import { useStore } from '../store';

const PAGE = 100;

export function Transactions() {
  const { state, dispatch } = useStore();
  const [month, setMonth] = useState('all');
  const [category, setCategory] = useState('all');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [adding, setAdding] = useState(false);
  const months = useMemo(() => monthsWithData(state.txns).reverse(), [state.txns]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return state.txns
      .filter((t) => (month === 'all' || t.date.startsWith(month)) && (category === 'all' || t.category === category) && (!needle || t.description.toLowerCase().includes(needle)))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [state.txns, month, category, q]);

  const totals = rows.reduce((a, t) => ({ in: a.in + (t.type === 'income' ? t.amount : 0), out: a.out + (t.type === 'expense' ? t.amount : 0) }), { in: 0, out: 0 });

  return (
    <div className="page">
      <div className="row between">
        <h1>Transactions</h1>
        <div className="row">
          <button className="btn primary" onClick={() => setAdding((a) => !a)}>{adding ? 'Close' : 'Add transaction'}</button>
        </div>
      </div>

      {adding && <AddForm onDone={() => setAdding(false)} />}
      <ImportCard />

      <Card title="All transactions" sub={`${rows.length} shown · in ${inr(totals.in)} · out ${inr(totals.out)}`}
        right={state.txns.length > 0 && (
          <button className="btn small danger" onClick={() => { if (confirm(`Delete all ${state.txns.length} transactions? This cannot be undone.`)) dispatch({ type: 'clearTxns' }); }}>Delete all</button>
        )}>
        <div className="form-grid" style={{ marginBottom: 12 }}>
          <Field label="Month"><select value={month} onChange={(e) => { setMonth(e.target.value); setLimit(PAGE); }}><option value="all">All months</option>{months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></Field>
          <Field label="Category"><select value={category} onChange={(e) => { setCategory(e.target.value); setLimit(PAGE); }}><option value="all">All categories</option>{DEFAULT_CATEGORIES.map((c) => <option key={c.name}>{c.name}</option>)}</select></Field>
          <Field label="Search"><input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="swiggy, rent, ..." /></Field>
        </div>
        {rows.length === 0 ? <p className="sub">No transactions match. Add one above, or import a statement.</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Date</th><th>Description</th><th>Category</th><th className="r">Amount</th><th /></tr></thead>
              <tbody>
                {rows.slice(0, limit).map((t) => (
                  <tr key={t.id}>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>{t.date}</td>
                    <td style={{ maxWidth: 360, overflowWrap: 'anywhere' }}>{t.description}</td>
                    <td>
                      <select className="inline-input" aria-label={`Category for ${t.description}`} value={t.category} onChange={(e) => dispatch({ type: 'updateTxn', id: t.id, patch: { category: e.target.value } })}>
                        {(t.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </td>
                    <td className={`r num ${t.type === 'income' ? 'good' : ''}`} style={{ whiteSpace: 'nowrap' }}>{t.type === 'income' ? '+' : '-'}{inr(t.amount)}</td>
                    <td><button className="btn small ghost" aria-label={`Delete ${t.description}`} onClick={() => dispatch({ type: 'deleteTxn', id: t.id })}>&times;</button></td>
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
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [date, setDate] = useState(todayISO());
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState(0);
  const [cat, setCat] = useState('');
  const auto = categorize(desc, type);
  const chosen = cat && (type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).includes(cat) ? cat : auto;

  return (
    <Card title="New transaction">
      <div className="form-grid">
        <Field label="Type"><select value={type} onChange={(e) => { setType(e.target.value as 'income' | 'expense'); setCat(''); }}><option value="expense">Expense</option><option value="income">Income</option></select></Field>
        <Field label="Date"><input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Description"><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="UPI-Swiggy, Salary, ..." /></Field>
        <Num label="Amount (₹)" value={amount} onChange={setAmount} min={0} />
        <Field label="Category" hint={cat ? undefined : 'Picked from the description'}>
          <select value={chosen} onChange={(e) => setCat(e.target.value)}>{(type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => <option key={c}>{c}</option>)}</select>
        </Field>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn primary" disabled={!amount || !date} onClick={() => {
          const t: Txn = { id: uid(), date, description: desc || chosen, amount, type, category: chosen, source: 'manual' };
          dispatch({ type: 'addTxns', txns: [t] });
          setDesc(''); setAmount(0); setCat(''); onDone();
        }}>Save</button>
      </div>
    </Card>
  );
}

function ImportCard() {
  const { state, dispatch } = useStore();
  const [result, setResult] = useState<CsvResult | null>(null);
  const [pasted, setPasted] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const read = (text: string) => { setDone(null); setResult(parseStatement(text)); };
  const have = new Set(state.txns.map((t) => t.id));
  const fresh = result?.rows.filter((r) => !have.has(r.id)) ?? [];
  const dates = result?.rows.map((r) => r.date).sort() ?? [];

  return (
    <Card title="Bring in your bank data" sub="Statement import works with any bank that lets you download a CSV">
      <div className="stack">
        <div className="row">
          <input ref={file} type="file" accept=".csv,.txt,text/csv" onChange={async (e) => { const f = e.target.files?.[0]; if (f) read(await f.text()); e.target.value = ''; }} />
          <span className="sub">or paste the CSV text:</span>
        </div>
        <textarea className="inline-input" rows={3} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Date,Narration,Withdrawal Amt.,Deposit Amt.&#10;01/10/26,UPI-SWIGGY,450.00,," />
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
                <p className="sub">Categories are guessed from the narration. Check the "Other" rows after importing and fix them in the table below.</p>
                <div><button className="btn primary" disabled={!fresh.length} onClick={() => { dispatch({ type: 'addTxns', txns: result.rows }); setDone(`Imported ${fresh.length} transactions.`); setResult(null); setPasted(''); }}>Import {fresh.length} transactions</button></div>
              </>
            )}
          </div>
        )}
        {done && <Callout tone="good">{done}</Callout>}

        <details>
          <summary>Why not connect my bank account directly?</summary>
          <div className="stack sub" style={{ marginTop: 8 }}>
            <p>In India, a live feed of your bank transactions has to go through the RBI&rsquo;s Account Aggregator framework: you consent to an AA, and the data goes only to regulated financial-information users. A personal app cannot plug into that directly, and screen-scraping net banking breaks your bank&rsquo;s terms and puts your credentials at risk.</p>
            <p>So this app does not pretend to do it. Download a statement from net banking each month (CSV or Excel saved as CSV) and import it. Re-importing the same file will not create duplicates.</p>
            <p>If you want live sync later, the clean path is to put an AA gateway provider behind a small backend and feed its output into the same import function used here.</p>
          </div>
        </details>
      </div>
    </Card>
  );
}

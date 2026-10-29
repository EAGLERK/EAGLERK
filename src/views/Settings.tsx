import { useRef, useState } from 'react';
import type { Assumption } from '../engine/assumptions';
import { Badge, Callout, Card, Field, Num, NumInput, Toggle } from '../components/ui';
import { pct } from '../lib/format';
import { useStore, type AppState } from '../store';
import { incomeTax } from '../engine/tax';
import { inr } from '../lib/format';

const STATUS_TONE = { verified: 'good', check: 'watch', estimate: undefined } as const;
const STATUS_HELP = {
  verified: 'Official notification, confirmed by several outlets',
  check: 'Typical value; varies by bank or lender, enter yours',
  estimate: 'Modelling assumption, not a forecast',
} as const;

export function Settings() {
  const { state, dispatch, d } = useStore();
  const p = state.profile;
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const groups = [...new Set(d.assumptions.map((a) => a.group))];

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `eaglerk-backup-${d.today}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (f: File) => {
    try {
      const parsed = JSON.parse(await f.text()) as AppState;
      if (parsed.version !== 1 || !Array.isArray(parsed.txns) || !Array.isArray(parsed.goals) || !Array.isArray(parsed.investments)) throw new Error('shape');
      dispatch({ type: 'replace', state: { ...parsed, liabilities: parsed.liabilities ?? [], overrides: parsed.overrides ?? {}, onboarded: true } });
      setMsg({ tone: 'good', text: 'Backup restored.' });
    } catch {
      setMsg({ tone: 'bad', text: 'That file is not an Eaglerk backup.' });
    }
  };

  return (
    <div className="page">
      <h1>Settings</h1>

      <Card title="About you" sub="Used for tax slab, equity share and fallbacks until you import transactions">
        <div className="form-grid">
          <Field label="Name"><input value={p.name} onChange={(e) => dispatch({ type: 'profile', patch: { name: e.target.value } })} /></Field>
          <Num label="Age" value={p.age} onChange={(n) => dispatch({ type: 'profile', patch: { age: Math.round(n) } })} min={18} />
          <Num label="Monthly take-home (₹)" value={p.monthlyIncome} onChange={(n) => dispatch({ type: 'profile', patch: { monthlyIncome: n } })} min={0} />
          <Num label="Monthly spend (₹)" value={p.monthlyExpenses} onChange={(n) => dispatch({ type: 'profile', patch: { monthlyExpenses: n } })} min={0} hint="Including rent and EMIs" />
          <Num label="Annual gross income (₹)" value={p.annualGrossIncome} onChange={(n) => dispatch({ type: 'profile', patch: { annualGrossIncome: n } })} min={0} hint="Sets your tax slab" />
          <Num label="Emergency fund (months)" value={p.emergencyMonths} onChange={(n) => dispatch({ type: 'profile', patch: { emergencyMonths: n } })} min={0} hint="6 is standard; 9-12 if income is irregular" />
          <Field label="Risk comfort"><Toggle label="Risk profile" value={p.risk} onChange={(v) => dispatch({ type: 'profile', patch: { risk: v } })} options={[['conservative', 'Low'], ['moderate', 'Medium'], ['aggressive', 'High']]} /></Field>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <label className="check"><input type="checkbox" checked={p.salaried} onChange={(e) => dispatch({ type: 'profile', patch: { salaried: e.target.checked } })} /> Salaried (Rs 75,000 standard deduction)</label>
          <label className="check"><input type="checkbox" checked={p.hasHealthInsurance} onChange={(e) => dispatch({ type: 'profile', patch: { hasHealthInsurance: e.target.checked } })} /> I have health insurance</label>
          <label className="check"><input type="checkbox" checked={p.hasTermInsurance} onChange={(e) => dispatch({ type: 'profile', patch: { hasTermInsurance: e.target.checked } })} /> I have term life insurance</label>
        </div>
        <p className="sub" style={{ marginTop: 12 }}>
          Tax on this income (new regime, FY 2026-27): <b>{inr(incomeTax(p.annualGrossIncome, p.salaried))}</b>. Tax on your next rupee of interest: <b>{pct(d.marginal * 100, 1)}</b>. Under the new regime income up to Rs 12.75 lakh (salaried) pays nil, so FD interest costs you nothing extra until you cross that line.
        </p>
      </Card>

      <Card title="Rates and assumptions" sub="Every number the planner uses. Change any of them; reset returns the default.">
        <div className="stack">
          <Callout tone="info">
            <b>Verified</b> rates come from the 30 Sep 2026 small-savings notification and the 7 Oct 2026 RBI policy. <b>Check</b> rates differ by bank: aggregator sites disagreed on SBI&rsquo;s 1-year FD by 25 bps, so enter your bank&rsquo;s own. <b>Estimates</b> are modelling choices. Press reports were the source, not the primary notifications, so confirm before a large decision.
          </Callout>
          {groups.map((g) => (
            <div key={g}>
              <h3 style={{ margin: '8px 0' }}>{g}</h3>
              <div className="table-wrap">
                <table className="table num">
                  <tbody>
                    {d.assumptions.filter((a) => a.group === g).map((a) => <AssumptionRow key={a.key} a={a} overridden={a.key in state.overrides} />)}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Your data" sub="Everything is stored in this browser only. Nothing is sent anywhere.">
        <div className="row">
          <button className="btn" onClick={exportJson}>Download backup</button>
          <button className="btn" onClick={() => file.current?.click()}>Restore backup</button>
          <input ref={file} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ''; }} />
          <button className="btn" onClick={() => { if (confirm('Replace your data with the sample data?')) dispatch({ type: 'loadDemo' }); }}>Load sample data</button>
          <button className="btn danger" onClick={() => { if (confirm('Erase everything in this browser? Download a backup first if you want one.')) dispatch({ type: 'startFresh' }); }}>Erase everything</button>
        </div>
        {msg && <div style={{ marginTop: 12 }}><Callout tone={msg.tone}>{msg.text}</Callout></div>}
        <p className="sub" style={{ marginTop: 12 }}>Browser storage can be wiped by clearing site data. Download a backup now and then.</p>
      </Card>
    </div>
  );
}

function AssumptionRow({ a, overridden }: { a: Assumption; overridden: boolean }) {
  const { dispatch } = useStore();
  return (
    <tr>
      <td style={{ width: '30%' }}>{a.label}</td>
      <td style={{ width: 120 }}><NumInput className="inline-input" aria-label={a.label} value={a.value} onChange={(n) => dispatch({ type: 'override', key: a.key, value: n })} /></td>
      <td style={{ width: 30 }}>%</td>
      <td style={{ width: 110 }}><Badge tone={STATUS_TONE[a.status]} title={STATUS_HELP[a.status]}>{a.status}</Badge></td>
      <td className="sub">{a.source} <span className="muted">· as of {a.asOf}</span></td>
      <td>{overridden && <button className="btn small ghost" onClick={() => dispatch({ type: 'override', key: a.key, value: null })}>Reset</button>}</td>
    </tr>
  );
}

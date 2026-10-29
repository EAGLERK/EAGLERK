import { useMemo, useState } from 'react';
import { afterTaxRate, effectiveYield, fdMaturity, rdMaturity } from '../engine/deposits';
import { corpusAfterTax, rankInstruments } from '../engine/instruments';
import { KIND_LABEL, maturity } from '../engine/portfolio';
import { equityShare } from '../engine/advisor';
import { realReturn } from '../engine/projection';
import { FD_TDS_THRESHOLD } from '../engine/tax';
import type { Investment, InvestmentKind, Liability, RiskProfile } from '../engine/types';
import { Badge, Callout, Card, Field, Num, Stat, Toggle } from '../components/ui';
import { StackedBar } from '../components/charts';
import { inr, inrCompact, pct, todayISO, uid } from '../lib/format';
import { useStore } from '../store';
import { CLASS_COLOR } from './Dashboard';

const KINDS = Object.keys(KIND_LABEL) as InvestmentKind[];

export function Investments() {
  const { state, dispatch, d } = useStore();
  const p = d.portfolio;
  const [editing, setEditing] = useState<Investment | null>(null);
  const [editingLoan, setEditingLoan] = useState<Liability | null>(null);

  const ranked = useMemo(() => [...p.holdings].sort((a, b) => b.real - a.real), [p.holdings]);
  const infl = d.rates.inflation;
  const target = equityShare(state.profile.age, state.profile.risk);
  const equityNow = p.total > 0 ? (p.byClass.equity / p.total) * 100 : 0;

  return (
    <div className="page">
      <div className="row between">
        <h1>Investments</h1>
        <button className="btn primary" onClick={() => setEditing(blank())}>Add investment</button>
      </div>

      {editing && <InvestmentForm initial={editing} onClose={() => setEditing(null)} />}

      {state.investments.length === 0 && !editing && <Card><p className="sub">Add your savings, FDs, RDs, PPF, mutual funds, stocks and gold. Each one is valued today and compared on what you actually keep after tax and inflation.</p></Card>}

      {p.holdings.length > 0 && (
        <>
          <div className="grid g4">
            <Stat label="Value today" value={inrCompact(p.total)} note={`Invested ${inrCompact(p.invested)}`} />
            <Stat label="Gain" value={inrCompact(p.total - p.invested)} tone={p.total >= p.invested ? 'good' : 'bad'} delta={p.invested > 0 ? <span>{pct(((p.total - p.invested) / p.invested) * 100)} on cost</span> : undefined} />
            <Stat label="Return after tax" value={pct(p.blendedPosttax)} note="Weighted by value, per year" />
            <Stat label="Return after tax and inflation" value={pct(realReturn(p.blendedPosttax, infl))} tone={realReturn(p.blendedPosttax, infl) < 1 ? 'watch' : 'good'} note={`Inflation assumed ${infl}%`} />
          </div>

          <Card title="Allocation" sub={`Equity is ${pct(equityNow, 0)} of holdings. For your age and risk profile the long-term target is about ${target}%.`}>
            <StackedBar parts={[
              { label: 'Equity', value: p.byClass.equity, color: CLASS_COLOR.equity },
              { label: 'Debt', value: p.byClass.debt, color: CLASS_COLOR.debt },
              { label: 'Cash', value: p.byClass.cash, color: CLASS_COLOR.cash },
              { label: 'Gold', value: p.byClass.gold, color: CLASS_COLOR.gold },
              { label: 'Other', value: p.byClass.other, color: CLASS_COLOR.other },
            ]} />
            {p.total > 0 && p.byClass.cash / p.total > 0.2 && <div style={{ marginTop: 12 }}><Callout tone="watch">{pct((p.byClass.cash / p.total) * 100, 0)} of your money sits in savings accounts. Keep an emergency fund there, but move the rest to something that beats inflation.</Callout></div>}
          </Card>

          <Card title="Your holdings, best to worst" sub="Ranked by return after tax and inflation, not by the headline rate">
            <div className="table-wrap">
              <table className="table num">
                <thead><tr><th>Holding</th><th className="r">Value</th><th className="r">Gain</th><th className="r">Rate</th><th className="r">After tax</th><th className="r">Real</th><th>Verdict</th><th /></tr></thead>
                <tbody>
                  {ranked.map((h, i) => {
                    const best = i === 0 && ranked.length > 2;
                    const worst = i === ranked.length - 1 && ranked.length > 2;
                    const mat = maturity(h.inv, d.today);
                    return (
                      <tr key={h.inv.id}>
                        <td>
                          <div style={{ fontWeight: 550 }}>{h.inv.name}</div>
                          <div className="sub">{KIND_LABEL[h.inv.kind]}{h.inv.institution ? ` · ${h.inv.institution}` : ''}{mat ? ` · matures ${mat.date}` : ''}</div>
                          {h.flags.map((f) => <div key={f} className="watch small">! {f}</div>)}
                        </td>
                        <td className="r" style={{ whiteSpace: 'nowrap' }}>{inr(h.value)}</td>
                        <td className={`r ${h.gain >= 0 ? 'good' : 'bad'}`} style={{ whiteSpace: 'nowrap' }}>{h.gain >= 0 ? '+' : ''}{inr(h.gain)}</td>
                        <td className="r">{pct(h.pretax)}<div className="sub">{h.rateSource === 'assumed' ? 'assumed' : 'yours'}</div></td>
                        <td className="r">{pct(h.posttax)}</td>
                        <td className={`r ${h.real < 0.5 ? 'bad' : ''}`}>{pct(h.real)}</td>
                        <td>{best ? <Badge tone="good">{'✓'} Best</Badge> : worst ? <Badge tone={h.real < 1 ? 'bad' : 'watch'}>{h.real < 1 ? '✕' : '!'} Weakest</Badge> : null}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button className="btn small" onClick={() => setEditing(h.inv)}>Edit</button>{' '}
                          <button className="btn small ghost danger" aria-label={`Delete ${h.inv.name}`} onClick={() => { if (confirm(`Delete ${h.inv.name}?`)) dispatch({ type: 'deleteInvestment', id: h.inv.id }); }}>&times;</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="sub" style={{ marginTop: 8 }}>Your tax slab is taken as {pct(d.marginal * 100, 0)} on extra interest (new regime, cess included). Rates marked &ldquo;assumed&rdquo; come from the Settings tab because you left the rate blank.</p>
          </Card>
        </>
      )}

      <Compare />
      <DepositCalc />

      <Card title="Loans you are paying" sub="These count against your monthly capacity and net worth"
        right={<button className="btn small" onClick={() => setEditingLoan({ id: uid(), name: '', outstanding: 0, rate: 10, emi: 0 })}>Add loan</button>}>
        {editingLoan && <LoanForm initial={editingLoan} onClose={() => setEditingLoan(null)} />}
        {state.liabilities.length === 0 ? <p className="sub">None recorded.</p> : (
          <div className="table-wrap">
            <table className="table num">
              <thead><tr><th>Loan</th><th className="r">Outstanding</th><th className="r">Rate</th><th className="r">EMI</th><th /></tr></thead>
              <tbody>
                {state.liabilities.map((l) => (
                  <tr key={l.id}>
                    <td>{l.name} {l.rate > 10 && <Badge tone="watch">! costly</Badge>}</td>
                    <td className="r">{inr(l.outstanding)}</td><td className="r">{pct(l.rate)}</td><td className="r">{inr(l.emi)}</td>
                    <td><button className="btn small" onClick={() => setEditingLoan(l)}>Edit</button>{' '}<button className="btn small ghost danger" aria-label={`Delete ${l.name}`} onClick={() => dispatch({ type: 'deleteLiability', id: l.id })}>&times;</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

const blank = (): Investment => ({ id: uid(), kind: 'fd', name: '', institution: '', startDate: todayISO(), amount: 0, rate: 0, tenureMonths: 12 });

function LoanForm({ initial, onClose }: { initial: Liability; onClose: () => void }) {
  const { dispatch } = useStore();
  const [l, setL] = useState(initial);
  return (
    <div className="stack" style={{ marginBottom: 14 }}>
      <div className="form-grid">
        <Field label="Name"><input value={l.name} onChange={(e) => setL({ ...l, name: e.target.value })} placeholder="Car loan, credit card..." /></Field>
        <Num label="Outstanding (₹)" value={l.outstanding} onChange={(n) => setL({ ...l, outstanding: n })} min={0} />
        <Num label="Interest rate (%)" value={l.rate} onChange={(n) => setL({ ...l, rate: n })} min={0} />
        <Num label="Monthly EMI (₹)" value={l.emi} onChange={(n) => setL({ ...l, emi: n })} min={0} />
      </div>
      <div className="row"><button className="btn primary" disabled={!l.name} onClick={() => { dispatch({ type: 'upsertLiability', liability: l }); onClose(); }}>Save</button><button className="btn" onClick={onClose}>Cancel</button></div>
    </div>
  );
}

function InvestmentForm({ initial, onClose }: { initial: Investment; onClose: () => void }) {
  const { dispatch, d } = useStore();
  const [v, setV] = useState<Investment>(initial);
  const set = (patch: Partial<Investment>) => setV((x) => ({ ...x, ...patch }));
  const timed = v.kind === 'fd' || v.kind === 'rd';
  const market = v.kind === 'mutual_fund' || v.kind === 'stocks' || v.kind === 'gold' || v.kind === 'other' || v.kind === 'nps' || v.kind === 'ppf' || v.kind === 'epf';
  const mat = timed ? maturity(v, d.today) : null;
  const defaultRate = v.kind === 'fd' ? d.rates.fd : v.kind === 'rd' ? d.rates.rd : v.kind === 'ppf' ? d.rates.ppf : v.kind === 'savings' ? d.rates.savings : 0;

  return (
    <Card title={initial.name ? `Edit ${initial.name}` : 'New investment'}>
      <div className="form-grid">
        <Field label="Type"><select value={v.kind} onChange={(e) => { const k = e.target.value as InvestmentKind; set({ kind: k, tenureMonths: k === 'fd' ? 12 : k === 'rd' ? 12 : 0, emergency: k === 'savings' }); }}>{KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></Field>
        <Field label="Name"><input value={v.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. SBI 1-year FD" /></Field>
        <Field label="Bank / platform"><input value={v.institution} onChange={(e) => set({ institution: e.target.value })} /></Field>
        <Field label={timed ? 'Start date' : 'Invested since'}><input type="date" value={v.startDate} onChange={(e) => set({ startDate: e.target.value })} /></Field>
        <Num label={v.kind === 'rd' ? 'Monthly instalment (₹)' : v.kind === 'fd' ? 'Deposit amount (₹)' : v.kind === 'savings' ? 'Balance (₹)' : 'Total invested (₹)'} value={v.amount} onChange={(n) => set({ amount: n, ...(v.kind === 'savings' ? { currentValue: n } : {}) })} min={0} />
        {(timed || v.kind === 'savings' || v.kind === 'ppf' || v.kind === 'epf' || v.kind === 'mutual_fund' || v.kind === 'nps') && (
          <Num label={v.kind === 'mutual_fund' ? 'Your return, XIRR (% / yr, optional)' : 'Interest rate (% / yr)'} value={v.rate} onChange={(n) => set({ rate: n })} min={0} hint={v.rate ? undefined : defaultRate ? `Leave 0 to use ${defaultRate}% from Settings` : 'Leave 0 to use the Settings assumption'} />
        )}
        {timed && <Num label="Tenure (months)" value={v.tenureMonths} onChange={(n) => set({ tenureMonths: Math.round(n) })} min={1} />}
        {market && <Num label="Current value (₹)" value={v.currentValue ?? 0} onChange={(n) => set({ currentValue: n || undefined })} min={0} hint="From your app or passbook" />}
        {(v.kind === 'mutual_fund' || v.kind === 'nps') && <Num label="Equity share of the fund (%)" value={v.equityPct ?? (v.kind === 'nps' ? 50 : 100)} onChange={(n) => set({ equityPct: Math.min(100, n) })} min={0} hint="Index/flexi-cap 100, hybrid 40-65, debt 0" />}
      </div>
      <label className="check" style={{ marginTop: 12 }}><input type="checkbox" checked={!!v.emergency} onChange={(e) => set({ emergency: e.target.checked })} /> Count this toward my emergency fund (must be quickly withdrawable)</label>
      {mat && (
        <div style={{ marginTop: 12 }}><Callout tone="info">Matures on <b>{mat.date}</b> at about <b>{inr(mat.value)}</b> (interest {inr(mat.interest)}). Banks round differently, so expect a few rupees of difference.</Callout></div>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn primary" disabled={!v.name || v.amount <= 0} onClick={() => { dispatch({ type: 'upsertInvestment', inv: v }); onClose(); }}>Save</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </Card>
  );
}

function Compare() {
  const { state, d } = useStore();
  const [lump, setLump] = useState(100_000);
  const [monthly, setMonthly] = useState(10_000);
  const [years, setYears] = useState(5);
  const [risk, setRisk] = useState<RiskProfile>(state.profile.risk);

  const rows = useMemo(() => rankInstruments({ rates: d.rates, marginal: d.marginal, years, risk, age: state.profile.age }), [d.rates, d.marginal, years, risk, state.profile.age]);
  const status = (key: string) => d.assumptions.find((a) => a.key === key)?.status;
  const best = rows.filter((r) => r.verdict === 'best');
  const bad = rows.filter((r) => r.verdict === 'avoid');

  return (
    <Card title="Where should new money go?" sub="Pick an amount and how long you can leave it. Instruments are ranked on what you keep after tax and inflation, among those safe for that horizon and your risk profile.">
      <div className="form-grid" style={{ marginBottom: 14 }}>
        <Num label="One-time amount (₹)" value={lump} onChange={setLump} min={0} />
        <Num label="Monthly amount (₹)" value={monthly} onChange={setMonthly} min={0} />
        <Num label="Years until you need it" value={years} onChange={(n) => setYears(Math.max(0.25, n))} min={0.25} />
        <Field label="Risk comfort"><Toggle label="Risk profile" value={risk} onChange={setRisk} options={[['conservative', 'Low'], ['moderate', 'Medium'], ['aggressive', 'High']]} /></Field>
      </div>

      <div className="grid g2" style={{ marginBottom: 14 }}>
        <Callout tone="good"><b>Best for {years} year{years === 1 ? '' : 's'}:</b> {best.length ? best.map((b) => `${b.inst.name} (${pct(b.real)} real)`).join(', ') : 'nothing qualifies at this horizon and risk level'}.</Callout>
        <Callout tone="bad"><b>Worst picks:</b> {bad.length ? bad.map((b) => b.inst.name).join(', ') + ' barely beat inflation after tax.' : 'every eligible option beats inflation.'} Also avoid anything marked unsuitable below.</Callout>
      </div>

      <div className="table-wrap">
        <table className="table num">
          <thead><tr><th>Instrument</th><th className="r">Rate</th><th className="r">After tax</th><th className="r">Real</th><th className="r">You end with</th><th className="r">In today&rsquo;s money</th><th className="r">Bad year</th><th>Verdict</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const c = corpusAfterTax(r.inst, d.rates, d.marginal, { lump, monthly, years });
              return (
                <tr key={r.inst.id} style={{ opacity: r.eligible ? 1 : 0.62 }}>
                  <td>
                    <div style={{ fontWeight: 550 }}>{r.inst.name}</div>
                    <div className="sub">{r.inst.where}</div>
                    {r.reason && <div className={`small ${r.eligible ? 'watch' : 'muted'}`}>{r.reason}</div>}
                  </td>
                  <td className="r">{pct(r.pretax)}<div><Badge tone={status(r.inst.rateKey) === 'verified' ? 'good' : status(r.inst.rateKey) === 'check' ? 'watch' : undefined} title="verified: official notification · check: confirm with your bank · estimate: modelled assumption">{status(r.inst.rateKey)}</Badge></div></td>
                  <td className="r">{pct(r.posttax)}</td>
                  <td className={`r ${r.real < 0.5 ? 'bad' : ''}`}>{pct(r.real)}</td>
                  <td className="r">{inrCompact(c.net)}</td>
                  <td className="r">{inrCompact(c.real)}</td>
                  <td className="r">{r.inst.badYear ? pct(r.inst.badYear, 0) : '0%'}</td>
                  <td>{r.verdict === 'best' ? <Badge tone="good">{'✓'} Best</Badge> : r.verdict === 'avoid' ? <Badge tone="bad">{'✕'} Avoid</Badge> : r.verdict === 'unsuitable' ? <Badge>Not for this</Badge> : <Badge tone="info">OK</Badge>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="sub" style={{ marginTop: 8 }}>You would put in {inrCompact(lump + monthly * Math.round(years * 12))}. &ldquo;Bad year&rdquo; is an illustrative bad calendar year, not a worst case and not from a verified dataset. Equity exit tax is 12.5% above Rs 1.25 lakh of gains if held a year or more. Rates marked &ldquo;estimate&rdquo; are assumptions you can edit in Settings; none of them is a forecast.</p>
    </Card>
  );
}

function DepositCalc() {
  const { d } = useStore();
  const [kind, setKind] = useState<'fd' | 'rd'>('fd');
  const [amount, setAmount] = useState(100_000);
  const [rate, setRate] = useState(d.rates.fd);
  const [months, setMonths] = useState(12);

  const maturityValue = kind === 'fd' ? fdMaturity(amount, rate, months) : rdMaturity(amount, rate, months);
  const principal = kind === 'fd' ? amount : amount * months;
  const interest = maturityValue - principal;
  const posttax = afterTaxRate(effectiveYield(rate), d.marginal);
  const years = months / 12;
  const yearlyInterest = interest / Math.max(years, 1);
  const afterTaxMaturity = kind === 'fd' ? fdMaturity(amount, rate * (1 - d.marginal), months) : rdMaturity(amount, rate * (1 - d.marginal), months);
  const real = realReturn(posttax, d.rates.inflation);

  return (
    <Card title="FD / RD calculator" sub="Quarterly compounding, as Indian banks do it">
      <div className="form-grid">
        <Field label="Type"><Toggle label="Deposit type" value={kind} onChange={(k) => { setKind(k); setRate(k === 'fd' ? d.rates.fd : d.rates.rd); }} options={[['fd', 'Fixed deposit'], ['rd', 'Recurring deposit']]} /></Field>
        <Num label={kind === 'fd' ? 'Deposit (₹)' : 'Monthly instalment (₹)'} value={amount} onChange={setAmount} min={0} />
        <Num label="Rate (% / yr)" value={rate} onChange={setRate} min={0} hint="Use your bank's quoted rate" />
        <Num label="Tenure (months)" value={months} onChange={(n) => setMonths(Math.max(1, Math.round(n)))} min={1} />
      </div>
      <div className="grid g2" style={{ marginTop: 14 }}>
        <dl className="kv">
          <dt>You put in</dt><dd>{inr(principal)}</dd>
          <dt>Interest earned</dt><dd>{inr(interest)}</dd>
          <dt className="strong">Maturity value (before tax)</dt><dd className="strong">{inr(maturityValue)}</dd>
          <dt>Effective yield</dt><dd>{pct(effectiveYield(rate), 2)}</dd>
          <dt>Maturity after tax at your slab ({pct(d.marginal * 100, 0)})</dt><dd>{inr(afterTaxMaturity)}</dd>
          <dt>Return after tax and inflation</dt><dd className={real < 0.5 ? 'bad' : 'good'}>{real < 0.5 ? '✕ ' : '✓ '}{pct(real)}</dd>
        </dl>
        <div className="stack">
          {real < 0.5 && <Callout tone="bad">After tax and {d.rates.inflation}% inflation this deposit grows your buying power by only {pct(real)} a year. Fine for money you need soon; poor for anything longer.</Callout>}
          {yearlyInterest > FD_TDS_THRESHOLD && <Callout tone="watch">Interest of about {inr(yearlyInterest)} a year crosses the Rs {FD_TDS_THRESHOLD.toLocaleString('en-IN')} threshold at one bank, so the bank will cut 10% TDS. It is still taxed at your slab either way; TDS only changes when you pay.</Callout>}
          {years >= 5 && <Callout tone="info">For 5 years or more, PPF at {d.rates.ppf}% is tax-free, so it needs a pre-tax FD rate of {pct(d.rates.ppf / (1 - d.marginal), 2)} to match.</Callout>}
        </div>
      </div>
    </Card>
  );
}

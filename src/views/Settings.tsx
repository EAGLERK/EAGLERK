import { useRef, useState } from 'react';
import type { Assumption } from '../engine/assumptions';
import { Badge, Callout, Card, Field, Num, NumInput, Toggle } from '../components/ui';
import { pct } from '../lib/format';
import { useAuth } from '../auth/AuthContext';
import { useSync } from '../auth/CloudStore';
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
  const auth = useAuth();
  const p = state.profile;
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [backupText, setBackupText] = useState('');
  const groups = [...new Set(d.assumptions.map((a) => a.group))];

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mymoney-backup-${d.today}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const restore = (text: string) => {
    try {
      const parsed = JSON.parse(text) as AppState;
      if (parsed.version !== 1 || !Array.isArray(parsed.txns) || !Array.isArray(parsed.goals) || !Array.isArray(parsed.investments)) throw new Error('shape');
      dispatch({ type: 'replace', state: { ...parsed, liabilities: parsed.liabilities ?? [], overrides: parsed.overrides ?? {}, onboarded: true } });
      setMsg({ tone: 'good', text: 'Backup restored.' });
    } catch {
      setMsg({ tone: 'bad', text: 'That is not a MyMoney backup.' });
    }
  };
  const importJson = async (f: File) => restore(await f.text());

  // Downloads are blocked in some embedded viewers, so a copy/paste route is always available.
  const copyBackup = async () => {
    const text = JSON.stringify(state);
    setBackupText(text);
    try {
      await navigator.clipboard.writeText(text);
      setMsg({ tone: 'good', text: 'Backup copied. Paste it somewhere safe.' });
    } catch {
      setMsg({ tone: 'good', text: 'Select the text below and copy it.' });
    }
  };

  return (
    <div className="page">
      <h1>Settings</h1>

      {auth?.user && <AccountCard />}

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

      <Card title="Your data" sub={auth?.user ? "Stored in your MyMoney account and synced across your devices. Other users cannot read it." : "Everything is stored in this browser only. Nothing is sent anywhere."}>
        <div className="row">
          <button className="btn" onClick={exportJson}>Download backup</button>
          <button className="btn" onClick={copyBackup}>Copy backup</button>
          <button className="btn" onClick={() => file.current?.click()}>Restore from file</button>
          <input ref={file} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ''; }} />
          <button className="btn" onClick={() => { if (confirm('Replace your data with the sample data?')) dispatch({ type: 'loadDemo' }); }}>Load sample data</button>
          <button className="btn danger" onClick={() => { if (confirm('Erase everything in this browser? Download a backup first if you want one.')) dispatch({ type: 'startFresh' }); }}>Erase everything</button>
        </div>
        <div className="stack" style={{ marginTop: 12 }}>
          <textarea id="backup-text" className="inline-input" rows={3} aria-label="Backup text" value={backupText} onChange={(e) => setBackupText(e.target.value)} placeholder="Press Copy backup to fill this with your data, or paste a backup here and press Restore from text." />
          <div><button className="btn" disabled={!backupText.trim()} onClick={() => restore(backupText)}>Restore from text</button></div>
        </div>
        {msg && <div style={{ marginTop: 12 }}><Callout tone={msg.tone}>{msg.text}</Callout></div>}
        <p className="sub" style={{ marginTop: 12 }}>{auth?.user ? 'Your account keeps a copy on the server. A downloaded backup is still a good second copy.' : 'Browser storage can be wiped by clearing site data. Download a backup now and then.'}</p>
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

function AccountCard() {
  const auth = useAuth()!;
  const sync = useSync();
  const user = auth.user!;
  const providers = ((user.app_metadata?.providers as string[] | undefined) ?? [user.app_metadata?.provider as string | undefined]).filter(Boolean) as string[];
  const hasPassword = providers.includes('email') || providers.includes('phone');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');

  const changePassword = async () => {
    setBusy(true);
    const r = await auth.updatePassword(pw);
    setBusy(false);
    if (r.ok) { setPw(''); setMsg({ tone: 'good', text: 'Password changed.' }); } else setMsg({ tone: 'bad', text: r.error });
  };

  const remove = async () => {
    setBusy(true);
    const r = await auth.deleteAccount();
    setBusy(false);
    if (!r.ok) setMsg({ tone: 'bad', text: r.error });
  };

  return (
    <Card title="Account" sub={user.email || user.phone || ''}
      right={sync && <span className={`sync-chip ${sync.status === 'saved' ? '' : sync.status === 'saving' ? 'saving' : 'bad'}`} role="status"><i />{sync.status === 'saved' ? 'All changes saved' : sync.status === 'saving' ? 'Saving...' : 'Needs attention'}</span>}>
      <div className="stack">
        <p className="sub">Signed in with {providers.length ? providers.map((x) => (x === 'google' ? 'Google' : x === 'phone' ? 'mobile number' : 'email and password')).join(' and ') : 'your account'}.</p>
        <div className="row">
          <button className="btn" onClick={() => void (sync ? sync.signOutSafely() : auth.signOut())}>Sign out</button>
        </div>

        {hasPassword ? (
          <div className="form-grid" style={{ alignItems: 'end' }}>
            <Field label="New password">
              <input type="password" autoComplete="new-password" placeholder="At least 8 characters" value={pw} onChange={(e) => setPw(e.target.value)} />
            </Field>
            <div><button className="btn" disabled={busy || !pw} onClick={changePassword}>Change password</button></div>
          </div>
        ) : (
          <p className="sub">You sign in with Google, so there is no MyMoney password to change.</p>
        )}

        <details>
          <summary>Delete my account</summary>
          <div className="stack" style={{ marginTop: 10 }}>
            <p className="sub">This permanently deletes your account and all the data in it. It cannot be undone. Download a backup first if you want one.</p>
            {!confirming ? (
              <div><button className="btn danger" onClick={() => setConfirming(true)}>I want to delete my account</button></div>
            ) : (
              <div className="form-grid" style={{ alignItems: 'end' }}>
                <Field label="Type DELETE to confirm"><input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></Field>
                <div className="row"><button className="btn danger" disabled={busy || typed !== 'DELETE'} onClick={remove}>Delete everything</button><button className="btn" onClick={() => { setConfirming(false); setTyped(''); }}>Cancel</button></div>
              </div>
            )}
          </div>
        </details>

        {msg && <Callout tone={msg.tone}>{msg.text}</Callout>}
      </div>
    </Card>
  );
}

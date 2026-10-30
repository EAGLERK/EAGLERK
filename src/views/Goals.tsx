import { lazy, Suspense, useState } from 'react';
import { addMonths } from '../engine/cashflow';
import { earliestMonths, GOAL_DEFAULTS, planGoal, type PlanContext } from '../engine/goals';
import type { Goal, GoalKind } from '../engine/types';
import { Icon, type IconName } from '../components/icons';
import { useToast } from '../components/feedback';
import { Badge, Callout, Card, Field, Num, NumInput } from '../components/ui';
import { inr, inrCompact, monthLabel, monthsText, pct, uid } from '../lib/format';
import { useStore } from '../store';

const Showcase3D = lazy(() => import('../three/Showcase3D'));

const DEFAULT_PRICE: Record<GoalKind, number> = { car: 1_000_000, house: 6_000_000, bike: 150_000, other: 500_000 };

const CHOICES: Array<{ kind: GoalKind; icon: IconName; title: string; hint: string }> = [
  { kind: 'car', icon: 'car', title: 'Car', hint: 'Down payment, loan and running costs' },
  { kind: 'house', icon: 'house', title: 'House', hint: 'Down payment, home loan and fees' },
  { kind: 'bike', icon: 'bike', title: 'Bike', hint: 'A motorbike or scooter' },
  { kind: 'other', icon: 'target', title: 'Something else', hint: 'Any one-off purchase, saved for in cash' },
];

function GoalChooser({ onPick }: { onPick: (k: GoalKind) => void }) {
  return (
    <div className="chooser" role="group" aria-label="Choose what you are saving for">
      {CHOICES.map((c) => (
        <button key={c.kind} className="choice" onClick={() => onPick(c.kind)}>
          <span className="icon-tile"><Icon name={c.icon} size={22} /></span>
          <b>{c.title}</b>
          <span className="sub">{c.hint}</span>
        </button>
      ))}
    </div>
  );
}

export function Goals() {
  const { state, dispatch, d } = useStore();
  const { toast } = useToast();
  const [choosing, setChoosing] = useState(false);
  const ctx: PlanContext = { today: d.today, rates: d.rates, monthlyIncome: d.plan.income, existingEmi: d.plan.existingEmi, marginal: d.marginal, annualIncome: state.profile.annualGrossIncome };

  const add = (kind: GoalKind) => {
    const g = GOAL_DEFAULTS[kind];
    dispatch({
      type: 'upsertGoal',
      goal: { id: uid(), kind, name: g.name, price: DEFAULT_PRICE[kind], targetMonth: addMonths(d.today.slice(0, 7), kind === 'house' ? 84 : 24), downPaymentPct: g.downPaymentPct, loanRate: d.rates[g.rateKey] ?? 9, loanYears: g.loanYears, extraCostPct: g.extraCostPct, saved: 0 },
    });
    setChoosing(false);
    toast(`${g.name} goal added. Edit its price and date below.`);
  };

  const plans = state.goals.map((g) => ({ g, p: planGoal(g, ctx) }));
  const totalMonthly = plans.reduce((a, x) => a + x.p.requiredMonthly, 0);
  const totalEmi = plans.reduce((a, x) => a + x.p.emi, 0);
  const surplus = Math.max(0, d.plan.income - d.plan.spend);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Goals</h1>
          <div className="sub">What you are saving for, and what it takes to get there</div>
        </div>
        <button className="btn primary" aria-expanded={choosing} onClick={() => setChoosing((c) => !c)}>
          <Icon name={choosing ? 'close' : 'plus'} size={18} />{choosing ? 'Cancel' : 'Add goal'}
        </button>
      </div>

      {choosing && (
        <Card title="What are you saving for?" sub="Pick one. You can change every number afterwards.">
          <GoalChooser onPick={add} />
        </Card>
      )}

      <section className="card" style={{ padding: 0, overflow: 'hidden' }} aria-label="Car, house and bike">
        <div className="showcase">
          <Suspense fallback={<div className="sub" style={{ padding: 24 }}>Loading 3D view...</div>}>
            <Showcase3D />
          </Suspense>
        </div>
        <div className="showcase-caption"><span><i style={{ background: 'var(--s1)' }} />Car</span><span><i style={{ background: 'var(--s2)' }} />House</span><span><i style={{ background: 'var(--s3)' }} />Bike</span><span className="muted">Drag to look around</span></div>
      </section>

      {plans.length > 0 && (
        <Card title="All goals together">
          <div className="grid g3">
            <div><div className="sub">Saving needed every month</div><div className="num" style={{ fontSize: 24, fontWeight: 650 }}>{inr(totalMonthly)}</div></div>
            <div><div className="sub">Your monthly surplus</div><div className="num" style={{ fontSize: 24, fontWeight: 650 }}>{inr(surplus)}</div><div className="sub">{d.plan.fromTransactions ? `Average of last ${d.plan.months} month(s)` : 'From your profile estimate'}</div></div>
            <div><div className="sub">New EMIs once all goals are bought</div><div className="num" style={{ fontSize: 24, fontWeight: 650 }}>{inr(totalEmi)}</div></div>
          </div>
          {totalMonthly > surplus ? (
            <div style={{ marginTop: 12 }}><Callout tone="bad">Your goals need {inr(totalMonthly - surplus)} a month more than you have left over. Something has to give: push dates out, trim prices, or raise income. The Plan tab shows which goal gets funded first.</Callout></div>
          ) : (
            <div style={{ marginTop: 12 }}><Callout tone="good">All goals fit inside your surplus with {inr(surplus - totalMonthly)} a month to spare. The Plan tab funds your emergency fund and any costly debt before goals, so check it for the real order.</Callout></div>
          )}
        </Card>
      )}

      {plans.length === 0 && !choosing && (
        <Card>
          <div className="empty-cta">
            <h2>No goals yet</h2>
            <p className="sub">Add a car, house or bike. You will see the price at your target date, the cash needed up front, the EMI, the total interest, and the monthly saving that gets you there.</p>
            <button className="btn" onClick={() => setChoosing(true)}><Icon name="plus" size={18} />Add your first goal</button>
          </div>
        </Card>
      )}
      {plans.map(({ g }) => <GoalCard key={g.id} goal={g} ctx={ctx} surplus={surplus} />)}
    </div>
  );
}

function GoalCard({ goal, ctx, surplus }: { goal: Goal; ctx: PlanContext; surplus: number }) {
  const { dispatch } = useStore();
  const { toast } = useToast();
  const [edit, setEdit] = useState(false);
  const [pace, setPace] = useState(Math.round(surplus / 4 / 1000) * 1000 || 10_000);
  const p = planGoal(goal, ctx);
  const set = (patch: Partial<Goal>) => dispatch({ type: 'upsertGoal', goal: { ...goal, ...patch } });
  const growthKey = GOAL_DEFAULTS[goal.kind].growthKey;
  const months = earliestMonths(goal, pace, ctx);
  const tone = p.verdict === 'comfortable' ? 'good' : p.verdict === 'stretch' ? 'watch' : 'bad';
  const hasLoan = p.loanAmount > 0;

  return (
    <Card
      title={<span>{goal.name} <span className="muted" style={{ fontWeight: 400 }}>· {monthLabel(goal.targetMonth)} ({monthsText(p.months)} away)</span></span>}
      sub={`Price today ${inr(goal.price)}`}
      right={<div className="row-actions"><button className="btn small" aria-expanded={edit} onClick={() => setEdit(!edit)}><Icon name={edit ? 'close' : 'pencil'} size={16} />{edit ? 'Done' : 'Edit'}</button><button className="btn small danger" onClick={() => { dispatch({ type: 'deleteGoal', id: goal.id }); toast(`${goal.name} goal removed`, { undo: () => dispatch({ type: 'upsertGoal', goal }) }); }}><Icon name="trash" size={16} />Remove</button></div>}
    >
      {edit && (
        <div className="form-grid" style={{ marginBottom: 16 }}>
          <Field label="Name"><input value={goal.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Num label="Price today (₹)" value={goal.price} onChange={(n) => set({ price: n })} min={0} />
          <Field label="Target month"><input type="month" value={goal.targetMonth} onChange={(e) => e.target.value && set({ targetMonth: e.target.value })} /></Field>
          <Num label="Down payment (%)" value={goal.downPaymentPct} onChange={(n) => set({ downPaymentPct: Math.min(100, n) })} min={0} />
          <Num label="Loan rate (%)" value={goal.loanRate} onChange={(n) => set({ loanRate: n })} min={0} hint="Ask your lender for the real quote" />
          <Num label="Loan tenure (years)" value={goal.loanYears} onChange={(n) => set({ loanYears: n })} min={0} />
          <Num label="Fees, tax, insurance (%)" value={goal.extraCostPct} onChange={(n) => set({ extraCostPct: n })} min={0} hint={goal.kind === 'house' ? 'Stamp duty + registration, varies by state' : 'Road tax, registration, insurance'} />
          <Num label="Already saved (₹)" value={goal.saved} onChange={(n) => set({ saved: n })} min={0} />
        </div>
      )}

      <div className="grid g2">
        <div>
          <h3 style={{ marginBottom: 8 }}>The numbers</h3>
          <dl className="kv">
            <dt>Price at {monthLabel(goal.targetMonth)} <span className="muted small">(+{d(ctx.rates[growthKey])}%/yr)</span></dt><dd>{inr(p.priceAtTarget)}</dd>
            <dt>Down payment ({goal.downPaymentPct}%)</dt><dd>{inr(p.downPayment)}</dd>
            <dt>Fees, tax, insurance ({goal.extraCostPct}%)</dt><dd>{inr(p.extraCost)}</dd>
            <dt className="strong">Cash needed on the day</dt><dd className="strong">{inr(p.upfront)}</dd>
            {hasLoan && <><dt>Loan</dt><dd>{inr(p.loanAmount)}</dd>
              <dt>EMI ({goal.loanRate}% · {goal.loanYears} yr)</dt><dd className="strong">{inr(p.emi)}</dd>
              <dt>Total interest</dt><dd className={p.interest > p.priceAtTarget * 0.25 ? 'watch' : ''}>{inr(p.interest)}</dd></>}
            <dt>Total cost of ownership</dt><dd>{inr(p.lifetimeCost)}</dd>
          </dl>
        </div>
        <div className="stack">
          <h3>What to do</h3>
          <div className="callout info"><span className="ic" aria-hidden>i</span><div>
            {p.requiredMonthly > 0 ? <>Put aside <b className="num">{inr(p.requiredMonthly)}</b> a month in a <b>{p.vehicle.toLowerCase()}</b> (about {pct(p.vehicleReturn)} a year after tax). </> : <>You already have enough set aside for the up-front cash. </>}
            {p.years < 3 ? 'The date is under 3 years away, so keep this out of equity: a market fall right before purchase would hurt.' : 'The date is 3+ years away, so some market exposure is reasonable.'}
          </div></div>
          {hasLoan && <div className="row"><Badge tone={tone}>{tone === 'good' ? '✓' : tone === 'watch' ? '!' : '✕'} {p.verdict}</Badge><span className="sub">Total EMIs would be {pct(p.foir * 100, 0)} of monthly income {ctx.existingEmi > 0 ? `(including ${inr(ctx.existingEmi)} you pay now)` : ''}</span></div>}
          <div className="row">
            <span className="sub">If I save</span>
            <div style={{ width: 130 }}><NumInput className="inline-input" value={pace} onChange={setPace} aria-label="Monthly saving" /></div>
            <span className="sub">a month, I can pay the up-front cash in <b>{monthsText(months)}</b>{Number.isFinite(months) ? ` (${monthLabel(addMonths(ctx.today.slice(0, 7), months))})` : ''}.</span>
          </div>
        </div>
      </div>

      {p.checks.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 8 }}>Sanity checks</h3>
          <ul className="clean">
            {p.checks.map((c) => (
              <li key={c.label}><Callout tone={c.ok ? 'good' : 'watch'}><b>{c.label}.</b> {c.detail}</Callout></li>
            ))}
          </ul>
        </div>
      )}

      {hasLoan && p.tenures.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 8 }}>Tenure trade-off</h3>
          <div className="table-wrap">
            <table className="table num">
              <thead><tr><th>Tenure</th><th className="r">EMI</th><th className="r">Total interest</th><th className="r">Interest as % of loan</th><th>Fits income?</th></tr></thead>
              <tbody>
                {p.tenures.map((t) => (
                  <tr key={t.years} style={t.years === goal.loanYears ? { background: 'var(--surface-2)' } : undefined}>
                    <td>{t.years} {t.years === 1 ? 'year' : 'years'} {t.years === goal.loanYears && <Badge>current</Badge>}</td>
                    <td className="r">{inr(t.emi)}</td>
                    <td className="r">{inrCompact(t.interest)}</td>
                    <td className="r">{pct((t.interest / p.loanAmount) * 100, 0)}</td>
                    <td><Badge tone={t.verdict === 'comfortable' ? 'good' : t.verdict === 'stretch' ? 'watch' : 'bad'}>{t.verdict === 'comfortable' ? '✓' : t.verdict === 'stretch' ? '!' : '✕'} {t.verdict} · {pct(t.foir * 100, 0)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sub" style={{ marginTop: 6 }}>Pick the shortest tenure whose EMI stays comfortable. Rate shown is what you entered; a flat rate for the whole tenure is assumed.</p>
        </div>
      )}
    </Card>
  );
}

const d = (n: number) => (Number.isFinite(n) ? +n.toFixed(1) : 0);

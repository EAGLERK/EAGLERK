import { useMemo, useState, type ReactNode } from 'react';
import { addMonths, insights, series, summarize } from '../engine/cashflow';
import { planGoal } from '../engine/goals';
import { Icon, type IconName } from '../components/icons';
import { Badge, Callout, Card, Delta, Empty, Toggle } from '../components/ui';
import { HBars, IncomeSpendChart, StackedBar } from '../components/charts';
import { inr, inrCompact, monthLabel, monthsText, pct } from '../lib/format';
import { useStore } from '../store';

export const GROUP_COLOR = { income: 'var(--s1)', needs: 'var(--s1)', wants: 'var(--s2)', savings: 'var(--s3)' } as const;
export const CLASS_COLOR = { equity: 'var(--s1)', debt: 'var(--s2)', cash: 'var(--s3)', gold: 'var(--s4)', other: 'var(--s5)' } as const;

type PillTone = 'good' | 'watch' | 'bad' | 'plain';
const MARK: Record<PillTone, string> = { good: '✓', watch: '!', bad: '✕', plain: '' };

function SummaryCard(props: {
  feature?: boolean;
  icon: IconName;
  title: string;
  subtitle: string;
  value: ReactNode;
  pill?: { text: string; tone: PillTone };
  extra?: ReactNode;
  foot: string;
  onFoot: () => void;
}) {
  return (
    <section className={`card sumcard ${props.feature ? 'feature' : ''}`}>
      <div className="body">
        <div className="head">
          <span className="icon-tile"><Icon name={props.icon} /></span>
          <div>
            <div className="title">{props.title}</div>
            <div className="subtitle">{props.subtitle}</div>
          </div>
        </div>
        <div className="big num">
          {props.value}
          {props.pill && <span className={`dpill ${props.pill.tone}`}>{MARK[props.pill.tone]} {props.pill.text}</span>}
        </div>
        {props.extra}
      </div>
      <button className="foot" onClick={props.onFoot}>{props.foot}<Icon name="arrow" size={18} /></button>
    </section>
  );
}

export function Dashboard({ go }: { go: (tab: string) => void }) {
  const { state, dispatch, d } = useStore();
  const [month, setMonth] = useState(d.latestMonth);
  const [range, setRange] = useState<'6' | '12'>('6');
  const cur = useMemo(() => summarize(state.txns, month), [state.txns, month]);
  const prev = useMemo(() => summarize(state.txns, addMonths(month, -1)), [state.txns, month]);
  const trend = useMemo(() => series(state.txns, month, Number(range)), [state.txns, month, range]);
  const notes = useMemo(() => insights(state.txns, month), [state.txns, month]);
  const recent = useMemo(() => [...state.txns].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8), [state.txns]);

  if (state.txns.length === 0 && state.investments.length === 0 && state.goals.length === 0) {
    return (
      <Empty title="Nothing here yet">
        <p style={{ marginBottom: 14 }}>Add your transactions, investments and goals, or load sample data to see how the numbers look.</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn primary" onClick={() => dispatch({ type: 'loadDemo' })}>Load sample data</button>
          <button className="btn" onClick={() => go('transactions')}>Import a bank statement</button>
        </div>
      </Empty>
    );
  }

  const p = d.portfolio;
  const ctx = { today: d.today, rates: d.rates, monthlyIncome: d.plan.income, existingEmi: d.plan.existingEmi, marginal: d.marginal, annualIncome: state.profile.annualGrossIncome };
  const hasData = cur.txnCount > 0;
  const needsPct = cur.income > 0 ? cur.needs / cur.income : 0;
  const wantsPct = cur.income > 0 ? cur.wants / cur.income : 0;
  const savePct = cur.income > 0 ? cur.saved / cur.income : 0;
  const saveTone: PillTone = cur.income <= 0 ? 'plain' : savePct >= 0.2 ? 'good' : savePct >= 0 ? 'watch' : 'bad';
  const rangeSaved = trend.reduce((a, t) => a + t.saved, 0);

  const nextGoal = [...state.goals].sort((a, b) => a.targetMonth.localeCompare(b.targetMonth))[0];
  const goalPlan = nextGoal ? planGoal(nextGoal, ctx) : null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <div className="sub">Summary of your money for {monthLabel(month)}</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn small" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>&larr;</button>
          <b style={{ minWidth: 86, textAlign: 'center' }}>{monthLabel(month)}</b>
          <button className="btn small" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>&rarr;</button>
        </div>
      </div>

      {!hasData && <Callout tone="info">No transactions in {monthLabel(month)}. Use the arrows to move to a month with data, or add transactions.</Callout>}

      <div className="sumgrid">
        <SummaryCard
          feature icon="wallet" title="Left over" subtitle={`${monthLabel(month)} · income minus spend`}
          value={inr(cur.saved)} pill={cur.income > 0 ? { text: `${pct(savePct * 100, 0)} saved`, tone: saveTone } : undefined}
          extra={<div className="mini"><div>Income<b>{inr(cur.income)}</b></div><div>Spent<b>{inr(cur.spend)}</b></div><div>Invested<b>{inr(cur.invested)}</b></div></div>}
          foot="See where it went" onFoot={() => go('transactions')}
        />
        <SummaryCard
          icon="net" title="Net worth" subtitle="Everything you hold minus what you owe"
          value={inrCompact(p.netWorth)} pill={p.total > 0 ? { text: `${pct(p.blendedPosttax)} after tax`, tone: 'plain' } : undefined}
          extra={<div className="sub">Assets {inrCompact(p.total)} &middot; Liabilities {inrCompact(p.liabilities)}</div>}
          foot="Analyze performance" onFoot={() => go('investments')}
        />
        {goalPlan && nextGoal ? (
          <SummaryCard
            icon="target" title={`Next goal: ${nextGoal.name}`} subtitle={`${monthLabel(nextGoal.targetMonth)} · ${monthsText(goalPlan.months)} away`}
            value={`${inr(goalPlan.requiredMonthly)}/mo`}
            pill={goalPlan.loanAmount > 0 ? { text: goalPlan.verdict, tone: goalPlan.verdict === 'comfortable' ? 'good' : goalPlan.verdict === 'stretch' ? 'watch' : 'bad' } : undefined}
            extra={<div className="sub">Save to have {inrCompact(goalPlan.upfront)} on the day{goalPlan.loanAmount > 0 ? `, then an EMI of ${inr(goalPlan.emi)}` : ''}</div>}
            foot="View goals" onFoot={() => go('goals')}
          />
        ) : (
          <SummaryCard
            icon="target" title="Goals" subtitle="Car, house, bike" value="None yet"
            extra={<div className="sub">Add a goal to see the cash and monthly saving it needs.</div>}
            foot="Add a goal" onFoot={() => go('goals')}
          />
        )}
      </div>

      <div className="grid g2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))' }}>
        <Card
          title="Cash flow"
          sub={<span>Left over, last {range} months <span style={{ marginLeft: 8 }}>Spend <Delta now={cur.spend} before={prev.spend} upIsGood={false} fmt={inrCompact} /></span></span>}
          right={<Toggle label="Range" value={range} onChange={setRange} options={[['6', '6 months'], ['12', '12 months']]} />}
        >
          <div className={`bigfig num ${rangeSaved < 0 ? 'bad' : ''}`} style={{ marginBottom: 8 }}>{inr(rangeSaved)}</div>
          <IncomeSpendChart data={trend.map((t) => ({ label: monthLabel(t.month, false), income: t.income, spend: t.spend, invested: t.invested }))} />
        </Card>

        <Card title="Where the money went" sub={`${monthLabel(month)} · bar colour shows needs, wants or investing`}>
          {cur.byCategory.length === 0 ? <p className="sub">No spending recorded.</p> : (
            <>
              <HBars rows={cur.byCategory.slice(0, 10).map((c) => ({ label: c.category, value: c.amount, color: GROUP_COLOR[c.group] }))} total={cur.spend + cur.invested} />
              {cur.byCategory.length > 10 && <p className="sub" style={{ marginTop: 6 }}>Top 10 of {cur.byCategory.length} categories. Filter by category in Transactions for the rest.</p>}
              <div className="legend" style={{ marginTop: 10 }}>
                <span><i style={{ background: GROUP_COLOR.needs }} />Needs</span>
                <span><i style={{ background: GROUP_COLOR.wants }} />Wants</span>
                <span><i style={{ background: GROUP_COLOR.savings }} />Invested</span>
              </div>
            </>
          )}
        </Card>
      </div>

      <div className="grid g2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))' }}>
        <Card title="50 / 30 / 20 check" sub="Guide: needs 50%, wants 30%, saving 20% of income">
          {cur.income > 0 ? (
            <dl className="kv">
              <dt>Needs <span className="muted small">(target 50%)</span></dt><dd className={needsPct > 0.5 ? 'watch' : 'good'}>{needsPct > 0.5 ? '! ' : '✓ '}{pct(needsPct * 100, 0)} &middot; {inr(cur.needs)}</dd>
              <dt>Wants <span className="muted small">(target 30%)</span></dt><dd className={wantsPct > 0.3 ? 'watch' : 'good'}>{wantsPct > 0.3 ? '! ' : '✓ '}{pct(wantsPct * 100, 0)} &middot; {inr(cur.wants)}</dd>
              <dt>Saved <span className="muted small">(target 20%+)</span></dt><dd className={savePct < 0.2 ? 'watch' : 'good'}>{savePct < 0.2 ? '! ' : '✓ '}{pct(savePct * 100, 0)} &middot; {inr(cur.saved)}</dd>
            </dl>
          ) : <p className="sub">Needs income recorded for the month.</p>}
          <div style={{ marginTop: 14 }} className="stack">
            {notes.map((n, i) => <Callout key={i} tone={n.level}>{n.text}</Callout>)}
          </div>
        </Card>

        <Card title="What you own" sub="By asset class" right={<button className="btn small" onClick={() => go('investments')}>Manage</button>}>
          {p.total > 0 ? (
            <StackedBar parts={[
              { label: 'Equity', value: p.byClass.equity, color: CLASS_COLOR.equity },
              { label: 'Debt', value: p.byClass.debt, color: CLASS_COLOR.debt },
              { label: 'Cash', value: p.byClass.cash, color: CLASS_COLOR.cash },
              { label: 'Gold', value: p.byClass.gold, color: CLASS_COLOR.gold },
              { label: 'Other', value: p.byClass.other, color: CLASS_COLOR.other },
            ]} />
          ) : <p className="sub">Add investments to see your mix.</p>}
          {p.holdings.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table className="table num">
                <thead><tr><th>Largest holdings</th><th className="r">Value</th><th className="r">After tax and inflation</th></tr></thead>
                <tbody>
                  {[...p.holdings].sort((a, b) => b.value - a.value).slice(0, 5).map((h) => (
                    <tr key={h.inv.id}>
                      <td>{h.inv.name}</td>
                      <td className="r" style={{ whiteSpace: 'nowrap' }}>{inrCompact(h.value)}</td>
                      <td className={`r ${h.real < 0.5 ? 'bad' : ''}`} style={{ whiteSpace: 'nowrap' }}>{h.real < 0.5 ? '\u2715 ' : ''}{pct(h.real)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {state.goals.length > 0 && (
        <Card title="Goals at a glance" right={<button className="btn small" onClick={() => go('goals')}>Plan goals</button>}>
          <div className="table-wrap">
            <table className="table num">
              <thead><tr><th>Goal</th><th>When</th><th className="r">Cash needed</th><th className="r">Save / month</th><th className="r">EMI after</th><th>Affordability</th></tr></thead>
              <tbody>
                {state.goals.map((g) => {
                  const pl = planGoal(g, ctx);
                  return (
                    <tr key={g.id}>
                      <td>{g.name}</td>
                      <td>{monthLabel(g.targetMonth)} <span className="muted small">({pl.months} mo)</span></td>
                      <td className="r">{inrCompact(pl.upfront)}</td>
                      <td className="r">{inr(pl.requiredMonthly)}</td>
                      <td className="r">{pl.loanAmount > 0 ? inr(pl.emi) : '-'}</td>
                      <td>{pl.loanAmount > 0 ? <Badge tone={pl.verdict === 'comfortable' ? 'good' : pl.verdict === 'stretch' ? 'watch' : 'bad'}>{pl.verdict === 'comfortable' ? '✓ ' : pl.verdict === 'stretch' ? '! ' : '✕ '}{pl.verdict} ({pct(pl.foir * 100, 0)} of income)</Badge> : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {recent.length > 0 && (
        <Card title="Recent activity" right={<button className="btn small" onClick={() => go('transactions')}>View all</button>}>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Description</th><th>Category</th><th>Date</th><th className="r">Amount</th></tr></thead>
              <tbody>
                {recent.map((t) => (
                  <tr key={t.id}>
                    <td style={{ overflowWrap: 'anywhere' }}>{t.description}</td>
                    <td><span className="cat-pill">{t.category}</span></td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>{t.date}</td>
                    <td className={`r num ${t.type === 'income' ? 'good' : ''}`} style={{ whiteSpace: 'nowrap' }}>{t.type === 'income' ? '+' : '-'}{inr(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

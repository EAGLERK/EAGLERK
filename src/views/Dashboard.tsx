import { useMemo, useState } from 'react';
import { addMonths, insights, series, summarize } from '../engine/cashflow';
import { planGoal } from '../engine/goals';
import { Badge, Callout, Card, Delta, Empty, Stat } from '../components/ui';
import { HBars, IncomeSpendChart, StackedBar } from '../components/charts';
import { inr, inrCompact, monthLabel, pct } from '../lib/format';
import { useStore } from '../store';

export const GROUP_COLOR = { income: 'var(--s1)', needs: 'var(--s1)', wants: 'var(--s2)', savings: 'var(--s3)' } as const;
export const CLASS_COLOR = { equity: 'var(--s1)', debt: 'var(--s2)', cash: 'var(--s3)', gold: 'var(--s4)', other: 'var(--s5)' } as const;

export function Dashboard({ go }: { go: (tab: string) => void }) {
  const { state, dispatch, d } = useStore();
  const [month, setMonth] = useState(d.latestMonth);
  const cur = useMemo(() => summarize(state.txns, month), [state.txns, month]);
  const prev = useMemo(() => summarize(state.txns, addMonths(month, -1)), [state.txns, month]);
  const trend = useMemo(() => series(state.txns, month, 6), [state.txns, month]);
  const notes = useMemo(() => insights(state.txns, month), [state.txns, month]);

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

  return (
    <div className="page">
      <div className="row between">
        <div className="row">
          <button className="btn small" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>&larr;</button>
          <h1>{monthLabel(month)}</h1>
          <button className="btn small" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>&rarr;</button>
        </div>
        {state.txns.some((t) => t.source === 'demo') && <Badge tone="watch">Showing sample data</Badge>}
      </div>

      {!hasData && <Callout tone="info">No transactions in {monthLabel(month)}. Use the arrows to move to a month with data, or add transactions.</Callout>}

      <div className="grid g4">
        <Stat label="Income" value={inr(cur.income)} delta={<Delta now={cur.income} before={prev.income} upIsGood fmt={inrCompact} />} />
        <Stat label="Spent" value={inr(cur.spend)} delta={<Delta now={cur.spend} before={prev.spend} upIsGood={false} fmt={inrCompact} />} note="Excludes money you invested" />
        <Stat label="Left over" value={inr(cur.saved)} tone={cur.saved < 0 ? 'bad' : undefined} delta={cur.income > 0 ? <span className={savePct >= 0.2 ? 'good' : savePct >= 0 ? 'watch' : 'bad'}>{savePct >= 0.2 ? '✓' : savePct >= 0 ? '!' : '✕'} {pct(savePct * 100, 0)} savings rate</span> : undefined} />
        <Stat label="Invested this month" value={inr(cur.invested)} note={cur.income > 0 ? `${pct((cur.invested / cur.income) * 100, 0)} of income` : undefined} />
      </div>

      <div className="grid g2">
        <Card title="Income vs spend" sub="Last 6 months">
          <IncomeSpendChart data={trend.map((t) => ({ label: monthLabel(t.month, false), income: t.income, spend: t.spend, invested: t.invested }))} />
        </Card>
        <Card title="Where the money went" sub={`${monthLabel(month)} · bar colour shows needs / wants / investing`}>
          {cur.byCategory.length === 0 ? <p className="sub">No spending recorded.</p> : (
            <>
              <HBars rows={cur.byCategory.map((c) => ({ label: c.category, value: c.amount, color: GROUP_COLOR[c.group] }))} total={cur.spend + cur.invested} />
              <div className="legend" style={{ marginTop: 10 }}>
                <span><i style={{ background: GROUP_COLOR.needs }} />Needs</span>
                <span><i style={{ background: GROUP_COLOR.wants }} />Wants</span>
                <span><i style={{ background: GROUP_COLOR.savings }} />Invested</span>
              </div>
            </>
          )}
        </Card>
      </div>

      <div className="grid g2">
        <Card title="50 / 30 / 20 check" sub="A rough guide: needs 50%, wants 30%, saving 20% of income">
          {cur.income > 0 ? (
            <dl className="kv">
              <dt>Needs <span className="muted small">(target 50%)</span></dt><dd className={needsPct > 0.5 ? 'watch' : 'good'}>{needsPct > 0.5 ? '! ' : '✓ '}{pct(needsPct * 100, 0)} · {inr(cur.needs)}</dd>
              <dt>Wants <span className="muted small">(target 30%)</span></dt><dd className={wantsPct > 0.3 ? 'watch' : 'good'}>{wantsPct > 0.3 ? '! ' : '✓ '}{pct(wantsPct * 100, 0)} · {inr(cur.wants)}</dd>
              <dt>Saved <span className="muted small">(target 20%+)</span></dt><dd className={savePct < 0.2 ? 'watch' : 'good'}>{savePct < 0.2 ? '! ' : '✓ '}{pct(savePct * 100, 0)} · {inr(cur.saved)}</dd>
            </dl>
          ) : <p className="sub">Needs income recorded for the month.</p>}
          <div style={{ marginTop: 14 }} className="stack">
            {notes.map((n, i) => <Callout key={i} tone={n.level}>{n.text}</Callout>)}
          </div>
        </Card>

        <Card title="Net worth" sub="Everything you hold minus what you owe" right={<button className="btn small" onClick={() => go('investments')}>Manage</button>}>
          <div className="num" style={{ fontSize: 28, fontWeight: 650 }}>{inr(p.netWorth)}</div>
          <dl className="kv" style={{ margin: '8px 0 14px' }}>
            <dt>Assets</dt><dd>{inr(p.total)}</dd>
            <dt>Liabilities</dt><dd>{inr(p.liabilities)}</dd>
            <dt>Blended return after tax</dt><dd>{p.total > 0 ? pct(p.blendedPosttax) : '-'}</dd>
          </dl>
          {p.total > 0 && (
            <StackedBar parts={[
              { label: 'Equity', value: p.byClass.equity, color: CLASS_COLOR.equity },
              { label: 'Debt', value: p.byClass.debt, color: CLASS_COLOR.debt },
              { label: 'Cash', value: p.byClass.cash, color: CLASS_COLOR.cash },
              { label: 'Gold', value: p.byClass.gold, color: CLASS_COLOR.gold },
              { label: 'Other', value: p.byClass.other, color: CLASS_COLOR.other },
            ]} />
          )}
        </Card>
      </div>

      {state.goals.length > 0 && (
        <Card title="Goals" right={<button className="btn small" onClick={() => go('goals')}>Plan goals</button>}>
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
    </div>
  );
}

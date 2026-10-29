import { useMemo } from 'react';
import { buildAdvice, projectWealth, type StepTone } from '../engine/advisor';
import { Badge, Callout, Card, Stat } from '../components/ui';
import { ProjectionChart, StackedBar } from '../components/charts';
import { inr, inrCompact, pct } from '../lib/format';
import { useStore } from '../store';

const STEP_LABEL: Record<StepTone, string> = { protect: 'Protect', safety: '1 · Safety net', debt: '2 · Kill costly debt', goal: '3 · Goals', wealth: '4 · Long-term wealth' };

export function Plan({ go }: { go: (tab: string) => void }) {
  const { state, d } = useStore();
  const advice = useMemo(
    () => buildAdvice({ profile: state.profile, income: d.plan.income, spend: d.plan.spend, currentInvestedPerMonth: d.plan.invested, portfolio: d.portfolio, liabilities: state.liabilities, goals: state.goals, rates: d.rates, marginal: d.marginal, today: d.today }),
    [state, d],
  );
  // Use what the plan puts into long-term wealth; if goals and safety nets take everything, fall back to what you invest today.
  const projMonthly = advice.wealthMonthly > 0 ? advice.wealthMonthly : d.plan.invested;
  const projection = useMemo(
    () => projectWealth(d.portfolio.total, d.portfolio.blendedPosttax || d.rates.fd * (1 - d.marginal), projMonthly, advice.wealthReturn || d.portfolio.blendedPosttax || d.rates.ppf, 20),
    [d, advice, projMonthly],
  );
  const end = projection[projection.length - 1];
  const rate = (advice.allocated > 0 ? (advice.allocated / Math.max(advice.capacity, 1)) : 0) * 100;

  return (
    <div className="page">
      <div className="row between">
        <h1>Your monthly plan</h1>
        <button className="btn" onClick={() => go('settings')}>Edit profile</button>
      </div>

      {!d.plan.fromTransactions && <Callout tone="watch">No income found in your transactions yet, so this plan uses the estimates in your profile ({inr(state.profile.monthlyIncome)} income, {inr(state.profile.monthlyExpenses)} spend). Import a statement for a plan based on what you actually spend.</Callout>}

      <div className="grid g4">
        <Stat label="Monthly income" value={inr(advice.income)} note={d.plan.fromTransactions ? `Average of ${d.plan.months} full month(s)` : 'Profile estimate'} />
        <Stat label="Monthly spend" value={inr(advice.spend)} note="Includes EMIs and rent" />
        <Stat label="Available to allocate" value={inr(advice.capacity)} tone={advice.capacity <= 0 ? 'bad' : undefined} delta={d.plan.invested > 0 ? <span className="muted">You invest {inr(d.plan.invested)} now</span> : undefined} />
        <Stat label="Emergency fund" value={`${inrCompact(advice.emergencyHave)} / ${inrCompact(advice.emergencyTarget)}`} tone={advice.emergencyHave >= advice.emergencyTarget ? 'good' : 'watch'} delta={<span>{advice.emergencyHave >= advice.emergencyTarget ? '✓ funded' : '! ' + pct((advice.emergencyHave / Math.max(advice.emergencyTarget, 1)) * 100, 0) + ' funded'}</span>} />
      </div>

      {advice.actions.length > 0 && (
        <Card title="Fix these first">
          <div className="stack">{advice.actions.map((a, i) => <Callout key={i} tone={a.level}>{a.text}</Callout>)}</div>
        </Card>
      )}

      <Card title="Where each rupee goes" sub={`${pct(rate, 0)} of your surplus is allocated. Order matters: each step is funded before the next.`}>
        {advice.lines.length === 0 ? <p className="sub">Nothing to allocate yet.</p> : (
          <div className="table-wrap">
            <table className="table num">
              <thead><tr><th>Step</th><th>Put it in</th><th className="r">Per month</th><th>Why</th></tr></thead>
              <tbody>
                {advice.lines.map((l, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: 'nowrap' }}><div className="sub">{STEP_LABEL[l.step]}</div><div style={{ fontWeight: 550 }}>{l.label}</div></td>
                    <td><div>{l.into}</div><div className="sub">{l.where}</div></td>
                    <td className="r" style={{ whiteSpace: 'nowrap' }}>{inr(l.monthly)}{l.short && <div><Badge tone="watch">! short</Badge></div>}</td>
                    <td className="sub" style={{ minWidth: 220 }}>{l.why}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={2} style={{ fontWeight: 650 }}>Total allocated</td>
                  <td className="r" style={{ fontWeight: 650 }}>{inr(advice.allocated)}</td>
                  <td className="sub">{advice.unallocated > 1 ? `${inr(advice.unallocated)} left unassigned` : 'Fully assigned'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {advice.wealthMonthly > 0 && (
          <div style={{ marginTop: 16 }} className="stack">
            <h3>Long-term mix ({advice.equityPct}% equity-oriented)</h3>
            <StackedBar format={inr} parts={advice.lines.filter((l) => l.step === 'wealth').map((l, i) => ({ label: l.into, value: l.monthly, color: ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)'][i % 5] }))} />
          </div>
        )}
      </Card>

      <Card title="Where this could take you" sub={`Today's holdings plus ${inr(projMonthly)} a month ${advice.wealthMonthly > 0 ? 'of long-term investing from the plan' : 'that you invest now (the plan has nothing left over for long-term yet)'}. Goal money is spent on goals, so it is left out.`}>
        <ProjectionChart data={projection} />
        <p className="sub" style={{ marginTop: 8 }}>
          In 20 years: about <b>{inrCompact(end.base)}</b> expected (range {inrCompact(end.low)} to {inrCompact(end.high)}), which is roughly <b>{inrCompact(end.base / Math.pow(1 + d.rates.inflation / 100, 20))}</b> in today&rsquo;s money. Returns are after tax. These are modelled assumptions, not predictions; real markets move in jumps, and the cautious line is the one to plan around.
        </p>
      </Card>

      {advice.goalPlans.length > 0 && (
        <Card title="Goal funding status">
          <div className="table-wrap">
            <table className="table num">
              <thead><tr><th>Goal</th><th className="r">Needed / month</th><th className="r">Funded</th><th>Status</th></tr></thead>
              <tbody>
                {advice.goalPlans.map(({ goal, plan, funded }) => {
                  const ok = funded >= plan.requiredMonthly - 1;
                  return (
                    <tr key={goal.id}>
                      <td>{goal.name}</td><td className="r">{inr(plan.requiredMonthly)}</td><td className="r">{inr(funded)}</td>
                      <td><Badge tone={ok ? 'good' : 'bad'}>{ok ? '✓ on track' : '✕ short by ' + inr(plan.requiredMonthly - funded)}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="disclaimer">
        This is a planning tool, not investment advice. The author is not a SEBI-registered investment adviser or research analyst. Rates labelled &ldquo;estimate&rdquo; are modelling assumptions and &ldquo;check&rdquo; rates vary by bank; edit them in Settings. Mutual fund investments are subject to market risks. Tax rules modelled: new regime, FY 2026-27, equity gains at 12.5% above Rs 1.25 lakh. Old-regime deductions (80C, 80D) are not modelled. Confirm anything large with a registered adviser or CA.
      </p>
    </div>
  );
}

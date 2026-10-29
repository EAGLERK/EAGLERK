import { useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { inr, inrCompact } from '../lib/format';
import { Toggle } from './ui';

const tick = { fill: 'var(--text-muted)', fontSize: 12 };
const axisLine = { stroke: 'var(--axis)' };

/** Compact axis labels: 50000 -> 50k, 250000 -> 2.5L */
const axisMoney = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e7) return `${+(n / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${+(n / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${+(n / 1e3).toFixed(0)}k`;
  return String(n);
};

interface TipProps {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string | number }>;
  titleFormat?: (l: string | number) => string;
}

function Tip({ active, payload, label, titleFormat }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tip">
      <div className="t">{titleFormat && label !== undefined ? titleFormat(label) : label}</div>
      {payload.map((p) => (
        <div className="l" key={String(p.dataKey)}>
          <span><i style={{ background: p.color }} />{p.name}</span>
          <span className="num">{inr(p.value ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

function ChartOrTable({ chart, table, label }: { chart: ReactNode; table: ReactNode; label: string }) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <div>
      <div className="row between" style={{ marginBottom: 8 }}>
        <span />
        <Toggle label={`${label} view`} value={view} onChange={setView} options={[['chart', 'Chart'], ['table', 'Table']]} />
      </div>
      {view === 'chart' ? chart : <div className="table-wrap">{table}</div>}
    </div>
  );
}

export interface IncomeSpendRow {
  label: string;
  income: number;
  spend: number;
  invested: number;
}

export function IncomeSpendChart({ data }: { data: IncomeSpendRow[] }) {
  return (
    <ChartOrTable
      label="Income and spend"
      chart={
        <>
          <div className="chart-box" role="img" aria-label="Bar chart of monthly income and spend">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} barGap={2} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--grid)" />
                <XAxis dataKey="label" tick={tick} axisLine={axisLine} tickLine={false} />
                <YAxis tick={tick} axisLine={false} tickLine={false} tickFormatter={axisMoney} width={44} />
                <Tooltip content={<Tip />} cursor={{ fill: 'var(--surface-2)' }} />
                <Bar isAnimationActive={false} dataKey="income" name="Income" fill="var(--s1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar isAnimationActive={false} dataKey="spend" name="Spend" fill="var(--s2)" radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="legend" style={{ marginTop: 8 }}>
            <span><i style={{ background: 'var(--s1)' }} />Income</span>
            <span><i style={{ background: 'var(--s2)' }} />Spend (excludes money you invested)</span>
          </div>
        </>
      }
      table={
        <table className="table num">
          <thead><tr><th>Month</th><th className="r">Income</th><th className="r">Spend</th><th className="r">Invested</th><th className="r">Left over</th></tr></thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.label}><td>{r.label}</td><td className="r">{inr(r.income)}</td><td className="r">{inr(r.spend)}</td><td className="r">{inr(r.invested)}</td><td className={`r ${r.income - r.spend < 0 ? 'bad' : ''}`}>{inr(r.income - r.spend)}</td></tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}

export interface BarRow {
  label: string;
  value: number;
  color: string;
  note?: string;
}

/** Horizontal bars with the value printed on every row, so colour is never the only channel. */
export function HBars({ rows, total }: { rows: BarRow[]; total?: number }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const sum = total ?? rows.reduce((a, r) => a + r.value, 0);
  return (
    <div role="list">
      {rows.map((r) => (
        <div className="hbar-row" role="listitem" key={r.label} title={`${r.label}: ${inr(r.value)}`}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
          <div className="hbar-track"><div className="hbar-fill" style={{ width: `${(r.value / max) * 100}%`, background: r.color }} /></div>
          <span className="num right">{inr(r.value)} <span className="muted small">{sum > 0 ? `${((r.value / sum) * 100).toFixed(0)}%` : ''}</span></span>
        </div>
      ))}
    </div>
  );
}

export interface Part {
  label: string;
  value: number;
  color: string;
}

export function StackedBar({ parts, format = inrCompact }: { parts: Part[]; format?: (n: number) => string }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  const shown = parts.filter((p) => p.value > 0);
  return (
    <div className="stack">
      <div className="stackbar" role="img" aria-label={shown.map((p) => `${p.label} ${((p.value / total) * 100).toFixed(0)}%`).join(', ')}>
        {shown.map((p) => (
          <div key={p.label} style={{ flex: p.value, background: p.color }} title={`${p.label}: ${format(p.value)}`} />
        ))}
      </div>
      <div className="legend">
        {shown.map((p) => (
          <span key={p.label}><i style={{ background: p.color }} />{p.label} <b className="num">{total > 0 ? ((p.value / total) * 100).toFixed(0) : 0}%</b> <span className="muted num">{format(p.value)}</span></span>
        ))}
      </div>
    </div>
  );
}

export interface ProjPoint {
  year: number;
  low: number;
  base: number;
  high: number;
}

export function ProjectionChart({ data }: { data: ProjPoint[] }) {
  return (
    <ChartOrTable
      label="Projection"
      chart={
        <>
          <div className="chart-box" role="img" aria-label="Line chart of projected portfolio value for three return scenarios">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--grid)" />
                <XAxis dataKey="year" tick={tick} axisLine={axisLine} tickLine={false} tickFormatter={(y) => `${y}y`} />
                <YAxis tick={tick} axisLine={false} tickLine={false} tickFormatter={axisMoney} width={48} />
                <Tooltip content={<Tip titleFormat={(l) => `After ${l} years`} />} />
                <Line isAnimationActive={false} type="monotone" dataKey="high" name="Optimistic (+2.5 pts)" stroke="var(--text-muted)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="base" name="Expected" stroke="var(--s1)" strokeWidth={2.5} dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="low" name="Cautious (-2.5 pts)" stroke="var(--text-muted)" strokeDasharray="1 4" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="legend" style={{ marginTop: 8 }}>
            <span><i style={{ background: 'var(--s1)' }} />Expected</span>
            <span>Dashed: optimistic, dotted: cautious (return &plusmn;2.5 percentage points)</span>
          </div>
        </>
      }
      table={
        <table className="table num">
          <thead><tr><th>Years</th><th className="r">Cautious</th><th className="r">Expected</th><th className="r">Optimistic</th></tr></thead>
          <tbody>
            {data.filter((p) => p.year % 5 === 0 || p.year === data.length - 1).map((p) => (
              <tr key={p.year}><td>{p.year}</td><td className="r">{inrCompact(p.low)}</td><td className="r">{inrCompact(p.base)}</td><td className="r">{inrCompact(p.high)}</td></tr>
            ))}
          </tbody>
        </table>
      }
    />
  );
}

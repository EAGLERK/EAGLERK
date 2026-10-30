import { useEffect, useState, type ReactNode } from 'react';

export function Card({ title, sub, right, children, className = '' }: { title?: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || right) && (
        <div className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {sub && <div className="sub">{sub}</div>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export type Tone = 'good' | 'bad' | 'watch' | 'info';
const ICON: Record<Tone, string> = { good: '✓', bad: '✕', watch: '!', info: 'i' };

export function Callout({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <div className={`callout ${tone}`} role={tone === 'bad' ? 'alert' : undefined}>
      <span className="ic" aria-hidden>{ICON[tone]}</span>
      <div>{children}</div>
    </div>
  );
}

export function Badge({ tone, children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return <span className={`badge ${tone ?? ''}`} title={title}>{children}</span>;
}

export function Stat({ label, value, delta, tone, note }: { label: string; value: ReactNode; delta?: ReactNode; tone?: Tone; note?: ReactNode }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value num">{value}</div>
      {delta && <div className={`delta ${tone ?? ''}`}>{delta}</div>}
      {note && <div className="sub" style={{ marginTop: 2 }}>{note}</div>}
    </div>
  );
}

/** Number input that lets you clear the field and type freely, emitting only valid numbers. */
export function NumInput({ value, onChange, ...rest }: { value: number; onChange: (n: number) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  const [txt, setTxt] = useState(Number.isFinite(value) ? String(value) : '');
  useEffect(() => {
    if (Number(txt) !== value) setTxt(Number.isFinite(value) ? String(value) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      {...rest}
      inputMode="decimal"
      value={txt}
      onChange={(e) => {
        const v = e.target.value;
        setTxt(v);
        const n = Number(v.replace(/,/g, ''));
        if (v.trim() !== '' && !Number.isNaN(n)) onChange(n);
      }}
    />
  );
}

export function Field({ label, hint, required, wide, children }: { label: string; hint?: ReactNode; required?: boolean; /** Spans two columns of a form grid on wider screens. */ wide?: boolean; children: ReactNode }) {
  return (
    <label className={`field${wide ? ' span-2' : ''}`}>
      <span className={required ? 'req' : undefined}>{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function Num({ label, value, onChange, hint, min, step = 'any', required }: { label: string; value: number; onChange: (n: number) => void; hint?: ReactNode; min?: number; step?: string; required?: boolean }) {
  return (
    <Field label={label} hint={hint} required={required}>
      <NumInput value={value} onChange={(n) => onChange(min !== undefined ? Math.max(min, n) : n)} step={step} />
    </Field>
  );
}

export function Toggle<T extends string>({ value, options, onChange, label }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="pill-toggle" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} aria-pressed={value === v} onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card hero">
      <h2>{title}</h2>
      <div className="sub" style={{ marginTop: 6 }}>{children}</div>
    </div>
  );
}

export const Delta = ({ now, before, upIsGood, fmt }: { now: number; before: number; upIsGood: boolean; fmt: (n: number) => string }) => {
  if (!Number.isFinite(before) || before === 0 && now === 0) return null;
  const diff = now - before;
  if (Math.abs(diff) < Math.max(1, 0.02 * Math.max(Math.abs(now), Math.abs(before)))) return <span className="muted">about the same as last month</span>;
  const good = diff > 0 === upIsGood;
  return (
    <span className={good ? 'good' : 'bad'}>
      {diff > 0 ? '▲' : '▼'} {fmt(Math.abs(diff))} {diff > 0 ? 'more' : 'less'} than last month
    </span>
  );
};

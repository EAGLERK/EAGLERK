import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { moveRing, popIn } from '../motion';

interface Step { target: string; title: string; body: string }

/** Each target is a real control on the screen. The first visible match wins, so the sidebar (desktop) and the tab bar (phone) both work. */
const STEPS: Step[] = [
  { target: 'main .btn.primary', title: 'Your main action', body: 'The green button is what you do most on each screen. On the Dashboard it adds a transaction; on Goals it adds a goal.' },
  { target: '[data-tour="nav-transactions"]', title: 'Bring in a bank statement', body: 'Import a CSV or Excel file from your bank. MyMoney works out the columns itself, and you can remove a file again with one tap.' },
  { target: '[data-tour="nav-goals"]', title: 'Plan a car, house or bike', body: 'See the price on the day, the EMI, and whether what you have left over each month can carry it.' },
  { target: '[data-tour="bell"]', title: 'Alerts', body: 'Overspending, goals that do not fit yet and backup reminders appear here. Turn on browser alerts in Settings to get them outside the page too.' },
  { target: '[data-tour="theme"]', title: 'Light or dark', body: 'Match your device, or pick one. MyMoney remembers it.' },
  { target: '[data-tour="nav-settings"]', title: 'Your data, your rules', body: 'Download a backup, change the rates the planner uses, or edit your name. You can take this tour again from here.' },
];

const visible = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
const find = (sel: string) => [...document.querySelectorAll(sel)].find(visible) as HTMLElement | undefined;
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), Math.max(lo, hi));

export function Tour({ onFinish }: { onFinish: () => void }) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [i, setI] = useState(0);
  const ring = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const first = useRef(true);
  const side = useRef<'right' | 'top' | 'bottom'>('bottom');

  // Only tour what is actually on this screen.
  useLayoutEffect(() => { setSteps(STEPS.filter((s) => find(s.target))); }, []);

  const place = (animate: boolean) => {
    const step = steps[i];
    const el = step && find(step.target);
    if (!el || !ring.current || !pop.current) return false;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    moveRing(ring.current, { left: r.left - 6, top: r.top - 6, width: r.width + 12, height: r.height + 12 }, !animate);
    const p = pop.current;
    const pw = p.offsetWidth;
    const ph = p.offsetHeight;
    const gap = 14;
    const wide = vw >= 900;
    let s: 'right' | 'top' | 'bottom' = wide && r.right < 300 ? 'right' : r.top > vh / 2 ? 'top' : 'bottom';
    if (s === 'top' && r.top - ph - gap < 8) s = 'bottom';
    if (s === 'bottom' && r.bottom + ph + gap > vh - 8) s = 'top';
    side.current = s;
    let left = 0;
    let top = 0;
    if (s === 'right') { left = r.right + gap + 6; top = clamp(r.top + r.height / 2 - ph / 2, 8, vh - ph - 8); }
    else { left = clamp(r.left + r.width / 2 - pw / 2, 12, vw - pw - 12); top = s === 'top' ? r.top - ph - gap - 6 : r.bottom + gap + 6; }
    p.style.left = `${left}px`;
    p.style.top = `${top}px`;
    p.dataset.side = s;
    p.style.setProperty('--ax', `${clamp(r.left + r.width / 2 - left, 18, pw - 18)}px`);
    p.style.setProperty('--ay', `${clamp(r.top + r.height / 2 - top, 18, ph - 18)}px`);
    return true;
  };

  useLayoutEffect(() => {
    if (!steps.length) return;
    const el = find(steps[i].target);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (!place(!first.current)) { if (i < steps.length - 1) setI(i + 1); else onFinish(); return; }
    if (pop.current) popIn(pop.current, side.current === 'right' ? { x: -6, y: 0 } : { y: side.current === 'top' ? 6 : -6 });
    first.current = false;
    next.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, i]);

  useEffect(() => {
    const again = () => { place(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onFinish(); };
    window.addEventListener('resize', again);
    window.addEventListener('scroll', again, true);
    document.addEventListener('keydown', key);
    return () => { window.removeEventListener('resize', again); window.removeEventListener('scroll', again, true); document.removeEventListener('keydown', key); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, i]);

  if (!steps.length) return null;
  const step = steps[i];
  const last = i === steps.length - 1;

  return (
    <>
      <div ref={ring} className="tour-ring" aria-hidden />
      <div ref={pop} className="tour-pop" role="dialog" aria-label={`Quick tour, step ${i + 1} of ${steps.length}`}>
        <b className="tour-title">{step.title}</b>
        <p className="sub">{step.body}</p>
        <div className="tour-actions">
          <span className="sub tour-count">{i + 1} of {steps.length}</span>
          <button className="btn small ghost" onClick={onFinish}>Skip tour</button>
          {i > 0 && <button className="btn small" onClick={() => setI(i - 1)}>Back</button>}
          <button ref={next} className="btn small primary" onClick={() => (last ? onFinish() : setI(i + 1))}>{last ? 'Done' : 'Next'}</button>
        </div>
      </div>
    </>
  );
}

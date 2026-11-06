import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useSync } from '../auth/CloudStore';
import { buildAlerts, type AppAlert } from '../engine/alerts';
import { planGoal } from '../engine/goals';
import { todayISO } from '../lib/format';
import { popIn } from '../motion';
import { useStore } from '../store';
import { Icon } from './icons';
import { Card } from './ui';
import { useToast } from './feedback';

/* ---------- Alerts, worked out from the person's own data ---------- */

export function useAlerts() {
  const { state, d } = useStore();
  const auth = useAuth();
  const sync = useSync();
  // The date can change while the tab stays open; re-check now and then and when the tab comes back to the front.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const id = window.setInterval(bump, 30 * 60 * 1000);
    document.addEventListener('visibilitychange', bump);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', bump); };
  }, []);

  const alerts = useMemo(() => {
    const today = todayISO();
    const ctx = { today: d.today, rates: d.rates, monthlyIncome: d.plan.income, existingEmi: d.plan.existingEmi, marginal: d.marginal, annualIncome: state.profile.annualGrossIncome };
    const goalsNeed = state.goals.reduce((a, g) => a + planGoal(g, ctx).requiredMonthly, 0);
    return buildAlerts({
      name: state.profile.name, today, txns: state.txns, goalCount: state.goals.length, goalsNeed,
      surplus: Math.max(0, d.plan.income - d.plan.spend), income: d.plan.income, existingEmi: d.plan.existingEmi,
      lastBackupAt: state.lastBackupAt, signedIn: !!auth?.user, sync: sync?.status,
      sample: state.txns.some((t) => t.source === 'demo'),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, d, auth?.user, sync?.status, tick]);

  const read = useMemo(() => new Set(state.alertsRead ?? []), [state.alertsRead]);
  return { alerts, read, unread: alerts.filter((a) => !read.has(a.id)) };
}

/* ---------- Browser alerts: system notifications while MyMoney is open in a tab ---------- */

const FLAG = 'mymoney:browserAlerts';
const SEEN = 'mymoney:notified';
const safe = <T,>(f: () => T, fallback: T): T => { try { return f(); } catch { return fallback; } };

export const browserAlertsSupported = () => typeof Notification !== 'undefined';
export const browserAlertsOn = () => browserAlertsSupported() && Notification.permission === 'granted' && safe(() => localStorage.getItem(FLAG) === '1', false);

export async function enableBrowserAlerts(): Promise<'on' | 'denied' | 'unsupported'> {
  if (!browserAlertsSupported()) return 'unsupported';
  const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (p !== 'granted') return 'denied';
  safe(() => localStorage.setItem(FLAG, '1'), undefined);
  return 'on';
}
export const disableBrowserAlerts = () => safe(() => localStorage.removeItem(FLAG), undefined);

function show(title: string, body: string, tag: string) {
  const n = new Notification(title, { body, tag });
  n.onclick = () => { window.focus(); n.close(); };
}
export const sendTestAlert = () => show('MyMoney alerts are on', 'You will see important alerts like this one while MyMoney is open in a tab.', 'test');

/** Important alerts (not welcome notes) that appear while the tab is in the background become a system notification, once each. */
export function useBrowserAlerts(unread: AppAlert[]) {
  useEffect(() => {
    if (!browserAlertsOn()) return;
    const seen = new Set<string>(safe(() => JSON.parse(localStorage.getItem(SEEN) ?? '[]') as string[], []));
    let changed = false;
    for (const a of unread) {
      if (a.level === 'info' || seen.has(a.id)) continue;
      seen.add(a.id);
      changed = true;
      if (document.hidden) show(a.title, a.body, a.id);
    }
    if (changed) safe(() => localStorage.setItem(SEEN, JSON.stringify([...seen].slice(-200))), undefined);
  }, [unread]);
}

/* ---------- The bell in the header ---------- */

const MARK: Record<AppAlert['level'], string> = { bad: '✕', watch: '!', info: 'i' };
const LEVEL: Record<AppAlert['level'], string> = { bad: 'Important: ', watch: 'Heads up: ', info: '' };

export function Notifications({ go, onTour }: { go: (tab: string) => void; onTour: () => void }) {
  const { dispatch } = useStore();
  const { alerts, read, unread } = useAlerts();
  useBrowserAlerts(unread);
  const [open, setOpen] = useState(false);
  const bell = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const close = (refocus = true) => { setOpen(false); if (refocus) bell.current?.focus(); };

  useEffect(() => {
    if (!open) return;
    if (panel.current) popIn(panel.current, { y: -6 });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onDown = (e: PointerEvent) => { if (!(e.target instanceof Node)) return; if (!panel.current?.contains(e.target) && !bell.current?.contains(e.target)) close(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
  }, [open]);

  const markRead = (ids: string[]) => ids.length && dispatch({ type: 'readAlerts', ids });
  const act = (a: AppAlert) => {
    markRead([a.id]);
    close(false);
    if (a.action?.tab === '#tour') onTour();
    else if (a.action) go(a.action.tab);
  };

  return (
    <div className="bell-wrap">
      <button
        ref={bell}
        className="bell btn icon ghost"
        data-tour="bell"
        aria-label={unread.length ? `Notifications, ${unread.length} unread` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="bell" size={18} />
        {unread.length > 0 && <span className="bell-count" aria-hidden>{unread.length > 9 ? '9+' : unread.length}</span>}
      </button>
      {open && (
        <div ref={panel} className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-head">
            <h2>Notifications</h2>
            <button className="btn small ghost" disabled={!unread.length} onClick={() => markRead(unread.map((a) => a.id))}>Mark all as read</button>
          </div>
          {alerts.length === 0 ? (
            <p className="sub notif-empty">You are all caught up.</p>
          ) : (
            <ul className="clean notif-list">
              {alerts.map((a) => (
                <li key={a.id} className={`notif ${read.has(a.id) ? 'read' : 'unread'}`}>
                  <span className={`notif-mark ${a.level}`} aria-hidden>{MARK[a.level]}</span>
                  <div className="notif-body">
                    <b>{LEVEL[a.level] && <span className="sr-only">{LEVEL[a.level]}</span>}{a.title}</b>
                    <p className="sub">{a.body}</p>
                    {a.action && <button className="btn small" onClick={() => act(a)}>{a.action.label}</button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="notif-foot">
            <span className="sub">Browser alerts: {browserAlertsOn() ? 'on' : 'off'}</span>
            <button className="linkbtn" onClick={() => { close(false); go('settings'); }}>Notification settings</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Settings card ---------- */

export function NotificationSettings() {
  const { toast } = useToast();
  const [, force] = useState(0);
  const supported = browserAlertsSupported();
  const permission = supported ? Notification.permission : 'denied';
  const on = browserAlertsOn();
  const refresh = () => force((n) => n + 1);

  const turnOn = async () => {
    const r = await enableBrowserAlerts();
    refresh();
    if (r === 'on') toast('Browser alerts are on');
    else if (r === 'denied') toast('Notifications are blocked for this site');
  };

  return (
    <Card title="Notifications" sub="Alerts about your money show under the bell at the top of every screen. You can also get them as browser notifications.">
      <div className="stack">
        <ul className="clean sub">
          <li>Spending above your income, or a category well above your own average</li>
          <li>Goals that need more than you have left over, and heavy loan payments</li>
          <li>Reminders to import a new statement and to back up your data</li>
          <li>Problems saving to your account</li>
        </ul>
        {!supported && <p className="sub">This browser does not support notifications. The bell still works.</p>}
        {supported && permission === 'denied' && <p className="sub">Notifications are blocked for this site. Allow them in your browser&rsquo;s site settings, then come back and turn them on.</p>}
        {supported && permission !== 'denied' && (
          <div className="row">
            {on ? (
              <>
                <span className="badge good">On</span>
                <button className="btn" onClick={sendTestAlert}>Send a test alert</button>
                <button className="btn" onClick={() => { disableBrowserAlerts(); refresh(); toast('Browser alerts are off'); }}>Turn off</button>
              </>
            ) : (
              <button className="btn primary" onClick={() => void turnOn()}><Icon name="bell" size={16} />Turn on browser alerts</button>
            )}
          </div>
        )}
        <p className="field-note">Browser alerts appear while MyMoney is open in a tab, even a background one. Alerts when the app is closed would need a push service, which this version does not have.</p>
      </div>
    </Card>
  );
}

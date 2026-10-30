import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ConfirmProvider, ToastProvider } from './components/feedback';
import { Icon, type IconName } from './components/icons';
import { features } from './features';
import { Dashboard } from './views/Dashboard';
import { Goals } from './views/Goals';
import { Investments } from './views/Investments';
import { Plan } from './views/Plan';
import { Settings } from './views/Settings';
import { Transactions } from './views/Transactions';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { AuthGate } from './auth/AuthGate';
import { CloudStore, useSync } from './auth/CloudStore';
import { authFeatures } from './auth/supabase';
import { StoreProvider, useStore } from './store';

interface Tab { id: string; label: string; short: string; icon: IconName }
const GROUPS: Array<{ label: string; tabs: Tab[] }> = [
  { label: 'Track', tabs: [{ id: 'dashboard', label: 'Dashboard', short: 'Home', icon: 'dashboard' }, { id: 'transactions', label: 'Transactions', short: 'Activity', icon: 'transactions' }] },
  {
    label: 'Plan',
    tabs: [
      { id: 'goals', label: 'Goals', short: 'Goals', icon: 'goals' },
      // Investing is switched off for now (see src/features.ts).
      ...(features.investing ? [{ id: 'investments', label: 'Investments', short: 'Invest', icon: 'investments' } as Tab, { id: 'plan', label: 'Plan', short: 'Plan', icon: 'plan' } as Tab] : []),
    ],
  },
  { label: 'General', tabs: [{ id: 'settings', label: 'Settings', short: 'Settings', icon: 'settings' }] },
];
const ALL = GROUPS.flatMap((g) => g.tabs);

const ShowcasePage = lazy(() => import('./three/ShowcasePage'));

type Theme = 'auto' | 'light' | 'dark';

const Mark = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden><path d="M7 22l6-7 4 4 8-10" stroke="#fff" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

function Shell() {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const sync = useSync();
  const [route, setRoute] = useState<string>(() => location.hash.slice(1) || 'dashboard');
  // 'add-transaction' is a shortcut route: the Transactions screen with its form already open.
  const wanted = route === 'add-transaction' ? 'transactions' : route;
  // A link to a screen that is switched off (or does not exist) lands on the Dashboard instead of a blank page.
  const tab = ALL.some((t) => t.id === wanted) ? wanted : 'dashboard';
  const mainRef = useRef<HTMLElement>(null);
  const [theme, setTheme] = useState<Theme>(() => {
    try { return ((localStorage.getItem('mymoney:theme') ?? localStorage.getItem('eaglerk:theme')) as Theme) || 'auto'; } catch { return 'auto'; }
  });

  // Only touch data-theme once the user has picked a theme, so a host's own light/dark setting is left alone.
  const picked = useRef(theme !== 'auto');
  useEffect(() => {
    if (theme !== 'auto') picked.current = true;
    if (theme === 'auto') {
      if (picked.current) document.documentElement.removeAttribute('data-theme');
    } else document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('mymoney:theme', theme); } catch { /* storage blocked */ }
  }, [theme]);

  useEffect(() => {
    const on = () => setRoute(location.hash.slice(1) || 'dashboard');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const go = (t: string) => { location.hash = t; setRoute(t); window.scrollTo({ top: 0 }); };

  // After moving to another screen, put keyboard and screen-reader focus on the new content.
  // Compare with the previous screen instead of using a "first render" flag, which React's dev double-run defeats.
  const prevTab = useRef(tab);
  useEffect(() => {
    if (prevTab.current === tab) return;
    prevTab.current = tab;
    mainRef.current?.focus({ preventScroll: true });
  }, [tab]);
  const current = ALL.find((t) => t.id === tab) ?? ALL[0];

  if (!state.onboarded) {
    return (
      <div className="frame">
        <div className="card hero" style={{ marginTop: 48 }}>
          <h1>MyMoney</h1>
          <p>See where your money goes each month, plan a car, house and bike, {features.investing ? 'and find out what to do with the surplus: FD, RD, PPF, mutual funds, or paying down debt.' : 'and see what each one will cost you.'} Everything stays in this browser.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn primary" onClick={() => dispatch({ type: 'startFresh' })}>Start with my own data</button>
            <button className="btn" onClick={() => dispatch({ type: 'loadDemo' })}>Explore with sample data</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="frame">
      <button className="skip" onClick={() => mainRef.current?.focus()}>Skip to main content</button>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand"><span className="brand-mark"><Mark /></span>MyMoney</div>
          <nav aria-label="Sections" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {GROUPS.map((g) => (
              <div className="side-group" key={g.label}>
                <div className="side-label">{g.label}</div>
                {g.tabs.map((t) => (
                  <button key={t.id} className="side-link" aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
                    <Icon name={t.icon} />{t.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="side-foot">
            {auth?.user ? (
              <>
                <b style={{ overflowWrap: 'anywhere' }}>{auth.user.email || auth.user.phone}</b>
                {sync && (
                  <span className={`sync-chip ${sync.status === 'saved' ? '' : sync.status === 'saving' ? 'saving' : 'bad'}`} role="status">
                    <i />{sync.status === 'saved' ? 'All changes saved' : sync.status === 'saving' ? 'Saving...' : sync.status === 'conflict' ? 'Needs your attention' : 'Not saved'}
                  </span>
                )}
                <button className="btn small" onClick={() => void (sync ? sync.signOutSafely() : auth.signOut())}>Sign out</button>
              </>
            ) : (
              <>
                <b>Your data stays here</b>
                <span className="sub">Stored in this browser only. Back it up now and then.</span>
                <button className="btn small" onClick={() => go('settings')}>Back up</button>
              </>
            )}
          </div>
        </aside>

        <div className="panel">
          <div className="crumbs">
            <div className="path">MyMoney<span className="crumb-rest"> &rsaquo; <b>{current.label}</b></span></div>
            {state.txns.some((t) => t.source === 'demo') && <span className="badge watch">Sample data</span>}
            <div className="pill-toggle" role="group" aria-label="Theme">
              {(['auto', 'light', 'dark'] as Theme[]).map((t) => <button key={t} aria-pressed={theme === t} onClick={() => setTheme(t)}>{t}</button>)}
            </div>
          </div>
          <main ref={mainRef} tabIndex={-1} id="main">
            {tab === 'transactions' ? <Transactions openAdd={route === 'add-transaction'} onCloseAdd={() => { location.hash = 'transactions'; setRoute('transactions'); }} />
              : tab === 'goals' ? <Goals />
              : features.investing && tab === 'investments' ? <Investments />
              : features.investing && tab === 'plan' ? <Plan go={go} />
              : tab === 'settings' ? <Settings />
              : <Dashboard go={go} />}
          </main>
        </div>
      </div>

      <nav className="tabbar" aria-label="Sections">
        {ALL.map((t) => (
          <button key={t.id} className="tab" aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
            <Icon name={t.icon} size={22} />{t.short}
          </button>
        ))}
      </nav>
    </div>
  );
}

function useHash() {
  const [hash, setHash] = useState(() => location.hash.slice(1));
  useEffect(() => {
    const on = () => setHash(location.hash.slice(1));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

function AppInner() {
  const hash = useHash();

  // Chromeless routes that render the 3D stills. They show no personal data, so they need no account.
  if (hash.startsWith('showcase-')) {
    const which = hash.slice('showcase-'.length) as 'all' | 'car' | 'house' | 'bike';
    return <Suspense fallback={null}><ShowcasePage which={which} /></Suspense>;
  }

  // No Supabase project configured: the original browser-only mode.
  if (!authFeatures.enabled) return <StoreProvider><Shell /></StoreProvider>;

  return (
    <AuthProvider>
      <AuthGate>
        <CloudStore>
          <Shell />
        </CloudStore>
      </AuthGate>
    </AuthProvider>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AppInner />
      </ConfirmProvider>
    </ToastProvider>
  );
}

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ConfirmProvider, ToastProvider } from './components/feedback';
import { Icon, type IconName } from './components/icons';
import { DraftsProvider, useDrafts } from './components/Drafts';
import { Logo } from './components/Logo';
import { Notifications } from './components/Notifications';
import { SheetsProvider } from './components/Sheets';
import { Tour } from './components/Tour';
import { Voice } from './components/Voice';
import type { Tab as VoiceTab } from './voice/parse';
import { WelcomeDialog } from './components/WelcomeDialog';
import { features } from './features';
import { Dashboard } from './views/Dashboard';
import { Goals } from './views/Goals';
import { Notes } from './views/Notes';
import { Investments } from './views/Investments';
import { Plan } from './views/Plan';
import { Settings } from './views/Settings';
import { Transactions } from './views/Transactions';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { AuthGate } from './auth/AuthGate';
import { CloudStore, useSync } from './auth/CloudStore';
import { authFeatures } from './auth/supabase';
import { StoreProvider, useStore } from './store';
import { installControlMotion, routeIn } from './motion';

interface Tab { id: string; label: string; short: string; icon: IconName }
const THEMES: Array<{ id: Theme; label: string; icon: IconName }> = [
  { id: 'auto', label: 'Match my device', icon: 'monitor' },
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
];
/** The sections, in order. Investing is only there for people it fits, so this is read on every render, not once. */
const allTabs = (): Tab[] => [
  { id: 'dashboard', label: 'Dashboard', short: 'Home', icon: 'dashboard' },
  { id: 'transactions', label: 'Transactions', short: 'Activity', icon: 'transactions' },
  { id: 'goals', label: 'Goals', short: 'Goals', icon: 'goals' },
  // Investing is switched off for now (see src/features.ts).
  ...(features.investing ? [{ id: 'investments', label: 'Investments', short: 'Invest', icon: 'investments' } as Tab, { id: 'plan', label: 'Plan', short: 'Plan', icon: 'plan' } as Tab] : []),
  { id: 'notes', label: 'Notes', short: 'Notes', icon: 'notes' },
  { id: 'settings', label: 'Settings', short: 'Settings', icon: 'settings' },
];

const ShowcasePage = lazy(() => import('./three/ShowcasePage'));

type Theme = 'auto' | 'light' | 'dark';


/** A first name to offer when the account already has one (Google supplies it). */
function suggestedName(user: { user_metadata?: Record<string, unknown> } | null | undefined): string {
  const m = user?.user_metadata ?? {};
  const full = (typeof m.full_name === 'string' && m.full_name) || (typeof m.name === 'string' && m.name) || '';
  return full.trim();
}

/** Unsaved transactions live here, above the screens, so leaving Transactions can ask what to do with them. */
function Shell() {
  return <DraftsProvider><SheetsProvider><ShellInner /></SheetsProvider></DraftsProvider>;
}

const screenOf = (route: string) => (route === 'add-transaction' ? 'transactions' : route);

function ShellInner() {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const sync = useSync();
  const [route, setRoute] = useState<string>(() => location.hash.slice(1) || 'dashboard');
  // 'add-transaction' is a shortcut route: the Transactions screen with its form already open.
  const wanted = route === 'add-transaction' ? 'transactions' : route;
  // A link to a screen that is switched off (or does not exist) lands on the Dashboard instead of a blank page.
  const ALL = allTabs(); // after the store has set the country, so Investing appears only where it fits
  const tab = ALL.some((t) => t.id === wanted) ? wanted : 'dashboard';
  const mainRef = useRef<HTMLElement>(null);
  const drafts = useDrafts();
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const routeRef = useRef(route);
  routeRef.current = route;
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
    const on = () => {
      const next = location.hash.slice(1) || 'dashboard';
      // Back, forward or a typed address while there are unsaved transactions: stay put until the person decides.
      if (draftsRef.current.isDirty() && screenOf(next) !== 'transactions') {
        history.replaceState(null, '', `#${routeRef.current}`);
        draftsRef.current.guard(() => { location.hash = next; });
        return;
      }
      setRoute(next);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  // One set of listeners gives every control its press and hover motion.
  useEffect(() => installControlMotion(), []);

  const go = (t: string) => {
    const run = () => { location.hash = t; setRoute(t); window.scrollTo({ top: 0 }); };
    if (screenOf(t) === 'transactions') run(); else drafts.guard(run);
  };

  // After moving to another screen, put keyboard and screen-reader focus on the new content.
  // Compare with the previous screen instead of using a "first render" flag, which React's dev double-run defeats.
  const prevTab = useRef(tab);
  useEffect(() => {
    if (prevTab.current === tab) return;
    prevTab.current = tab;
    mainRef.current?.focus({ preventScroll: true });
    routeIn(mainRef.current);
  }, [tab]);
  const current = ALL.find((t) => t.id === tab) ?? ALL[0];
  const currentTheme = THEMES.find((t) => t.id === theme) ?? THEMES[0];

  const startTour = () => { go('dashboard'); dispatch({ type: 'tour', done: false }); };

  return (
    <div className="frame">
      <button className="skip" onClick={() => mainRef.current?.focus()}>Skip to main content</button>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand"><Logo />MyMoney</div>
          <nav aria-label="Sections" className="side-group">
            {ALL.map((t) => (
              <button key={t.id} className="side-link" data-tour={`nav-${t.id}`} aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
                <Icon name={t.icon} />{t.label}
              </button>
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
                <button className="btn small" onClick={() => drafts.guard(() => void (sync ? sync.signOutSafely() : auth.signOut()))}>Sign out</button>
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
            {/* Only for data loaded by an earlier version that had sample data: a way to see what it is and remove it. */}
            {state.txns.some((t) => t.source === 'demo') && <button className="badge watch badge-btn" title="This is sample data. Open Settings to remove it." onClick={() => go('settings')}>Sample<span className="crumb-rest"> data</span></button>}
            {state.onboarded && features.voice && <Voice go={go} theme={theme} setTheme={setTheme} tabs={ALL.map((t) => t.id as VoiceTab)} />}
            {state.onboarded && <Notifications go={go} onTour={startTour} />}
            <div className="pill-toggle theme-switch" data-tour="theme" role="group" aria-label="Colour theme">
              {THEMES.map(({ id, label, icon }) => <button key={id} aria-pressed={theme === id} aria-label={label} title={label} onClick={() => setTheme(id)}><Icon name={icon} size={18} /></button>)}
            </div>
            {/* On a phone the three buttons would take a third of the header, so one button steps through the same three choices. */}
            <button className="btn icon ghost theme-cycle" data-tour="theme" aria-label={`Colour theme: ${currentTheme.label}. Tap to change.`} title={currentTheme.label} onClick={() => setTheme(THEMES[(THEMES.findIndex((t) => t.id === theme) + 1) % THEMES.length].id)}>
              <Icon name={currentTheme.icon} size={20} />
            </button>
          </div>
          <main ref={mainRef} tabIndex={-1} id="main">
            {tab === 'transactions' ? <Transactions openAdd={route === 'add-transaction'} onCloseAdd={() => { location.hash = 'transactions'; setRoute('transactions'); }} />
              : tab === 'goals' ? <Goals />
              : tab === 'notes' ? <Notes />
              : features.investing && tab === 'investments' ? <Investments />
              : features.investing && tab === 'plan' ? <Plan go={go} />
              : tab === 'settings' ? <Settings />
              : <Dashboard go={go} />}
          </main>
        </div>
      </div>

      <nav className="tabbar" aria-label="Sections">
        {ALL.map((t) => (
          <button key={t.id} className="tab" data-tour={`nav-${t.id}`} aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
            <Icon name={t.icon} size={22} />{t.short}
          </button>
        ))}
      </nav>

      {!state.onboarded && <WelcomeDialog suggestedName={suggestedName(auth?.user)} onStart={(name, country, currency) => dispatch({ type: 'startFresh', name, country, currency })} />}
      {state.onboarded && !state.tourDone && <Tour onFinish={() => dispatch({ type: 'tour', done: true })} />}
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

import { useEffect, useRef, useState } from 'react';
import { Dashboard } from './views/Dashboard';
import { Goals } from './views/Goals';
import { Investments } from './views/Investments';
import { Plan } from './views/Plan';
import { Settings } from './views/Settings';
import { Transactions } from './views/Transactions';
import { StoreProvider, useStore } from './store';

const TABS = [
  ['dashboard', 'Dashboard'],
  ['transactions', 'Transactions'],
  ['goals', 'Goals'],
  ['investments', 'Investments'],
  ['plan', 'Plan'],
  ['settings', 'Settings'],
] as const;

type Theme = 'auto' | 'light' | 'dark';

function Shell() {
  const { state, dispatch } = useStore();
  const [tab, setTab] = useState<string>(() => (location.hash.slice(1) || 'dashboard'));
  const [theme, setTheme] = useState<Theme>(() => {
    try { return (localStorage.getItem('eaglerk:theme') as Theme) || 'auto'; } catch { return 'auto'; }
  });

  // Only touch data-theme once the user has picked a theme, so a host's own light/dark setting is left alone.
  const picked = useRef(theme !== 'auto');
  useEffect(() => {
    if (theme !== 'auto') picked.current = true;
    if (theme === 'auto') {
      if (picked.current) document.documentElement.removeAttribute('data-theme');
    } else document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('eaglerk:theme', theme); } catch { /* storage blocked */ }
  }, [theme]);

  useEffect(() => {
    const on = () => setTab(location.hash.slice(1) || 'dashboard');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const go = (t: string) => { location.hash = t; setTab(t); window.scrollTo({ top: 0 }); };

  if (!state.onboarded) {
    return (
      <div className="app">
        <div className="card hero" style={{ marginTop: 48 }}>
          <h1>Eaglerk</h1>
          <p>See where your money goes each month, plan a car, house and bike, and find out what to do with the surplus: FD, RD, PPF, mutual funds, or paying down debt. Everything stays in this browser.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn primary" onClick={() => dispatch({ type: 'startFresh' })}>Start with my own data</button>
            <button className="btn" onClick={() => dispatch({ type: 'loadDemo' })}>Explore with sample data</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 32 32"><path d="M7 22l6-7 4 4 8-10" stroke="#fff" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          Eaglerk
        </div>
        <div className="pill-toggle" role="group" aria-label="Theme">
          {(['auto', 'light', 'dark'] as Theme[]).map((t) => <button key={t} aria-pressed={theme === t} onClick={() => setTheme(t)}>{t}</button>)}
        </div>
      </header>
      <nav className="nav" aria-label="Sections">
        {TABS.map(([id, label]) => <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => go(id)}>{label}</button>)}
      </nav>
      <main>
        {tab === 'transactions' ? <Transactions />
          : tab === 'goals' ? <Goals />
          : tab === 'investments' ? <Investments />
          : tab === 'plan' ? <Plan go={go} />
          : tab === 'settings' ? <Settings />
          : <Dashboard go={go} />}
      </main>
    </div>
  );
}

export default function App() {
  return <StoreProvider><Shell /></StoreProvider>;
}

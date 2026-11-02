import { useEffect, useRef, useState } from 'react';
import { dialogIn } from '../motion';
import { features } from '../features';
import { authFeatures } from '../auth/supabase';
import { Logo } from './Logo';

/**
 * Shown over the Dashboard the first time someone arrives (right after signing up, or on first visit without an account).
 * It cannot be dismissed: a name is asked for first, and either choice moves on.
 */
export function WelcomeDialog({ suggestedName, onStart, onDemo }: { suggestedName: string; onStart: (name: string) => void; onDemo: (name: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(suggestedName);
  const ready = name.trim().length > 0;

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) { d.showModal(); dialogIn(d); }
  }, []);

  return (
    <dialog ref={ref} className="modal welcome" aria-labelledby="welcome-title" aria-describedby="welcome-sub" onCancel={(e) => e.preventDefault()}>
      <form className="welcome-card" onSubmit={(e) => { e.preventDefault(); if (ready) onStart(name); }}>
        <div className="brand" style={{ padding: 0 }}><Logo />MyMoney</div>
        <div>
          <h1 id="welcome-title" style={{ marginBottom: 4 }}>Let&rsquo;s set up your profile</h1>
          <p id="welcome-sub" className="sub">
            See where your money goes each month, plan a car, house and bike{features.investing ? ', and decide what to do with the surplus' : ''}. Everything stays {authFeatures.enabled ? 'in your account' : 'in this browser'}.
          </p>
        </div>
        <div className="field">
          <label htmlFor="your-name">What should we call you?</label>
          <input id="your-name" autoFocus autoComplete="given-name" placeholder="Your name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {!ready && <p className="why" role="status">Enter your name to start with your own data.</p>}
        <button className="btn primary" type="submit" disabled={!ready}>Start with my own data</button>
        <button className="btn block" type="button" onClick={() => onDemo(name)}>Explore with sample data</button>
      </form>
    </dialog>
  );
}

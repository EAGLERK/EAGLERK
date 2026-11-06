import { useEffect, useRef, useState } from 'react';
import { dialogIn } from '../motion';
import { features } from '../features';
import { authFeatures } from '../auth/supabase';
import { COUNTRIES, countryOf, detectCountry } from '../lib/region';
import { Logo } from './Logo';

/**
 * Shown over the Dashboard the first time someone arrives (right after signing up, or on first visit without an account).
 * It cannot be dismissed: a name is asked for first.
 */
export function WelcomeDialog({ suggestedName, onStart }: { suggestedName: string; onStart: (name: string, country: string, currency: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(suggestedName);
  const guess = useRef(detectCountry()).current;
  const [country, setCountry] = useState(guess.country);
  const currency = countryOf(country)?.currency ?? guess.currency;
  const ready = name.trim().length > 0;

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) { d.showModal(); dialogIn(d); }
  }, []);

  return (
    <dialog ref={ref} className="modal welcome" aria-labelledby="welcome-title" aria-describedby="welcome-sub" onCancel={(e) => e.preventDefault()}>
      <form className="welcome-card" onSubmit={(e) => { e.preventDefault(); if (ready) onStart(name, country, currency); }}>
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
        <div className="field">
          <label htmlFor="your-country">Where are you?</label>
          <select id="your-country" value={country} onChange={(e) => setCountry(e.target.value)}>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
          <span className="hint">Amounts will be in {new Intl.DisplayNames(['en'], { type: 'currency' }).of(currency) ?? currency} ({currency}). You can change this in Settings.</span>
        </div>
        {!ready && <p className="why" role="status">Enter your name to get started.</p>}
        <button className="btn primary" type="submit" disabled={!ready}>Get started</button>
      </form>
    </dialog>
  );
}

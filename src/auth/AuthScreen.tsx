import { useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { authFeatures } from './supabase';

const GoogleG = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

const Mark = () => (
  <svg width="20" height="20" viewBox="0 0 32 32" aria-hidden>
    <path d="M7 22l6-7 4 4 8-10" stroke="#fff" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function Shell({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="authwrap">
      <div className="authcard card">
        <div className="brand" style={{ padding: 0 }}>
          <span className="brand-mark"><Mark /></span>MyMoney
        </div>
        <div>
          <h1 style={{ marginBottom: 4 }}>{title}</h1>
          {sub && <p className="sub">{sub}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

function Password({ id, label, value, onChange, autoComplete, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string; hint?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="pwrow">
        <input id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required />
        <button type="button" className="btn small" aria-pressed={show} onClick={() => setShow((s) => !s)}>{show ? 'Hide' : 'Show'}</button>
      </div>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

type Mode = 'signin' | 'signup' | 'forgot';
type Method = 'email' | 'phone';

export function AuthScreen() {
  const auth = useAuth()!;
  const [mode, setMode] = useState<Mode>('signin');
  const [method, setMethod] = useState<Method>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [checkInbox, setCheckInbox] = useState<string | null>(null);

  const reset = (m: Mode) => {
    setMode(m);
    setError(null);
    setNotice(null);
    setCheckInbox(null);
    setAwaitingCode(false);
    setCode('');
  };

  const run = async (fn: () => Promise<{ ok: boolean; error?: string; needsConfirm?: boolean }>, after?: (r: { needsConfirm?: boolean }) => void) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await fn();
      if (!r.ok) setError(r.error ?? 'Something went wrong. Try again in a moment.');
      else after?.(r);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (mode === 'forgot') {
      return run(() => auth.resetPassword(email), () => setNotice('If an account exists for that email, a reset link is on its way.'));
    }
    if (method === 'phone') {
      if (mode === 'signin') return run(() => auth.phone.signIn(phone, password));
      if (awaitingCode) return run(() => auth.phone.verify(phone, code));
      return run(() => auth.phone.signUp(phone, password), () => {
        setAwaitingCode(true);
        setNotice('We sent a 6-digit code by SMS. Enter it below.');
      });
    }
    if (mode === 'signin') return run(() => auth.signInEmail(email, password));
    return run(() => auth.signUpEmail(email, password), (r) => {
      if (r.needsConfirm) setCheckInbox(email.trim());
    });
  };

  if (checkInbox) {
    return (
      <Shell title="Check your inbox" sub={`We sent a confirmation link to ${checkInbox}. Open it on this device to finish creating your account.`}>
        <p className="sub">Nothing arrived? Look in spam, or wait a minute and try again.</p>
        <button className="btn" onClick={() => reset('signin')}>Back to sign in</button>
      </Shell>
    );
  }

  const title = mode === 'signin' ? 'Sign in to MyMoney' : mode === 'signup' ? 'Create your account' : 'Reset your password';
  const sub = mode === 'forgot' ? 'Enter your email and we will send you a link.' : mode === 'signup' ? 'Your data is saved to your account, and other users cannot see it.' : undefined;
  const phoneBlocked = method === 'phone' && !authFeatures.phone && mode !== 'forgot';

  return (
    <Shell title={title} sub={sub}>
      {mode !== 'forgot' && authFeatures.google && (
        <>
          <button type="button" className="gbtn" disabled={busy} onClick={() => run(() => auth.signInGoogle())}>
            <GoogleG />Continue with Google
          </button>
          <div className="divider"><span>or</span></div>
        </>
      )}

      {mode !== 'forgot' && (
        <div className="pill-toggle" role="group" aria-label="Sign-in method" style={{ alignSelf: 'flex-start' }}>
          {(['email', 'phone'] as Method[]).map((m) => (
            <button key={m} type="button" aria-pressed={method === m} onClick={() => { setMethod(m); setError(null); setNotice(null); setAwaitingCode(false); }}>
              {m === 'email' ? 'Email' : 'Mobile number'}
            </button>
          ))}
        </div>
      )}

      {phoneBlocked ? (
        <div className="callout info"><span className="ic" aria-hidden>i</span><div>Sign-in with a mobile number is not switched on yet. Use your email or Google for now.</div></div>
      ) : (
        <form onSubmit={submit} className="stack" noValidate>
          {(method === 'email' || mode === 'forgot') ? (
            <div className="field">
              <label htmlFor="auth-email">Email</label>
              <input id="auth-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
          ) : (
            <div className="field">
              <label htmlFor="auth-phone">Mobile number</label>
              <input id="auth-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210 or +1 415 555 2671" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={awaitingCode} required />
            </div>
          )}

          {mode !== 'forgot' && !awaitingCode && (
            <Password
              id="auth-password"
              label="Password"
              value={password}
              onChange={setPassword}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              hint={mode === 'signup' ? 'At least 8 characters. A short phrase is stronger than a clever word.' : undefined}
            />
          )}

          {awaitingCode && (
            <div className="field">
              <label htmlFor="auth-code">SMS code</label>
              <input id="auth-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required />
            </div>
          )}

          {error && <div className="callout bad" role="alert"><span className="ic" aria-hidden>{'✕'}</span><div>{error}</div></div>}
          {notice && <div className="callout good" role="status"><span className="ic" aria-hidden>{'✓'}</span><div>{notice}</div></div>}

          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Please wait...' : mode === 'forgot' ? 'Send reset link' : awaitingCode ? 'Verify code' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      )}

      <div className="row" style={{ justifyContent: 'space-between' }}>
        {mode === 'signin' && (
          <>
            <button type="button" className="linkbtn" onClick={() => reset('signup')}>Create an account</button>
            {method === 'email' && <button type="button" className="linkbtn" onClick={() => reset('forgot')}>Forgot password?</button>}
          </>
        )}
        {mode === 'signup' && <button type="button" className="linkbtn" onClick={() => reset('signin')}>I already have an account</button>}
        {mode === 'forgot' && <button type="button" className="linkbtn" onClick={() => reset('signin')}>Back to sign in</button>}
      </div>
    </Shell>
  );
}

export function SetNewPassword() {
  const auth = useAuth()!;
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pw !== again) return setError('The two passwords do not match.');
    setBusy(true);
    setError(null);
    const r = await auth.updatePassword(pw);
    setBusy(false);
    if (!r.ok) setError(r.error);
  };

  return (
    <Shell title="Choose a new password" sub="You opened a reset link. Pick a password you have not used before.">
      <form onSubmit={submit} className="stack" noValidate>
        <Password id="new-password" label="New password" value={pw} onChange={setPw} autoComplete="new-password" hint="At least 8 characters." />
        <Password id="new-password-again" label="Repeat new password" value={again} onChange={setAgain} autoComplete="new-password" />
        {error && <div className="callout bad" role="alert"><span className="ic" aria-hidden>{'✕'}</span><div>{error}</div></div>}
        <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Please wait...' : 'Save password'}</button>
      </form>
    </Shell>
  );
}

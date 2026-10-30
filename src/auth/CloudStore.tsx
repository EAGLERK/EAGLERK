import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode } from 'react';
import { StoreProvider, clearLocalState, hasUserData, normalizeState, readLocalState, useStore, type Action, type AppState } from '../store';
import { useAuth } from './AuthContext';
import { loadCloud, saveCloud } from './cloud';
import { supabase } from './supabase';

export type SyncStatus = 'saved' | 'saving' | 'error' | 'conflict';

export interface SyncApi {
  status: SyncStatus;
  /** Writes any pending change now. Resolves when the server has answered. */
  flushNow(): Promise<void>;
  retry(): void;
  /** Overwrite the other device's changes with this device's data. */
  keepMine(): Promise<void>;
  /** Discard this device's unsaved changes and take what is in the account. */
  loadLatest(): Promise<void>;
  /** Sign out, first making sure nothing is left unsaved. */
  signOutSafely(): Promise<void>;
}

const SyncCtx = createContext<SyncApi | null>(null);
/** Null in browser-only mode. */
export const useSync = (): SyncApi | null => useContext(SyncCtx);

const SAVE_DELAY_MS = 1200;
const EMPTY = (): AppState => normalizeState({ version: 1, txns: [] })!;

type Phase =
  | { kind: 'loading' }
  | { kind: 'ask'; local: AppState }
  | { kind: 'error'; message: string }
  | { kind: 'ready' };

function Splash({ children }: { children: ReactNode }) {
  return (
    <div className="authwrap">
      <div className="authcard card">{children}</div>
    </div>
  );
}

function DispatchBridge({ target }: { target: React.MutableRefObject<Dispatch<Action> | null> }) {
  const { dispatch } = useStore();
  useEffect(() => {
    target.current = dispatch;
  }, [dispatch, target]);
  return null;
}

function SyncBar() {
  const sync = useSync()!;
  if (sync.status === 'conflict') {
    return (
      <div className="syncbar" role="alert">
        <span className="grow"><b>Your account changed on another device.</b> Choose which version to keep.</span>
        <button className="btn small" onClick={() => void sync.loadLatest()}>Load the latest</button>
        <button className="btn small" onClick={() => void sync.keepMine()}>Keep what I have here</button>
      </div>
    );
  }
  if (sync.status === 'error') {
    return (
      <div className="syncbar bad" role="alert">
        <span className="grow"><b>Could not save your latest changes.</b> They are still on screen. Keep this tab open and retry.</span>
        <button className="btn small" onClick={sync.retry}>Retry now</button>
      </div>
    );
  }
  return null;
}

export function CloudStore({ children }: { children: ReactNode }) {
  const auth = useAuth()!;
  const user = auth.user!;
  const db = supabase!;

  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [status, setStatusState] = useState<SyncStatus>('saved');

  const statusRef = useRef<SyncStatus>('saved');
  const setStatus = useCallback((s: SyncStatus) => {
    statusRef.current = s;
    setStatusState(s);
  }, []);

  const initialRef = useRef<AppState | null>(null);
  const latest = useRef<AppState | null>(null);
  /** The last state the server confirmed. Anything different from this is unsaved. */
  const savedRef = useRef<AppState | null>(null);
  const versionRef = useRef<number | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const inFlight = useRef<Promise<void> | null>(null);
  const dispatchRef = useRef<Dispatch<Action> | null>(null);

  // Load the account's data, or decide what a brand-new account starts with.
  useEffect(() => {
    let cancelled = false;
    setPhase({ kind: 'loading' });
    (async () => {
      const r = await loadCloud(db, user.id);
      if (cancelled) return;
      if (r.kind === 'error') return setPhase({ kind: 'error', message: r.message });
      if (r.kind === 'found') {
        const st = normalizeState(r.data);
        if (!st) return setPhase({ kind: 'error', message: 'Saved data could not be read.' });
        initialRef.current = st;
        latest.current = null;
        savedRef.current = null;
        versionRef.current = r.version;
        setStatus('saved');
        return setPhase({ kind: 'ready' });
      }
      const local = readLocalState();
      if (local && hasUserData(local)) return setPhase({ kind: 'ask', local });
      await begin(EMPTY(), false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, attempt]);

  /** Creates the account's row from `state`, then opens the app. */
  const begin = async (state: AppState, clearBrowserCopy: boolean) => {
    const res = await saveCloud(db, user.id, state, null);
    if (res.kind === 'conflict') return setAttempt((n) => n + 1); // another device created it first: load that instead
    if (res.kind === 'error') return setPhase({ kind: 'error', message: res.message });
    if (clearBrowserCopy) clearLocalState();
    initialRef.current = state;
    latest.current = null;
    savedRef.current = null;
    versionRef.current = res.version;
    setStatus('saved');
    setPhase({ kind: 'ready' });
  };

  const flush = useCallback(async (): Promise<void> => {
    if (inFlight.current) return inFlight.current;
    const run = async () => {
      for (;;) {
        const st = latest.current;
        if (!st || st === savedRef.current || statusRef.current === 'conflict') return; // nothing unsaved
        setStatus('saving');
        const res = await saveCloud(db, user.id, st, versionRef.current);
        if (res.kind === 'ok') {
          versionRef.current = res.version;
          savedRef.current = st;
          if (latest.current !== st) continue; // edited while saving: go round again
          return setStatus('saved');
        }
        return setStatus(res.kind === 'conflict' ? 'conflict' : 'error');
      }
    };
    inFlight.current = run().finally(() => {
      inFlight.current = null;
    });
    return inFlight.current;
  }, [db, user.id, setStatus]);

  const onChange = useCallback(
    (state: AppState) => {
      if (state === initialRef.current || state === latest.current) return;
      latest.current = state;
      if (statusRef.current === 'conflict') return; // hold edits until the user chooses
      setStatus('saving');
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush, setStatus],
  );

  const flushNow = useCallback(async () => {
    window.clearTimeout(timer.current);
    await flush();
  }, [flush]);

  const retry = useCallback(() => {
    if (statusRef.current === 'error') void flushNow();
  }, [flushNow]);

  const keepMine = useCallback(async () => {
    if (!latest.current) return setStatus('saved');
    setStatus('saving');
    const res = await saveCloud(db, user.id, latest.current, versionRef.current, true);
    if (res.kind === 'ok') {
      versionRef.current = res.version;
      savedRef.current = latest.current;
      return setStatus('saved');
    }
    setStatus('error');
  }, [db, user.id, setStatus]);

  const loadLatest = useCallback(async () => {
    const r = await loadCloud(db, user.id);
    if (r.kind !== 'found') return setStatus('error');
    const st = normalizeState(r.data);
    if (!st) return setStatus('error');
    versionRef.current = r.version;
    latest.current = st; // so the replace below is not saved straight back
    savedRef.current = st;
    dispatchRef.current?.({ type: 'replace', state: st });
    setStatus('saved');
  }, [db, user.id, setStatus]);

  const signOutSafely = useCallback(async () => {
    await flushNow();
    if (statusRef.current !== 'saved' && !window.confirm('Some changes could not be saved. Sign out anyway and lose them?')) return;
    await auth.signOut();
  }, [auth, flushNow]);

  // Do not lose edits: warn on close while anything is unsaved, and push pending edits when the tab is hidden.
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (statusRef.current !== 'saved') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden' && statusRef.current === 'saving') void flushNow();
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('visibilitychange', onHide);
      window.clearTimeout(timer.current);
    };
  }, [flushNow]);

  const api = useMemo<SyncApi>(() => ({ status, flushNow, retry, keepMine, loadLatest, signOutSafely }), [status, flushNow, retry, keepMine, loadLatest, signOutSafely]);

  if (phase.kind === 'loading') {
    return <Splash><p className="sub" role="status">Loading your data...</p></Splash>;
  }

  if (phase.kind === 'error') {
    return (
      <Splash>
        <h1>Could not load your data</h1>
        <p className="sub">Check your connection, then try again. Nothing has been changed.</p>
        <div className="row">
          <button className="btn primary" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
          <button className="btn" onClick={() => void auth.signOut()}>Sign out</button>
        </div>
      </Splash>
    );
  }

  if (phase.kind === 'ask') {
    const l = phase.local;
    return (
      <Splash>
        <h1>Found data on this device</h1>
        <p className="sub">
          This browser holds {l.txns.length} transactions, {l.investments.length} investments and {l.goals.length} goals from before accounts existed.
          Import them into <b>{user.email || user.phone || 'your account'}</b>?
        </p>
        <p className="sub">Importing moves them into your account and removes the copy kept in this browser.</p>
        <div className="row">
          <button className="btn primary" onClick={() => void begin(l, true)}>Import into my account</button>
          <button className="btn" onClick={() => void begin(EMPTY(), false)}>Start with an empty account</button>
        </div>
      </Splash>
    );
  }

  return (
    <SyncCtx.Provider value={api}>
      <StoreProvider initial={initialRef.current!} persistence={onChange}>
        <DispatchBridge target={dispatchRef} />
        <SyncBar />
        {children}
      </StoreProvider>
    </SyncCtx.Provider>
  );
}

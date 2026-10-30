import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { authFeatures, supabase } from './supabase';
import { friendlyAuthError, normalizePhone, validateEmail, validatePassword } from './validate';

export type Result = { ok: true } | { ok: false; error: string };
export type SignUpResult = Result | { ok: true; needsConfirm: true };

export interface AuthApi {
  user: User | null;
  /** True until the stored session (if any) has been checked. */
  loading: boolean;
  /** True after the user opened a password-reset link: they must choose a new password. */
  recovery: boolean;
  signInEmail(email: string, password: string): Promise<Result>;
  signUpEmail(email: string, password: string): Promise<SignUpResult>;
  signInGoogle(): Promise<Result>;
  resetPassword(email: string): Promise<Result>;
  updatePassword(password: string): Promise<Result>;
  signOut(): Promise<void>;
  deleteAccount(): Promise<Result>;
  phone: {
    signUp(phone: string, password: string): Promise<Result>;
    verify(phone: string, code: string): Promise<Result>;
    signIn(phone: string, password: string): Promise<Result>;
  };
}

const Ctx = createContext<AuthApi | null>(null);

/** The auth API, or null when no Supabase project is configured (browser-only mode). */
export const useAuth = (): AuthApi | null => useContext(Ctx);

const ok: Result = { ok: true };
const fail = (e: unknown): Result => ({ ok: false, error: friendlyAuthError(e) });
const redirectUrl = () => window.location.origin + window.location.pathname;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    // Keep this callback synchronous: calling back into supabase here can deadlock the client.
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') setRecovery(false);
      if (event === 'INITIAL_SESSION') setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signInEmail = useCallback(async (email: string, password: string): Promise<Result> => {
    const bad = validateEmail(email);
    if (bad) return { ok: false, error: bad };
    if (!password) return { ok: false, error: 'Enter your password.' };
    const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
    return error ? fail(error) : ok;
  }, []);

  const signUpEmail = useCallback(async (email: string, password: string): Promise<SignUpResult> => {
    const bad = validateEmail(email) ?? validatePassword(password, email);
    if (bad) return { ok: false, error: bad };
    const { data, error } = await supabase!.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: redirectUrl() },
    });
    if (error) return fail(error);
    // With email confirmation on, no session is returned yet. For an address that already has an account the
    // response looks the same on purpose, so the screen never reveals which emails are registered.
    if (!data.session) return { ok: true, needsConfirm: true };
    return ok;
  }, []);

  const signInGoogle = useCallback(async (): Promise<Result> => {
    const { error } = await supabase!.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectUrl() } });
    return error ? fail(error) : ok;
  }, []);

  const resetPassword = useCallback(async (email: string): Promise<Result> => {
    const bad = validateEmail(email);
    if (bad) return { ok: false, error: bad };
    const { error } = await supabase!.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectUrl() });
    // Same answer whether or not the address exists.
    return error && (error as { status?: number }).status === 429 ? fail(error) : ok;
  }, []);

  const updatePassword = useCallback(async (password: string): Promise<Result> => {
    const bad = validatePassword(password);
    if (bad) return { ok: false, error: bad };
    const { error } = await supabase!.auth.updateUser({ password });
    if (error) return fail(error);
    setRecovery(false);
    return ok;
  }, []);

  const signOut = useCallback(async () => {
    await supabase!.auth.signOut();
  }, []);

  const deleteAccount = useCallback(async (): Promise<Result> => {
    const { error } = await supabase!.rpc('delete_my_account');
    if (error) return fail(error);
    await supabase!.auth.signOut();
    return ok;
  }, []);

  const phone = useMemo<AuthApi['phone']>(
    () => ({
      async signUp(raw, password) {
        if (!authFeatures.phone) return { ok: false, error: 'Phone sign-in is not switched on yet.' };
        const number = normalizePhone(raw);
        if (!number) return { ok: false, error: 'Enter a valid mobile number, with +country code if it is not Indian.' };
        const bad = validatePassword(password);
        if (bad) return { ok: false, error: bad };
        const { error } = await supabase!.auth.signUp({ phone: number, password });
        return error ? fail(error) : ok;
      },
      async verify(raw, code) {
        const number = normalizePhone(raw);
        if (!number) return { ok: false, error: 'Enter a valid mobile number.' };
        if (!/^\d{6}$/.test(code.trim())) return { ok: false, error: 'Enter the 6-digit code from the SMS.' };
        const { error } = await supabase!.auth.verifyOtp({ phone: number, token: code.trim(), type: 'sms' });
        return error ? fail(error) : ok;
      },
      async signIn(raw, password) {
        if (!authFeatures.phone) return { ok: false, error: 'Phone sign-in is not switched on yet.' };
        const number = normalizePhone(raw);
        if (!number) return { ok: false, error: 'Enter a valid mobile number.' };
        if (!password) return { ok: false, error: 'Enter your password.' };
        const { error } = await supabase!.auth.signInWithPassword({ phone: number, password });
        return error ? fail(error) : ok;
      },
    }),
    [],
  );

  const api = useMemo<AuthApi>(
    () => ({ user: session?.user ?? null, loading, recovery, signInEmail, signUpEmail, signInGoogle, resetPassword, updatePassword, signOut, deleteAccount, phone }),
    [session, loading, recovery, signInEmail, signUpEmail, signInGoogle, resetPassword, updatePassword, signOut, deleteAccount, phone],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

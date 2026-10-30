import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Null when no Supabase project is configured. The app then runs in its original browser-only mode,
 * which keeps development, tests and the single-file build working without any account.
 *
 * Only the public anon key belongs here. The service_role key must never be put in front-end code.
 */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          // PKCE keeps tokens out of the URL hash, which the app already uses for its own navigation.
          flowType: 'pkce',
        },
      })
    : null;

export const authFeatures = {
  enabled: supabase !== null,
  google: import.meta.env.VITE_AUTH_GOOGLE !== '0',
  /** Phone sign-in needs an SMS provider configured in Supabase. Off until VITE_AUTH_PHONE=1. */
  phone: import.meta.env.VITE_AUTH_PHONE === '1',
};

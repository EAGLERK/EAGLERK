export function validateEmail(value: string): string | null {
  const e = value.trim();
  if (!e) return 'Enter your email.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return 'That email address does not look right.';
  return null;
}

const COMMON = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwertyui', 'qwerty123', 'iloveyou',
  'abcd1234', 'admin123', 'welcome1', 'letmein1', '11111111', '00000000', 'passw0rd', 'abc12345', 'monkey123',
]);

/** Supabase hashes passwords with bcrypt, which silently ignores everything after 72 bytes. */
const MAX_BYTES = 72;

export function validatePassword(pw: string, email?: string): string | null {
  if (pw.length < 8) return 'Use at least 8 characters.';
  if (new TextEncoder().encode(pw).length > MAX_BYTES) return 'Use 72 characters or fewer.';
  if (COMMON.has(pw.toLowerCase())) return 'That password is too common. Pick something harder to guess.';
  if (/^\d+$/.test(pw)) return 'Add letters as well as numbers.';
  if (email && pw.toLowerCase() === email.trim().toLowerCase()) return 'Your password cannot be your email address.';
  if (new Set(pw).size < 4) return 'Use a more varied password.';
  return null;
}

/**
 * Turns what a person types into E.164 (+919876543210), or null if it cannot be a real number.
 * A bare 10-digit number is read as Indian (mobile numbers start 6-9); anything else must carry a +country code.
 */
export function normalizePhone(raw: string): string | null {
  const s = raw.replace(/[\s\-().]/g, '');
  if (s.startsWith('+')) return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
  if (/^[6-9]\d{9}$/.test(s)) return `+91${s}`;
  if (/^0[6-9]\d{9}$/.test(s)) return `+91${s.slice(1)}`;
  if (/^91[6-9]\d{9}$/.test(s)) return `+${s}`;
  return null;
}

interface MaybeAuthError {
  message?: string;
  status?: number;
  code?: string;
}

/** Plain-language messages. Raw server text is never shown, so nothing about the backend leaks into the UI. */
export function friendlyAuthError(e: unknown): string {
  const err = (e ?? {}) as MaybeAuthError;
  const msg = (err.message ?? '').toLowerCase();
  const code = err.code ?? '';
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) return 'Email or password is incorrect.';
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) return 'Confirm your email first. Check your inbox for the link we sent.';
  if (err.status === 429 || code.includes('rate_limit') || msg.includes('rate limit') || msg.includes('too many')) return 'Too many attempts. Wait a minute and try again.';
  if (code === 'weak_password' || msg.includes('weak password') || msg.includes('password should')) return 'That password is too weak. Use a longer, less common one.';
  if (code === 'user_already_exists' || msg.includes('already registered')) return 'An account with this email already exists. Try signing in.';
  if (code === 'otp_expired' || msg.includes('expired') || msg.includes('invalid token') || code === 'invalid_otp') return 'That code is wrong or has expired. Request a new one.';
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('load failed')) return 'Cannot reach the server. Check your connection and try again.';
  if (msg.includes('provider is not enabled') || code === 'provider_disabled') return 'This sign-in method is not switched on yet.';
  return 'Something went wrong. Try again in a moment.';
}

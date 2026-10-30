import { describe, expect, it } from 'vitest';
import { friendlyAuthError, normalizePhone, validateEmail, validatePassword } from '../src/auth/validate';

describe('validateEmail', () => {
  it('accepts normal addresses and rejects junk', () => {
    expect(validateEmail('  me@example.com ')).toBeNull();
    expect(validateEmail('a.b+tag@mail.co.in')).toBeNull();
    for (const bad of ['', 'me', 'me@', 'me@x', 'me @x.com', '@x.com']) expect(validateEmail(bad)).not.toBeNull();
  });
});

describe('validatePassword', () => {
  it('requires 8+ characters', () => expect(validatePassword('abc123')).toMatch(/at least 8/));
  it('rejects common and numeric-only passwords', () => {
    expect(validatePassword('Password1')).toMatch(/too common/);
    expect(validatePassword('12345678')).toMatch(/too common/);
    expect(validatePassword('83920145')).toMatch(/letters/);
  });
  it('rejects the email itself and repetitive strings', () => {
    expect(validatePassword('me@example.com', 'ME@example.com')).toMatch(/email/);
    expect(validatePassword('aaaaaaaa')).toMatch(/varied/);
  });
  it('enforces the bcrypt 72-byte limit in bytes, not characters', () => {
    expect(validatePassword('abcdefgh1234'.repeat(6))).toBeNull(); // exactly 72 bytes
    expect(validatePassword('abcdefgh1234'.repeat(6) + 'x')).toMatch(/72/);
    expect(validatePassword('₹'.repeat(25) + 'ab1')).toMatch(/72/); // rupee sign is 3 bytes each
  });
  it('accepts a sensible passphrase', () => expect(validatePassword('blue-tiger-9-lantern')).toBeNull());
});

describe('normalizePhone', () => {
  it('reads bare Indian mobiles as +91', () => {
    expect(normalizePhone('98765 43210')).toBe('+919876543210');
    expect(normalizePhone('09876543210')).toBe('+919876543210');
    expect(normalizePhone('919876543210')).toBe('+919876543210');
    expect(normalizePhone('(+91) 98765-43210')).toBe('+919876543210');
  });
  it('accepts other countries only with a + code', () => {
    expect(normalizePhone('+14155552671')).toBe('+14155552671');
    expect(normalizePhone('4155552671')).toBeNull();
  });
  it('rejects numbers that cannot be real', () => {
    for (const bad of ['', '12345', '5876543210', '+0123456789', '+91', 'abcdefghij']) expect(normalizePhone(bad)).toBeNull();
  });
});

describe('friendlyAuthError', () => {
  it('maps known failures to plain language', () => {
    expect(friendlyAuthError({ code: 'invalid_credentials' })).toMatch(/incorrect/);
    expect(friendlyAuthError({ message: 'Invalid login credentials' })).toMatch(/incorrect/);
    expect(friendlyAuthError({ message: 'Email not confirmed' })).toMatch(/Confirm your email/);
    expect(friendlyAuthError({ status: 429 })).toMatch(/Too many/);
    expect(friendlyAuthError({ code: 'over_email_send_rate_limit' })).toMatch(/Too many/);
    expect(friendlyAuthError({ message: 'Failed to fetch' })).toMatch(/Cannot reach/);
    expect(friendlyAuthError({ code: 'otp_expired' })).toMatch(/code/);
  });
  it('never leaks raw server text', () => {
    const out = friendlyAuthError({ message: 'duplicate key value violates constraint "users_pkey" at 10.0.0.5' });
    expect(out).not.toMatch(/duplicate|users_pkey|10\.0/);
    expect(friendlyAuthError(undefined)).toBe('Something went wrong. Try again in a moment.');
  });
});

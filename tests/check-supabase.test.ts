import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const { check } = createRequire(import.meta.url)('../scripts/check-supabase.cjs') as {
  check: (env: { url?: string; key?: string; google?: boolean; phone?: boolean }, f: typeof fetch) => Promise<Array<{ level: string; text: string }>>;
};

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role: string) => `${b64({ alg: 'HS256' })}.${b64({ role })}.sig`;
const URL = 'https://abcdefghijkl.supabase.co';

/** A fake Supabase: `settings` answers /auth/v1/settings, `table` answers the user_data query. */
const fake = (settings: object | number, table: { status: number; body?: unknown }): typeof fetch =>
  (async (input: string) => {
    const isSettings = String(input).includes('/auth/v1/settings');
    const r = isSettings ? (typeof settings === 'number' ? { status: settings, body: {} } : { status: 200, body: settings }) : table;
    return { status: r.status, json: async () => r.body ?? null } as Response;
  }) as unknown as typeof fetch;

const good = { external: { email: true, google: true }, mailer_autoconfirm: false, disable_signup: false };
const levels = (rows: Array<{ level: string }>) => rows.map((r) => r.level);
const text = (rows: Array<{ text: string }>) => rows.map((r) => r.text).join('\n');

describe('check-supabase', () => {
  it('passes a correctly set up project', async () => {
    const rows = await check({ url: URL, key: jwt('anon') }, fake(good, { status: 401, body: { code: '42501' } }));
    expect(levels(rows)).not.toContain('FAIL');
    expect(text(rows)).toContain('refuses anonymous access');
  });

  it('refuses a service_role key and stops before any request', async () => {
    let called = false;
    const rows = await check({ url: URL, key: jwt('service_role') }, (async () => { called = true; return {} as Response; }) as unknown as typeof fetch);
    expect(rows[0].level).toBe('FAIL');
    expect(called).toBe(false);
  });

  it('fails when the table has not been created', async () => {
    const rows = await check({ url: URL, key: jwt('anon') }, fake(good, { status: 404, body: { code: 'PGRST205' } }));
    expect(text(rows)).toContain('Run supabase/schema.sql');
    expect(levels(rows)).toContain('FAIL');
  });

  it('fails loudly when anonymous callers can read rows', async () => {
    const rows = await check({ url: URL, key: jwt('anon') }, fake(good, { status: 200, body: [{ user_id: 'x' }] }));
    expect(text(rows)).toContain('Anyone without signing in can read');
  });

  it('warns when email confirmation is off and Google is not enabled', async () => {
    const rows = await check({ url: URL, key: jwt('anon') }, fake({ external: { email: true, google: false }, mailer_autoconfirm: true }, { status: 401, body: { code: '42501' } }));
    expect(text(rows)).toContain('Email confirmation is OFF');
    expect(text(rows)).toContain('Google sign-in is not enabled');
  });

  it('skips the Google warning when Google is switched off in the app', async () => {
    const rows = await check({ url: URL, key: jwt('anon'), google: false }, fake({ external: { email: true, google: false }, mailer_autoconfirm: false }, { status: 401, body: { code: '42501' } }));
    expect(text(rows)).not.toContain('Google sign-in is not enabled');
    expect(text(rows)).not.toContain('Google sign-in is enabled');
  });

  it('says so when the key is rejected or the project is unreachable', async () => {
    expect(text(await check({ url: URL, key: jwt('anon') }, fake(401, { status: 200 })))).toContain('rejected the key');
    const down = (async () => { throw Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } }); }) as unknown as typeof fetch;
    expect(text(await check({ url: URL, key: jwt('anon') }, down))).toContain('Cannot reach');
  });

  it('asks for the missing settings', async () => {
    expect((await check({}, fake(good, { status: 401 })))[0].level).toBe('FAIL');
  });
});

import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Runs supabase/schema.sql on a real (in-memory) Postgres and checks the row-level security rules.
 * Supabase's own pieces are stood in for: an auth schema with users, auth.uid() reading the JWT subject,
 * and the anon / authenticated roles that Supabase creates.
 */
const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

let db: PGlite;

async function as(role: 'anon' | 'authenticated' | 'postgres', uid: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`set role ${role}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role');
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant select, delete on auth.users to authenticated;
    grant usage on schema public to anon, authenticated;
  `);
  await db.exec(readFileSync('supabase/schema.sql', 'utf8'));
  await db.query(`insert into auth.users (id, email) values ($1, 'a@x.test'), ($2, 'b@x.test')`, [A, B]);
});

describe('user_data row-level security', () => {
  it('lets a user create and read their own row', async () => {
    await as('authenticated', A, `insert into public.user_data (user_id, data) values ($1, '{"n":"A"}')`, [A]);
    const r = await as('authenticated', A, `select data, version from public.user_data`);
    expect(r.rows).toEqual([{ data: { n: 'A' }, version: 1 }]);
  });

  it("refuses to create a row for someone else", async () => {
    await expect(
      as('authenticated', A, `insert into public.user_data (user_id, data) values ($1, '{"n":"evil"}')`, [B]),
    ).rejects.toThrow(/row-level security/i);
  });

  it("does not show another user's row", async () => {
    await as('authenticated', B, `insert into public.user_data (user_id, data) values ($1, '{"n":"B"}')`, [B]);
    const a = await as('authenticated', A, `select user_id from public.user_data`);
    const b = await as('authenticated', B, `select user_id from public.user_data`);
    expect(a.rows).toEqual([{ user_id: A }]);
    expect(b.rows).toEqual([{ user_id: B }]);
  });

  it("cannot update or delete another user's row (silently matches nothing)", async () => {
    const upd = await as('authenticated', A, `update public.user_data set data = '{"hacked":true}' where user_id = $1`, [B]);
    expect(upd.affectedRows).toBe(0);
    const del = await as('authenticated', A, `delete from public.user_data where user_id = $1`, [B]);
    expect(del.affectedRows).toBe(0);
    const b = await as('authenticated', B, `select data from public.user_data`);
    expect(b.rows).toEqual([{ data: { n: 'B' } }]);
  });

  it('cannot re-point your own row at another user', async () => {
    await as('authenticated', A, `update public.user_data set user_id = $1 where user_id = $2`, [B, A]).catch(() => undefined);
    const both = await db.query(`select user_id from public.user_data order by user_id`);
    expect(both.rows).toEqual([{ user_id: A }, { user_id: B }]);
  });

  const versionOf = async (uid: string) => Number(((await as('authenticated', uid, `select version from public.user_data`)).rows[0] as { version: number }).version);

  it('bumps version by exactly one on every update and cannot be forced', async () => {
    const before = await versionOf(A);
    await as('authenticated', A, `update public.user_data set data = '{"n":"A2"}', version = 999 where user_id = $1`, [A]);
    const r = await as('authenticated', A, `select version, data from public.user_data`);
    expect(r.rows).toEqual([{ version: before + 1, data: { n: 'A2' } }]);
  });

  it('supports the optimistic-concurrency update the app uses', async () => {
    const v = await versionOf(A);
    const stale = await as('authenticated', A, `update public.user_data set data = '{"n":"stale"}' where user_id = $1 and version = $2`, [A, v - 1]);
    expect(stale.affectedRows).toBe(0);
    const fresh = await as('authenticated', A, `update public.user_data set data = '{"n":"A3"}' where user_id = $1 and version = $2`, [A, v]);
    expect(fresh.affectedRows).toBe(1);
    expect(await versionOf(A)).toBe(v + 1);
  });

  it('rejects non-object data', async () => {
    await expect(as('authenticated', A, `update public.user_data set data = '[1,2]' where user_id = $1`, [A])).rejects.toThrow(/user_data_is_object/);
  });

  it('gives anonymous (signed-out) visitors no access at all', async () => {
    await expect(as('anon', null, `select * from public.user_data`)).rejects.toThrow(/permission denied/i);
    await expect(as('anon', null, `insert into public.user_data (user_id, data) values ($1, '{}')`, [A])).rejects.toThrow(/permission denied/i);
  });

  it('delete_my_account removes the caller only, and their data with them', async () => {
    await as('authenticated', A, `select public.delete_my_account()`);
    const users = await db.query(`select id from auth.users order by id`);
    expect(users.rows).toEqual([{ id: B }]);
    const rows = await db.query(`select user_id from public.user_data`);
    expect(rows.rows).toEqual([{ user_id: B }]);
  });

  it('delete_my_account is not callable when signed out', async () => {
    await expect(as('anon', null, `select public.delete_my_account()`)).rejects.toThrow(/permission denied/i);
  });
});

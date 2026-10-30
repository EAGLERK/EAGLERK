import type { SupabaseClient } from '@supabase/supabase-js';

export type LoadResult =
  | { kind: 'found'; data: unknown; version: number }
  | { kind: 'empty' }
  | { kind: 'error'; message: string };

export type SaveResult = { kind: 'ok'; version: number } | { kind: 'conflict' } | { kind: 'error'; message: string };

const TABLE = 'user_data';

export async function loadCloud(db: SupabaseClient, userId: string): Promise<LoadResult> {
  const { data, error } = await db.from(TABLE).select('data, version').eq('user_id', userId).maybeSingle();
  if (error) return { kind: 'error', message: error.message };
  if (!data) return { kind: 'empty' };
  return { kind: 'found', data: data.data, version: Number(data.version) };
}

/**
 * Saves the user's data.
 *  - expectedVersion null: first save, creates the row. If one already exists (another device got there first) that is a conflict.
 *  - expectedVersion n: updates only if the row is still at version n, otherwise it is a conflict.
 *  - force: overwrite whatever is there (the user chose "keep mine").
 * The database trigger owns the version number, so a client cannot fake it.
 */
export async function saveCloud(db: SupabaseClient, userId: string, data: unknown, expectedVersion: number | null, force = false): Promise<SaveResult> {
  if (expectedVersion === null && !force) {
    const { data: row, error } = await db.from(TABLE).insert({ user_id: userId, data }).select('version').single();
    if (error) return error.code === '23505' ? { kind: 'conflict' } : { kind: 'error', message: error.message };
    return { kind: 'ok', version: Number(row.version) };
  }
  let q = db.from(TABLE).update({ data }).eq('user_id', userId);
  if (!force && expectedVersion !== null) q = q.eq('version', expectedVersion);
  const { data: rows, error } = await q.select('version');
  if (error) return { kind: 'error', message: error.message };
  if (!rows || rows.length === 0) {
    // Forced save onto a row that does not exist yet: create it.
    if (force) return saveCloud(db, userId, data, null);
    return { kind: 'conflict' };
  }
  return { kind: 'ok', version: Number(rows[0].version) };
}

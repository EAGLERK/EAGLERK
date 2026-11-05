import { looksLikeLoginPage } from '../engine/sheets';

export type SheetErrorKind = 'unreachable' | 'private' | 'notfound' | 'toolarge' | 'empty' | 'http';

export class SheetFetchError extends Error {
  constructor(public kind: SheetErrorKind, message: string) { super(message); }
}

const MESSAGES: Record<SheetErrorKind, string> = {
  // A private sheet sends the browser to Google's sign-in page, which the browser blocks, so "private" and "offline" look the same here.
  unreachable: 'I could not read that sheet. Check that sharing is set to “Anyone with the link” (Viewer) and that you are online.',
  private: 'That sheet is private. In Google Sheets choose Share, then General access, then “Anyone with the link” (Viewer).',
  notfound: 'Google could not find that sheet. Check the link.',
  toolarge: 'That sheet is over 5 MB. Use a smaller sheet or put the transactions on their own tab and link that tab.',
  empty: 'The sheet is empty.',
  http: 'Google answered with an error. Try again in a minute.',
};
export const sheetMessage = (e: unknown): string => (e instanceof SheetFetchError ? e.message : MESSAGES.unreachable);

const MAX = 5_000_000;

async function readOne(url: string, fetchImpl: typeof fetch): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    let res: Response;
    try {
      res = await fetchImpl(url, { signal: ctrl.signal, cache: 'no-store', credentials: 'omit' });
    } catch {
      throw new SheetFetchError('unreachable', MESSAGES.unreachable);
    }
    if (res.status === 401 || res.status === 403) throw new SheetFetchError('private', MESSAGES.private);
    if (res.status === 404) throw new SheetFetchError('notfound', MESSAGES.notfound);
    if (!res.ok) throw new SheetFetchError('http', MESSAGES.http);
    const text = await res.text();
    if (text.length > MAX) throw new SheetFetchError('toolarge', MESSAGES.toolarge);
    if (looksLikeLoginPage(text)) throw new SheetFetchError('private', MESSAGES.private);
    if (!text.trim()) throw new SheetFetchError('empty', MESSAGES.empty);
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/** Reads the sheet's CSV. Tries each address in turn, moving on only when the browser could not reach one at all. */
export async function fetchSheetCsv(urls: string[], fetchImpl: typeof fetch = fetch): Promise<string> {
  let last: SheetFetchError | null = null;
  for (const u of urls) {
    try {
      return await readOne(u, fetchImpl);
    } catch (e) {
      if (e instanceof SheetFetchError && e.kind === 'unreachable') { last = e; continue; }
      throw e;
    }
  }
  throw last ?? new SheetFetchError('unreachable', MESSAGES.unreachable);
}

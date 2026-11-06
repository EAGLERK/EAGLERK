import type { Txn } from './types';

/**
 * Google Sheets as a source of transactions. Everything here is plain data in, plain data out, so it can be tested without a browser:
 * turning a pasted link into addresses to fetch, spotting a sign-in page, and working out what changed between two reads of the sheet.
 */

export type SheetTarget = { ok: true; urls: string[] } | { ok: false; error: string };

const ID = /^[A-Za-z0-9_-]{20,}$/;

/**
 * What to fetch for a pasted link. A normal sheet link (shared with "Anyone with the link") is read through Google's CSV views, first the
 * query view, then the export view; a "Publish to the web" link is already a CSV address. Only docs.google.com is ever contacted.
 */
export function sheetTarget(input: string): SheetTarget {
  const raw = input.trim();
  if (!raw) return { ok: false, error: 'Paste the link to your Google Sheet.' };
  let url: URL;
  if (ID.test(raw)) url = new URL(`https://docs.google.com/spreadsheets/d/${raw}/edit`);
  else {
    try { url = new URL(raw); } catch { return { ok: false, error: 'That does not look like a link. Copy it from the Share button in Google Sheets.' }; }
  }
  if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com') return { ok: false, error: 'Only Google Sheets links work here (they start with https://docs.google.com/spreadsheets).' };
  if (!url.pathname.startsWith('/spreadsheets/')) return { ok: false, error: url.pathname.startsWith('/document') ? 'That is a Google Doc, not a Sheet.' : 'That is not a link to a Google Sheet.' };

  const gid = (url.searchParams.get('gid') ?? raw.match(/[#&?]gid=(\d+)/)?.[1] ?? '').replace(/\D/g, '');
  const g = gid ? `&gid=${gid}` : '';
  const published = url.pathname.match(/^\/spreadsheets\/d\/e\/([A-Za-z0-9_-]+)/);
  if (published) return { ok: true, urls: [`https://docs.google.com/spreadsheets/d/e/${published[1]}/pub?output=csv${gid ? `${g}&single=true` : ''}`] };
  const id = url.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]+)/)?.[1];
  if (!id) return { ok: false, error: 'That link has no sheet in it. Copy it from the Share button in Google Sheets.' };
  return { ok: true, urls: [`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv${g}`, `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${g}`] };
}

/** A private sheet answers with a sign-in web page instead of data. */
export const looksLikeLoginPage = (text: string): boolean => /^\s*<(!doctype|html|head|body)/i.test(text);

/** A short fingerprint of the sheet's text, to tell "nothing changed" without parsing it again. */
export function hashText(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0') + s.length.toString(16);
}

/** The name the rows carry in the imported-files list, kept unique among the names already taken. */
export function sheetLabel(name: string, taken: string[]): string {
  const base = `Google Sheet · ${name.trim() || 'Untitled'}`;
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) if (!taken.includes(`${base} (${n})`)) return `${base} (${n})`;
}

export interface SyncResult {
  /** The sheet's rows as they should now be stored (all carry `file`). */
  rows: Txn[];
  added: number;
  removed: number;
  /** Rows left out because the same transaction already came from another file. */
  duplicates: number;
}

/**
 * Makes this sheet's saved rows match what the sheet now says. The sheet is the source of truth for date, description and amount;
 * a category the person changed in MyMoney is kept. A transaction that already came from a statement file is not added twice.
 */
export function syncRows(existing: Txn[], parsed: Txn[], file: string): SyncResult {
  const mine = existing.filter((t) => t.file === file);
  const elsewhere = new Set(existing.filter((t) => t.file !== file).map((t) => t.id));
  const before = new Map(mine.map((t) => [t.id, t]));
  const rows = parsed.filter((r) => !elsewhere.has(r.id)).map((r) => ({ ...r, file, category: before.get(r.id)?.category ?? r.category }));
  const now = new Set(rows.map((r) => r.id));
  return {
    rows,
    added: rows.filter((r) => !before.has(r.id)).length,
    removed: mine.filter((t) => !now.has(t.id)).length,
    duplicates: parsed.length - rows.length,
  };
}

/** True when a sync would throw away most of what was there, which is more likely a broken sheet than an intended edit. */
export const looksDestructive = (oldCount: number, removed: number): boolean => oldCount >= 10 && removed > Math.max(5, oldCount / 2);

/* ---------- several tabs in one spreadsheet (one tab per month) ---------- */

export type SpreadsheetId = { ok: true; id: string } | { ok: false; error: string };

/**
 * The id of the spreadsheet in a normal share link (or a bare id). A tab is fetched by its name, which only works with this id: a
 * "published to the web" link has no readable id, so for those each tab's own link has to be added on its own.
 */
export function spreadsheetId(input: string): SpreadsheetId {
  const raw = input.trim();
  if (!raw) return { ok: false, error: 'Paste the link to your Google Sheet.' };
  if (/^[A-Za-z0-9_-]{20,}$/.test(raw)) return { ok: true, id: raw };
  const t = sheetTarget(raw);
  if (!t.ok) return t;
  if (/\/spreadsheets\/d\/e\//.test(raw)) return { ok: false, error: 'A link made with "Publish to the web" cannot list tabs by name. Use the normal Share link (Anyone with the link), or add each tab’s own link as its own sheet.' };
  const id = raw.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/)?.[1];
  return id ? { ok: true, id } : { ok: false, error: 'That link has no sheet in it. Copy it from the Share button in Google Sheets.' };
}

/** Where to read one tab by its name. Google's query view takes the tab name; the export view only takes a numeric tab id, so there is one address. */
export const tabTarget = (id: string, tab: string): string[] => [`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab.trim())}`];

/** Tab names typed one per line (commas and semicolons also separate them), trimmed, without repeats, in the order given. */
export function splitTabNames(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[\n,;]+/)) {
    const name = raw.trim().replace(/\s+/g, ' ');
    if (!name || name.length > 100 || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}

const MONTH_WORDS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "Nov 2026", "November 2026", "Nov-26", "2026-11" and "11/2026" are month tabs. Anything else is not, and returns null. */
export function monthOfTab(name: string): { year: number; month: number; ym: string } | null {
  const s = name.trim().toLowerCase();
  const make = (year: number, month: number) => (month >= 1 && month <= 12 && year >= 1990 && year <= 2100 ? { year, month, ym: `${year}-${String(month).padStart(2, '0')}` } : null);
  let m = s.match(/^([a-z]{3})[a-z]*\.?[\s,'’_/-]*(\d{2}|\d{4})$/);
  if (m) {
    const mi = MONTH_WORDS.indexOf(m[1]);
    if (mi >= 0) return make(m[2].length === 2 ? 2000 + +m[2] : +m[2], mi + 1);
  }
  m = s.match(/^(\d{4})[\s/_-]+(\d{1,2})$/);
  if (m) return make(+m[1], +m[2]);
  m = s.match(/^(\d{1,2})[\s/_-]+(\d{4})$/);
  if (m) return make(+m[2], +m[1]);
  return null;
}

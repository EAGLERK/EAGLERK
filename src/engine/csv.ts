import { categorize } from './categorize';
import { COUNTRIES } from '../lib/region';
import type { Txn } from './types';

/** Options a statement reader takes from the person's settings. */
export interface ReadOptions {
  /** How an ambiguous numeric date (03/04/2026) is read when the file itself does not settle it. Defaults to day first. */
  dateOrder?: 'dmy' | 'mdy';
  /** The year to give dates written without one ("5 Nov", "Nov 5"). Set when a month tab such as "Nov 2026" says which year it is. */
  defaultYear?: number;
}

// Currency codes that may sit in front of or behind an amount ("USD 12", "12 EUR", "Rs. 450"). Only known codes count, so "UPI123" is never an amount.
const CURRENCY_CODES = new Set([...COUNTRIES.map((c) => c.currency.toLowerCase()), 'rs', 'rm', 'kr']);

export interface CsvResult {
  rows: Txn[];
  skipped: number;
  /** Things that went wrong or that the person should double-check. */
  warnings: string[];
  /** Plain information about how the file was read (for example "money in and out were worked out from the balance column"). */
  notes: string[];
}

/* ------------------------------------------------------------------ splitting text into a table */

/** Splits text into records and cells, honouring quotes (a quoted cell may contain the delimiter and line breaks). */
export function splitRecords(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  const endCell = () => { row.push(cur.trim()); cur = ''; };
  const endRow = () => { endCell(); if (row.some((c) => c !== '')) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"' && cur.trim() === '') q = true;
    else if (ch === delim) endCell();
    else if (ch === '\n') endRow();
    else if (ch === '\r') { /* ignore; the \n ends the record */ }
    else cur += ch;
  }
  endRow();
  return rows;
}

/** The delimiter that splits most of the first lines into the same number of cells. */
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 40).map((l) => l.replace(/"[^"]*"/g, ''));
  let best = ',';
  let bestScore = 0;
  for (const d of [',', '\t', ';', '|']) {
    const counts = new Map<number, number>();
    for (const l of lines) {
      const n = l.split(d).length - 1;
      if (n > 0) counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    let score = 0;
    for (const [n, lineCount] of counts) score = Math.max(score, n * lineCount);
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}

/** Cleans spreadsheet artefacts: ="0001", a leading apostrophe, non-breaking spaces. */
function cleanCell(c: string): string {
  let s = c.replace(/ /g, ' ').trim();
  const f = s.match(/^="?(.*?)"?$/);
  if (f && s.startsWith('=')) s = f[1];
  if (s.startsWith("'") && s.length > 1) s = s.slice(1);
  return s.trim();
}

/* ------------------------------------------------------------------ dates and amounts */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const year2 = (y: number) => (y < 100 ? (y < 70 ? 2000 + y : 1900 + y) : y);

function fmt(y: number, mo: number, d: number): string | null {
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export type DateOrder = 'dmy' | 'mdy';

/** Reads a date in the formats banks use. Numeric dates are day-first unless `order` says otherwise. Returns YYYY-MM-DD or null. */
export function parseDate(raw: string, order: DateOrder = 'dmy', defaultYear?: number): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/);
  if (m) return fmt(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})(?!\d)/);
  if (m) {
    const [a, b] = order === 'dmy' ? [+m[1], +m[2]] : [+m[2], +m[1]];
    return fmt(year2(+m[3]), b, a);
  }
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[-/. ]+([A-Za-z]{3})[a-z]*\.?[-/. ,]*(\d{2,4})(?!\d)/);
  if (m) {
    const mi = MONTHS.indexOf(m[2].toLowerCase());
    if (mi >= 0) return fmt(year2(+m[3]), mi + 1, +m[1]);
  }
  m = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?!\d)/);
  if (m) {
    const mi = MONTHS.indexOf(m[1].toLowerCase());
    if (mi >= 0) return fmt(+m[3], mi + 1, +m[2]);
  }
  // No year written: only when the caller knows it (a month tab such as "Nov 2026" says which year this is).
  if (defaultYear) {
    m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[-/. ]+([A-Za-z]{3})[a-z]*\.?$/);
    if (m) { const mi = MONTHS.indexOf(m[2].toLowerCase()); if (mi >= 0) return fmt(defaultYear, mi + 1, +m[1]); }
    m = s.match(/^([A-Za-z]{3})[a-z]*\.?[-/. ]+(\d{1,2})(?:st|nd|rd|th)?$/);
    if (m) { const mi = MONTHS.indexOf(m[1].toLowerCase()); if (mi >= 0) return fmt(defaultYear, mi + 1, +m[2]); }
  }
  return null;
}

/** Is this a date in either order? Used to find the date column, before the file's order is known. */
const anyDate = (v: string, year?: number): string | null => parseDate(v, 'dmy', year) ?? parseDate(v, 'mdy', year);

/** Excel stores dates as day counts from 1899-12-30. Only values in a plausible range count as dates. */
export function serialToISO(raw: string): string | null {
  if (!/^\d{5}(\.\d+)?$/.test(raw.trim())) return null;
  const n = Math.floor(Number(raw));
  if (n < 32874 || n > 73050) return null; // 1990 to 2099
  const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
  return fmt(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** The file settles it when a first number is above 12 (day first) or a second is (month first). Otherwise `fallback`, which comes from the person's country. */
function detectOrder(values: string[], fallback: DateOrder = 'dmy'): DateOrder {
  let dayFirst = 0;
  let monthFirst = 0;
  for (const v of values) {
    const m = v.trim().match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ]\d{2,4}/);
    if (!m) continue;
    if (+m[1] > 12) dayFirst++;
    if (+m[2] > 12) monthFirst++;
  }
  if (monthFirst === dayFirst) return fallback;
  return monthFirst > dayFirst ? 'mdy' : 'dmy';
}

interface Money { n: number; mark: 'dr' | 'cr' | null; decimals: boolean }

/** Reads an amount: ₹1,23,456.78, $1,234.50, 1.234,56 €, CHF 1'234.50, (500.00), -450, 450 Dr, 1,200.00 CR, 450-. Null when the cell is not a number. */
export function parseMoney(raw: string | undefined): Money | null {
  if (!raw) return null;
  let s = raw.trim().replace(/[−‒–—]/g, '-');
  if (!s) return null;
  let neg = false;
  let mark: Money['mark'] = null;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  const tail = s.match(/\s*(dr|cr|debit|credit)\.?$/i);
  if (tail) { mark = /^d/i.test(tail[1]) ? 'dr' : 'cr'; s = s.slice(0, tail.index); }
  const head = s.match(/^(dr|cr|debit|credit)\.?\s*/i);
  if (head && !mark) { mark = /^d/i.test(head[1]) ? 'dr' : 'cr'; s = s.slice(head[0].length); }
  s = s.replace(/[₹$€£¥₩₽₺₫₪฿₦₱₴₡₲₸₼₾﷼]/g, '');
  const pre = s.match(/^([a-z]{2,3})\.?\s*(?=[\d(+-])/i);
  if (pre && CURRENCY_CODES.has(pre[1].toLowerCase())) s = s.slice(pre[0].length);
  const post = s.match(/(?<=\d)\s*([a-z]{2,3})\.?$/i);
  if (post && CURRENCY_CODES.has(post[1].toLowerCase())) s = s.slice(0, post.index);
  s = s.replace(/[\s\u00a0\u202f']/g, ''); // spaces and apostrophes are thousands separators in some countries
  // A comma followed by one or two digits at the end is a decimal comma (1.234,56 and 450,00); otherwise commas group thousands.
  const lastComma = s.lastIndexOf(',');
  if (lastComma > s.lastIndexOf('.') && /^\d{1,2}$/.test(s.slice(lastComma + 1)) && /^[+-]?[\d.,]+-?$/.test(s)) s = `${s.slice(0, lastComma).replace(/[.,]/g, '')}.${s.slice(lastComma + 1)}`;
  else s = s.replace(/,/g, '');
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
  if (s.startsWith('-')) { neg = true; s = s.slice(1); }
  if (s.startsWith('+')) s = s.slice(1);
  if (!/^\d*\.?\d+$/.test(s) && !/^\d+\.$/.test(s)) return null;
  const n = Number(s);
  return { n: neg ? -n : n, mark, decimals: s.includes('.') };
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/* ------------------------------------------------------------------ finding the columns */

const H = {
  date: /date|\bdt\b|posted|\bday\b/i,
  txnDate: /txn|tran|transaction|posting|posted|booking/i,
  valueDate: /value|effective|vch/i,
  ref: /chq|cheque|\bref|reference|utr|\bsl\b|s\.?\s?no|serial|srl|\bid\b|instrument|\bsol\b|branch/i,
  desc: /narration|narrative|description|particulars|remarks|details|merchant|payee|beneficiary|memo|transaction\s*(info|name|note)|\bnote/i,
  debit: /withdraw|debit|\bdr\b|money\s*out|paid\s*out|spent|outflow|expense/i,
  credit: /deposit|credit|\bcr\b|money\s*in|paid\s*in|received|inflow|income/i,
  type: /dr\s*[/.]?\s*cr|cr\s*[/.]?\s*dr|^type$|txn\s*type|transaction\s*type|^d\/c$|^c\/d$/i,
  amount: /\bamount\b|\bamt\b|^value$/i,
  balance: /balance|\bbal\b|closing|running/i,
};

interface Header { row: number; at: Record<string, number[]> }

/** The first row near the top that names a date and at least one other thing a statement has. */
function findHeader(rows: string[][]): Header | null {
  for (let r = 0; r < Math.min(rows.length, 60); r++) {
    const cells = rows[r];
    if (cells.filter((c) => c).length < 3) continue;
    const at: Record<string, number[]> = {};
    cells.forEach((raw, i) => {
      const c = raw.toLowerCase();
      const add = (k: string) => (at[k] ??= []).push(i);
      if (H.type.test(c)) add('type');
      else if (H.balance.test(c)) add('balance');
      else if (H.debit.test(c)) add('debit');
      else if (H.credit.test(c)) add('credit');
      else if (H.date.test(c)) add('date');
      else if (H.ref.test(c)) add('ref');
      else if (H.desc.test(c)) add('desc');
      else if (H.amount.test(c)) add('amount');
    });
    const kinds = Object.keys(at).filter((k) => k !== 'ref');
    if (at.date && kinds.length >= 2) return { row: r, at };
  }
  return null;
}

interface ColStat { nonEmpty: number; strictDate: number; serialDate: number; money: number; decimals: number; ints: number; len: number; text: number; marks: number; seq: boolean }

function columnStats(data: string[][], ncols: number, year?: number): ColStat[] {
  const stats: ColStat[] = [];
  for (let c = 0; c < ncols; c++) {
    const s: ColStat = { nonEmpty: 0, strictDate: 0, serialDate: 0, money: 0, decimals: 0, ints: 0, len: 0, text: 0, marks: 0, seq: false };
    const ints: number[] = [];
    for (const r of data) {
      const v = (r[c] ?? '').trim();
      if (!v) continue;
      s.nonEmpty++;
      if (anyDate(v, year)) s.strictDate++;
      else if (serialToISO(v)) s.serialDate++;
      const m = parseMoney(v);
      if (m && !anyDate(v, year)) {
        s.money++;
        if (m.decimals) s.decimals++;
        else if (Number.isInteger(m.n)) ints.push(m.n);
      } else if (/^(dr|cr|d|c|debit|credit|withdrawal|deposit)\.?$/i.test(v)) s.marks++;
      else { s.text++; s.len += v.length; }
    }
    s.ints = ints.length;
    s.seq = ints.length >= 3 && ints.every((n, i) => i === 0 || n === ints[i - 1] + 1 || n === ints[i - 1] - 1);
    stats.push(s);
  }
  return stats;
}

const frac = (a: number, b: number) => (b ? a / b : 0);


/**
 * Uses the running balance to say which rows were money in. The statement may list oldest first or newest first, so both are tried
 * and the one where balance changes match the amounts wins. Returns null when the balance does not line up with the amounts.
 */
function balanceDirections(seq: string[][], bal: (r: string[]) => number | undefined, amount: (r: string[]) => number | null): Map<string[], 'income' | 'expense'> | null {
  const rows = seq.filter((r) => bal(r) !== undefined && amount(r) !== null);
  const close = (a: number, b: number) => Math.abs(a - b) < 0.011;
  let asc = 0;
  let desc = 0;
  for (let i = 1; i < rows.length; i++) {
    asc += close(Math.abs(bal(rows[i])! - bal(rows[i - 1])!), Math.abs(amount(rows[i])!)) ? 1 : 0;
    desc += close(Math.abs(bal(rows[i - 1])! - bal(rows[i])!), Math.abs(amount(rows[i - 1])!)) ? 1 : 0;
  }
  if (Math.max(asc, desc) / Math.max(1, rows.length - 1) < 0.6 || rows.length < 2) return null;
  const out = new Map<string[], 'income' | 'expense'>();
  rows.forEach((r, i) => {
    // Oldest first: the change into this row is this row's amount. Newest first: the change out of this row to the next one.
    const delta = asc >= desc ? (i > 0 ? bal(r)! - bal(rows[i - 1])! : null) : (i < rows.length - 1 ? bal(r)! - bal(rows[i + 1])! : null);
    if (delta !== null && Math.abs(delta) > 0.005) out.set(r, delta > 0 ? 'income' : 'expense');
  });
  return out;
}

/* ------------------------------------------------------------------ reading the table */

interface Draft { date: string; desc: string; amount: number; type: 'income' | 'expense' }

/**
 * Turns a table of cells (from CSV, Excel or HTML) into transactions. Column roles come from the header names when they are
 * recognisable, and from the content otherwise: a column full of dates is the date, the longest text is the description, and
 * money columns are told apart as debit, credit and balance by how they are filled and by how the running balance moves.
 */
export function parseTable(input: string[][], opts: ReadOptions = {}): CsvResult {
  const notes: string[] = [];
  const warnings: string[] = [];
  const empty = (msg: string): CsvResult => ({ rows: [], skipped: 0, warnings: [msg], notes });

  const rows = input.map((r) => r.map(cleanCell)).filter((r) => r.some((c) => c));
  if (rows.length < 2) return empty('The file has no data rows.');

  const header = findHeader(rows);
  const body = header ? rows.slice(header.row + 1) : rows;
  const ncols = Math.max(...rows.map((r) => r.length));
  // Column statistics come from the rows that carry a date, so a header line or a footer cannot skew them.
  const withDate = body.filter((r) => r.some((c) => anyDate(c, opts.defaultYear)));
  const sample = withDate.length >= 2 ? withDate : body;
  const stats = columnStats(sample, ncols, opts.defaultYear);
  const nonEmptyRows = sample.length;

  /* --- date column */
  const strictCols = stats.map((s, c) => ({ c, f: frac(s.strictDate, s.nonEmpty), n: s.strictDate })).filter((x) => x.f >= 0.5 && x.n >= 1);
  let iDate = -1;
  let serial = false;
  if (strictCols.length) {
    const named = (re: RegExp) => strictCols.find((x) => header?.at.date?.includes(x.c) && re.test(rows[header.row][x.c]) && !H.valueDate.test(rows[header.row][x.c]));
    iDate = (named(H.txnDate) ?? strictCols.find((x) => header?.at.date?.includes(x.c) && !H.valueDate.test(rows[header.row][x.c])) ?? strictCols[0]).c;
  } else {
    const ser = stats.map((s, c) => ({ c, f: frac(s.serialDate, s.nonEmpty) })).filter((x) => x.f >= 0.7 && (header?.at.date?.includes(x.c) || !stats[x.c].seq));
    const pick = ser.find((x) => header?.at.date?.includes(x.c)) ?? ser[0];
    if (pick) { iDate = pick.c; serial = true; }
  }
  if (iDate < 0) {
    const sample = rows.slice(0, 3).map((r) => r.filter((c) => c).slice(0, 6).join(' | ')).join('  //  ');
    return empty(`I could not find a column of dates in this file (${ncols} columns, ${rows.length} rows). The first rows read: ${sample.slice(0, 220)}`);
  }
  const order = detectOrder(body.map((r) => r[iDate] ?? ''), opts.dateOrder);
  const toDate = (v: string) => (serial ? serialToISO(v) : parseDate(v, order, opts.defaultYear)) ?? (serial ? null : serialToISO(v));
  const dated = body.filter((r) => toDate(r[iDate] ?? ''));

  /* --- description column */
  const used = new Set<number>([iDate]);
  const textCols = stats.map((s, c) => ({ c, avg: frac(s.len, s.text), share: frac(s.text, s.nonEmpty), n: s.text })).filter((x) => !used.has(x.c) && x.share >= 0.5 && x.n >= 1);
  let iDesc = header?.at.desc?.find((c) => !used.has(c)) ?? -1;
  if (iDesc < 0 && textCols.length) iDesc = textCols.reduce((a, b) => (b.avg > a.avg ? b : a)).c;
  if (iDesc >= 0) used.add(iDesc);

  /* --- money columns */
  const looksLikeRef = (c: number) => {
    const s = stats[c];
    const named = header && H.ref.test(rows[header.row][c] ?? '') && !H.amount.test(rows[header.row][c] ?? '');
    const longInts = s.money > 0 && s.decimals === 0 && sample.slice(0, 50).every((r) => !r[c] || (r[c].replace(/\D/g, '').length >= 6 && !/[.,]/.test(r[c])));
    return named || s.seq || longInts;
  };
  const named = (k: string) => header?.at[k]?.find((c) => !used.has(c) && c !== iDate);
  let iBal = named('balance') ?? -1;
  let iDebit = named('debit') ?? -1;
  let iCredit = named('credit') ?? -1;
  let iAmt = named('amount') ?? -1;
  let iType = header?.at.type?.find((c) => stats[c].marks >= Math.max(1, stats[c].nonEmpty * 0.5)) ?? -1;
  [iBal, iDebit, iCredit, iAmt, iType].forEach((c) => c >= 0 && used.add(c));

  const moneyCols = stats.map((s, c) => ({ c, f: frac(s.money, nonEmptyRows), s })).filter((x) => !used.has(x.c) && x.s.money >= 1 && frac(x.s.money, x.s.nonEmpty) >= 0.7 && !looksLikeRef(x.c));
  let inferred = false;
  if (iDebit < 0 && iCredit < 0 && iAmt < 0) {
    // Nothing is named: work the roles out from how the numeric columns are filled.
    let cand = moneyCols.map((x) => x.c);
    const fills = (c: number) => frac(stats[c].money, nonEmptyRows);
    const nz = (r: string[], c: number) => (parseMoney(r[c])?.n ?? 0) !== 0;
    const complementary = (a: number, b: number) => {
      const both = sample.filter((r) => nz(r, a) && nz(r, b)).length;
      const either = sample.filter((r) => nz(r, a) || nz(r, b)).length;
      return both <= nonEmptyRows * 0.15 && either >= nonEmptyRows * 0.6 && sample.some((r) => nz(r, a) && !nz(r, b)) && sample.some((r) => nz(r, b) && !nz(r, a));
    };
    if (iBal < 0 && cand.length >= 3) { iBal = cand[cand.length - 1]; cand = cand.slice(0, -1); }
    else if (iBal < 0 && cand.length === 2 && fills(cand[0]) >= 0.9 && fills(cand[1]) >= 0.9 && !complementary(cand[0], cand[1])) {
      const median = (c: number) => { const v = sample.map((r) => Math.abs(parseMoney(r[c])?.n ?? NaN)).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b); return v[Math.floor(v.length / 2)] ?? 0; };
      iBal = median(cand[0]) > median(cand[1]) ? cand[0] : cand[1];
      cand = cand.filter((c) => c !== iBal);
    }
    if (cand.length >= 2) {
      let [a, b] = cand;
      if (complementary(a, b)) {
        // Which one is money in? The running balance says; failing that, the usual order is debit then credit.
        if (iBal >= 0) {
          const dir = balanceDirections(dated, (r) => parseMoney(r[iBal])?.n, (r) => (nz(r, a) ? parseMoney(r[a])!.n : nz(r, b) ? parseMoney(r[b])!.n : null));
          if (dir) {
            const inA = dated.filter((r) => nz(r, a) && dir.get(r) === 'income').length;
            const inB = dated.filter((r) => nz(r, b) && dir.get(r) === 'income').length;
            if (inA > inB) [a, b] = [b, a];
          }
        }
        iDebit = a; iCredit = b;
      } else iAmt = a;
    } else if (cand.length === 1) iAmt = cand[0];
    inferred = iDebit >= 0 || iCredit >= 0 || iAmt >= 0;
  }
  if (inferred) notes.push('The money columns were not labelled, so I worked out which is which from the numbers.');
  if (iDebit < 0 && iCredit < 0 && iAmt < 0) {
    return empty(`I found dates and text but no column of amounts (${ncols} columns). Check the file is a transaction statement.`);
  }
  if (iType < 0 && iAmt >= 0) {
    const t = stats.findIndex((s, c) => !used.has(c) && s.marks >= Math.max(2, s.nonEmpty * 0.6));
    if (t >= 0) iType = t;
  }
  if (iBal < 0 && iAmt >= 0) {
    const b = stats.findIndex((s, c) => !used.has(c) && c !== iAmt && !looksLikeRef(c) && frac(s.money, nonEmptyRows) >= 0.9 && frac(s.money, s.nonEmpty) >= 0.9);
    if (b >= 0) iBal = b;
  }

  /* --- running balance: tells money in from money out when nothing else does */
  const bal = (r: string[]) => (iBal >= 0 ? parseMoney(r[iBal])?.n : undefined);
  const amt = (r: string[]) => (iAmt >= 0 ? parseMoney(r[iAmt]) : null);
  // In a column where some amounts carry a minus sign, the unsigned ones are money in.
  const signedColumn = iAmt >= 0 && body.some((r) => (amt(r)?.n ?? 0) < 0);
  const direction = iBal >= 0 && iAmt >= 0 ? balanceDirections(dated, bal, (r) => amt(r)?.n ?? null) : null;
  if (direction) notes.push('Money in and money out were worked out from the running balance.');

  /* --- rows */
  const drafts: Draft[] = [];
  let skipped = 0;
  let unsure = 0;
  for (const r of body) {
    const date = toDate(r[iDate] ?? '');
    const text = (iDesc >= 0 ? r[iDesc] ?? '' : '').replace(/\s+/g, ' ').trim();
    if (!date) {
      // A long narration sometimes wraps onto the next line with no date or amount: it belongs to the row above.
      const hasMoney = [iDebit, iCredit, iAmt].some((c) => c >= 0 && parseMoney(r[c]));
      if (drafts.length && text && !hasMoney && !(r[iDate] ?? '').trim()) drafts[drafts.length - 1].desc += ` ${text}`;
      else if (drafts.length) skipped++; // lines before the first transaction are titles and headers, not skipped transactions
      continue;
    }
    let amount: number | null = null;
    let type: 'income' | 'expense' | null = null;
    const debit = iDebit >= 0 ? parseMoney(r[iDebit]) : null;
    const credit = iCredit >= 0 ? parseMoney(r[iCredit]) : null;
    if (debit && debit.n) { amount = Math.abs(debit.n); type = 'expense'; }
    else if (credit && credit.n) { amount = Math.abs(credit.n); type = 'income'; }
    else if (iAmt >= 0) {
      const a = amt(r);
      if (a && a.n) {
        amount = Math.abs(a.n);
        const marker = (iType >= 0 ? r[iType] : '') ?? '';
        if (/\bcr\b|credit|deposit|^c$/i.test(marker) || (a.mark === 'cr' && iType < 0)) type = 'income';
        else if (/\bdr\b|debit|withdraw|^d$/i.test(marker) || (a.mark === 'dr' && iType < 0)) type = 'expense';
        else if (direction?.has(r)) type = direction.get(r)!;
        else if (a.n < 0) type = 'expense';
        else if (signedColumn) type = 'income';
        else { type = 'expense'; unsure++; }
      }
    }
    if (!amount || !type) { skipped++; continue; }
    drafts.push({ date, desc: text, amount, type });
  }
  if (!drafts.length) return { rows: [], skipped, warnings: ['I found the columns but no rows with both a date and an amount.'], notes };
  if (iAmt >= 0 && !direction && iType < 0 && drafts.every((d) => d.type === 'expense') && unsure === drafts.length) {
    warnings.push('This file has one amount column with no sign, Dr/Cr marker or balance, so every row is counted as money out. Fix any income rows in the list below.');
  } else if (unsure) {
    notes.push(`${unsure} ${unsure === 1 ? 'row' : 'rows'} could not be told apart as money in or out and ${unsure === 1 ? 'was' : 'were'} counted as money out.`);
  }

  // Two identical same-day rows are legitimate (two coffees); keep them with a counter.
  const seen = new Map<string, number>();
  const out: Txn[] = drafts.map((d) => {
    const desc = d.desc.trim();
    const key = `${d.date}|${d.amount}|${d.type}|${desc}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return { id: `csv-${hash(key)}-${n}`, date: d.date, description: desc, amount: d.amount, type: d.type, category: categorize(desc, d.type), source: 'csv' };
  });
  if (skipped) notes.push(`${skipped} ${skipped === 1 ? 'line was' : 'lines were'} skipped: balance-only, total or summary lines.`);
  return { rows: out, skipped, warnings, notes };
}

/** Parses statement text (CSV, TSV, semicolon or pipe separated). */
export function parseStatement(text: string, opts: ReadOptions = {}): CsvResult {
  let t = text.replace(/^﻿/, '');
  const hint = t.match(/^sep=(.)\r?\n/i);
  if (hint) t = t.slice(hint[0].length);
  const delim = hint ? hint[1] : detectDelimiter(t);
  return parseTable(splitRecords(t, delim), opts);
}

import { categorize } from './categorize';
import type { Txn } from './types';

export interface CsvResult {
  rows: Txn[];
  skipped: number;
  warnings: string[];
}

function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function detectDelimiter(sample: string): string {
  const cands = [',', '\t', ';', '|'];
  let best = ',';
  let bestCount = -1;
  for (const d of cands) {
    const c = sample.split(d).length;
    if (c > bestCount) {
      best = d;
      bestCount = c;
    }
  }
  return best;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Indian statements are day-first. Returns YYYY-MM-DD or null. */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return fmt(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})/);
  if (m) return fmt(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[-/. ]([A-Za-z]{3})[a-z]*[-/. ,]*(\d{2,4})/);
  if (m) {
    const mi = MONTHS.indexOf(m[2].toLowerCase());
    if (mi >= 0) return fmt(+m[3] < 100 ? 2000 + +m[3] : +m[3], mi + 1, +m[1]);
  }
  return null;
}

function fmt(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseAmount(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[₹,\s]|rs\.?|inr/gi, '').replace(/(dr|cr)\.?$/i, '');
  if (!cleaned || !/^-?\d*\.?\d+$/.test(cleaned)) return null;
  return Number(cleaned);
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Parses a bank statement export. Handles preamble lines before the header, separate
 * debit/credit columns or a single signed/Dr-Cr amount column, and dd/mm/yyyy dates.
 * Row ids are derived from the content, so importing the same statement twice does not duplicate rows.
 */
export function parseStatement(text: string): CsvResult {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const warnings: string[] = [];
  if (lines.length < 2) return { rows: [], skipped: 0, warnings: ['File has no data rows.'] };

  const delim = detectDelimiter(lines.slice(0, 15).join('\n'));
  const cells = lines.map((l) => splitLine(l, delim));
  const headerIdx = cells.findIndex(
    (r) => r.some((c) => /date|\bdt\b/i.test(c)) && r.some((c) => /narration|description|particulars|remarks|details/i.test(c)),
  );
  if (headerIdx < 0) {
    return { rows: [], skipped: 0, warnings: ['Could not find a header row with a date and a narration/description column.'] };
  }
  const head = cells[headerIdx].map((h) => h.toLowerCase());
  const find = (re: RegExp, not?: RegExp) => head.findIndex((h) => re.test(h) && !(not && not.test(h)));

  const iDate = find(/date|\bdt\b/, /value/) >= 0 ? find(/date|\bdt\b/, /value/) : find(/date|\bdt\b/);
  const iDesc = find(/narration|description|particulars|remarks|details/);
  const iDebit = find(/withdraw|debit|\bdr\b/, /dr\/cr|cr\/dr/);
  const iCredit = find(/deposit|credit|\bcr\b/, /dr\/cr|cr\/dr/);
  const iAmt = find(/^amount|txn amount|transaction amount/);
  const iType = find(/dr\/cr|cr\/dr|^type|txn type/);

  if (iDebit < 0 && iCredit < 0 && iAmt < 0) {
    return { rows: [], skipped: 0, warnings: ['No debit/credit or amount column found.'] };
  }

  const rows: Txn[] = [];
  let skipped = 0;
  const seen = new Map<string, number>();

  for (const r of cells.slice(headerIdx + 1)) {
    const date = parseDate(r[iDate] ?? '');
    if (!date) {
      skipped++;
      continue;
    }
    const desc = (r[iDesc] ?? '').replace(/\s+/g, ' ').trim();
    let amount: number | null = null;
    let type: 'income' | 'expense' | null = null;

    const debit = iDebit >= 0 ? parseAmount(r[iDebit]) : null;
    const credit = iCredit >= 0 ? parseAmount(r[iCredit]) : null;
    if (debit && debit > 0) {
      amount = debit;
      type = 'expense';
    } else if (credit && credit > 0) {
      amount = credit;
      type = 'income';
    } else if (iAmt >= 0) {
      const a = parseAmount(r[iAmt]);
      if (a !== null && a !== 0) {
        const marker = (iType >= 0 ? r[iType] : r[iAmt]) ?? '';
        if (/\bcr\b|credit/i.test(marker)) type = 'income';
        else if (/\bdr\b|debit/i.test(marker)) type = 'expense';
        else type = a < 0 ? 'expense' : 'income';
        amount = Math.abs(a);
      }
    }
    if (!amount || !type) {
      skipped++;
      continue;
    }
    // Two identical same-day rows are legitimate (two coffees); keep them with a counter.
    const key = `${date}|${amount}|${type}|${desc}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    rows.push({ id: `csv-${hash(key)}-${n}`, date, description: desc, amount, type, category: categorize(desc, type), source: 'csv' });
  }
  if (!rows.length) warnings.push('No transactions could be read from this file.');
  if (skipped) warnings.push(`${skipped} row(s) skipped (blank, balance-only, or unreadable date/amount).`);
  return { rows, skipped, warnings };
}

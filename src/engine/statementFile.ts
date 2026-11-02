import { decodeEntities, readXlsx } from './xlsx';
import { parseStatement, parseTable, type CsvResult } from './csv';

const fail = (message: string): CsvResult => ({ rows: [], skipped: 0, warnings: [message], notes: [] });

function decode(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes); // older bank exports
  }
}

/** Banks often save an HTML table with an .xls name. The biggest table is the statement. */
export function htmlTableRows(html: string): string[][] {
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) ?? [];
  const parsed = tables.map((t) =>
    [...t.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((tr) =>
      [...tr[0].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => decodeEntities(c[1].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()),
    ),
  );
  return parsed.sort((a, b) => b.length - a.length)[0] ?? [];
}

/** Reads a statement from the bytes of whatever file was chosen: CSV or text, Excel (.xlsx), or an HTML table saved as .xls. */
export async function readStatementBytes(buf: ArrayBuffer): Promise<CsvResult> {
  const b = new Uint8Array(buf);
  const startsWith = (...sig: number[]) => sig.every((v, i) => b[i] === v);

  if (startsWith(0x25, 0x50, 0x44, 0x46)) {
    return fail('This is a PDF. I can only read statements saved as CSV or Excel; most banks offer one of those next to the PDF download.');
  }
  if (startsWith(0xd0, 0xcf, 0x11, 0xe0)) {
    return fail('This is the old Excel format (.xls). Open it in Excel or Google Sheets, save it as .xlsx or CSV, and import that.');
  }
  if (startsWith(0x50, 0x4b, 0x03, 0x04)) {
    let sheets: string[][][];
    try {
      sheets = await readXlsx(buf);
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'This file could not be opened as an Excel workbook.');
    }
    let first: CsvResult | null = null;
    for (const rows of sheets) {
      const r = parseTable(rows);
      first ??= r;
      if (r.rows.length) return r;
    }
    return first ?? fail('The workbook has no sheets with data.');
  }

  const text = decode(b);
  if (/<table[\s>]/i.test(text)) return parseTable(htmlTableRows(text));
  return parseStatement(text);
}

export async function readStatementFile(file: File): Promise<CsvResult> {
  return readStatementBytes(await file.arrayBuffer());
}

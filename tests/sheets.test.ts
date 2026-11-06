import { describe, expect, it, vi } from 'vitest';
import { parseStatement } from '../src/engine/csv';
import { hashText, looksDestructive, looksLikeLoginPage, monthOfTab, sheetLabel, sheetTarget, spreadsheetId, splitTabNames, syncRows, tabTarget } from '../src/engine/sheets';
import type { Txn } from '../src/engine/types';
import { fetchSheetCsv, SheetFetchError } from '../src/sheets/fetch';

const ID = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';

describe('sheetTarget: turning a pasted link into addresses', () => {
  it('reads a normal share link, tries the query view then the export view, and keeps the tab', () => {
    const r = sheetTarget(`https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing#gid=1234`);
    expect(r).toEqual({ ok: true, urls: [`https://docs.google.com/spreadsheets/d/${ID}/gviz/tq?tqx=out:csv&gid=1234`, `https://docs.google.com/spreadsheets/d/${ID}/export?format=csv&gid=1234`] });
  });
  it('reads the tab from the query string too, and works without one', () => {
    expect(sheetTarget(`https://docs.google.com/spreadsheets/d/${ID}/edit?gid=77`)).toMatchObject({ ok: true, urls: [expect.stringContaining('&gid=77'), expect.any(String)] });
    const r = sheetTarget(`https://docs.google.com/spreadsheets/d/${ID}/edit`);
    expect(r.ok && r.urls[0]).toBe(`https://docs.google.com/spreadsheets/d/${ID}/gviz/tq?tqx=out:csv`);
  });
  it('takes a bare sheet id', () => {
    expect(sheetTarget(ID)).toMatchObject({ ok: true });
  });
  it('uses a published link as it is, asking for CSV', () => {
    const r = sheetTarget('https://docs.google.com/spreadsheets/d/e/2PACX-1vABCdef_ghi/pubhtml?gid=5&single=true');
    expect(r).toEqual({ ok: true, urls: ['https://docs.google.com/spreadsheets/d/e/2PACX-1vABCdef_ghi/pub?output=csv&gid=5&single=true'] });
  });
  it('only ever contacts docs.google.com over https', () => {
    for (const bad of ['http://docs.google.com/spreadsheets/d/' + ID, 'https://evil.example/spreadsheets/d/' + ID, 'https://docs.google.com.evil.example/spreadsheets/d/' + ID, 'https://drive.google.com/file/d/abc']) {
      expect(sheetTarget(bad).ok).toBe(false);
    }
  });
  it('explains what is wrong', () => {
    expect(sheetTarget('')).toMatchObject({ ok: false, error: expect.stringContaining('Paste') });
    expect(sheetTarget('not a link')).toMatchObject({ ok: false, error: expect.stringContaining('link') });
    expect(sheetTarget('https://docs.google.com/document/d/' + ID + '/edit')).toMatchObject({ ok: false, error: 'That is a Google Doc, not a Sheet.' });
    expect(sheetTarget('https://docs.google.com/spreadsheets/')).toMatchObject({ ok: false });
  });
  it('does not let a crafted tab number into the address', () => {
    const r = sheetTarget(`https://docs.google.com/spreadsheets/d/${ID}/edit?gid=1%26evil%3D1`);
    expect(r.ok && r.urls.join(' ')).not.toContain('evil');
  });
});

describe('looksLikeLoginPage / hashText / sheetLabel', () => {
  it('spots a sign-in page but not data', () => {
    expect(looksLikeLoginPage('<!DOCTYPE html><html>')).toBe(true);
    expect(looksLikeLoginPage('  <html lang="en">')).toBe(true);
    expect(looksLikeLoginPage('Date,Description,Amount\n')).toBe(false);
    expect(looksLikeLoginPage('"<b>bold</b>",1')).toBe(false);
  });
  it('hashes equal text equally and different text differently', () => {
    expect(hashText('a,b\n1,2')).toBe(hashText('a,b\n1,2'));
    expect(hashText('a,b\n1,2')).not.toBe(hashText('a,b\n1,3'));
  });
  it('keeps labels unique', () => {
    expect(sheetLabel('Expenses', [])).toBe('Google Sheet · Expenses');
    expect(sheetLabel('Expenses', ['Google Sheet · Expenses'])).toBe('Google Sheet · Expenses (2)');
    expect(sheetLabel('Expenses', ['Google Sheet · Expenses', 'Google Sheet · Expenses (2)'])).toBe('Google Sheet · Expenses (3)');
    expect(sheetLabel('  ', [])).toBe('Google Sheet · Untitled');
  });
});

const FILE = 'Google Sheet · Expenses';
const read = (csv: string) => parseStatement(csv).rows;
const V1 = 'Date,Description,Amount\n2026-11-01,Swiggy,450\n2026-11-02,Uber,250\n2026-11-02,Uber,250\n';

describe('syncRows: keeping the saved rows in step with the sheet', () => {
  it('adds everything the first time', () => {
    const r = syncRows([], read(V1), FILE);
    expect(r).toMatchObject({ added: 3, removed: 0, duplicates: 0 });
    expect(r.rows.every((t) => t.file === FILE)).toBe(true);
  });
  it('is quiet when nothing changed', () => {
    const first = syncRows([], read(V1), FILE).rows;
    expect(syncRows(first, read(V1), FILE)).toMatchObject({ added: 0, removed: 0 });
  });
  it('picks up a new row and a removed row', () => {
    const first = syncRows([], read(V1), FILE).rows;
    const v2 = 'Date,Description,Amount\n2026-11-01,Swiggy,450\n2026-11-02,Uber,250\n2026-11-03,Zomato,300\n';
    const r = syncRows(first, read(v2), FILE);
    expect(r).toMatchObject({ added: 1, removed: 1 });
    expect(r.rows).toHaveLength(3);
  });
  it('treats two identical lines as two transactions, not one', () => {
    expect(syncRows([], read(V1), FILE).rows.filter((t) => t.description === 'Uber')).toHaveLength(2);
  });
  it('keeps a category the person changed', () => {
    const first = syncRows([], read(V1), FILE).rows;
    const edited = first.map((t) => (t.description === 'Swiggy' ? { ...t, category: 'Entertainment' } : t));
    const r = syncRows(edited, read(V1), FILE);
    expect(r.rows.find((t) => t.description === 'Swiggy')?.category).toBe('Entertainment');
  });
  it('leaves other files alone and does not add what a statement already holds', () => {
    const other: Txn[] = read(V1).slice(0, 1).map((t) => ({ ...t, file: 'april.csv' }));
    const r = syncRows(other, read(V1), FILE);
    expect(r.duplicates).toBe(1);
    expect(r.rows).toHaveLength(2);
    expect(r.rows.some((t) => t.id === other[0].id)).toBe(false);
  });
});

describe('looksDestructive', () => {
  it('flags a sheet that lost most of its rows, not a small edit or a small sheet', () => {
    expect(looksDestructive(148, 140)).toBe(true);
    expect(looksDestructive(148, 3)).toBe(false);
    expect(looksDestructive(6, 6)).toBe(false);
    expect(looksDestructive(40, 21)).toBe(true);
  });
});

describe('fetchSheetCsv', () => {
  const ok = (body: string, status = 200) => vi.fn(async () => new Response(body, { status }));
  it('returns the text', async () => {
    expect(await fetchSheetCsv(['https://x/1'], ok('a,b\n1,2'))).toBe('a,b\n1,2');
  });
  it('says private for a sign-in page and for 401 and 403', async () => {
    await expect(fetchSheetCsv(['u'], ok('<!DOCTYPE html><html>'))).rejects.toMatchObject({ kind: 'private' });
    await expect(fetchSheetCsv(['u'], ok('x', 403))).rejects.toMatchObject({ kind: 'private' });
    await expect(fetchSheetCsv(['u'], ok('x', 401))).rejects.toMatchObject({ kind: 'private' });
  });
  it('says not found, empty and error', async () => {
    await expect(fetchSheetCsv(['u'], ok('x', 404))).rejects.toMatchObject({ kind: 'notfound' });
    await expect(fetchSheetCsv(['u'], ok('  \n'))).rejects.toMatchObject({ kind: 'empty' });
    await expect(fetchSheetCsv(['u'], ok('x', 500))).rejects.toMatchObject({ kind: 'http' });
  });
  it('refuses a huge sheet', async () => {
    await expect(fetchSheetCsv(['u'], ok('x'.repeat(5_000_001)))).rejects.toMatchObject({ kind: 'toolarge' });
  });
  it('moves to the next address only when the browser could not reach the first', async () => {
    const f = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(new Response('a,b'));
    expect(await fetchSheetCsv(['first', 'second'], f as unknown as typeof fetch)).toBe('a,b');
    expect(f).toHaveBeenCalledTimes(2);
    const g = vi.fn(async () => new Response('<html>'));
    await expect(fetchSheetCsv(['first', 'second'], g as unknown as typeof fetch)).rejects.toBeInstanceOf(SheetFetchError);
    expect(g).toHaveBeenCalledTimes(1); // a sign-in page is final: the second address would say the same
  });
  it('reports unreachable when every address fails', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(fetchSheetCsv(['a', 'b'], f as unknown as typeof fetch)).rejects.toMatchObject({ kind: 'unreachable' });
  });
  it('asks without cookies and without the browser cache', async () => {
    const f = ok('a,b');
    await fetchSheetCsv(['u'], f);
    expect((f.mock.calls as unknown as unknown[][])[0][1]).toMatchObject({ cache: 'no-store', credentials: 'omit' });
  });
});

describe('month tabs', () => {
  it('spreadsheetId takes a share link or a bare id and refuses published links', () => {
    expect(spreadsheetId(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`)).toEqual({ ok: true, id: ID });
    expect(spreadsheetId(ID)).toEqual({ ok: true, id: ID });
    expect(spreadsheetId('https://docs.google.com/spreadsheets/d/e/2PACX-1vABC/pubhtml')).toMatchObject({ ok: false });
    expect(spreadsheetId('https://evil.example/spreadsheets/d/' + ID)).toMatchObject({ ok: false });
    expect(spreadsheetId('')).toMatchObject({ ok: false });
  });
  it('tabTarget asks for a tab by name and encodes it', () => {
    expect(tabTarget(ID, ' Nov 2026 ')).toEqual([`https://docs.google.com/spreadsheets/d/${ID}/gviz/tq?tqx=out:csv&sheet=Nov%202026`]);
    expect(tabTarget(ID, 'a&b=1')[0]).toContain('sheet=a%26b%3D1');
  });
  it('splitTabNames splits on lines, commas and semicolons and drops repeats', () => {
    expect(splitTabNames('Nov 2026, Dec 2026\nnov 2026;Jan 2027\n\n')).toEqual(['Nov 2026', 'Dec 2026', 'Jan 2027']);
    expect(splitTabNames('')).toEqual([]);
  });
  it('monthOfTab reads the usual month tab names', () => {
    for (const [n, ym] of [['Nov 2026', '2026-11'], ['November 2026', '2026-11'], ['Nov-26', '2026-11'], ['2026-11', '2026-11'], ['11/2026', '2026-11'], ['Sept 2025', '2025-09']] as const) expect(monthOfTab(n)?.ym, n).toBe(ym);
    for (const n of ['Summary', 'Budget', 'Foo 2026', '13/2026', '']) expect(monthOfTab(n), n).toBeNull();
  });
  it('year-less dates take the year from the tab', () => {
    const csv = 'Date,Description,Amount\n5 Nov,Coffee,-120\nNov 7,Salary,50000\n';
    const r = parseStatement(csv, { defaultYear: 2026 });
    expect(r.rows.map((x) => x.date)).toEqual(['2026-11-05', '2026-11-07']);
    expect(parseStatement(csv).rows).toHaveLength(0);
  });
});

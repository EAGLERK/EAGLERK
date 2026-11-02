import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDate, parseMoney, parseStatement, serialToISO } from '../src/engine/csv';
import { readStatementBytes } from '../src/engine/statementFile';

type Row = [string, number, 'income' | 'expense'];
const summary = (r: { rows: Array<{ date: string; amount: number; type: string }> }) => r.rows.map((x) => [x.date, x.amount, x.type]);

// The same four transactions, laid out the way different banks (and different mistakes) lay them out.
const FOUR: Row[] = [
  ['2026-10-01', 450, 'expense'],
  ['2026-10-02', 125000, 'income'],
  ['2026-10-03', 1290.5, 'expense'],
  ['2026-10-05', 5000, 'expense'],
];

describe('bank statement layouts', () => {
  it('HDFC: preamble, Withdrawal/Deposit, two-digit years', () => {
    const r = parseStatement(`Account Statement,,,,,,
Customer: A B,,,,,,
Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance
01/10/26,UPI-SWIGGY ORDER,0000111,01/10/26,450.00,,50000.00
02/10/26,NEFT-ACME TECHNOLOGIES-SALARY,0000222,02/10/26,,"1,25,000.00","1,75,000.00"
03/10/26,UPI-BigBasket,0000333,03/10/26,"1,290.50",,"1,73,709.50"
05/10/26,ATM WITHDRAWAL,0000444,05/10/26,"5,000.00",,"1,68,709.50"
`);
    expect(summary(r)).toEqual(FOUR);
    expect(r.rows[0].description).toBe('UPI-SWIGGY ORDER');
  });

  it('ICICI: serial number and two date columns, zeros filled into the unused debit/credit cell', () => {
    const r = parseStatement(`S No.,Value Date,Transaction Date,Cheque Number,Transaction Remarks,Withdrawal Amount (INR ),Deposit Amount (INR ),Balance (INR )
1,01/10/2026,01/10/2026,,UPI-SWIGGY ORDER,450.00,0.00,50000.00
2,02/10/2026,02/10/2026,,NEFT-ACME TECHNOLOGIES-SALARY,0.00,125000.00,175000.00
3,03/10/2026,03/10/2026,,UPI-BigBasket,1290.50,0.00,173709.50
4,05/10/2026,05/10/2026,,ATM WITHDRAWAL,5000.00,0.00,168709.50
`);
    expect(summary(r)).toEqual(FOUR);
  });

  it('SBI: tab separated, "1 Oct 2026" dates', () => {
    const r = parseStatement(['Txn Date\tValue Date\tDescription\tRef No./Cheque No.\tDebit\tCredit\tBalance',
      '1 Oct 2026\t1 Oct 2026\tUPI-SWIGGY ORDER\t\t450.00\t\t50,000.00',
      '2 Oct 2026\t2 Oct 2026\tNEFT-ACME TECHNOLOGIES-SALARY\t\t\t1,25,000.00\t1,75,000.00',
      '3 Oct 2026\t3 Oct 2026\tUPI-BigBasket\t\t1,290.50\t\t1,73,709.50',
      '5 Oct 2026\t5 Oct 2026\tATM WITHDRAWAL\t\t5,000.00\t\t1,68,709.50'].join('\n'));
    expect(summary(r)).toEqual(FOUR);
  });

  it('Axis: DR / CR column names and dd-mm-yyyy', () => {
    const r = parseStatement(`SRL NO,Tran Date,CHQNO,PARTICULARS,DR,CR,BAL,SOL
1,01-10-2026,,UPI-SWIGGY ORDER,450.00,,50000.00,123
2,02-10-2026,,NEFT-ACME TECHNOLOGIES-SALARY,,125000.00,175000.00,123
3,03-10-2026,,UPI-BigBasket,1290.50,,173709.50,123
4,05-10-2026,,ATM WITHDRAWAL,5000.00,,168709.50,123
`);
    expect(summary(r)).toEqual(FOUR);
  });

  it('Kotak: two Dr / Cr marker columns next to Debit and Credit', () => {
    const r = parseStatement(`Sl. No.,Transaction Date,Value Date,Description,Chq / Ref No.,Debit,Credit,Dr / Cr,Balance,Dr / Cr
1,01-Oct-2026,01-Oct-2026,UPI-SWIGGY ORDER,,450.00,,DR,50000.00,CR
2,02-Oct-2026,02-Oct-2026,NEFT-ACME TECHNOLOGIES-SALARY,,,125000.00,CR,175000.00,CR
3,03-Oct-2026,03-Oct-2026,UPI-BigBasket,,1290.50,,DR,173709.50,CR
4,05-Oct-2026,05-Oct-2026,ATM WITHDRAWAL,,5000.00,,DR,168709.50,CR
`);
    expect(summary(r)).toEqual(FOUR);
  });

  it('one signed amount column, including (brackets) and a unicode minus', () => {
    const r = parseStatement(`Date,Description,Amount
01/10/2026,UPI-SWIGGY ORDER,−450.00
02/10/2026,NEFT-ACME TECHNOLOGIES-SALARY,"1,25,000.00"
03/10/2026,UPI-BigBasket,(1290.50)
05/10/2026,ATM WITHDRAWAL,-5000
`);
    expect(summary(r)).toEqual(FOUR);
  });

  it('one amount column with Dr/Cr written after the number', () => {
    const r = parseStatement(`Date,Narration,Amount
01/10/2026,UPI-SWIGGY ORDER,450.00 Dr
02/10/2026,NEFT-ACME TECHNOLOGIES-SALARY,"1,25,000.00 Cr"
03/10/2026,UPI-BigBasket,1290.50 Dr
05/10/2026,ATM WITHDRAWAL,5000.00 Dr
`);
    expect(summary(r)).toEqual(FOUR);
  });

  it('no header at all: debit, credit and balance are told apart by how they are filled', () => {
    const r = parseStatement(`01/10/26,UPI-SWIGGY ORDER,450.00,,50000.00
02/10/26,NEFT-ACME TECHNOLOGIES-SALARY,,125000.00,175000.00
03/10/26,UPI-BigBasket,1290.50,,173709.50
05/10/26,ATM WITHDRAWAL,5000.00,,168709.50
`);
    expect(summary(r)).toEqual(FOUR);
    expect(r.notes.join(' ')).toContain('not labelled');
  });

  it('headers I have never seen, newest first, columns swapped: the balance decides which column is money in', () => {
    const r = parseStatement(`When,What,In,Out,Left
05/10/26,ATM WITHDRAWAL,,5000.00,168709.50
03/10/26,UPI-BigBasket,,1290.50,173709.50
02/10/26,NEFT-ACME TECHNOLOGIES-SALARY,125000.00,,175000.00
01/10/26,UPI-SWIGGY ORDER,,450.00,50000.00
`);
    expect(summary(r)).toEqual([...FOUR].reverse());
  });

  it('one unsigned amount column plus balance, oldest first and newest first', () => {
    const oldest = `Date,Details,Amount,Balance
01/10/2026,UPI-SWIGGY ORDER,450.00,50000.00
02/10/2026,NEFT-ACME TECHNOLOGIES-SALARY,125000.00,175000.00
03/10/2026,UPI-BigBasket,1290.50,173709.50
05/10/2026,ATM WITHDRAWAL,5000.00,168709.50
`;
    const a = parseStatement(oldest);
    expect(summary(a).slice(1)).toEqual(FOUR.slice(1)); // the first row has nothing before it to compare with
    expect(a.notes.join(' ')).toContain('running balance');
    const newest = `Date,Details,Amount,Balance
05/10/2026,ATM WITHDRAWAL,5000.00,168709.50
03/10/2026,UPI-BigBasket,1290.50,173709.50
02/10/2026,NEFT-ACME TECHNOLOGIES-SALARY,125000.00,175000.00
01/10/2026,UPI-SWIGGY ORDER,450.00,50000.00
`;
    const b = parseStatement(newest);
    expect(summary(b).slice(0, 3)).toEqual([...FOUR].reverse().slice(0, 3));
  });

  it('semicolons, a sep= hint, quoted narration with a line break, and a wrapped narration line', () => {
    const r = parseStatement(`sep=;
Date;Narration;Debit;Credit;Balance
01/10/2026;"UPI-SWIGGY
ORDER 123";450.00;;50000.00
02/10/2026;NEFT-ACME TECHNOLOGIES-SALARY;;125000.00;175000.00
03/10/2026;UPI-BigBasket;1290.50;;173709.50
;MORE DETAIL FOR BIGBASKET;;;
05/10/2026;ATM WITHDRAWAL;5000.00;;168709.50
`);
    expect(summary(r)).toEqual(FOUR);
    expect(r.rows[0].description).toBe('UPI-SWIGGY ORDER 123');
    expect(r.rows[2].description).toBe('UPI-BigBasket MORE DETAIL FOR BIGBASKET');
  });

  it('month-first dates when the file proves it', () => {
    const r = parseStatement(`Date,Description,Debit,Credit
10/25/2026,UPI-SWIGGY ORDER,450.00,
10/02/2026,NEFT SALARY,,125000.00
`);
    expect(r.rows.map((x) => x.date)).toEqual(['2026-10-25', '2026-10-02']);
  });

  it('keeps two identical same-day rows, and gives the same ids when read twice', () => {
    const text = `Date,Narration,Debit,Credit
01/10/2026,COFFEE,120.00,
01/10/2026,COFFEE,120.00,
`;
    const a = parseStatement(text);
    expect(a.rows).toHaveLength(2);
    expect(new Set(a.rows.map((x) => x.id)).size).toBe(2);
    expect(parseStatement(text).rows.map((x) => x.id)).toEqual(a.rows.map((x) => x.id));
  });

  it('skips opening balance and total lines without failing', () => {
    const r = parseStatement(`Date,Narration,Debit,Credit,Balance
,OPENING BALANCE,,,50450.00
01/10/2026,UPI-SWIGGY ORDER,450.00,,50000.00
,TOTAL,450.00,0.00,
`);
    expect(summary(r)).toEqual([FOUR[0]]);
  });
});

describe('file types', () => {
  const bytes = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

  it('reads a real .xlsx made by openpyxl: preamble rows and true date cells', async () => {
    const r = await readStatementBytes(bytes(readFileSync('tests/fixtures/statement-openpyxl.xlsx')));
    expect(summary(r)).toEqual(FOUR);
    expect(r.rows[3].description).toBe('ATM WITHDRAWAL & CASH');
  });

  it('reads a real .xlsx made by xlsxwriter: data on the second sheet, one signed amount column', async () => {
    const r = await readStatementBytes(bytes(readFileSync('tests/fixtures/statement-xlsxwriter.xlsx')));
    expect(summary(r)).toEqual(FOUR);
  });

  it('reads an HTML table saved with an .xls name', async () => {
    const html = `<html><body><p>Statement</p><table><tr><th>Date</th><th>Narration</th><th>Withdrawal Amt.</th><th>Deposit Amt.</th><th>Closing Balance</th></tr>
<tr><td>01/10/2026</td><td>UPI&nbsp;SWIGGY &amp; CO</td><td>450.00</td><td>&nbsp;</td><td>50,000.00</td></tr>
<tr><td>02/10/2026</td><td>SALARY</td><td></td><td>1,25,000.00</td><td>1,75,000.00</td></tr></table></body></html>`;
    const r = await readStatementBytes(bytes(Buffer.from(html)));
    expect(summary(r)).toEqual([FOUR[0], FOUR[1]]);
    expect(r.rows[0].description).toBe('UPI SWIGGY & CO');
  });

  it('reads UTF-16 text with a byte order mark', async () => {
    const text = 'Date,Narration,Debit,Credit\r\n01/10/2026,UPI-SWIGGY,450.00,\r\n';
    const b = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
    expect(summary(await readStatementBytes(bytes(b)))).toEqual([FOUR[0]]);
  });

  it('says plainly what it cannot read', async () => {
    const pdf = await readStatementBytes(bytes(Buffer.from('%PDF-1.7 ...')));
    expect(pdf.rows).toHaveLength(0);
    expect(pdf.warnings[0]).toMatch(/PDF/);
    const xls = await readStatementBytes(bytes(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0])));
    expect(xls.warnings[0]).toMatch(/old Excel format/);
    const noDates = parseStatement('Name,Place,Colour\nAnu,Pune,red\nRaj,Goa,blue\n');
    expect(noDates.warnings[0]).toMatch(/could not find a column of dates/);
    const noMoney = parseStatement('Date,Description,Note\n01/10/2026,Lunch,fine\n02/10/2026,Dinner,fine\n');
    expect(noMoney.rows).toHaveLength(0);
  });
});

describe('cell readers', () => {
  it('reads dates in the formats banks use', () => {
    expect(parseDate('01/10/26')).toBe('2026-10-01');
    expect(parseDate('01-10-2026 14:32:10')).toBe('2026-10-01');
    expect(parseDate('2026-10-01T10:00:00')).toBe('2026-10-01');
    expect(parseDate('1st Oct 2026')).toBe('2026-10-01');
    expect(parseDate('01 October 2026')).toBe('2026-10-01');
    expect(parseDate('Oct 1, 2026')).toBe('2026-10-01');
    expect(parseDate('10/25/2026', 'mdy')).toBe('2026-10-25');
    expect(parseDate('12345678')).toBeNull();
    expect(parseDate('45/13/2026')).toBeNull();
  });

  it('turns Excel day numbers into dates and ignores other numbers', () => {
    expect(serialToISO('46296')).toBe('2026-10-01');
    expect(serialToISO('46296.5')).toBe('2026-10-01');
    expect(serialToISO('123')).toBeNull();
    expect(serialToISO('99999')).toBeNull();
  });

  it('reads amounts', () => {
    expect(parseMoney('₹1,23,456.78')?.n).toBe(123456.78);
    expect(parseMoney('(500.00)')?.n).toBe(-500);
    expect(parseMoney('450-')?.n).toBe(-450);
    expect(parseMoney('450.00 Dr')).toMatchObject({ n: 450, mark: 'dr' });
    expect(parseMoney('Cr 1,200')).toMatchObject({ n: 1200, mark: 'cr' });
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('')).toBeNull();
  });
});

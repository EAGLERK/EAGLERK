import { afterEach, describe, expect, it, vi } from 'vitest';
import { assumptionsFor, DEFAULT_ASSUMPTIONS, GOAL_KEYS, ratesFromAssumptions } from '../src/engine/assumptions';
import { categorize } from '../src/engine/categorize';
import { parseMoney, parseStatement } from '../src/engine/csv';
import { newGoal, planGoal } from '../src/engine/goals';
import { cur, money, moneyCompact, moneyExact } from '../src/lib/format';
import { COUNTRIES, currencyChoices, dateOrderFor, detectCountry, emiWord, emiWords, isIndia, minorUnits, setMoneyContext } from '../src/lib/region';
import { newProfile, profileRegion } from '../src/store';
import { findAmount, parseAmountPhrase } from '../src/voice/numbers';
import { parseCommand } from '../src/voice/parse';
import { speechLang } from '../src/voice/speech';

const nav = (language: string, languages = [language]) => vi.stubGlobal('navigator', { language, languages });
afterEach(() => { vi.unstubAllGlobals(); setMoneyContext('IN', 'INR'); });

describe('countries and currencies', () => {
  it('the table has unique codes and valid ISO currency codes', () => {
    expect(new Set(COUNTRIES.map((c) => c.code)).size).toBe(COUNTRIES.length);
    for (const c of COUNTRIES) { expect(c.currency).toMatch(/^[A-Z]{3}$/); expect(() => new Intl.NumberFormat('en', { style: 'currency', currency: c.currency })).not.toThrow(); }
  });
  it('guesses the country from the browser language, and falls back to a stated default', () => {
    nav('de-DE'); expect(detectCountry()).toEqual({ country: 'DE', currency: 'EUR' });
    nav('en-GB'); expect(detectCountry()).toEqual({ country: 'GB', currency: 'GBP' });
    nav('en-IN'); expect(detectCountry()).toEqual({ country: 'IN', currency: 'INR' });
    nav('xx-ZZ', ['xx-ZZ']); expect(detectCountry().currency).toBe('USD');
  });
  it('only India gets the India-specific tools; dates are month-first in the US and the Philippines', () => {
    expect(isIndia('IN')).toBe(true); expect(isIndia(undefined)).toBe(true); expect(isIndia('US')).toBe(false);
    expect(dateOrderFor('US')).toBe('mdy'); expect(dateOrderFor('PH')).toBe('mdy'); expect(dateOrderFor('GB')).toBe('dmy'); expect(dateOrderFor('IN')).toBe('dmy');
  });
  it('lists many currencies with names', () => {
    const c = currencyChoices();
    expect(c.length).toBeGreaterThan(20);
    expect(c.find((x) => x.code === 'USD')?.name).toMatch(/dollar/i);
  });
  it('data saved before the app was global means India and rupees', () => {
    expect(profileRegion({})).toEqual({ country: 'IN', currency: 'INR' });
    expect(profileRegion({ country: 'US', currency: 'USD' })).toEqual({ country: 'US', currency: 'USD' });
  });
  it('a new profile outside India starts with no rupee-sized income numbers', () => {
    const us = newProfile('Sam', 'US');
    expect(us).toMatchObject({ name: 'Sam', country: 'US', currency: 'USD', monthlyIncome: 0, monthlyExpenses: 0, annualGrossIncome: 0 });
    const inn = newProfile('Asha', 'IN');
    expect(inn).toMatchObject({ country: 'IN', currency: 'INR', monthlyIncome: 100_000 });
  });
});

describe('money formatting follows the country', () => {
  it('India: rupees with lakh grouping, unchanged from before', () => {
    setMoneyContext('IN', 'INR');
    expect(money(125430)).toBe('₹1,25,430');
    expect(money(-2740)).toBe('-₹2,740');
    expect(moneyCompact(125430)).toBe('₹1.25 L');
    expect(moneyCompact(15_000_000)).toBe('₹1.50 Cr');
    expect(cur()).toBe('₹');
  });
  it('US: dollars, cents kept below 1,000, whole dollars above', () => {
    nav('en-US'); setMoneyContext('US', 'USD');
    expect(money(125430)).toBe('$125,430');
    expect(money(4.5)).toBe('$4.50');
    expect(money(1234.56)).toBe('$1,235');
    expect(moneyExact(4.5)).toBe('$4.50');
    expect(moneyExact(450)).toBe('$450');
    expect(moneyCompact(1_200_000)).toMatch(/\$1\.2M/);
    expect(cur()).toBe('$');
    expect(minorUnits()).toBe(2);
  });
  it('Germany: euros with the local separators', () => {
    nav('de-DE'); setMoneyContext('DE', 'EUR');
    expect(money(125430)).toMatch(/125\.430\s?€/);
    expect(moneyExact(4.5)).toMatch(/4,50\s?€/);
  });
  it('Japan: a currency with no minor units never shows decimals', () => {
    nav('ja-JP'); setMoneyContext('JP', 'JPY');
    expect(minorUnits()).toBe(0);
    expect(money(450.5)).toMatch(/450|451/);
    expect(money(450.5)).not.toMatch(/\./);
  });
  it('a currency that differs from the country is respected (a dollar account in India)', () => {
    nav('en-IN'); setMoneyContext('IN', 'USD');
    expect(money(125430)).toMatch(/\$1,25,430|US\$1,25,430/);
  });
  it('an unknown currency code does not throw', () => {
    setMoneyContext('US', 'ZZZ');
    expect(() => money(5)).not.toThrow();
  });
  it('non-numbers show a dash', () => { expect(money(NaN)).toBe('-'); expect(moneyCompact(Infinity)).toBe('-'); });
});

describe('reading amounts from statements in any format', () => {
  const n = (s: string) => parseMoney(s)?.n;
  it('US and UK', () => { expect(n('$1,234.50')).toBe(1234.5); expect(n('£12.00')).toBe(12); expect(n('(500.00)')).toBe(-500); expect(n('-4.50')).toBe(-4.5); expect(n('12,345,678')).toBe(12345678); expect(n('1,234')).toBe(1234); });
  it('India, unchanged', () => { expect(n('₹1,23,456.78')).toBe(123456.78); expect(n('Rs. 1,200')).toBe(1200); expect(n('450 Dr')).toBe(450); expect(parseMoney('450 Dr')?.mark).toBe('dr'); });
  it('Europe: decimal comma, dot or space for thousands', () => { expect(n('1.234,56 €')).toBe(1234.56); expect(n('450,00')).toBe(450); expect(n('12,5')).toBe(12.5); expect(n('1 234,56')).toBe(1234.56); expect(n('-45,30')).toBe(-45.3); });
  it('Switzerland: apostrophe thousands', () => { expect(n("CHF 1'234.50")).toBe(1234.5); });
  it('currency codes in front or behind', () => { expect(n('USD 12.00')).toBe(12); expect(n('12.00 EUR')).toBe(12); expect(n('EUR 12,5')).toBe(12.5); });
  it('text that merely looks like it has a code is not an amount', () => { expect(parseMoney('UPI123')).toBeNull(); expect(parseMoney('ABC 12')).toBeNull(); expect(parseMoney('Coffee')).toBeNull(); });
});

describe('reading dates the way the country writes them', () => {
  const US = 'Date,Description,Amount\n04/03/2026,STARBUCKS,-4.50\n';
  it('month-first when the country says so and the file does not settle it', () => {
    expect(parseStatement(US, { dateOrder: 'mdy' }).rows[0].date).toBe('2026-04-03');
    expect(parseStatement(US).rows[0].date).toBe('2026-03-04');
  });
  it('the file settles it when it can, whatever the country says', () => {
    const f = 'Date,Description,Amount\n25/04/2026,SHOP,-4.50\n';
    expect(parseStatement(f, { dateOrder: 'mdy' }).rows[0].date).toBe('2026-04-25');
    const g = 'Date,Description,Amount\n04/25/2026,SHOP,-4.50\n';
    expect(parseStatement(g).rows[0].date).toBe('2026-04-25');
  });
  it('a German export: semicolons, dd.mm.yyyy and decimal commas', () => {
    const de = 'Buchungstag;Beschreibung;Betrag\n03.04.2026;REWE Markt;-45,30\n02.04.2026;Gehalt;2.500,00\n';
    const r = parseStatement(de).rows;
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ date: '2026-04-03', amount: 45.3, type: 'expense' });
    expect(r[1]).toMatchObject({ date: '2026-04-02', amount: 2500, type: 'income' });
  });
});

describe('assumptions and rules by country', () => {
  it('India keeps all its researched assumptions; elsewhere only what goals need, as placeholders', () => {
    expect(assumptionsFor('IN')).toBe(DEFAULT_ASSUMPTIONS);
    const us = assumptionsFor('US');
    expect(us.map((a) => a.key).sort()).toEqual([...GOAL_KEYS].sort());
    for (const a of us) { expect(a.status).toBe('check'); expect(a.source).toMatch(/placeholder|assumed 0/i); expect(a.source).not.toMatch(/RBI|small-savings|Business Today/i); }
    expect(us.find((a) => a.key === 'fd')?.value).toBe(0);
  });
  it('the lender-minimum rule is India\'s, and is only checked there', () => {
    const rates = ratesFromAssumptions(DEFAULT_ASSUMPTIONS);
    const ctx = { today: '2026-11-05', rates, monthlyIncome: 200_000, existingEmi: 0, marginal: 0, annualIncome: 2_400_000 };
    const house = newGoal('house', 'h', '2026-11-05', rates);
    setMoneyContext('IN', 'INR');
    expect(planGoal(house, ctx).checks.map((c) => c.label).join('|')).toMatch(/Lender minimum down payment/);
    nav('en-US'); setMoneyContext('US', 'USD');
    const labels = planGoal(house, ctx).checks.map((c) => c.label).join('|');
    expect(labels).not.toMatch(/Lender minimum/);
    expect(labels).toMatch(/20% down payment/);
    expect(labels).toMatch(/loan payments within 40%/);
    expect(labels).not.toMatch(/EMI/);
  });
  it('outside India a goal assumes a savings account, not India\'s deposits and index funds', () => {
    const rates = { ...ratesFromAssumptions(DEFAULT_ASSUMPTIONS), fd: 0 };
    const ctx = { today: '2026-11-05', rates, monthlyIncome: 5000, existingEmi: 0, marginal: 0, annualIncome: 60000 };
    const far = { ...newGoal('house', 'h', '2026-11-05', rates), targetMonth: '2036-11' };
    nav('en-US'); setMoneyContext('US', 'USD');
    expect(planGoal(far, ctx)).toMatchObject({ vehicle: 'Savings account', vehicleReturn: 0 });
    setMoneyContext('IN', 'INR');
    expect(planGoal(far, { ...ctx, rates: ratesFromAssumptions(DEFAULT_ASSUMPTIONS) }).vehicle).toMatch(/index fund/i);
  });
  it('the loan-payment word is EMI only where people say EMI', () => {
    setMoneyContext('IN', 'INR'); expect(emiWord()).toBe('EMI'); expect(emiWords()).toBe('EMIs');
    setMoneyContext('US', 'USD'); expect(emiWord()).toBe('loan payment'); expect(emiWords(true)).toBe('Loan payments'); expect(emiWord(true)).toBe('Loan payment');
    setMoneyContext('PK', 'PKR'); expect(emiWord()).toBe('EMI');
  });
});

describe('sorting everyday spending from anywhere', () => {
  it.each([
    ['WALMART SUPERCENTER #1234', 'expense', 'Groceries'], ['TESCO STORES 3322', 'expense', 'Groceries'], ['DOORDASH*PIZZA', 'expense', 'Food & Dining'], ['UBER EATS HELP.UBER.COM', 'expense', 'Food & Dining'],
    ['MORTGAGE PAYMENT', 'expense', 'EMI'], ['COMCAST CABLE', 'expense', 'Utilities'], ['DELTA AIR LINES', 'expense', 'Travel'], ['PAYCHECK ACME INC', 'income', 'Salary'],
    ['LYFT RIDE', 'expense', 'Transport'], ['CVS PHARMACY', 'expense', 'Health'], ['NETFLIX.COM', 'expense', 'Subscriptions'], ['SOME LOCAL SHOP', 'expense', 'Other'],
  ] as const)('%s -> %s', (desc, type, want) => { expect(categorize(desc, type)).toBe(want); });
});

describe('saying amounts in any currency', () => {
  it('currency words are skipped and international scales work', () => {
    expect(parseAmountPhrase('12 dollars')).toBe(12);
    expect(parseAmountPhrase('twenty bucks')).toBe(20);
    expect(parseAmountPhrase('1.5 million')).toBe(1_500_000);
    expect(parseAmountPhrase('2 mn')).toBe(2_000_000);
    expect(parseAmountPhrase('3 billion')).toBe(3_000_000_000);
    expect(parseAmountPhrase('80 lakh')).toBe(8_000_000);
    expect(findAmount('i paid 45 euros for dinner'.split(' '))?.value).toBe(45);
  });
  it('commands read the same in dollars', () => {
    expect(parseCommand('spent 12 dollars on lunch', '2026-11-05')).toMatchObject({ t: 'addTxn', type: 'expense', amount: 12, description: 'Lunch' });
    expect(parseCommand('paid 4.50 for coffee', '2026-11-05')).toMatchObject({ t: 'addTxn', amount: 4.5 });
    expect(parseCommand('got paid 2 thousand pounds', '2026-11-05')).toMatchObject({ t: 'addTxn', type: 'income', amount: 2000 });
  });
  it('the recogniser is told which English to expect', () => {
    setMoneyContext('IN', 'INR'); expect(speechLang()).toBe('en-IN');
    setMoneyContext('US', 'USD'); expect(speechLang()).toBe('en-US');
    setMoneyContext('GB', 'GBP'); expect(speechLang()).toBe('en-GB');
    setMoneyContext('DE', 'EUR'); expect(speechLang()).toBe('en-US');
  });
});

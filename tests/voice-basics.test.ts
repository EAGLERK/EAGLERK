import { describe, expect, it } from 'vitest';
import { extractDate, parseMonthYear } from '../src/voice/dates';
import { findAmount, parseAmountPhrase } from '../src/voice/numbers';

const amt = (s: string) => parseAmountPhrase(s);

describe('spoken amounts', () => {
  it('reads digits in the usual Indian and plain formats', () => {
    expect(amt('450')).toBe(450);
    expect(amt('1,25,000')).toBe(125000);
    expect(amt('₹1,200')).toBe(1200);
    expect(amt('rs 450')).toBe(450);
    expect(amt('450 rupees')).toBe(450);
    expect(amt('1200.50')).toBe(1200.5);
  });

  it('reads k, lakh and crore, glued or spoken', () => {
    expect(amt('2k')).toBe(2000);
    expect(amt('12k')).toBe(12000);
    expect(amt('1.5 lakh')).toBe(150000);
    expect(amt('1.5l')).toBe(150000);
    expect(amt('3 lakhs')).toBe(300000);
    expect(amt('2 crore')).toBe(20000000);
    expect(amt('2.5 thousand')).toBe(2500);
  });

  it('reads number words', () => {
    expect(amt('five hundred')).toBe(500);
    expect(amt('two thousand five hundred')).toBe(2500);
    expect(amt('twelve hundred')).toBe(1200);
    expect(amt('a hundred')).toBe(100);
    expect(amt('one lakh twenty five thousand')).toBe(125000);
    expect(amt('two hundred and fifty')).toBe(250);
    expect(amt('forty five')).toBe(45);
    expect(amt('half a lakh')).toBe(50000);
    expect(amt('one point five lakh')).toBe(150000);
    expect(amt('three hundred rupees')).toBe(300);
  });

  it('finds an amount inside a sentence and reports which words it used', () => {
    const t = 'spent rs 1200 on groceries'.split(' ');
    const m = findAmount(t)!;
    expect(m.value).toBe(1200);
    expect(t.slice(m.start, m.end)).toEqual(['rs', '1200']);
    const w = 'paid two thousand five hundred rupees for rent'.split(' ');
    const n = findAmount(w)!;
    expect(n.value).toBe(2500);
    expect(w.slice(n.start, n.end)).toEqual(['two', 'thousand', 'five', 'hundred', 'rupees']);
  });

  it('does not treat other words as numbers', () => {
    expect(findAmount('add a note about the trip'.split(' '))).toBeNull();
    expect(amt('hello')).toBeNull();
    expect(amt('450 and some more words')).toBeNull();
  });
});

const TODAY = '2026-11-03'; // a Tuesday
describe('spoken dates', () => {
  const d = (s: string) => extractDate(s, TODAY);

  it('relative days', () => {
    expect(d('spent 100 on tea today').date).toBe('2026-11-03');
    expect(d('spent 100 on tea yesterday').date).toBe('2026-11-02');
    expect(d('paid it the day before yesterday').date).toBe('2026-11-01');
    expect(d('paid it 3 days ago').date).toBe('2026-10-31');
    expect(d('paid it two days ago').date).toBe('2026-11-01');
  });

  it('removes the date phrase from the sentence', () => {
    expect(d('paid rent on 1st november').text).toBe('paid rent');
    expect(d('spent 100 on tea yesterday').text).toBe('spent 100 on tea');
  });

  it('weekdays go back to the most recent one', () => {
    expect(d('lunch on friday').date).toBe('2026-10-30');
    expect(d('lunch last tuesday').date).toBe('2026-10-27');
    expect(d('lunch on tuesday').date).toBe('2026-11-03');
  });

  it('day and month, in both orders, with or without a year', () => {
    expect(d('rent on 1st november').date).toBe('2026-11-01');
    expect(d('rent on november 1').date).toBe('2026-11-01');
    expect(d('rent 5 oct').date).toBe('2026-10-05');
    expect(d('rent third of october').date).toBe('2026-10-03');
    expect(d('rent 3 october 2025').date).toBe('2025-10-03');
  });

  it('never returns a future date: a day that has not come yet this year means last year', () => {
    expect(d('rent on 25 december').date).toBe('2025-12-25');
    expect(d('rent on 31 february').date).toBeNull();
  });

  it('"on the 15th" means this month, or last month when it has not come yet', () => {
    expect(d('rent on the 2nd').date).toBe('2026-11-02');
    expect(d('rent on the 15th').date).toBe('2026-10-15');
  });

  it('returns null when there is no date', () => {
    expect(d('spent 100 on tea').date).toBeNull();
  });

  it('reads a target month for goals', () => {
    expect(parseMonthYear('december 2027')).toBe('2027-12');
    expect(parseMonthYear('to dec 2028')).toBe('2028-12');
    expect(parseMonthYear('next year')).toBeNull();
  });
});

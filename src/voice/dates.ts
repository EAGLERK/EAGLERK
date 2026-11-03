/** Reading spoken dates: today, yesterday, two days ago, last Friday, 3rd November, November 3 2026. Never returns a future date. */

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const NUM_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, a: 1 };
const ORDINAL_WORDS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20, thirtieth: 30 };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string) => new Date(`${s}T00:00:00Z`);
const addDays = (s: string, n: number) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const valid = (y: number, m: number, d: number) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };
const pad = (n: number) => String(n).padStart(2, '0');

export const monthName = (m: number) => MONTHS[m - 1];
export const monthIndex = (w: string): number => MONTHS.findIndex((m) => m === w || (w.length >= 3 && m.startsWith(w) && w.length <= m.length)) + 1;

/** Finds a date phrase in `text` (lower case) and returns the date with the phrase cut out. */
export function extractDate(text: string, today: string): { date: string | null; text: string } {
  const cut = (re: RegExp, to: string | ((m: RegExpMatchArray) => string | null)) => {
    const m = text.match(re);
    if (!m) return null;
    const date = typeof to === 'string' ? to : to(m);
    if (!date) return null;
    return { date, text: (text.slice(0, m.index) + ' ' + text.slice((m.index ?? 0) + m[0].length)).replace(/\s+/g, ' ').trim() };
  };

  const rel =
    cut(/\b(?:the )?day before yesterday\b/, addDays(today, -2)) ??
    cut(/\byesterday\b/, addDays(today, -1)) ??
    cut(/\b(?:today|tonight|this morning|this evening|this afternoon)\b/, today) ??
    cut(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|a) days? ago\b/, (m) => { const n = NUM_WORDS[m[1]] ?? Number(m[1]); return n >= 0 && n < 400 ? addDays(today, -n) : null; });
  if (rel) return rel;

  // Day of month with a month name: "3rd november", "3 nov 2026", "november 3", "the 3rd of november".
  const monthRe = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  const dayRe = '(\\d{1,2})(?:st|nd|rd|th)?|(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|thirtieth)';
  const resolve = (day: number, month: number, year?: number) => {
    const ty = Number(today.slice(0, 4));
    let y = year ?? ty;
    if (!valid(y, month, day)) return null;
    let s = `${y}-${pad(month)}-${pad(day)}`;
    if (!year && s > today) { y -= 1; if (!valid(y, month, day)) return null; s = `${y}-${pad(month)}-${pad(day)}`; }
    return s > today ? null : s;
  };
  const a = cut(new RegExp(`\\b(?:on )?(?:the )?(?:${dayRe})(?: of)? ${monthRe}(?:,? (\\d{4}))?\\b`), (m) => resolve(m[1] ? Number(m[1]) : ORDINAL_WORDS[m[2]], monthIndex(m[3]), m[4] ? Number(m[4]) : undefined));
  if (a) return a;
  const b = cut(new RegExp(`\\b(?:on )?${monthRe} (?:the )?(?:${dayRe})(?:,? (\\d{4}))?\\b`), (m) => resolve(m[2] ? Number(m[2]) : ORDINAL_WORDS[m[3]], monthIndex(m[1]), m[4] ? Number(m[4]) : undefined));
  if (b) return b;

  // A weekday: the most recent one (a week back if "last <weekday>" names today's weekday).
  const wd = cut(new RegExp(`\\b(?:on )?(last |this past )?(${DAYS.join('|')})\\b`), (m) => {
    const target = DAYS.indexOf(m[2]);
    const todayIdx = parse(today).getUTCDay();
    let back = (todayIdx - target + 7) % 7;
    if (back === 0 && m[1]) back = 7;
    return addDays(today, -back);
  });
  if (wd) return wd;

  // "on the 3rd": that day of this month, or last month if it has not happened yet.
  const d = cut(new RegExp(`\\bon the (?:${dayRe})\\b`), (m) => {
    const day = m[1] ? Number(m[1]) : ORDINAL_WORDS[m[2]];
    const ty = Number(today.slice(0, 4));
    const tm = Number(today.slice(5, 7));
    const thisMonth = valid(ty, tm, day) ? `${ty}-${pad(tm)}-${pad(day)}` : null;
    if (thisMonth && thisMonth <= today) return thisMonth;
    const py = tm === 1 ? ty - 1 : ty;
    const pm = tm === 1 ? 12 : tm - 1;
    return valid(py, pm, day) ? `${py}-${pad(pm)}-${pad(day)}` : null;
  });
  return d ?? { date: null, text };
}

/** "december 2027", "dec 27"? (not supported), "in march 2028" -> YYYY-MM. */
export function parseMonthYear(text: string): string | null {
  const m = text.toLowerCase().match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?,? (\d{4})\b/);
  if (!m) return null;
  return `${m[2]}-${pad(monthIndex(m[1]))}`;
}

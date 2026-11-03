/**
 * Reading amounts the way people say them in India: 450, 1,25,000, 2k, 1.5 lakh, "two thousand five hundred", "twelve hundred",
 * "half a lakh", "one point five crore". Works on lower-case text with punctuation already cleaned up.
 */

const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALE: Record<string, number> = { hundred: 100, thousand: 1000, k: 1000, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, lakhh: 1e5, crore: 1e7, crores: 1e7, million: 1e6, m: 1e6, l: 1e5 };
const CURRENCY = new Set(['rs', 'rupee', 'rupees', 'inr', 'rupaye', 'rupay']);

const isDigits = (t: string) => /^\d+(\.\d+)?$/.test(t);
const isWord = (t: string) => t in ONES || t in TENS;

/** "2k", "1.5l", "12m" (suffix glued to the digits) */
function splitGlued(t: string): string[] {
  const m = t.match(/^(\d+(?:\.\d+)?)(k|l|lakh|lakhs|lac|cr|crore|m)$/);
  return m ? [m[1], m[2] === 'cr' ? 'crore' : m[2]] : [t];
}

export interface AmountMatch { value: number; start: number; end: number }

/**
 * Finds the first amount in a list of tokens. `start` and `end` (exclusive) cover the number and any scale words and currency
 * words around it, so a caller can remove them from the sentence.
 */
export function findAmount(rawTokens: string[]): AmountMatch | null {
  // Expand glued suffixes while remembering where each expanded token came from.
  const tokens: string[] = [];
  const origin: number[] = [];
  rawTokens.forEach((t, i) => splitGlued(t).forEach((p) => { tokens.push(p); origin.push(i); }));

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const startsNumber = isDigits(t) || isWord(t) || (t === 'half' && (SCALE[tokens[i + 1] ?? ''] !== undefined || (['a', 'an'].includes(tokens[i + 1] ?? '') && SCALE[tokens[i + 2] ?? ''] !== undefined))) || ((t === 'a' || t === 'an') && ['hundred', 'thousand', 'lakh', 'lac', 'crore'].includes(tokens[i + 1] ?? ''));
    if (!startsNumber) continue;

    let total = 0;
    let current = 0;
    let j = i;
    let sawNumber = false;
    for (; j < tokens.length; j++) {
      const w = tokens[j];
      if (isDigits(w)) {
        if (sawNumber && !(j > i && tokens[j - 1] === 'point')) break;
        current = Number(w);
        sawNumber = true;
      } else if (w in ONES) {
        if (tokens[j - 1] === 'point') { current = Number(`${current}.${ONES[w]}`); }
        else current += ONES[w];
        sawNumber = true;
      } else if (w in TENS) { current += TENS[w]; sawNumber = true; }
      else if (w === 'half' && j === i) { current = 0.5; sawNumber = true; }
      else if ((w === 'a' || w === 'an') && (j === i || tokens[j - 1] === 'half')) { /* "a hundred", "half a lakh": the scale word comes next */ }
      else if (w === 'point' && sawNumber) { /* decimal: the next word is the digit */ }
      else if (w === 'and' && sawNumber && (isWord(tokens[j + 1] ?? '') || isDigits(tokens[j + 1] ?? ''))) { /* "two hundred and fifty" */ }
      else if (w in SCALE && (sawNumber || j === i + 1)) {
        const mult = SCALE[w];
        if (w === 'hundred') current = (current || 1) * 100;
        else { total += (current || 1) * mult; current = 0; }
        sawNumber = true;
      } else break;
    }
    if (!sawNumber) continue;
    let value = total + current;
    // "twelve hundred" style already handled; a lone "a"/"half" without a scale is not a number
    if (value === 0 && !isDigits(t)) continue;
    value = Math.round(value * 100) / 100;
    // Include currency words directly before or after.
    let s = origin[i];
    let e = origin[j - 1] + 1;
    while (s > 0 && CURRENCY.has(rawTokens[s - 1])) s--;
    while (e < rawTokens.length && CURRENCY.has(rawTokens[e])) e++;
    return { value, start: s, end: e };
  }
  return null;
}

/** Parses a whole phrase that should be one amount ("1.5 lakh", "rs 450"). Null when it is not just an amount. */
export function parseAmountPhrase(text: string): number | null {
  const tokens = text.toLowerCase().replace(/(\d),(?=\d)/g, '$1').replace(/₹/g, ' rs ').replace(/[^a-z0-9. ]/g, ' ').replace(/\.(?!\d)/g, ' ').split(/\s+/).filter(Boolean);
  const m = findAmount(tokens);
  if (!m) return null;
  const rest = tokens.filter((_, i) => i < m.start || i >= m.end).filter((t) => !['only', 'please', 'is', 'it', 'was', 'the', 'amount', 'of', 'about', 'around'].includes(t));
  return rest.length ? null : m.value;
}

/**
 * Where the person is and what money they use. One country and one currency per profile: amounts are shown in that currency and are never converted.
 * The country also picks how numbers are grouped, how an ambiguous date like 03/04/2026 is read, and whether the India-specific tools (tax estimate, RBI loan rules,
 * Indian savings schemes) are offered. Everything else works the same everywhere.
 */

export interface Country {
  code: string;
  name: string;
  currency: string;
  /** How a numeric date such as 03/04/2026 is read when a statement does not settle it. */
  dates?: 'mdy';
}

// A short table of well-known country-to-currency pairs. Anything not here can still be used: pick the nearest country and set the currency yourself.
export const COUNTRIES: Country[] = [
  { code: 'AR', name: 'Argentina', currency: 'ARS' }, { code: 'AU', name: 'Australia', currency: 'AUD' }, { code: 'AT', name: 'Austria', currency: 'EUR' },
  { code: 'BD', name: 'Bangladesh', currency: 'BDT' }, { code: 'BE', name: 'Belgium', currency: 'EUR' }, { code: 'BR', name: 'Brazil', currency: 'BRL' },
  { code: 'CA', name: 'Canada', currency: 'CAD' }, { code: 'CL', name: 'Chile', currency: 'CLP' }, { code: 'CN', name: 'China', currency: 'CNY' },
  { code: 'CO', name: 'Colombia', currency: 'COP' }, { code: 'CZ', name: 'Czechia', currency: 'CZK' }, { code: 'DK', name: 'Denmark', currency: 'DKK' },
  { code: 'EG', name: 'Egypt', currency: 'EGP' }, { code: 'FI', name: 'Finland', currency: 'EUR' }, { code: 'FR', name: 'France', currency: 'EUR' },
  { code: 'DE', name: 'Germany', currency: 'EUR' }, { code: 'GH', name: 'Ghana', currency: 'GHS' }, { code: 'GR', name: 'Greece', currency: 'EUR' },
  { code: 'HK', name: 'Hong Kong', currency: 'HKD' }, { code: 'HU', name: 'Hungary', currency: 'HUF' }, { code: 'IN', name: 'India', currency: 'INR' },
  { code: 'ID', name: 'Indonesia', currency: 'IDR' }, { code: 'IE', name: 'Ireland', currency: 'EUR' }, { code: 'IL', name: 'Israel', currency: 'ILS' },
  { code: 'IT', name: 'Italy', currency: 'EUR' }, { code: 'JP', name: 'Japan', currency: 'JPY' }, { code: 'KE', name: 'Kenya', currency: 'KES' },
  { code: 'KW', name: 'Kuwait', currency: 'KWD' }, { code: 'LK', name: 'Sri Lanka', currency: 'LKR' }, { code: 'MY', name: 'Malaysia', currency: 'MYR' },
  { code: 'MX', name: 'Mexico', currency: 'MXN' }, { code: 'MA', name: 'Morocco', currency: 'MAD' }, { code: 'NP', name: 'Nepal', currency: 'NPR' },
  { code: 'NL', name: 'Netherlands', currency: 'EUR' }, { code: 'NZ', name: 'New Zealand', currency: 'NZD' }, { code: 'NG', name: 'Nigeria', currency: 'NGN' },
  { code: 'NO', name: 'Norway', currency: 'NOK' }, { code: 'PK', name: 'Pakistan', currency: 'PKR' }, { code: 'PE', name: 'Peru', currency: 'PEN' },
  { code: 'PH', name: 'Philippines', currency: 'PHP', dates: 'mdy' }, { code: 'PL', name: 'Poland', currency: 'PLN' }, { code: 'PT', name: 'Portugal', currency: 'EUR' },
  { code: 'QA', name: 'Qatar', currency: 'QAR' }, { code: 'RO', name: 'Romania', currency: 'RON' }, { code: 'SA', name: 'Saudi Arabia', currency: 'SAR' },
  { code: 'SG', name: 'Singapore', currency: 'SGD' }, { code: 'ZA', name: 'South Africa', currency: 'ZAR' }, { code: 'KR', name: 'South Korea', currency: 'KRW' },
  { code: 'ES', name: 'Spain', currency: 'EUR' }, { code: 'SE', name: 'Sweden', currency: 'SEK' }, { code: 'CH', name: 'Switzerland', currency: 'CHF' },
  { code: 'TW', name: 'Taiwan', currency: 'TWD' }, { code: 'TH', name: 'Thailand', currency: 'THB' }, { code: 'TR', name: 'Türkiye', currency: 'TRY' },
  { code: 'UA', name: 'Ukraine', currency: 'UAH' }, { code: 'AE', name: 'United Arab Emirates', currency: 'AED' }, { code: 'GB', name: 'United Kingdom', currency: 'GBP' },
  { code: 'US', name: 'United States', currency: 'USD', dates: 'mdy' }, { code: 'VN', name: 'Vietnam', currency: 'VND' },
];

export const countryOf = (code: string | undefined): Country | undefined => COUNTRIES.find((c) => c.code === code);

/** Countries where the loan payment is usually called an EMI. Elsewhere the app says "loan payment". */
const EMI_COUNTRIES = new Set(['IN', 'PK', 'BD', 'LK', 'NP']);
export const usesEmi = (country: string): boolean => EMI_COUNTRIES.has(country);
export const isIndia = (country: string | undefined): boolean => (country ?? 'IN') === 'IN';
/** Numeric dates in a statement the file does not settle: month first in the US and the Philippines, day first elsewhere. */
export const dateOrderFor = (country: string | undefined): 'dmy' | 'mdy' => (countryOf(country)?.dates === 'mdy' ? 'mdy' : 'dmy');

/** A guess from the browser's language settings, used only to pre-fill the first-run choice. */
export function detectCountry(): { country: string; currency: string } {
  const tags = typeof navigator !== 'undefined' ? [...(navigator.languages ?? []), navigator.language].filter(Boolean) : [];
  for (const tag of tags) {
    try {
      const loc = new Intl.Locale(tag);
      const region = loc.region ?? loc.maximize().region;
      const c = countryOf(region);
      if (c) return { country: c.code, currency: c.currency };
    } catch { /* not a locale */ }
  }
  return { country: 'US', currency: 'USD' };
}

/** Every currency a person can pick: the ones the browser knows, or the table's, with names. */
export function currencyChoices(): Array<{ code: string; name: string }> {
  let codes: string[] = [...new Set(COUNTRIES.map((c) => c.currency))];
  try {
    const all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('currency');
    if (all?.length) codes = all;
  } catch { /* older browser */ }
  let names: Intl.DisplayNames | null = null;
  try { names = new Intl.DisplayNames(['en'], { type: 'currency' }); } catch { /* older browser */ }
  return codes.map((code) => ({ code, name: names?.of(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name));
}

/* ---------- money ---------- */

interface MoneyContext { country: string; currency: string; locale: string }
let ctx: MoneyContext = { country: 'IN', currency: 'INR', locale: 'en-IN' };

/** The locale numbers are written in: the browser's language with the person's country, so a German speaker in Germany sees 1.234,56 and someone in India sees lakhs. */
export function localeFor(country: string): string {
  const lang = (typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en').split('-')[0] || 'en';
  const want = `${lang}-${country}`;
  try { if (Intl.NumberFormat.supportedLocalesOf([want]).length) return want; } catch { /* fall through */ }
  return `en-${country}`;
}

/** Sets the country and currency every amount is shown in. Called by the store whenever the profile changes. */
export function setMoneyContext(country: string, currency: string): void {
  if (ctx.country === country && ctx.currency === currency) return;
  ctx = { country, currency, locale: localeFor(country) };
  cache.clear();
}
export const moneyContext = (): Readonly<MoneyContext> => ctx;

const cache = new Map<string, Intl.NumberFormat>();
function fmt(opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(opts) + ctx.locale + ctx.currency;
  let f = cache.get(key);
  if (!f) {
    try { f = new Intl.NumberFormat(ctx.locale, { style: 'currency', currency: ctx.currency, ...opts }); }
    catch { f = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', ...opts }); } // an unknown currency code
    cache.set(key, f);
  }
  return f;
}

/** The currency's own number of decimals (2 for dollars, 0 for yen). */
export const minorUnits = (): number => fmt({}).resolvedOptions().maximumFractionDigits ?? 2;

/** The symbol or code in front of an amount: $, €, ₹, CHF. */
export function currencySymbol(): string {
  return fmt({ maximumFractionDigits: 0 }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? ctx.currency;
}

/** Formats with explicit decimals. Kept here so format.ts stays about wording and this file about the locale. */
export function formatMoney(n: number, digits: number, notation: 'standard' | 'compact' = 'standard'): string {
  return fmt({ minimumFractionDigits: notation === 'compact' ? 0 : digits, maximumFractionDigits: digits, notation }).format(n);
}

/* ---------- wording ---------- */

/** "EMI" where people call it that (India and its neighbours), "loan payment" everywhere else. `capital` gives "EMI" or "Loan payment". */
export const emiWord = (capital = false): string => {
  const w = usesEmi(ctx.country) ? 'EMI' : 'loan payment';
  return capital ? w[0].toUpperCase() + w.slice(1) : w;
};
export const emiWords = (capital = false): string => (usesEmi(ctx.country) ? 'EMIs' : capital ? 'Loan payments' : 'loan payments');

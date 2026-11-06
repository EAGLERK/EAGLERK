// The app outside India: currency, number formats, statements from other countries, and the India-only tools staying out of the way.
// Usage: APP_URL=http://localhost:5173/ npm run e2e:global   (server started with the Supabase values blanked)
const { chromium } = require('playwright');
const { demoState } = require('./fixtures/demo.cjs');
const URL = process.env.APP_URL || 'http://localhost:5173/';

let failed = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) failed++; };
const shown = (loc, t = 6000) => loc.waitFor({ timeout: t }).then(() => true, () => false);
const wait = async (fn, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };
const data = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('mymoney:v1') || '{}'));
const body = (p) => p.locator('body').innerText();

async function open(browser, locale, opts = {}) {
  const ctx = await browser.newContext({ locale, viewport: { width: 1280, height: 860 }, ...opts });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.errors = errors;
  await p.goto(URL);
  return { ctx, p };
}
async function startAs(p, name = 'Sam') {
  await p.getByLabel('What should we call you?').fill(name);
  await p.getByRole('button', { name: 'Get started' }).click();
  await p.getByRole('button', { name: 'Skip tour' }).click({ timeout: 6000 }).catch(() => {});
}
const nav = (p, name) => p.getByRole('navigation').getByRole('button', { name, exact: true }).first().click();
const mitra = async (p, text) => {
  const panel = p.getByRole('dialog', { name: /Mitra/ });
  if (!(await panel.count())) await p.getByRole('button', { name: /Ask Mitra/ }).click();
  await p.getByRole('textbox', { name: 'Type a command' }).fill(text);
  await p.getByRole('button', { name: 'Send' }).click();
  return panel;
};

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    // ---------- United States ----------
    let { ctx, p } = await open(browser, 'en-US');
    check(await shown(p.getByLabel('Where are you?')) && (await p.getByLabel('Where are you?').inputValue()) === 'US', 'a browser set to English (US) is offered United States first');
    check(await shown(p.getByText(/Amounts will be in US Dollar \(USD\)/)), 'and says which currency that means');
    await startAs(p);
    const prof = (await data(p)).profile;
    check(prof.country === 'US' && prof.currency === 'USD' && prof.monthlyIncome === 0 && prof.annualGrossIncome === 0, 'the profile stores the country and currency, and starts with no rupee-sized income numbers');
    check(await shown(p.getByRole('heading', { name: 'Nothing here yet' })), 'the empty Dashboard works');

    await mitra(p, 'spent 4.50 on coffee');
    check(await shown(p.locator('.voice-line.bot', { hasText: /Added expense of \$4\.50/ })), 'Mitra reads a $4.50 coffee back with its cents');
    await mitra(p, 'save');
    check(await wait(async () => ((await data(p)).txns || []).some((t) => t.amount === 4.5)), 'and saves it as 4.5');
    await mitra(p, 'spent 12 dollars on lunch');
    check(await shown(p.locator('.voice-line.bot', { hasText: /\$12, Lunch/ })), 'saying "12 dollars" works');
    await mitra(p, 'save');
    await p.keyboard.press('Escape');

    await nav(p, 'Transactions');
    check(await shown(p.getByText(/Why not connect my bank account directly\?/)), 'the bank-connection note is there');
    await p.getByText('Why not connect my bank account directly?').click();
    const note = await body(p);
    check(!/\bRBI\b/.test(note.replace(/Account Aggregator framework in India/, '')) && /UK and Europe/.test(note), 'it talks about more than one country, not just India');

    await nav(p, 'Settings');
    await shown(p.getByRole('heading', { name: 'Country and currency' }));
    let text = await body(p);
    check(/Country and currency/.test(text) && (await p.getByLabel('Country').inputValue()) === 'US' && (await p.getByLabel('Currency').inputValue()) === 'USD', 'Settings shows the country and currency');
    check(!/Salaried \(Rs/.test(text) && /no tax estimate for your country/.test(text), 'the India tax estimate and its salaried box are not shown');
    check(!/Varies a lot by city and locality/.test(text), 'and India\'s sourced assumption notes are not shown');
    check(/These are placeholders, not rates for your country/.test(text) && !/RBI|small-savings|PPF|SBI/.test(text), 'the rates are labelled placeholders, with no India sources');
    check(/Interest on savings/.test(text) && !/Bank FD|Small finance|Liquid fund/.test(text), 'only the assumptions that goals use are listed');
    check(!(await p.getByRole('navigation').getByRole('button', { name: 'Investments' }).count()), 'there is no Investments tab');

    await nav(p, 'Goals');
    await p.getByRole('button', { name: 'Add goal' }).click();
    await p.getByRole('button', { name: /^Car/ }).click();
    await shown(p.getByText(/Car goal added/).first());
    text = await body(p);
    check(/Add your monthly take-home in Settings/.test(text), 'goals ask for the income that US profiles start without');
    check(/placeholders, not figures for your country/.test(text), 'and say the loan rates are placeholders');
    check(!/\bEMIs?\b/.test(text) && /Loan payment/.test(text), 'the page says "loan payment", never "EMI"');
    check(!/\bRs\b|₹|RBI|lakh|crore/i.test(text), 'and nothing in rupees or about India');

    await nav(p, 'Settings');
    await p.getByLabel('Currency').selectOption('EUR');
    await nav(p, 'Transactions');
    check(await shown(p.locator('body', { hasText: '€' })) && (await data(p)).profile.currency === 'EUR', 'changing the currency to euros changes how amounts are written');
    check((await data(p)).txns.every((t) => [4.5, 12].includes(t.amount)) && (await data(p)).txns.length === 2, 'and the amounts already saved are not converted');
    check(p.errors.length === 0, 'no page errors' + (p.errors.length ? ': ' + p.errors[0] : ''));
    await ctx.close();

    // ---------- Germany: a statement with semicolons, dd.mm.yyyy and decimal commas ----------
    ({ ctx, p } = await open(browser, 'de-DE'));
    check((await p.getByLabel('Where are you?').inputValue()) === 'DE' && await shown(p.getByText(/Euro \(EUR\)/)), 'a German browser is offered Germany and euros');
    await startAs(p, 'Jana');
    await nav(p, 'Transactions');
    const now = new Date();
    const dd = (d) => `${String(d).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
    const day1 = 1, day2 = Math.max(1, Math.min(now.getDate(), 2));
    const csv = `Buchungstag;Beschreibung;Betrag\n${dd(day2)};REWE Markt Berlin;-45,30\n${dd(day1)};Gehalt ACME GmbH;2.500,00\n`;
    await p.getByLabel('Choose a statement file').setInputFiles({ name: 'konto.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    check(await shown(p.getByText(/Read 2 transactions/).first()), 'a German statement is read: two transactions');
    await p.getByRole('button', { name: 'Save changes' }).click();
    await wait(async () => ((await data(p)).txns || []).length === 2);
    const tx = (await data(p)).txns;
    const rewe = tx.find((t) => /REWE/.test(t.description)), pay = tx.find((t) => /Gehalt/.test(t.description));
    check(rewe && rewe.amount === 45.3 && rewe.type === 'expense' && pay && pay.amount === 2500 && pay.type === 'income', '-45,30 is a 45.30 expense and 2.500,00 is a 2,500 income');
    check(rewe.date.slice(0, 7) === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` && rewe.category === 'Groceries', 'the dates are read day-first and "REWE Markt" is groceries');
    await nav(p, 'Dashboard');
    await shown(p.getByText(/Left over/).first());
    const dash = await body(p);
    check(/\d\.\d{3}\s?€/.test(dash) || /2\.455\s?€|2\.454\s?€/.test(dash), 'the Dashboard writes euros the German way (2.455 €)');
    await ctx.close();

    // ---------- United Kingdom ----------
    ({ ctx, p } = await open(browser, 'en-GB'));
    check((await p.getByLabel('Where are you?').inputValue()) === 'GB', 'a British browser is offered the United Kingdom');
    await startAs(p, 'Alex');
    await nav(p, 'Notes');
    await p.getByRole('button', { name: 'New note' }).click();
    await p.getByRole('button', { name: /^Things to sell/ }).click();
    check(await shown(p.locator('input[value*="Asking price (£)"]').first()), 'a "things to sell" table has a pound column');
    await ctx.close();

    // ---------- India stays as it was ----------
    ({ ctx, p } = await open(browser, 'en-IN'));
    check((await p.getByLabel('Where are you?').inputValue()) === 'IN', 'an Indian browser is offered India');
    await startAs(p, 'Asha');
    check((await data(p)).profile.currency === 'INR' && (await data(p)).profile.monthlyIncome === 100000, 'India gets the same starting profile as before');
    await nav(p, 'Settings');
    text = await body(p);
    check(/Tax on this income \(new regime/.test(text) && /Salaried \(Rs 75,000/.test(text), 'the tax estimate is offered in India');
    check(/Varies a lot by city and locality/.test(text) && !/Placeholder, not from your country/.test(text), 'India keeps its own sourced assumptions');
    await nav(p, 'Goals');
    await p.getByRole('button', { name: 'Add goal' }).click();
    await p.getByRole('button', { name: /^House/ }).click();
    await shown(p.getByText(/House goal added/).first());
    text = await body(p);
    check(/Lender minimum down payment/.test(text) && /\bEMI\b/.test(text) && /₹/.test(text), 'India keeps the lender-minimum rule, the word EMI and rupees');
    await ctx.close();

    // ---------- data saved before the app was global ----------
    {
      const c = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 860 } });
      const q = await c.newPage();
      await q.goto(URL);
      const st = demoState('Asha');
      st.tourDone = true;
      await q.evaluate((s) => localStorage.setItem('mymoney:v1', s), JSON.stringify(st));
      await q.reload();
      await shown(q.getByText(/Left over/).first());
      check(/₹/.test(await body(q)) && !/\$\d/.test(await body(q)), 'saved data with no country stays in rupees, even in a US browser');
      await nav(q, 'Settings');
      check((await q.getByLabel('Country').inputValue()) === 'IN' && (await q.getByLabel('Currency').inputValue()) === 'INR', 'and Settings shows India and rupees');
      await c.close();
    }

    // ---------- a phone ----------
    ({ ctx, p } = await open(browser, 'en-US', { viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true }));
    const dlg = await p.locator('dialog.welcome').boundingBox();
    check(dlg && dlg.x >= 0 && dlg.x + dlg.width <= 390 && dlg.y >= 0 && dlg.y + dlg.height <= 780, 'on a phone the welcome popup, with its country field, still fits the screen');
    const sizes = await p.locator('dialog.welcome input, dialog.welcome select').evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
    check(sizes.every((s) => s >= 16), 'and its fields are 16px');
    await ctx.close();
  } catch (e) {
    console.log('FAIL crashed: ' + (e && e.message));
    failed++;
  }
  await browser.close();
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();

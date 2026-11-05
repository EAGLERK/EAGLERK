// Editing transactions, drafts, the Save bar and the "unsaved changes" guard, checked in a real browser.
// Usage: APP_URL=http://localhost:5173/ npm run e2e:edit   (server started with the Supabase values blanked)
const { chromium } = require('playwright');
const URL = process.env.APP_URL || 'http://localhost:5173/';

let failed = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) failed++; };
const shown = (loc, t = 6000) => loc.waitFor({ timeout: t }).then(() => true, () => false);

const CSV = `Date,Narration,Withdrawal Amt.,Deposit Amt.,Closing Balance
01/10/26,UPI-SWIGGY ORDER,450.00,,50000.00
02/10/26,NEFT-ACME SALARY,,125000.00,175000.00
03/10/26,UPI-BigBasket,1290.50,,173709.50
`;

async function start(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, ...opts });
  await ctx.addInitScript(() => {
    window.__picker = 0;
    const orig = HTMLInputElement.prototype.showPicker;
    HTMLInputElement.prototype.showPicker = function () { window.__picker++; try { return orig && orig.call(this); } catch { /* headless has no picker */ } };
  });
  const p = await ctx.newPage();
  await p.goto(URL);
  await p.getByLabel('What should we call you?').fill('Asha');
  await p.getByRole('button', { name: 'Get started' }).click();
  await p.getByRole('button', { name: 'Skip tour' }).click({ timeout: 6000 }).catch(() => {});
  await p.getByRole('navigation').getByRole('button', { name: opts.isMobile ? 'Activity' : 'Transactions', exact: true }).click();
  return { ctx, p };
}
async function importCsv(p, name = 'oct.csv', text = CSV) {
  const chooser = p.waitForEvent('filechooser', { timeout: 8000 });
  await p.getByRole('button', { name: 'Import', exact: true }).click();
  await (await chooser).setFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });
}
const saved = (p) => p.evaluate(() => { const s = JSON.parse(localStorage.getItem('mymoney:v1') || '{"txns":[]}'); return s.txns.map((t) => ({ d: t.date, desc: t.description, a: t.amount, type: t.type, cat: t.category })); });
const nav = (p, name) => p.getByRole('navigation').getByRole('button', { name, exact: true }).click();

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    // ---------- imported rows are drafts ----------
    let { ctx, p } = await start(browser);
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await importCsv(p);
    await p.getByText('3 unsaved changes', { exact: true }).waitFor({ timeout: 6000 });
    check(await p.getByRole('button', { name: 'Save changes' }).isEnabled() && await p.getByRole('button', { name: 'Discard' }).isVisible(), 'after an import a Save bar offers Save changes and Discard');
    check((await p.locator('tr.unsaved').count()) === 3 && (await p.locator('.btn.primary', { hasText: 'Add transaction' }).count()) === 0, 'the three new rows are highlighted, and Save changes is the only green button');
    check((await saved(p)).length === 0, 'nothing is stored until Save is pressed');
    await nav(p, 'Dashboard').catch(() => {});

    // ---------- leaving the screen asks ----------
    const leave = p.getByRole('dialog', { name: /Save your changes before leaving/ });
    check(await shown(leave), 'leaving with unsaved rows opens a popup');
    check((await leave.innerText()).includes('3 unsaved changes') && await leave.getByRole('button', { name: 'Keep editing' }).isVisible() && await leave.getByRole('button', { name: 'Leave without saving' }).isVisible() && await leave.getByRole('button', { name: 'Save and leave' }).isVisible(), 'it names the count and offers Keep editing, Leave without saving, Save and leave');
    await leave.getByRole('button', { name: 'Keep editing' }).click();
    check(!(await leave.isVisible()) && (await p.evaluate(() => location.hash)) === '#transactions' && (await p.locator('tr.unsaved').count()) === 3, 'Keep editing stays on Transactions with the rows intact');
    await p.evaluate(() => { location.hash = 'goals'; });
    check(await shown(leave), 'the browser Back button or a typed address is guarded too');
    check((await p.evaluate(() => location.hash)) === '#transactions', 'and the address goes back to Transactions while the popup is open');
    await p.keyboard.press('Escape');
    check(!(await leave.isVisible()), 'Escape means Keep editing');
    await nav(p, 'Settings');
    await leave.getByRole('button', { name: 'Leave without saving' }).click();
    check((await p.evaluate(() => location.hash)) === '#settings' && (await saved(p)).length === 0, 'Leave without saving goes on and throws the drafts away');
    await nav(p, 'Transactions');
    check((await p.locator('tr.unsaved').count()) === 0 && (await p.getByRole('region', { name: 'Unsaved changes' }).count()) === 0, 'coming back, the drafts are gone');

    await importCsv(p);
    await p.getByText('3 unsaved changes', { exact: true }).waitFor({ timeout: 6000 });
    await nav(p, 'Goals');
    await leave.getByRole('button', { name: 'Save and leave' }).click();
    await p.waitForTimeout(500);
    check((await p.evaluate(() => location.hash)) === '#goals' && (await saved(p)).length === 3, 'Save and leave stores the rows, then goes on');
    await nav(p, 'Transactions');

    // ---------- editing a saved row: drafts too ----------
    const date = p.getByLabel('Date for UPI-SWIGGY ORDER');
    await date.click();
    check((await p.evaluate(() => window.__picker)) >= 1, 'clicking the date box opens the calendar');
    await date.fill('2026-10-09');
    await p.getByLabel('Description for UPI-SWIGGY ORDER').fill('Swiggy dinner');
    await p.getByLabel('Amount for Swiggy dinner').fill('525.75');
    await p.getByText('3 unsaved changes', { exact: true }).waitFor({ timeout: 3000 }).catch(() => {});
    check(await p.getByText('1 unsaved change', { exact: true }).isVisible() && (await p.locator('tr.unsaved').count()) === 1, 'three edits to one saved row count as one unsaved change and highlight the row');
    check((await saved(p)).find((t) => t.desc === 'UPI-SWIGGY ORDER')?.a === 450, 'the saved data is untouched until Save');
    await p.getByRole('button', { name: 'Save changes' }).click();
    await p.getByText('Saved 1 changed transaction.').waitFor({ timeout: 5000 });
    const after = (await saved(p)).find((t) => t.desc === 'Swiggy dinner');
    check(!!after && after.d === '2026-10-09' && after.a === 525.75 && after.type === 'expense', 'Save stores the new date, description and amount');
    check((await p.locator('tr.unsaved').count()) === 0 && (await p.getByRole('region', { name: 'Unsaved changes' }).count()) === 0, 'the marks and the bar clear after saving');

    // type toggle, category, totals
    await p.getByRole('button', { name: /^Money out for Swiggy dinner/ }).click();
    check(await p.getByRole('button', { name: /^Money in for Swiggy dinner/ }).isVisible(), 'the +/- button switches money out to money in');
    await p.getByRole('button', { name: 'Discard' }).click();
    check((await p.getByRole('button', { name: /^Money out for Swiggy dinner/ }).count()) === 1 && (await p.getByRole('region', { name: 'Unsaved changes' }).count()) === 0, 'Discard puts the row back as it was');
    await p.locator('.toast-btn', { hasText: 'Undo' }).click();
    check(await shown(p.getByRole('region', { name: 'Unsaved changes' }), 3000), 'and Undo brings the discarded edit back');
    await p.getByRole('button', { name: 'Save changes' }).click();
    check((await saved(p)).find((t) => t.desc === 'Swiggy dinner')?.type === 'income', 'saving applies it');

    // putting a value back removes the change
    const amt = p.getByLabel('Amount for UPI-BigBasket');
    await amt.fill('999');
    check(await p.getByText('1 unsaved change', { exact: true }).isVisible(), 'an edit shows as a change');
    await amt.fill('1290.5');
    check((await p.getByRole('region', { name: 'Unsaved changes' }).count()) === 0, 'typing the original value back leaves nothing unsaved');

    // ---------- invalid values block saving ----------
    await amt.fill('0');
    check(await p.getByRole('button', { name: 'Save changes' }).isDisabled() && await shown(p.getByText('1 row needs a valid date and an amount above 0 before saving.', { exact: true })) && (await amt.getAttribute('aria-invalid')) === 'true', 'an amount of 0 is flagged and blocks Save, with the reason');
    await nav(p, 'Dashboard');
    check(await shown(leave) && await leave.getByRole('button', { name: 'Save and leave' }).isDisabled() && /needs a valid date/.test(await leave.innerText()), 'the leave popup also says Save and leave is blocked, and why');
    await leave.getByRole('button', { name: 'Keep editing' }).click();
    await amt.fill('1290.5');
    check((await p.getByRole('region', { name: 'Unsaved changes' }).count()) === 0, 'fixing it clears the warning');

    // ---------- typed-in transactions are drafts too ----------
    await p.getByRole('button', { name: 'Add transaction' }).click();
    await p.getByLabel('Description', { exact: true }).fill('Chai stall');
    await p.getByLabel(/^Amount \(/).fill('40');
    await p.getByRole('button', { name: 'Add to list' }).click();
    check(await shown(p.getByLabel('Description for Chai stall')) && (await p.locator('tr.unsaved').count()) === 1 && (await saved(p)).every((t) => t.desc !== 'Chai stall'), 'a typed-in transaction lands in the list as an unsaved row');
    await p.getByRole('button', { name: 'Save changes' }).click();
    await p.getByText('Saved 1 new transaction.').waitFor({ timeout: 5000 });
    check((await saved(p)).some((t) => t.desc === 'Chai stall' && t.a === 40), 'and is stored on Save');

    // ---------- closing the tab ----------
    await importCsv(p, 'more.csv', 'Date,Narration,Debit,Credit\n11/10/26,TAXI,200.00,\n');
    await p.getByText('1 unsaved change', { exact: true }).waitFor({ timeout: 5000 });
    // The browser's own warning is shown when the page cancels the unload event. Check exactly that, with and without unsaved rows.
    const wouldWarn = () => p.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
    check(await wouldWarn(), 'closing or reloading the tab with unsaved rows triggers the browser\'s own warning');
    await p.getByRole('button', { name: 'Discard' }).click();
    check(!(await wouldWarn()), 'and with nothing unsaved it does not');
    check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await ctx.close();

    // ---------- phone ----------
    ({ ctx, p } = await start(browser, { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true }));
    await importCsv(p);
    await p.getByText('3 unsaved changes', { exact: true }).waitFor({ timeout: 6000 });
    const geo = await p.evaluate(() => { const b = document.querySelector('.savebar').getBoundingClientRect(); const t = document.querySelector('.tabbar').getBoundingClientRect(); return { above: b.bottom <= t.top + 1, inside: b.left >= 0 && b.right <= innerWidth, noScroll: document.documentElement.scrollWidth <= innerWidth }; });
    check(geo.above && geo.inside && geo.noScroll, 'phone: the Save bar sits above the tab bar and fits the screen');
    const small = await p.evaluate(() => [...document.querySelectorAll('main .cell-input, main .sign, main .savebar .btn')].filter((e) => e.getBoundingClientRect().height > 0).map((e) => Math.round(e.getBoundingClientRect().height)).filter((h) => h < 44).length);
    check(small === 0, 'phone: every editable cell, sign button and Save button is at least 44px tall');
    const row = await p.evaluate(() => { const r = document.querySelector('tr.unsaved').getBoundingClientRect(); return r.right <= innerWidth && r.left >= 0; });
    check(row, 'phone: an editable row stays inside the screen');
    await p.getByRole('button', { name: 'Save changes' }).click();
    await p.getByText('Saved 3 new transactions.').waitFor({ timeout: 5000 });
    check((await saved(p)).length === 3, 'phone: saving works');
    await ctx.close();
  } finally {
    await browser.close();
  }
  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('test run crashed:', e.stack); process.exit(2); });

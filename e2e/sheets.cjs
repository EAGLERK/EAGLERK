// Google Sheets as a source of transactions, in a real browser. Google itself is replaced by a scripted answer (Playwright intercepts
// docs.google.com), so this checks MyMoney's behaviour: the dialog, what gets saved, automatic checks, safety rules and error messages.
// It does NOT prove that Google's real endpoints allow this browser request (CORS); that can only be checked against a real sheet.
// Usage: APP_URL=http://localhost:5173/ npm run e2e:sheets   (server started with the Supabase values blanked)
const { chromium } = require('playwright');
const URL = process.env.APP_URL || 'http://localhost:5173/';
const ID = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
const LINK = `https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing#gid=0`;

let failed = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) failed++; };
const shown = (loc, t = 6000) => loc.waitFor({ timeout: t }).then(() => true, () => false);
const wait = async (fn, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };

const row = (i, desc = `Shop ${i}`, amt = 100 + i) => `2026-10-${String(i % 28 + 1).padStart(2, '0')},${desc},${amt}`;
const sheet = (n, extra = []) => ['Date,Description,Amount', ...Array.from({ length: n }, (_, i) => row(i)), ...extra].join('\n') + '\n';

async function start(browser, opts = {}) {
  const ctx = await browser.newContext({ locale: 'en-IN', viewport: { width: 1280, height: 900 }, ...opts });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.errors = errors;
  await p.clock.install();

  const fake = { mode: 'ok', csv: sheet(12), requests: [] };
  await p.route('https://docs.google.com/**', async (route) => {
    fake.requests.push(route.request().url());
    if (fake.mode === 'blocked') return route.abort('failed');
    const cors = { 'access-control-allow-origin': '*' };
    if (fake.mode === 'private') return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/html' }, body: '<!DOCTYPE html><html><body>Sign in</body></html>' });
    if (fake.mode === 'http500') return route.fulfill({ status: 500, headers: cors, body: 'oops' });
    return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/csv; charset=utf-8' }, body: fake.csv });
  });

  await p.goto(URL);
  await p.getByLabel('What should we call you?').fill('Asha');
  await p.getByRole('button', { name: 'Get started' }).click();
  await p.getByRole('button', { name: 'Skip tour' }).click({ timeout: 6000 }).catch(() => {});
  await p.getByRole('navigation').getByRole('button', { name: /^(Transactions|Activity)$/ }).first().click();
  return { ctx, p, fake };
}
const data = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('mymoney:v1') || '{}'));
const rows = async (p, label) => ((await data(p)).txns || []).filter((t) => t.file === label);
const LABEL = 'Google Sheet · Expenses';
const dialog = (p) => p.getByRole('dialog', { name: 'Add from Google Sheets' });
const item = (p) => p.getByRole('list', { name: 'Connected Google Sheets' });
const toastText = (p) => p.locator('.toast').allInnerTexts().then((t) => t.join(' | '));
const minutes = (p, n) => p.clock.fastForward(n * 60_000);

(async () => {
  const browser = await chromium.launch();
  try {
    let { ctx, p, fake } = await start(browser);

    // ---------- the button and the dialog ----------
    check((await p.locator('main .btn.primary').count()) === 1, 'still one green button on Transactions');
    await p.getByRole('button', { name: 'Google Sheet', exact: true }).click();
    check(await shown(dialog(p)) && await shown(p.getByText('Anyone with the link')), 'the Google Sheet button opens a dialog that says how to share the sheet');
    check(await shown(p.getByText(/Anyone who has this link can read the sheet/)), 'and says plainly that a link-shared sheet is readable by anyone with the link');
    const checkBtn = dialog(p).getByRole('button', { name: 'Check the sheet' });
    check(await checkBtn.isDisabled(), 'Check the sheet waits for a link');

    await dialog(p).getByLabel('Link to the sheet').fill('hello');
    await checkBtn.click();
    check(await shown(dialog(p).getByRole('alert').filter({ hasText: 'does not look like a link' })), 'a link that is not a link is explained');
    await dialog(p).getByLabel('Link to the sheet').fill('https://example.com/spreadsheets/d/' + ID);
    await checkBtn.click();
    check(await shown(dialog(p).getByRole('alert').filter({ hasText: 'Only Google Sheets links' })) && fake.requests.length === 0, 'a link to any other site is refused before anything is fetched');

    fake.mode = 'private';
    await dialog(p).getByLabel('Link to the sheet').fill(LINK);
    await checkBtn.click();
    check(await shown(dialog(p).getByRole('alert').filter({ hasText: 'That sheet is private' })), 'a private sheet (a sign-in page comes back) says how to share it');
    fake.mode = 'blocked';
    await checkBtn.click();
    check(await shown(dialog(p).getByRole('alert').filter({ hasText: 'could not read that sheet' })) && fake.requests.some((u) => /gviz/.test(u)) && fake.requests.some((u) => /export\?format=csv/.test(u)), 'when the browser cannot reach Google it tries both addresses, then says what to check');

    fake.mode = 'ok';
    fake.requests.length = 0;
    await checkBtn.click();
    check(await shown(dialog(p).getByText('Found 12 transactions')), 'a good sheet shows how many transactions it holds');
    check(/gviz\/tq\?tqx=out:csv&gid=0/.test(fake.requests[0] || '') && fake.requests.every((u) => u.startsWith('https://docs.google.com/')), 'it asked Google\'s CSV view for the right tab, and nobody else');
    check((await dialog(p).locator('.sheet-sample li').count()) === 3, 'it previews three rows');
    check(await shown(dialog(p).getByText(/₹[\d,]+ in · ₹[\d,]+ out/)), 'and totals money in and out, so a wrong guess about signs is easy to spot');
    check((await data(p)).txns?.length === 0 || !(await data(p)).txns?.length, 'nothing is saved yet');
    await dialog(p).getByLabel('Name').fill('Expenses');
    check(await dialog(p).getByRole('checkbox', { name: /Check for changes automatically/ }).isChecked(), 'automatic checking is on by default');
    check((await dialog(p).locator('.btn.primary').count()) === 1, 'one primary button in the dialog');
    await dialog(p).getByRole('button', { name: 'Add 12 transactions' }).click();
    check(!(await dialog(p).count()) && await shown(item(p).getByText(LABEL)), 'adding closes the dialog and lists the sheet');
    check(await wait(async () => (await rows(p, LABEL)).length === 12), 'all 12 transactions are saved straight away, under the sheet\'s name');
    check((await data(p)).sheets?.length === 1 && (await data(p)).sheets[0].auto === true, 'the connection is stored with automatic updates on');
    check((await p.evaluate(() => document.body.dataset.savebar || '')) === '', 'there is no Save bar to press: the person already reviewed the rows in the dialog');
    check(/Added 12 transactions from Google Sheet · Expenses/.test(await toastText(p)), 'a toast confirms it');

    // ---------- Sync now ----------
    fake.csv = sheet(12).replace(/\n[^\n]*Shop 0,[^\n]*/, '') + row(40, 'New cafe', 999) + '\n';
    await item(p).getByRole('button', { name: /Sync .* now/ }).click();
    check(await wait(async () => /1 new, 1 removed/.test(await toastText(p))), 'Sync now brings in the new row and drops the removed one, and says so');
    let r = await rows(p, LABEL);
    check(r.length === 12 && r.some((t) => t.description === 'New cafe' && t.amount === 999) && !r.some((t) => t.description === 'Shop 0'), 'the stored rows match the sheet');
    await p.locator('.toast-btn', { hasText: 'Undo' }).last().click();
    check(await wait(async () => (await rows(p, LABEL)).some((t) => t.description === 'Shop 0')), 'Undo puts the old rows back');
    await minutes(p, 6);
    await p.waitForTimeout(500);
    check((await rows(p, LABEL)).some((t) => t.description === 'Shop 0') && !(await rows(p, LABEL)).some((t) => t.description === 'New cafe'), 'and the next automatic look does not just bring the change back');
    await item(p).getByRole('button', { name: /Sync .* now/ }).click();
    check(await wait(async () => (await rows(p, LABEL)).some((t) => t.description === 'New cafe')), 'Sync now applies it again when the person wants it');

    // ---------- automatic ----------
    fake.csv = fake.csv + row(41, 'Auto added', 321) + '\n';
    const asked = fake.requests.length;
    await minutes(p, 6);
    check(await wait(async () => (await rows(p, LABEL)).some((t) => t.description === 'Auto added')), 'a change in the sheet arrives by itself a few minutes later');
    check(fake.requests.length > asked && /1 new/.test(await toastText(p)), 'with a toast that says what came in');
    const quiet = fake.requests.length;
    await minutes(p, 6);
    await p.waitForTimeout(400);
    const stateBefore = JSON.stringify((await data(p)).txns);
    check(fake.requests.length > quiet && JSON.stringify((await data(p)).txns) === stateBefore, 'when nothing changed it looks, and changes nothing');

    // ---------- what happens when the tab comes back ----------
    fake.csv = fake.csv + row(42, 'After tab switch', 77) + '\n';
    await minutes(p, 2);
    await p.evaluate(() => window.dispatchEvent(new Event('focus')));
    check(await wait(async () => (await rows(p, LABEL)).some((t) => t.description === 'After tab switch')), 'it also looks when the person comes back to the tab');

    // ---------- safety ----------
    const count = (await rows(p, LABEL)).length;
    fake.csv = sheet(1);
    await minutes(p, 6);
    check(await shown(item(p).getByText(/far fewer rows/)) && (await rows(p, LABEL)).length === count, 'a sheet that suddenly lost most of its rows is NOT applied by itself: the old rows stay and the list says why');
    await item(p).getByRole('button', { name: /Sync .* now/ }).click();
    check(await wait(async () => (await rows(p, LABEL)).length === 1), 'Sync now applies it if the person says so');
    fake.csv = 'Hello,World\n1,2\n';
    await item(p).getByRole('button', { name: /Sync .* now/ }).click();
    check(await shown(item(p).getByText(/could not find any transactions/)) && (await rows(p, LABEL)).length === 1, 'a sheet with no transactions in it never wipes what is saved');
    fake.mode = 'private';
    await item(p).getByRole('button', { name: /Sync .* now/ }).click();
    check(await shown(item(p).getByText(/That sheet is private/)), 'a sheet that was made private says so in the list');
    fake.mode = 'blocked';
    await item(p).getByRole('button', { name: /Sync .* now/ }).click();
    check(await shown(item(p).getByText(/could not read that sheet/)), 'an offline moment says so');
    fake.mode = 'ok';
    fake.csv = sheet(12);
    await item(p).getByRole('button', { name: /Sync .* now/ }).click();
    check(await wait(async () => (await rows(p, LABEL)).length === 12) && !(await item(p).getByText(/could not read/).count()), 'the next good read clears the message and brings everything back');

    // ---------- automatic off ----------
    await item(p).getByRole('checkbox', { name: /Update .* automatically/ }).uncheck();
    check((await data(p)).sheets[0].auto === false && /Automatic updates are off/.test(await toastText(p)), 'switching automatic updates off is stored and explained');
    fake.csv = sheet(12, [row(50, 'Hidden', 5)]);
    const before = fake.requests.length;
    await minutes(p, 12);
    await p.waitForTimeout(400);
    check(fake.requests.length === before && !(await rows(p, LABEL)).some((t) => t.description === 'Hidden'), 'with automatic off it does not look at all');
    await item(p).getByRole('button', { name: /Sync .* now/ }).click();
    check(await wait(async () => (await rows(p, LABEL)).some((t) => t.description === 'Hidden')), 'but Sync now still works');
    await item(p).getByRole('checkbox', { name: /Update .* automatically/ }).check();

    // ---------- it survives a reload and checks on open ----------
    const reqs = fake.requests.length;
    fake.csv = sheet(12, [row(50, 'Hidden', 5), row(51, 'On open', 8)]);
    await p.reload();
    await p.getByRole('navigation').getByRole('button', { name: /^(Transactions|Activity)$/ }).first().click();
    check(await shown(item(p).getByText(LABEL)), 'after a reload the sheet is still connected');
    check(await wait(async () => (await rows(p, LABEL)).some((t) => t.description === 'On open')) && fake.requests.length > reqs, 'and it looks as soon as MyMoney opens');

    // ---------- the list on a phone and the data it keeps ----------
    const wide = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    check(!wide, 'no sideways scroll with the sheet listed');
    check(/docs\.google\.com/.test(JSON.stringify((await data(p)).sheets)) && !/anon|service_role|Bearer/.test(JSON.stringify((await data(p)).sheets)), 'what is stored about the sheet is its link and state only');

    // ---------- remove ----------
    const heldBefore = (await rows(p, LABEL)).length;
    await item(p).getByRole('button', { name: /Remove/ }).click();
    check(await wait(async () => !(await rows(p, LABEL)).length && !((await data(p)).sheets || []).length), 'Remove deletes the sheet\'s transactions and the connection');
    await p.locator('.toast-btn', { hasText: 'Undo' }).last().click();
    check(await wait(async () => (await rows(p, LABEL)).length === heldBefore && ((await data(p)).sheets || []).length === 1), 'and Undo brings both back');
    check(p.errors.length === 0, 'no page errors' + (p.errors.length ? ': ' + p.errors[0] : ''));
    await ctx.close();

    // ---------- two sheets, and a statement that already holds the same rows ----------
    ({ ctx, p, fake } = await start(browser));
    for (const nm of ['Expenses', 'Expenses']) {
      await p.getByRole('button', { name: 'Google Sheet', exact: true }).click();
      await dialog(p).getByLabel('Link to the sheet').fill(LINK);
      await dialog(p).getByRole('button', { name: 'Check the sheet' }).click();
      await shown(dialog(p).getByText('Found 12 transactions'));
      await dialog(p).getByLabel('Name').fill(nm);
      await dialog(p).getByRole('button', { name: /^Add / }).click();
      await shown(item(p).getByText(/Google Sheet · Expenses/).first());
    }
    const d = await data(p);
    check(d.sheets.length === 2 && d.sheets[0].label === LABEL && d.sheets[1].label === LABEL + ' (2)', 'two sheets with the same name get different labels');
    check(d.txns.length === 12 && /already here from another file/.test(await toastText(p)), 'rows that two sources share are kept once, and the person is told');
    await ctx.close();

    // ---------- a phone ----------
    ({ ctx, p, fake } = await start(browser, { viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true }));
    await p.getByRole('button', { name: 'Google Sheet', exact: true }).click();
    await dialog(p).getByLabel('Link to the sheet').fill(LINK);
    await dialog(p).getByRole('button', { name: 'Check the sheet' }).click();
    await shown(dialog(p).getByText('Found 12 transactions'));
    const box = await dialog(p).boundingBox();
    check(box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 780, 'on a phone the dialog fits the screen');
    const fs = await dialog(p).locator('input:not([type=checkbox])').evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
    check(fs.every((s) => s >= 16), 'and its fields are 16px so iPhones do not zoom');
    await dialog(p).getByRole('button', { name: /^Add / }).click();
    await shown(item(p).getByText(LABEL));
    check(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'the connected-sheet row does not scroll sideways on a phone');
    const btn = await item(p).getByRole('button', { name: /Sync .* now/ }).boundingBox();
    check(btn && btn.height >= 40, 'its buttons keep a tappable size');
    await ctx.close();
  } catch (e) {
    console.log('FAIL crashed: ' + (e && e.message));
    failed++;
  }
  await browser.close();
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();

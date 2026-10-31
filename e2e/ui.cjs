// UI/UX standards, checked in a real browser: tap-target size on phones, one primary button per screen,
// no clipped controls, in-page confirmation, Undo, required-field feedback, keyboard and focus.
// Needs Playwright with Chromium available. Usage: APP_URL=http://localhost:5173/ npm run e2e:ui
const { chromium } = require('playwright');
const URL = process.env.APP_URL || 'http://localhost:5173/';
// Investing is hidden unless the app was built with VITE_FEATURE_INVESTING=1; run with INVESTING=1 against such a build.
const investing = process.env.INVESTING === '1';

let failed = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) failed++; };
const shown = (loc) => loc.waitFor({ timeout: 6000 }).then(() => true, () => false);

/** Interactive controls inside <main> (and the tab bar) that are smaller than `min` px tall. A checkbox counts as its label row. */
const undersized = (page, min) => page.evaluate((m) => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const sel = 'button, a[href], select, input:not([type=hidden]):not([type=file]), summary, textarea';
  return [...document.querySelectorAll(`main ${sel.split(', ').join(', main ')}, .tabbar button`)].filter(vis).map((e) => {
    const box = e.type === 'checkbox' ? e.closest('label') || e : e;
    return { name: (e.getAttribute('aria-label') || e.innerText || e.type || e.tagName).trim().slice(0, 28), h: Math.round(box.getBoundingClientRect().height) };
  }).filter((x) => x.h < m);
}, min);

const primaries = (page) => page.evaluate(() => [...document.querySelectorAll('main .btn.primary')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.innerText.trim()));
const clipped = (page) => page.evaluate(() => [...document.querySelectorAll('main .pill-toggle')].filter((e) => e.getBoundingClientRect().width > 0 && e.scrollWidth > e.clientWidth + 1).map((e) => e.getAttribute('aria-label')));
const count = async (page) => Number(((await page.locator('main').innerText()).match(/(\d+) shown/) || [])[1] ?? -1);

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    // ---------- phone: size, CTAs, clipping ----------
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const ph = await phoneCtx.newPage();
    await ph.goto(URL);
    await ph.getByRole('button', { name: 'Explore with sample data' }).click();
    const phoneTabs = investing ? ['Home', 'Activity', 'Goals', 'Invest', 'Plan', 'Settings'] : ['Home', 'Activity', 'Goals', 'Settings'];
    for (const tab of phoneTabs) {
      await ph.getByRole('navigation').getByRole('button', { name: tab, exact: true }).click();
      if (tab === 'Goals') await ph.waitForSelector('.showcase canvas', { timeout: 15000 }).catch(() => {});
      await ph.waitForTimeout(400);
      const small = await undersized(ph, 44);
      check(small.length === 0, `phone / ${tab}: every control is at least 44px tall` + (small.length ? ` (too small: ${small.slice(0, 4).map((x) => `${x.name} ${x.h}px`).join(', ')})` : ''));
      check((await primaries(ph)).length <= 1, `phone / ${tab}: at most one primary button (${JSON.stringify(await primaries(ph))})`);
      check((await clipped(ph)).length === 0, `phone / ${tab}: no clipped toggles`);
    }
    const sw = await ph.locator('.theme-switch button').evaluateAll((b) => b.map((e) => Math.round(e.getBoundingClientRect().height)));
    check(sw.length === 3 && sw.every((h) => h >= 44), `phone: theme buttons are at least 44px tall ${JSON.stringify(sw)}`);
    check(await ph.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'phone: the header with the theme switcher does not overflow sideways');
    await phoneCtx.close();

    // ---------- desktop ----------
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    const errors = [];
    p.on('console', (m) => ['error', 'warning'].includes(m.type()) && !/GL Driver|ReadPixels/.test(m.text()) && errors.push(m.text().slice(0, 160)));
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(URL);
    await p.getByRole('button', { name: 'Explore with sample data' }).click();
    const nav = (n) => p.getByRole('navigation').getByRole('button', { name: n, exact: true }).click();

    const deskTabs = investing ? ['Dashboard', 'Transactions', 'Goals', 'Investments', 'Settings'] : ['Dashboard', 'Transactions', 'Goals', 'Settings'];
    for (const tab of deskTabs) {
      await nav(tab);
      await p.waitForTimeout(300);
      const prim = await primaries(p);
      check(prim.length === 1, `desktop / ${tab}: exactly one primary button ${JSON.stringify(prim)}`);
      check((await clipped(p)).length === 0, `desktop / ${tab}: no clipped toggles ${JSON.stringify(await clipped(p))}`);
    }
    const small = await undersized(p, 32);
    await nav('Settings');
    check((await undersized(p, 32)).length === 0, 'desktop: controls are at least 32px tall' + (small.length ? ` (${small.slice(0, 3).map((x) => `${x.name} ${x.h}px`).join(', ')})` : ''));

    // ---------- alignment ----------
    await nav('Dashboard');
    const tops = await p.evaluate(() => [...document.querySelectorAll('.sumcard .big')].map((e) => Math.round(e.getBoundingClientRect().top)));
    check(tops.length >= 2 && tops.every((y) => y === tops[0]), `dashboard: the headline figures sit on one line ${JSON.stringify(tops)}`);
    const head = await p.evaluate(() => { const t = document.querySelector('.page-head h1').getBoundingClientRect(), b = document.querySelector('.page-head .btn.primary').getBoundingClientRect(); return { titleMid: (t.top + t.bottom) / 2, btnMid: (b.top + b.bottom) / 2 }; });
    check(Math.abs(head.titleMid - head.btnMid) < 40, 'dashboard: the primary button sits in the header row beside the title');

    await nav('Dashboard');
    await p.getByRole('button', { name: 'Add transaction' }).click();
    check(await shown(p.getByRole('heading', { name: 'New transaction' })), 'dashboard "Add transaction" opens the Transactions form directly');
    const save = p.getByRole('button', { name: 'Save transaction' });
    check(await save.isDisabled() && await shown(p.getByText('Enter an amount to save.')), 'Save is disabled and says why');
    await p.getByLabel(/^Amount/).fill('250');
    check(await save.isEnabled(), 'Save enables once the required amount is entered');
    await p.getByRole('button', { name: 'Cancel' }).first().click();
    check(!(await p.getByRole('heading', { name: 'New transaction' }).isVisible()), 'Cancel closes the form');
    check((await p.evaluate(() => location.hash)) === '#transactions', 'closing the form leaves a plain #transactions address');

    // ---------- undo a single delete ----------
    const before = await count(p);
    await p.locator('button[aria-label^="Delete "]').first().click();
    check(await shown(p.locator('.toast', { hasText: 'Transaction deleted' })), 'deleting one transaction shows a toast, not a pop-up');
    check((await count(p)) === before - 1, 'the transaction is gone');
    await p.locator('.toast-btn', { hasText: 'Undo' }).click();
    check((await count(p)) === before, 'Undo brings it back');

    // ---------- confirm dialog for the bulk delete ----------
    await p.getByRole('button', { name: 'Delete all' }).click();
    const dlg = p.getByRole('dialog');
    check(await shown(dlg), 'Delete all opens an in-page dialog');
    check(await p.evaluate(() => document.activeElement && document.activeElement.textContent === 'Cancel'), 'the safe choice (Cancel) has focus first');
    await p.keyboard.press('Escape');
    check(!(await dlg.isVisible()) && (await count(p)) === before, 'Escape dismisses it and keeps the data');
    await p.getByRole('button', { name: 'Delete all' }).click();
    await p.getByRole('button', { name: 'Cancel' }).last().click();
    check((await count(p)) === before, 'Cancel keeps the data');
    await p.getByRole('button', { name: 'Delete all' }).click();
    await p.getByRole('button', { name: new RegExp(`^Delete ${before} transactions$`) }).click();
    check((await count(p)) === 0, 'confirming deletes everything');

    // ---------- Goals: one CTA, a clear chooser, undo ----------
    await nav('Goals');
    const goalCards = () => p.locator('main section.card h2', { hasText: /\(\d.*away\)|away/ }).count();
    const goalsBefore = (await p.locator('text=/Price today/').count());
    await p.getByRole('button', { name: 'Add goal' }).click();
    const options = await p.getByRole('group', { name: 'Choose what you are saving for' }).getByRole('button').allInnerTexts();
    check(options.length === 4, `the chooser offers four labelled options (${options.map((o) => o.split('\n')[0]).join(', ')})`);
    await p.getByRole('button', { name: /^Bike/ }).click();
    check(await shown(p.locator('.toast', { hasText: 'Bike goal added' })), 'picking a type adds the goal and confirms it');
    check((await p.locator('text=/Price today/').count()) === goalsBefore + 1, 'the new goal card appears');
    await p.getByRole('button', { name: 'Remove' }).last().click();
    check(await shown(p.locator('.toast', { hasText: 'goal removed' })), 'removing a goal shows a toast');
    await p.locator('.toast-btn', { hasText: 'Undo' }).last().click();
    check((await p.locator('text=/Price today/').count()) === goalsBefore + 1, 'Undo restores the removed goal');
    void goalCards;

    // ---------- Goals: loans live here ----------
    check(await shown(p.getByRole('heading', { name: 'Loans you are paying' })), 'Goals shows the loans card' + (investing ? '' : ' (loans moved here with investing hidden)'));
    if (!investing) {
      const loanRows = () => p.locator('table.cards').filter({ hasText: 'Outstanding' }).locator('tbody tr').count();
      const loansBefore = await loanRows();
      await p.getByRole('button', { name: 'Add loan' }).click();
      const saveLoan = p.getByRole('button', { name: 'Save loan' });
      check(await shown(saveLoan) && await saveLoan.isDisabled(), 'Save loan is disabled until the loan has a name');
      const loan = p.getByRole('group', { name: 'Loan details' });
      await loan.getByLabel(/^Name/).fill('Test loan');
      await loan.getByLabel(/^Outstanding/).fill('50000');
      await loan.getByLabel(/^Monthly EMI/).fill('2500');
      await saveLoan.click();
      check((await loanRows()) === loansBefore + 1, 'the loan is added');
      await p.locator('button[aria-label="Delete Test loan"]').click();
      check(await shown(p.locator('.toast', { hasText: 'Test loan deleted' })) && (await loanRows()) === loansBefore, 'deleting a loan shows a toast and removes it');
      await p.locator('.toast-btn', { hasText: 'Undo' }).last().click();
      check((await loanRows()) === loansBefore + 1, 'Undo restores the loan');
    }

    // ---------- Settings: dangerous actions are separated and confirmed ----------
    await nav('Settings');
    check(await shown(p.getByRole('heading', { name: 'Danger zone' })), 'destructive actions live in a separate danger zone');
    await p.getByRole('button', { name: 'Erase all data' }).click();
    check(await shown(p.getByRole('dialog')), 'Erase all data asks for confirmation in the page');
    await p.getByRole('button', { name: 'Cancel' }).last().click();

    // ---------- theme switcher: three labelled icon buttons ----------
    const themeBtns = p.getByRole('group', { name: 'Colour theme' }).getByRole('button');
    check((await themeBtns.count()) === 3, 'the theme switcher has three buttons');
    check(await p.locator('.theme-switch button svg').count() === 3 && (await themeBtns.allInnerTexts()).every((t) => t.trim() === ''), 'each theme button is an icon with no visible text');
    check(JSON.stringify(await themeBtns.evaluateAll((b) => b.map((e) => e.getAttribute('aria-label')))) === JSON.stringify(['Match my device', 'Light', 'Dark']), 'each icon has a spoken name: Match my device, Light, Dark');
    await p.getByRole('button', { name: 'Dark', exact: true }).click();
    check((await p.evaluate(() => document.documentElement.dataset.theme)) === 'dark' && (await p.getByRole('button', { name: 'Dark', exact: true }).getAttribute('aria-pressed')) === 'true', 'Dark applies and shows as selected');
    await p.reload();
    check((await p.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'the choice survives a reload');
    await p.getByRole('button', { name: 'Light', exact: true }).click();
    check((await p.evaluate(() => document.documentElement.dataset.theme)) === 'light', 'Light applies');

    // ---------- investing hidden ----------
    if (!investing) {
      await nav('Dashboard');
      const text = await p.locator('main').innerText();
      check(!/Net worth|What you own/.test(text), 'dashboard: no net worth or holdings cards');
      check((await p.getByRole('navigation').getByRole('button', { name: /^(Investments|Plan)$/ }).count()) === 0, 'no Investments or Plan tab');
      for (const hash of ['#investments', '#plan']) {
        await p.evaluate((h) => { location.hash = h; }, hash);
        await p.waitForTimeout(300);
        check(/Left over/.test(await p.locator('main').innerText()), `${hash} falls back to the Dashboard`);
        check(!/Where should new money go|Your monthly plan/.test(await p.locator('main').innerText()), `${hash} does not show the hidden screen`);
      }
      await nav('Settings');
      check(!/Emergency fund|Insurance/.test(await p.locator('main').innerText()), 'settings: no emergency-fund or insurance questions');
    }

    // ---------- keyboard and focus ----------
    await p.reload();
    await p.waitForSelector('.skip', { state: 'attached' });
    await p.keyboard.press('Tab');
    check(await p.evaluate(() => document.activeElement && document.activeElement.textContent === 'Skip to main content'), 'the first Tab stop is "Skip to main content"');
    await p.keyboard.press('Enter');
    check(await p.evaluate(() => document.activeElement && document.activeElement.tagName === 'MAIN'), 'activating it moves focus to the page content');
    await p.getByRole('navigation').getByRole('button', { name: 'Goals', exact: true }).click();
    check(await p.evaluate(() => document.activeElement && document.activeElement.tagName === 'MAIN'), 'moving to another screen puts focus on its content');
    check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await ctx.close();
  } finally {
    await browser.close();
  }
  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('test run crashed:', e.message); process.exit(2); });

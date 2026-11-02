// The welcome popup, the first-time tour, the notification bell and browser alerts, checked in a real browser.
// Usage: APP_URL=http://localhost:5173/ npm run e2e:welcome   (server started with the Supabase values blanked)
const { chromium } = require('playwright');
const URL = process.env.APP_URL || 'http://localhost:5173/';

let failed = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) failed++; };
const shown = (loc, t = 6000) => loc.waitFor({ timeout: t }).then(() => true, () => false);

// Records every notification the page tries to show, so a test can look at them. Also lets a test pretend the tab is in the background.
const spy = () => {
  window.__notes = [];
  const Real = window.Notification;
  function Fake(title, opts) { window.__notes.push({ title, body: opts && opts.body }); this.close = () => {}; }
  // Headless Chrome always reports "denied", so the page is given a pretend permission that a test can allow or refuse.
  let perm = 'default';
  Object.defineProperty(Fake, 'permission', { get: () => perm });
  Fake.requestPermission = () => { perm = window.__grant === false ? 'denied' : 'granted'; return Promise.resolve(perm); };
  void Real;
  window.Notification = Fake;
  window.__hidden = false;
  Object.defineProperty(document, 'hidden', { get: () => window.__hidden, configurable: true });
};

const prevMonthCsv = () => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  const ym = d.toISOString().slice(0, 7);
  const [y, m] = ym.split('-');
  return { label: d.toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    csv: `Date,Narration,Withdrawal Amt.,Deposit Amt.,Closing Balance\n02/${m}/${y},SALARY,,10000.00,10000.00\n05/${m}/${y},RENT,30000.00,,-20000.00\n` };
};

async function importCsv(page, name, text) {
  const chooser = page.waitForEvent('filechooser', { timeout: 8000 });
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await (await chooser).setFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await ctx.addInitScript(spy);
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(URL);

    // ---------- the welcome popup ----------
    const dlg = p.getByRole('dialog', { name: /set up your profile/i });
    check(await shown(dlg), 'first visit: a "Let\'s set up your profile" popup opens');
    check(await p.evaluate(() => !!document.querySelector('dialog.welcome') && document.querySelector('dialog.welcome').matches(':modal')), 'the popup is a real modal dialog over the page');
    check((await p.locator('.sidebar').isVisible()) && /Overview|Hi,/.test(await p.locator('main h1').innerText()), 'the Dashboard is behind it, not replaced by it');
    check((await p.locator('dialog.welcome .brand-mark').count()) === 1 && (await p.locator('dialog.welcome .btn.primary').count()) === 1 && (await p.locator('dialog.welcome .btn.block').count()) === 1, 'it is laid out like the sign-in card: logo, field, one primary button, a secondary button below');
    check((await p.getByRole('button', { name: /^Notifications/ }).count()) === 0, 'no bell or alerts before setup is finished');
    await p.keyboard.press('Escape');
    check(await dlg.isVisible(), 'Escape does not dismiss it');
    check(await p.getByRole('button', { name: 'Start with my own data' }).isDisabled(), 'Start is disabled until a name is entered');
    await p.getByLabel('What should we call you?').fill('Asha');
    await p.getByRole('button', { name: 'Start with my own data' }).click();
    check(!(await dlg.isVisible()), 'starting closes the popup');

    // ---------- the tour ----------
    const titles = ['Your main action', 'Bring in a bank statement', 'Plan a car, house or bike', 'Alerts', 'Light or dark', 'Your data, your rules'];
    const tip = p.getByRole('dialog', { name: /Quick tour/ });
    check(await shown(tip.getByText(titles[0])), 'the tour starts by itself the first time');
    let okSteps = true;
    for (let i = 0; i < titles.length; i++) {
      const here = await shown(tip.getByText(titles[i], { exact: true }), 3000);
      const counter = await tip.getByText(`${i + 1} of ${titles.length}`).isVisible();
      const geo = await p.evaluate(() => { const r = document.querySelector('.tour-ring').getBoundingClientRect(); const t = document.querySelector('.tour-pop').getBoundingClientRect(); const vw = innerWidth, vh = innerHeight; return { ringOk: r.width > 20 && r.height > 20, popIn: t.left >= 0 && t.top >= 0 && t.right <= vw && t.bottom <= vh }; });
      if (!(here && counter && geo.ringOk && geo.popIn)) { okSteps = false; console.log('  step', i + 1, { here, counter, geo }); }
      if (i < titles.length - 1) await tip.getByRole('button', { name: 'Next', exact: true }).click();
    }
    check(okSteps, 'all six tips show in order, each on screen with a highlight ring and a counter');
    await tip.getByRole('button', { name: 'Back' }).click();
    check(await shown(tip.getByText(titles[4], { exact: true }), 2000), 'Back goes to the previous tip');
    await tip.getByRole('button', { name: 'Next', exact: true }).click();
    await tip.getByRole('button', { name: 'Done' }).click();
    check(!(await tip.isVisible()), 'Done closes the tour');
    await p.reload();
    await p.waitForTimeout(900);
    check(!(await tip.isVisible()) && !(await dlg.isVisible()), 'after a reload neither the popup nor the tour comes back');

    // ---------- replay from Settings, Escape skips ----------
    await p.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click();
    await p.getByRole('button', { name: 'Take the tour again' }).click();
    check(await shown(tip.getByText(titles[0])), 'Settings: "Take the tour again" replays it');
    await p.keyboard.press('Escape');
    check(!(await tip.isVisible()), 'Escape ends the tour');

    // ---------- the bell ----------
    await p.getByRole('navigation').getByRole('button', { name: 'Dashboard', exact: true }).click();
    const bell = p.getByRole('button', { name: /^Notifications/ });
    check((await bell.getAttribute('aria-label')) === 'Notifications, 2 unread', 'the bell announces two unread alerts: the welcome note and "add your first transactions"');
    await bell.click();
    const panel = p.getByRole('dialog', { name: 'Notifications' });
    check(await shown(panel.getByText('Welcome, Asha')), 'the panel lists the welcome note');
    await panel.getByRole('button', { name: 'Take the tour' }).click();
    check(!(await panel.isVisible()) && await shown(tip.getByText(titles[0])), 'its action closes the panel and starts the tour');
    await tip.getByRole('button', { name: 'Skip tour' }).click();
    check((await bell.getAttribute('aria-label')) === 'Notifications, 1 unread', 'using the welcome alert marks it read: one unread is left');
    await p.reload();
    await p.waitForTimeout(700);
    check((await p.getByRole('button', { name: /^Notifications/ }).getAttribute('aria-label')) === 'Notifications, 1 unread', 'read alerts stay read after a reload');

    // ---------- alerts worked out from real data, and browser notifications ----------
    await p.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click();
    check(await shown(p.getByRole('heading', { name: 'Notifications' })), 'Settings has a Notifications card');
    check(/while MyMoney is open in a tab/.test(await p.locator('main').innerText()), 'it says plainly that browser alerts work only while the app is open');
    await p.getByRole('button', { name: 'Turn on browser alerts' }).click();
    check(await shown(p.getByText('On', { exact: true })), 'browser alerts can be turned on once the browser allows it');
    await p.getByRole('button', { name: 'Send a test alert' }).click();
    check((await p.evaluate(() => window.__notes.map((n) => n.title))).includes('MyMoney alerts are on'), 'the test alert reaches the browser as a notification');

    await p.evaluate(() => { window.__hidden = true; });
    await p.getByRole('navigation').getByRole('button', { name: 'Transactions', exact: true }).click();
    const month = prevMonthCsv();
    await importCsv(p, 'rent-month.csv', month.csv);
    await p.getByText('Imported 2 transactions').waitFor({ timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(500);
    const notes = await p.evaluate(() => window.__notes);
    check(notes.some((n) => n.title === `You spent more than you earned in ${month.label}`), 'with the tab in the background, a new important alert becomes a system notification');
    const countBefore = notes.length;
    await p.evaluate(() => { window.__hidden = false; });
    await p.getByRole('navigation').getByRole('button', { name: 'Dashboard', exact: true }).click();
    await p.waitForTimeout(400);
    check((await p.evaluate(() => window.__notes.length)) === countBefore, 'the same alert is not shown twice');
    const bell2 = p.getByRole('button', { name: /^Notifications/ });
    check(/1 unread/.test(await bell2.getAttribute('aria-label')), 'the bell shows it as unread');
    await bell2.click();
    const pan2 = p.getByRole('dialog', { name: 'Notifications' });
    check(await shown(pan2.getByText(`You spent more than you earned in ${month.label}`)) && (await pan2.getByText('₹20,000').count()) >= 1, 'the panel explains it with the real amount (₹20,000 over income)');
    await pan2.getByRole('button', { name: 'See where it went' }).click();
    check(await shown(p.getByRole('heading', { name: 'Transactions', exact: true })), 'its action goes to the screen that explains it');
    await p.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click();
    await p.getByRole('button', { name: 'Turn off' }).click();
    check(await shown(p.getByRole('button', { name: 'Turn on browser alerts' })), 'browser alerts can be turned off again');
    check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await ctx.close();

    // ---------- a browser that refuses notifications ----------
    const dctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await dctx.addInitScript(() => { window.__grant = false; });
    await dctx.addInitScript(spy);
    const dp = await dctx.newPage();
    await dp.goto(URL);
    await dp.getByLabel('What should we call you?').fill('Ravi');
    await dp.getByRole('button', { name: 'Start with my own data' }).click();
    await dp.getByRole('button', { name: 'Skip tour' }).click({ timeout: 6000 }).catch(() => {});
    await dp.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click();
    await dp.getByRole('button', { name: 'Turn on browser alerts' }).click();
    check(await shown(dp.getByText('Notifications are blocked for this site').first()), 'when the browser refuses, a message says so instead of failing silently');
    check(/blocked for this site/i.test(await dp.locator('main').innerText()) && (await dp.getByRole('button', { name: 'Send a test alert' }).count()) === 0, 'and no test button is offered');
    await dctx.close();

    // ---------- phone ----------
    const mctx = await browser.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
    const m = await mctx.newPage();
    await m.goto(URL);
    check(await shown(m.getByRole('dialog', { name: /set up your profile/i })), 'phone: the popup opens');
    const fits = await m.evaluate(() => { const r = document.querySelector('dialog.welcome').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && document.documentElement.scrollWidth <= innerWidth; });
    check(fits, 'phone: the popup fits the screen with no sideways scroll');
    await m.getByRole('button', { name: 'Explore with sample data' }).click();
    const mtip = m.getByRole('dialog', { name: /Quick tour/ });
    check(await shown(mtip), 'phone: the tour starts');
    let phoneOk = true;
    for (let i = 0; i < 6; i++) {
      const g = await m.evaluate(() => { const t = document.querySelector('.tour-pop').getBoundingClientRect(); const r = document.querySelector('.tour-ring').getBoundingClientRect(); return t.left >= 0 && t.right <= innerWidth && t.top >= 0 && t.bottom <= innerHeight && r.width > 20; });
      if (!g) { phoneOk = false; console.log('  phone step', i + 1, 'off screen'); }
      if (i < 5) await mtip.getByRole('button', { name: 'Next', exact: true }).click(); else await mtip.getByRole('button', { name: 'Done' }).click();
    }
    check(phoneOk, 'phone: every tip stays inside the screen (the tab bar tips point up, the header tips point down)');
    const mb = m.getByRole('button', { name: /^Notifications/ });
    const box = await mb.boundingBox();
    check(box.width >= 44 && box.height >= 44, `phone: the bell is at least 44px (${Math.round(box.width)}x${Math.round(box.height)})`);
    await mb.click();
    const mp = await m.evaluate(() => { const r = document.querySelector('.notif-panel').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; });
    check(mp, 'phone: the notification panel fits the screen');
    check(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: the header with the bell does not overflow');
    await mctx.close();
  } finally {
    await browser.close();
  }
  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('test run crashed:', e.message); process.exit(2); });

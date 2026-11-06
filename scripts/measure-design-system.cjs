// Measures the computed style of the app's real elements (type, height, padding, radius, shadow) at desktop and phone width, so the design
// system's numbers come from the running app, not from reading CSS. Needs a dev server with the Supabase values blanked and Playwright.
// Usage: APP_URL=http://localhost:5173/ node scripts/measure-design-system.cjs   Writes design-system/measured.json
const { chromium } = require('playwright');
const { writeFileSync } = require('node:fs');
const { seed } = require('../e2e/fixtures/demo.cjs');
const APP = process.env.APP_URL || 'http://localhost:5173/';
const SEL = {
  'page title (h1)': 'main h1', 'card title (h2)': '.card h2', 'summary figure': '.sumcard:not(.feature) .big', 'hero figure': '.sumcard.feature .big', 'stat value': '.stat .value',
  'body / paragraph': 'main .sub', 'table head': 'table th', 'table cell': 'table td', 'field label': '.field > span', 'button (outline)': '.btn:not(.primary):not(.small):not(.icon)', 'button primary': '.btn.primary',
  'button small': '.btn.small', 'badge': '.badge', 'side link': '.side-link', 'tab (segmented)': '.pill-toggle button', 'input': '.field input', 'select': '.field select', 'card': '.card', 'sumcard': '.sumcard', 'callout': '.callout, .alert', 'toast': '.toast',
};
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const out = {};
  for (const [name, vp, mobile] of [['desktop', { width: 1280, height: 860 }, false], ['phone', { width: 390, height: 800 }, true]]) {
    const c = await b.newContext({ viewport: vp, hasTouch: mobile, isMobile: mobile });
    const p = await c.newPage();
    await p.goto(APP);
    await seed(p);
    await p.getByRole('button', { name: 'Skip tour' }).click({ timeout: 4000 }).catch(() => {});
    out[name] = {};
    for (const tab of ['Dashboard', 'Transactions', 'Settings']) {
      await p.getByRole('navigation').getByRole('button', { name: mobile ? { Dashboard: 'Home', Transactions: 'Activity', Settings: 'Settings' }[tab] : tab, exact: true }).first().click();
      await p.waitForTimeout(500);
      const r = await p.evaluate((SEL) => {
        const res = {};
        for (const [k, s] of Object.entries(SEL)) {
          const el = [...document.querySelectorAll(s)].find((e) => e.getBoundingClientRect().width > 0);
          if (!el) continue;
          const cs = getComputedStyle(el), bb = el.getBoundingClientRect();
          res[k] = { fs: cs.fontSize, fw: cs.fontWeight, lh: cs.lineHeight, ls: cs.letterSpacing, h: Math.round(bb.height), pad: cs.padding, rad: cs.borderTopLeftRadius, sh: cs.boxShadow === 'none' ? '' : cs.boxShadow.slice(0, 60), ff: cs.fontFamily.slice(0, 30) };
        }
        return res;
      }, SEL);
      Object.assign(out[name], r);
    }
    await c.close();
  }
  writeFileSync(require('node:path').join(__dirname, '..', 'design-system', 'measured.json'), JSON.stringify({ measuredAt: new Date().toISOString().slice(0, 10), viewport: { desktop: '1280x860', phone: '390x800' }, elements: out }, null, 1) + '\n');
  console.log('wrote design-system/measured.json');
  await b.close();
})();

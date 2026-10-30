// Browser smoke test. Needs Playwright with Chromium available (require('playwright')).
// Usage: npm run build && npx vite preview --port 4174 & node e2e/flow.cjs
const { chromium } = require('playwright');
const URL = process.env.APP_URL || 'http://localhost:4174/';

const csv = `Account Statement,,,,,
Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance
01/09/26,NEFT-ACME CORP-SALARY SEP,0001,01/09/26,,"1,00,000.00",1
05/09/26,UPI-Rent to landlord,0,05/09/26,"25,000.00",,1
07/09/26,ACH D- ZERODHA COIN SIP,0,07/09/26,"15,000.00",,1
09/09/26,UPI-SWIGGY-123@ybl,0,09/09/26,"1,200.00",,1
12/09/26,UPI-XYZ STORE,0,12/09/26,"3,000.00",,1
01/10/26,NEFT-ACME CORP-SALARY OCT,0001,01/10/26,,"1,00,000.00",1
05/10/26,UPI-Rent to landlord,0,05/10/26,"25,000.00",,1
09/10/26,UPI-ZOMATO,0,09/10/26,"900.00",,1
`;

let failed = 0;
const check = (ok, msg) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + msg);
  if (!ok) failed++;
};

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errors = [];
  // Headless Chromium has no GPU and its software GL prints performance notices for any WebGL canvas.
  // Those are driver messages, not app errors, so ignore only that exact kind.
  const driverNoise = /GL Driver Message|GPU stall due to ReadPixels/;
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !driverNoise.test(m.text()) && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
  const nav = (name) => page.getByRole('navigation').getByRole('button', { name });
  const main = () => page.locator('main').innerText();

  await page.goto(URL);
  await page.getByRole('button', { name: 'Start with my own data' }).click();
  check(await page.getByText('Nothing here yet').isVisible(), 'empty dashboard shows onboarding card');

  await nav('Plan').click();
  check(await page.getByText('No income found in your transactions yet').isVisible(), 'plan falls back to profile estimates');

  await nav('Transactions').click();
  await page.locator('textarea').fill(csv);
  await page.getByRole('button', { name: 'Read pasted text' }).click();
  check(await page.getByText('8 rows read').isVisible(), 'CSV: 8 rows read');
  await page.getByRole('button', { name: /Import 8 transactions/ }).click();
  check(await page.getByText('Imported 8 transactions.').isVisible(), 'CSV: imported');
  await page.locator('textarea').fill(csv);
  await page.getByRole('button', { name: 'Read pasted text' }).click();
  check(await page.getByText('8 already imported').isVisible(), 'CSV: re-import detected as duplicates');

  await nav('Dashboard').click();
  let t = await main();
  check(t.includes('Oct 2026') && t.includes('₹1,00,000'), 'dashboard: latest month, Indian number format');
  check(t.includes('₹25,900'), 'Oct spend = rent 25,000 + 900');
  await page.getByRole('button', { name: 'Previous month' }).click();
  t = await main();
  check(t.includes('₹29,200') && t.includes('₹15,000'), 'Sep spend 29,200 excludes the 15,000 SIP, which shows as invested');

  await nav('Goals').click();
  // The 3D scene is a lazy chunk, so wait for its canvas instead of checking at once.
  const canvasShown = await page.waitForSelector('.showcase canvas', { timeout: 15000 }).then(() => true, () => false);
  check(canvasShown, 'Goals page renders the 3D scene canvas');
  await page.getByRole('button', { name: 'Car', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await page.locator('label:has-text("Price today") input').fill('2000000');
  check((await main()).includes('₹20,00,000'), 'goal price edit flows into the plan');

  await nav('Investments').click();
  await page.getByRole('button', { name: 'Add investment' }).click();
  await page.locator('label:has-text("Name") input').first().fill('Test FD');
  await page.locator('label:has-text("Deposit amount") input').fill('100000');
  await page.locator('label:has-text("Interest rate") input').fill('7');
  check((await main()).includes('Matures on'), 'FD maturity preview shown');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  check((await main()).includes('Test FD'), 'FD appears in holdings');

  await page.reload();
  await nav('Investments').click();
  check((await main()).includes('Test FD'), 'data persists across reload');

  // Upgrade path: data saved under the old app name must still load.
  const legacyPage = await (await browser.newContext()).newPage();
  await legacyPage.addInitScript(() => {
    const state = { version: 1, onboarded: true, profile: { name: 'Legacy' }, txns: [], goals: [], investments: [{ id: 'x', kind: 'savings', name: 'Old savings', institution: '', startDate: '2020-01-01', amount: 12345, currentValue: 12345, rate: 3, tenureMonths: 0 }], liabilities: [], overrides: {} };
    if (!localStorage.getItem('mymoney:v1')) localStorage.setItem('eaglerk:v1', JSON.stringify(state));
  });
  await legacyPage.goto(URL);
  await legacyPage.getByRole('navigation').getByRole('button', { name: 'Investments' }).click();
  check((await legacyPage.locator('main').innerText()).includes('Old savings'), 'data saved under the old key (eaglerk) still loads');
  check((await legacyPage.locator('.brand').first().innerText()).includes('MyMoney'), 'app shows the MyMoney name');
  await legacyPage.close();

  await page.setViewportSize({ width: 390, height: 844 });
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'no horizontal overflow at 390px');
  check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));

  await browser.close();
  process.exit(failed ? 1 : 0);
})();

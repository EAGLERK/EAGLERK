// Browser tests for sign-in, sign-up, Google, cloud sync and conflicts, using the real supabase-js client
// against e2e/mock-supabase.cjs. Starts the mock and a Vite dev server itself.
// Needs Playwright with Chromium available. Usage: npm run e2e:auth
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const mock = require('./mock-supabase.cjs');

const MOCK_PORT = 54321;
const APP_PORT = 5174;
const MOCK = `http://localhost:${MOCK_PORT}`;
const APP = `http://localhost:${APP_PORT}/`;
const PW = 'blue-tiger-9-lantern';

let failed = 0;
const results = [];
const check = (ok, msg) => { results.push([ok, msg]); console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = async () => (await fetch(`${MOCK}/__state`)).json();
const reset = () => fetch(`${MOCK}/__reset`);
async function until(fn, ms = 8000) {
  const end = Date.now() + ms;
  for (;;) { try { const v = await fn(); if (v) return v; } catch { /* keep waiting */ } if (Date.now() > end) return false; await sleep(150); }
}
const text = (page) => page.locator('body').innerText();
/** Waits for the element instead of reading the page the instant after an action. */
const shown = (loc) => loc.waitFor({ timeout: 8000 }).then(() => true, () => false);

async function startApp(port = APP_PORT, extraEnv = {}) {
  const proc = spawn('npx', ['vite', '--port', String(port), '--strictPort'], {
    env: { ...process.env, VITE_SUPABASE_URL: MOCK, VITE_SUPABASE_ANON_KEY: 'anon-test-key', ...extraEnv },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) return proc; } catch { /* not up yet */ } await sleep(500); }
  proc.kill();
  throw new Error('dev server did not start');
}

async function newPage(browser, opts = {}, url = APP) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !/GL Driver Message|ReadPixels|Failed to load resource/.test(m.text()) && page.errors.push(m.text().slice(0, 200)));
  page.on('pageerror', (e) => page.errors.push('pageerror ' + e.message));
  await page.goto(url);
  return page;
}

async function signUp(page, email, pw = PW) {
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(pw);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
}
async function signIn(page, email, pw = PW) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(pw);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
const savedChip = (page) => page.getByText('All changes saved').first().waitFor({ timeout: 8000 }).then(() => true, () => false);
const nav = (page, name) => page.getByRole('navigation').getByRole('button', { name }).first().click();

(async () => {
  const appProc = await startApp();
  const phoneApp = await startApp(5175, { VITE_AUTH_PHONE: '1' });
  const PHONE_APP = 'http://localhost:5175/';
  const m = await mock.start(MOCK_PORT);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    // 1. Signed out: only the sign-in screen, nothing of the app
    await reset();
    let p = await newPage(browser);
    await p.getByRole('heading', { name: 'Sign in to MyMoney' }).waitFor();
    check(!(await text(p)).includes('Dashboard'), 'signed out: the app is not shown, only the sign-in screen');
    check(await shown(p.getByRole('button', { name: 'Continue with Google' })), 'Google button is offered');

    // 2. Google goes to the provider with the right redirect
    const authorize = p.waitForRequest((r) => r.url().includes('/auth/v1/authorize'), { timeout: 8000 }).catch(() => null);
    await p.getByRole('button', { name: 'Continue with Google' }).click();
    const gr = await authorize;
    const gu = gr && new URL(gr.url());
    check(!!gu && gu.searchParams.get('provider') === 'google', 'Google button starts the OAuth flow for provider=google');
    check(!!gu && gu.searchParams.get('redirect_to') === APP.replace(/\/$/, '') + '/' && gu.searchParams.get('code_challenge_method') === 's256', 'OAuth uses PKCE and returns to the app origin');
    await p.context().close();

    // 3. Phone is gated until an SMS provider is configured
    p = await newPage(browser);
    await p.getByRole('button', { name: 'Mobile number' }).click();
    check(await shown(p.getByText('not switched on yet').first()), 'phone sign-in is clearly marked as not switched on');
    check((await p.locator('form').count()) === 0, 'no phone form is offered while it is off');
    await p.context().close();

    // 4. Validation happens before any request is sent
    await reset();
    p = await newPage(browser);
    await signUp(p, 'weak@test.dev', '12345678');
    check(await shown(p.getByRole('alert').getByText(/too common/)), 'weak password is rejected on the page');
    await p.getByLabel('Email').fill('not-an-email');
    await p.getByRole('button', { name: 'Create account', exact: true }).click();
    check(await shown(p.getByRole('alert').getByText(/does not look right/)), 'bad email is rejected on the page');
    check(!(await state()).log.some((l) => l.path === '/auth/v1/signup'), 'rejected input never reaches the server');
    await p.context().close();

    // 5. Sign up -> onboarding -> data lands in the account
    await reset();
    p = await newPage(browser);
    await signUp(p, 'ann@test.dev');
    await p.getByRole('button', { name: 'Explore with sample data' }).click();
    check(await savedChip(p), 'after sign-up the app shows "All changes saved"');
    const s1 = await until(async () => { const s = await state(); const r = s.rows[0]; return r && r.data.txns.length > 100 ? s : false; });
    check(!!s1, 'sample data was saved to the account row on the server');
    const annId = s1 && s1.users[0].id;
    check(!!s1 && s1.rows[0].id === annId, 'the row belongs to the signed-in user');
    check(await p.evaluate(() => localStorage.getItem('mymoney:v1') === null && localStorage.getItem('eaglerk:v1') === null), 'no copy of the data is kept in browser storage while signed in');

    // 6. Reload keeps the session and loads from the account
    await p.reload();
    await nav(p, 'Dashboard');
    check(await p.getByText('Overview').first().waitFor({ timeout: 8000 }).then(() => true, () => false), 'reload: still signed in, data loaded from the account');
    check(!(await text(p)).includes('Explore with sample data'), 'reload: no onboarding screen for an existing account');

    // 7. Second device sees the same data
    const pB = await newPage(browser);
    await signIn(pB, 'ann@test.dev');
    await pB.getByText('Overview').first().waitFor({ timeout: 8000 });
    check(true, 'device B: signs in and sees the same account');

    // 8. Conflict: B saves first, A then edits on a stale version
    await nav(pB, 'Transactions');
    await pB.getByRole('button', { name: 'Add transaction' }).click();
    await pB.getByLabel('Description', { exact: true }).fill('From device B');
    await pB.getByLabel(/^Amount/).fill('777');
    await pB.getByRole('button', { name: 'Save', exact: true }).click();
    check(await savedChip(pB), 'device B: its edit is saved');
    await nav(p, 'Transactions');
    await p.getByRole('button', { name: 'Add transaction' }).click();
    await p.getByLabel('Description', { exact: true }).fill('From device A');
    await p.getByLabel(/^Amount/).fill('555');
    await p.getByRole('button', { name: 'Save', exact: true }).click();
    const banner = await p.getByText('Your account changed on another device').waitFor({ timeout: 8000 }).then(() => true, () => false);
    check(banner, 'device A: a stale save is detected and the user is asked, not overwritten');
    let st = await state();
    check(!JSON.stringify(st.rows[0].data).includes('From device A') && JSON.stringify(st.rows[0].data).includes('From device B'), 'the server still holds B\'s data after the conflict');
    await p.getByRole('button', { name: 'Load the latest' }).click();
    check(await savedChip(p), 'device A: "Load the latest" resolves the conflict');
    check((await p.locator('main').innerText()).includes('From device B'), 'device A now shows device B\'s change');

    // Keep-mine path
    await p.getByRole('button', { name: 'Add transaction' }).click();
    await p.getByLabel('Description', { exact: true }).fill('A again');
    await p.getByLabel(/^Amount/).fill('11');
    await p.getByRole('button', { name: 'Save', exact: true }).click();
    await savedChip(p);
    await nav(pB, 'Transactions');
    await pB.getByRole('button', { name: 'Add transaction' }).click();
    await pB.getByLabel('Description', { exact: true }).fill('B stale edit');
    await pB.getByLabel(/^Amount/).fill('22');
    await pB.getByRole('button', { name: 'Save', exact: true }).click();
    await pB.getByText('Your account changed on another device').waitFor({ timeout: 8000 });
    await pB.getByRole('button', { name: 'Keep what I have here' }).click();
    check(await savedChip(pB), 'device B: "Keep what I have here" overwrites on purpose');
    st = await state();
    check(JSON.stringify(st.rows[0].data).includes('B stale edit'), 'the server now holds the version the user chose');
    await pB.context().close();

    // 9. Sign out clears the screen and leaves nothing behind
    await nav(p, 'Settings');
    await p.getByRole('button', { name: 'Sign out' }).first().click();
    await p.getByRole('heading', { name: 'Sign in to MyMoney' }).waitFor({ timeout: 8000 });
    check(true, 'sign out returns to the sign-in screen');
    check(await p.evaluate(() => localStorage.getItem('mymoney:v1') === null), 'sign out: no personal data left in browser storage');
    await p.reload();
    check(await p.getByRole('heading', { name: 'Sign in to MyMoney' }).waitFor({ timeout: 8000 }).then(() => true, () => false), 'after reload a signed-out browser stays signed out');

    // 10. Wrong password, then right
    await signIn(p, 'ann@test.dev', 'wrong-password-1');
    check(await shown(p.getByRole('alert').getByText('Email or password is incorrect.')), 'wrong password shows a plain message');
    await signIn(p, 'ann@test.dev');
    await nav(p, 'Dashboard');
    check(await p.getByText('Overview').first().waitFor({ timeout: 8000 }).then(() => true, () => false), 'right password signs in and the data comes back');

    // 11. Change password in Settings
    await nav(p, 'Settings');
    await p.getByLabel('New password').fill('new-green-4-river-pass');
    await p.getByRole('button', { name: 'Change password' }).click();
    check(await p.getByText('Password changed.').waitFor({ timeout: 8000 }).then(() => true, () => false), 'change password confirms');
    st = await state();
    check(st.users[0].password === 'new-green-4-river-pass', 'the new password reached the server');
    await p.getByRole('button', { name: 'Sign out' }).first().click();
    await p.getByRole('heading', { name: 'Sign in to MyMoney' }).waitFor();
    await signIn(p, 'ann@test.dev', 'new-green-4-river-pass');
    await nav(p, 'Dashboard');
    check(await p.getByText('Overview').first().waitFor({ timeout: 8000 }).then(() => true, () => false), 'signing in with the new password works');

    // 12. Save failure is visible and recoverable
    await fetch(`${MOCK}/__fail?on=1`);
    await nav(p, 'Transactions');
    await p.getByRole('button', { name: 'Add transaction' }).click();
    await p.getByLabel('Description', { exact: true }).fill('while offline');
    await p.getByLabel(/^Amount/).fill('9');
    await p.getByRole('button', { name: 'Save', exact: true }).click();
    check(await p.getByText('Could not save your latest changes').waitFor({ timeout: 8000 }).then(() => true, () => false), 'a failed save shows a banner instead of failing silently');
    await fetch(`${MOCK}/__fail?on=0`);
    await p.getByRole('button', { name: 'Retry now' }).click();
    check(await savedChip(p), 'retry saves once the server is back');
    st = await state();
    check(JSON.stringify(st.rows[0].data).includes('while offline'), 'the edit made during the outage was not lost');

    // 13. Delete account
    await nav(p, 'Settings');
    await p.getByText('Delete my account', { exact: true }).click();
    await p.getByRole('button', { name: 'I want to delete my account' }).click();
    const del = p.getByRole('button', { name: 'Delete everything' });
    check(await del.isDisabled(), 'delete stays disabled until DELETE is typed');
    await p.getByLabel('Type DELETE to confirm').fill('DELETE');
    await del.click();
    await p.getByRole('heading', { name: 'Sign in to MyMoney' }).waitFor({ timeout: 8000 });
    st = await state();
    check(st.users.length === 0 && st.rows.length === 0, 'account and its data are gone from the server');
    check(p.errors.length === 0, 'no console errors across the signed-in session' + (p.errors.length ? ': ' + p.errors.join(' | ') : ''));
    await p.context().close();

    // 14. Email confirmation required
    await reset();
    p = await newPage(browser);
    await signUp(p, 'confirm+x@test.dev');
    check(await p.getByRole('heading', { name: 'Check your inbox' }).waitFor({ timeout: 8000 }).then(() => true, () => false), 'sign-up with email confirmation shows "Check your inbox"');
    await p.getByRole('button', { name: 'Back to sign in' }).click();
    await signIn(p, 'confirm+x@test.dev');
    check(await shown(p.getByRole('alert').getByText(/Confirm your email first/)), 'signing in before confirming gives a clear message');
    await p.context().close();

    // 15. Registering an existing email looks identical (no account enumeration)
    await reset();
    p = await newPage(browser);
    await signUp(p, 'dup@test.dev');
    await p.getByRole('button', { name: 'Explore with sample data' }).click().catch(() => {});
    await savedChip(p);
    await p.getByRole('button', { name: 'Sign out' }).first().click();
    await p.getByRole('heading', { name: 'Sign in to MyMoney' }).waitFor();
    const confirmUser = 'confirm+dup@test.dev';
    await signUp(p, confirmUser);
    await p.getByRole('heading', { name: 'Check your inbox' }).waitFor({ timeout: 8000 });
    await p.getByRole('button', { name: 'Back to sign in' }).click();
    await signUp(p, confirmUser);
    check(await p.getByRole('heading', { name: 'Check your inbox' }).waitFor({ timeout: 8000 }).then(() => true, () => false), 're-registering an existing email shows the same screen as a new one');
    await p.context().close();

    // 16. Password reset: same answer for known and unknown emails
    await reset();
    p = await newPage(browser);
    await p.getByRole('button', { name: 'Forgot password?' }).click();
    await p.getByLabel('Email').fill('nobody@test.dev');
    await p.getByRole('button', { name: 'Send reset link' }).click();
    check(await shown(p.getByRole('status').getByText(/If an account exists/)), 'reset request gives a neutral answer');
    check((await state()).log.some((l) => l.path === '/auth/v1/recover'), 'the reset request reached the server');
    await p.context().close();

    // 17. Data from before accounts can be imported, then is removed from the browser
    await reset();
    p = await newPage(browser);
    await p.evaluate(() => localStorage.setItem('mymoney:v1', JSON.stringify({ version: 1, onboarded: true, profile: { name: 'Old' }, txns: [{ id: 't1', date: '2026-10-01', description: 'old salary', amount: 1000, type: 'income', category: 'Salary', source: 'manual' }], goals: [], investments: [{ id: 'i1', kind: 'savings', name: 'Old savings', institution: '', startDate: '2020-01-01', amount: 5, currentValue: 5, rate: 3, tenureMonths: 0 }], liabilities: [], overrides: {} })));
    await signUp(p, 'imp@test.dev');
    check(await p.getByRole('heading', { name: 'Found data on this device' }).waitFor({ timeout: 8000 }).then(() => true, () => false), 'existing browser data is offered for import after the first sign-in');
    await p.getByRole('button', { name: 'Import into my account' }).click();
    const imp = await until(async () => { const s = await state(); return s.rows[0] && s.rows[0].data.txns.length === 1 && s.rows[0].data.investments.length === 1 ? s : false; });
    check(!!imp, 'imported data is stored in the account');
    check(await until(() => p.evaluate(() => localStorage.getItem('mymoney:v1') === null && localStorage.getItem('eaglerk:v1') === null), 5000), 'the browser copy is removed after a successful import');
    await p.context().close();

    // 18. Coming back from Google: the ?code= callback signs the user in
    await reset();
    p = await newPage(browser);
    await p.getByRole('button', { name: 'Continue with Google' }).click();
    await p.waitForURL(/\/auth\/v1\/authorize/, { timeout: 8000 });
    await fetch(`${MOCK}/__pkce?email=gina@test.dev&provider=google`);
    await p.goto(APP + '?code=abc123');
    check(await p.getByRole('button', { name: 'Start with my own data' }).waitFor({ timeout: 8000 }).then(() => true, () => false), 'returning from Google signs the user in');
    check(!p.url().includes('code='), 'the one-time code is removed from the address bar');
    await p.getByRole('button', { name: 'Start with my own data' }).click();
    await nav(p, 'Settings');
    check(await shown(p.getByText('Signed in with Google.')), 'Settings says the account uses Google');
    check((await shown(p.getByText('there is no MyMoney password to change'))) && (await p.getByRole('button', { name: 'Change password' }).count()) === 0, 'a Google-only account is not offered a password change');
    check((await text(p)).includes('gina@test.dev'), 'the account email is shown');
    await p.context().close();

    // 19. Password-reset link: lands on "choose a new password"
    await reset();
    p = await newPage(browser);
    await signUp(p, 'rita@test.dev');
    await p.getByRole('button', { name: 'Start with my own data' }).click();
    await savedChip(p);
    await p.getByRole('button', { name: 'Sign out' }).first().click();
    await p.getByRole('heading', { name: 'Sign in to MyMoney' }).waitFor({ timeout: 8000 });
    await p.getByRole('button', { name: 'Forgot password?' }).click();
    await p.getByLabel('Email').fill('rita@test.dev');
    await p.getByRole('button', { name: 'Send reset link' }).click();
    await p.getByText(/If an account exists/).waitFor({ timeout: 8000 });
    await fetch(`${MOCK}/__pkce?email=rita@test.dev&provider=email`);
    await p.goto(APP + '?code=reset1');
    check(await p.getByRole('heading', { name: 'Choose a new password' }).waitFor({ timeout: 8000 }).then(() => true, () => false), 'opening the reset link asks for a new password');
    await p.getByLabel('New password', { exact: true }).fill('another-pass-77-river');
    await p.getByLabel('Repeat new password').fill('different-pass-1');
    await p.getByRole('button', { name: 'Save password' }).click();
    check(await shown(p.getByRole('alert').getByText(/do not match/)), 'mismatched passwords are caught');
    await p.getByLabel('Repeat new password').fill('another-pass-77-river');
    await p.getByRole('button', { name: 'Save password' }).click();
    check(await shown(p.getByRole('button', { name: 'Sign out' }).first()), 'after saving, the user is in the app');
    st = await state();
    check(st.users.find((u) => u.email === 'rita@test.dev').password === 'another-pass-77-river', 'the new password reached the server');
    await p.context().close();

    // 20. Phone sign-up with an SMS code (second app instance with the phone flag on)
    await reset();
    p = await newPage(browser, {}, PHONE_APP);
    await p.getByRole('button', { name: 'Mobile number' }).click();
    check(await shown(p.getByLabel('Mobile number').first()), 'phone flag on: the mobile number form is offered');
    await p.getByRole('button', { name: 'Create an account' }).click();
    await p.getByLabel('Mobile number').first().fill('12345');
    await p.getByLabel('Password', { exact: true }).fill(PW);
    await p.getByRole('button', { name: 'Create account', exact: true }).click();
    check(await shown(p.getByRole('alert').getByText(/valid mobile number/)), 'an invalid number is rejected before any request');
    check(!(await state()).log.some((l) => l.path === '/auth/v1/signup'), 'no sign-up request was sent for the invalid number');
    await p.getByLabel('Mobile number').first().fill('98765 43210');
    await p.getByRole('button', { name: 'Create account', exact: true }).click();
    check(await p.getByLabel('SMS code').waitFor({ timeout: 8000 }).then(() => true, () => false), 'a valid number moves on to the SMS code step');
    check((await state()).users[0].phone === '+919876543210', 'the number was normalised to +91 format for the server');
    await p.getByLabel('SMS code').fill('000000');
    await p.getByRole('button', { name: 'Verify code' }).click();
    check(await p.getByRole('alert').getByText(/wrong or has expired/).waitFor({ timeout: 8000 }).then(() => true, () => false), 'a wrong code is refused with a plain message');
    await p.getByLabel('SMS code').fill('123456');
    await p.getByRole('button', { name: 'Verify code' }).click();
    check(await p.getByRole('button', { name: 'Start with my own data' }).waitFor({ timeout: 8000 }).then(() => true, () => false), 'the right code signs the user in');
    await p.getByRole('button', { name: 'Start with my own data' }).click();
    check(await p.getByText('+919876543210').first().waitFor({ timeout: 8000 }).then(() => true, () => false), 'the sidebar shows the phone number, not a blank');
    await savedChip(p);
    await p.getByRole('button', { name: 'Sign out' }).first().click();
    await p.getByRole('heading', { name: 'Sign in to MyMoney' }).waitFor({ timeout: 8000 });
    await p.getByRole('button', { name: 'Mobile number' }).click();
    await p.getByLabel('Mobile number').first().fill('9876543210');
    await p.getByLabel('Password', { exact: true }).fill(PW);
    await p.getByRole('button', { name: 'Sign in', exact: true }).click();
    check(await p.getByText('+919876543210').first().waitFor({ timeout: 8000 }).then(() => true, () => false), 'signing in with number and password works afterwards');
    await p.context().close();
  } finally {
    await browser.close();
    await m.close();
    appProc.kill();
    phoneApp.kill();
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('test run crashed:', e.message); process.exit(2); });

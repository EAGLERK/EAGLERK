// Mitra's AI layer in a real browser: a stand-in Supabase project for sign-in, and the `assistant` function answered by the test.
// This checks the app's handling of AI answers (what is sent, what is accepted, what still asks first). It does not call a real model.
// Starts the mock and a Vite dev server itself. Usage: npm run e2e:voice-ai
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const mock = require('./mock-supabase.cjs');

const MOCK_PORT = 54323;
const APP_PORT = 5176;
const MOCK = `http://localhost:${MOCK_PORT}`;
const APP = `http://localhost:${APP_PORT}/`;
const PW = 'blue-tiger-9-lantern';

let failed = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shown = (loc, t = 8000) => loc.waitFor({ timeout: t }).then(() => true, () => false);
const stop = (proc) => { try { process.kill(-proc.pid, 'SIGTERM'); } catch { /* gone */ } };

async function startApp(extraEnv = {}) {
  if (await fetch(APP).then(() => true, () => false)) throw new Error(`port ${APP_PORT} is already in use`);
  const proc = spawn('npx', ['vite', '--port', String(APP_PORT), '--strictPort'], {
    env: { ...process.env, VITE_SUPABASE_URL: MOCK, VITE_SUPABASE_ANON_KEY: 'anon-test-key', VITE_AUTH_GOOGLE: '0', VITE_AUTH_PHONE: '0', VITE_FEATURE_INVESTING: '0', VITE_VOICE_AI: '1', ...extraEnv },
    stdio: 'ignore', detached: true,
  });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(APP)).ok) return proc; } catch { /* not up */ } await sleep(500); }
  stop(proc);
  throw new Error('dev server did not start');
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };

(async () => {
  let app, m, browser;
  const cleanup = async () => { try { await browser?.close(); } catch { /* closed */ } try { await m?.close(); } catch { /* closed */ } if (app) stop(app); };
  try {
    m = await mock.start(MOCK_PORT);
    app = await startApp();
    browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));

    // The "assistant" function: the test decides what it answers.
    let answer = { status: 200, body: { reply: 'Not set' } };
    const calls = [];
    await p.route('**/functions/v1/assistant', async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      calls.push({ body: JSON.parse(req.postData() || '{}'), auth: req.headers()['authorization'] || '' });
      return route.fulfill({ status: answer.status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(answer.body) });
    });

    await p.goto(APP);
    await p.getByRole('button', { name: 'Create an account' }).click();
    await p.getByLabel('Email').fill('mitra@test.dev');
    await p.getByLabel('Password', { exact: true }).fill(PW);
    await p.getByRole('button', { name: 'Create account', exact: true }).click();
    await p.getByLabel('What should we call you?').fill('Asha');
    await p.getByRole('button', { name: 'Get started' }).click();
    await p.getByRole('button', { name: 'Skip tour' }).click({ timeout: 6000 }).catch(() => {});

    const panel = p.getByRole('dialog', { name: /Mitra/ });
    const say = async (text) => { await p.getByRole('textbox', { name: 'Type a command' }).fill(text); await p.getByRole('button', { name: 'Send' }).click(); };
    const botSays = (re) => shown(panel.locator('.voice-line.bot', { hasText: re }).last());

    await p.getByRole('button', { name: /Ask Mitra/ }).click();
    check(await shown(panel.getByText("Hi Asha, I'm Mitra.")), 'Mitra greets the person by name');
    check(await shown(panel.getByText('Your money assistant · AI on')), 'the panel says the AI is on');
    check(await shown(panel.getByText(/sent to an AI service/)), 'and says plainly what is sent');

    // Known phrases never leave the device.
    await say('go to goals');
    check(await shown(p.getByRole('heading', { name: 'Goals', exact: true })) && calls.length === 0, 'a phrase Mitra knows is handled on this device, with no AI call');

    // A phrase the rules do not know goes to the AI, and the answer is used.
    answer = { status: 200, body: { command: { t: 'addTxn', type: 'expense', amount: 800, description: 'Dinner with Rahul', date: null } } };
    await say('dinner with rahul cost me eight hundred last night');
    check(await botSays(/Added expense of ₹800, Dinner with Rahul/), 'an unknown phrase is read by the AI and added as an expense');
    check(calls.length === 1 && /dinner with rahul/.test(calls[0].body.text), 'exactly one call was made, with the sentence');
    check(Object.keys(calls[0].body).sort().join(',') === 'assumptions,notes,text,today', 'only the sentence, date, note titles and setting names were sent');
    check(/^Bearer /.test(calls[0].auth), 'the call carries the signed-in session');
    await say('save');
    await shown(p.getByText(/Saved 1 new transaction/).first());

    // It can answer with words instead.
    answer = { status: 200, body: { reply: 'I cannot book flights, but I can track the spend.' } };
    await say('book me a flight to goa');
    check(await botSays(/cannot book flights/), 'the AI can say it cannot do something');

    // Answers that are not on the list are refused.
    answer = { status: 200, body: { command: { t: 'clearTxns' } } };
    await say('get rid of everything please');
    check(await botSays(/could not work out/), 'a command that is not on the list is refused');

    answer = { status: 200, body: { command: { t: 'addTxn', type: 'expense', amount: -50, description: 'x', date: null } } };
    await say('blah blah minus fifty');
    check(await botSays(/could not work out/), 'a malformed command is refused');

    // A destructive answer still asks first.
    answer = { status: 200, body: { command: { t: 'txnDelete', target: 'dinner' } } };
    await say('that dinner with rahul never happened');
    check(await botSays(/Delete ₹800 Dinner with Rahul/) && await shown(panel.getByRole('button', { name: 'Yes' })), 'an AI-requested delete still asks, with Yes and No');
    await say('no');
    check(await botSays(/left it as it was/), 'and No leaves it alone');

    // Not signed in on the server side, or the server is down.
    answer = { status: 401, body: { error: 'signin' } };
    await say('something odd one');
    check(await botSays(/Sign in to use the AI/), 'a 401 gets an honest message');
    answer = { status: 500, body: { error: 'model' } };
    await say('something odd two');
    check(await botSays(/could not work out/), 'a server error gets an honest message');

    // Switching the AI off stops the calls.
    const before = calls.length;
    await panel.getByLabel('Use AI for new phrases').uncheck();
    check(await shown(panel.getByText('Your money assistant', { exact: true })), 'the "AI on" label goes away');
    await say('something odd three');
    check(await botSays(/did not understand "something odd three"/) && calls.length === before, 'with the AI off, nothing is sent and Mitra says what it understood');

    check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors[0] : ''));
    await ctx.close();
  } catch (e) {
    console.log('FAIL crashed: ' + (e && e.message));
    failed++;
  }
  await cleanup();
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();

// The voice assistant, in a real browser. Speech recognition and speech synthesis are stubbed (headless Chromium has neither),
// so this tests everything after the words arrive: the panel, the commands, confirmations, undo and the changes in the app.
// Usage: APP_URL=http://localhost:5173/ npm run e2e:voice   (server started with the Supabase values blanked)
const { chromium } = require('playwright');
const URL = process.env.APP_URL || 'http://localhost:5173/';

let failed = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) failed++; };
const shown = (loc, t = 5000) => loc.waitFor({ timeout: t }).then(() => true, () => false);

const STUB = `
  window.__spoken = [];
  window.__starts = 0;
  window.SpeechRecognition = class {
    start() { window.__rec = this; window.__starts++; setTimeout(() => this.onstart && this.onstart(), 0); }
    stop() { setTimeout(() => this.onend && this.onend(), 0); }
    abort() {}
  };
  window.webkitSpeechRecognition = window.SpeechRecognition;
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel() {}, speak(u) { window.__spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 10); } } });
`;

async function start(browser, { demo = false, stub = true, nospeech = false, viewport = { width: 1280, height: 860 } } = {}) {
  const ctx = await browser.newContext({ viewport });
  const p = await ctx.newPage();
  if (stub) await p.addInitScript(STUB);
  if (nospeech) await p.addInitScript(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; });
  await p.goto(URL);
  await p.getByLabel('What should we call you?').fill('Asha');
  await p.getByRole('button', { name: demo ? 'Explore with sample data' : 'Start with my own data' }).click();
  await p.getByRole('button', { name: 'Skip tour' }).click({ timeout: 6000 }).catch(() => {});
  return { ctx, p };
}
const data = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('mymoney:v1') || '{}'));
const panel = (p) => p.getByRole('dialog', { name: 'Voice assistant' });
const type = async (p, text) => { await p.getByRole('textbox', { name: 'Type a command' }).fill(text); await p.getByRole('button', { name: 'Send' }).click(); };
const reply = (p, re) => shown(panel(p).locator('.voice-line.bot', { hasText: re }).last());
/** Pretends the browser heard `text`, the way Chrome reports it. */
const hear = async (p, text) => {
  await p.waitForFunction(() => !!window.__rec);
  await p.evaluate((t) => { const r = window.__rec; r.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: t } }] }); r.onend(); }, text);
};
const tomorrowless = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// With the feature switched off (server started with VITE_FEATURE_VOICE=0 and this run with VOICE=0) the microphone and its tour tip are gone.
async function off() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const p = await ctx.newPage();
  await p.goto(URL);
  await p.getByLabel('What should we call you?').fill('Asha');
  await p.getByRole('button', { name: 'Start with my own data' }).click();
  check(await shown(p.getByRole('dialog', { name: /Quick tour/ })), 'the tour starts');
  check((await p.getByRole('button', { name: 'Voice assistant' }).count()) === 0, 'VITE_FEATURE_VOICE=0 removes the microphone button');
  check(!(await p.getByText('Meet Mitra').count()), 'and its tour tip');
  await browser.close();
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
}

(async () => {
  if (process.env.VOICE === '0') return off();
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    let { ctx, p } = await start(browser);
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));

    // ---------- the tour mentions it ----------
    {
      const c2 = await browser.newContext({ viewport: { width: 1280, height: 860 } });
      const q = await c2.newPage();
      await q.goto(URL);
      await q.getByLabel('What should we call you?').fill('Asha');
      await q.getByRole('button', { name: 'Start with my own data' }).click();
      const tip = q.getByRole('dialog', { name: /Quick tour/ });
      let found = false;
      for (let i = 0; i < 9 && !found; i++) {
        found = await tip.getByText('Meet Mitra', { exact: true }).isVisible();
        if (!found) await tip.getByRole('button', { name: 'Next', exact: true }).click({ timeout: 2000 }).catch(() => {});
      }
      check(found, 'the first-time tour has a "Meet Mitra" tip');
      if (found) {
        await q.waitForTimeout(700); // the ring glides to its target
        const ring = await q.evaluate(() => { const r = document.querySelector('.tour-ring').getBoundingClientRect(); const b = document.querySelector('[data-tour="voice"]').getBoundingClientRect(); return Math.abs(r.left - (b.left - 6)) < 4 && Math.abs(r.top - (b.top - 6)) < 4; });
        check(ring, 'its highlight sits on the microphone button');
      }
      await c2.close();
    }

    // ---------- opening ----------
    const mic = p.getByRole('button', { name: 'Voice assistant' });
    check(await shown(mic), 'the header has a Voice assistant button');
    check((await mic.boundingBox()).height >= 36, 'the button is a comfortable size to hit');
    await mic.click();
    check(await shown(panel(p)) && await shown(p.getByText('Listening...')), 'opening the panel starts listening');
    check((await p.evaluate(() => window.__starts)) === 1, 'it asked the browser to listen once');
    check(await p.getByText(/Chrome the audio goes to Google/).isVisible(), 'the panel says honestly where the audio goes');
    check((await p.locator('main .btn.primary').count()) <= 1, 'still at most one green button on the screen behind');

    // ---------- navigation ----------
    await hear(p, 'go to goals');
    check(await shown(p.getByRole('heading', { name: 'Goals', exact: true })) && await reply(p, /Opening Goals/), 'saying "go to goals" opens Goals and says so');
    check((await p.evaluate(() => window.__spoken)).some((t) => /Opening Goals/.test(t)), 'the reply is read aloud, because it was spoken');
    await type(p, 'show my notes');
    check(await shown(p.getByRole('heading', { name: 'Notes', exact: true })), 'typed commands work the same way');
    const spokenCount = (await p.evaluate(() => window.__spoken)).length;
    await type(p, 'open the dashboard');
    check((await p.evaluate(() => window.__spoken)).length === spokenCount, 'typed commands are not read aloud');

    // ---------- an expense, saved with a spoken "save" ----------
    await hear(p, 'spent 450 on swiggy yesterday');
    check(await reply(p, /Added expense of ₹450, Swiggy, yesterday, under Food & Dining/) && await shown(p.getByRole('heading', { name: 'Transactions', exact: true })), 'an expense is added and read back with its category');
    check((await data(p)).txns?.length === 0 || !(await data(p)).txns?.length, 'it is a draft: nothing is stored yet');
    check(await shown(p.getByText(/1 unsaved change/).first()), 'the Save bar shows one unsaved change');
    await hear(p, 'save');
    await p.waitForFunction(() => (JSON.parse(localStorage.getItem('mymoney:v1') || '{}').txns || []).length === 1);
    const t1 = (await data(p)).txns[0];
    check(t1.amount === 450 && t1.type === 'expense' && t1.date === tomorrowless(1) && t1.category === 'Food & Dining', 'saying "save" stores 450, expense, yesterday, Food & Dining');

    // ---------- a missing amount is asked for ----------
    await hear(p, 'add an expense for coffee');
    check(await reply(p, /How much/), 'a missing amount is asked for');
    await hear(p, 'one hundred and twenty');
    check(await reply(p, /Added expense of ₹120, Coffee/), 'the spoken answer fills the amount');
    await type(p, 'save');
    await p.waitForFunction(() => (JSON.parse(localStorage.getItem('mymoney:v1') || '{}').txns || []).length === 2);

    // ---------- income and a lakh amount ----------
    await type(p, 'got salary 1.25 lakh');
    await type(p, 'save');
    await p.waitForFunction(() => (JSON.parse(localStorage.getItem('mymoney:v1') || '{}').txns || []).some((t) => t.type === 'income' && t.amount === 125000));
    check(true, '"got salary 1.25 lakh" is stored as income of 125000');

    // ---------- changing a transaction ----------
    await type(p, 'change the amount of swiggy to 500');
    check(await reply(p, /Changed the amount to ₹500/), 'it changes the amount of a named transaction');
    await type(p, 'undo');
    check(await reply(p, /Undone/), 'undo takes the edit back');
    check((await data(p)).txns.find((t) => /swiggy/i.test(t.description)).amount === 450, 'the saved amount was never touched');

    // ---------- deleting asks first ----------
    await type(p, 'delete the coffee transaction');
    check(await reply(p, /Delete ₹120 Coffee/) && await shown(panel(p).getByRole('button', { name: 'Yes' })), 'deleting a saved transaction asks first, with Yes and No buttons');
    await type(p, 'no');
    check((await data(p)).txns.length === 3, 'no leaves it alone');
    await type(p, 'delete the coffee transaction');
    await hear(p, 'yes');
    await p.waitForFunction(() => (JSON.parse(localStorage.getItem('mymoney:v1') || '{}').txns || []).length === 2);
    check(true, 'yes deletes it');
    await type(p, 'undo');
    await p.waitForFunction(() => (JSON.parse(localStorage.getItem('mymoney:v1') || '{}').txns || []).length === 3);
    check(true, 'undo brings it back');

    // ---------- questions ----------
    await type(p, 'how much did I spend this month');
    check(await reply(p, /You spent ₹\d/), 'it answers how much was spent from the saved data');

    // ---------- notes ----------
    await type(p, 'add milk, bread and eggs to my shopping list');
    check(await reply(p, /new list called Shopping list and added Milk, Bread and Eggs/), 'a list is created when none exists');
    let notes = (await data(p)).notes || [];
    const items = (notes[0]?.blocks?.[0]?.items || []).map((i) => i.text);
    check(notes.length === 1 && notes[0].title === 'Shopping list' && items.join(',') === 'Milk,Bread,Eggs', 'the note holds Milk, Bread and Eggs as three separate items');
    await type(p, 'open my shopping list');
    check(await shown(p.getByRole('textbox', { name: 'Note title' })) && (await p.getByRole('textbox', { name: 'Note title' }).inputValue()) === 'Shopping list', 'it opens the list in the editor');
    await type(p, 'add rice to my shopping list');
    await p.waitForFunction(() => [...document.querySelectorAll('input[aria-label="To-do item"]')].some((e) => e.value === 'Rice'), null, { timeout: 5000 }).catch(() => {});
    check((await p.getByRole('textbox', { name: 'To-do item' }).evaluateAll((els) => els.map((e) => e.value))).includes('Rice'), 'an item added by voice appears in the editor that is already open');
    await type(p, 'tick off milk');
    check(await p.getByRole('checkbox', { name: 'Done: Milk' }).isChecked(), 'ticking an item by voice ticks its checkbox');
    await type(p, 'remove eggs from my shopping list');
    await p.waitForFunction(() => !(JSON.parse(localStorage.getItem('mymoney:v1') || '{}').notes?.[0]?.blocks?.[0]?.items || []).some((i) => i.text === 'Eggs'));
    check(true, 'an item can be removed by voice');
    await type(p, 'note down call the bank tomorrow');
    check((await data(p)).notes.some((n) => n.title === 'Quick notes' && /Call the bank tomorrow/.test(n.blocks[0].text)), 'a quick note goes into one "Quick notes" note');
    await type(p, 'remind me to renew insurance');
    check((await data(p)).notes.some((n) => n.title === 'Reminders' && n.blocks[0].items.some((i) => i.text === 'Renew insurance')), 'a reminder goes onto the Reminders list');

    // ---------- settings ----------
    await type(p, 'set my age to 32');
    check(await reply(p, /Change your age from 30 to 32\?/), 'changing a setting reads the old and new value back and asks');
    check((await data(p)).profile.age === 30, 'nothing changed yet');
    await panel(p).getByRole('button', { name: 'Yes' }).click();
    await p.waitForFunction(() => JSON.parse(localStorage.getItem('mymoney:v1') || '{}').profile.age === 32);
    check(true, 'pressing Yes applies it');
    await type(p, 'set my age to 400');
    check(await reply(p, /between 18 and 100/), 'an impossible value is refused with the reason');
    await type(p, 'set inflation to 6 percent');
    await type(p, 'yes');
    await p.waitForFunction(() => JSON.parse(localStorage.getItem('mymoney:v1') || '{}').overrides?.inflation === 6);
    check(true, 'an assumption can be changed by name');

    // ---------- goals ----------
    await type(p, 'add a house goal');
    await p.waitForFunction(() => (JSON.parse(localStorage.getItem('mymoney:v1') || '{}').goals || []).some((g) => g.kind === 'house'));
    await type(p, 'set house price to 80 lakh');
    await type(p, 'yes');
    await p.waitForFunction(() => (JSON.parse(localStorage.getItem('mymoney:v1') || '{}').goals || []).some((g) => g.kind === 'house' && g.price === 8000000));
    check(true, 'a goal is added and its price changed by voice');

    // ---------- theme ----------
    await type(p, 'dark mode');
    check((await p.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark', 'dark mode switches the theme');
    await type(p, 'undo');
    check((await p.evaluate(() => document.documentElement.getAttribute('data-theme'))) !== 'dark', 'undo switches it back');

    // ---------- things it should not guess at ----------
    await type(p, 'what is the weather');
    check(await reply(p, /did not understand "what is the weather"/), 'something it cannot do gets an honest answer, not a guess');
    await type(p, 'help');
    check(await reply(p, /Spent 450 on lunch yesterday/), 'help lists real examples');
    await type(p, 'open investments');
    check(await reply(p, /not available in this version|Opening/), 'a switched-off screen is declined or opened, depending on the build');

    // ---------- unsaved changes block navigation by voice ----------
    await type(p, 'spent 99 on tea');
    await type(p, 'open settings');
    check(await reply(p, /unsaved transactions/) && await shown(p.getByRole('dialog', { name: 'Save your changes before leaving?' })), 'leaving with unsaved rows still shows the Leave dialog');
    await p.getByRole('button', { name: 'Keep editing' }).click();
    if (!(await panel(p).count())) await mic.click(); // clicking in the dialog counts as clicking away, which closes the panel

    // ---------- close ----------
    await p.keyboard.press('Escape');
    check(!(await panel(p).count()) && await mic.evaluate((e) => e === document.activeElement), 'Escape closes the panel and returns focus to the button');
    check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors[0] : ''));
    await ctx.close();

    // ---------- a browser with no speech recognition ----------
    ({ ctx, p } = await start(browser, { stub: false, nospeech: true }));
    await p.getByRole('button', { name: 'Voice assistant' }).click();
    check(await shown(panel(p)) && (await panel(p).getByRole('button', { name: 'Speak' }).count()) === 0, 'without speech support there is no Speak button');
    check(await shown(p.getByText(/cannot listen, but you can type/)), 'it says why and offers typing');
    await type(p, 'go to goals');
    check(await shown(p.getByRole('heading', { name: 'Goals', exact: true })), 'typed commands still work');
    await ctx.close();

    // ---------- a phone ----------
    ({ ctx, p } = await start(browser, { viewport: { width: 390, height: 780 } }));
    const wide = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    check(!wide, 'on a phone the header, with the new button, does not scroll sideways');
    const b = await p.getByRole('button', { name: 'Voice assistant' }).boundingBox();
    check(b && b.width >= 44 && b.height >= 44, 'the button keeps the 44px tap size on a phone');
    await p.getByRole('button', { name: 'Voice assistant' }).click();
    const box = await panel(p).boundingBox();
    check(box.x >= 0 && box.x + box.width <= 390 && box.y + box.height <= 780, 'the panel fits inside the phone screen');
    await ctx.close();
    ({ ctx, p } = await start(browser, { demo: true, viewport: { width: 390, height: 780 } }));
    const dark = await p.getByRole('button', { name: 'Dark', exact: true }).boundingBox();
    check(dark && dark.x + dark.width <= 390, 'with sample data on a phone, all three theme buttons are still on screen');
    await ctx.close();
  } catch (e) {
    console.log('FAIL crashed: ' + (e && e.message));
    failed++;
  }
  await browser.close();
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();

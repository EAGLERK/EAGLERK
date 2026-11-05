// The Notes tab: text, tables and to-do lists, saved as you type. Checked in a real browser.
// Usage: APP_URL=http://localhost:5173/ npm run e2e:notes   (server started with the Supabase values blanked)
const { chromium } = require('playwright');
const { seed } = require('./fixtures/demo.cjs');
const URL = process.env.APP_URL || 'http://localhost:5173/';
// The Investments and Plan tabs exist only in a build with investing switched on (INVESTING=1).
const TABS = process.env.INVESTING === '1' ? 7 : 5;

let failed = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) failed++; };
const shown = (loc, t = 5000) => loc.waitFor({ timeout: t }).then(() => true, () => false);

async function start(browser, opts = {}, demo = false) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, ...opts });
  const p = await ctx.newPage();
  await p.goto(URL);
  if (demo) await seed(p);
  else {
    await p.getByLabel('What should we call you?').fill('Asha');
    await p.getByRole('button', { name: 'Get started' }).click();
  }
  await p.getByRole('button', { name: 'Skip tour' }).click({ timeout: 6000 }).catch(() => {});
  return { ctx, p };
}
const nav = (p, name) => p.getByRole('navigation').getByRole('button', { name, exact: true }).click();
const stored = (p) => p.evaluate(() => (JSON.parse(localStorage.getItem('mymoney:v1') || '{}').notes) || []);

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    let { ctx, p } = await start(browser);
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));

    // ---------- the tab and an empty start ----------
    check((await p.getByRole('navigation').getByRole('button', { name: 'Notes', exact: true }).count()) >= 1, 'Notes is in the navigation');
    await nav(p, 'Notes');
    check(await shown(p.getByRole('heading', { name: 'Notes', exact: true })) && await shown(p.getByText('No notes yet.')), 'a new account sees an empty Notes screen that says what it is for');
    check((await p.locator('main .btn.primary').count()) === 1, 'New note is the only green button');
    await p.getByRole('button', { name: 'New note' }).click();
    const choices = await p.getByRole('group', { name: 'Choose a starting point' }).getByRole('button').allInnerTexts();
    check(choices.length === 3 && /Things to buy/.test(choices[0]) && /Things to sell/.test(choices[1]) && /Blank note/.test(choices[2]), 'it offers three starting points: things to buy, things to sell, blank');

    // ---------- a to-do list with checkboxes ----------
    await p.getByRole('button', { name: /^Things to buy/ }).click();
    check(await shown(p.getByRole('textbox', { name: 'Note title' })) && (await p.getByRole('textbox', { name: 'Note title' }).inputValue()) === 'Things to buy', 'things to buy opens an editor titled "Things to buy"');
    const items = p.getByRole('textbox', { name: 'To-do item' });
    await items.first().fill('Milk');
    await items.first().press('Enter');
    check((await items.count()) === 2 && await items.nth(1).evaluate((e) => e === document.activeElement), 'Enter adds a new item below and moves the cursor into it');
    await items.nth(1).fill('Laptop bag');
    await p.getByRole('button', { name: 'Add item' }).click();
    await items.nth(2).fill('Shoes');
    check((await items.count()) === 3, 'Add item adds one more');
    await p.getByRole('checkbox', { name: 'Done: Milk' }).check();
    check(await p.getByRole('checkbox', { name: 'Done: Milk' }).isChecked() && (await items.first().evaluate((e) => getComputedStyle(e).textDecorationLine)) === 'line-through', 'ticking a checkbox marks the item done and strikes it through');
    check(await p.getByText('1 of 3 done').first().isVisible(), 'the list counts what is done (1 of 3)');
    await items.nth(2).fill('');
    await items.nth(2).press('Backspace');
    check((await items.count()) === 2 && await items.nth(1).evaluate((e) => e === document.activeElement), 'Backspace on an empty item removes it and goes back to the one above');
    await p.getByRole('button', { name: 'Clear completed' }).click();
    check((await items.count()) === 1 && (await items.first().inputValue()) === 'Laptop bag', 'Clear completed removes the ticked items');
    await p.locator('.toast-btn', { hasText: 'Undo' }).click();
    check((await items.count()) === 2, 'and Undo brings them back');

    // ---------- text and a table ----------
    await p.getByRole('button', { name: 'Text', exact: true }).click();
    const text = p.getByRole('textbox', { name: 'Note text' });
    check(await shown(text) && await text.evaluate((e) => e === document.activeElement), 'Add Text opens a text box with the cursor in it');
    const before = await text.evaluate((e) => e.getBoundingClientRect().height);
    await text.fill('Check price history first.\nWait for the festival sale.\nAsk Raj about the warranty.\nCompare two shops.\nPay by card for the offer.\nKeep the bill.');
    check(await text.evaluate((e, h) => e.getBoundingClientRect().height > h, before), 'the text box grows as you type');
    await p.getByRole('button', { name: 'Table', exact: true }).click();
    const tableBlock = p.locator('section.block[aria-label="Table"]');
    check(await shown(tableBlock) && (await tableBlock.locator('tbody tr').count()) === 3 && (await tableBlock.locator('thead input').count()) === 3, 'Add Table gives a table with three columns and three rows');
    await tableBlock.getByRole('textbox', { name: 'Column 1 name' }).fill('Item');
    await tableBlock.getByRole('textbox', { name: 'Column 3 name' }).fill('Price');
    await tableBlock.getByRole('textbox', { name: 'Item, row 1' }).fill('Phone');
    await tableBlock.getByRole('textbox', { name: 'Price, row 1' }).fill('8,000');
    await tableBlock.getByRole('textbox', { name: 'Item, row 2' }).fill('Table');
    await tableBlock.getByRole('textbox', { name: 'Price, row 2' }).fill('3,500');
    check(await shown(tableBlock.getByText('Total Price: ₹11,500')), 'a column of numbers gets a total (₹11,500), written in any Indian format');
    await tableBlock.getByRole('button', { name: 'Add row' }).click();
    await tableBlock.getByRole('button', { name: 'Add column' }).click();
    check((await tableBlock.locator('tbody tr').count()) === 4 && (await tableBlock.locator('thead input').count()) === 4, 'Add row and Add column work');
    await tableBlock.getByRole('button', { name: 'Remove column 4' }).click();
    await tableBlock.getByRole('button', { name: 'Remove row 4' }).click();
    check((await tableBlock.locator('tbody tr').count()) === 3 && (await tableBlock.locator('thead input').count()) === 3, 'rows and columns can be removed again');

    // ---------- order, removing, undo ----------
    const kinds = () => p.locator('section.block').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    check(JSON.stringify(await kinds()) === JSON.stringify(['To-do list', 'Text', 'Table']), 'blocks are in the order they were added');
    await p.getByRole('button', { name: 'Move table up' }).click();
    check(JSON.stringify(await kinds()) === JSON.stringify(['To-do list', 'Table', 'Text']), 'Move up reorders the blocks');
    await p.getByRole('button', { name: 'Remove text' }).click();
    check(JSON.stringify(await kinds()) === JSON.stringify(['To-do list', 'Table']), 'Remove takes a block out');
    await p.locator('.toast-btn', { hasText: 'Undo' }).click();
    check(JSON.stringify(await kinds()) === JSON.stringify(['To-do list', 'Table', 'Text']) && (await p.getByRole('textbox', { name: 'Note text' }).inputValue()).startsWith('Check price history'), 'Undo puts it back in the same place with its words');

    // ---------- saves as you type ----------
    await p.waitForTimeout(700);
    check(((await stored(p))[0]?.blocks || []).length === 3 && (await p.getByText('Saved', { exact: true }).isVisible()), 'it saves by itself shortly after typing and says Saved');
    await p.getByRole('textbox', { name: 'Note title' }).fill('Home shopping');
    await p.getByRole('button', { name: 'All notes' }).click(); // straight away, before the delay has passed
    await p.waitForTimeout(100);
    check((await stored(p))[0]?.title === 'Home shopping', 'leaving the editor straight after typing still saves the last change');
    const card = p.getByRole('button', { name: 'Open Home shopping' });
    check(await shown(card) && /1 of 2 done · 1 table · \d+ words/.test(await card.innerText()), 'the list card summarises it: "1 of 2 done · 1 table · N words"');
    await p.reload();
    await p.waitForTimeout(400);
    await nav(p, 'Notes');
    await p.getByRole('button', { name: 'Open Home shopping' }).click();
    check((await p.getByRole('textbox', { name: 'To-do item' }).count()) === 2 && (await p.getByRole('checkbox', { name: 'Done: Milk' }).isChecked()) && (await p.locator('section.block[aria-label="Table"]').getByRole('textbox', { name: 'Price, row 2' }).inputValue()) === '3,500', 'after a reload the note is exactly as it was');

    // ---------- deleting a note ----------
    await p.getByRole('button', { name: 'Delete note' }).click();
    check(await shown(p.getByText('Home shopping deleted')) && (await stored(p)).length === 0, 'Delete note removes it with a toast');
    await p.locator('.toast-btn', { hasText: 'Undo' }).click();
    check((await stored(p)).length === 1 && (await stored(p))[0].blocks.length === 3, 'Undo brings the whole note back');

    // ---------- the other starting points ----------
    await p.getByRole('button', { name: 'New note' }).click();
    await p.getByRole('button', { name: /^Things to sell/ }).click();
    check(await shown(p.locator('section.block[aria-label="Table"]').getByRole('textbox', { name: 'Column 2 name' })) && (await p.locator('section.block[aria-label="Table"]').getByRole('textbox', { name: 'Column 2 name' }).inputValue()) === 'Asking price (₹)', 'things to sell starts as a table with item, asking price and status');
    await p.getByRole('button', { name: 'All notes' }).click();
    await p.getByRole('button', { name: 'New note' }).click();
    await p.getByRole('button', { name: /^Blank note/ }).click();
    check(await p.getByRole('textbox', { name: 'Note title' }).evaluate((e) => e === document.activeElement) && (await p.getByRole('textbox', { name: 'Note text' }).count()) === 1, 'a blank note puts the cursor in the title and starts with a text box');
    check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await ctx.close();

    // ---------- sample data comes with two example notes ----------
    ({ ctx, p } = await start(browser, {}, true));
    await nav(p, 'Notes');
    check(await shown(p.getByRole('button', { name: 'Open Things to buy' })) && await shown(p.getByRole('button', { name: 'Open Things to sell' })), 'the sample-data account has example notes to look at');
    await ctx.close();

    // ---------- phone ----------
    ({ ctx, p } = await start(browser, { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true }));
    check((await p.locator('.tabbar .tab').count()) === TABS && (await p.locator('.tabbar').getByRole('button', { name: 'Notes' }).count()) === 1, `phone: the tab bar has ${TABS} tabs including Notes`);
    await p.locator('.tabbar').getByRole('button', { name: 'Notes' }).click();
    await p.getByRole('button', { name: 'New note' }).click();
    await p.getByRole('button', { name: /^Things to buy/ }).click();
    await p.getByRole('textbox', { name: 'To-do item' }).first().fill('Milk');
    await p.getByRole('button', { name: 'Table', exact: true }).click();
    const small = await p.evaluate(() => [...document.querySelectorAll('main .cell-input, main .todo-box, main button, main input[type=checkbox]')].filter((e) => e.getBoundingClientRect().height > 0 && getComputedStyle(e).visibility !== 'hidden').map((e) => ({ n: (e.getAttribute('aria-label') || e.innerText || e.className).toString().slice(0, 24), h: Math.round((e.type === 'checkbox' ? e.closest('label') || e : e).getBoundingClientRect().height) })).filter((x) => x.h < 44));
    check(small.length === 0, 'phone: every control in the editor is at least 44px tall' + (small.length ? ` (${JSON.stringify(small.slice(0, 4))})` : ''));
    check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'phone: the page does not scroll sideways (a wide table scrolls inside its own card)');
    await ctx.close();
  } finally {
    await browser.close();
  }
  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('test run crashed:', e.stack); process.exit(2); });

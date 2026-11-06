// Builds design-system/tokens.css and design-system/index.html (the living style guide) from design-system/tokens.json.
// Usage: npm run design:build
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildCss, contrast, dimensionVars, loadTokens, resolve, semanticColors, shadowCss } from '../design-system/lib.mjs';

const T = loadTokens();
const colors = semanticColors(T);
const by = Object.fromEntries(colors.map((c) => [c.name.replace(/^color\./, ''), c]));
const measured = JSON.parse(readFileSync(new URL('../design-system/measured.json', import.meta.url), 'utf8'));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

writeFileSync(new URL('../design-system/tokens.css', import.meta.url), buildCss(T));

/* ---------- pieces ---------- */
const swatch = (hex) => `<span class="sw" style="background:linear-gradient(${hex},${hex}),#171717"></span>`;

const primitives = Object.entries(T.primitive.color).map(([ramp, steps]) => {
  const flat = ramp === 'data' ? Object.entries(steps).flatMap(([n, m]) => Object.entries(m).map(([mode, v]) => [`${n}.${mode}`, v])) : Object.entries(steps);
  return `<div class="ramp"><h4>${ramp}</h4><div class="chips">${flat.map(([k, v]) => `<div class="chip" title="primitive.color.${ramp}.${k}"><span class="sw lg" style="background:linear-gradient(${v.$value},${v.$value}),${ramp === 'alpha' ? '#171717' : 'transparent'}"></span><b>${k}</b><code>${esc(v.$value)}</code></div>`).join('')}</div></div>`;
}).join('');

const semRows = colors.map((c) => `<tr><td><b>${c.name}</b><div class="d">${esc(c.description)}</div></td><td><code>${c.css ?? ''}</code></td><td>${swatch(c.light)}<code>${esc(c.light)}</code><div class="d">${esc(c.lightRef.replace(/[{}]/g, '').replace('primitive.color.', ''))}</div></td><td>${swatch(c.dark)}<code>${esc(c.dark)}</code><div class="d">${esc(c.darkRef.replace(/[{}]/g, '').replace('primitive.color.', ''))}</div></td></tr>`).join('');

const PAIRS = [
  ['text.primary', 'surface.page', 4.5], ['text.primary', 'surface.raised', 4.5], ['text.primary', 'surface.muted', 4.5],
  ['text.secondary', 'surface.page', 4.5], ['text.secondary', 'surface.muted', 4.5], ['text.muted', 'surface.page', 4.5], ['text.muted', 'surface.raised', 4.5], ['text.muted', 'surface.muted', 4.5], ['text.muted', 'surface.sidebar', 4.5],
  ['accent.on-accent', 'accent.default', 4.5], ['accent.text', 'surface.page', 4.5], ['accent.text', 'surface.muted', 4.5],
  ['status.good-text', 'status.good-bg', 4.5], ['status.bad-text', 'status.bad-bg', 4.5], ['status.watch-text', 'status.watch-bg', 4.5], ['status.on-danger', 'status.danger', 4.5],
  ['border.strong', 'surface.raised', 3], ['accent.default', 'surface.page', 3], ['data.series-1', 'surface.raised', 3], ['data.series-2', 'surface.raised', 3], ['data.series-3', 'surface.raised', 3], ['data.series-4', 'surface.raised', 3], ['data.series-5', 'surface.raised', 3],
];
const cell = (a, b, min, mode) => { const r = contrast(by[a][mode], by[b][mode]); return `<td class="${r >= min ? 'ok' : 'bad'}">${r.toFixed(2)} ${r >= min ? 'pass' : 'FAIL'}</td>`; };
const contrastRows = PAIRS.map(([a, b, min]) => `<tr><td>${a} <span class="d">on</span> ${b}</td><td>${min}:1</td>${cell(a, b, min, 'light')}${cell(a, b, min, 'dark')}</tr>`).join('');

const space = Object.entries(T.primitive.space).map(([k, v]) => `<div class="row"><code>space.${k}</code><span class="bar" style="width:${v.$value}"></span><span>${v.$value}</span></div>`).join('');
const radius = Object.entries(T.primitive.radius).map(([k, v]) => `<div class="rad"><span style="border-radius:${v.$value}"></span><code>radius.${k}</code><span>${v.$value}</span></div>`).join('');
const elevation = [['control', 'xs'], ['card', 'sm'], ['overlay', 'md'], ['tour', 'lg']].map(([role, k]) => `<div class="elev"><span style="box-shadow:${shadowCss(T.primitive.shadow[k].$value)}"></span><code>elevation.${role}</code><span class="d">primitive.shadow.${k}</span></div>`).join('');
const sizes = Object.entries(T.primitive.size).map(([k, v]) => `<tr><td><code>size.${k}</code></td><td>${v.$value}</td></tr>`).join('');

const TYPE = [['page-title', 'page title (h1)', 'Transactions'], ['title-card', 'card title (h2)', 'Cash flow'], ['figure-hero', 'hero figure', '₹1,20,520'], ['figure', 'summary figure', '₹7,000/mo'], ['body', 'body / paragraph', 'Everything you earned and spent, from statements or added by hand.'], ['label', 'field label', 'Amount (₹)'], ['meta', null, 'Includes rent and EMIs'], ['caption', null, 'Nov  Dec  Jan']];
const typeRows = TYPE.map(([k, probe, sample]) => {
  const t = T.semantic.type[k].$value; const fs = resolve(T, t.fontSize); const fw = resolve(T, t.fontWeight);
  const m = probe ? measured.elements.desktop[probe] : null;
  return `<tr><td><code>type.${k}</code><div class="d">${esc(T.semantic.type[k].$description)}</div></td><td><div class="spec" style="font-size:${fs};font-weight:${fw};line-height:${t.lineHeight};letter-spacing:${t.letterSpacing}">${esc(sample)}</div></td><td>${fs} / ${fw} / lh ${t.lineHeight} / ls ${t.letterSpacing}${m ? `<div class="d">measured: ${m.fs} / ${m.fw} / ${m.lh} / ${m.ls}</div>` : '<div class="d">not measured (no stable element)</div>'}</td></tr>`;
}).join('');

const motionRows = Object.entries(T.semantic.motion).map(([k, v]) => `<tr><td><code>motion.${k}</code></td><td>${esc(v.$description)}</td><td>${esc(resolve(T, v.duration))}</td><td>${esc(resolve(T, v.easing))}</td><td>${esc(v.properties)}</td><td>${esc(v.reducedMotion)}</td></tr>`).join('');

const ico = (d) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const specimens = () => `
  <div class="grp"><h4>Buttons</h4><div class="wrap">
    <button class="btn primary">${ico('M12 5v14M5 12h14')}Add transaction</button><button class="btn">Import</button><button class="btn small">Sync now</button><button class="btn ghost">Ghost</button>
    <button class="btn danger">${ico('M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3')}Remove</button><button class="btn danger-solid">Erase all data</button><button class="btn" disabled>Disabled</button><button class="btn icon" aria-label="Add">${ico('M12 5v14M5 12h14')}</button></div></div>
  <div class="grp"><h4>Badges and status</h4><div class="wrap"><span class="badge">Neutral</span><span class="badge good">On</span><span class="badge watch">Estimate</span><span class="badge bad">Over</span><span class="badge info">Info</span></div></div>
  <div class="grp"><h4>Callouts</h4><div class="stack">
    <div class="callout good"><span class="ic" aria-hidden="true">✓</span><div>All goals fit inside your surplus with ₹11,121 a month to spare.</div></div>
    <div class="callout watch"><span class="ic" aria-hidden="true">!</span><div>Your goals need more than you have left over.</div></div>
    <div class="callout bad" role="alert"><span class="ic" aria-hidden="true">✕</span><div>I could not read that sheet.</div></div>
    <div class="callout info"><span class="ic" aria-hidden="true">i</span><div>Loan rates differ by lender.</div></div></div></div>
  <div class="grp"><h4>Fields and segmented control</h4><div class="wrap top">
    <label class="field"><span>Amount (₹)</span><input value="450" /></label>
    <label class="field"><span>Category</span><select><option>Food &amp; Dining</option></select></label>
    <div class="pill-toggle" role="group" aria-label="Range"><button aria-pressed="true">6 months</button><button aria-pressed="false">12 months</button></div></div></div>
  <div class="grp"><h4>Card and summary card</h4><div class="wrap top">
    <section class="card cardspec"><div class="card-head"><div class="card-titles"><h2>Cash flow</h2><div class="sub">Left over, last 6 months</div></div></div><div class="bigfig num">₹4,04,680</div></section>
    <section class="card sumcard feature cardspec"><div class="body"><div class="head"><span class="icon-tile">${ico('M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2zM16 14h2')}</span><div><div class="title">Left over</div><div class="subtitle">Nov 2026 · income minus spend</div></div></div><div class="big num">₹1,20,520<span class="dpill good">✓ 96% saved</span></div></div><button class="foot">See where it went ${ico('M5 12h14M13 6l6 6-6 6')}</button></section></div></div>
  <div class="grp"><h4>Toast</h4><div class="wrap"><div class="toast"><span>Added 4 transactions from Google Sheet · Household.</span><button class="toast-btn">Undo</button></div></div></div>`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>MyMoney design system</title>
<link rel="stylesheet" href="../src/styles.css"><link rel="stylesheet" href="tokens.css">
<style>
 body{margin:0;background:var(--page);color:var(--text)}
 main.ds{max-width:1180px;margin:0 auto;padding:32px 24px 96px;display:flex;flex-direction:column;gap:40px}
 .ds h1{font-size:30px;letter-spacing:-.02em;margin:0}.ds h2{font-size:22px;margin:0 0 4px;letter-spacing:-.01em}.ds h3{font-size:16px;margin:0 0 8px}.ds h4{font-size:13px;margin:0 0 8px;color:var(--text-muted);font-weight:500;text-transform:none}
 .ds section.s{display:flex;flex-direction:column;gap:16px}.ds p{margin:0;color:var(--text-2);max-width:72ch}
 .ds code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:var(--text-2)} .d{font-size:12px;color:var(--text-muted)}
 .ds table{border-collapse:collapse;width:100%;font-size:13px}.ds th{text-align:left;font-weight:500;color:var(--text-muted);padding:8px 12px 8px 0;border-bottom:1px solid var(--border)}.ds td{padding:10px 12px 10px 0;border-bottom:1px solid var(--border);vertical-align:top}
 td.ok{color:var(--good-text)} td.bad{color:var(--bad-text);font-weight:500}
 .sw{display:inline-block;width:16px;height:16px;border-radius:4px;border:1px solid var(--border);vertical-align:-3px;margin-right:6px}.sw.lg{display:block;width:100%;height:40px;margin:0 0 6px;border-radius:6px}
 .ramp{margin-bottom:12px}.chips{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:10px}.chip{display:flex;flex-direction:column;font-size:12px}.chip b{font-weight:500}
 .two{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:900px){.two{grid-template-columns:1fr}}
 .theme{border:1px solid var(--border);border-radius:var(--r-xl);padding:24px;display:flex;flex-direction:column;gap:20px}.theme>h3{margin:0}
 .grp{display:flex;flex-direction:column}.wrap{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.wrap.top{align-items:flex-start}.stack{display:flex;flex-direction:column;gap:8px}
 .cardspec{width:300px}.row{display:grid;grid-template-columns:120px auto 1fr;gap:12px;align-items:center;margin-bottom:6px}.bar{display:block;height:12px;background:var(--accent);border-radius:3px}
 .rad{display:flex;align-items:center;gap:10px;margin-bottom:8px}.rad>span:first-child{display:block;width:44px;height:44px;border:1.5px solid var(--text-muted)}
 .elev{display:flex;align-items:center;gap:14px;margin:6px 0 18px}.elev>span:first-child{display:block;width:96px;height:56px;border-radius:var(--r-xl);background:var(--surface)}
 .tw{overflow-x:auto} .spec{white-space:pre-wrap}.note{border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:var(--r-md);padding:12px 16px;background:var(--surface-2)}
</style></head><body><main class="ds">
<header class="s"><h1>MyMoney design system</h1><p>Written from the running app, not for it: every value below comes from <code>src/styles.css</code>, <code>src/motion/index.ts</code> or a measurement of the real elements (<code>design-system/measured.json</code>, ${measured.measuredAt}). Source of truth: <code>design-system/tokens.json</code>. Rebuild this page with <code>npm run design:build</code>; <code>tests/tokens.test.ts</code> fails if the tokens and the stylesheet disagree.</p>
<div class="note"><b>Direction.</b> Calm, neutral, trustworthy. One accent (mint green) that means "do this" and "this is on"; status colours that always come with a word or icon; hairline borders and small shadows; the system font; 44px touch targets; one primary button per screen.</div></header>

<section class="s"><h2>Colour: primitives</h2><p>The raw palette. Product code never reads these; semantic tokens point at them.</p>${primitives}</section>

<section class="s"><h2>Colour: semantic</h2><p>What code reads. Light and dark are two settings of the same names. Columns show the CSS variable the app uses, then each theme's resolved value and the primitive it points at.</p>
<div class="tw"><table><thead><tr><th>Token</th><th>CSS variable</th><th>Light</th><th>Dark</th></tr></thead><tbody>${semRows}</tbody></table></div></section>

<section class="s"><h2>Colour: contrast, measured</h2><p>WCAG 2.x ratios computed from the token values, unrounded, translucent colours composited first. Text needs 4.5:1; control boundaries and chart graphics need 3:1. Failures are real and are listed in the README as findings.</p>
<div class="tw"><table><thead><tr><th>Pair</th><th>Needs</th><th>Light</th><th>Dark</th></tr></thead><tbody>${contrastRows}</tbody></table></div></section>

<section class="s"><h2>Typography</h2><p>One family, the system stack. Three weights (400, 500, 600). Figures use tabular numbers and Indian digit grouping.</p>
<div class="tw"><table><thead><tr><th>Role</th><th>Specimen</th><th>Token values, then measured in the app</th></tr></thead><tbody>${typeRows}</tbody></table>
<p class="d">Font stack: <code>${esc(T.primitive.font.family.system.$value)}</code></p></section>

<section class="s"><h2>Space, radius, elevation, size</h2><div class="two"><div><h3>Space</h3>${space}<p class="d">A 4px-based scale. Raw values in the stylesheet that are not on it (6, 10, 14, 20, 28) are listed in the README.</p></div><div><h3>Radius</h3>${radius}</div></div>
<div class="two"><div><h3>Elevation</h3>${elevation}</div><div><h3>Sizes</h3><div class="tw"><table><tbody>${sizes}</tbody></table></div><p class="d">Controls are 36px with a mouse, 44px on touch and phones (<code>--control</code>). Breakpoints: ${T.primitive.breakpoint['phone-max'].$value} and ${T.primitive.breakpoint['tablet-max'].$value} (max-width).</p></div></div></section>

<section class="s"><h2>Components, in both themes</h2><p>The app's real classes and stylesheet, rendered statically. Hover, press and focus come from script and the browser, so they are described in the README and not shown here.</p>
<div class="two"><div class="theme ds-light"><h3>Light</h3>${specimens()}</div><div class="theme ds-dark"><h3>Dark</h3>${specimens()}</div></div></section>

<section class="s"><h2>Motion</h2><p>All animation is GSAP through one module. Presets are named by job.</p><div class="tw"><table><thead><tr><th>Preset</th><th>Used for</th><th>Duration</th><th>Easing</th><th>Properties</th><th>Reduced motion</th></tr></thead><tbody>${motionRows}</tbody></table></div></section>
</main></body></html>
`;
writeFileSync(new URL('../design-system/index.html', import.meta.url), html);
// A single self-contained copy for sharing (the repo copy links the app's stylesheet by path). Git-ignored: it lives in dist-single/.
mkdirSync(new URL('../dist-single/', import.meta.url), { recursive: true });
const inline = html
  .replace('<link rel="stylesheet" href="../src/styles.css">', `<style>${readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')}</style>`)
  .replace('<link rel="stylesheet" href="tokens.css">', `<style>${buildCss(T)}</style>`);
writeFileSync(new URL('../dist-single/design-system.html', import.meta.url), inline);
console.log(`design-system/tokens.css and index.html written (${colors.length} semantic colours, ${dimensionVars(T).length} dimension variables)`);

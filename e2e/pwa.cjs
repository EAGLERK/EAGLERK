// Installable and offline: the manifest, icons, service worker and phone settings of the built app, checked in a real browser.
// Also pretends to be the Android app (a stand-in for Capacitor's native bridge) to check the app uses the phone's recogniser there.
// Builds the app with the Supabase values blanked, serves it on port 4176 and tests it. Usage: npm run e2e:pwa
const { spawn, execSync } = require('node:child_process');
const { seed } = require('./fixtures/demo.cjs');
const { chromium } = require('playwright');

const PORT = 4176;
const URL = `http://localhost:${PORT}/`;
let failed = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shown = (loc, t = 8000) => loc.waitFor({ timeout: t }).then(() => true, () => false);
const stop = (proc) => { try { process.kill(-proc.pid, 'SIGTERM'); } catch { /* gone */ } };


// A stand-in for what the Android shell injects: the bridge, the plugin's method list, and a recogniser that "hears" a sentence.
const NATIVE_SHIM = `
  window.__calls = [];
  const pending = new Map(); // callbackId -> { resolve } or { callback }
  let next = 1;
  const post = (pluginId, methodName, options, entry) => {
    const callbackId = String(next++);
    pending.set(callbackId, entry);
    window.__calls.push({ method: methodName, options });
    window.androidBridge.postMessage(JSON.stringify({ callbackId, pluginId, methodName, options }));
    return callbackId;
  };
  window.Capacitor = {
    PluginHeaders: [{ name: 'SpeechRecognition', methods: [...['available', 'start', 'stop', 'isListening', 'checkPermissions', 'requestPermissions', 'getSupportedLanguages', 'removeAllListeners', 'removeListener'].map((name) => ({ name, rtype: 'promise' })), { name: 'addListener', rtype: 'callback' }] }],
    // What the Android shell's native-bridge.js provides to Capacitor's web code.
    nativePromise: (pluginId, methodName, options) => new Promise((resolve, reject) => post(pluginId, methodName, options, { resolve, reject })),
    nativeCallback: (pluginId, methodName, options, callback) => post(pluginId, methodName, options, { callback }),
    fromNative(result) {
      const e = pending.get(result.callbackId);
      if (!e) return;
      if (e.callback) { e.callback(result.data); return; }
      pending.delete(result.callbackId);
      result.success ? e.resolve(result.data) : e.reject(result.error);
    },
  };
  // The phone side: answers each call, and "hears" a sentence when listening starts.
  window.androidBridge = { postMessage(raw) {
    const m = JSON.parse(raw);
    const reply = (data) => setTimeout(() => window.Capacitor.fromNative({ callbackId: m.callbackId, success: true, data }), 0);
    if (m.pluginId !== 'SpeechRecognition') return reply({});
    if (m.methodName === 'available') return reply({ available: true });
    if (m.methodName === 'checkPermissions' || m.methodName === 'requestPermissions') return reply({ speechRecognition: 'granted' });
    if (m.methodName === 'addListener') { (window.__listeners ||= {})[m.options.eventName] = m.callbackId; return; }
    if (m.methodName === 'start') {
      reply({});
      const fire = (name, data) => window.Capacitor.fromNative({ callbackId: window.__listeners[name], data });
      setTimeout(() => fire('partialResults', { matches: ['go to'] }), 50);
      setTimeout(() => fire('partialResults', { matches: ['go to goals'] }), 100);
      setTimeout(() => fire('listeningState', { status: 'stopped' }), 150);
      return;
    }
    return reply({});
  } };
`;

(async () => {
  let server, browser;
  try {
    execSync('npx vite build --logLevel error', { stdio: 'inherit', env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' } });
    if (await fetch(URL).then(() => true, () => false)) throw new Error(`port ${PORT} is already in use`);
    server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
    for (let i = 0; i < 40; i++) { if (await fetch(URL).then((r) => r.ok, () => false)) break; await sleep(300); }

    // ---------- the files ----------
    const mres = await fetch(`${URL}manifest.webmanifest`);
    const m = await mres.json();
    check(mres.ok && m.name === 'MyMoney' && m.display === 'standalone' && m.start_url && m.scope, 'the manifest names the app and opens it full screen');
    check(m.icons.some((i) => i.sizes === '192x192') && m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any') && m.icons.some((i) => i.purpose === 'maskable'), 'it has 192, 512 and maskable icons');
    let iconsOk = true;
    for (const i of [...m.icons, { src: 'apple-touch-icon.png' }]) {
      const r = await fetch(URL + i.src);
      if (!r.ok || !/image\//.test(r.headers.get('content-type') || '')) { iconsOk = false; console.log('  missing', i.src); }
    }
    check(iconsOk, 'every icon in the manifest, and the iPhone icon, can be fetched');
    check(m.shortcuts?.length >= 2, 'long-pressing the home-screen icon offers Add transaction and Notes');
    const sw = await (await fetch(`${URL}sw.js`)).text();
    check(/const CACHE = 'mymoney-[a-z0-9]+'/.test(sw) && !sw.includes('__BUILD__'), 'the service worker has a cache name unique to this build');
    check(!/supabase|api\.anthropic/.test(sw.replace(/\/\*[\s\S]*?\*\//g, '')), 'and its code does not mention any sign-in, sync or AI service');

    browser = await chromium.launch();
    const ctx = await browser.newContext({ locale: 'en-IN', viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(URL);

    // ---------- the page head ----------
    const head = await p.evaluate(() => ({
      manifest: !!document.querySelector('link[rel=manifest]'),
      apple: !!document.querySelector('link[rel=apple-touch-icon]'),
      themes: document.querySelectorAll('meta[name=theme-color]').length,
      cover: /viewport-fit=cover/.test(document.querySelector('meta[name=viewport]').content),
      zoomLocked: /user-scalable=no|maximum-scale=1\b/.test(document.querySelector('meta[name=viewport]').content),
    }));
    check(head.manifest && head.apple && head.themes === 2 && head.cover, 'the page links the manifest, the iPhone icon, light and dark theme colours, and fills the notch area');
    check(!head.zoomLocked, 'pinch-zoom is not switched off (it is an accessibility feature)');

    // ---------- the service worker ----------
    const ready = await p.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; }).catch(() => false);
    check(ready, 'the service worker registers and becomes active');
    await seed(p);
    await p.getByRole('button', { name: 'Skip tour' }).click({ timeout: 6000 }).catch(() => {});
    await p.reload();
    await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 8000 }).catch(() => {});
    check(await p.evaluate(() => !!navigator.serviceWorker.controller), 'after a reload the service worker controls the page');
    await p.waitForTimeout(1500); // let the page's scripts land in the cache

    // ---------- offline ----------
    await ctx.setOffline(true);
    await p.reload();
    check(await shown(p.getByRole('heading', { name: /Hi, Asha/ })), 'with no connection the app still opens, with the person\'s own data');
    await p.getByRole('navigation').getByRole('button', { name: 'Goals', exact: true }).click();
    check(await shown(p.getByRole('heading', { name: 'Goals', exact: true })), 'and the screens still work');
    await ctx.setOffline(false);

    // ---------- install card and phone settings ----------
    await p.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click();
    check(await shown(p.getByRole('heading', { name: 'Use MyMoney as an app' })), 'Settings explains how to install it');
    check(await p.getByText(/Install app|Add to Home/).first().isVisible(), 'and says what to tap in this browser');
    const sizes = await p.evaluate(() => [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]), select, textarea')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => parseFloat(getComputedStyle(e).fontSize)));
    check(sizes.length > 0 && sizes.every((s) => s >= 16), `every field on a phone is 16px or more, so iPhones do not zoom in (${sizes.length} checked)`);
    check(await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.tabbar')).paddingBottom) >= 6), 'the tab bar leaves room for the home indicator');
    check(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'no sideways scroll on a phone');
    check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors[0] : ''));
    await ctx.close();

    // ---------- pretending to be the Android app ----------
    const nctx = await browser.newContext({ locale: 'en-IN', viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
    await nctx.addInitScript(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; });
    await nctx.addInitScript(NATIVE_SHIM);
    const n = await nctx.newPage();
    const nerrors = [];
    n.on('pageerror', (e) => nerrors.push(e.message));
    await n.goto(URL);
    check(!(await n.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)), 'inside the app no service worker is registered');
    await n.getByLabel('What should we call you?').fill('Asha');
    await n.getByRole('button', { name: 'Get started' }).click();
    await n.getByRole('button', { name: 'Skip tour' }).click({ timeout: 6000 }).catch(() => {});
    await n.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click();
    check(await shown(n.getByRole('heading', { name: 'Quick tour' })) && !(await n.getByRole('heading', { name: 'Use MyMoney as an app' }).count()), 'inside the app there is no "install" card');
    await n.getByRole('button', { name: /Ask Mitra/ }).click();
    check(await shown(n.getByRole('button', { name: 'Speak', exact: true })), 'Mitra offers the microphone even though the web view has no speech recognition');
    // Opening the panel starts listening by itself; the phone "hears" the sentence.
    check(await shown(n.getByRole('heading', { name: 'Goals', exact: true }), 6000), 'what the phone hears ("go to goals") is understood and acted on');
    const calls = await n.evaluate(() => window.__calls.map((c) => c.method));
    check(['available', 'checkPermissions', 'start'].every((m) => calls.includes(m)), 'through the real plugin glue: it checked the recogniser and the permission, then started');
    const start = await n.evaluate(() => window.__calls.find((c) => c.method === 'start').options);
    check(start.language === 'en-IN' && start.partialResults === true && start.popup === false, 'in English (India), streaming, without the system pop-up');
    check(nerrors.length === 0, 'no page errors in the app shell' + (nerrors.length ? ': ' + nerrors[0] : ''));
    await nctx.close();
  } catch (e) {
    console.log('FAIL crashed: ' + (e && e.message));
    failed++;
  }
  try { await browser?.close(); } catch { /* closed */ }
  if (server) stop(server);
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();

// Builds the app into one self-contained HTML file: dist-single/eaglerk.html
// Usage: npm run build:single
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

execSync('npx vite build --base ./', { stdio: 'inherit' });

const assets = join('dist', 'assets');
const files = readdirSync(assets);
const js = files.filter((f) => f.endsWith('.js'));
if (js.length !== 1) throw new Error(`expected one JS chunk, found ${js.length}`);
const css = files.filter((f) => f.endsWith('.css'));

const jsText = readFileSync(join(assets, js[0]), 'utf8');
// A literal closing script tag inside the bundle would end the inline script early.
if (/<\/script/i.test(jsText)) throw new Error('bundle contains a closing script tag; cannot inline safely');

let html = readFileSync(join('dist', 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet"[^>]*>/g, '');
html = html.replace(/<script type="module"[^>]*><\/script>/g, '');
// Function replacers: a plain string would treat `$'` and `$&` inside the minified bundle as replacement patterns.
const cssText = css.map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
html = html.replace('</head>', () => `<style>${cssText}</style>\n</head>`);
html = html.replace('</body>', () => `<script type="module">${jsText}</script>\n</body>`);

mkdirSync('dist-single', { recursive: true });
writeFileSync(join('dist-single', 'eaglerk.html'), html);
console.log(`dist-single/eaglerk.html  ${(html.length / 1024).toFixed(0)} kB`);

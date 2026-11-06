// Reads design-system/tokens.json (DTCG format) and turns it into things other tools need: resolved values, CSS variables and contrast maths.
// Plain JavaScript so both the build script (node) and the tests (vitest) can use it.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const TOKENS_PATH = fileURLToPath(new URL('./tokens.json', import.meta.url));
export const loadTokens = () => JSON.parse(readFileSync(TOKENS_PATH, 'utf8'));

const get = (T, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), T);

/** Follows `{a.b.c}` references until a plain value is left. */
export function resolve(T, value) {
  let v = value;
  for (let i = 0; i < 10 && typeof v === 'string' && /^\{[^}]+\}$/.test(v); i++) {
    const node = get(T, v.slice(1, -1));
    if (!node) throw new Error(`Unknown token reference ${v}`);
    v = node.$value;
  }
  return v;
}

/** Every semantic colour with its CSS variable name and its resolved light and dark value. */
export function semanticColors(T) {
  const out = [];
  for (const [group, tokens] of Object.entries(T.semantic.color)) {
    for (const [name, t] of Object.entries(tokens)) {
      const ext = t.$extensions?.mymoney ?? {};
      out.push({ name: `color.${group}.${name}`, group, short: name, css: ext.css, description: t.$description ?? '', light: resolve(T, t.$value), dark: resolve(T, ext.dark ?? t.$value), lightRef: t.$value, darkRef: ext.dark ?? t.$value });
    }
  }
  return out;
}

/** A DTCG shadow (list of layers) as the CSS box-shadow string. */
export const shadowCss = (layers) => layers.map((l) => `${l.offsetX} ${l.offsetY} ${l.blur} ${l.spread} ${l.color}`).join(', ');

/** Collapses spacing and trailing zeros so "0px" and "0" compare equal. */
export const norm = (s) => String(s).toLowerCase().replace(/#([0-9a-f])([0-9a-f])([0-9a-f])\b/g, '#$1$1$2$2$3$3').replace(/\s+/g, ' ').replace(/\b0px\b/g, '0').replace(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/g, (_, r, g, b, a) => `rgb(${r} ${g} ${b} / ${Number(a)})`).replace(/\/ (\d*\.?\d+)\)/g, (_, a) => `/ ${Number(a)})`).trim();

/* ---------- colour maths (WCAG 2.x) ---------- */

export function parseColor(s) {
  const t = s.trim().toLowerCase();
  let m = t.match(/^#([0-9a-f]{6})$/);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 };
  m = t.match(/^rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)\s*(?:[,/]\s*([\d.]+)\s*)?\)$/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  throw new Error(`Cannot read colour ${s}`);
}
/** Puts a colour with alpha on top of an opaque background. */
export function over(fg, bg) {
  const f = parseColor(fg), b = parseColor(bg);
  const mix = (x, y) => Math.round(x * f.a + y * (1 - f.a));
  return `#${[mix(f.r, b.r), mix(f.g, b.g), mix(f.b, b.b)].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}
const lin = (c) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
export const luminance = (h) => { const c = parseColor(h); return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b); };
/** Contrast ratio, unrounded. A translucent foreground is composited over `bg` first. */
export function contrast(fg, bg) {
  const f = parseColor(fg).a < 1 ? over(fg, bg) : fg;
  const [hi, lo] = [luminance(f), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

/* ---------- CSS output ---------- */

const cssName = (path) => `--ds-${path.replace(/\./g, '-')}`;

/** Non-colour tokens as `--ds-*` variables. They are prefixed so they can sit beside the app's own variables without clashing. */
export function dimensionVars(T) {
  const lines = [];
  const walk = (obj, path) => {
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === 'object' && '$value' in v) {
        const val = resolve(T, v.$value);
        if (v.$type === 'shadow') lines.push(`${cssName([...path, k].join('.'))}: ${shadowCss(val)};`);
        else if (v.$type === 'fontFamily' || v.$type === 'dimension' || v.$type === 'duration' || v.$type === 'fontWeight') lines.push(`${cssName([...path, k].join('.'))}: ${val};`);
        else if (typeof val === 'string' && path[0] === 'easing') lines.push(`${cssName([...path, k].join('.'))}: ${val};`);
      } else if (v && typeof v === 'object' && !k.startsWith('$')) walk(v, [...path, k]);
    }
  };
  walk({ space: T.primitive.space, radius: T.primitive.radius, size: T.primitive.size, shadow: T.primitive.shadow, duration: T.primitive.duration, breakpoint: T.primitive.breakpoint, font: T.primitive.font }, []);
  return lines;
}

/** Variables that styles.css builds from others on :root. A fixed scope has to rebuild them itself, or it inherits the root theme's resolved colours. */
export const DERIVED = {
  light: ['--ring-soft: color-mix(in srgb, var(--accent) 35%, transparent);', '--feature-bg: linear-gradient(180deg, color-mix(in srgb, var(--accent) 9%, var(--surface)), var(--surface) 75%);', '--feature-border: var(--border);'],
  dark: ['--ring-soft: color-mix(in srgb, var(--accent) 35%, transparent);', '--feature-bg: linear-gradient(180deg, color-mix(in srgb, var(--accent) 12%, var(--surface)), var(--surface) 75%);', '--feature-border: var(--border);'],
};

/** tokens.css: the colour variables under the same names styles.css uses, for light, dark (by device and by switch) and two scopes for side-by-side display. */
export function buildCss(T) {
  const colors = semanticColors(T).filter((c) => c.css);
  const decl = (mode) => colors.map((c) => `  ${c.css}: ${c[mode]};`).join('\n');
  const dims = dimensionVars(T).map((l) => `  ${l}`).join('\n');
  return `/* GENERATED by \`npm run design:build\` from design-system/tokens.json. Do not edit by hand.
   Colours use the same variable names as src/styles.css (the app itself still reads styles.css; tests/tokens.test.ts keeps the two equal).
   Everything else is prefixed --ds- so it cannot clash. */
:root {
  color-scheme: light;
${decl('light')}
${dims}
}
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme='light'])) {
    color-scheme: dark;
${decl('dark').replace(/^/gm, '  ')}
  }
}
:root[data-theme='dark'] {
  color-scheme: dark;
${decl('dark')}
}
/* Fixed scopes, so one page can show both themes at once. */
.ds-light { color-scheme: light; background: var(--page); color: var(--text);
${decl('light')}
${DERIVED.light.map((l) => `  ${l}`).join('\n')}
}
.ds-dark { color-scheme: dark; background: var(--page); color: var(--text);
${decl('dark')}
${DERIVED.dark.map((l) => `  ${l}`).join('\n')}
}
`;
}

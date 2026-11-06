import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCss, contrast, DERIVED, loadTokens, norm, resolve, semanticColors, shadowCss } from '../design-system/lib.mjs';

const T = loadTokens();
const css = readFileSync('src/styles.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''); // comments out, so they cannot end up in a selector
const motion = readFileSync('src/motion/index.ts', 'utf8');
const colors = semanticColors(T);
const byName = Object.fromEntries(colors.map((c) => [c.name, c]));

/** Custom properties declared in the blocks of styles.css that set the theme: light (:root), dark by device, dark by switch. */
function declarations() {
  const light: Record<string, string> = {};
  const darkDevice: Record<string, string> = {};
  const darkSwitch: Record<string, string> = {};
  const stack: string[] = [];
  let buf = '';
  for (const ch of css) {
    if (ch === '{') { stack.push(buf.trim()); buf = ''; continue; }
    if (ch === '}') {
      const sel = stack.pop() ?? '';
      const target = sel === ':root' && stack.length === 0 ? light : sel === ":root[data-theme='dark']" ? darkSwitch : sel === ":root:where(:not([data-theme='light']))" && stack.some((s) => s.includes('prefers-color-scheme: dark')) ? darkDevice : null;
      if (target) for (const m of buf.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) target[m[1]] = m[2].trim();
      buf = '';
      continue;
    }
    buf += ch;
  }
  return { light, darkDevice, darkSwitch };
}
const decl = declarations();

describe('tokens.json is well formed', () => {
  it('every reference resolves and every semantic colour has a light and a dark value', () => {
    expect(colors.length).toBeGreaterThan(25);
    for (const c of colors) {
      expect(c.light, c.name).toMatch(/^(#[0-9a-f]{6}|rgba?\()/i);
      expect(c.dark, c.name).toMatch(/^(#[0-9a-f]{6}|rgba?\()/i);
    }
  });
  it('semantic colours use primitives, never raw values', () => {
    for (const c of colors) {
      expect(c.lightRef, c.name).toMatch(/^\{primitive\.color\./);
      expect(c.darkRef, c.name).toMatch(/^\{primitive\.color\./);
    }
  });
  it('names follow category.role.variant and are unique', () => {
    expect(new Set(colors.map((c) => c.name)).size).toBe(colors.length);
    for (const c of colors) expect(c.name, c.name).toMatch(/^color\.[a-z]+\.[a-z0-9-]+$/);
  });
  it('no brand words in semantic names', () => {
    for (const c of colors) expect(c.name).not.toMatch(/mint|green-brand|mymoney/i);
  });
});

describe('tokens.json and src/styles.css agree (this is what keeps them from drifting)', () => {
  it('every semantic colour has the same light value as the :root block', () => {
    for (const c of colors.filter((x) => x.css)) expect(norm(decl.light[c.css!]), `${c.css} light`).toBe(norm(c.light));
  });
  it('and the same dark value in both dark blocks (device and switch)', () => {
    for (const c of colors.filter((x) => x.css)) {
      const want = norm(c.dark);
      expect(norm(decl.darkDevice[c.css!] ?? decl.light[c.css!]), `${c.css} dark (device)`).toBe(want);
      expect(norm(decl.darkSwitch[c.css!] ?? decl.light[c.css!]), `${c.css} dark (switch)`).toBe(want);
    }
  });
  it('the two dark blocks declare the same variables', () => {
    const ignore = new Set(['color-scheme']);
    const a = Object.keys(decl.darkDevice).filter((k) => !ignore.has(k)).sort();
    const b = Object.keys(decl.darkSwitch).filter((k) => !ignore.has(k)).sort();
    expect(a).toEqual(b);
  });
  it('radius, shadow and control sizes match', () => {
    const r = T.primitive.radius;
    expect(decl.light['--r-sm']).toBe(r.sm.$value);
    expect(decl.light['--r-md']).toBe(r.md.$value);
    expect(decl.light['--r-lg']).toBe(r.lg.$value);
    expect(decl.light['--r-xl']).toBe(r.xl.$value);
    expect(norm(decl.light['--shadow-xs'])).toBe(norm(shadowCss(T.primitive.shadow.xs.$value)));
    expect(norm(decl.light['--shadow-sm'])).toBe(norm(shadowCss(T.primitive.shadow.sm.$value)));
    expect(decl.light['--tap']).toBe(T.primitive.size.tap.$value);
    expect(decl.light['--control']).toBe(T.primitive.size['control-default'].$value);
    expect(css).toContain(`--control: ${T.primitive.size['control-touch'].$value}`);
    expect(css).toContain(`--control: ${T.primitive.size['control-mouse'].$value}`);
    expect(css).toContain(T.primitive.font.family.system.$value.replace(/"/g, "'"));
  });
  it('the overlay and tour shadows are the ones the stylesheet uses', () => {
    expect(norm(css)).toContain(norm(shadowCss(T.primitive.shadow.md.$value)));
    expect(norm(css)).toContain(norm(shadowCss(T.primitive.shadow.lg.$value)));
  });
  it('every colour variable styles.css declares is a token, or is on the shrinking list of leftovers', () => {
    const covered = new Set(colors.map((c) => c.css));
    // Derived or unused. Remove an entry when its variable is deleted from styles.css; never add one.
    const leftovers = new Set(['--feature-a', '--feature-b', '--feature-bg', '--feature-border', '--glow', '--radius', '--ring-soft', '--side-active-bg', '--side-active-fg', '--side-active-ring', '--shadow-xs', '--shadow-sm', '--r-sm', '--r-md', '--r-lg', '--r-xl', '--font', '--tap', '--control']);
    const loose = Object.keys(decl.light).filter((k) => !covered.has(k) && !leftovers.has(k));
    expect(loose).toEqual([]);
    for (const k of leftovers) expect(Object.keys(decl.light).includes(k) || k === '--tap' || k === '--control', `${k} is gone from styles.css: delete it from this list`).toBe(true);
  });
});

describe('motion tokens match src/motion/index.ts', () => {
  const dur = Object.fromEntries([...motion.match(/export const DUR = \{([^}]*)\}/)![1].matchAll(/(\w+):\s*([\d.]+)/g)].map((m) => [m[1], Number(m[2])]));
  it('durations', () => {
    const d = T.primitive.duration;
    expect(parseFloat(d.instant.$value)).toBe(dur.press);
    expect(parseFloat(d.micro.$value)).toBe(dur.hover);
    expect(parseFloat(d.enter.$value)).toBe(dur.enter);
    expect(parseFloat(d.exit.$value)).toBe(dur.exit);
    expect(parseFloat(d.route.$value)).toBe(dur.route);
    expect(parseFloat(d.cascade.$value)).toBe(dur.cascade);
  });
  it('easings', () => {
    const e = T.primitive.easing;
    expect(motion).toContain(`out: '${e.out.$value}'`);
    expect(motion).toContain(`in: '${e.in.$value}'`);
    expect(motion).toContain(`settle: '${e.settle.$value}'`);
  });
  it('an exit is shorter than its enter', () => {
    expect(parseFloat(T.primitive.duration.exit.$value)).toBeLessThanOrEqual(parseFloat(T.primitive.duration.enter.$value));
  });
});

describe('generated CSS', () => {
  it('rebuilds the derived variables exactly as styles.css does, for each theme', () => {
    expect(norm(decl.light['--feature-bg'])).toBe(norm(DERIVED.light[1].replace('--feature-bg: ', '').replace(/;$/, '')));
    expect(norm(decl.darkSwitch['--feature-bg'])).toBe(norm(DERIVED.dark[1].replace('--feature-bg: ', '').replace(/;$/, '')));
    expect(norm(decl.light['--ring-soft'])).toBe(norm(DERIVED.light[0].replace('--ring-soft: ', '').replace(/;$/, '')));
    expect(norm(decl.light['--feature-border'])).toBe('var(--border)');
  });
  it('declares every colour in light and dark and keeps the app\'s variable names', () => {
    const out = buildCss(T);
    for (const c of colors.filter((x) => x.css)) {
      expect(out).toContain(`${c.css}: ${c.light};`);
      expect(out).toContain(`${c.css}: ${c.dark};`);
    }
    expect(out).toMatch(/--ds-space-md: 12px;/);
    expect(out).toMatch(/--ds-shadow-sm: 0 1px 3px 0 rgb\(0 0 0 \/ 0\.1\), 0 1px 2px -1px rgb\(0 0 0 \/ 0\.1\);/);
  });
});

/* ---------- accessibility, measured ---------- */

type Mode = 'light' | 'dark';
const val = (name: string, mode: Mode) => byName[`color.${name}`][mode];
const ratio = (fg: string, bg: string, mode: Mode) => contrast(val(fg, mode), val(bg, mode));

const TEXT_PAIRS: Array<[string, string]> = [
  ['text.primary', 'surface.page'], ['text.primary', 'surface.raised'], ['text.primary', 'surface.muted'],
  ['text.secondary', 'surface.page'], ['text.secondary', 'surface.raised'], ['text.secondary', 'surface.muted'],
  ['text.muted', 'surface.page'], ['text.muted', 'surface.raised'], ['text.muted', 'surface.muted'], ['text.muted', 'surface.sidebar'],
  ['accent.on-accent', 'accent.default'], ['accent.text', 'surface.page'], ['accent.text', 'surface.raised'], ['accent.text', 'surface.muted'],
  ['status.good-text', 'status.good-bg'], ['status.bad-text', 'status.bad-bg'], ['status.watch-text', 'status.watch-bg'], ['status.on-danger', 'status.danger'],
  ['text.primary', 'status.info-bg'], ['status.good-text', 'surface.raised'], ['status.bad-text', 'surface.raised'], ['status.watch-text', 'surface.raised'],
];

describe('accessibility: contrast of every text pairing, measured, in both themes (WCAG AA 4.5:1, unrounded)', () => {
  for (const mode of ['light', 'dark'] as Mode[]) {
    it(`${mode}: all text pairs reach 4.5:1`, () => {
      const failing = TEXT_PAIRS.filter(([fg, bg]) => ratio(fg, bg, mode) < 4.5).map(([fg, bg]) => `${fg} on ${bg} ${ratio(fg, bg, mode).toFixed(2)}`);
      expect(failing).toEqual([]);
    });
  }
});

describe('accessibility: non-text contrast (WCAG 1.4.11, 3:1)', () => {
  // Known failures, measured. This list may only shrink: fixing one makes its test fail until the entry is removed.
  const KNOWN: Record<Mode, string[]> = {
    light: ['border.strong on surface.raised', 'data.series-3 on surface.raised', 'data.series-4 on surface.raised', 'data.series-5 on surface.raised'],
    dark: ['border.strong on surface.raised'],
  };
  const PAIRS: Array<[string, string]> = [
    ['border.strong', 'surface.raised'], ['accent.default', 'surface.page'], ['accent.default', 'surface.raised'],
    ...[1, 2, 3, 4, 5].map((i) => [`data.series-${i}`, 'surface.raised'] as [string, string]),
  ];
  for (const mode of ['light', 'dark'] as Mode[]) {
    it(`${mode}: exactly the known pairs fall below 3:1`, () => {
      const failing = PAIRS.filter(([a, b]) => ratio(a, b, mode) < 3).map(([a, b]) => `${a} on ${b}`);
      expect(failing.sort()).toEqual([...KNOWN[mode]].sort());
    });
  }
  it('the known failures are what the README says they are', () => {
    expect(ratio('border.strong', 'surface.raised', 'light')).toBeCloseTo(1.48, 2);
    expect(ratio('border.strong', 'surface.raised', 'dark')).toBeCloseTo(1.76, 2);
  });
  it('a resolved primitive is what the semantic token says', () => {
    expect(resolve(T, '{primitive.color.mint.700}')).toBe('#0d7a4e');
  });
});

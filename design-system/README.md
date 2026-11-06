# MyMoney design system

This documents the look the app already has. Nothing in it is new: every value comes from `src/styles.css`, `src/motion/index.ts`, or a measurement of the running app (`measured.json`). Where the app is inconsistent or fails a check, that is listed as a finding, not hidden.

| File | What it is |
|---|---|
| `tokens.json` | The tokens, in the [Design Tokens Community Group](https://tr.designtokens.org/format/) format. **Source of truth for values.** |
| `tokens.css` | Generated CSS variables for light and dark. For other surfaces (a landing page, a docs site). The app itself still reads `src/styles.css`. |
| `index.html` | Living style guide: swatches, measured contrast, type, space, components in both themes, motion. Open it through the dev server: `/design-system/index.html`. |
| `measured.json` | Computed styles of the real elements at 1280 and 390 wide (type, height, padding, radius, shadow). |
| `lib.mjs` | Reads the tokens, resolves references, builds the CSS, does the contrast maths. |
| `../tests/tokens.test.ts` | **Keeps `tokens.json` and `src/styles.css` equal** (every colour in light, dark by device and dark by switch; radius, shadows, control sizes, motion durations and easings) and runs the contrast checks. If someone edits one and not the other, the test fails. |

```bash
npm run design:build     # regenerates tokens.css and index.html
npm run design:measure   # re-measures the app (needs the dev server on :5173 with Supabase blanked); rewrites measured.json
npx vitest run tests/tokens.test.ts
```

## Architecture

Two layers, as many as the app needs and no more.

1. **Primitive** (`primitive.*`): the raw palette and scales. Only semantic tokens read colour primitives. Product code does not.
   - Colour ramps named by hue and lightness: `neutral` (0 to 950), `mint` (the accent family), `green`, `red`, `amber`, `blue` (status and info), `alpha` (white at 8, 10 and 18 percent, for dark-mode borders), `data` (five chart hues, each with a light and a dark value).
   - `space`, `radius`, `size`, `font`, `shadow`, `breakpoint`, `duration`, `easing`.
2. **Semantic** (`semantic.*`): what code reads. Named by purpose, `category.role.variant`.
   - `color.surface.*`, `color.text.*`, `color.border.*`, `color.accent.*`, `color.status.*`, `color.data.*`. Each has a light value and a dark value (`$extensions.mymoney.dark`) and the name of the CSS variable the app uses (`$extensions.mymoney.css`).
   - `type.*` (composite typography), `elevation.*`, `motion.*` (presets by job).

There is no component layer. No component themes apart from the others today, so none is needed.

**Naming rules:** by purpose, not appearance (`color.text.muted`, not `color.grey-500`); one word per idea (`muted` for quiet text, `raised` for lifted surfaces); no brand words in semantic names (the accent is `accent`, not `mint`); every surface that carries text has a foreground token and the pair is contrast-tested.

**Not tokenised on purpose:** `0`, `100%`, `auto`, `currentColor`; one-off layout values (the showcase height, the voice orb size); the five Google brand colours on the Google button (mandated by Google); values that depend on content.

### Three kinds of change

- **Change a value** (say the accent): edit `tokens.json` and `src/styles.css` together. `tests/tokens.test.ts` fails until they match. Then `npm run design:build`.
- **Add a token:** add it to `tokens.json` with a purpose in `$description`; if it is a colour, give it a `css` name and a dark value. Use it in CSS as `var(--name)`.
- **Never** put a raw hex, `rgb()` or a px value in a component rule when a token exists.

## Colour

Light and dark are two settings of the same semantic names. Dark follows the device and has a remembered manual switch.

| Token | CSS variable | Light | Dark |
|---|---|---|---|
| `color.surface.page` / `shell` / `panel` | `--page` / `--shell` / `--panel` | #ffffff | #0a0a0a |
| `color.surface.raised` | `--surface` | #ffffff | #171717 |
| `color.surface.muted` | `--surface-2` | #f5f5f5 | #262626 |
| `color.surface.sidebar` | `--sidebar-bg` | #fafafa | #0f0f0f |
| `color.text.primary` | `--text` | #0a0a0a | #fafafa |
| `color.text.secondary` | `--text-2` | #525252 | #d4d4d4 |
| `color.text.muted` | `--text-muted` | #666666 | #a3a3a3 |
| `color.border.default` | `--border` | #e5e5e5 | white at 10 percent |
| `color.border.strong` | `--axis` | #d4d4d4 | white at 18 percent |
| `color.border.grid` | `--grid` | #e5e5e5 | white at 8 percent |
| `color.accent.default` | `--accent` | #0d7a4e | #34d399 |
| `color.accent.on-accent` | `--accent-ink` | #ffffff | #04130c |
| `color.accent.text` | `--accent-text` | #0d7a4e | #4fd1a1 |
| `color.status.good-text` / `good-bg` | `--good-text` / `--good-bg` | #006300 / #e6f3e6 | #4cc24c / #17301a |
| `color.status.bad-text` / `bad-bg` | `--bad-text` / `--bad-bg` | #b02a2a / #fbe9e9 | #ff8a8a / #3a1c1c |
| `color.status.watch-text` / `watch-bg` | `--watch-text` / `--watch-bg` | #8a5a00 / #fdf1d6 | #f0b84a / #352b12 |
| `color.status.info-bg` | `--info-bg` | #e9f0fa | #14253b |
| `color.status.danger` / `on-danger` | `--danger` / `--danger-ink` | #c93535 / #ffffff | same |
| `color.data.series-1` to `5` | `--s1` to `--s5` | blue #2a78d6, orange #eb6834, aqua #1baf7a, yellow #eda100, magenta #e87ba4 | #3987e5, #d95926, #199e70, #c98500, #d55181 |

**Rules the app follows:** one accent, used for "do this" (primary button), "this is on" and focus; status colour is never the only signal (always an icon or a word beside it); data colours carry meaning and keep it (series 1 needs, 2 wants, 3 investing); the dark page has one faint mint glow at the top right (`--glow`).

## Type

One family, the system stack: `system-ui, -apple-system, 'Segoe UI', sans-serif`. No web font to load, which suits offline use. Figures use tabular numbers and Indian digit grouping (₹1,25,430), with lakh and crore forms on charts.

| Role | Size / weight / line-height / tracking | Measured in the app |
|---|---|---|
| `type.page-title` | 24 / 600 / 1.2 / -0.02em | 24px, 28.8px |
| `type.title-card` | 16 / 600 / 1.1 | 16px, 17.6px |
| `type.figure-hero` | 36 / 600 / 1.5 / -0.02em | 36px, 54px (desktop, three summary cards) |
| `type.figure` | 30 / 600 / 1.5 / -0.02em | 30px, 45px |
| `type.body` | 14 / 400 / 1.5 | 14px, 21px |
| `type.label` | 14 / 500 / 1.5 | 14px, 21px |
| `type.meta` | 13 / 400 / 1.5 | not measured |
| `type.caption` | 12 / 400 / 1.4 | not measured (chart ticks) |

On touch screens every field is 16px so iPhones do not zoom in (measured).

## Space, shape, elevation, size

- **Space** `2xs 2 · xs 4 · sm 8 · md 12 · lg 16 · xl 24 · 2xl 32`. Cards pad 24px (16px on phones); sections sit 24px apart; card grids 16px.
- **Radius** `sm 6` small bars and chips · `md 8` buttons, inputs, tabs, sidebar rows · `lg 10` alerts, dialogs, toasts · `xl 14` cards · `full 999` badges and bars.
- **Elevation** `control` (shadow xs) on outline buttons and inputs · `card` (sm) on cards and the active segment · `overlay` (md) on dialogs, popovers and toasts · `tour` (lg) on the tour popover · `focus-ring`: the border turns accent and a 3px ring of accent at 35 percent appears. Depth is a hairline border plus a small shadow; dark mode relies on the border.
- **Size** controls are 36px with a mouse, 40px as the base, 44px on phones and touch (`--control`); `--tap` is 44px. Breakpoints: 599px (phone) and 899px (tablet), both `max-width`.

## Motion

All animation is GSAP through `src/motion/index.ts`; the app has no CSS transitions or keyframes. Presets are named by job; durations and easings are tested against that file.

| Preset | Used for | Duration | Easing | Properties | Reduced motion |
|---|---|---|---|---|---|
| `motion.instant` | Press: buttons and choices scale to 0.97, sidebar rows 0.985, tabs 0.94 | 0.12s | power3.out | transform | skipped |
| `motion.micro` | Hover tint (`--hv`), mouse only | 0.16s | power1.out | `--hv` | skipped |
| `motion.enter` | Toast in, popovers | 0.22s | power3.out | opacity, transform | skipped |
| `motion.exit` | Toast out | 0.16s | power2.in | opacity, transform | removed at once |
| `motion.overlay` | Dialog in (scale 0.97, y 12) and backdrop | 0.22s | power3.out | opacity, transform, `--bd` | skipped |
| `motion.release` | Press release with a small settle | 0.22s | back.out(2) | transform | skipped |
| `motion.route` | Screen change | 0.2s | power1.out | opacity only | skipped |
| `motion.cascade` | Summary cards, 0.06s stagger, once per visit | 0.32s | power1.out | opacity | skipped |
| `motion.follow` | Tour ring glides to the next target | 0.3s | power3.out | position and size | jumps |
| `motion.loader` | Mitra listening: ring breathes, five bars | 0.8s | sine.inOut | `--pulse`, transform | still ring, still bars |

Rules: animate only transform and opacity (the tour ring is the one exception); exits are no longer than enters; routine surfaces do not overshoot; nothing on navigation or rows animates on entry except the route fade.

## Components

The canonical components and what each is for. Classes are in `src/styles.css`; React wrappers are in `src/components/ui.tsx` and `feedback.tsx`. The style guide (`index.html`) shows every one in both themes.

| Component | Job | Variants | Notes |
|---|---|---|---|
| **Button** `.btn` | An action | `primary` (green, **one per screen**, beside the page title) · outline (default) · `small` · `ghost` · `danger` (outline red) · `danger-solid` (inside confirm dialogs only) · `icon` | 36px desktop, 44px touch; 8px radius; 14px / 500; press scales; focus ring. Disabled buttons ignore hover. |
| **Field** `.field` | A labelled input, select or textarea | text, number, date, select, password (eye toggle inside the field) | Label above, hint below; 36px; 16px on touch; labels are real `<label>`s. |
| **Segmented control** `.pill-toggle` | Pick one of a few (chart range, Chart or Table, theme) | with or without icons | Muted track, raised active segment, `aria-pressed`. 32px desktop, 44px touch. |
| **Card** `.card` | A group of related content | plain · summary (`.sumcard`) · stat | Title and description header with an action on the right; optional footer link with a top hairline. |
| **Badge** `.badge` and **Delta** | A short status | neutral · good · watch · bad · info | Always has words; deltas add an arrow. |
| **Callout** `.callout` | A message inside a screen | good · watch · bad (`role="alert"`) · info | Tinted fill plus an icon character. |
| **Toast** `.toast` | Confirm an action | with or without **Undo** | Live region, not focus-stealing; Undo toasts last 6s, others 4s. |
| **Dialog** `dialog.modal` | A decision that needs attention | confirm · leave-without-saving · connect-a-sheet · welcome | Native modal (focus trapped, Escape cancels). Destructive confirms focus Cancel first. Used instead of the browser's `confirm()`. |
| **Popover** `.notif-panel` | Notifications and Mitra | | Outside click and Escape close it; focus returns to the trigger. |
| **Table** `.table` | Rows of data | desktop table · phone cards (`.cards`) | Hairline rows, muted heads; on phones each row becomes a stacked card with labels. |
| **Empty state** `.card.hero` | A screen with nothing yet | | Title, one sentence, one or two actions. |
| **Tour popover** `.tour-pop` | First-time tips | | Spotlight ring plus arrow. |

State precedence for interactive components, strongest first: disabled, focus, pressed, hover, selected, rest. Hover is skipped on touch.

## What was measured, and findings

Measured on 2026-11-06 with `npm run design:measure` (computed styles of the real elements) and by arithmetic on the token values. "Counts" are `grep` counts over `src/styles.css`. These are the inconsistencies and failures a migration would deal with. **None has been changed** (see the offer at the end).

**Accessibility (WCAG 2.x, unrounded; enforced by `tests/tokens.test.ts`, which lists the known failures and may only shrink)**

- All 22 text pairings reach 4.5:1 in both themes. The lowest: `text.muted` on `surface.muted` 5.27:1 (light), `accent.text` on `surface.muted` 4.93:1 (light).
- **F1. Control borders are too faint.** `border.strong` (used on inputs and outline buttons) is 1.48:1 on a white card in light mode and 1.76:1 in dark; WCAG 1.4.11 asks 3:1 for control boundaries. This is the shadcn-style look the app chose, so it is a trade-off, not an accident. *Measured option, not applied:* light #949494 reaches 3.03:1 on white (but 2.78:1 on #f5f5f5, so inputs on muted fills still fall short); dark white at 33 percent reaches 3.03:1 on #171717 (2.92:1 on the page). The hairline `border.default` on cards is decorative and is not tested.
- **F2. Chart series 3, 4 and 5 are under 3:1 on white** in light mode: aqua 2.82, yellow 2.17, magenta 2.69. Series 3 is the *investing* colour in the category bars. Mitigations that exist: every bar has a text label and amount, and charts have a table alternative. Series 1 and 2 pass.

**Consistency**

- **F3. Button padding differs by variant.** Outline buttons measure `0 14px`, primary `8px 16px`; heights match (36px) so only the label widths differ, by 4px.
- **F4. Card titles are tight.** `h2` is 16px with a 17.6px line-height (1.1). A title that wraps to two lines will crowd.
- **F5. Small text.** Badges in the phone header are 11px; chart ticks are 12px (the `caption` role).
- **F6. Raw colours outside the token blocks.** 35 distinct colour literals (roughly half are black or white with a shadow or overlay alpha): the older toast colours (#151a17, #f2f4f3, #7fe0b4, overridden later by the shadcn-style block, so effectively dead), the 3D showcase backdrops (#f4faf6, #dcefe4, #cfe6da and the dark #23352c, #18251f, #131c18), `#fff` seven times, and black or white shadow alphas. Five more are the Google brand colours (keep). **92 inline `style={{…}}` objects** in the screens, mostly margins.
- **F7. Dead tokens.** `--feature-b` and `--radius` are never read; `--feature-a` is read by one rule that a later rule overrides. The stylesheet also contains earlier rules that the shadcn-style block overrides.
- **F8. Spacing off the scale.** Raw pixel values in padding, margin and gap: 12 (51 uses), 8 (48), 16 (47), 10 (30), 4 (29), 6 (26), 14 (21), 2 (19), 24 (14), 20 (13), 28 (4), plus smaller counts (18 ×6, 3 ×5, 9 ×5, 22 ×2 and singles). 6, 10 and 14 are each 2px from two scale steps, so merging them is a choice, not arithmetic; 20 and 28 are 4px from the nearest step.
- **F9. Weights beyond the three tokens.** 600 (24 uses), 500 (22), 650 (10), 550 (4), 700 (2), 400 (1 explicit). 550 and 650 only render distinctly if the platform's system font is variable; on others they snap to a neighbour.
- **F10. Radius literals** outside the scale: 2, 3, 4, 5, 12, 16 and 18px (progress bars, chat bubbles, the toast's older rule). 999px appears 16 times and is a token (`radius.full`).
- **F11. Mouse controls are 36px** (touch is 44px). WCAG 2.2's minimum is 24px, so this passes, but it is below the 44px the app uses elsewhere; the choice is deliberate.

## Using the tokens

```css
/* in the app: use the existing variables */
.my-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-xl); box-shadow: var(--shadow-sm); }

/* on another surface: load tokens.css and use the same names, plus --ds-* for the rest */
@import url('design-system/tokens.css');
.banner { padding: var(--ds-space-lg); border-radius: var(--ds-radius-xl); color: var(--text); background: var(--surface-2); }
```

For Figma or another design tool, import `tokens.json` with any DTCG-aware plugin (the file is plain JSON). Colour tokens carry a light and a dark value under `$extensions.mymoney`; a tool that wants "modes" should create a Light and a Dark mode and read each one.

## Offer: migrating the app onto the tokens

Not started. Sized from the counts above, in the order I would do it:

1. **Delete dead rules and tokens** (F7): small, no visual change.
2. **Replace the raw colours** (F6) with tokens: 35 literals (the Google colours stay), no visible change except the showcase backdrops, which would become two new tokens.
3. **Add `--space-*` variables** and move the 92 inline styles and the common padding and gap values onto them (F8): the largest piece; each change is checked by a before and after pixel diff at 390 and 1280.
4. **Decide F1 and F2** with a designer: they change how the app looks.

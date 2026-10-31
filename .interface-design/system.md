# MyMoney design system

Written from `src/styles.css` and the tested UI rules on 2026-10-31. If this file and the CSS disagree, the CSS is right; fix this file.

## Direction

**Personality:** Sophistication & Trust, with warmth. A personal-money app people open on a phone, often once a day, to see what is left.

**Foundation:** neutral grey-green. Page `#e6eaed`, white shell, `#f3f5f5` panel, white cards. Dark mode follows the system and has a manual switch.

**Depth:** borders first (1px `--border`, 8% black), one soft shadow only on the chart tooltip. One gradient is allowed: the green "feature" card (`--feature-a` to `--feature-b`) and the brand mark. Do not add more.

## Tokens

### Spacing
Base 4px, in practice 4, 8, 12, 16, 20 (card padding), 22 (panel side padding). Page rhythm is a 20px gap between blocks, 16px between summary cards.

### Colors (light / dark in `:root`, `:root[data-theme='dark']`)
```
--text #0b0b0b          --text-2 #52514e       --text-muted #6d6b66
--surface #fff          --surface-2 #f0f2f2    --panel #f3f5f5    --page #e6eaed
--accent #0d7a4e        --accent-text #0d7a4e  --accent-ink #fff
--good-text #006300     --bad-text #b02a2a     --watch-text #8a5a00
--good-bg #e6f3e6       --bad-bg #fbe9e9       --watch-bg #fdf1d6  --info-bg #e9f0fa
--danger #c93535
chart series --s1 blue #2a78d6, --s2 orange #eb6834, --s3 aqua #1baf7a, --s4 yellow #eda100, --s5 magenta #e87ba4
```
Status is never colour alone: always an icon or label next to it (check, cross, "short by").
Blue marks needs, orange marks wants, green marks investing in the spending bars.

### Radius
Pills for buttons, badges and toggles (999px). 8px inputs, 10px callouts and table header ends, 12px icon tiles, 14px stacked table cards, 18px cards, 22px panel, 28px shell.

### Typography
System font stack (`system-ui, -apple-system, 'Segoe UI', sans-serif`). Headline figures 30px / 650 with -0.01em tracking, card titles 17px / 600, body 14-15px, table heads and badges 12px / 600. Numbers use Indian grouping (₹1,25,430) and `inrCompact` (L, Cr) on charts.

## Patterns

### Button
- Height `--control`: 40px on desktop, 44px on phones. `--tap` is 44px for everything tappable (tab bar, checkboxes, summaries, link buttons).
- Pill, 8px 16px padding, 550 weight, 8px gap between icon and label.
- **One primary (green) button per screen**, placed in the page header beside the title. Everything else is the plain pill.
- Destructive buttons use `--danger` and never sit next to the primary.

### Summary card (`.sumcard`)
Icon tile 44px, title 17/600, one big figure, one status pill, one sentence, and a full-width footer action. The first card on the Dashboard is the green feature card. Title blocks have `min-height: 64px` so the three figures sit on one line.

### Table
Uppercase 12px muted heads on a `--surface-2` band, 11px 12px cell padding, hairline row rules. On phones `.table.cards` turns each row into a stacked card using `data-label`, `td.title` and `td.actions`.

### Forms
Required fields marked, Cancel always beside Save, and a visible reason ("Enter an amount to save.") when Save is disabled.

### Feedback
No `window.confirm`. Single deletes show a toast with Undo. Bulk or irreversible actions open an in-page `<dialog>` with Cancel focused first. Destructive settings live in a separate "Danger zone".

### Navigation
Flat list, no group headings: Dashboard, Transactions, Goals, Settings (Investments and Plan return when `VITE_FEATURE_INVESTING=1`). Sidebar on desktop, bottom tab bar on phones. Focus moves to `<main>` on every route change; first Tab stop is "Skip to main content".

## Decisions

| Decision | Rationale | Date |
|----------|-----------|------|
| Layout and look follow the dashboard reference the owner supplied | Rounded shell, green feature card, summary cards with footer actions | 2026-10 |
| 44px minimum tap size, enforced in `e2e/ui.cjs` | Used on phones; small targets were failing | 2026-10 |
| One primary button per screen, enforced in `e2e/ui.cjs` | Several screens had competing green buttons | 2026-10 |
| In-page dialogs and Undo toasts | `window.confirm` is silently blocked in embedded viewers | 2026-10 |
| Goals leads with the verdict ("All goals together"), the 3D scene follows | The scene filled the first screen and pushed the answer below the fold | 2026-10-31 |
| "Delete all" moved from the Transactions header to a footer after the list | A destructive button above the filters was the first thing on a phone | 2026-10-31 |
| Row category menus are borderless until hover or focus (mouse devices only) | 197 bordered boxes buried the amounts; touch keeps visible borders | 2026-10-31 |
| Sidebar headings (Track / Plan / General) removed | Owner asked for one flat list | 2026-10-31 |
| Investing hidden behind `VITE_FEATURE_INVESTING` | Owner asked to remove it for now; nothing deleted | 2026-10-30 |

## Known gaps

- Table heads use uppercase tracked labels, which several of the installed design skills discourage. Left as is; changing them is a visual decision for the owner.
- Radius has seven values. Collapse only if a screen looks uneven; no test depends on them.

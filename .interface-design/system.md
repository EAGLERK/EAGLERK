# MyMoney design system

Written from `src/styles.css` and the tested UI rules, updated 2026-11-02 when the look was aligned with shadcn/ui. If this file and the CSS disagree, the CSS is right; fix this file.

> The machine-readable form of everything below is `design-system/tokens.json`, with a test that keeps it equal to `src/styles.css`. Read `design-system/README.md` for the component contracts and the measured findings.

## Direction

**Personality:** calm, neutral and trustworthy, in the shadcn/ui style: neutral surfaces, hairline borders, small shadows, one accent. A personal-money app people open on a phone, often once a day, to see what is left.

**Source of the values:** shadcn/ui's "new-york" registry (`card.tsx`, `button.tsx`, `input.tsx`, `table.tsx`, `badge.tsx`, `chart.tsx`, `globals.css`), read from its repo. MyMoney copies the look, not the library: it is plain CSS, with no Tailwind, no Radix and no shadcn components. Do not add them without being asked.

**What is MyMoney's own, on purpose:** the green accent as the primary colour (shadcn's default primary is black), the sign-in screens, the 44px phone targets, the GSAP motion, and the data colours in charts (blue needs, orange wants, green investing), which carry meaning.

**Foundation:** neutral. Light: white page, `#fafafa` sidebar, white cards, `#f5f5f5` muted. Dark: `#0a0a0a` page, `#0f0f0f` sidebar, `#171717` cards, `#262626` muted, with one faint mint glow at the top right of the page (`--glow`). Dark mode follows the device and has a manual switch of three icon buttons (monitor, sun, moon).

**Depth:** 1px borders plus `--shadow-sm` on cards and `--shadow-xs` on outline buttons and inputs. Popovers (chart tooltip, toast, dialog) use a larger shadow. One tint is allowed: the "Left over" card fades from 9% (light) or 12% (dark) accent into the card colour.

## Tokens

### Spacing
Cards: 24px padding and a 24px gap between header and content (16px on phones). Page sections 24px apart (20px on phones); card grids 16px. Panel 24px by 32px. Within a card header, title and description 6px apart.

### Colors (`:root` light, `:root[data-theme='dark']` and the device-dark media block)
```
light   --text #0a0a0a   --text-2 #525252   --text-muted #666666 (AA on white and on #f5f5f5)
        --surface #fff   --surface-2 #f5f5f5   --border #e5e5e5   --axis #d4d4d4 (input borders)   --sidebar-bg #fafafa
dark    --text #fafafa   --text-2 #d4d4d4   --text-muted #a3a3a3
        --surface #171717   --surface-2 #262626   --border white 10%   --axis white 18%   --sidebar-bg #0f0f0f
accent  light #0d7a4e / dark #34d399, ink #fff / #04130c (9.9:1 in dark)
status  good #006300 / #4cc24c, bad #b02a2a / #ff8a8a, watch #8a5a00 / #f0b84a, each with a tinted background
chart   --s1 blue, --s2 orange, --s3 aqua, --s4 yellow, --s5 magenta
```
Status is never colour alone: always an icon or label next to it. Screens must not hard-code colours.

### Radius
`--r-sm 6` (small bars, chart legend chips), `--r-md 8` (buttons, inputs, sidebar rows, tabs), `--r-lg 10` (tab track, alerts, dialog, toast, tooltip, icon tiles), `--r-xl 14` (cards, goal chooser, phone table cards). Badges and progress bars are fully round.

### Typography
System font stack. Base 14px. Page title 24px/600, tracking -0.02em. Card title 16px/600. Description and secondary text 14px muted. Big figures 30px/600 (summary cards) and 24px/600 (stat tiles), tracking -0.02em, tabular numbers. Table heads 14px/500 muted, sentence case. Field labels 14px/500. Amounts are written by `money()` in the profile's currency and country format (₹1,25,430 in India, $125,430 in the US, 125.430 € in Germany); `moneyCompact()` gives L and Cr in India and 1.2M style elsewhere on charts.

## Patterns

### Button
- 36px tall on desktop with a mouse (`--control`), 44px on phones and touch (`--tap`), `small` is 32px on desktop. 8px radius, 14px/500, 8px 16px padding, `--shadow-xs`.
- **One primary (green, no border or shadow) per screen**, beside the page title. Everything else is the outline button. Ghost has no border. Destructive is outline-red, or solid red inside a confirm dialog.
- Focus: no outline; the border turns accent and a 3px soft accent ring appears (shadcn's focus ring).

### Card
Border, `--r-xl`, `--shadow-sm`, 24px padding. Header = title (h2) over a description, with an action on the right. Footer actions use a top hairline. Summary cards (`.sumcard`) have no padding of their own: an icon tile, a title, one big figure, one status pill, one sentence, and a footer link with a top border.

### Tabs (segmented control)
Muted track with 3px padding and a raised white (card-coloured) active segment with a small shadow, 32px tall on desktop. On phones the segments fill the track and are 44px tall, because the segment is the tap target. Used for chart ranges, chart/table, risk, and the theme switch.

### Table
No header band, hairline row separators, muted 14px heads. On phones `.table.cards` turns each row into a stacked card using `data-label`, `td.title` and `td.actions`. The category menu inside transaction rows has no border until hover or focus on mouse devices.

### Chart
Recharts, styled like shadcn charts: horizontal grid only, no axis lines or ticks, 12px muted tick labels, a bordered tooltip with 10px colour chips, and a plain muted legend. Data colours are the five `--s*` tokens.

### Header controls and summary hierarchy (design review, 2026-11-04)
Header, left to right: **Sample data** flag (only for data from an earlier version that had sample data; it is a button that opens Settings), **Ask Mitra** (an outline button with a microphone; icon-only and borderless on phones), the bell (ghost icon), and the theme control. On desktop the theme control is the three-button segmented switch; **at 599px and below it is one 44px ghost button** showing the current theme's icon that steps auto, light, dark (its spoken name says which is on). Both carry `data-tour="theme"`; the tour picks the visible one. The Dashboard has one lead: with exactly three summary cards, "Left over" is 1.5 times as wide and its figure is 36px (the others 30px). Page heads all have a title and one muted line (Settings included). The 3D goals picture is 240px (200px on phones) so the goal cards sit near the top. Cash flow says what its number is ("Left over, last 6 months") and puts the spending change on its own line under the figure.

### Mitra (the voice assistant)
Name: Mitra ("friend"), in `src/voice/brand.ts`. A pill button in the header, "Ask Mitra" with a microphone on desktop and the icon alone at 44px on phones, between the sample-data badge and the bell. It opens a popover built like the notification panel (surface, border, shadow, outside-click and Escape to close, focus returns to the button), radius `--r-xl`, 16px padding. Top to bottom: a round accent avatar with the name and "Your money assistant" (plus "AI on" only when the AI layer is active) and a close icon; the last exchange only (their words in an accent bubble on the right, Mitra's on surface-2 on the left, 18px radius, 6px on the speaking corner); Yes/No while a question waits; on first open a greeting with their first name and three example chips; a 72px accent orb, the one big action, labelled "Tap to talk" / "Tap to stop"; a pill text box with Send; a footer with "Speak replies", "Use AI for new phrases" (only when available) and "What can I say?"; one honest line about where audio goes. Listening: the orb breathes (`pulse()`, a GSAP tween on `--pulse`) and shows five bars driven by `wave()`; both in `src/motion/index.ts`, and reduced motion gets still ones. The header badge shortens to "Sample" on phones so everything fits. Rules: Mitra never deletes or changes a setting without a spoken or tapped yes; new transactions are drafts like any other; unknown phrases are refused, not guessed; the AI may only return commands from the same list, validated before use. Code: `src/voice/` (parse, plan, undo, ai, speech, numbers, dates, bus, brand) and `src/components/Voice.tsx`.

### Phone and installed app
The same screens, no separate mobile design. At 899px and below the sidebar becomes a bottom tab bar. Rules that keep it feeling like an app: touch targets stay 44px; fields on touch screens are 16px (iPhones zoom into smaller ones); `viewport-fit=cover` plus `env(safe-area-inset-*)` padding on the frame, the top of the panel, the tab bar, toasts and the Save bar; pinch-zoom is never disabled; `theme-color` follows light and dark. Settings has a "Use MyMoney as an app" card (install button where the browser offers one, else the steps, plus the iPhone storage warning); it is hidden once installed and inside the native apps. Icons: the M mark in mint on near-black, full-bleed for maskable and iPhone, `scripts/make-icons.cjs`.

### Google Sheets
On Transactions the import card has two small outline buttons, **Import** (a file) and **Google Sheet**. The second opens a native dialog (same shell as the other dialogs, 520px): two numbered steps for sharing the sheet, one line on the columns it needs (with the Type or Debit/Credit tip), the link field, then after "Check the sheet" a preview panel on `--surface-2` (count, date range, money in and out, three sample rows with signed amounts, a name field, an "Auto" checkbox). The one primary button in the dialog changes from "Check the sheet" to "Add N transactions". A plain line says anyone with the link can read the sheet. Connected sheets are listed inside the import card, above the file list: icon, label ("Google Sheet · Name"), one muted line (count, when it was last checked, whether it updates by itself), and Sync now, Auto and Remove (they wrap under the text on phones). A failed check shows its reason in a small red block under the label. Sheet rows are saved straight away (no Save bar): the preview is the review. Code: `src/components/Sheets.tsx`, `src/engine/sheets.ts`, `src/sheets/fetch.ts`.

### Notes
A Notes tab (between Goals and Settings) for lists the person keeps for themselves, such as things to buy or sell. A note is a title plus a stack of blocks: **text** (a box that grows as you type), **to-do list** (checkboxes; done items are struck through; Enter adds an item below, Backspace on an empty item removes it, "Clear completed" with Undo) and **table** (editable headers and cells, add or remove rows and columns, and a total under any column that is mostly numbers, read in Indian formats). Blocks can be named, moved up or down, and removed with Undo. New note offers three starting points: Things to buy (a to-do list), Things to sell (a table of item, asking price, status) and a blank note. The list shows each note as a card with a one-line summary ("1 of 4 done · 1 table · 12 words"). The sample-data account comes with two example notes.

Notes **save by themselves** about 0.4 seconds after the last keystroke, when leaving the editor, and when the tab goes to the background, with a Saved / Saving indicator; they are not drafts and never trigger the leave popup. They are part of the account data, so they sync and are included in backups. Deleting a note offers Undo. Model: `Note` and `NoteBlock` in `src/engine/types.ts`, helpers and tests in `src/engine/notes.ts` and `tests/notes.test.ts`.

### Editing transactions, drafts and the Save bar
Every cell of a transaction row is editable in place: date (a date box that opens the browser's calendar when clicked), description, category, amount, and a round +/- button that switches money out and money in. Cells look like plain text until hovered or focused on mouse devices, and always show a border on touch screens.

Anything imported, typed in (Add transaction -> "Add to list") or changed is a **draft** until Save changes is pressed: drafts are highlighted with an accent bar and a tint, are not counted anywhere else in the app, and are not stored or synced. New rows are pinned above the list so a filter cannot hide them. A Save bar (sticky, above the tab bar on phones) shows the count with Discard (offers Undo) and Save changes, the only green button on the screen while it shows. A date that is not valid or an amount that is not above 0 is flagged and blocks saving, with the reason beside the button. Putting a value back to what is saved removes the change. Deleting a saved row stays immediate, with Undo.

Leaving Transactions with drafts (sidebar, tab bar, bell actions, sign out, browser Back or a typed address) opens a popup with Keep editing, Leave without saving and Save and leave (blocked, with the reason, while a row is invalid). Closing or reloading the tab triggers the browser's own warning. Logic: `src/components/Drafts.tsx`; the store action is `commitTxns`.

### Import
One card with an Import button at the top right. Clicking it opens the file chooser straight away and imports on selection, with no box, preview or confirm step. Each imported file then appears as a row (name, row count, date range) with its own Remove button; Remove deletes that file's rows and offers Undo in a toast. Files that cannot be read show one inline warning. Rows carry the file name in `Txn.file`, so rows imported before this change stay in the list but have no file row.

### Logo
A blocky "M" (two pillars under a stepped bar, a block hanging between them), in `src/components/Logo.tsx` on a 100-unit grid. App icon form: mint `#34d399` M on a near-black `#0a0a0a` tile with a faint inner ring, the same in light and dark mode. Plain forms live in `docs/brand/`: `logo-mark.svg` (tile), `logo-glyph-mint.svg` (on dark), `logo-glyph-green.svg` (`#0d7a4e`, on light), and `logo-preview.png`. The browser tab icon in `index.html` is the same tile. It is an original construction inspired by the owner's reference image, which carries a registered-trademark sign; do not copy that reference's exact shape or its ®.

### Welcome popup and greeting
After sign-up (or on the first visit without an account) a modal popup opens over the Dashboard, built like the sign-in card: logo, title ("Let's set up your profile"), one line of purpose, a "What should we call you?" field, a "Where are you?" country select (pre-filled from the browser language, with a line saying which currency it means) and one primary "Get started". It cannot be dismissed (Escape and the backdrop do nothing); Get started stays disabled with a visible reason until a name is entered. Google accounts offer their name as a suggestion. The Dashboard header's left side then reads "Hi, <name>" over "Overview of your money for <month>", filled or empty. Erasing or replacing data keeps the name.

### First-time tour
Eight tooltips with a highlight ring and an arrow, shown once right after setup and replayable from Settings or from the welcome alert: the green button, Transactions (import), Goals, Notes, Mitra, the bell, the theme switch, Settings. They point at real controls (sidebar on desktop, tab bar on phones, first visible match) and stay on screen. Next, Back, Skip tour, Escape. Done or skipped is saved in the account data (`tourDone`), so it does not repeat on another device. Tips that do not exist on a screen are left out.

### Notifications
A bell in the header, beside the theme switch, with an unread count. The panel lists alerts newest-priority first (important, heads up, info), each with a reason and an action; "Mark all as read"; read state is saved (`alertsRead`). Alerts are worked out from the data in `src/engine/alerts.ts`, never invented: overspending in the last complete month, categories well above the person's own average, EMIs over 40% of income, goals needing more than the surplus, many "Other" rows, no new transactions for 35 days, a backup older than 30 days (local-only users with 20+ transactions), account saving problems, a welcome note, and "add your first transactions". Sample data does not trigger import or backup reminders. Browser alerts (Settings): system notifications for important alerts that appear while the tab is in the background; they work only while MyMoney is open in a tab, because there is no push service.

### Forms
Label above the field, required fields marked, Cancel beside Save, and a visible reason when Save is disabled. Password boxes have the show/hide eye inside the field.

### Feedback
No `window.confirm`. Single deletes show a toast (card-coloured, bordered, like Sonner) with Undo. Bulk or irreversible actions open an in-page dialog with Cancel focused first. Destructive settings live in a separate Danger zone.

### Navigation
Flat list, no group headings: Dashboard, Transactions, Goals, Settings (Investments and Plan return with `VITE_FEATURE_INVESTING=1`). 256px sidebar on desktop with a hairline on its right; the active row has a muted background, not a dark pill. Bottom tab bar on phones. Focus moves to `<main>` on every screen change; the first Tab stop is "Skip to main content".

## Motion

All motion is GSAP (3.15, core only), written in `src/motion/index.ts`. Do not add CSS `transition`, `animation` or `@keyframes`; `e2e/ui.cjs` fails if any CSS motion runs on hover, press, toast or dialog.

- **Press:** buttons, choice cards and tabs scale to 0.97 in 120ms and settle back with a small overshoot. Sidebar links 0.985, tab bar 0.94.
- **Hover (mouse and pen only):** GSAP animates `--hv` from 0 to 1 in 160ms and CSS derives the look from it. New hoverable controls go in `HOVERABLE` in the motion file and read `--hv` in CSS.
- **Screens:** content fades in over 200ms, opacity only.
- **Dashboard:** summary cards fade in 60ms apart, once per visit.
- **Toasts:** rise 10px while fading in, leave faster. **Dialog:** grows from 97% while the backdrop fades up (`--bd`).
- **3D scene:** looping GSAP spin tweens, a one-time rise-in, GSAP's ticker as the render loop.
- **Reduced motion:** every helper returns early; the 3D scene stays still.
- Instant on purpose: focus rings and the borderless-until-hover category menus.

## Decisions

| Decision | Rationale | Date |
|----------|-----------|------|
| Logo is a blocky M in mint on a dark tile, replacing the line-chart icon | Owner supplied a mint M reference in the brand colour; drawn as an original vector, not traced | 2026-11-02 |
| A Notes tab with text, tables and to-do lists that autosave | Owner asked | 2026-11-03 |
| Transactions are editable in place; imports, typed-in rows and edits are drafts until Save changes, and leaving the screen asks | Owner asked | 2026-11-02 |
| Welcome is a modal popup over the Dashboard, a six-tip tour follows, and a notification bell with data-driven alerts and optional browser alerts was added | Owner asked | 2026-11-02 |
| The first screen asks for a name; the Dashboard greets "Hi, <name>" at the left of its header | Owner asked | 2026-11-02 |
| Import opens the file chooser directly; imported files are listed with a Remove button | Owner asked: no box to open, and a way to take an import back from the same place | 2026-11-02 |
| Look aligned with shadcn/ui: neutral surfaces, 14px cards with border and shadow, 36px controls, tab-style toggles, flat sidebar | Owner asked; values taken from shadcn's own registry source rather than memory | 2026-11-02 |
| Primary colour stays green; chart data colours stay as they were | Brand colour, and the chart colours carry meaning | 2026-11-02 |
| `--text-muted` is `#666666` in light mode, not shadcn's `#737373` | Keeps 4.5:1 on the muted `#f5f5f5` | 2026-11-02 |
| Input borders use `--axis` (darker than shadcn's) | shadcn's input border is about 1.2:1 against white, too faint to find a field | 2026-11-02 |
| The green gradient "Left over" card became a soft tint | shadcn cards are flat; the tint keeps a focal card without a heavy fill | 2026-11-02 |
| On phones tab segments fill the track instead of floating inside padding | 44px minimum tap size, enforced in `e2e/ui.cjs` | 2026-11-02 |
| All animation moved to GSAP, none left in CSS | Owner asked; one file holds timings and curves | 2026-11-02 |
| Dark mode redrawn from the owner's dark dashboard reference, then neutralised to shadcn's greys | Near-black surfaces, mint accent, faint corner glow kept | 2026-11-02 |
| Theme switcher is three icon buttons with spoken names | Owner asked; 44px on phones | 2026-10-31 |
| Goals leads with the verdict, the 3D scene follows | The scene filled the first screen and pushed the answer below the fold | 2026-10-31 |
| "Delete all" lives in a footer after the transaction list | A destructive button above the filters was the first thing on a phone | 2026-10-31 |
| Sidebar headings (Track / Plan / General) removed | Owner asked for one flat list | 2026-10-31 |
| Investing hidden behind `VITE_FEATURE_INVESTING` | Owner asked to remove it for now; nothing deleted | 2026-10-30 |
| In-page dialogs and Undo toasts | `window.confirm` is silently blocked in embedded viewers | 2026-10 |
| One primary button per screen, 44px minimum tap size, both enforced in `e2e/ui.cjs` | Competing green buttons and small targets were failing | 2026-10 |

## Known gaps

- The stylesheet carries older rules that the shadcn block at the end now overrides. They are dead weight; collapse them when next touching the file.
- There is no sample data. An empty account's Dashboard says so and offers Add a transaction (the one primary) and Import or connect a sheet. Made-up data for tests lives in `e2e/fixtures/demo.cjs`.

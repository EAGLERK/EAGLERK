# MyMoney

A personal finance planner for Indian households. It answers four questions:

1. **Where does my money go?** Import a bank statement (CSV) or add transactions by hand. Monthly income, spend, savings rate, 50/30/20 check, category breakdown and month-over-month spikes.
2. **Can I afford a car, house or bike, and by when?** Price at your target date, cash needed on the day, EMI, total interest, the monthly saving that gets you there, affordability checks, and a tenure trade-off table.
3. **How are my investments doing, best to worst?** FD, RD, PPF, NPS, EPF, mutual funds, stocks, gold and savings, valued today and ranked on return **after tax and inflation**, with flags (idle cash, DICGC limit, upcoming maturity).
4. **What should I do with the surplus?** A monthly allocation in a fixed order: safety net, costly debt, goals (soonest first), long-term wealth. Plus a ranked "where should new money go" tool and a 20-year projection.

By default everything runs in the browser and is stored in `localStorage`. Nothing is uploaded. Optional accounts are described below.

![Car, house and bike](docs/illustrations/car-house-bike.png)

The 3D scene on the Goals tab is built from code with Three.js (`src/three/`), in the app's chart colours. Stills are in `docs/illustrations/`. Re-render them by opening `#showcase-all`, `#showcase-car`, `#showcase-house` or `#showcase-bike` in a WebGL-capable browser.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 69 unit tests, including the database access rules
npm run build      # typecheck + production build
npm run build:single   # one self-contained dist-single/mymoney.html (no server needed)
npm run e2e        # browser smoke test against a running server (needs Playwright + Chromium)
                   # against a build with VITE_FEATURE_INVESTING=1, run it as: INVESTING=1 npm run e2e
npm run e2e:ui     # UI standards: 44px tap targets, one primary button per screen, Undo, dialogs, focus
npm run e2e:auth   # sign-in, Google, sync and conflict tests against a mock Supabase
npm run dev:auth-demo   # try the sign-in screens at http://localhost:5177 with no Supabase project (in-memory mock)
```

Click **Explore with sample data** on first launch to see every screen populated.

## First run, tour and alerts

- **Welcome popup:** the first time, a popup over the Dashboard asks what to call you, then starts empty or with sample data.
- **Tour:** eight tooltips point at the main controls once, including the microphone. Replay them from Settings, Quick tour.
- **Bell:** alerts worked out from your own data (overspending, goals that do not fit, heavy EMIs, uncategorised rows, stale data, backup and sync problems), each with a reason and a button. The rules are in `src/engine/alerts.ts` with tests in `tests/alerts.test.ts`.
- **Browser alerts:** Settings, Notifications. Important alerts that appear while MyMoney is open in a background tab also show as system notifications. There is no push service, so nothing arrives when the app is closed; adding that would need a small server, a service worker and a push key.
- Tests: `npm run e2e:welcome`.

## Notes

The Notes tab keeps lists for yourself, such as things to buy or sell. A note is a title and any mix of **text**, **tables** (add rows and columns; numeric columns get a total) and **to-do lists** with checkboxes. Start from Things to buy, Things to sell or a blank note. Notes save as you type, sync with your account and are part of your backup. Tests: `npm run e2e:notes`.

## Voice assistant

The microphone button in the header opens a voice assistant. It is a feature switch, on by default: build or run with `VITE_FEATURE_VOICE=0` to remove the button and its tour tip (`src/features.ts`). The first-time tour points at it. Tap **Speak** and say what you want, or type the same sentence in the box below (it also works in browsers that cannot listen).

- **Add transactions:** "Spent 450 on lunch yesterday", "Got salary 1.25 lakh", "Add an expense for coffee" (it asks how much). They are drafts until you say or press **save**, like every other new transaction.
- **Notes:** "Add milk, bread and eggs to my shopping list", "Note down call the bank", "Remind me to renew insurance", "Tick off milk", "Remove eggs from my shopping list", "Open my shopping list", "Create a note called trip plan".
- **Navigate:** "Open goals", "Show my notes", "Dark mode", "Match my device theme".
- **Change things:** "Change the amount of Swiggy to 500", "Set the category of Uber to Travel", "Set my age to 32", "Change my monthly income to 1.2 lakh", "Add a car goal", "Set house price to 80 lakh", "Set inflation to 6 percent".
- **Ask:** "How much did I spend this month?", "How much did I save last month?"
- **Undo:** "Undo" takes back the last change (up to 20 steps). Deleting and changing settings always asks first, and reads the old and new value back.

How it works, and its limits:

- It is a fixed set of phrases read by rules on this device. There is no AI model and no API key. "Change anything" means the things listed above; anything else gets "I did not understand", never a guess. Say "help" for the list.
- Speech to text is done by the browser. **Chrome and Edge send the audio to the browser vendor's servers** to do it; Safari varies; Firefox has no speech recognition (typing still works). MyMoney itself never records or stores audio. Spoken replies use the browser's own voice and can be turned off.
- Speech recognition gets numbers wrong sometimes (14 and 40 sound alike), which is why anything that changes a setting is read back and confirmed.
- Tests: `npm run e2e:voice` (speech is stubbed, since headless browsers cannot listen) and `tests/voice*.test.ts`. Not yet tested: real microphones and real recognition accuracy with Indian accents.

## Editing and saving transactions

Every transaction can be edited in the list: date (click it for a calendar), description, category, amount, and money in or out. Anything imported, typed in or changed is a **draft** until you press **Save changes**: it is highlighted, it does not count on the Dashboard, and leaving the screen asks whether to save, leave without saving, or keep editing. Closing or reloading the tab shows the browser's own warning. Tests: `npm run e2e:edit`.

## Importing a bank statement

Transactions has one Import button. Choose a file and it is read at once into drafts for you to check and save; each imported file is listed with a Remove button.

- **Formats:** CSV, TSV, semicolon or pipe separated text; Excel `.xlsx`; HTML tables saved with an `.xls` name (some banks do this). Text in UTF-8, UTF-16 or older Windows encodings.
- **No fixed layout needed.** Column names are used when they are recognisable (Date, Narration, Withdrawal, Deposit, Debit, Credit, Amount, Balance, Dr/Cr and common variants). When they are not, or there is no header at all, the date column is the one full of dates, the description is the longest text, and the money columns are told apart by how they are filled and by how the running balance moves. A balance column also fixes money in versus money out when there is a single unsigned amount column, and works whether the statement lists oldest or newest first.
- **Also handled:** notes before the header, an opening-balance or total line, narrations that wrap onto the next line, quoted cells with line breaks, Excel day-number dates, day-first and month-first dates, `(500)`, `450 Dr` and `-450` style amounts, Indian digit grouping.
- **Cannot read:** PDF statements and the old binary `.xls` format. The app says so and asks for a CSV or `.xlsx`; Excel and Google Sheets can save a sheet as either.
- When the app had to guess how the columns work, it says so under the import button.
- Tests: `tests/statements.test.ts` covers HDFC, ICICI, SBI, Axis and Kotak style layouts, several unlabelled layouts, and two real `.xlsx` files in `tests/fixtures/`. If a real statement still fails, add a copy of its first rows (with the personal details changed) as a test case.

## Investing is switched off

For now MyMoney covers cash flow (income, spend, transactions) and goals (car, house, bike, with your loans on the Goals screen). The Investments tab, net worth, holdings and the Plan tab are hidden.

- Nothing is deleted. Investments you already entered stay in your saved data and backups.
- To bring everything back, set `VITE_FEATURE_INVESTING=1` and restart or rebuild.
- The "Investments" spending category in Transactions stays, because money you move into investments is still money that left your account.
- Goal advice with investing off assumes your savings grow at the after-tax rate in Settings, and does not tell you where to invest.

## Accounts (optional)

With no configuration MyMoney runs exactly as before: everything stays in the browser. Add a Supabase project and it
asks people to sign in (email and password, or Google), stores each person's data in their own row, and syncs it across
devices. Mobile-number sign-in is built but switched off until an SMS provider is set up.

### Set it up (about 20 minutes)

1. Create a project at [supabase.com](https://supabase.com).
2. SQL Editor: paste `supabase/schema.sql` and run it. It creates the `user_data` table with row-level security.
3. Project Settings > API: copy the project URL and the **anon public** key into `.env.local` (see `.env.example`).
   Never use the `service_role` key in the app.
4. Authentication > Providers > Email: keep "Confirm email" on and set the minimum password length to 8 or more.
5. Authentication > URL Configuration: set the Site URL to your deployed address and add it, plus
   `http://localhost:5173`, to the redirect URLs.
6. Google sign-in: in Google Cloud Console create an OAuth consent screen, then a Web application OAuth client.
   Authorized JavaScript origins: your site address. Authorized redirect URI:
   `https://<your-project-ref>.supabase.co/auth/v1/callback`. Paste the client ID and secret into
   Supabase > Authentication > Providers > Google and enable it.
7. Recommended: turn on CAPTCHA and leaked-password protection under Authentication > Attack Protection (some options
   depend on your Supabase plan).
8. Deploy the built site (`npm run build`) to any static host with the two `VITE_SUPABASE_*` values set at build time.
9. Check your setup: `npm run check:supabase`. It reads `.env.local`, confirms the project answers to your key, that the
   table exists and refuses anonymous access, that email confirmation is on and that Google is enabled. It prints OK, WARN
   or FAIL with the fix for each, and changes nothing. It cannot see your Google client settings or redirect URLs, so
   finish by signing up two accounts and confirming each only sees its own data.
10. Mobile numbers: Authentication > Providers > Phone, choose an SMS provider and add its credentials. SMS to Indian
   numbers normally requires DLT registration with your provider. Then set `VITE_AUTH_PHONE=1` and rebuild.

The single-file preview (`npm run build:single`) and the hosted preview page run without keys, so they have no sign-in.

### What has and has not been tested

- Tested: the database rules on a real in-memory Postgres (`tests/rls.test.ts`: one user cannot read, write, re-point or
  delete another's row; signed-out visitors get nothing; account deletion removes only the caller).
- Tested: the app's sign-in, sign-up, Google and reset-link return trips, sync, conflicts and phone flow, using the real
  `supabase-js` client against a mock server (`npm run e2e:auth`).
- **Not tested:** a real Supabase project, a real Google consent screen, real email or SMS delivery, or Supabase's own rate limits.
  Expect to spend time on the dashboard settings above the first time.

### Privacy and security notes

- Row-level security stops other users reading your row. The project owner can still read it: the data is plain JSON in
  your Supabase database, encrypted at rest by the host, not end-to-end encrypted.
- supabase-js keeps the session in the browser's local storage, so a cross-site-scripting bug could expose it. Keep
  dependencies current and serve the site with a Content-Security-Policy.
- Offering this to other people makes you responsible for their financial data: a privacy notice, the right to delete
  (the Settings page has one), and India's DPDP Act obligations. Check with a lawyer before a public launch.

## How it is built

```
src/engine/      pure TypeScript, no React, fully unit-tested
  assumptions.ts every rate used, with source, date and status
  tax.ts         new-regime slabs, 87A rebate + marginal relief, cess
  loan.ts        EMI, amortisation, FOIR affordability
  deposits.ts    FD/RD maturity (quarterly compounding), effective yield
  instruments.ts instrument catalogue, ranking, after-tax corpus
  portfolio.ts   valuation, asset split, per-holding after-tax return
  goals.ts       car / house / bike planner
  advisor.ts     allocation waterfall and projection
  csv.ts         bank statement parser (HDFC/ICICI/SBI style, Dr/Cr columns)
  categorize.ts  keyword rules for UPI/NEFT narrations
src/views/       Dashboard, Transactions, Goals, Investments, Plan, Settings
src/store.tsx    state + localStorage persistence
tests/           engine tests with hand-checked figures
```

## About the numbers

Every rate lives in `src/engine/assumptions.ts` and is editable in **Settings**. Each carries a status:

| Status | Meaning | Examples |
|---|---|---|
| `verified` | Official notification, confirmed by several outlets | PPF 7.1%, NSC 7.7%, SCSS 8.2% (Oct-Dec 2026); repo rate 5.50% (7 Oct 2026); CPI 4.82% (Aug 2026) |
| `check` | Varies by bank or lender; a typical value | FD, RD, savings, loan rates |
| `estimate` | A modelling assumption, not a forecast | Equity, gold, debt-fund returns, price growth |

"Verified" here means reported consistently by multiple news outlets, **not** read from the primary RBI / Department of Economic Affairs documents. Confirm before a large decision.

Tax modelled: new regime FY 2026-27, 4% cess, Rs 12 lakh rebate with marginal relief, equity LTCG 12.5% above Rs 1.25 lakh, STCG 20%.

## Known limits

- **No live bank sync.** In India that needs the RBI Account Aggregator framework, which a personal app cannot join directly. Statement import is the supported path; re-importing a file does not duplicate rows.
- **New tax regime only.** 80C / 80D / HRA are not modelled, so PPF and ELSS look less attractive than they would to an old-regime filer.
- **Single device.** Data is in one browser. Use Settings > Download backup, or Copy backup if downloads are blocked.
- **Not investment advice.** The advisor is a transparent rule set (110 minus age for equity share, adjusted for risk). The author is not a SEBI-registered adviser.
- Market-linked holdings need a manually entered current value; there is no NAV or price feed.
- Goal affordability assumes today's income stays flat.

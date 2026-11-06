# MyMoney

A personal finance planner you can use in any country. It works in your own currency and number format; a few extra tools (tax estimate, lender rules, savings schemes) are built for India only. See "Countries and currencies" below. It answers four questions:

1. **Where does my money go?** Import a bank statement (CSV) or add transactions by hand. Monthly income, spend, savings rate, 50/30/20 check, category breakdown and month-over-month spikes.
2. **Can I afford a car, house or bike, and by when?** Price at your target date, cash needed on the day, the monthly loan payment (EMI), total interest, the monthly saving that gets you there, affordability checks, and a tenure trade-off table.
3. **How are my investments doing, best to worst?** *(India only, and switched off by default.)* FD, RD, PPF, NPS, EPF, mutual funds, stocks, gold and savings, valued today and ranked on return **after tax and inflation**, with flags (idle cash, DICGC limit, upcoming maturity).
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

The app starts empty and has no sample data: add a transaction, import a statement or connect a Google Sheet to see the screens fill in. (Earlier versions could load made-up sample data; if you still have some, a **Sample data** flag in the header opens Settings, where **Remove sample data** takes it out and keeps anything you added yourself.) Browser tests that need a filled-in account use made-up data from `e2e/fixtures/demo.cjs`.

## First run, tour and alerts

- **Welcome popup:** the first time, a popup over the Dashboard asks what to call you, then starts with an empty account.
- **Tour:** eight tooltips point at the main controls once, including the microphone. Replay them from Settings, Quick tour.
- **Bell:** alerts worked out from your own data (overspending, goals that do not fit, heavy EMIs, uncategorised rows, stale data, backup and sync problems), each with a reason and a button. The rules are in `src/engine/alerts.ts` with tests in `tests/alerts.test.ts`.
- **Browser alerts:** Settings, Notifications. Important alerts that appear while MyMoney is open in a background tab also show as system notifications. There is no push service, so nothing arrives when the app is closed; adding that would need a small server, a service worker and a push key.
- Tests: `npm run e2e:welcome`.

## Countries and currencies

MyMoney is not tied to India. On first launch it asks "Where are you?" (pre-filled from the browser's language) and uses that country's currency. Settings, Country and currency changes either later.

What follows the country:

- **Currency and number format.** Amounts are written in the chosen currency the way that country writes them: ₹1,25,430 in India, $125,430 in the US, 125.430 € in Germany, ¥125,430 in Japan (no decimals for currencies without them). Below 1,000, cents are kept ($4.50 stays $4.50). Changing the currency changes how amounts are *shown*; it does **not convert** amounts you already have, and there is one currency per profile (no mixed-currency accounts).
- **Reading statements.** Amounts are read in any common format: `1,234.50`, `1.234,56 €`, `1 234,56`, `CHF 1'234.50`, `(500.00)`, `450 Dr`, with the currency symbol or code in front or behind. Dates such as `03/04/2026` are read day-first, except in the US and the Philippines (month-first), and whenever the file settles it (a day above 12). Semicolon-separated exports and decimal commas, common in Europe, work. The Google Sheet reader uses the same rules.
- **Categories.** Matching is keyword-based and English: Indian narrations (UPI, NEFT, Swiggy) and common names from elsewhere (Walmart, Tesco, Lidl, REWE, DoorDash, Comcast, mortgage, paycheck, and so on). Anything else is "Other" and can be changed by hand. Statements in other languages mostly land in "Other" until recategorised.
- **Loan payments.** Called "EMI" in India, Pakistan, Bangladesh, Sri Lanka and Nepal, and "loan payment" everywhere else.
- **Mitra.** Commands are English. It understands "12 dollars", "20 bucks", "45 euros", "1.5 million", "2 mn" as well as "80 lakh" and "1.25 crore", and listens for the English of your country (en-US, en-GB, en-IN and so on).

What is **India-only**, and switched off elsewhere:

- The **tax estimate** (new regime slabs) and the "Salaried" box.
- The **lender minimum down payment** check for a house (the RBI's loan-to-value limits).
- The **researched assumptions** (RBI repo rate, CPI, small-savings schemes, bank products). Elsewhere Settings lists only what goals need (planning inflation, house, car and bike price growth, loan rates) as **placeholders you are asked to replace**, with a notice on Goals until you do. The app has no sourced numbers for other countries and does not pretend to; it assumes **0 interest on savings** until you enter yours.
- The **Investments and Plan** tabs (still behind `VITE_FEATURE_INVESTING=1`, and now offered only to India).
- Income fallbacks: a new profile outside India starts with 0 for monthly income, spend and annual income (the rupee-sized defaults would be nonsense in dollars), so Goals asks for your take-home until you enter it or import transactions.

Data saved before this change has no country and stays in India and rupees.

What is **not** done: other countries' tax rules, loan rules and rate data; converting between currencies or holding several at once; right-to-left layouts; translating the interface or Mitra into other languages; non-English category keywords. The phone sign-in field still reads a bare 10-digit number as Indian (phone sign-in is off by default). Tests: `tests/global.test.ts` and `npm run e2e:global`.

## Notes

The Notes tab keeps lists for yourself, such as things to buy or sell. A note is a title and any mix of **text**, **tables** (add rows and columns; numeric columns get a total) and **to-do lists** with checkboxes. Start from Things to buy, Things to sell or a blank note. Notes save as you type, sync with your account and are part of your backup. Tests: `npm run e2e:notes`.

## Mitra, the voice assistant

Mitra lives behind the **Ask Mitra** button in the header. Tap the big button and say what you want, or type it. It is a feature switch, on by default: build or run with `VITE_FEATURE_VOICE=0` to remove it and its tour tip (`src/features.ts`). The first-time tour introduces it.

- **Add transactions:** "Spent 450 on lunch yesterday", "Got salary 1.25 lakh", "Add an expense for coffee" (Mitra asks how much). They are drafts until you say or press **save**, like every other new transaction.
- **Notes:** "Add milk, bread and eggs to my shopping list", "Note down call the bank", "Remind me to renew insurance", "Tick off milk", "Remove eggs from my shopping list", "Open my shopping list".
- **Navigate:** "Open goals", "Show my notes", "Dark mode".
- **Change things:** "Change the amount of Swiggy to 500", "Set the category of Uber to Travel", "Set my age to 32", "Add a car goal", "Set house price to 80 lakh", "Set inflation to 6 percent".
- **Ask:** "How much did I spend this month?"
- **Undo:** "Undo" takes back the last change (up to 20 steps). Deleting and changing settings always asks first and reads the old and new value back.

### Two layers

1. **Rules, on this device (always on).** A fixed set of phrases is read by code in `src/voice/`. Instant, free, no data leaves your browser except what the browser's own speech recognition does.
2. **AI, optional.** If Mitra's rules do not recognise a sentence, and the AI is switched on, the sentence goes to an AI model that turns it into one of the same commands, so "dinner with Rahul cost me eight hundred last night" works. The model **cannot do anything the rules cannot**: its answer is checked field by field (`validateCmd` in `src/voice/ai.ts`) and then goes through the same planner, so deletes and setting changes still ask first. It cannot read your data. What is sent: the sentence, today's date, your note titles and the planner's setting names. Never transactions, amounts from your data or your profile.

To turn the AI layer on (about 10 minutes, needs a Supabase account and an Anthropic API key):

```bash
supabase functions deploy assistant
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

Then build with `VITE_VOICE_AI=1`. The function (`supabase/functions/assistant/index.ts`) answers only signed-in users and calls Claude Haiku from the server, so the key is never in the page. Without `VITE_VOICE_AI=1`, or when signed out, Mitra is rules-only and the panel does not mention AI. **It costs money per sentence the rules miss** (a few hundred tokens each; set a spend limit on the key) and the function has no per-user rate limit yet. Add one before opening sign-ups to the public.

### Limits

- Speech to text is done by the browser. **Chrome and Edge send the audio to the browser vendor** to do it; Safari varies; Firefox has none (typing still works). MyMoney never records or stores audio. Spoken replies use the browser's voice and can be turned off.
- Speech recognition mishears numbers (14 and 40), which is why anything that changes a setting is read back first.
- Mitra can do what is listed above. Anything else gets an honest "I did not understand", never a guess. Say "help" for the list.
- Tests: `npm run e2e:voice` (speech stubbed, since headless browsers cannot listen), `npm run e2e:voice-ai` (a stand-in Supabase and a scripted `assistant` function) and `tests/voice*.test.ts`. **Not tested:** a real microphone, real recognition accuracy with Indian accents, and the deployed Edge Function against the real Anthropic API. The function's request shape follows Anthropic's Messages API but has not been run end to end.

## Mobile app

The phone apps are this same web app, not a rewrite, so every screen, Mitra and your data work the same everywhere. There are three ways to get it on a phone.

**1. Install from the browser (works as soon as the site is deployed over HTTPS).** On Android (Chrome, Edge) open the site, then Settings, Use MyMoney as an app, Install the app. On iPhone and iPad open it in Safari, tap Share, then Add to Home Screen. It opens full screen with its own icon, keeps working with no connection, and long-pressing the icon on Android offers Add transaction and Notes. The service worker (`pwa/sw.js`) only saves this site's own files; it never stores your data and never touches sign-in, sync or AI calls. **On iPhone the home-screen app has storage separate from Safari**, so your data will look missing: download a backup in Safari first and restore it inside the app (Settings says this).

**2. Android app (Capacitor).** You need [Android Studio](https://developer.android.com/studio) and a phone or emulator.

```bash
npm run mobile:android   # builds the web app, copies it into android/, opens Android Studio; press Run
npm run mobile:apk       # or build a debug APK: android/app/build/outputs/apk/debug/app-debug.apk
```

**3. iPhone app (Capacitor).** You need a Mac with Xcode and [CocoaPods](https://cocoapods.org), and, to put it on anyone else's phone, the Apple Developer Program ($99 a year).

```bash
cd ios/App && pod install && cd ../..
npm run mobile:ios       # builds the web app, copies it into ios/, opens Xcode; press Run
```

Before you publish either app:

- **Change `appId` in `capacitor.config.ts`** (it is `app.mymoney`, a placeholder). It is the app's permanent identity in Google Play and the App Store and cannot be changed later. Use a reverse domain you own.
- The native build reads `.env.local` like any build, so sign-in is on. **Set `VITE_WEB_URL` to your deployed site** (for example `https://mymoney.example`). Inside the apps the page's own address is `https://localhost`, which means nothing to a phone, so confirmation and password-reset emails link to that website instead: the person confirms there, then signs in in the app. Add the same URL to Supabase's redirect list.
- Icons and splash screens come from `assets/` (made by `node scripts/make-icons.cjs`, applied by `npm run mobile:icons`). Replace the files in `assets/` to rebrand.
- A release build needs a signing key (Android) or a signing team (iOS). Google Play has a one-time $25 fee. Both stores also want a privacy policy; the privacy notes below are a starting point.

What is different inside the apps:

- **Google sign-in is off.** Google refuses sign-in from an app's web view. Email and password works.
- **Mitra listens through the phone's own recogniser** (a Capacitor plugin), because the web view has no speech recognition. The first tap asks for the microphone. Typing works regardless.
- **Browser alerts are not available** (web views have no Notification API); the bell inside the app still works. Real phone notifications would need a native notifications plugin, which is not wired.
- **Downloading a backup may not work** in a web view; use Copy backup in Settings.
- Android's cloud backup of app data is switched off (`allowBackup="false"`), so your money data is not copied to a Google account behind your back. The cost: it is not restored on a new phone. Use your MyMoney account or a backup file for that.

What has and has not been checked:

- **Checked in a real browser:** the manifest, icons, service worker and **offline opening with your data** (`npm run e2e:pwa`), 16px fields so iPhones do not zoom, safe-area padding, no sideways scroll.
- **Run through Capacitor's real web code with a stand-in for the phone side:** the app pretends to be the Android shell, Mitra picks the phone recogniser, asks for the permission, starts it, "hears" a sentence and acts on it (`npm run e2e:pwa`). Plus unit tests for the listening logic (one tap = one recogniser, refusals, failures) and for where email links lead (`tests/mobile.test.ts`). The stand-in is my reading of how the plugin behaves, not the real plugin on a real phone.
- **Not built or run:** the Android project could not be built in the environment I worked in (its network blocks Google's Maven server, so Gradle cannot download the Android toolchain), the iPhone project needs a Mac, and **nothing has run on a real phone**. Expect to fix small things on the first build. Unknown until you try: how the 3D goal pictures perform on low-end Android phones, how the plugin behaves on iOS (it predates Swift Package Manager, so the iPhone project uses CocoaPods), and whether the status bar and notch padding look right on every device.
- **Why not React Native:** it would be a second app to write and keep in step, with the engine, notes, drafts, Mitra and every screen rebuilt. A web view feels less native (scrolling and transitions are the browser's), which is the price of one codebase. Say so if you want the rewrite; it is months, not days.

## Editing and saving transactions

Every transaction can be edited in the list: date (click it for a calendar), description, category, amount, and money in or out. Anything imported, typed in or changed is a **draft** until you press **Save changes**: it is highlighted, it does not count on the Dashboard, and leaving the screen asks whether to save, leave without saving, or keep editing. Closing or reloading the tab shows the browser's own warning. Tests: `npm run e2e:edit`.

## Google Sheets

On Transactions, **Google Sheet** next to Import connects a sheet whose transactions MyMoney keeps up to date.

1. In Google Sheets press **Share** and set General access to **Anyone with the link** (Viewer). (A sheet published with File, Share, Publish to the web works too.)
2. Paste the link. MyMoney reads the sheet, shows what it found (count, dates, money in and out, three sample rows) and adds nothing until you press Add.
3. From then on it looks again while MyMoney is open: when it opens, every few minutes, when you come back to the tab and when the connection returns. New rows arrive with a toast that has Undo. **Sync now** looks immediately; **Auto** switches the checking off; **Remove** deletes the sheet's transactions and the connection (with Undo).

How the sheet is read: with the same reader as statement files, so it finds the header row itself. It needs Date, Description and Amount (or Debit and Credit). Add a **Type** column (Income or Expense) or use Debit/Credit to avoid guessing: with one Amount column, positive numbers count as money out unless some amounts are negative, in which case the negative ones are money out and the rest money in. The preview shows the sign of each row so a wrong guess is visible before you add anything.

What to know:

- **The sheet is the source of truth** for its rows' date, description and amount. A change you make to one of those rows in MyMoney is replaced by what the sheet says at the next look; **a category you change is kept.** To change a row, change it in the sheet. Rows already imported from a statement file are not added a second time.
- **Safety rules:** a read that finds no transactions never wipes what you have. If a read would remove most of the rows (more than half, and at least 6), it is **not** applied by itself: the old rows stay, the list says why, and Sync now applies it if that is right. Undo puts the old rows back and does not re-apply the same version of the sheet at the next look.
- **"Updated automatically" has limits.** Google cannot tell a web page that a sheet changed, so MyMoney asks. It does that only while MyMoney is open in a tab or app (not when closed), so a change shows up within about 5 minutes of looking, or at once when you come back to the tab. Published-to-web sheets can lag a few more minutes because Google caches them. Live updates when the app is closed would need a server that polls for you, which this version does not have.
- **A link-shared sheet is readable by anyone who has the link.** Do not keep anything in it you would not want a stranger who finds the link to see. Private sheets (needing a Google sign-in) are not supported: that needs a Google Cloud OAuth app and Google's review of the app, which this version does not have.
- **Privacy:** the browser asks Google directly; no MyMoney server sees the sheet. Only docs.google.com is ever contacted. The link is stored with your data, so it is in your backup file and in your MyMoney account if you sign in.
- **Not verified against Google.** The environment this was built in could not reach docs.google.com, so the tests use a scripted stand-in for Google (`npm run e2e:sheets`, `tests/sheets.test.ts`). They check MyMoney's behaviour. They cannot show that Google's CSV addresses allow a request from your site (CORS), or how Google formats dates and numbers in its CSV. MyMoney tries Google's query view (`gviz/tq?tqx=out:csv`) first and the export view (`export?format=csv`) if the browser cannot reach the first. Known Google behaviour to watch for: a column that mixes numbers and text can come back with the minority cells blank. **Try it with one real sheet before relying on it**, and tell me what the message says if it fails.

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

- **No live bank sync.** Connecting to a bank needs a regulated provider in every country (open-banking aggregators in the UK and EU, data aggregators in the US, the Account Aggregator framework in India), which a personal app cannot join directly. Statement import is the supported path; re-importing a file does not duplicate rows.
- **New tax regime only.** 80C / 80D / HRA are not modelled, so PPF and ELSS look less attractive than they would to an old-regime filer.
- **Single device.** Data is in one browser. Use Settings > Download backup, or Copy backup if downloads are blocked.
- **Not investment advice.** The advisor is a transparent rule set (110 minus age for equity share, adjusted for risk). The author is not a SEBI-registered adviser.
- Market-linked holdings need a manually entered current value; there is no NAV or price feed.
- Goal affordability assumes today's income stays flat.

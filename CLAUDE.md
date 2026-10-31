# MyMoney: notes for Claude Code

Personal-finance app: Vite + React + TypeScript, local-first, optional Supabase accounts. See README.md for setup.

## Skills in `.claude/skills/`

Copied from https://github.com/anthropics/skills (commit `ca45fc4`, Apache-2.0, licences included). To update, re-copy the folders from that repo.

- `frontend-design`: general design guidance. In this repo it does **not** override the existing design system. Keep the tokens in `src/styles.css`, the 44px tap targets, one primary button per screen, in-page dialogs and toasts with Undo. Use the skill for new screens and for critiquing, not to restyle what already works.
- `webapp-testing`: written for Python Playwright, which is **not installed here**. This repo's tests use Node Playwright (`npm run e2e`, `e2e:ui`, `e2e:auth`). Write new checks in `e2e/*.cjs` the same way. `scripts/with_server.py` is only useful as a server launcher around those scripts.

- `design-taste-frontend` (taste-skill, MIT, from https://github.com/Leonxlnx/taste-skill at `12af471`, installed with `npx skills add`; pinned in `skills-lock.json`): art direction for landing pages and app screens. It is built to give every project a *new* look, which would fight the design system above. For MyMoney use it for review and for new screens only, through its `references/app-screens.md` run, and keep the existing tokens, palette and type. Do not let it redraw the app's look. It writes scratch files to `.taste-skill/` (git-ignored). Its inspector needs Node 22+ and Chrome/Chromium; its image fetcher (`assets.mjs`) needs network access to public image APIs, which this cloud environment may block.
- `hallmark` (https://github.com/nutlope/hallmark at `4f6a46c`, MIT, pinned in `skills-lock.json`): for **new websites and pages only**, such as a landing page for the app. Never use it on the existing app screens unless the user types `/hallmark redesign <path>`. Its image generation is off unless `TOGETHER_API_KEY` is set, and `scripts/install-hook.mjs` (edits `.claude/settings.json`) has not been run.
- `frontend-design`, `design-taste-frontend` and `hallmark` overlap. If both load for one task, follow the design system first, then use one of them, not both.

## Checks before pushing

`npx tsc --noEmit -p .`, `npx vitest run`, and the e2e suites against a running dev server. Investing is hidden by default; run the suites a second time with `VITE_FEATURE_INVESTING=1` on the server and `INVESTING=1` on the test command.

# MyMoney: notes for Claude Code

Personal-finance app: Vite + React + TypeScript, local-first, optional Supabase accounts. See README.md for setup.

## Skills in `.claude/skills/`

Copied from https://github.com/anthropics/skills (commit `ca45fc4`, Apache-2.0, licences included). To update, re-copy the folders from that repo.

- `frontend-design`: general design guidance. In this repo it does **not** override the existing design system. Keep the tokens in `src/styles.css`, the 44px tap targets, one primary button per screen, in-page dialogs and toasts with Undo. Use the skill for new screens and for critiquing, not to restyle what already works.
- `webapp-testing`: written for Python Playwright, which is **not installed here**. This repo's tests use Node Playwright (`npm run e2e`, `e2e:ui`, `e2e:auth`). Write new checks in `e2e/*.cjs` the same way. `scripts/with_server.py` is only useful as a server launcher around those scripts.

## Checks before pushing

`npx tsc --noEmit -p .`, `npx vitest run`, and the e2e suites against a running dev server. Investing is hidden by default; run the suites a second time with `VITE_FEATURE_INVESTING=1` on the server and `INVESTING=1` on the test command.

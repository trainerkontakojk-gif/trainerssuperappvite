# KETIK Telaah timestamps (Lane C)

## Requirement
Show persisted message times for consumer and agent messages in Telaah, consistent with live chat. Do not invent times for legacy missing/invalid timestamps.

## Design
Render semantic time metadata below each review bubble using the existing local hour/minute format and module foreground tokens. No API, persistence, scoring, or annotation changes.

## Tasklist
- [x] Add hermetic local Playwright regression for both senders and missing/invalid timestamps; confirm RED (missing time element).
- [x] Render valid timestamps in KetikReviewStage.
- [x] Confirm GREEN: `pnpm --dir apps/web exec playwright test e2e/ketik-history-browser.spec.ts --workers=1` — 5 passed. Reviewed screenshot artifacts at 390px and 1280px.
- [x] `pnpm --filter @trainers/web typecheck`, scoped ESLint, and `git diff --check` passed. Impeccable detector returned no findings; source/visual review PASS, no material findings. Build not required for this scoped Lane C fix.

Graphify query identified the review surface/callers. `graphify update .` timed out after 120 seconds; no leftover process. No API/schema or remote changes.

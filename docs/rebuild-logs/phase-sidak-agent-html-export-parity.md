# SIDAK Agent HTML Export Parity

- Implemented snapshot-first HTML shell parity for static and interactive exports.
- Export context now carries selected month, trend range, current quickview, and staff visibility from `/sidak/agents/:id`.
- Profile actions now live in the header block before quickview; exported Refresh/Unduh/Input affordances are inert visual elements, and the separate shell-actions row is gone.
- Both variants include the live page order: header, profile actions + quickview, context snapshot, tabs, summary MonthRail+dossier, trend, six-column benchmark, and grouped findings.
- Static output is a no-JS snapshot; it does not auto-open findings.
- Standalone parity deliberately excludes global application chrome and does not claim exact pixel identity; the file contains the route content surfaces only. Inline CSS is retained for offline portability and file-size stability, with a bounded extraction/refactor as follow-up.
- Live first paint intentionally renders all trend series (superseding stale top-five static behavior). Exports preserve that first paint and add a visually hidden complete semantic trend table.
- The month rail in both exports is a selected-state snapshot, not an interactive control, and now matches the live first-paint spacing/weighting more closely.
- Interactive output adds anchor tabs, trend filters, and root-cause ticket disclosures when data exists.
- CSV and Markdown signatures remain compatible.
- Added escaping/context regression coverage and updated feature export documentation.
- Follow-up recheck (2026-07-28) confirmed the earlier P1 claim about parameter-filter export parity was false for the current live contract: `AgentTrendTab` sets `isFiltered=true` and `hideTotal=true` for parameter views, and `ParamTrendChart` hides the total series while filtering to the selected parameter. Export behavior remains parameter-only for filtered trends.

## Verification

- RED: `pnpm --filter @trainers/web exec vitest run src/__tests__/exportAgentReport.test.ts` — failed 1 new shell parity test before implementation.
- GREEN: focused Vitest — `src/__tests__/exportAgentReport.test.ts`, 42 tests passed.
- Typecheck: `pnpm --filter @trainers/web exec tsc --noEmit` — passed.
- Lint: `pnpm --filter @trainers/web lint` — exit 0; existing warnings remain.
- Graph: `graphify update .` — passed.
- Browser: `pnpm --filter @trainers/web exec playwright test e2e/sidak-agent-html-export-parity.spec.ts --project=chromium` — 1 test passed. Regenerated `artifacts/sidak-agent-report-parity/` (`live-route-1440.png`, `live-route-390.png`, `static-1440.png`, `static-390.png`, `interactive-1440.png`, `interactive-390.png`, `interactive-1440-filtered.png`, `interactive-390-filtered.png`). Live route and export snapshots matched the intended action placement/counts.
- Recheck: focused Vitest, web typecheck, scoped ESLint, `git diff --check`, and `graphify update .` all passed after the parity follow-up.

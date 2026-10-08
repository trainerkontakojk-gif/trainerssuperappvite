# Remove SIDAK Reports AI

Lane D — removes public API endpoints and an AI usage surface.

## Requirement

Fajar: fitur Reports AI tidak digunakan, hapus.

Decisions (2026-10-08):

- Scope: frontend + backend.
- `/sidak/reports` landing is removed; the URL redirects to `/sidak/reports-data`.
- Table `report_archives` stays untouched (no migration, no remote change).

Acceptance:

1. `/sidak/reports` and `/sidak/reports-ai` redirect to `/sidak/reports-data` (old bookmarks keep working).
2. Nav "Laporan" and the SIDAK landing card point to `/sidak/reports-data`.
3. Every former AI/archive endpoint returns 404 for every role:
   `POST /v1/sidak/reports/ai/{generate,export-docx,export-html,export-pdf,chart-data,save}`,
   `GET /v1/sidak/reports/archives`, `GET|DELETE /v1/sidak/reports/archives/:id`.
4. `POST /v1/sidak/reports/data` keeps its gate (`sidak.reports.generate`).

## Design

Web (`apps/web`):

- Delete `routes/sidak/reports-ai.tsx` and `routes/sidak/reports/index.tsx`.
- `router.tsx`: replace both routes with redirect-only routes to `/sidak/reports-data`
  (the target route keeps its own `sidak.reports.view` guard).
- `nav-config.ts` + `routes/sidak/index.tsx`: link to `/sidak/reports-data`.
- `reports-data.tsx`: drop the back link to the removed landing.

API (`apps/api`):

- `routes/sidak/reports.ts`: keep only `POST /reports/data`.
- Delete `services/sidak/ai-report-service.ts`, `services/sidak/report-archives.ts`,
  `getReportChartData` in `report-data.ts`, and `lib/report-{docx,pdf,html}-builder.ts`.
- Drop now-unused deps `docx` and `pdf-lib`.

Types: remove capabilities `sidak.archives.{read,delete,manageAll}` from `packages/types/src/access.ts`.

Not touched: `report_archives` table/migration/rollback, its RLS fixture, `UsageContext` values
(historical usage rows still reference them).

## Tasklist

- [x] RED: `e2e/sidak-reports-removed.spec.ts` (hermetic web redirects + nav link).
- [x] RED: `access-matrix-api.spec.ts` — removed endpoints return 404; drop rows from `helpers/accessMatrix.ts`.
- [x] GREEN: web removal + redirects.
- [x] GREEN: API removal, capabilities, deps.
- [x] Remove tests of deleted code: `e2e/sidak-reports-ai.spec.ts`, `sidak-report-docx-lazy-import.test.ts`,
      AI/archive blocks in `sidak-service.test.ts`, entries in `sidak-decomposition-structural.test.ts`;
      update `main-landmark.spec.ts` route list and remove obsolete back-link locator in `sidak-reports-data.spec.ts`.
- [x] Docs: `docs/modules.md`, `docs/auth-rbac.md`, `docs/qa_report_guidelines.md`.
- [x] thermo-nuclear review; root typecheck, lint, build, focused E2E, `git diff --check`.

## Execution evidence

- Lane D; direct implementation, no delegated worker.
- RED web: `pnpm --filter @trainers/web exec playwright test --config playwright.access-web.config.ts sidak-reports-removed.spec.ts` — exit 1, three expected failures (old URLs and card target).
- RED API: `pnpm --filter @trainers/web exec playwright test --config playwright.access-api.config.ts --project access-matrix -g 'removed SIDAK'` — Playwright exit 1, eight expected failures (400/403 instead of 404).
- GREEN web: same web command — exit 0, **9 passed**. Covers both bookmarks, actual sidebar/card clicks, absence of back link, and destination denial for leader/agent.
- GREEN API: `pnpm --filter @trainers/web exec playwright test --config playwright.access-api.config.ts --project access-matrix` — exit 0, **24 passed**. All nine retired method/path combinations return 404 for four current and four retired roles. Explicit invalid-filter probes preserve the data endpoint gate (admin/trainer/leader 400 validation; agent 403).
- JSON artifacts: `apps/web/test-results/access-web.json`, `apps/web/test-results/access-api.json` (gitignored).
- Additional hermetic regression: **6 passed**, exit 0 — Reports Data actionable rows, filter submission, Excel parity, one main landmark, light/dark responsive screenshots. Used a temporary `.mts` config spreading `playwright.access-web.config.ts`, with absolute `testDir` and `testMatch: ["sidak-reports-data.spec.ts", "main-landmark.spec.ts"]`, filtered by `-g 'Per Layanan hanya|Filter tahun|Excel memakai|Tampilan|reports-data hanya'`; no root dev/API server. JSON: `apps/web/test-results/sidak-reports-regression.json`.
- Regression first exposed a stale touch-target locator for the deleted back link; removed only that locator/constant and reran successfully. Temporary config initially used `.ts` outside the ESM workspace and failed to load; `.mts` resolved the harness-only error.
- `pnpm typecheck --concurrency=1` — exit 0, all four workspaces including web E2E types.
- `pnpm lint --concurrency=1` — exit 0; 8 API + 94 web warnings, no errors.
- `pnpm build --concurrency=1` — exit 0, three build tasks.
- Impeccable scoped audit: **PASS**, detector `detect --json` over changed page/nav targets returned `[]`. Existing screenshot E2E verified zero horizontal overflow at 320/390/768/1440, 44px controls, visible keyboard focus, and mobile bottom clearance. Inspected 390/1440 light/dark top screenshots; no changed-scope visual findings.
- Thermo-nuclear self-review: **PASS**, no remaining P0/P1/P2 findings. Data route validation, gate, participant scope and query are unchanged; deleted exports have no remaining active callers. No independent reviewer claimed.
- Graphify query showed stale historical barrel nodes; live imports/callers used as authority. `graphify update .` completed after integration (local AST only).
- Dependency lock generated with `pnpm install --lockfile-only --offline --ignore-scripts`; unrelated package-manager launcher metadata auto-added by pnpm is removed from the final diff.
- No migrations, remote changes, commits, deployment, or legacy unit suite execution. Original unrelated untracked paths preserved.

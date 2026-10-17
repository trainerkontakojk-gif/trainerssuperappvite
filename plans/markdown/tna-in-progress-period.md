# TNA: periode berjalan (in-progress period)

- **Status:** approved by Fajar 2026-10-17 ("A + C as proposed", with the defaults for every open question); implemented, not committed.
- **Lane:** D. It changes the public TNA API contract (`/tna/parameters`, new `GET /tna/periods`), adds a `trendStatus` value to the D1 table, and changes candidate selection. No schema/RLS/migration.
- **Parent plan:** `plans/markdown/tna-phase-1.md` rev. 7, D1 (metric contract, "do not change without Fajar's approval").

## Requirement

### Observed problem (production, read-only, 2026-10-08)

Service Call, period October 2026 (the current, in-progress month):

| Period   | Audited agents |
| -------- | -------------- |
| Aug 2026 | 27             |
| Sep 2026 | 26             |
| Oct 2026 | 6 (partial)    |

- Two parameters became **candidates** from this thin sample, e.g. "Etika Bertelepon": 4 findings / 30 sampled sessions, spread 66.7%. 6 ≥ `MIN_AUDITED_AGENTS` (5) and 4 ≥ `MIN_FINDINGS` (3), so `insufficientData` is `false` and the absolute gate does not catch it.
- The trend line "Turun 40,6% dari rata-rata periode pembanding" compares a partial month with full months. The number is correct arithmetic but misleading.
- `/tna` defaults to `periods.data[0]`, the latest period, so the misleading view is the first thing a trainer sees.

### What must be true afterwards

1. A trainer opening `/tna` lands on the latest **completed** period by default.
2. When the selected period is still running, the page says so clearly. The API does not produce a trend percentage or candidates from it.
3. The D1 metric definitions stay as they are: `auditedAgents`, `sampledSessions`, `findings`, `ratePer100`, `spreadPct`, the null-vs-zero rule, `auditStatus = no_audit`, and the comparison-period rule. Only the trend/candidate interpretation changes, and only for a running period.
4. Thresholds and period constants live in `apps/api/src/services/tna/thresholds.ts`.
5. Old stored snapshots (`tna_needs.validation_snapshot`, `tna_plans.baseline_snapshot`) still parse.

## Design

### Options evaluated

| Option                                                                                         | Fixes candidates from partial month                                                      | Fixes misleading trend line                                   | Fixes default view | Touches D1                                             | Testable on real backend                        |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------ | ------------------------------------------------------ | ----------------------------------------------- |
| **A. Calendar rule: "berjalan" = current (or later) month in Asia/Jakarta**                    | Yes, always for the running month                                                        | Yes                                                           | With C             | Adds one `trendStatus`; candidate rule gets one clause | Yes: seed a period at the current Jakarta month |
| **B. Relative minimum sample: `auditedAgents < X%` of comparison median → `insufficientData`** | Yes when the month is thin (6/26.5 = 23%); **no** late in the month (e.g. 20/26.5 = 75%) | **No**: trend is still computed, so "Turun 40,6%" still shows | No                 | Changes the `insufficientData` definition              | Yes, fully fixture-driven                       |
| **C. Default selector = latest completed period**                                              | No (user can still pick October)                                                         | No                                                            | Yes                | No                                                     | Yes, if the default is decided by the API       |

B alone fixes only one of the three symptoms and stops working once a running month catches up. C alone hides the problem without fixing it. A targets the actual cause, a period that has not finished. It needs C to fix the landing view.

### Recommendation: A + C (one approach), B not included

**Primary: A + C.** A period is `berjalan` when `(year, month) >= ` the current calendar month in Asia/Jakarta. Otherwise it is `selesai`. The status depends only on the calendar, not on the data, so it is easy to explain ("periode masih berjalan") and does not depend on a tunable percentage.

**No second fallback.** B is documented above as the alternative if Fajar prefers not to add a calendar rule. It is not a runtime fallback. See the open questions: B is the one thing A does not cover, a _completed_ month whose audits are still being entered in the first days of the next month.

### A. API contract changes

Shared (`packages/types/src/tna.ts`):

- `tnaPeriodStatusSchema = z.enum(["berjalan", "selesai"])`.
- `tnaTrendStatusSchema` gains `"period_in_progress"`. This is the only D1 table change.
- `tnaMetricsSnapshotSchema` gains `periodStatus: tnaPeriodStatusSchema.optional()`. It is optional so snapshots stored before this change still parse. It is **not** added to `tnaPeriodMetricsSchema`, because `population` in the evaluation snapshot is `.strict()`.
- `tnaParametersResponseSchema` gains `selected_period_status: tnaPeriodStatusSchema`.
- New `tnaPeriodOptionSchema` (`id`, `month`, `year`, `status`, `is_default`), `.strict()`, mirroring `tnaEvaluationPeriodOptionSchema`.

Backend (`apps/api/src/services/tna/`):

- `thresholds.ts`: `PERIOD_TIMEZONE_OFFSET_HOURS = 7` (Asia/Jakarta has no DST; same convention as `listTnaPlans` in `read-service.ts`).
- `metrics.ts`: pure `periodStatus(period, now)` that compares `year * 12 + month` with the Jakarta month of `now`.
- `computeTrend` order becomes `no_current_audit` → **`period_in_progress`** → `no_comparison_data` → the rest. For `period_in_progress`: `trendPct = null`, while `comparisonRatePer100` is still returned for context. `no_audit` keeps precedence, so the null-vs-zero/no_audit rule is unchanged.
- `computeSignals`: because the trend status is not `computed`/`new_from_zero`, `naik` is never emitted for a running period. `tersebar`/`kritikal` are still reported as descriptive signals.
- `buildSnapshot`: `isCandidate = periodStatus === "selesai" && <existing rule>`. Sets `periodStatus`.
- `loadTnaParameterContext` / `listTnaParameters` / `getTnaParameterAnalysis`: thread `now` (already an optional arg) into the status calculation. The routes pass the request time.
- New `GET /tna/periods` (`tna.read`): every `qa_periods` row, newest first, with `status` and `is_default`. The default is the newest `selesai` period, or the newest period when none is `selesai`. The service owns the rule, and the frontend only reads `is_default` (backend-first).
- `narrative.ts`: a `period_in_progress` sentence, "tren belum dihitung karena periode masih berjalan". The rate/spread sentence stays.

Need creation (`createTnaNeed`): unchanged by default. A trainer can still validate a need on a running period (for example an urgent critical finding), and the frozen `validation_snapshot` records `periodStatus: "berjalan"`. See the open questions.

### C. UI (`apps/web/src/routes/tna/`)

- `index.tsx`: the period list comes from `GET /tna/periods` instead of `/sidak/periods`. The default is the `is_default` option. A running period is labelled in the select ("Oktober 2026 — berjalan").
- When `selected_period_status === "berjalan"`, show a `QaStatePanel` warning: "Periode ini masih berjalan" / "Data audit belum lengkap. Tren dan kandidat belum dihitung sampai periode selesai."
- `utils.ts` `trend()`: `period_in_progress` → "Tren belum dihitung; periode masih berjalan".
- `parameter.tsx`: the same banner and trend text.

### Verification (E2E, RED-first)

New `apps/web/e2e/tna-period-status-api.spec.ts` in the `tna-real-backend` project (local Supabase only), reusing `createTnaFixture`:

1. **RED → GREEN, running month:** the spec inserts a `qa_periods` row for the current Jakarta month (computed with the same +7h rule) and seeds a fixture indicator with a strong signal: ≥ 5 audited agents, ≥ 3 findings, spread ≥ 10%. `GET /tna/parameters?scope=all` must return `selected_period_status: "berjalan"`, and for that indicator `periodStatus: "berjalan"`, `trendStatus: "period_in_progress"`, `trendPct: null`, `isCandidate: false`, and no `naik` signal. `scope=candidates` must not list it. The spec owns the current and next Jakarta-month periods and fails closed if either already exists locally; it deletes only rows it created. The no_audit case uses `compare_count=1` so its parameter universe is fixture-only (a non-fixture local period carries non-RFC-4122 indicator ids that fail response validation, which this change did not cause).
2. **Regression, completed month:** the same seeding on a fixture period from a past year → `selesai`, trend computed, `isCandidate: true`. This proves the rule does not weaken completed periods.
3. **no_audit precedence:** a running period with no audit → `trendStatus: "no_current_audit"`, rate/spread `null`.
4. **`GET /tna/periods`:** the current-month period has `status: "berjalan"`, `is_default: false`. Exactly one option has `is_default: true`, and it is the newest `selesai` period.
5. **Stored snapshot compatibility:** a need created before the change (snapshot without `periodStatus`) still loads through `GET /tna/needs/:id`.

Command (one run at a time, local Supabase only):

```bash
pnpm --filter @trainers/web exec playwright test --config playwright.api.config.ts --project=tna-real-backend tna-period-status-api.spec.ts
```

**Gaps E2E cannot cover without a clock (needs Fajar's decision):** the boundary at 17:00 UTC on the last day of a month (Jakarta has already rolled over), and the 1st of a month. The in-process API uses the real clock, and adding a test-only clock override to production code is not proposed. Options: accept code review only, or Fajar approves one isolated pure test of `periodStatus(period, now)`.

**UI:** the hermetic browser specs (`tna-flow.spec.ts`) run under the default Playwright config, which starts root `pnpm dev` against hosted Supabase, so they are not run in this task. UI changes are verified by typecheck plus a manual check in the local preview if Fajar wants one.

## Decisions (Fajar, 2026-10-17)

A + C. Needs stay allowed on running periods; N = 0 days; evaluation options are a follow-up; the clock boundary is covered by code review only. The original questions:

1. **Approach:** A + C (recommended), B only, or A + C + B?
2. **Need creation on a running period:** allow and record `periodStatus` (default), or reject with a business error (`TNA_PERIOD_IN_PROGRESS`)?
3. **Late-entered audits:** should a completed month stay `berjalan` for the first N days of the next month (e.g. until day 5)? If yes, N goes into `thresholds.ts`. The default proposal is N = 0, pure calendar.
4. **Evaluation period options:** `getTnaEvaluationPeriodOptions` can also default to the running month. Fix it in this change (same helper) or as a follow-up?
5. **Clock boundary:** code review only, or approve one isolated pure test of `periodStatus`?

## Tasklist

- [x] Fajar picks the approach and answers the open questions.
- [x] Graphify query for `computeTrend`, `buildSnapshot`, `TnaParametersResponse` callers.
- [x] RED: write `tna-period-status-api.spec.ts` cases 1–5; run and capture the failures.
- [x] Types: `tnaPeriodStatusSchema`, trend enum value, optional `periodStatus`, `selected_period_status`, `tnaPeriodOptionSchema`.
- [x] Backend: `PERIOD_TIMEZONE_OFFSET_HOURS`, `periodStatus()`, `computeTrend`/`buildSnapshot` changes, `GET /tna/periods`, narrative sentence.
- [x] GREEN: rerun the spec; then rerun `tna-metrics-api`, `tna-needs-api`, `tna-plan-api`, and `tna-evaluation-*-api` (one run at a time) for regressions.
- [x] UI: period source and default, banner, trend text on `/tna` and `/tna/parameter`.
- [x] Update D1 in `plans/markdown/tna-phase-1.md` (trend table row + candidate clause) and `docs/architecture.md` if it documents the TNA contract.
- [x] `pnpm --dir apps/api exec tsc --noEmit -p tsconfig.json`, `pnpm --filter @trainers/web exec tsc --noEmit`, lint on touched files, `git diff --check`.
- [x] `thermo-nuclear` review.
- [x] CHANGELOG entry.
- [ ] Commit/push after Fajar's go-ahead.
- [ ] Follow-up: default evaluation period options (`getTnaEvaluationPeriodOptions`) to a completed month.

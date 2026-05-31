# Phase 90 — Mega Maintainability Refactor: Profiler, Settings, Types, Scripts & Tests

## Summary
Massive maintainability decomposition across 5 areas: Profiler pages (export/slides/table), SIDAK Settings, `packages/types` barrel, data integrity scripts, and API test suites (RLS, SIDAK dashboard, data integrity). ~9,081 lines removed from monolithic files, ~38 new files created. Pure decomposition — zero logic change.

## Changes

### 1. Profiler Page Decomposition (export, slides, table)
3 monolithic route components (~2,982 total lines → ~1,170 lines). Inline constants, helpers, and rendering logic extracted into 11 new component files, 1 hook, and 5 utility files.

**Modified files:**
- `apps/web/src/routes/profiler/export.tsx` — 1,490→28 lines (barrel page)
- `apps/web/src/routes/profiler/slides.tsx` — 682→~200 lines (barrel page)
- `apps/web/src/routes/profiler/table.tsx` — 810→~200 lines (barrel page)

**New files:**
- `apps/web/src/routes/profiler/components/export/ProfilerExportToolbar.tsx`
- `apps/web/src/routes/profiler/components/export/ProfilerExportGrid.tsx`
- `apps/web/src/routes/profiler/components/export/ProfilerExportCard.tsx`
- `apps/web/src/routes/profiler/components/slides/ParticipantSlide.tsx`
- `apps/web/src/routes/profiler/components/slides/SlideCanvas.tsx`
- `apps/web/src/routes/profiler/components/slides/SlideModeControls.tsx`
- `apps/web/src/routes/profiler/components/table/ProfilerTableView.tsx`
- `apps/web/src/routes/profiler/components/table/ProfilerTableFilters.tsx`
- `apps/web/src/routes/profiler/components/table/EditPesertaModal.tsx`
- `apps/web/src/routes/profiler/components/table/MoveFolderModal.tsx`
- `apps/web/src/routes/profiler/hooks/useProfilerExport.tsx`
- `apps/web/src/routes/profiler/utils/profilerFormatters.ts`
- `apps/web/src/routes/profiler/utils/profilerExportUtils.ts`
- `apps/web/src/routes/profiler/utils/profilerPdfExport.ts`
- `apps/web/src/routes/profiler/utils/profilerPptxExport.ts`
- `apps/web/src/routes/profiler/utils/profilerSlideHtml.ts`
- `apps/web/src/__tests__/profiler-formatters.test.ts` — formatter unit tests

### 2. SIDAK Settings Page Decomposition
`settings.tsx` reduced from 416→44 lines. Inline constants and modals extracted into dedicated components.

**Modified files:**
- `apps/web/src/routes/sidak/settings.tsx` — 416→44 lines

**New files:**
- `apps/web/src/routes/sidak/settings/constants.ts` — SERVICE_LABELS, CAT_LABEL, CAT_COLOR, formatPeriodLabel
- `apps/web/src/routes/sidak/settings/components/RuleVersionPicker.tsx`
- `apps/web/src/routes/sidak/settings/components/ServiceWeightsPanel.tsx`
- `apps/web/src/routes/sidak/settings/components/RuleIndicatorsPanel.tsx`
- `apps/web/src/routes/sidak/settings/components/PublishRulePanel.tsx`

### 3. packages/types Barrel Decomposition
`packages/types/src/index.ts` reduced from 1,158→9 lines (pure re-export barrel). Types split into 8 domain files:

**Modified files:**
- `packages/types/src/index.ts` — 1,158→9 lines

**New files:**
- `packages/types/src/common.ts`
- `packages/types/src/sidak.ts`
- `packages/types/src/ketik.ts`
- `packages/types/src/pdkt.ts`
- `packages/types/src/telefun.ts`
- `packages/types/src/ai.ts`
- `packages/types/src/profiler.ts`
- `packages/types/src/admin.ts`

### 4. Data Integrity Script Decomposition
`scripts/data-integrity-checker.ts` reduced from 1,072→137 lines (thin CLI wrapper). Logic extracted into sub-modules:

**Modified files:**
- `scripts/data-integrity-checker.ts` — 1,072→137 lines

**New files:**
- `scripts/data-integrity/types.ts`
- `scripts/data-integrity/runner.ts`
- `scripts/data-integrity/dummy-detector.ts`
- `scripts/data-integrity/duplicate-detector.ts`
- `scripts/data-integrity/name-consistency.ts`
- `scripts/data-integrity/foto-checker.ts`

### 5. API Test Restructuring

**RLS Tests:** `rls-verification.test.ts` reduced from 1,309→181 lines (smoke-only). Config + logic extracted to shared fixtures + 3 per-pattern test files:
- `apps/api/src/__tests__/fixtures/rls-config.ts` — 839 lines
- `apps/api/src/__tests__/helpers/rls-policy-evaluator.ts` — 154 lines
- `apps/api/src/__tests__/rls-owner-only.test.ts` — new
- `apps/api/src/__tests__/rls-role-based.test.ts` — new
- `apps/api/src/__tests__/rls-mixed-access.test.ts` — new
- `apps/api/src/__tests__/rls-verification.test.ts` — 1,309→181 lines

**SIDAK Dashboard Tests:** `sidak-service-dashboard.test.ts` deleted (1,012 lines). Replaced by 4 focused tests + shared fixtures:
- `apps/api/src/__tests__/helpers/sidak-dashboard-fixtures.ts` — shared fixtures
- `apps/api/src/__tests__/sidak-dashboard-available-services.test.ts` — new
- `apps/api/src/__tests__/sidak-dashboard-critical-parity.test.ts` — new
- `apps/api/src/__tests__/sidak-dashboard-mv-fallback.test.ts` — new
- `apps/api/src/__tests__/sidak-dashboard-soft-delete.test.ts` — new
- `apps/api/src/__tests__/sidak-dashboard-parity.test.tsx` — new web test

**Data Integrity Tests:** `data-integrity-checker.test.ts` deleted (1,299 lines). Replaced by 3 focused tests:
- `apps/api/src/__tests__/data-integrity-dummy-detector.test.ts` — new
- `apps/api/src/__tests__/data-integrity-duplicate-detector.test.ts` — new
- `apps/api/src/__tests__/data-integrity-name-consistency.test.ts` — new

## Stats
- **9 modified** files (+170 / -9,081)
- **2 deleted** files (data-integrity-checker.test.ts, sidak-service-dashboard.test.ts)
- **~38 new files** across 6 categories
- **Zero logic change** — pure extraction and restructuring

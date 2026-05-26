# Phase 61: SIDAK Input Period + Temuan Legacy Refresh

**Date:** 2026-05-27

## Summary

Full legacy parity refresh for SIDAK Input page (`/sidak/input`) starting from period step onward. Audit found 7 critical gaps vs legacy `QaInputClient.tsx`. All 7 gaps resolved.

### Gaps Fixed

| # | Gap | Severity | Fix |
|---|-----|----------|-----|
| G1 | No service weights fetch from API — used hardcoded defaults | CRITICAL | Added `fetchWeights()` + `activeWeight` state |
| G2 | `liveScore` always mode-weighted without `flat`/`no_category` branching | CRITICAL | Replaced inline score with `calculateQAScoreFromTemuan` from `scoring.ts` |
| G3 | Service change didn't refetch temuan — only `refetchIndicators()` | CRITICAL | Created `handleServiceChange` with 3-fetch (indicators+weights+temuan) |
| G4 | `scoringMode` not passed to `IndicatorDropdown` in form | HIGH | Fixed `input.tsx` to pass `scoringMode` prop |
| G5 | `handlePeriodClick` didn't fetch indicators/weights — only temuan | HIGH | Added `Promise.all` fetch for weights + indicators before temuan |
| G6 | No `is_phantom_padding = false` filter | MEDIUM | Added phantom padding awareness in request |
| G7 | No client-side duplicate check in manual form | MEDIUM | Added duplicate detection before submit |
| G8 | No category chip + NILAI_LABELS in TemuanGroupCard | MEDIUM | Added category chip, NILAI_LABELS badge, session numbering |

### Files Modified

| File | Changes |
|------|---------|
| `apps/web/src/lib/scoring.ts` | Added `resolveServiceTypeFromTeam`, `calculateQAScoreFromTemuan` (mode-aware), `NILAI_LABELS`, `NILAI_BADGE_COLORS` |
| `apps/web/src/routes/sidak/input.tsx` | Added `activeWeight` state, `handleServiceChange`, `resolveServiceTypeFromTeam`, `calculateQAScoreFromTemuan`, `categoryMap`, `scoringMode` pass-through, client-side duplicate check, leader role guard |
| `apps/web/src/components/sidak/TemuanGroupCard.tsx` | Session number (gIdx), category chip (Critical/Non-Critical), NILAI_LABELS, canEdit prop, legacy edit panel |

### Files Created

| File | Purpose |
|------|---------|
| `apps/web/src/components/sidak/SidakInputScoreCard.tsx` | Mode-aware score card (weighted→NC/CR split, flat→flat panel, no_category→BKO) |
| `apps/web/src/components/sidak/SidakInputManualForm.tsx` | Legacy manual form with subtitle, full-width parameter button, scoringMode pass |
| `apps/web/src/components/sidak/SidakInputImportPanel.tsx` | Legacy import panel with tips, file state, card summary, card preview, duplicate banner |
| `apps/web/src/__tests__/sidak-input-legacy-refresh.test.tsx` | 20 regression tests for scoring helpers, component contracts |

### Test Results

| Suite | Count |
|-------|-------|
| Web sidak-input tests | 3 files, 52 tests passed (32 existing + 20 new) |
| API full suite | 25 files, 407 tests passed, 4 skipped |
| TypeScript | 0 errors |

### Key Decisions

1. **state `serviceOverride` not needed** — `selectedService` serves double duty (default + override)
2. **`annotateImportRowDuplicates` deferred** — server-side preview duplicate detection already sufficient
3. **Clean-session CTA (Sesi Tanpa Temuan) deferred** — backend endpoint not available
4. **Scoring computation moved from inline to `scoring.ts`** — prevents future drift
5. **Weight fallback**: if API fetch fails, `activeWeight` stays null gracefully instead of hard crash

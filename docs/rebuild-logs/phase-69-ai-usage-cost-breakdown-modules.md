# Phase 69: AI Usage Cost Breakdown in Module Usage Buttons & Modals

**Date**: 2026-05-28
**Status**: DONE

## Summary

Extended the per-module usage display (KETIK, PDKT, Telefun) to show simulation vs review cost breakdown — matching the monitoring page's "Biaya Simulasi" / "Biaya Penilaian AI" separation. Added post-simulation cost toast notifications so users see `+RpX` immediately after completing a session. Upgraded the shared `UsageModal` with two new KPI cards and a split in the session delta section.

## Changes

### Backend (1 file)

- **`apps/api/src/routes/ai.ts`** — Extended `GET /ai/usage/summary` to return `simulationCostIdr` and `reviewCostIdr` alongside existing fields. Uses existing `SIMULATION_ACTIONS` / `REVIEW_ACTIONS` constant sets to categorize each log's `action`.

### Frontend Types (1 file)

- **`apps/web/src/lib/usage-snapshot.ts`** — Added `simulationCostIdr` and `reviewCostIdr` to both `UsageSnapshot` and `UsageDelta` interfaces. Updated `computeUsageDelta()` to compute the breakdown (with graceful fallback when fields are absent).

### UsageModal (1 file)

- **`apps/web/src/components/UsageModal.tsx`** — Added two new KPI cards below "Estimasi Biaya Bulan Ini":
  - **Biaya Simulasi** (green accent, Zap icon) — "Chat, email, panggilan suara"
  - **Biaya Penilaian AI** (amber accent, Sparkles icon) — "Evaluasi, coaching, analisis suara"
  - Session delta section now shows `Simulasi +RpX | Penilaian AI +RpY` split when available.

### Post-Simulation Toast (3 files)

- **`apps/web/src/routes/ketik/index.tsx`** — Extended baseline capture with new fields. Added `notify.success` toast in `endSession()` and `handleReviewComplete()` after `pollUsageDelta()` resolves: `"Biaya sesi ini: +RpXrb | Simulasi Rp... | Penilaian AI Rp..."`.
- **`apps/web/src/routes/pdkt/index.tsx`** — Extended `captureUsageBaseline()` and `fetchPdktSummary()` with new fields. Added toast in `computeUsageDeltaNow()`.
- **`apps/web/src/routes/telefun/index.tsx`** — Extended baseline capture and inline polling fetcher with new fields. Added toast in `handleRecordingReady()` after delta resolves.

### Tests (2 new files, 1 updated)

- **`apps/api/src/__tests__/ai-usage-summary-breakdown.test.ts`** (NEW) — 3 API tests: verifies breakdown fields returned, handles non-matching actions, handles empty logs.
- **`apps/web/src/__tests__/usage-modal-breakdown.test.tsx`** (NEW) — 4 component tests: renders simulation/review cards, shows delta split, shows pending state, hides cards when values are 0.
- **`apps/web/src/__tests__/usage-snapshot.test.ts`** (UPDATED) — Updated all existing tests for new type shape. Added 2 new tests for simulation/review delta computation.

## Test Results

- **API**: 460 passed, 4 skipped, 0 failed
- **Web**: 431 passed, 2 failed (pre-existing timeout flakes in access-groups-parity, route-guards)
- **New tests**: 9 (3 API + 4 component + 2 unit)

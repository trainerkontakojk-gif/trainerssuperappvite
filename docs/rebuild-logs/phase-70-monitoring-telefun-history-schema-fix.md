# Phase 70: Monitoring Telefun History Schema Fix

**Date**: 2026-05-28
**Status**: DONE

## Summary

Fixed `GET /api/v1/ai/monitoring/history` and `GET /api/v1/ai/monitoring/history/telefun/:id/review` so Telefun queries read the actual Vite schema columns instead of legacy aliases. Root cause: `monitoring-history-service.ts` was querying `telefun_history` with column names `date`, `duration`, and `recording_url` — none of which exist in the Vite schema. The correct columns are `created_at`, `duration_seconds`, and `recording_path` (from `003_telefun_core.sql` and parity extensions).

## Changes

### Backend

- **`apps/api/src/services/monitoring-history-service.ts`** — Updated Telefun history query: select `created_at` (was `date`), `duration_seconds` (was `duration`), `recording_path` (was `recording_url`). Order changed from `date` to `created_at`. Row mapping updated to read `row.created_at`, `row.duration_seconds`, `row.recording_path`. Fixed TS2345 null safety in score fallback.
- **`apps/api/src/routes/ai.ts`** — Updated `/monitoring/history/telefun/:id/review` query and response keys: select `recording_path`/`duration_seconds` (was `recording_url`/`duration`), return `recording_path`/`duration_seconds` in JSON response.

### Frontend

- **`apps/web/src/routes/monitoring/components/TelefunReviewPanel.tsx`** — Updated `TelefunReviewData` interface and all usages: `recording_url` → `recording_path`, `duration` → `duration_seconds`.

### Tests

- **`apps/api/src/__tests__/monitoring-history-service.test.ts`** — NEW: 5 tests verifying correct column selection (`created_at`, `duration_seconds`, `recording_path`), ordering by `created_at`, row mapping, and 200-like response shape with empty KETIK/PDKT/results.
- **`apps/api/src/__tests__/monitoring-history-enrichment.test.ts`** — Updated mock `telefun_history` data: `date`→`created_at`, `duration`→`duration_seconds`, `recording_url`→`recording_path`.

## No Migration Required

The DB schema already uses `created_at`, `duration_seconds`, and `recording_path` — the bug was entirely in the query contract. No Supabase migration is needed.

## Test Results

- `monitoring-history-service.test.ts`: 5/5 PASS
- `monitoring-history-enrichment.test.ts`: 8/8 PASS
- `telefun-routes.test.ts`: 6/6 PASS
- `ai-usage-summary-breakdown.test.ts`: 3/3 PASS
- API TypeScript build (`tsc --noEmit`): CLEAN

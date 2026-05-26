# Phase 57 — SIDAK Import Duplicate Logic Fix, no_tiket Passthrough & Response Crash

**Status:** DONE
**Date:** 2026-05-26
**Type:** Bug Fix + Data Integrity

## Summary

3 perbaikan pada flow import SIDAK:
1. **no_tiket passthrough** — Excel import tadinya hardcoded `null` untuk no_tiket, sekarang diteruskan dari Excel ke batch payload
2. **Duplicate detection** — dedup key diperluas dari `no_tiket::indicator_id` menjadi `no_tiket::indicator_id::service_type` (frontend & backend) + DB-level partial unique index
3. **reverse() crash** — response `created` sekarang bertipe `{ inserted, skipped, total }` bukan `QATemuan[]`, menghapus `.reverse()` yang crash

## Files Modified

| File | Change |
|------|--------|
| `apps/api/src/services/sidak-service.ts` | Core: no_tiket cascading fallback, composite dedup key, intra-batch `seenInBatch` Set |
| `apps/api/src/__tests__/sidak-service.test.ts` | +4 tests: duplicate detection, no_tiket passthrough, empty ticket bypass |
| `apps/web/src/routes/sidak/input.tsx` | Frontend: `importItems` includes `no_tiket`, removed `.reverse()`, fresh GET after save |
| `apps/web/src/lib/excel-utils.ts` | `ParsedRow` + `service_type`, dedup key `no_tiket\|indicator_id\|service_type` |
| `apps/web/src/__tests__/excel-utils.test.ts` | +cross-service dedup test, service_type in test data |
| `apps/web/src/__tests__/sidak-import-response.test.ts` | NEW: payload contract tests |
| `packages/types/src/index.ts` | Schema: `no_tiket` field in import type |
| `supabase/migrations/20260527000000_*.sql` | NEW: partial unique index `uq_qa_temuan_duplicate_input` |
| `supabase/rollbacks/rollback_20260527000000.sql` | NEW: rollback for migration |
| `docs/database.md` | Migration entry added |
| `AGENTS.md`, `GEMINI.md` | Phase 57 entry |

## DB Migration

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_qa_temuan_duplicate_input
  ON public.qa_temuan (peserta_id, period_id, service_type, LOWER(TRIM(no_tiket)), indicator_id)
  WHERE is_phantom_padding = false AND no_tiket IS NOT NULL AND TRIM(no_tiket) != '';
```

## Test Results

- **API**: 24/24 files — 400 passed, 4 skipped
- **Web**: 39/41 files — 316 passed, 2 failed (pre-existing timeout flaky)

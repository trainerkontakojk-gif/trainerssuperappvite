# Phase — SIDAK Period Filter UUID Range Fix

## Summary

Bug: halaman detail SIDAK Personal Audit menampilkan "Data belum tersedia" dan chart terus loading untuk filter bulan Januari–Juni, padahal data ada di database. Root cause: query filter rentang bulan memakai `.gte("period_id", ...)` / `.lte("period_id", ...)` pada kolom UUID, sehingga perbandingan leksikografis tidak mencerminkan urutan bulan yang benar.

## Root Cause

Di `apps/api/src/services/sidak/agent-directory.ts`:

```ts
q.gte("period_id", startPeriodId)   // ❌ UUID bisa "bb... > ff..." walaupun bulan 06 > 01
q.lte("period_id", endPeriodId)
```

Pola yang sama juga ditemukan di `apps/api/src/services/sidak/report-data.ts` dan sudah diperbaiki dalam patch yang sama.

## Fix

Ganti filter range UUID dengan filter membership himpunan:

```ts
const periodIdsInRange = periods
  .filter((period) => period.year === year)
  .filter((period) => startMonth === undefined || period.month >= startMonth)
  .filter((period) => endMonth === undefined || period.month <= endMonth)
  .map((period) => period.id);

q.in("period_id", periodIdsInRange)  // ✅ filter berdasarkan himpunan period yang benar
```

## Files Changed

| File | Status | Description |
|------|--------|-------------|
| `apps/api/src/services/sidak/agent-directory.ts` | Modified | Ganti `gte/lte(period_id)` dengan `in(periodIdsInRange)` |
| `apps/api/src/services/sidak/report-data.ts` | Modified | Ganti pattern query inline dengan `getPeriods()` + filter in-memory |
| `apps/api/src/__tests__/sidak-agent-detail-pagination.test.ts` | Modified | Tambah regression test UUID tidak urut untuk agent detail |
| `apps/api/src/__tests__/sidak-report-data-pagination.test.ts` | Modified | Tambah regression test UUID tidak urut untuk report data |

## Test Results

- **9/9 targeted tests passing** (3 files: agent detail pagination + score source + report data pagination)
- **Lint: 0 error** (5 pre-existing warnings)
- **Build: pass** (tsc)

## Live Verification

Agent Arie Wahyu Setiawan, Jan–Jun 2026:

- `getAgentDetail`: 37 temuan, 7 period summaries (Jan call–Jun email)
- `getDataReportRows`: 37 rows, trend data Jan–Jun dengan distribusi benar
- 5 agent lain juga diverifikasi dan semua mengembalikan data sesuai period masing-masing

## Lessons Learned

**Never use `.gte()` / `.lte()` on UUID columns** to represent ordinal ranges. UUIDs are not ordered by month or any business logic. The correct pattern is:
1. Load all periods for the target year
2. Filter by month in memory using JavaScript `.filter()`
3. Build a set of valid period IDs
4. Use `.in("period_id", validPeriodIds)` in the database query

## Audit Result

After the fix, `grep -r "\.gte(\"period_id\"\|\.lte(\"period_id\"" apps/api/src` returns **0 matches** — pattern clean across the API.

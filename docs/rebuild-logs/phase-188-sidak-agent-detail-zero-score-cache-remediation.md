# Phase 188: SIDAK Agent Detail Zero Score Cache Remediation

## Problem

Agent `a81a4bb0-e4a5-4b9f-a666-f61e629f548c` menampilkan skor `0.0%` untuk Januari-Maret 2026 pada halaman agent detail, meskipun data live menunjukkan 7-8 tiket nyata per bulan dengan nilai 1-2.

## Root Cause

| Lapisan           | Penyebab                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration refresh | `20260525000100_sidak_dashboard_summary_vite_schema_refresh.sql` menulis `final_score`/`non_critical_score`/`critical_score` literal `0` ke `qa_dashboard_agent_period_summary` |
| Phase 109         | `getAgentDetail()` membaca `qa_dashboard_agent_period_summary` dan mempercayai cache sebagai source of truth                                                                    |
| Tidak ada test    | Tidak ada regression test dengan poison cache `0` untuk memvalidasi bahwa raw scoring tetap menang                                                                              |

## Data Sebelum Perbaikan

| Bulan    | Cache Score | Tiket Real |
| -------- | ----------: | ---------: |
| Januari  |        0.0% |          8 |
| Februari |        0.0% |          8 |
| Maret    |        0.0% |          7 |
| April    |       96.3% |          6 |
| Mei      |       98.7% |          4 |

## Changes

### New Files

- `apps/api/src/services/sidak/period-scoring-context.ts` — Canonical typed resolver untuk rule version, snapshot indicators, service weights, dan normalization ID (`rule_indicator_id`/`legacy_indicator_id`/master indicator). Berisi:
  - `loadPeriodScoringContext()` — resolve effective rule version + fetch snapshot indicators + build ID map
  - `normalizePeriodScoringRows()` — normalisasi score rows dengan ID map
  - `mergeServiceWeights()` — merge DB overrides dengan defaults

- `apps/api/src/__tests__/sidak-period-scoring-context.test.ts` — 13 pure/boundary unit tests untuk context loading, ID normalization, fallback rules, weight merging, dan invariant bahwa ID snapshot yang dinormalisasi benar-benar dikonsumsi scoring engine

- `apps/api/src/__tests__/sidak-agent-detail-score-source.test.ts` — 3 regression tests dengan poison cache `0` yang membuktikan:
  1. Cache `qa_dashboard_agent_period_summary` tidak di-query (assertion via `cacheQueried === false`)
  2. Januari-Maret mengembalikan skor > 0 (bukan poison `0`)
  3. Phantom padding semantics tetap terjaga
  4. Response contract stabil

### Modified Files

- `apps/api/src/services/sidak/agent-directory.ts` — **Remove cache read path**: hapus query `qa_dashboard_agent_period_summary` dan branch cache-vs-raw; partition rows by `(period_id:service_type)`, resolve contexts concurrently via `loadPeriodScoringContext`, normalize rows via `normalizePeriodScoringRows`, calculate via `calculateQAScoreFromTemuan`. Gunakan `mergeServiceWeights` untuk resolved weights.

- `apps/api/src/services/sidak/temuan-service.ts` — **Replace duplicate resolvers**: ganti `getRuleWeight()`/`getRuleIndicators()` inline functions dengan `loadPeriodScoringContext` + context cache per `(service_type, period_id)` combo di `refreshDashboardSummary()`.

- `apps/api/src/services/sidak/dashboard-data.ts` — Gunakan context resolver dan row normalizer yang sama untuk kalkulasi dashboard sehingga rule snapshot tidak memiliki implementasi ID mapping kedua.

- `apps/api/src/services/sidak/dashboard-types.ts` — Tambahkan `rule_indicator_id` pada raw temuan boundary.

- `apps/api/src/services/sidak-service.ts` — Add export for `period-scoring-context`.

- `apps/api/src/__tests__/sidak-agent-detail-weights.test.ts` — Replace copy-pasted `resolvedWeights` implementation with tests of production `mergeServiceWeights()`.

### No Changes

- Frontend: zero changes. `MonthRail`, `ScoreDetailCard`, `useAgentDetail` unchanged.
- Database: zero changes. `qa_dashboard_agent_period_summary` retained for compatibility/backfill.
- Scoring formula: zero changes. `calculateQAScoreFromTemuan` untouched.

## Data Setelah Perbaikan

Verifikasi langsung pada 8 Juni 2026 melalui production service
`getAgentDetail("a81a4bb0-e4a5-4b9f-a666-f61e629f548c", 2026, "call", 1, 6)`
yang membaca hosted Supabase project `ruosnjmtywcrghjgqugz`:

| Bulan    | Skor API | Temuan | Sesi |
| -------- | -------: | -----: | ---: |
| Januari  |   95.67% |     10 |    8 |
| Februari |   94.67% |      8 |    8 |
| Maret    |   95.00% |     10 |    7 |
| April    |   96.33% |      9 |    6 |
| Mei      |   98.67% |      4 |    4 |

April dan Mei tetap sama dengan nilai sebelum remediation. Januari-Maret tidak lagi
terkontaminasi placeholder cache `0`.

## Quality Gates

| Gate                         | Status                                 |
| ---------------------------- | -------------------------------------- |
| Targeted API tests (7 files) | 75 PASS                                |
| API build (`tsc`)            | PASS                                   |
| Core tests                   | API 111 + Web 51 + Telefun 13 PASS     |
| Lint                         | PASS, 0 errors (179 existing warnings) |
| Diff hygiene                 | PASS                                   |

## Files Modified Total

- 4 new files, 10 modified files, 14 total

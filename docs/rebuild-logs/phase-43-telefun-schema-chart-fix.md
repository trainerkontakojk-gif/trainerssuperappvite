# Phase 43: Telefun Schema & Recharts Dimension Guard Fix

> **Date:** 2026-05-25
> **Plan:** `plan/markdown/telefun-fix-schema-chart.md`
> **Artifacts:** `supabase/migrations/20260525000300_telefun_history_add_consumer_contact_columns.sql`

## Executive Summary

**Verdict: PARTIAL (implementation done, 1 pre-existing web test still failing)**

Target fix untuk produksi mencakup dua area:
1. **Schema guard Telefun** untuk menangani drift kolom `telefun_history` (termasuk error terbaru `disruption_config` tidak ditemukan).
2. **Recharts dimension guard** pada komponen chart yang rentan saat layout transien.

---

## Technical Details

### 1. Schema Sync
- Created a new migration file: `supabase/migrations/20260525000300_telefun_history_add_consumer_contact_columns.sql`.
- Migration bersifat idempoten (`ADD COLUMN IF NOT EXISTS`) untuk kolom parity Telefun yang dipakai route:
  - `consumer_phone`, `consumer_city`
  - `recording_path`, `agent_recording_path`
  - `voice_assessment`, `session_metrics`, `voice_dashboard_metrics`
  - `disruption_config`, `disruption_results`, `persona_config`
  - `realistic_mode_enabled` (`BOOLEAN NOT NULL DEFAULT FALSE`)
- Post-deploy action: jalankan `NOTIFY pgrst, 'reload schema';` di Supabase SQL Editor production.

### 2. Recharts Dimension Safeguards
- Applied a mounting guard (`mounted` state) and `minHeight={0}` to `VoiceRadarChart.tsx` under `/telefun`.
- Added `minHeight={0}` on `ResponsiveContainer` elements in the following SIDAK component charts:
  - `ServiceBarChart.tsx`
  - `KpiCard.tsx`
  - `ParetoChart.tsx`
  - `FatalDonutChart.tsx`

---

## Verification Results

| Suite | Result | Note |
|---|---|---|
| API Unit Tests | **Pass (277 tests)** | All tests executed successfully |
| Web Unit Tests | **Fail (127/128 tests)** | 1 timeout di `src/__tests__/access-groups-parity.test.tsx` (`disables agent dropdown...`) |
| Linting | **Pass** | No lint errors, warnings pre-existing |
| Compilation Build | **Pass** | Production build bundles cleanly |
| Migration Validator | **Blocked** | `DATABASE_URL` / `SUPABASE_DB_URL` tidak tersedia di environment lokal |

---

## Production Checklist

1. Apply migration `20260525000300_telefun_history_add_consumer_contact_columns.sql` ke project production.
2. Jalankan:
   ```sql
   NOTIFY pgrst, 'reload schema';
   ```
3. Smoke test:
   - Buat sesi baru di `/telefun` (pastikan tidak ada error `column ... not found`).
   - Buka `ReviewModal` -> `Kualitas Suara Agen` untuk validasi chart.

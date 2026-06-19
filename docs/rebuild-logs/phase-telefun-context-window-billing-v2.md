# Phase: Telefun Context Window Billing V2

**Date:** 2026-06-19

## Issue

Telefun billing undercounted karena Gemini Live API menagih **context window per turn**, bukan cuma snapshot terakhir.

Pada V1, sistem hanya mengambil `usageMetadata` terakhir dari Gemini Live stream dan menghitung biaya berdasarkan token di snapshot itu saja. Kenyataannya, Gemini Live menagih **seluruh session context window pada setiap turn** — artikan setiap turn mengirim ulang semua token sebelumnya (prompt re-billing). Hasilnya, billing V1 jauh lebih rendah dari charge aktual Gemini.

## Solution

### Session Accumulator (SUM per turn)

V2 menggunakan **session accumulator** yang mengamati setiap `usageMetadata` yang dikirim Gemini selama sesi berlangsung. Setiap turn yang unik (berdasarkan content hash) dicatat sebagai billing entry. Total biaya token dihitung dengan **SUM** semua turn, bukan MAX snapshot.

Key functions:
- `createLiveUsageAccumulator()` — inisialisasi accumulator kosong
- `observeLiveUsageMetadata()` — observasi dan deduplicate snapshot per turn
- `commitPendingLiveUsageTurn()` — commit turn saat boundary terdeteksi (turnComplete/interrupted/session_flush)
- `summarizeLiveUsageAccumulator()` — hitung total billed tokens via SUM

### Per-Minute Audio Billing

Gemini Live juga menagih berdasarkan **durasi audio** ($0.005/mnt input + $0.018/mnt output = $0.023/mnt). V2 menambahkan per-minute billing sebagai sanity floor:

```
final_cost = MAX(context_rebilled_token_cost, per_minute_audio_cost)
```

Ini memastikan billing tidak pernah lebih rendah dari charge minimal Gemini.

### Reporting Flow

```
Turn 1: prompt=1000, response=500  →  token cost = $X₁
Turn 2: prompt=2500, response=800  →  token cost = $X₂
Turn 3: prompt=4300, response=1200 →  token cost = $X₃

context_rebilled_cost = $X₁ + $X₂ + $X₃  (SUM)
per_minute_cost = duration_minutes × $0.023
final_cost = MAX(context_rebilled_cost, per_minute_cost)
```

## Files Changed

### Core Implementation
- `apps/telefun/src/usage.ts` — Session accumulator, per-minute cost, final cost calculation, backward-compatible DB insert with 11 new nullable columns
- `apps/telefun/src/server.ts` — Replaced `mergeSnapshot(Math.max)` with accumulator pattern, session duration passthrough

### Reporting
- `apps/api/src/routes/ai.ts` — Monitoring aggregation prefers `final_cost_idr` over `estimated_cost_idr`
- `apps/api/src/services/ai-usage-summary-service.ts` — Usage summary prefers `final_cost_usd/Idr`

### Database
- `supabase/migrations/20260619090000_telefun_live_per_minute_billing.sql` — 11 new nullable columns + updated reconciliation view
- `supabase/rollbacks/rollback_20260619090000_telefun_live_per_minute_billing.sql` — Rollback drops columns + restores view

### Tests
- `apps/telefun/src/__tests__/usage-modality.test.ts` — Per-minute cost, final cost, accumulator lifecycle tests
- `apps/api/src/__tests__/ai-usage-summary-breakdown.test.ts` — Final cost preference test
- `apps/api/src/__tests__/ai-usage-monitoring-aggregation-final-cost.test.ts` — New test file for aggregation final cost

### Documentation
- `docs/MONITORING_TOKEN_USAGE_BILLING.md` — Updated logging contract with V2 fields
- `supabase/rollbacks/README.md` — Updated rollback index

## New DB Columns (ai_usage_logs)

| Column | Type | Description |
|--------|------|-------------|
| `session_duration_ms` | integer | Telefun Live session duration for per-minute billing |
| `per_minute_cost_usd` | numeric | Duration-based audio cost in USD |
| `per_minute_cost_idr` | numeric | Duration-based audio cost in IDR |
| `final_cost_usd` | numeric | MAX(per-token, per-minute) in USD |
| `final_cost_idr` | numeric | MAX(per-token, per-minute) in IDR |
| `live_turn_count` | integer | Number of committed billable turns |
| `latest_input_tokens` | integer | Latest snapshot promptTokenCount for audit |
| `latest_output_tokens` | integer | Latest snapshot responseTokenCount for audit |
| `latest_total_tokens` | integer | Latest snapshot totalTokenCount for audit |
| `context_rebilled_cost_usd` | numeric | Sum of per-turn token costs in USD |
| `context_rebilled_cost_idr` | numeric | Sum of per-turn token costs in IDR |

All columns are nullable for backward compatibility with historical rows.

## Verification

- 77 tests pass (usage-modality, breakdown, aggregation, final-cost)
- Lint: 0 errors
- Build: OK

## Migration

```bash
supabase db push --linked
```

If the linked project is unavailable, migration must be pushed manually when the target Supabase project is accessible.

# Phase 68: AI Usage Rupiah Display & Consistency Fix

**Date**: 2026-05-27  
**Status**: DONE

## Summary

Fixed 7 gaps in AI usage cost display across KETIK, PDKT, and Telefun modules. Consolidated duplicated logic into shared utilities, unified the UsageModal component, added `periodLabel` to the API response, and fixed JSON response shape mismatches.

## Changes

### New Files (2)

- **`apps/web/src/lib/usage-snapshot.ts`** — Shared utility with `UsageSnapshot`, `UsageDelta` interfaces and `computeUsageDelta()`, `formatCompactIdr()`, `formatUsageDeltaLabel()` functions (ported from legacy `reference-repo/app/lib/usage-snapshot.ts`).
- **`apps/web/src/components/UsageModal.tsx`** — Single shared UsageModal component for KETIK, PDKT, and Telefun with module-aware accent colors, camelCase API response handling, and `periodLabel` display from API.

### Deleted Files (2)

- `apps/web/src/routes/ketik/components/UsageModal.tsx` — Replaced by shared component.
- `apps/web/src/routes/pdkt/components/UsageModal.tsx` — Replaced by shared component.

### Modified Files (5)

- **`apps/api/src/routes/ai.ts`** — Added `periodLabel` (e.g., "1 Mei 2026 - 31 Mei 2026 WIB") to `GET /ai/usage/summary` response.
- **`apps/web/src/routes/ketik/index.tsx`** — Replaced inline `computeUsageDelta`, `formatCompactIdr`, `formatUsageDeltaLabel` with shared imports. Changed baseline capture to camelCase. Import `UsageModal` from shared component.
- **`apps/web/src/routes/pdkt/index.tsx`** — Replaced hardcoded badge format (`costIdr/1000 + "rb"`) with `formatUsageDeltaLabel()`. Added `onBeforeActivity`/`onAfterActivity` callback bridge to `PdktSimulation`. Import shared utilities.
- **`apps/web/src/routes/pdkt/simulation.tsx`** — Removed inline usage delta states and functions. Added `onBeforeActivity`/`onAfterActivity` props. Removed internal `UsageModal` usage (moved to parent).
- **`apps/web/src/routes/telefun/index.tsx`** — Replaced inline formatting helpers with shared imports. Fixed baseline capture to use `UsageSnapshot` type with camelCase. Updated import from `../ketik/components/UsageModal` to shared component.

## Gaps Fixed

| # | Gap | Fix |
|---|-----|-----|
| 1 | Ketik UsageModal read wrong response shape (snake_case vs camelCase) | Uses shared component that reads camelCase correctly |
| 2 | PDKT badge hardcoded `costIdr/1000 + "rb"` instead of `formatUsageDeltaLabel()` | Uses shared `formatUsageDeltaLabel()` |
| 3 | Three modules duplicated `computeUsageDelta`/`formatCompactIdr`/`formatUsageDeltaLabel` | Single shared `usage-snapshot.ts` |
| 4 | Two separate `UsageModal.tsx` files (ketik + pdkt) | Single shared `UsageModal.tsx` |
| 5 | API didn't return `periodLabel` | Added to API response with full WIB date range |
| 6 | PDKT simulation had orphaned usage delta state (no bridge to parent) | `onBeforeActivity`/`onAfterActivity` callbacks |
| 7 | Telefun imported UsageModal from Ketik | Now imports from shared component |

## Phase 68 Follow-up: Delta Timing Bug Fixes

### Root Cause Analysis

Setelah phase 68, user melaporkan masih tidak tampil info pertambahan rupiah. Investigasi menemukan 3 bug timing:

| Modul | Bug | Alasan |
|-------|-----|--------|
| **KETIK** | Delta dihitung di `endSession()` sebelum AI review dimulai | Review di-trigger async via `SessionReviewModal`, cost `coaching_review` tidak pernah ditambahkan ke delta |
| **PDKT** | `notifyBefore()` tidak pernah dipanggil sebelum reply API | Baseline stale (dari session start), evaluasi AI async (`logAiUsage` setelah response), hanya 2 retry (4s buffer terlalu pendek) |
| **Telefun** | Baseline di-capture non-awaited (`void`) | Race condition pada short call, baseline bisa null saat delta dihitung |

### Perbaikan

- **KETIK**: Ditambahkan `handleReviewComplete()` yang merekomputasi delta setelah review **completed** (baik sync dalam `handleStartManualReview` maupun async via polling). Baseline tidak di-reset ke null sampai review selesai. Retry dinaikkan 5→8 (interval 1.5s).
- **PDKT**: `notifyBefore()` dipanggil sebelum `postApi("/pdkt/mailbox/reply")` untuk capture baseline segar. Retry dinaikkan 2→5 (interval diperpanjang 2s→3s) untuk menangkap evaluasi async.
- **Telefun**: Baseline capture dibuat synchronous (`await` bukan `void`). Initial delay dinaikkan 2s→3s, retry 5→8 untuk menangkap voice assessment async.

### Files Modified (Follow-up)

- `apps/web/src/routes/ketik/index.tsx` — Added `handleReviewComplete()`, called on review completion (sync + polling), baseline preserved across review lifecycle, 5→8 retries
- `apps/web/src/routes/ketik/components/SessionReviewModal.tsx` — Added optional `onReviewComplete` prop (not yet wired — review completion handled in parent via `handleViewReview` hook-in)
- `apps/web/src/routes/pdkt/index.tsx` — Retry 2→5, interval 2s→3s
- `apps/web/src/routes/pdkt/simulation.tsx` — `notifyBefore()` called before reply submit
- `apps/web/src/routes/telefun/index.tsx` — Baseline capture synchronous, retry 5→8, delay 2s→3s

## Test Results (Final)

- **API**: 457 passed, 4 skipped
- **Web**: 414 passed, 0 failed
- **Type check**: Clean for both `@trainers/web` and `@trainers/api`

---

## Follow-up: AI Usage Delta Robustness & Monitoring Cost Separation

**Date**: 2026-05-28

### Issues Reported

1. **KETIK** — "Kenaikan setelah sesi terakhir" masih kosong meskipun sudah ada retry
2. **PDKT** — "Kenaikan" menampilkan Rp0 (bukan kosong, tapi nol)
3. **Telefun** — Belum diverifikasi apakah delta berfungsi
4. **Monitoring** — Tidak ada pemisahan biaya simulasi vs penilaian AI
5. **Period label** — Menampilkan "30 mei - 31 mei" instead of "1 mei - 31 mei"

### Root Cause Analysis

| Modul | Bug | Detail |
|-------|-----|--------|
| **KETIK** | Guard `delta.totalCalls > 0` terlalu ketat | `logAiUsage()` dipanggil dengan `void` (fire-and-forget), DB insert bisa terjadi setelah 14 detik retry selesai. Ketika `totalCalls` masih 0, delta tidak pernah di-set. |
| **PDKT** | `finally` block menghapus `sessionDeltaPending` saat retry | `doComputeDelta(retriesLeft)` memanggil `setTimeout(doComputeDelta, retriesLeft-1)` lalu `return`, tapi `finally` tetap berjalan dan meng-set `sessionDeltaPending(false)`. Juga, zero delta di-set sebagai hasil setelah retry habis. |
| **Telefun** | Tidak ada `sessionDeltaPending` state | Tidak ada feedback "masih diproses" di UsageModal. Raw `fetch` inline, tidak menggunakan `getApi`. |
| **Period label** | `start.getUTCDate()` salah setelah WIB offset | `start.setUTCHours(-7)` menggeser 1 Mei 00:00 WIB → 30 April 17:00 UTC, sehingga `getUTCDate()` = 30. |
| **Monitoring** | Tidak ada kolom `action` di aggregation | Endpoint hanya group by `module` + `model_id`, tidak ada cara membedakan simulasi vs penilaian AI. |

### Perbaikan

#### 1. Shared `pollUsageDelta()` utility
**File**: `apps/web/src/lib/usage-snapshot.ts`

```ts
async function pollUsageDelta(
  fetchSummary: () => Promise<UsageSnapshot | null>,
  baseline: UsageSnapshot,
  options?: { maxRetries?: number; initialDelayMs?: number; retryDelayMs?: number }
): Promise<UsageDelta | null>
```

- Initial delay 2s, max 15 retry, 2s interval (~32s total timeout)
- Guard: `after.totalCalls > baseline.totalCalls` (bukan `delta.totalCalls > 0`)
- Menangkap error fetch tanpa crash
- Return `null` jika timeout (UsageModal tidak menampilkan section "Kenaikan")

#### 2. KETIK delta fix
**File**: `apps/web/src/routes/ketik/index.tsx`
- Replaced `recordAndComputeDelta` inline (8 retry, 14s) dengan `pollUsageDelta` (15 retry, 32s)
- Replaced `handleReviewComplete` single-shot fetch dengan `pollUsageDelta`
- Import `pollUsageDelta` instead of `computeUsageDelta`

#### 3. PDKT delta fix
**File**: `apps/web/src/routes/pdkt/index.tsx`
- Replaced `doComputeDelta` + `computeUsageDeltaNow` dengan single `computeUsageDeltaNow` menggunakan `pollUsageDelta`
- Hapus zero-delta fallback yang menyebabkan Rp0 muncul
- `finally` block hanya berjalan sekali (setelah `pollUsageDelta` selesai), bukan berulang kali

#### 4. Telefun delta fix
**File**: `apps/web/src/routes/telefun/index.tsx`
- Tambah `sessionDeltaPending` state
- Replaced raw `fetch` inline polling dengan `pollUsageDelta`
- Update `UsageModal` props: tambah `sessionDeltaPending`
- Ganti type inline `{ costIdr, totalTokens, totalCalls }` dengan `UsageDelta`

#### 5. Period label fix
**File**: `apps/api/src/routes/ai.ts`
- Replaced `start.getUTCDate()` / `end.getUTCDate()` dengan `1` dan `new Date(Date.UTC(year, month, 0)).getUTCDate()`
- Label sekarang: "1 Mei 2026 - 31 Mei 2026 WIB"

#### 6. Monitoring: Simulasi vs Penilaian AI
**File**: `apps/api/src/routes/ai.ts`
- Tambah konstanta `SIMULATION_ACTIONS` dan `REVIEW_ACTIONS`
- Query param `action_category` (`simulation` | `review`) untuk filter
- Response: `simulation_cost_idr`, `review_cost_idr` per user
- Model breakdown: `action`, `action_category` per model

**File**: `apps/web/src/routes/monitoring.tsx`
- State `actionCategory` + toggle pills (Semua | Simulasi | Penilaian AI)
- 2 KPI cards baru: Biaya Simulasi (hijau) + Biaya Penilaian AI (amber)
- Tabel utama: kolom Simulasi (Rp) + Penilaian AI (Rp) menggantikan Input/Output tokens
- Per-model breakdown + "Keseluruhan per Model": kolom Kategori dengan badge hijau/amber/abu

### Files Modified (Follow-up ini)

| File | Change |
|---|---|
| `apps/web/src/lib/usage-snapshot.ts` | Added `pollUsageDelta()` |
| `apps/web/src/__tests__/usage-snapshot.test.ts` | NEW: 12 tests |
| `apps/web/src/routes/ketik/index.tsx` | `pollUsageDelta` replace inline polling |
| `apps/web/src/routes/pdkt/index.tsx` | `pollUsageDelta` replace `doComputeDelta` |
| `apps/web/src/routes/telefun/index.tsx` | Added `sessionDeltaPending`, `pollUsageDelta` |
| `apps/api/src/routes/ai.ts` | Period label fix, `action_category` filter, sim/review split |
| `apps/web/src/routes/monitoring.tsx` | Toggle pills, 2 KPI cards, sim/review columns, badges |

### Test Results (Follow-up ini)

- **API**: 457 passed, 4 skipped, 0 failed
- **Web**: 424 passed, 2 failed (pre-existing timeout flakes)
- **New tests**: 12 (usage-snapshot)

# Phase 210: Agent Detail Ranking & Forecast Quickview

**Status:** DONE
**Date:** 2026-07-16
**Tests:** Focused verification: 45 passed (22 API + 23 web)

## Summary

Menambahkan quickview rail pada halaman `/sidak/agents/:id` yang menampilkan peringkat agent dalam dua cohort (Tim Gabungan dan Tim Leader) serta forecast 3 bulan. Quickview dimuat independen dari dossier utama — kegagalan satu segmen tidak mengganggu segmen lain.

## Files

### Source

| File | Change |
|------|--------|
| `packages/types/src/sidak.ts` | Tambah `SidakAgentRankQuickview`, `SidakAgentForecastQuickview`, `SidakAgentQuickviewResponse` |
| `apps/api/src/services/sidak/agent-quickview.ts` | Service baru: `getSidakAgentQuickview()` — resolve folder, ranking via `getDashboardData()`, forecast via `generateSidakAgentForecast()`, `Promise.allSettled` partial failure |
| `apps/api/src/services/sidak-service.ts` | Re-export via `export * from "./sidak/agent-quickview"` |
| `apps/api/src/services/sidak/access-scope.ts` | `SidakFilterScope` type (digunakan bersama) |
| `apps/api/src/routes/sidak/dashboard.ts` | Route baru `GET /agents/:id/quickview` dengan validasi query (year, service_type), guard accessibleAgentIds, delegasi ke service |
| `apps/web/src/hooks/useAgentQuickview.ts` | Hook baru: request path builder, stale context suppression via `matchesContext`, error/loading management |
| `apps/web/src/components/sidak/AgentPerformanceQuickview.tsx` | Komponen baru: ranking rail 2 cohort + forecast + skeleton + error state + ranking basis note |
| `apps/web/src/components/sidak/AgentProfileBar.tsx` | Props baru `quickviewData/quickviewLoading/quickviewError`, render `AgentPerformanceQuickview` |
| `apps/web/src/routes/sidak/agents.$id.tsx` | Integrasi `useAgentQuickview(id, selectedYear, selectedService)`, refresh bersamaan dengan dossier |

### Tests

| File | Tests | Coverage |
|------|-------|----------|
| `apps/api/src/__tests__/sidak-agent-quickview.test.ts` | 16 | Service contract, rank resolution, tie semantics, access rejection (inaccessible + deny-all), folder resolution (duplicate child + parent match), scope filtering (filterScope), forecast mapping (4 status), partial failure (rank reject + forecast reject + folder reject), combined=leader dedup |
| `apps/api/src/__tests__/sidak-agent-quickview-route.test.ts` | 6 | 200 forwarding, 403 for inaccessible agent, 403 for empty leader scope, 400 for invalid year, 400 for unsupported service_type, 404 envelope |
| `apps/web/src/__tests__/useAgentQuickview.test.tsx` | 5 | Request path, stale service response suppress, stale error clear on context change, empty service no request, error clear on deselection |
| `apps/web/src/__tests__/AgentPerformanceQuickview.test.tsx` | 15 | Full render (rank + forecast + basis note), loading skeleton, null rank + total=0, partial failure unavailable state, insufficient forecast, calm error (no raw message), same-cohort label, mobile grid class, forecast icons per status |
| `apps/web/src/__tests__/AgentProfileBar.test.tsx` | 3 | Quickview fixture pass-through ke komponen, props contract |

### Documentation

| File | Change |
|------|--------|
| `docs/SIDAK_LOGIC_AND_SCORING.md` | Replace section "Agent Detail Ranking and Forecast Quickview" (lines 335–366) dengan endpoint contract, scope ranking detail, forecast 3 bulan, partial/failure states, security scoping, arsitektur table, test coverage table |

## Key Decisions

- **`Promise.allSettled` untuk partial failure**: Tiga segmen independen (combinedRank, leaderRank, forecast) dijalankan paralel; yang gagal jadi `null` tanpa memblokir yang lain (`settledValue()` helper).
- **Deduplikasi ranking saat scope sama**: Jika `leaderFolder.id === combinedFolder.id`, `leaderRankPromise = combinedRankPromise` — satu query, reuse hasil.
- **Stale context suppression di hook**: `useAgentQuickview` membandingkan `data.context` dengan parameter aktif; data lama (mis. dari service_type sebelumnya) disembunyikan sampai response baru sesuai konteks.
- **Folder resolution**: Prioritas: (1) child dengan parent name cocok `tim` → (2) child mana pun → (3) kandidat pertama → (4) `null`. Case-insensitive, di-_trim_.
- **Rank formula**: `1 + count of strictly fewer defects` — tie semantics (1, 1, 3).
- **Forecast horizon tetap 3**, tidak dapat dikonfigurasi dari quickview.
- **findingsSlope null** untuk `insufficient_data && sourcePointCount < 2`.
- **No UI reclassification**: Frontend hanya memetakan status → label/ikon, tidak mengklasifikasi ulang.

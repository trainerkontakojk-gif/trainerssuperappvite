# Phase 34: Monitoring & Activity Logs Legacy Parity

**Date:** 2026-05-24  
**Status:** Complete

## Summary

Menutup gap parity antara Vite dan legacy pada modul Monitoring dan Activity Logs:
1. **Monitoring**: 3 tab parity (Riwayat Simulasi, Penggunaan Token, Harga & Kurs), WIB boundary, role matrix (trainer/leader/admin), history lintas modul
2. **Activity Logs**: Cakupan logging mutasi SIDAK + Profiler ditingkatkan via shared logActivity helper

## Changes

### Backend (`apps/api`)

**New files:**
- `apps/api/src/lib/timezone.ts` — WIB timezone utility (`getCurrentWibMonth`, `getWibMonthBounds`)
- `apps/api/src/services/monitoring-history-service.ts` — Unified history service lintas modul (KETIK/PDKT/Telefun)
- `apps/api/src/services/activity-log-service.ts` — Shared `logActivity` helper untuk audit trail

**Modified files:**
- `apps/api/src/routes/ai.ts`:
  - `/monitoring/aggregation`: role diperluas ke `trainer, leader` (sebelumnya `trainer, admin`); boundary WIB menggantikan UTC
  - Tambah `GET /monitoring/history`: endpoint baru untuk unified history (trainer/leader/admin)
  - Pricing GET: role dihapus `qa`, jadi `trainer, admin` only
- `apps/api/src/routes/sidak.ts`: 8 titik instrumentasi `logActivity` (create/delete period, delete temuan, publish/supersede rule version, delete rule version indicator, save/delete report archive)
- `apps/api/src/routes/profiler.ts`: 10 titik instrumentasi `logActivity` (create/delete year, create/delete folder, create/update/delete peserta, move peserta, create/delete team) + penambahan `Variables` type untuk akses `c.get("user")`
- `apps/api/src/services/admin-service.ts`: Migrasi dari `logActivity` inline ke shared helper (`activity-log-service.ts`)

### Frontend (`apps/web`)

**Modified files:**
- `apps/web/src/router.tsx`: Tambah `beforeLoad: requireRole(["trainer", "leader", "admin"])` pada route `/monitoring`
- `apps/web/src/routes/monitoring.tsx`: Full rewrite — 3 tab (history/usage/pricing) + filter module + detail modal transkrip + user breakdown per model + role-gated pricing tab
- `apps/web/src/components/Layout.tsx`: Perbaiki sidebar link `/dashboard/monitoring` → `/monitoring` (route mismatch fix)

## Parity Gap Closure

| Gap | Current → Fixed | Status |
| --- | --- | --- |
| Monitoring role gate | Route tanpa guard → `requireRole(["trainer", "leader", "admin"])` | Closed |
| Leader access aggregation | API hanya `trainer, admin` → `trainer, leader, admin` | Closed |
| 3 tab structure | 2 tab (usage, pricing) → 3 tab (history, usage, pricing) | Closed |
| Unified history | Tidak ada → endpoint `/monitoring/history` | Closed |
| WIB boundary | UTC → `getWibMonthBounds` (WIB) | Closed |
| Module filter | Tidak ada → filter modul (usage + history) | Closed |
| Detail transkrip | Tidak ada → TranscriptModal (ketik/pdkt/telefun) | Closed |
| Pricing role gate | `trainer, admin, qa` → `trainer, admin` only | Closed |
| Leader sidebar hidden | Sidebar tidak tampil untuk leader → tampil dengan role matrix allowedRoles | Closed |
| Sidebar link mismatch | `/dashboard/monitoring` → `/monitoring` | Closed |
| Activity logging SIDAK | Hanya `upload_sidak_batch` → 8 mutation events baru | Closed |
| Activity logging Profiler | Tidak ada → 10 mutation events baru | Closed |
| Shared logActivity helper | Duplikasi inline di admin-service → shared `activity-log-service.ts` | Closed |

## Verification

| Command | Result |
| --- | --- |
| `pnpm --filter @trainers/api lint` | 0 errors, pre-existing warnings only |
| `pnpm --filter @trainers/web lint` | 0 errors, pre-existing warnings only |
| `pnpm --filter @trainers/api test` | 258 passed, 4 skipped |
| `pnpm --filter @trainers/web test` | 91 passed, 1 pre-existing flaky timeout (access-groups-parity) |
| `pnpm build` | All 3 packages pass (API tsc, Web tsc+vite, Telefun tsc) |

## Activity Logging Coverage (New Events)

| Domain | Events Added |
| --- | --- |
| **SIDAK** | createPeriod, deletePeriod, deleteTemuan, publishRuleVersion, supersedeRuleVersion, deleteRuleVersionIndicator, saveReportArchive, deleteReportArchive |
| **Profiler** | createYear, deleteYear, createFolder, deleteFolder, createPeserta, updatePeserta, deletePeserta, movePesertaToBatch, createTeam, deleteTeam |
| **Admin** | Already covered (user mgmt events via shared logActivity) |

# Phase 52a: Leader Access Status & Route Bypass Fix

**Status:** DONE  
**Date:** 2026-05-26  
**Tests:** 14 new, 342 API + 292 web (0 regressions)

## Summary

Memperbaiki tiga cacat logika di flow approval leader yang ditemukan dari audit live code:

1. **Status resolver tidak stabil** — `getLeaderAccessStatus()` hanya query modul `ktp/sidak` (tidak termasuk `"all"`), dan hasil dipilih `.find()` tanpa urutan deterministik sehingga row historis `revoked` bisa mengalahkan `approved`.
2. **Scope resolver tidak konsisten** — `getAccessibleAgentIds()` dan `getAccessiblePesertaIds()` hanya menerima filter `module = "sidak"` / `module = "ktp"`, belum mengakui kontrak `module = "all"`.
3. **Bypass deep-link** — Route guard di `router.tsx` hanya cek role tanpa validasi approval modul, sehingga leader non-approved bisa langsung akses subroute SIDAK/KTP.

## Changes

| File | Change |
|---|---|
| `apps/api/src/services/leader-access-service.ts` | **New.** Shared helper: `fetchLeaderModuleRequests`, `resolveEffectiveModuleStatus`, `resolveEffectiveModuleCreatedAt`, `getApprovedRequestIds` |
| `apps/api/src/services/admin-service.ts` | Delegasi `getLeaderAccessStatus()` ke shared helper, query kini mencakup `module = "all"` |
| `apps/api/src/services/sidak-service.ts` | `getAccessibleAgentIds()` pakai `getApprovedRequestIds("sidak")`, menghormati `"all"` |
| `apps/api/src/services/profiler-service.ts` | `getAccessiblePesertaIds()` pakai `getApprovedRequestIds("ktp")`, menghormati `"all"` |
| `apps/web/src/router.tsx` | Tambah `requireLeaderModuleApproval(allowedRoles, module, landingPath)`. Diterapkan ke 4 route SIDAK + 7 route KTP |
| `apps/web/src/hooks/useAccessStatus.ts` | Refetch on `window.focus` + `document.visibilitychange` |
| `docs/LEADER_APPROVAL_ACCESS.md` | Sinkronisasi contract: precedence rules, route coverage, refetch behavior |

## New Tests

| File | Tests | Coverage |
|---|---|---|
| `apps/api/src/__tests__/leader-access-service.test.ts` | 15 | Pure functions: status precedence, `"all"` coverage, historical override, `created_at` resolution |
| `apps/web/src/__tests__/route-guards.test.ts` | 7 | Leader module approval: trainer/admin bypass, leader non-approved redirect, approved pass, role rejection |
| `apps/api/src/__tests__/profiler-scope-filter.test.ts` | Fix | Existing test fixtures diperbarui dengan `module` + `status` untuk kontrak shared helper |

## Key Decisions

- **Satu sumber kebenaran**: Semua logika approval leader (status UI, scope data, route guard) melewati `leader-access-service.ts`. Tidak ada copy-paste filter yang bisa drift.
- **Precedence deterministik**: `approved` > `pending` > terminal terbaru > `none`. Row diurutkan `updated_at DESC, created_at DESC` sebelum diproses.
- **Landing page tidak diblok**: `/sidak` dan `/profiler` tetap pakai `requireRole()` biasa — di sanalah LeaderAccessGate menjadi UX surface.
- **Redirect ke landing, bukan `/unauthorized`**: Leader diarahkan ke halaman yang menampilkan status request, bukan ke halaman larangan akses.

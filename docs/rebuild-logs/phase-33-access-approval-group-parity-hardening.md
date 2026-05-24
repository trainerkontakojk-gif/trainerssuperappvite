# Phase 33: Access Approval & Access Group Legacy Parity Hardening

**Date:** 2026-05-24  
**Status:** Complete

## Summary

Menutup 3 gap parity tersisa antara Vite dan legacy pada flow access approval dan access groups:
1. Hardening reassign (`recheck approved` + guarded audit update) di backend
2. Lock guided builder mode Specific Agent di frontend (wajib pilih Team dulu)
3. Regression tests untuk mencegah drift parity

## Changes

### Backend (`apps/api`)

**`apps/api/src/services/admin-service.ts`**
- `reassignLeaderRequestGroups()`: Tambah re-check `status === 'approved'` tepat sebelum delete links (line 582-594), matching legacy `reassignLeaderAccessGroups` di `reference-repo/app/actions/leader-access.ts:340-350`.
- `reassignLeaderRequestGroups()`: Guarded audit update `reviewed_by` dengan `.eq('status', 'approved')` (line 625-629), matching legacy line 389-397.

**`apps/api/src/__tests__/admin-service.test.ts`** (15 → 21 tests)
- `approveLeaderRequest`: self-approve guard + rollback on link failure
- `reassignLeaderRequestGroups`: self-reassign guard, re-check failure (status changed mid-flight), rollback old links on insert failure, happy path

### Frontend (`apps/web`)

**`apps/web/src/routes/dashboard/access-groups.tsx`**
- `ruleValueOptions` useMemo: `peserta_id` mode hanya return agents dari selected team (bukan lintas-team `Semua Team`)
- Team filter dropdown: default placeholder `"Pilih Team terlebih dahulu"` (bukan `"Semua Team"`)
- Agent value dropdown: `disabled={!filterTeam}` + contextual placeholder (`"Pilih Name"` vs `"Pilih Team terlebih dahulu"`)
- Non-peserta_id value select dipertahankan untuk `tim` dan `service_type`
- Helper text matching legacy: "Pilih Team terlebih dahulu untuk menampilkan Name yang tersedia di team tersebut."

**`apps/web/src/__tests__/access-groups-parity.test.tsx`** (baru, 3 tests)
- Agent dropdown disabled saat no team selected
- Agent dropdown enabled + menampilkan hanya agent dari team terpilih setelah team dipilih
- Cross-team agents tidak tersedia via ruleValueOptions

## Verification

| Command | Result |
| --- | --- |
| `pnpm --filter @trainers/api test` | 258 passed, 4 skipped |
| `pnpm --filter @trainers/web test` | 92 passed |
| `pnpm --filter @trainers/api lint` | 0 errors, pre-existing warnings only |
| `pnpm --filter @trainers/web lint` | 0 errors, pre-existing warnings only |

## Parity Gap Closure

| Gap | Legacy Ref | Vite Fix | Status |
| --- | --- | --- | --- |
| Reassign re-check approved | `leader-access.ts:340-350` | `admin-service.ts:582-594` | Closed |
| Audited audit update `reviewed_by` | `leader-access.ts:389-397` | `admin-service.ts:625-636` | Closed |
| Builder agent name team-first | `AccessGroupsClient.tsx:298` | `access-groups.tsx:416-448` | Closed |
| API regression tests | N/A | `admin-service.test.ts` (+6 tests) | Closed |
| Web contract tests | N/A | `access-groups-parity.test.tsx` (+3 tests) | Closed |

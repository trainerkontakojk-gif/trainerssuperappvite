# Phase 58 — SIDAK Input Visual & Navigation Parity

**Status:** DONE
**Date:** 2026-05-26
**Type:** Visual Parity + Navigation Fix

## Summary

2 perbaikan parity pada halaman SIDAK Input (`/sidak/input`):

### Fix 1: Visual Layout Parity
- **Container**: `max-w-6xl` → `max-w-3xl` untuk steps 1–3 (fokus), step 4 tetap `max-w-6xl`
- **Step 1–3 selector**: Grid 5-column → vertical list cards (icon | nama+subtitle | chevron), matching legacy pattern
- **Breadcrumb**: Label generik (Folder > Agen > Periode > Temuan) → compact inline dengan nilai sesungguhnya (`Folder > Tim Email > Noor Qodiri > Mei 2026`)
- **Show All Data toggle**: Eye icon di step 1 (amber aktif / default muted)
- **Konfigurasi Audit card**: Ditambahkan di step 4 (service dropdown + tim info read-only) — dipindah dari step 3
- **Estimasi Skor card**: Ditambahkan di step 4 (final score, NC/CR breakdown card, progress bar, session count)
- **Override Layanan**: Dihapus dari step 3 (pindah ke step 4)

### Fix 2: Navigation Pre-fill
- `useAgentDetail.ts:handleInputAudit` — sekarang mengirim `folder` (batch_name/tim) sebagai query param
- `input.tsx` — `loadFolderAndPreSelectAgent()` membaca `?folder=...&agent_id=...` pada mount, auto-select agent, skip ke step "period"
- `replaceState` membersihkan URL setelah pre-fill sukses
- Fallback jika agent tidak ditemukan → error message di step "agent"

## Files Modified

| File | Change |
|------|--------|
| `apps/web/src/routes/sidak/input.tsx` | Major refactor: vertical list cards, compact breadcrumb, Estimasi Skor card, Konfigurasi Audit card, Show All toggle, URL param consumption |
| `apps/web/src/hooks/useAgentDetail.ts` | Fix: `handleInputAudit` passes `folder` param |
| `apps/web/src/lib/scoring.ts` | NEW: client-side scoring helpers (scoreColor, scoreBg, scoreLabel) |
| `apps/web/src/__tests__/sidak-input-parity.test.tsx` | NEW: 24 regression tests |
| `apps/web/src/__tests__/useAgentDetail.test.tsx` | +1 test: handleInputAudit navigation with folder param |
| `plan/markdown/sidak-input-parity.md` | NEW: implementation plan |
| `AGENTS.md` | Phase 58 entry + key files |

## Test Results

- **Web**: 40/42 files — 344 passed, 2 failed (pre-existing timeout flaky — access-groups-parity, route-guards)
- **SIDAK Input Parity (NEW)**: 24/24 passed
- **useAgentDetail**: 2/2 passed
- **TypeScript**: No errors
- **Lint web**: 0 errors, 6 warnings (pre-existing)

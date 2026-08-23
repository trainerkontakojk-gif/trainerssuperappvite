# Phase — PDKT Edu Hardening (buildPdktEdu guard)

## Status dan scope

Hardening kecil untuk `buildPdktEdu` di `apps/api/src/services/pdkt/evaluation-service.ts` — hasil temuan audit UI edukatif (browser check 23 Agu). Tidak mengubah kontrak API, skema DB, atau perilaku evaluasi yang valid — hanya menolak input malformed.

## Perubahan

- **Guard `scoreOf()`**: skor dimensi yang tak valid (missing/NaN/`scoreBreakdown` kosong dari baris legacy) diperlakukan sebagai **100**, bukan low-dim. Mencegah TypeError (`Cannot read properties of undefined`) dan perbandingan NaN saat sort `priorityRank` bila evaluasi lama dibackfill/diolah ulang.
- **Regresi test**: `buildPdktEdu tolerates malformed scoreBreakdown (legacy) without throwing` di `pdkt-evaluate-edukatif.test.ts` (breakdown `{}`, `undefined`, partial) — hanya dimensi dengan skor valid & <75 yang muncul, ranking tetap deterministik.
- **Doc-drift**: komentar `PdktEducationSections.tsx` diperbaiki supaya akurat (actionItems deterministik saat evaluasi/backfill; legacy tanpa narasi AI hanya item prioritas).

## Verification

- `vitest run src/__tests__/pdkt-evaluate-edukatif.test.ts` → 6/6 PASS (RED→GREEN)
- `vitest run src/__tests__/pdkt-evaluate-route.test.ts src/__tests__/pdkt-evaluation-prompt.test.ts` → 21/21 PASS
- `tsc --noEmit` (apps/api) → 0 errors

## Catatan

- Belum di-deploy; perubahan manual di DB produksi (migration `education` + backfill `edu` deterministik 3 baris) tercatat di `.hermes/qa/2026-08-23-ketik-pdkt-education-ui-browser-check.md`.

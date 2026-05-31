# Phase 87: Settings Draft Canonical Commit

## Deskripsi

Refactor maintainability untuk menyatukan jalur penyimpanan draft settings KETIK, PDKT, dan Telefun. `useCrudForm` sekarang menerima normalized draft override sehingga tab-level save dan modal-level save memakai mekanisme commit yang sama.

## Detail Perubahan

- `useCrudForm.save(items, draftOverride)` menjadi canonical commit path untuk add/edit item.
- `applyCollectionDraft` dihapus karena menjadi helper tipis yang menduplikasi commit behavior.
- Scenario/consumer/template tabs sekarang menormalisasi draft lokal lalu memanggil `form.save(...)`.
- `KetikTemplateTab` memakai tipe `KetikAppSettings` tanpa `any`.
- Telefun settings parser memakai coercion helpers untuk persisted values yang enum-like.

## Dampak

- Tidak ada perubahan UI.
- Risiko drift antara tombol Simpan di tab dan tombol Simpan modal berkurang.
- Default item baru tetap berada di hook draft masing-masing modul.
- Boundary parsing Telefun lebih eksplisit dan lebih mudah diuji.

## Verifikasi

- `pnpm --filter @trainers/web test useCrudForm.test.tsx settings-draft-helpers.test.ts telefun-settings-model-default.test.ts`
- `pnpm --filter @trainers/web test ketik-settings-modal.test.tsx pdkt-settings-modal.test.tsx`
- `node node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit`
- `rg -n "applyCollectionDraft|useCollectionDraft|React.Dispatch<React.SetStateAction<any>>|\bprev: any\b|\bas any\b" apps/web/src`

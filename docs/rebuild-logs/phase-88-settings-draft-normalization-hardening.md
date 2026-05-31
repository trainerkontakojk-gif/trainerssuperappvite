# Phase 88: Settings Draft Normalization Hardening

## Deskripsi

Refactor maintainability lanjutan untuk menjadikan normalisasi draft settings KETIK, PDKT, dan Telefun benar-benar canonical. Logic default entity dipindahkan dari tab-level save dan hook create factories ke pure normalizer per domain.

## Detail Perubahan

- Added KETIK draft normalizers for scenario, consumer, and quick template.
- Added PDKT draft normalizers for scenario and consumer.
- Added Telefun draft normalizers for scenario and consumer.
- Reused the same normalizers from tab-level saves and modal-level `createItem` factories.
- Hardened Telefun persisted settings parser with item-level validation for `scenarios` and `consumerTypes`.

## Dampak

- Tidak ada perubahan UI.
- Risiko drift antara tab save dan modal save turun karena default entity tinggal di satu helper per domain.
- Telefun settings parsing lebih eksplisit dan tidak memasukkan malformed persisted rows sebagai typed collections mentah.

## Verifikasi

- `rtk pnpm --filter @trainers/web test settings-draft-normalizers.test.ts useCrudForm.test.tsx settings-draft-helpers.test.ts ketik-settings-modal.test.tsx pdkt-settings-modal.test.tsx telefun-settings-model-default.test.ts` (35 tests passed)
- `rtk node node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit` (completed with 0 errors)

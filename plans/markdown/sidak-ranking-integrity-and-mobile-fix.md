# SIDAK Ranking Integrity and Mobile Fix

## Requirement

Perbaiki `/sidak/ranking` dan jalur Top Agents agar:

1. Leader tanpa agent scope tidak pernah menerima data ranking.
2. Agent non-service (QA, OM, SPV, trainer, WFM, dan folder exclusion) tidak ikut denominator/ranking SIDAK.
3. Link Top Agents mempertahankan `service_type` yang sedang dipilih.
4. Rank bisnis tidak berubah hanya karena urutan presentasi; tie menggunakan shared rank.
5. Tabel mobile tetap menampilkan metrik utama tanpa horizontal scroll yang memaksa.
6. Kontrol filter dan navigasi row dapat diakses keyboard.

## Design

- Tambahkan guard fail-closed pada route ranking untuk `accessibleIds=[]`.
- Gunakan helper exclusion terpusat saat `getDashboardData()` memuat row `qa_temuan`; tetap pertahankan phantom sebagai audit presence untuk agent service yang valid.
- Ubah TopAgentsTable ke query `service_type`.
- Pisahkan `businessRank` dari sorting tampilan. Rank default tetap berbasis defect sesuai kontrak ranking utama, dengan competition rank untuk defect yang sama.
- Tambahkan label aksesibel pada select, gunakan link pada nama agent, dan ubah layout tabel menjadi compact stacked row pada breakpoint mobile.
- Tambahkan bottom padding mobile untuk fixed navigation.

## Tasklist

- [x] Tambah regression tests route empty leader scope.
- [x] Tambah test ranking exclusion dan helper query.
- [x] Tambah test TopAgentsTable URL service type.
- [x] Tambah test rank tie/presentation sort contract.
- [x] Implement backend guards/exclusion.
- [x] Implement web ranking accessibility/responsive/rank fixes.
- [x] Flatten ranking UI and remove decorative AI-slop patterns after visual review.
- [x] Pisahkan perubahan posisi dari catatan tie dan hapus label Fatal yang tidak actionable.
- [x] Jalankan focused tests, typecheck, lint, core tests, build, visual smoke, dan git diff check.
- [x] Update SIDAK canonical docs bila kontrak ranking berubah.

## Verification

- Focused API/web Vitest: passed.
- API/web TypeScript check: passed.
- API/web ESLint on changed files: passed.
- Visual smoke at 320, 375, 390, 414, 768, 1024, and 1440px: no body horizontal overflow; mobile bottom safety at least 35px.
- Web core suite after final UI edit: 16 files / 211 tests passed.
- Production web build after final UI edit: passed.

# Phase 27: SIDAK Agent Detail Temuan History Parity

## 1. Requirement & Goals
Menyamakan bagian riwayat temuan detil pada halaman detail agent SIDAK dengan legacy:
1. Menampilkan angka skor nilai (0, 1, 2, 3) di badge detail, bukan sekadar label.
2. Layout bulan, tiket, empty state, dan hover actions harus sama dengan legacy.
3. Hak akses: leader read-only, trainer/admin bisa mengedit/menghapus.
4. Menjaga NilaiBadge global agar input dan components lain tidak terkena dampak regresi.
5. Menambahkan test regresi di web workspace.

## 2. Implementation Summary
- **UI & Layout (`apps/web/src/components/sidak/AgentTemuanTab.tsx`):**
  - Ditambahkan local component `NilaiBadge` dengan layout box berwarna yang berisi angka skor numerik (0/1/2/3) dan label kecil di bawahnya.
  - Bulan dikelompokkan dan ditampilkan dengan accordions yang di-expand/collapse lokal.
  - Di dalam bulan, temuan dikelompokkan per nomor tiket dengan header tiket yang uppercase.
  - Ditambahkan support hover action (Edit & Delete buttons) yang hanya muncul saat hover pada temuan row dan jika role user diperbolehkan (`canEdit === true`).
  - Empty state UI diselaraskan dengan copy legacy.
- **Routing & Permissions (`apps/web/src/routes/sidak/agents.$id.tsx`):**
  - Ditambahkan `key` prop dengan format `${selectedYear}-${selectedService}` pada `AgentTemuanTab` agar state accordion ter-reset otomatis jika parameter tahun/layanan diubah.
  - Nilai props `canEdit` diubah menjadi `role === "trainer" || role === "admin"` sehingga role `leader` bersifat read-only.
  - Dilakukan import cleanup untuk menghapus library/icons yang tidak terpakai.
- **Testing (`apps/web/src/__tests__/sidak-agent-detail-temuan-parity.test.tsx`):**
  - Dibuat suite test baru mencakup pengelompokan bulan/tiket, rendering NilaiBadge numerik, layout empty state, serta visibilitas aksi edit berdasarkan parameter permission.

## 3. Verification & Validation
- **Linting:** Berhasil dijalankan dengan `pnpm --filter @trainers/web lint` (0 error).
- **Frontend Tests:** `pnpm --filter @trainers/web test` berhasil meluluskan semua 17 file test (76 test case).
- **Backend Tests:** `pnpm --filter @trainers/api test` meluluskan seluruh 16 file test (239 test case).

# SIDAK Reports Data Export Parity

## Requirement

- File Excel dari `/sidak/reports-data` harus menampilkan isi sel yang persis
  sama dengan yang tampil di UI untuk tiga sel: `No. Tiket`, `Temuan`, dan
  `Seharusnya` (Rekomendasi).
- `No. Tiket` memakai `getReportTicketText`: nomor tiket dikelilingi spasi tepi
  dipangkas, dan `null`/kosong/tidak-string tampil sebagai `-`, bukan sel kosong.
- `Temuan` memakai `getReportFindingText` (trim) dan `Seharusnya` memakai
  `getReportRecommendationText` (trim).
- Kontrak yang TIDAK boleh berubah: header kolom Rekomendasi tetap `Seharusnya`,
  nama worksheet `Data Laporan`, format file `.xlsx`/nama file
  `laporan-data-<year>.xlsx`, kolom lain (Layanan, Periode, Agen, Batch,
  Parameter, Skor), pemilihan baris (`isActionableReportRow`), count, filter,
  pagination, dan seluruh backend.
- Bukti wajib E2E (aturan Fajar): unduh file Excel sungguhan dari button
  `Export Excel` dan baca dengan `exceljs`. Tidak ada unit test baru.

## Design

- Sumber kebenaran sudah ada di produk: `toRowFacts(row)` di
  `apps/web/src/routes/sidak/reports-data.tsx` adalah satu bentuk fakta yang
  dipakai tabel desktop dan daftar mobile. Aturan trim + placeholder `-` untuk
  tiket sudah hidup di `getReportTicketText` / `getReportFindingText` /
  `getReportRecommendationText` (`reports-data-utils.ts`).
- Penyebab perbedaan format: `exportExcel` membaca field mentah
  (`r.no_tiket || ""`, `r.ketidaksesuaian || ""`, `r.sebaiknya || ""`), sehingga
  spasi tepi ikut ke file dan tiket kosong menjadi sel kosong. Perbaikan memakai
  `toRowFacts(r)` untuk ketiga sel itu, bukan menduplikasi aturan trim di
  `exportExcel`.
- `exportExcel` tetap memetakan `results` (array hasil terseleksi yang sama),
  jadi baris non-actionable tetap tidak ikut dan pagination tidak memengaruhi
  isi export.
- Bukti E2E: satu test regresi kecil di suite yang sudah ada
  (`apps/web/e2e/sidak-reports-data.spec.ts`) memakai fixture bertiket ber-spasi,
  bertiket `null`, dan Temuan/Rekomendasi ber-spasi tepi. Test mengunduh `.xlsx`
  asli, membacanya dengan `exceljs`, lalu membandingkan sel yang diekspor dengan
  nilai yang terlihat di UI pada baris yang sama. Baris yang dibuang (phantom,
  Temuan kosong, Rekomendasi kosong) ikut dilayani dan tetap tidak boleh bocor ke
  file.

## Tasklist

- [x] Baca kontrak: `AGENTS.md`, Lane C `docs/AGENT_WORKFLOW.md`,
      `exportExcel`/`toRowFacts`, `reports-data-utils.ts`, helper
      `exportedDataRows`, `docs/SIDAK_LOGIC_AND_SCORING.md`, `docs/modules.md`,
      Wiki `entities/sidak-module.md`.
- [x] Preflight: buktikan `localhost:3005` = Vite dev server repo ini dengan
      proxy `/api` hanya loopback; guard fail-closed; tanpa menyentuh DB/backend.
- [x] Tambah test regresi E2E paritas sel Excel di suite existing.
- [x] Jalankan focused RED; kegagalan harus karena mismatch sel, bukan server/mock.
- [x] GREEN: `exportExcel` memakai `toRowFacts(r)` untuk 3 sel, tanpa perubahan lain.
- [x] Jalankan focused GREEN, lalu spec penuh dengan output Playwright di
      `/Users/nadindyta/.hermes/cache/scratch/sidak-excel-parity-worker`.
- [x] Jalankan scoped eslint, web typecheck, web build, `git diff --check`.
- [x] Perbarui dokumentasi yang menyatakan perbedaan masih ada menjadi kontrak aktual.

## Catatan

- Tidak ada perubahan schema, auth/RLS, API contract, dependency, atau backend,
  jadi tidak ada gate Lane D.
- Tidak menjalankan Vitest/unit suite apa pun.

# SIDAK: staf yang dulu agen tetap dihitung di bulan saat masih agen

- **Status:** DISETUJUI Fajar 2026-11-27 (keputusan "Tetap di hitung bulan bulan saat masih agent"; definisi "bulan yang ada auditnya"; cakupan "angka historis saja").
- **Risk lane:** **Lane C** — perubahan perilaku lintas layanan API SIDAK (dashboard, ranking, quickview, Laporan Manajemen, forecast), tanpa skema/migrasi.
- **Baseline:** `69305e2e` (`main`, bersih).

## Masalah

`isAgentExcluded(tim, batch_name, jabatan)` membaca profil **saat ini**. Lima agen yang pindah ke Tim QA/OM (April–Oktober 2026) kehilangan semua temuan historisnya dari dashboard/ranking/Laporan Manajemen, termasuk bulan-bulan saat mereka masih agen. Contoh produksi 2026: heatmap Call 1.852 temuan vs dashboard Call 1.653. Selisihnya tepat temuan kelima orang itu.

## Requirement

1. Untuk angka historis, setiap baris `qa_temuan` dihitung apa pun jabatan atau folder orangnya sekarang. "Bulan saat masih agen" = periode yang punya baris audit untuk orang itu. Tidak ada kolom riwayat jabatan.
   - Termasuk: total, tren, dan skor dashboard per periode; Pareto; tabel agen; ranking; rank quickview agen; detail agen; Laporan Manajemen (bulanan, tim, agen, Pareto, detail, tindak lanjut).
2. Yang tetap tanpa staf (karena mereka bukan agen lagi):
   - Daftar agen aktif `/sidak/agents` (default; `show_all=true` tetap menampilkan semua).
   - Roster dan penyebut Cakupan Audit di Laporan Manajemen.
   - Forecast per agen (`/sidak/forecast/agents`). Sebelumnya forecast ini **tidak** mengecualikan staf sama sekali, jadi ini perubahan yang memenuhi pilihan Fajar.
   - Prediksi tren tim di dashboard (`/sidak/dashboard/forecast`).
3. Soft-delete/arsip tetap seperti sekarang (`getSoftDeletedPesertaIds`).

## Desain

- `dashboard-data.ts` `fetchAllTemuan`: hapus filter `isAgentExcluded` sebagai default. Tambah opsi eksplisit `excludeStaff?: boolean` di `getDashboardData`. Hanya `dashboard-forecast.ts` yang memakainya, sehingga satu jalur data dipakai untuk semua angka historis dan forecast tim memilih populasinya sendiri.
- `management-report.ts` `sourceRowsInScope`: hapus filter staf. Cakupan tetap memakai `getEligibleReportAgents` (roster tanpa staf), jadi baris sesi staf tidak masuk penyebut atau daftar cakupan.
- `forecast.ts`: lewati agen yang `isAgentExcluded` saat membangun entri.
- Batas yang diketahui: staf tetap tampil di folder/tim **sekarang** (`batch_name` Tim QA/OM). Mereka tidak tampil di tim lamanya, karena SIDAK tidak menyimpan folder per periode. Filter "Semua tim" menampilkan semuanya.

## Tasklist

- [x] T1 Spec RED baru `apps/web/e2e/sidak-staff-agent-months-api.spec.ts`: staf Tim QA dengan baris audit Januari dihitung di dashboard, ranking, dan Laporan Manajemen, tetapi tidak di `/sidak/agents`, roster Cakupan, forecast per agen, atau historis forecast tim.
- [x] T2 Implementasi di `dashboard-data.ts`, `dashboard-forecast.ts`, `management-report.ts`, `forecast.ts`.
- [x] T3 Sesuaikan asersi kontrak lama yang menuntut staf hilang dari angka historis: `sidak-dashboard-kpi-api.spec.ts`, `sidak-management-reports-api.spec.ts`, `sidak-temuan-row-cache-api.spec.ts`. Perubahan ini memang inti tugasnya: kontraknya yang berubah.
- [x] T4 Dokumen `docs/SIDAK_LOGIC_AND_SCORING.md`, `CHANGELOG.md`, wiki modul SIDAK.
- [ ] T5 Produksi: jalankan workflow "Coolify images" lalu Redeploy (perlu izin Fajar).

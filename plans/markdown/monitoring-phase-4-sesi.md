# Monitoring tahap 4 — Detail sesi di halaman sendiri

- **Lane:** C (API contract + UI, tanpa skema).
- **Diminta:** Fajar, 2026-10-17 (rencana redesign Monitoring, tahap 4); dilanjutkan 2026-10-18 ("Lanjut redesign monitoring").
- **Mockup:** `/mnt/project-files/telaah-monitoring/` bagian Detail sesi KETIK, PDKT, Telefun.

## Requirement

1. Rute `/monitoring/sesi/$modul/$id` (kapabilitas `monitoring.read`) menampilkan satu sesi di area utama: "Kembali ke Riwayat", judul skenario, baris meta (modul · peserta · waktu WIB · status), "Salin tautan", dan "Hapus sesi" (hanya admin/trainer) lewat dialog yang menyebut sesinya.
2. Kiri: transkrip chat KETIK (Konsumen/Agen, jam, typo ditandai), email PDKT, atau rekaman + transkrip Telefun ("Tidak ada rekaman" bila kosong). Kanan: panel "Sesi" (peserta, akun pelaksana, konsumen, lama sesi/batas waktu/lama mengerjakan/lama panggilan) dan panel penilaian.
3. Penilaian ditulis sebagai baris angka dengan skala (KETIK/PDKT 0–100, Telefun 0–10). Grafik jaring Telefun diganti baris angka. Isi edukatif lama tetap ada: prioritas dan cara memperbaiki KETIK, catatan balasan/action item/contoh balasan/kesesuaian jawaban PDKT, hold, latihan per metrik, dan saran coaching Telefun, pesan aman untuk telaah PDKT yang gagal.
4. Leader tetap dibatasi timnya (pemeriksaan tahap 3 di API). Sesi di luar cakupan atau tidak ada: "Sesi tidak ditemukan".
5. Riwayat: klik baris membuka halaman detail; menu ⋯ menambah "Salin tautan". Jendela riwayat simulasi di SIDAK memakai tampilan penilaian yang sama.
6. API review mengirim `header` (judul, waktu, nama pelaksana, lama sesi sebenarnya) supaya halaman yang dibuka dari tautan punya kepala tanpa membaca daftar.

## Design

- Komponen bersama `SessionReview` (kiri/kanan, berpindah ke satu kolom bila wadahnya sempit lewat container query) dipakai `SessionPage` dan `SessionReviewDialog` (SIDAK). `ReviewDetailModal`, `KetikReviewPanel`, `PdktEvaluationPanel`, dan `TelefunReviewPanel` dihapus.
- "Kembali ke Riwayat" memakai filter Riwayat terakhir di sesi browser yang sama; tautan yang dibuka langsung kembali ke `/monitoring`.
- Tanpa migrasi: `header` dibaca dari kolom yang sudah dipilih (KETIK menambah `scenario_title`, `date`; Telefun `created_at`; nama dari `profiles.full_name`).

## Tasklist

- [x] RED: `e2e/monitoring-sesi.spec.ts` (hermetic) + header di `monitoring-numbers-api.spec.ts` (backend nyata).
- [x] API: `header` di `monitoring-review-service.ts`, tipe `MonitoringReviewHeader`.
- [x] UI: `SessionReview`, `SessionPage`, rute, Riwayat ke halaman detail, SIDAK dialog.
- [x] Perbarui `monitoring.spec.ts` (tes jendela lama, grafik jaring, batas waktu) dan SIDAK spec.
- [x] Hapus unit test panel lama yang digantikan E2E dan entri `scripts/test-core.json`-nya.
- [x] typecheck/lint/build, `git diff --check`, CHANGELOG.

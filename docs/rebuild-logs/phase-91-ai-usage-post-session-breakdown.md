# Phase 91: AI Usage Post-Session Detail Breakdown

Implementasi rincian kenaikan biaya AI setelah sesi simulasi (KETIK, PDKT, Telefun) dengan pemisahan kategori Simulasi dan Penilaian AI.

## Perubahan Utama

### 1. Backend: Accumulator Breakdown Kategori
- API `/ai/usage/summary` sekarang menghitung dan mengembalikan objek `breakdown` yang berisi statistik per kategori: `simulation`, `review`, dan `uncategorized`.
- Setiap kategori mencakup metrik: `calls`, `inputTokens`, `outputTokens`, `totalTokens`, `costIdr`, dan `costUsd`.
- Klasifikasi dilakukan secara otomatis berdasarkan `action` menggunakan mapping `SIMULATION_ACTIONS` dan `REVIEW_ACTIONS`.

### 2. Frontend: Shared Usage Logic & UI
- **Shared Helper**: Dibuat `fetchUsageSummary(module)` di `apps/web/src/lib/usage-summary.ts` untuk menormalisasi response API ke shape `UsageSnapshot` yang lengkap.
- **Delta Computation**: `computeUsageDelta` ditingkatkan untuk menghitung selisih (delta) per kategori breakdown, memungkinkan UI menampilkan kenaikan biaya yang presisi untuk simulasi vs penilaian.
- **UsageModal Upgrade**: UI modal penggunaan ditingkatkan dengan komponen `UsageBreakdownRows` yang menampilkan rincian biaya, token, dan jumlah call per kategori, baik untuk sesi terakhir maupun ringkasan bulanan.
- **Toast Feedback**: Toast notifikasi setelah sesi kini mencantumkan rincian biaya: `Biaya sesi ini: +RpX | Simulasi RpY | Penilaian AI RpZ`.

### 3. Integrasi Modul (KETIK, PDKT, Telefun)
- Ketiga modul simulasi utama kini menggunakan alur shared: capture baseline → poll delta → render modal.
- Menghapus logika pemetaan usage manual di masing-masing route file, digantikan dengan shared helper untuk menjaga ukuran file tetap terkendali (di bawah 1000 baris).

## Verifikasi

### API Test
- `/usage/summary` mengembalikan `breakdown` dengan angka yang benar.
- Token review tetap dihitung meskipun estimasi biaya `0` (karena pricing model belum dikonfigurasi).

### Frontend Test
- `UsageModal` merender baris kategori hanya jika ada data penggunaan.
- Delta sesi terakhir menampilkan pemisahan Simulasi dan Penilaian AI yang akurat.
- Toast notifikasi menampilkan breakdown kategori dengan benar.

## Dokumentasi
- `docs/database.md` diperbarui untuk mencantumkan rincian kategori pada seksi Monitoring AI Usage.
- Tidak ada migrasi database baru; menggunakan kolom `action` yang sudah ada untuk klasifikasi.
- Tidak ada dependency baru yang ditambahkan.

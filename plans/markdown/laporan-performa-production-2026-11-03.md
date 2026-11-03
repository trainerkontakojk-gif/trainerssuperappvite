# Laporan Performa Production: Trainers SuperApp

Per 3 November 2026. Dibuat dari pengecekan read-only di `trainers-superapp.vercel.app` dan Railway (production).

## Ringkasan

Laman yang masih lambat di production hanya Beranda (`/dashboard`) dan halaman SIDAK yang memakai forecast, tren, dan ranking agen. Penyebab utamanya sama: endpoint membaca seluruh temuan QA setahun dalam halaman 1.000 baris yang diambil satu per satu, jadi waktunya habis untuk round trip ke database. Laman lain selesai dalam sekitar 0,2 sampai 0,7 detik.

## Status perbaikan (3 November 2026)

Dideploy ke Railway production pada 3 November 2026 pukul 05:53 UTC (commit `d8f07770`). Rencana dan bukti: [`sidak-parallel-paging.md`](sidak-parallel-paging.md).

| Endpoint (browser, sesudah deploy, muat kedua) | Sebelum              | Sesudah                |
| ---------------------------------------------- | -------------------- | ---------------------- |
| `home/attention`                               | 1,4 sampai 2,3 detik | 0,9 detik              |
| `sidak/dashboard/trend`                        | 1,1 sampai 1,8 detik | 0,8 detik              |
| `sidak/agents`                                 | 1,3 detik            | 0,5 detik              |
| `sidak/dashboard`                              | sekitar 0,8 detik    | 0,57 sampai 0,67 detik |
| `sidak/ranking` (tidak diubah)                 | 1,5 detik            | 1,2 detik              |
| `sidak/dashboard/forecast` di Beranda          | 1,8 detik            | 1,8 detik              |

Satu sampel per endpoint; muat pertama sesudah deploy lebih lambat karena container baru.

- **Data production (read-only):** `qa_temuan` 8.313 baris untuk 2026 (5.023 non-phantom), `profiler_peserta` 143, `qa_periods` 11, `qa_indicators` 78. Data ini kecil, jadi loop agregasi di memori bukan penyebab utama.
- **Uji waktu (read-only, dari mesin developer):** membaca setahun `qa_temuan` butuh 3,39 detik bila halaman diambil berurutan, dan 0,96 detik bila empat halaman diambil bersamaan.
- **Perbaikan:** halaman `qa_temuan` kini diambil empat sekaligus di direktori agen (Beranda "Perlu tindakan", `/sidak/agents`), tren, dan dashboard (termasuk forecast). Dashboard tetap memakai keyset paging, dibagi empat rentang `id`. Direktori agen kini memuat peserta, temuan, periode, dan indikator bersamaan.
- **Batch 2 (commit `3d3b7098`, dideploy 06:23 UTC):** dashboard membaca temuan tanpa embed `profiler_peserta` (peserta dibaca sekali), forecast mencari fingerprint snapshot bersamaan dengan bacaan data, dan scope forecast dibaca bersamaan.

| Endpoint (browser, sesudah batch 2, muat kedua) | Awal                 | Batch 1      | Batch 2    |
| ----------------------------------------------- | -------------------- | ------------ | ---------- |
| `sidak/dashboard/forecast` di Beranda           | 1,8 detik            | 1,8 detik    | 1,1 detik  |
| `sidak/dashboard/forecast` di laman Forecast    | 1,18 detik           | belum diukur | 0,51 detik |
| `sidak/dashboard` di laman Forecast             | 1,25 detik           | belum diukur | 0,68 detik |
| `home/attention`                                | 1,4 sampai 2,3 detik | 0,9 detik    | 0,66 detik |
| `sidak/dashboard/trend`                         | 1,1 sampai 1,8 detik | 0,8 detik    | 0,67 detik |
| `sidak/ranking`                                 | 1,5 detik            | 1,2 detik    | 1,06 detik |

- **Batch 3 (commit `3e039d19`, keputusan Fajar: tim bawaan dari daftar ber-scope):** pada kunjungan pertama SIDAK, tim bawaan dipilih dari `/sidak/folders` sebelum data dimuat. Diverifikasi di production: `/sidak/folders` (235 ms), lalu satu request `sidak/dashboard` langsung dengan tim bawaan (488 ms) dan heatmap dengan tim yang sama. Sebelumnya Dashboard, Ranking, dan Forecast memuat data dua kali. Leader tidak lagi mendapat tim bawaan di luar scope-nya.

## Hasil ukur per laman

| Laman                                                                                                 | Waktu muat laman                   | Endpoint paling lambat                                                                                                    | Penilaian |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------- |
| Beranda `/dashboard`                                                                                  | 0,4 sampai 1,4 detik               | `home/attention` 1,4 sampai 2,3 detik, `sidak/dashboard/trend` 1,1 sampai 1,8 detik, `sidak/dashboard/forecast` 1,8 detik | Lambat    |
| SIDAK Dashboard `/sidak/dashboard`                                                                    | sekitar 0,8 detik untuk data utama | `sidak/dashboard/forecast` 0,7 sampai 1,2 detik, dipanggil 3 kali                                                         | Lambat    |
| SIDAK Forecast `/sidak/forecast`                                                                      | 0,7 detik                          | `sidak/dashboard` 1,25 detik, `forecast` 1,18 detik, `forecast/agents` 0,73 detik                                         | Lambat    |
| SIDAK Ranking `/sidak/ranking`                                                                        | 0,2 detik                          | ranking rentang bulan 1,5 detik                                                                                           | Sedang    |
| SIDAK Agen `/sidak/agents`                                                                            | 0,2 detik                          | daftar agen 1,3 detik                                                                                                     | Sedang    |
| SIDAK Heatmap `/sidak/heatmap`                                                                        | 0,2 detik                          | heatmap 0,5 detik                                                                                                         | Cepat     |
| PDKT, KETIK, TNA, Monitoring, Biaya AI, Telefun, Profiler, Kegiatan, Pengguna, Jadwal shifting, Login | 0,2 sampai 0,7 detik               | paling lama sekitar 0,7 detik                                                                                             | Cepat     |

Catatan: angka ini satu sampel dari satu browser, dengan satu akun yang sudah login. Waktu muat laman adalah event load browser, sedangkan waktu data adalah durasi request API.

## Server production (Railway, `@trainers/api`, 7 hari terakhir)

| Endpoint                         | p50 (median)           | p95                          | Catatan                                                   |
| -------------------------------- | ---------------------- | ---------------------------- | --------------------------------------------------------- |
| `GET /home/attention`            | 1,1 sampai 3,4 detik   | sampai 4,1 detik             | Lambat di hampir semua jendela waktu                      |
| `POST /sidak/dashboard/forecast` | 0,65 sampai 3,3 detik  | sampai 8,5 detik             | Sangat bervariasi, puncak di jam kerja                    |
| Seluruh API (`GET`)              | 0,35 sampai 0,73 detik | puncak p90 sekitar 3,5 detik | Sebagian besar wajar; ekor lambat ada di endpoint di atas |

Catatan: persentil dari bucket dengan request sedikit bisa berfluktuasi. Bucket dengan p50 sekitar 9 ms kemungkinan jendela tanpa trafik dan diabaikan.

## Akar masalah dari kode

**1. Beranda "Perlu tindakan" memuat seluruh temuan tahun berjalan.** `home/attention` memanggil `getAgentDirectorySummary` (`apps/api/src/services/sidak/agent-directory.ts`). Fungsi ini mengambil seluruh `profiler_peserta`, lalu seluruh `qa_temuan` tahun berjalan dengan paging offset 1.000 baris secara berurutan, memuat indikator tiap layanan, lalu menilai setiap agen. Ini berjalan setiap Beranda dibuka oleh peran yang punya `sidak.read`.

**2. Forecast menghitung data penuh sebelum cek cache.** `generateSidakTrendForecast` (`apps/api/src/services/sidak/dashboard-forecast.ts`) memanggil `getDashboardData()` lebih dulu, lalu mencocokkan cache lewat fingerprint dari hasil itu. Jadi permintaan `cacheOnly` tetap menjalankan agregasi penuh. Pemanggilan `cacheOnly` datang dari `TrendCard` di Beranda dan dari `sidak/dashboard`, yang juga mengulang lookup setiap data atau filter berubah.

**3. Agregasi temuan kurang efisien (dampak kecil setelah dicek).** Di `dashboard-data.ts`, `findIndicatorForRow` menormalisasi ulang tiap baris dan mencari indikator dengan `find` linear. Di `service-trends.ts`, `buildTrendResult` memakai `filter` berulang atas seluruh array temuan per periode dan per layanan, dan `calculateTopParameters` mencari indikator per temuan. `fetchPaginatedTrendData` juga memakai offset paging, bukan keyset.

**4. Beban bertumpuk di Beranda.** Beranda memanggil `attention`, `trend`, dan `forecast` bersamaan. Waktu tunggu laman ditentukan oleh yang paling lambat, yaitu sekitar 2 detik.

## Rekomendasi, urut dampak

1. **Ringkas `home/attention`.** Hitung hanya jumlah agen di bawah target lewat query agregat di database, atau simpan hasil per tahun dan invalidasi saat temuan berubah. Target: di bawah 300 ms.
2. **Cek cache forecast sebelum agregasi.** Kunci cache dari filter, daftar periode, dan `updated_at` data. Permintaan `cacheOnly` tidak boleh menghitung ulang data.
3. **Kurangi pemanggilan forecast berulang di SIDAK Dashboard.** Pastikan lookup hanya berjalan saat filter benar-benar berubah, dengan debounce bila perlu.
4. **Perbaiki loop agregasi.** Gunakan Map indikator berdasarkan id dan normalisasi sekali per konteks. Ganti offset paging dengan keyset di `fetchPaginatedTrendData`. Ganti `filter` bertingkat dengan satu kali pengelompokan.
5. **Ukur sebelum dan sesudah.** Tambahkan log waktu per tahap di endpoint, lalu jalankan dengan data production yang disalin ke staging.

Catatan: perbaikan ini menyentuh backend dan kemungkinan database. Menurut `AGENTS.md`, itu masuk Lane C atau D, sehingga perlu TDD dan E2E. Perubahan migrasi perlu persetujuan.

## Yang belum terverifikasi

- Jumlah baris kini sudah diketahui lewat hitungan PostgREST read-only (lihat Status perbaikan). Query SQL lewat MCP ke production tetap diblokir hook proyek, jadi `EXPLAIN` belum dijalankan.
- Dugaan bahwa `sidak/agents` dan `sidak/ranking` memakai jalur yang sama belum diverifikasi per endpoint.
- Sekitar 20 laman entri diukur dari sekitar 60 file route. Laman turunan seperti `sidak/settings`, `sidak/periods`, `sidak/reports-data`, `sidak/input`, dan riwayat PDKT/KETIK belum diukur.
- Metrik Telefun API di Railway belum dicek.
- Penulisan ke Claude Docs ditolak, jadi laporan ini disimpan sebagai file lokal ini.

## Sumber

- `apps/api/src/routes/home.ts`
- `apps/api/src/services/home/attention.ts`
- `apps/api/src/services/sidak/agent-directory.ts`
- `apps/api/src/services/sidak/dashboard-forecast.ts`
- `apps/api/src/services/sidak/dashboard-data.ts`
- `apps/api/src/services/sidak/service-trends.ts`
- `apps/api/src/routes/sidak/dashboard.ts`
- `apps/web/src/routes/sidak/dashboard.tsx`
- `apps/web/src/routes/dashboard/home/TrendCard.tsx`

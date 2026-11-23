# Cache baris `qa_temuan` bersama untuk dashboard, trend, dan directory SIDAK — 13 November 2026

> **Status: selesai (ditutup 2026-11-23).** Semua tugas sudah di-deploy dan diukur. Keputusan RPC WP4 dipindah ke plan induk egress. Penyempurnaan berikutnya: `2be1a5ac` (versi perubahan per tahun).

Lanjutan WP4 di plan induk [`supabase-egress-reduction.md`](supabase-egress-reduction.md). Plan ini adalah "opsi murah sebelum RPC" yang tercatat di checklist WP4. Lane C: tanpa migration, mesin skor tidak disentuh.

## Konteks

Probe per pemilik (Lampiran B plan induk, 2026-11-12 06:53 s.d. 2026-11-13 05:02 UTC; hanya agregat):

| Pemilik                                                  | Hit/hari | Halaman lanjutan | Gaya paging       |
| -------------------------------------------------------- | -------- | ---------------- | ----------------- |
| Directory (`getAgentDirectorySummary`)                   | 312      | 286              | offset            |
| Dashboard (`fetchAllTemuan` di `dashboard-data.ts`)      | 304      | 160              | keyset (`id=gt.`) |
| Trend (`fetchPaginatedTrendData` di `service-trends.ts`) | 168      | 147              | offset            |
| Lainnya                                                  | 227      | –                | –                 |

Sejak `7baadd7f`, directory sudah di-cache 60 detik. Hasilnya: skor tanpa scope disimpan per tahun + set layanan, dan scope diterapkan per request. Dashboard dan trend masih membaca setahun `qa_temuan` di **setiap** request. Pemanggil `getDashboardData`:

- route dashboard SIDAK;
- `sidak-ranking-service` (3 tempat);
- `agent-quickview`;
- `dashboard-forecast`.

Fakta kode yang menentukan desain:

- Kolom dashboard (`DASHBOARD_TEMUAN_COLUMNS`) adalah superset kolom trend dan kolom directory. Satu salinan baris per tahun bisa melayani ketiganya.
- Dashboard memfilter layanan, periode, peserta, scope, dan id soft-deleted di URL PostgREST. Folder dan `isAgentExcluded` sudah difilter di memori. Trend memfilter `is_phantom_padding=false` di URL, lalu layanan di memori.
- Setiap request dashboard juga membaca seluruh `profiler_peserta` (`id, nama, batch_name, tim, jabatan`) tanpa cache.
- Satu-satunya penulis `qa_temuan` di API ada di `temuan-service.ts`: insert :193 dan :416, update :702, delete :716. Hook invalidasi directory sudah ada di sana, juga di `profiler-service.ts` dan `profiler-folder-service.ts` (14 panggilan). `rule-versions.ts` dan `period-indicator.ts` hanya menghitung (`head: true`).
- Skor dihitung per request dari konteks rule/bobot. Konteks itu sudah punya cache dan invalidasi sendiri (WP2), jadi menyimpan baris **mentah** tidak membuat skor basi saat rule berubah.

## Requirement

1. Request dashboard, trend, atau directory yang berulang untuk tahun yang sama dalam TTL (60 detik) tidak memindai `qa_temuan` lagi per instance, siapa pun pemanggilnya.
2. Hasilnya identik dengan jalur tanpa cache untuk setiap kombinasi filter: scope leader, layanan yang diizinkan, `service_type`, `period_ids`, rentang bulan, folder, `showArchived`, dan `peserta_id`.
3. Scope akses tidak pernah masuk kunci atau isi cache. Cache selalu berisi data tanpa scope, dan scope diterapkan per request.
4. Temuan atau peserta yang ditulis lewat API instance yang sama langsung terlihat di bacaan berikutnya. Batas basi lintas instance (Railway ↔ Coolify) paling lama 60 detik, dan dicatat di docs.
5. Memori per instance tetap terukur. Ukur jumlah baris per tahun di prod (read-only, agregat) sebelum menetapkan desain; jika satu tahun melebihi batas yang disepakati, pakai jalur tanpa cache.
6. Tidak ada perubahan kontrak API, schema, atau mesin skor.

## Design

### Modul baru `apps/api/src/services/sidak/temuan-row-cache.ts`

- `getYearTemuanRows(year): Promise<readonly CachedTemuanRow[]>`.
  - Isinya semua baris `qa_temuan` tahun itu dengan `DASHBOARD_TEMUAN_COLUMNS`, termasuk baris phantom.
  - Tidak difilter layanan, scope, atau soft-delete.
  - Dibaca dengan keyset `fetchAllByIdPartitions` yang sudah dipakai dashboard. Jalur offset trend dan directory ikut pensiun.
  - Disimpan di `createTtlCache` dengan kunci `year`, memakai dedupe in-flight dan fence generasi yang sudah ada.
- `getPesertaIndex(): Promise<ReadonlyMap<string, DashboardPeserta>>`. Ini cache 60 detik untuk pembacaan `profiler_peserta` yang sekarang diulang di setiap dashboard.
- `invalidateTemuanRowCache()` mengosongkan kedua cache dan cache directory. Ke-14 pemanggilan `invalidateAgentDirectorySummary()` diganti fungsi ini. Directory tetap mengekspor fungsinya sendiri untuk helper E2E.
- Hindari `structuredClone` per pemanggil, karena itu mahal untuk puluhan ribu baris. Baris dibekukan (`Object.freeze`) saat masuk cache dan dikembalikan sebagai `readonly`. Audit di tasklist memastikan tidak ada konsumen yang memutasi baris. Dashboard sudah membuat objek baru (`{ ...row, profiler_peserta }`). Sebelum diputuskan, cek `.sort()`/assign di `dashboard-aggregation`, `dashboard-trends`, `dashboard-insights`, dan scoring.

### Konsumen

- **Dashboard (`fetchAllTemuan`)**:
  - Kalau `year` ada dan `peserta_id` kosong, ambil `getYearTemuanRows(year)`. Filter layanan, `period_ids`, scope (`pesertaScopeFromIds` → set id), id soft-deleted, folder, dan `isAgentExcluded` diterapkan di memori, dengan urutan dan semantik yang sama seperti filter URL sekarang.
  - Kalau `year` tidak ada, petakan `period_ids` ke tahun periodenya, lalu gabungkan `getYearTemuanRows` per tahun. Hanya bila tahun periode tidak bisa ditentukan, jatuh ke jalur lama.
  - Kalau `peserta_id` ada (quickview satu agent), tetap pakai jalur lama: query-nya sudah sempit.
- **Trend (`fetchPaginatedTrendData`)**:
  - Ambil per tahun dari periode `pIds`, lalu filter `period_id ∈ pIds`, `!is_phantom_padding`, `tahun`, dan scope di memori.
  - Bentuk baris yang dikembalikan tetap sama (subset kolom).
- **Directory**:
  - `buildAgentDirectory` membaca dari `getYearTemuanRows` dan tidak lagi memindai sendiri.
  - Cache skor directory tetap ada di atasnya, karena skoringnya sendiri mahal.
  - Kolom directory ⊂ kolom dashboard, jadi tidak perlu kolom baru.

Invarian yang harus dicek sebelum memetakan periode → tahun: `qa_temuan.tahun` selalu sama dengan `qa_periods.year` untuk `period_id`-nya. Cek dengan hitungan mismatch read-only di lokal dan prod (agregat saja, izin Fajar untuk prod). Jika ada mismatch, kunci cache berbasis `tahun` dan filter `period_id` tetap dari URL, jadi rencana per-tahun perlu ditinjau ulang.

### Yang sengaja tidak dikerjakan

- Heatmap, forecast, report, EFEK, TNA, home agent-summary. Pindahkan ke cache ini hanya bila probe sesudah deploy menunjukkan hit-nya signifikan.
- Invalidasi lintas instance (pub/sub). Batas basi 60 detik diterima dan didokumentasikan, sama seperti WP2 dan directory.
- RPC agregasi WP4. Ditunda sampai pengukuran menunjukkan target <50 MB/hari belum tercapai.

### Risiko

- **Memori**: satu tahun penuh baris di tiap instance. Ini dimitigasi dengan pengukuran Requirement 5 dan batas baris yang membuat jalur lama dipakai bila terlampaui.
- **Selisih filter memori vs URL**, misalnya `null` di `service_type`/`batch_name` atau id soft-deleted. Ini dimitigasi dengan E2E paritas yang membandingkan respons cache vs tanpa cache untuk setiap filter.
- **Write di luar API** (SQL manual, import langsung ke DB) baru terlihat setelah paling lama 60 detik. Diterima.

## Tasklist

- [x] Drift-check dan pemanggil (2026-11-15). Pemanggil `getDashboardData`, `fetchPaginatedTrendData`, dan `getAgentDirectorySummary` sesuai bagian Konteks. Frontend trend selalu mengirim `year`.
- [x] Prasyarat probe: terpenuhi 2026-11-16 (hasil di bagian Deploy).
  - Jendela 24 jam terakhir jatuh di akhir pekan: 2026-11-14 13:42 s.d. 2026-11-15 03:35 UTC, total hanya 99 hit `qa_temuan` (dashboard 36, directory 36, trend 24, lainnya 3). Ini tidak sebanding dengan baseline hari kerja.
  - Ulangi pada hari kerja (Senin 16 Nov dibaca paling lambat Selasa pagi, karena retensi 24 jam).
  - Deploy Coolify dikonfirmasi Fajar 2026-11-16. Probe hari kerja Senin 16 Nov dijadwalkan Fajar mulai 19:00 WIB.
- [x] Ukuran tahun (perkiraan dari log, tanpa query DB):
  - Satu scan directory sekitar 12 halaman × 1.000 baris, jadi kira-kira 12 ribu baris per tahun. Batas cache ditetapkan 150.000 baris; di atas itu jalur lama dipakai.
  - Query read-only `execute_sql` ke prod diblokir hook `guard-remote` (prod hanya oleh Fajar).
  - Cek mismatch `tahun` vs `qa_periods.year` tidak dijalankan. Dampaknya dinetralkan desain: cache hanya dipakai saat `year` diberikan, dan baris tetap difilter `period_id`. Bacaan tanpa tahun memakai jalur lama.
- [x] Mutasi: tetap pakai `structuredClone` dari `createTtlCache` (baris hanya berisi primitif, ±12 ribu baris), jadi tidak ada risiko mutasi bersama. Freeze tidak dipakai.
- [x] E2E RED: `apps/web/e2e/sidak-temuan-row-cache-api.spec.ts`. Di kode lama tercatat 44 scan setelah bacaan pertama; test filter dan test write lolos di kode lama sebagai baseline.
- [x] Implementasi:
  - `temuan-row-cache.ts` (baris per tahun + peserta dashboard + `pesertaScopeFilter`);
  - dashboard, trend, dan directory membaca darinya;
  - `invalidateSidakTemuanCaches()` menggantikan 14 pemanggilan `invalidateAgentDirectorySummary()`.
- [x] Paritas lama vs baru: dump 12 kombinasi filter dengan id fixture deterministik identik, kecuali `created_at` periode dan id folder fixture. Kode dump hanya sementara dan tidak di-commit.
- [x] GREEN 3/3. Mutation check: dengan invalidasi dimatikan, test write gagal (22 diharapkan, 21 didapat).
- [x] Regresi lolos: directory-cache 3, home-attention 7, parallel-paging 6, agent-self 6, monitoring-numbers 6, monitoring-models 19, dashboard-kpi 6, dashboard-brief 9, user-peserta-link 6, tna-real-backend 122, access-scope 10.
  - Spec directory-cache, parallel-paging, dan brief disesuaikan. Fixture yang menulis lewat SQL kini me-reset cache baris, dan penghitung scan directory tidak lagi bergantung pada daftar kolom lama.
- [x] `thermo-nuclear`: PASS setelah dua perbaikan P3 (helper `pesertaScopeFilter` menggantikan duplikasi; komentar peserta dipindah). `pnpm typecheck`, `pnpm lint`, `pnpm build`, `git diff --check`, dan `graphify update .` semuanya exit 0.
- [x] Docs `docs/architecture.md` (bullet "SIDAK temuan row cache") dan changelog.
- [x] Deploy:
  - [x] Commit `76b9e922` di-push ke `main` (izin Fajar 2026-11-15). Railway API prod auto-deploy `280f91c5` SUCCESS 2026-11-15 13:53 UTC: server jalan, worker KETIK jalan, health 200.
  - [x] Coolify oleh Fajar: dikonfirmasi Fajar 2026-11-16 (deploy ke commit terbaru `main`, sudah memuat `76b9e922`).
  - [x] Probe hari kerja sesudah deploy (2026-11-16, `query_logs` read-only, hanya agregat). Jendela 2026-11-15 13:55 → 2026-11-16 13:10 UTC (±23 jam, seluruhnya sesudah deploy Railway, mencakup hari kerja Senin 16 Nov).
    - GET `qa_temuan`: 1.011 → 285 hit. Directory lama, dashboard lama, dan trend lama: 0 hit. Cache baris tahunan (`TEMUAN_ROW_COLUMNS` + `tahun=eq.` tanpa filter lain): 72 halaman = 6 scan setahun penuh (4 scan pukul 01 UTC, 2 scan pukul 08 UTC), dibanding ±56 scan sebelumnya.
    - Batas atas byte (≤1.000 baris × ±350 B per halaman): ketiga pemilik ≲265 MB/hari sebelumnya → cache tahunan ≲25 MB/hari. `content_length` tidak tercatat untuk respons besar (chunked), jadi ini tetap batas atas.
    - "Lainnya" 213 hit (sebelumnya 227), halaman lanjutan hanya 23. Terbesar: `select=id` (47, ber-scope peserta), teks detail agent (39), heatmap dengan `profiler_peserta!inner` (24, 16 lanjutan), home agent-summary (8, 4 lanjutan).
    - 39 POST `qa_temuan` (pukul 02 dan 10 UTC) tidak diikuti scan ulang dalam jam yang sama.
    - Catatan: traffic Senin tidak dinormalisasi terhadap Kamis 12 Nov (log baseline sudah lewat retensi).
  - [x] Putuskan apakah RPC WP4 masih perlu: dipindah ke WP4/WP5 plan induk egress (2026-11-23), lalu RPC dibatalkan karena target tercapai. Rekomendasi saat itu: tunda. Sisa `qa_temuan` sudah kecil; cek grafik Usage egress 2–3 hari kerja dulu terhadap target <50 MB/hari.
  - Temuan sampingan (request, bukan byte): `claimKetikReview` (`review-lifecycle.ts`) memanggil `resolveKetikReviewModels()` sebelum setiap klaim, termasuk saat idle, sehingga TTL 60 detik menghasilkan ±1.380 GET `ai_model_policy`/hari (stabil 59/jam, 24 jam). Klaim `claim_ketik_review` ±2.760/hari (119/jam). Payload kecil; optimasi opsional.

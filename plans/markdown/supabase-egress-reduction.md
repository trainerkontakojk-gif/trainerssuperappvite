# Pengurangan egress PostgREST Supabase — 9 November 2026

> **Status: selesai (ditutup 2026-11-23).** Target <50 MB/hari tercapai tanpa RPC WP4 (lihat WP5 di Tasklist).
> Semula sengaja tidak di-commit; di-commit sebagai arsip atas permintaan Fajar setelah ditutup. Path, nama fungsi, dan nomor baris di bawah mencerminkan kode saat dikerjakan.

## Konteks dan bukti (sudah diukur, read-only)

Organisasi Supabase `trainers` memakai **plan Free** (egress 5 GB per siklus). Project prod: `ruosnjmtywcrghjgqugz`.

**Usage (Dashboard → Organization → Usage), 9 Nov 2026:**

- Egress 2,717 / 5 GB pada hari ke-21 dari siklus 19 Okt – 19 Nov. Proyeksi akhir siklus ±3,5 GB, jadi belum darurat.
- Setelah lonjakan 20–23 Okt (ada porsi Storage), hampir semua egress berasal dari **PostgREST** (contoh 3 Nov: 98,9%).
- Pola harian: hari kerja 100–160 MB, akhir pekan ±20 MB (beban dasar tanpa pengguna).
- Kuota lain longgar: database 99/500 MB, storage 0,46/1 GB, MAU 5.

**Logs Explorer `edge_logs`, 24 jam (22.990 request):**

| Endpoint                                                                                | Hit/24 jam | Sumber di kode                                                                         |
| --------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------- |
| `POST /rest/v1/rpc/claim_ketik_review`                                                  | 16.919     | Worker KETIK, default 5 dtk (`apps/api/src/workers/ketik-review-worker-runtime.ts:29`) |
| `POST /rest/v1/rpc/claim_telefun_realtime_orphans`                                      | 2.852      | Sweep orphan OpenAI WebRTC, default 30 dtk (`apps/telefun/src/env-schema.ts:87`)       |
| `GET /rest/v1/qa_temuan`                                                                | 955        | SIDAK dan modul lain yang membaca temuan (rincian di bawah)                            |
| `GET /rest/v1/profiles`                                                                 | 545        | `authMiddleware` per request (wajar, baris kecil)                                      |
| `POST /rest/v1/rpc/cleanup_pdkt_mailbox_subject_intents`                                | 191        | Interval 15 menit, jalan di **dua** instance (Railway dan Coolify)                     |
| `qa_service_rule_indicators`, `qa_indicators`, `qa_service_rule_versions`, `qa_periods` | 139–189    | Tabel referensi diambil ulang di setiap request, tanpa cache                           |

Rincian 955 request `qa_temuan`:

- 462 ikut mengambil `ketidaksesuaian`/`sebaiknya` (79 di antaranya halaman lanjutan).
- 303 memakai `select=*`.
- 190 adalah scan penuh (132 halaman lanjutan, offset sampai ribuan).

Batasan: PostgREST tidak mencatat `content_length` (respons chunked), jadi ukuran per endpoint diukur terpisah lewat SQL di bawah.

**Ukuran respons (JSON tanpa kompresi, diukur dengan `supabase db query --linked`, read-only):**

| Query                                                          | Ukuran                                |
| -------------------------------------------------------------- | ------------------------------------- |
| `qa_temuan` seluruh tabel `select *` (8.519 baris, semua 2026) | 7,3 MB                                |
| `qa_temuan` kolom dashboard (`DASHBOARD_TEMUAN_COLUMNS`) 2026  | 5,7 MB per pengambilan penuh          |
| Sama, tanpa `ketidaksesuaian`/`sebaiknya`                      | 3,5 MB (teks panjang menyumbang ±40%) |
| `qa_temuan` `select *` per agent                               | rata-rata 67 KB                       |
| `qa_temuan` hanya `tahun`                                      | 149 KB                                |
| `qa_service_rule_indicators` / `qa_indicators`                 | 48 KB / 26 KB per panggilan           |
| `pdkt_history` per baris                                       | rata-rata 60 KB, maks 420 KB          |

**Estimasi kasar per hari kerja:** `qa_temuan` ±100 MB, tabel referensi ±15 MB, polling ±20 MB (beban dasar akhir pekan). Totalnya cocok dengan grafik Usage. Ini estimasi, bukan pengukuran per endpoint.

**Temuan kunci:** `ketidaksesuaian` dan `sebaiknya` diambil di banyak tempat hanya untuk menghitung satu boolean. `isCountableFinding` (`apps/api/src/services/sidak/shared-constants.ts:26`) = `nilai < 3` (null dianggap 3) **atau** salah satu teks tidak kosong setelah `trim()`. Pemakainya:

- `apps/api/src/services/sidak/`: `dashboard-data.ts`, `heatmap-service.ts`, `service-trends.ts`, `dashboard-trends.ts`, `agent-directory.ts`, `forecast.ts`, `temuan-service.ts`
- `apps/api/src/services/home/agent-summary.ts`
- `apps/api/src/services/efek/report.ts`
- `apps/api/src/services/tna/analysis.ts`

## Requirement

Turunkan egress PostgREST tanpa mengubah hasil yang dilihat pengguna.

- **Target prod** (diukur setelah deploy yang disetujui Fajar): beban dasar akhir pekan < 5 MB/hari, hari kerja < 50 MB/hari, `claim_ketik_review` < 3.000 hit/24 jam, dan scan penuh `qa_temuan` tidak lagi muncul di jalur dashboard/heatmap.
- **Paritas:** angka dashboard SIDAK, heatmap, trend, directory, detail agent, ranking, forecast, laporan EFEK, dan TNA harus identik dengan sebelum perubahan untuk data yang sama.
- **KETIK review:** tetap diproses tepat sekali. Latensi mulai review boleh naik paling lama sampai batas idle yang disepakati (lihat WP3).
- **Non-goal:** pindah ke VPS/self-host, pindah file ke R2, upgrade plan Supabase, mengubah alur auth.

## Design

Kerjakan per work package (WP) sesuai urutan. Setiap WP adalah perubahan terpisah: satu commit, satu entri changelog, dengan klasifikasi lane sendiri.

### WP0 — Baseline lokal (read-only, sebelum mengubah kode)

**Target database (keputusan Fajar, 9 Nov 2026):**

- Stack Supabase lokal yang dimulai dari backup **bukan** disposable. Jangan me-reset, menjalankan migration, menjalankan E2E, atau menulis apa pun ke stack itu.
- Matikan stack itu dengan `supabase stop` biasa, **tanpa** `--no-backup`, supaya datanya tetap tersimpan. Mac ini tidak kuat menjalankan dua stack sekaligus (hook `one-test-run.sh`).
- Buat stack disposable di workdir terpisah dengan port berbeda, dan periksa identitas, port, serta migration-nya sesuai `docs/e2e-testing.md` (bagian `E2E_SUPABASE_WORKDIR`). Stack inilah satu-satunya target untuk replay migration, E2E real-backend (`E2E_SUPABASE_WORKDIR=<workdir>`), dan baseline WP0.
- Selesai bekerja, matikan stack disposable dengan `supabase stop --workdir <workdir> --no-backup`.
- Seed data **sintetis** sekitar 8.500 baris `qa_temuan` tahun 2026 yang menyerupai prod:
  - kolom dashboard sekitar 0,67 KB per baris, dengan teks `ketidaksesuaian`/`sebaiknya` menyumbang ±40% ukurannya;
  - sertakan teks yang isinya hanya whitespace Unicode (NBSP `U+00A0`, `U+FEFF`, `U+2028`) untuk uji paritas `is_countable`.
  - `nilai` bertipe `integer NOT NULL CHECK (nilai BETWEEN 0 AND 3)` (`supabase/migrations/001_sidak_core.sql:172`), jadi baris dengan `nilai` null tidak bisa di-seed. **Jangan melonggarkan constraint.** Kasus null diuji sebagai input ekspresi di WP1.
- Jangan menyalin data prod (berisi data pribadi peserta).
- Query paritas atau ukuran read-only ke prod tetap harus meminta izin Fajar dulu.

**Progres (laporan agent pelaksana, 9 Nov 2026):**

- Stack dari backup dimatikan dengan `supabase stop` biasa; volume backup tetap ada.
- Stack disposable dibuat di workdir dan port terpisah, dan migration repo berhasil di-replay. Stack sudah dimatikan dengan `--no-backup`, tidak ada container tersisa.
- Seed sintetis 8.500 baris tahun 2026: kolom dashboard 5.715 KiB (±688 byte/baris), teks menyumbang 41,5%, dan 17 baris berisi teks whitespace Unicode. Angka ini cocok dengan prod (5,7 MB, ±40%).
- Bukti dan SQL reproduksi ada di `scratch/supabase-egress-baseline-20261109/` (diabaikan Git).
- Query Graphify sudah dijalankan. Belum ada perubahan kode, tes, atau query ke prod.

**Langkah:**

- Jalankan query ukuran di Lampiran A terhadap stack disposable yang sudah di-seed, dan simpan hasilnya sebagai pembanding.
- Untuk angka prod, Lampiran A boleh dijalankan ulang dengan `--linked`, karena read-only. Hook `guard-remote.sh` akan meminta persetujuan. Jangan menjalankan perintah prod lain.
- Jalankan `graphify` (skill `graphify`) untuk melihat pemanggil `isCountableFinding`, `fetchAllPages`, dan `fetchAllByIdPartitions` sebelum WP1/WP4.

### WP1 — Kolom `is_countable` di `qa_temuan` (Lane D: schema)

- Migration baru menambah `is_countable boolean generated always as (...) stored` yang meniru `isCountableFinding` persis. Sertakan rollback berpasangan di `supabase/rollbacks/` dan replay lokal yang bersih (skill `supabase-migration`).
- **Risiko paritas:** `String.prototype.trim()` di JS membuang whitespace Unicode (NBSP `U+00A0`, `U+FEFF`, `U+2028`, dan lain-lain), sedangkan `btrim()` default di Postgres hanya membuang spasi. Implementasi lokal memakai `btrim()` dengan daftar karakter eksplisit: WhiteSpace + LineTerminator ECMAScript, tanpa `U+180E`, `U+0085`, dan `U+200B` karena JS tidak membuangnya.
- **Kasus null:** karena `nilai` NOT NULL, cabang `nilai ?? 3` di JS tidak pernah tercapai dari baris database. Tetap pakai `coalesce(nilai, 3)` di ekspresi SQL supaya semantiknya identik dengan JS, lalu uji null dengan memanggil ekspresi itu langsung dengan input literal. Caranya: taruh logika di fungsi SQL `IMMUTABLE` yang dipanggil kolom generated, lalu panggil fungsi itu dengan `NULL` di uji paritas.
- **Hak akses fungsi:** kalau memakai fungsi, pastikan setiap role yang menulis `qa_temuan` (service role API, dan role lain yang insert/update lewat RLS) punya `EXECUTE`. Jangan ikut `revoke` seperti RPC service-role biasa tanpa menguji jalur insert/update temuan lewat E2E. Alternatifnya, tulis ekspresi langsung di definisi kolom generated.
- **Pemanggil yang sudah dicek:** semua pemanggil `isCountableFinding` saat ini memilih `nilai`, `ketidaksesuaian`, dan `sebaiknya` sekaligus (`efek/report.ts`, `home/agent-summary.ts`, `sidak/service-trends.ts`, `sidak/agent-directory.ts` detail dan tabel pembanding, `sidak/dashboard-data.ts`, `sidak/heatmap-service.ts`, `sidak/forecast.ts`, `sidak/temuan-service.ts`, `tna/metrics.ts`). Jadi mengganti ke `is_countable` mempertahankan hasil. Ringkasan directory (`agent-directory.ts:136`) tidak mengambil teks dan juga tidak memanggil `isCountableFinding`; jangan menambahkan `is_countable` di situ tanpa E2E paritas, karena hasilnya bisa berubah.
- Sebelum memakai kolom itu, buktikan paritas dengan query read-only yang menghitung baris yang hasil SQL-nya berbeda dari JS (harus 0), di lokal dan di prod.
- Ganti select yang mengambil `ketidaksesuaian, sebaiknya` **hanya untuk menghitung** menjadi `is_countable`. Jangan menghapus teks dari jalur yang menampilkannya (detail agent, laporan, export, coaching brief).
- Perkiraan dampak: kolom dashboard 5,7 → ±3,5 MB per pengambilan penuh.
- E2E RED-first: proyek real-backend yang sudah ada (`sidak-dashboard-kpi-real-backend`, `sidak-heatmap-filter-real-backend`, `sidak-dashboard-brief-real-backend` di `apps/web/playwright.api.config.ts`) atau satu spec paritas baru. Seed baris dengan teks berisi hanya whitespace Unicode; uji `nilai` null cukup lewat pemanggilan fungsi/ekspresi langsung.

**Progres (laporan agent pelaksana, 9 Nov 2026), belum di-commit:**

- Migration `supabase/migrations/20261109210000_qa_temuan_is_countable.sql`: fungsi `app_internal.qa_is_countable(integer, text, text)` (`IMMUTABLE`, `search_path` kosong, `EXECUTE` untuk `authenticated` dan `service_role`, dicabut dari `PUBLIC`/`anon`) dan kolom generated `is_countable`. Rollback berpasangan sudah ada.
- E2E di `apps/web/e2e/sidak-dashboard-kpi-api.spec.ts`: RED sebelum migration; GREEN 6 tes. Paritas JS–SQL 0 beda pada 8.500 baris sintetis. Tiap karakter whitespace, `NULL`, `U+0085`, `U+180E`, dan `U+200B` diuji langsung ke fungsi. Insert/update lewat `authenticated` dan `service_role` lulus.
- Replay, rollback, dan reapply lokal bersih. `pnpm typecheck`, `pnpm lint`, `pnpm build`, dan `git diff --check` lulus.
- **Belum:** `thermo-nuclear`, paritas prod, apply prod, dan penggantian select. Egress belum turun sampai penggantian select di-deploy.
- **Temuan review (9 Nov):** `supabase/rollbacks/README.md` sekarang gagal `prettier --check` (padding baris tabel baru); jalankan `prettier --write` pada file itu. Di HEAD file itu masih bersih.

**Dampak `select("*")` sementara:** setelah migration, tiap baris `select("*")` bertambah ±21 byte (`"is_countable":false`), atau sekitar 180 KB per pengambilan penuh 8.500 baris (+2–3%). Penulisan tetap aman karena kolom generated tidak pernah dikirim balik:

- insert di `temuan-service.ts` memakai kolom eksplisit;
- `updateTemuan` menerima payload `updateTemuanSchema` yang sudah di-strip Zod;
- `scripts/database-parity/sidak-may-incremental-sync.mjs` memakai `TARGET_COLUMNS` eksplisit.

Penggantian `select("*")` dengan kolom eksplisit tetap di WP4.

**Paritas prod (butuh izin Fajar, count-only):**

- Jalankan read-only lewat `supabase db query --linked`; hook akan meminta persetujuan.
- Kembalikan **angka saja**, jangan teks, id, atau baris.
- Bandingkan dua formulasi independen: fungsi/ekspresi `btrim` versus regex "mengandung karakter bukan whitespace JS" (kelas karakter `\uXXXX` di ARE Postgres).
- Sebelum apply: kembalikan `total`, `mismatches` (harus 0), dan jumlah baris yang mengandung karakter whitespace Unicode atau `U+0085`/`U+180E`/`U+200B`. Ekspresi ditulis inline karena fungsi belum ada di prod.
- Sesudah apply: ulangi dengan membandingkan `is_countable` dengan formulasi regex; hasilnya harus 0.
- Uji query ini dulu di stack disposable sebelum meminta izin.

**Hasil paritas prod sebelum apply (izin Fajar, 9 Nov 2026):**

- Prod: total 8.519, mismatch 0, 4 baris mengandung karakter Unicode yang diperiksa. Disposable: 8.507 / 0 / 17.
- Dijalankan sekali: `supabase db query --linked -o json -f "$PWD/scratch/supabase-egress-baseline-20261109/preapply-parity.sql"`. Isinya hanya SELECT/count; tidak ada baris atau teks yang keluar.
- Batas bukti: kedua formulasi (`btrim` dan regex) memakai daftar karakter yang sama. Jadi query ini membuktikan operasinya setara pada data prod, bukan daftar karakternya. Kesetaraan daftar karakter dengan JS `trim()` sudah dibuktikan per karakter di E2E lokal. Gabungan keduanya cukup sebagai syarat apply.

**Cara apply prod (ikuti pola commit `0101d715`):**

1. Preflight read-only: versi terakhir di prod `20261109120000`, `20261109210000` belum tercatat, dan kolom `is_countable` serta fungsi `app_internal.qa_is_countable` belum ada.
2. `supabase db query --linked -f supabase/migrations/20261109210000_qa_temuan_is_countable.sql`, lalu `supabase migration repair --linked --status applied 20261109210000`.
3. Readback read-only sesudah apply: versi tercatat; kolom generated dan fungsi ada; `has_function_privilege('anon', ...)` = false; query paritas sesudah apply (`is_countable` vs formulasi regex) = 0; jumlah baris tetap 8.519.
4. Catat di `docs/database.md`, plan ini, dan `CHANGELOG.md` dengan commit `docs(db): record the production apply ...`.

**Urutan rilis (wajib):**

1. Rapikan `supabase/rollbacks/README.md`, jalankan `thermo-nuclear`, lalu commit + push commit migration/E2E/docs/changelog. Ini tidak mengubah prod: CI hanya me-replay migration di stack lokal, tidak ada langkah `db push` otomatis, dan kode API tidak berubah.
2. Dengan izin Fajar: query paritas prod sebelum apply → apply migration ke prod → query paritas sesudah apply → commit `docs(db): record the production apply ...` mengikuti pola commit sebelumnya. `ALTER TABLE ... ADD COLUMN ... STORED` menulis ulang tabel dengan kunci `ACCESS EXCLUSIVE`; untuk ±8.500 baris prosesnya singkat, tapi tetap pilih jam sepi.
3. Baru sesudah kolom ada di prod: ganti select hitung ke `is_countable` (E2E paritas output per layanan RED-first, `thermo-nuclear`, gate), lalu commit + push. **Jangan push perubahan select sebelum langkah 2 selesai**: bila API ter-deploy dari `main`, PostgREST akan menolak kolom yang belum ada dan SIDAK rusak.

### WP2 — Cache tabel referensi SIDAK di memori API (Lane C)

- Cache baca untuk `qa_indicators`, `qa_periods`, `qa_service_rule_indicators`, `qa_service_rule_versions`, dan `qa_service_weights`, dengan TTL pendek (usulan 60–120 detik).
- Pembaca utamanya ada di `apps/api/src/services/sidak/`: `rule-versions.ts`, `rule-version-resolver.ts`, `period-indicator.ts`, `temuan-service.ts`, `report-data.ts` (`getServiceWeights`), dan `period-scoring-context.ts`.
- Invalidasi cache lokal di setiap jalur tulis pada proses yang sama: create/update/publish/delete rule version, create period/indicator, `updateServiceWeight`.
- API berjalan di dua instance (Railway dan Coolify), jadi instance lain bisa basi paling lama sebesar TTL. Catat batas ini di docs.
- **Jangan** meng-cache hasil scope akses (`getAccessibleAgentIds`, `access-scope.ts`). Itu batas izin (Lane D), dan perubahan izin harus langsung berlaku.
- E2E: ubah bobot layanan atau indikator lewat API, lalu baca ulang di instance yang sama dan pastikan hasil baru langsung terlihat.

### WP3 — Kurangi polling latar belakang (Lane C; perubahan env prod butuh izin Fajar)

1. **Worker KETIK** (`apps/api/src/workers/ketik-review-worker-runtime.ts`, `apps/api/src/services/ketik/review-lifecycle.ts`):
   - **Usulan kode:** backoff adaptif. Interval idle naik bertahap dari `KETIK_REVIEW_WORKER_INTERVAL_MS` sampai batas idle (usulan 60 detik, env baru dengan validasi seperti `number()` yang sudah ada). Interval kembali ke dasar setelah claim berhasil atau saat `enqueueKetikReview` sukses di proses yang sama (wake lokal).
   - Simpan state loop sebagai satu objek eksplisit (AGENTS.md melarang state machine implisit baru).
   - **Batasan:** API Coolify menjalankan worker `false`, jadi enqueue dari instance itu baru diambil worker Railway setelah poll berikutnya, paling lama sebesar batas idle. Fajar perlu menyetujui batas ini.
   - **Opsi sementara tanpa kode** (ops, butuh izin): set `KETIK_REVIEW_WORKER_INTERVAL_MS=30000` di Railway prod.
   - E2E: perluas `ketik-review-worker-api.spec.ts` / `ketik-review-worker-browser.spec.ts`. Review yang di-enqueue saat worker idle harus tetap selesai tepat sekali, dan backoff tidak boleh menelan review.
2. **Sweep orphan OpenAI WebRTC** (`apps/telefun/src/server.ts:131`, `apps/telefun/src/realtime-webrtc/durable-db.ts:733`):
   - Provider ini sudah dipensiunkan permanen, tapi sweep masih jalan tiap 30 detik.
   - Langkah pertama read-only: cek apakah masih ada attempt historis yang belum terminal di `telefun_realtime_attempts` (12 baris di prod). Periksa skema dulu; jangan menebak nama kolom status.
   - Lalu minta keputusan Fajar: (a) naikkan `TELEFUN_OPENAI_WEBRTC_ORPHAN_CLEANUP_INTERVAL_MS` ke maksimum 300000 (ops), atau (b) hentikan sweep lewat kode bila tidak ada lagi attempt non-terminal. Jangan menghapus jalur DELETE owner-bound yang masih menjadi kontrak.
3. **Cleanup PDKT subject intent:** 191 hit/hari, dampaknya di bawah 1 MB. Opsional: tambah env untuk mematikannya di satu instance. Lewati kalau waktu terbatas.

### WP4 — Agregasi SIDAK pindah ke SQL (Lane D: schema/RPC; dampak terbesar)

Urutan menurut dampak. Setiap butir dikerjakan dengan E2E paritas RED-first lebih dulu.

1. `getDashboardData` (`apps/api/src/services/sidak/dashboard-data.ts`, `fetchAllTemuan` dengan `fetchAllByIdPartitions`): RPC yang mengembalikan agregat (per agent/periode/indikator/layanan sesuai kebutuhan `dashboard-aggregation.ts`), bukan baris mentah. Evaluasi juga tabel ringkasan lama `qa_dashboard_period_summary` / `qa_dashboard_agent_period_summary` (migration `001`, `011`, `20260525000100`) dan materialized view-nya, sebelum membuat yang baru.
2. Heatmap (`apps/api/src/services/sidak/heatmap-service.ts:142` dan `:182`): hitung per hari di SQL.
3. Trend (`apps/api/src/services/sidak/service-trends.ts:26` `fetchPaginatedTrendData`, `calculateTopParameters`).
4. `getAvailableYears` (`apps/api/src/services/sidak/service-trends.ts:353`): ganti scan penuh dengan RPC `select distinct tahun` yang menerima scope peserta.
5. Ringkasan agent directory (`apps/api/src/services/sidak/agent-directory.ts:123–137`) dan ranking (`apps/api/src/services/sidak-ranking-service.ts`).
6. Lingkup kedua: `forecast.ts`, `report-data.ts`, `apps/api/src/services/home/agent-summary.ts`, `apps/api/src/services/efek/report.ts`, `apps/api/src/services/tna/metrics.ts`. Kerjakan hanya bila Lampiran B menunjukkan hit-nya signifikan.

Aturan RPC:

- Ikuti konvensi RPC service-role yang sudah ada: `search_path` kosong, tolak `anon`/`authenticated` di dalam fungsi, `revoke` dari role publik.
- Scope akses (agent yang boleh dilihat, layanan yang diizinkan) dikirim sebagai parameter dan diterapkan di SQL dengan semantik yang sama dengan `applyPesertaScope`/`pesertaScopeFromIds`.
- Pengecualian folder/jabatan (`EXCLUDED_FOLDERS`, `EXCLUDED_JABATAN` di `shared-constants.ts`) dan `is_phantom_padding` harus ikut.

Detail agent (`apps/api/src/services/sidak/agent-directory.ts:325`) dan daftar temuan (`apps/api/src/services/sidak/temuan-service.ts:60`) memakai `select("*")`. Ganti dengan kolom eksplisit yang benar-benar dipakai UI/export. Teks tetap diambil di sini karena ditampilkan.

### WP5 — Operasional prod (semua butuh izin eksplisit Fajar)

- Apply migration WP1/WP4 ke prod, deploy API (Railway dan Coolify) serta Telefun, dan ubah env WP3.
- Opsional, bukan soal egress: `pdkt_mailbox_items` memakai 40 MB TOAST padahal datanya ±2 MB (autovacuum terakhir 19 Okt). `VACUUM FULL` mengunci tabel sebentar dan hanya mengurangi kuota ukuran database.
- Setelah deploy, ulangi Lampiran B dan cek grafik Usage selama 2–3 hari kerja dan 1 akhir pekan. Bandingkan dengan target di Requirement.

## Tasklist

- [x] (Tidak relevan lagi saat ditutup: tiap WP sudah melakukan drift-check sendiri.) Drift-check plan ini terhadap kode, `docs/AGENT_WORKFLOW.md`, dan `AGENTS.md`. Muat `trainers-superapp-tdd` sebelum mengedit apa pun.
- [x] WP0: stack backup dimatikan tanpa `--no-backup`, stack disposable terpisah dibuat dan diverifikasi, seed sintetis 2026 dimuat, baseline Lampiran A dan query Graphify tersimpan sebagai bukti.
- [x] WP1a: E2E paritas RED → migration `is_countable` + rollback + replay lokal → paritas JS vs SQL = 0 → GREEN → rapikan README rollback → `thermo-nuclear` → commit `5ac9da02` + push.
- [x] WP1b (izin Fajar): paritas prod count-only 0 mismatch → apply prod 15:05 UTC 9 Nov → readback dan paritas sesudah apply 0/8.519 → commit `a9783745` + push.
- [x] WP1c-A: ganti select hitung di heatmap, trend, forecast, perbandingan agent, dan laporan EFEK ke `is_countable` → E2E → review → commit `f13d24ae` + push (izin Fajar; auto-deploy Railway prod).
- [x] WP1c-B: dashboard dua tahap. Bulk tanpa teks, teks hanya untuk baris parameter fokus (chunk 100 id) → review + re-gate blind → commit `ed62a1bb` + push.

Koreksi WP1 (penelusuran 9 Nov): dashboard, ringkasan home, detail agent, dan TNA memakai **isi** teks (root-cause, insight parameter fokus, `sample_tickets`), jadi teks di sana tidak bisa langsung dibuang. Baris non-countable menurut definisinya tidak punya teks berarti, sehingga byte teks hampir seluruhnya ada di baris countable. Untuk dashboard, teks hanya dipakai pada parameter fokus (`dashboard-insights.ts:86–105`), sehingga pengambilan dua tahap tetap memangkas sebagian besar teks.

- [x] WP2: E2E invalidasi RED → cache + invalidasi → GREEN → gate → commit + changelog. Catat batas basi multi-instance di docs.
  - Commit `84e1844a` (2026-11-10). Request dashboard kedua dalam 60 detik tidak membaca tabel referensi lagi. Write lewat API langsung meng-invalidasi cache. Guard write dan validasi temuan membaca fresh. Pembaca TNA/EFEK ber-JWT user tetap tanpa cache. Unit test legacy yang mem-mock pembaca ini mungkin basi (tidak dijalankan). Temuan lama, belum diperbaiki: indikator rule version yang sudah published masih bisa diedit lewat API.
- [x] WP3: E2E worker RED → backoff + wake lokal → GREEN → gate → commit + changelog. Cek attempt WebRTC (read-only) dan minta keputusan Fajar untuk sweep.
  - [x] WP3a backoff KETIK + wake lokal: commit `52062148` (2026-11-10). Klaim idle 6 detik turun dari 24–25 menjadi 5 (standalone dan embedded); wake lokal 262–282 ms. Batas idle default `max(30000, interval)`, jadi prod sekitar 2.880 klaim/hari saat idle. Enqueue dari API lain (Coolify) menunggu paling lama 30 detik. Belum diuji E2E: timing backoff saat error dan health idle panjang.
  - [x] Sweep orphan WebRTC: cek read-only prod sudah dilakukan 2026-11-10 (izin Fajar; agregat saja, `scratch/supabase-egress-baseline-20261109/webrtc-orphan-check.sql`).
    - `telefun_realtime_attempts`: 12 baris, semuanya `ended`. Attempt terbaru 2026-08-13, dan 0 attempt dalam 30 hari terakhir.
    - `telefun_realtime_leases`: 11 baris, semuanya `released`. 0 lease aktif dan 0 yang kedaluwarsa.
    - Kesimpulan: sweep tidak punya pekerjaan, tetapi tetap memanggil RPC sekitar 2.852 kali per hari.
    - Keputusan Fajar 2026-11-10: hapus sweep di kode. Selesai di commit `2ac3a57d`: E2E mencatat 4 klaim sebelum dan 0 sesudah. Deploy Railway Telefun `3e8485fc` SUCCESS. Coolify Telefun di-deploy sendiri oleh Fajar. Env `TELEFUN_OPENAI_WEBRTC_ORPHAN_CLEANUP_INTERVAL_MS` sudah obsolete dan boleh dihapus.
- [x] WP4: dibatalkan 2026-11-23 karena target sudah tercapai lewat cache (lihat WP5). Rencana semula: per butir, E2E paritas RED → RPC + rollback → GREEN → bandingkan ukuran respons dengan baseline WP0 → gate → commit + changelog.
  - [x] Langkah antara (2026-11-13): cache 60 detik untuk `getAgentDirectorySummary` (hasil tanpa scope per tahun + set layanan; scope diterapkan per request), invalidasi lokal saat tulis temuan/peserta. Commit `7baadd7f`; Railway API prod auto-deploy `6fd248f3` SUCCESS 2026-11-13 07:17 UTC (health 200, worker KETIK jalan); Coolify menyusul (deploy oleh Fajar). Bacaan kedua dalam TTL: 8 scan → 0 (E2E lokal).
  - [x] Opsi murah berikutnya, dikerjakan 2026-11-15 (cache baris bersama dashboard + trend + directory; plan rinci: [`sidak-temuan-row-cache.md`](sidak-temuan-row-cache.md)): perluas pola cache ke `getDashboardData` dan `fetchPaginatedTrendData` dengan menyimpan baris mentah `qa_temuan` tanpa scope per tahun + layanan, filter scope/folder/bulan per request, invalidasi lewat hook yang sama. Lane C, tanpa migration, mesin skor tidak disentuh. Kerjakan setelah probe ulang (24 jam penuh pasca-deploy) mengonfirmasi dampak cache directory. RPC WP4 hanya bila target <50 MB/hari belum tercapai; `dashboard-data.ts:446` menyebut rumus SQL/MV lama tidak setara dengan mesin skor, jadi RPC sebaiknya hanya mengelompokkan baris dan skor tetap di TypeScript.
- [x] Update docs kanonik yang terdampak (`docs/architecture.md`, docs SIDAK/database, `supabase/rollbacks/README.md`) dan perbaiki inkonsistensi di Lampiran C bila masuk scope.
  - 2026-11-16: cache referensi, cache baris temuan, `is_countable`, backoff KETIK, dan penghapusan sweep sudah tercatat oleh commit WP masing-masing. Sisa yang diperbaiki: diagram frontend→Supabase (Auth + dua upload Storage, tanpa Realtime), edge Gemini Live ganda, dan Prettier pada `supabase/rollbacks/README.md` serta `docs/database.md`.
- [x] WP5: minta izin Fajar untuk apply/deploy/env, lalu ukur ulang dan laporkan angka sebelum/sesudah.
  - 2026-11-23, Usage org `trainers` siklus 19 Nov – 19 Des (dibaca di dashboard): total egress 0,104 GB dalam 5 hari. Per hari: Kamis 19 Nov ±35 MB, Jumat 20 Nov ±36 MB (PostgREST 35,778 MB = 99,3%), Sabtu 21 Nov ±5 MB, Minggu 22 Nov ±7 MB, Senin 23 Nov ±16 MB (belum sehari penuh). Sebelumnya 100–160 MB per hari kerja. Target <50 MB/hari tercapai, jadi RPC WP4 tidak dikerjakan.

Gate per lane mengikuti `docs/AGENT_WORKFLOW.md` §7:

- E2E fokus satu worker hanya ke target lokal/disposable.
- `pnpm typecheck`, `pnpm lint`, dan `pnpm build` untuk Lane C/D.
- `git diff --check`.
- Satu test run pada satu waktu (hook `one-test-run.sh`).
- Jangan menambah atau menjalankan unit test tanpa izin Fajar.

## Lampiran A — Query ukuran respons (read-only)

Jalankan dengan `supabase db query --local -o json -f <file>`, atau `--linked` untuk prod (read-only, minta persetujuan lewat hook). Satuan dalam KB, JSON tanpa kompresi.

```sql
select json_build_object(
  'qa_temuan_rows', (select count(*) from public.qa_temuan),
  'kb_temuan_star_all', (select octet_length(coalesce(json_agg(t), '[]')::text) / 1024 from public.qa_temuan t),
  'kb_temuan_dashboard_cols_2026', (select octet_length(coalesce(json_agg(t), '[]')::text) / 1024 from (
      select id, peserta_id, period_id, indicator_id, rule_indicator_id, service_type, tahun, nilai, no_tiket,
             created_at, is_phantom_padding, ketidaksesuaian, sebaiknya
      from public.qa_temuan where tahun = 2026) t),
  'kb_temuan_dashboard_cols_2026_no_text', (select octet_length(coalesce(json_agg(t), '[]')::text) / 1024 from (
      select id, peserta_id, period_id, indicator_id, rule_indicator_id, service_type, tahun, nilai, no_tiket,
             created_at, is_phantom_padding
      from public.qa_temuan where tahun = 2026) t),
  'kb_temuan_tahun_only_all', (select octet_length(coalesce(json_agg(json_build_object('tahun', tahun)), '[]')::text) / 1024
      from public.qa_temuan where tahun is not null),
  'kb_temuan_star_per_agent_2026_avg', (select round(avg(s) / 1024) from (
      select octet_length(json_agg(t)::text) s from public.qa_temuan t where tahun = 2026 group by peserta_id) y),
  'kb_ref_tables', json_build_object(
      'qa_indicators', (select octet_length(coalesce(json_agg(t), '[]')::text) / 1024 from public.qa_indicators t),
      'qa_periods', (select octet_length(coalesce(json_agg(t), '[]')::text) / 1024 from public.qa_periods t),
      'qa_service_rule_indicators', (select octet_length(coalesce(json_agg(t), '[]')::text) / 1024 from public.qa_service_rule_indicators t),
      'qa_service_rule_versions', (select octet_length(coalesce(json_agg(t), '[]')::text) / 1024 from public.qa_service_rule_versions t),
      'qa_service_weights', (select octet_length(coalesce(json_agg(t), '[]')::text) / 1024 from public.qa_service_weights t))
) as sizes;
```

Untuk RPC baru di WP4, ukur `octet_length(<rpc>(...)::text)` dengan parameter yang setara, lalu bandingkan dengan baris di atas.

## Lampiran B — Query Logs Explorer (prod, ClickHouse)

Buka Dashboard → Logs → Logs Explorer, pilih rentang "Last 24 hours" (retensi plan Free hanya 1 hari). Wajib ada `LIMIT`, dan CTE (`with`) tidak didukung.

```sql
select
  concat(log_attributes['request.method'], ' ', log_attributes['request.path']) as endpoint,
  count() as hits
from logs
where source = 'edge_logs'
  and log_attributes['request.path'] like '/rest/v1/%'
group by endpoint
order by hits desc
limit 30
```

```sql
select
  multiIf(position(q, 'select=*') > 0, 'select_star',
          position(q, 'ketidaksesuaian') > 0, 'with_long_text', 'other') as kind,
  count() as hits,
  countIf(match(q, 'offset=[1-9]')) as later_pages
from (select decodeURLComponent(log_attributes['request.search']) as q
      from logs
      where source = 'edge_logs' and log_attributes['request.path'] = '/rest/v1/qa_temuan'
      limit 100000)
group by kind
order by hits desc
limit 10
```

Query string berisi UUID dan filter pengguna. Jangan menyalin isi mentahnya ke docs, commit, atau laporan.

Catatan: hitungan `offset=[1-9]` di atas **tidak menangkap** halaman lanjutan `getDashboardData`, karena `fetchAllByIdPartitions` memakai keyset (`id=gt.`), bukan `offset`. Pakai probe per pemilik di bawah.

### Probe per pemilik (2026-11-13, setelah WP1–WP3)

Jendela: 2026-11-12 06:53 → 2026-11-13 05:02 UTC (±22 jam, mencakup hari kerja 12 Nov). Read-only, hanya agregat per daftar kolom `select`.

```sql
select
  multiIf(position(q,'created_at,is_phantom_padding&')>0 and position(q,'select=peserta_id')>0,'agent_directory',
          position(q,'select=id,peserta_id,period_id,indicator_id,rule_indicator_id,service_type,tahun')>0,'dashboard',
          position(q,'select=nilai,is_countable,period_id')>0,'trends','other') as owner,
  count() as hits,
  countIf(match(q,'offset=[1-9]') or position(q,'id=gt.')>0) as continuation_pages,
  countIf(position(q,'tahun=eq.')>0) as year_filtered,
  countIf(position(q,'peserta_id=in.')>0 or position(q,'peserta_id=eq.')>0) as peserta_scoped
from (select decodeURLComponent(log_attributes['request.search']) as q
      from logs
      where source = 'edge_logs' and log_attributes['request.path'] = '/rest/v1/qa_temuan'
        and log_attributes['request.method'] = 'GET'
      limit 100000)
group by owner
order by hits desc
limit 10
```

| Pemilik                                                                                     | Hit | Halaman lanjutan | Muatan awal (kira-kira) | Filter                                 |
| ------------------------------------------------------------------------------------------- | --- | ---------------- | ----------------------- | -------------------------------------- |
| `getAgentDirectorySummary` (`apps/api/src/services/sidak/agent-directory.ts:139`, `offset`) | 312 | 286              | ±26 scan setahun penuh  | semua `tahun=eq.`, tanpa scope peserta |
| `getDashboardData` (`apps/api/src/services/sidak/dashboard-data.ts:61`, keyset `id=gt.`)    | 304 | 160              | ±36 (4 partisi)         | 296 per tahun, 64 per layanan          |
| `fetchPaginatedTrendData` (`apps/api/src/services/sidak/service-trends.ts:36`, `offset`)    | 168 | 147              | ±21 scan                | semua per tahun                        |
| Lainnya (±15 daftar kolom: `*`, teks, heatmap, `tahun`, `period_id`, EFEK)                  | 227 | 47               | —                       | campuran; teks panjang hanya ±50 hit   |

Batas atas byte (≤1.000 baris × ±300–400 B per halaman): dashboard ≲ 120 MB, directory ≲ 95 MB, trend ≲ 50 MB per hari. Ini batas atas, bukan ukuran terukur; urutannya yang dipakai.

Penelusuran kode (read-only):

- Tidak ada cache hasil di API untuk ketiga fungsi itu, dan frontend tidak memakai cache query (fetch ulang setiap mount).
- `getAgentDirectorySummary` dipanggil oleh `GET /sidak/agents` **dan** `GET /home/attention` (`apps/api/src/services/home/attention.ts:49`, item "agents_below_target"). Setiap buka Beranda oleh peran dengan `sidak.read` memicu scan `qa_temuan` setahun penuh hanya untuk menghitung agent di bawah target dan tiga nama terburuk.
- `getDashboardData` dipanggil oleh `GET /sidak/dashboard`, ranking (`sidak-ranking-service.ts`, sampai 3× untuk periode sekarang dan sebelumnya), quickview, dan forecast.
- Trend dipanggil oleh `GET /sidak/dashboard/trend`.

Implikasi untuk urutan WP4: directory dan dashboard setara besarnya, jadi RPC dashboard saja hanya memotong ±sepertiga. Kerjakan agregat directory (butir 5, termasuk konsumen Beranda) dan dashboard (butir 1) sebagai satu paket, lalu trend (butir 3). Heatmap dan `getAvailableYears` (18 hit) belakangan.

## Lampiran C — Inkonsistensi dokumentasi vs kode yang ditemukan

1. **(Diperbaiki 2026-11-16.)** `docs/architecture.md` (diagram High-Level) menulis frontend memakai Supabase "Client SDK / Realtime", tapi tidak ada pemakaian Realtime di kode (`.channel(` / `postgres_changes` tidak ada), dan Usage Realtime = 0.
2. **(Didokumentasikan 2026-11-16 sebagai pengecualian legacy di `docs/architecture.md`, kode tidak diubah.)** `AGENTS.md` menyatakan mutasi milik backend, tetapi foto Profiler di-upload langsung dari frontend (`apps/web/src/lib/profilerPhotoStorage.ts`).
3. **(Selesai lewat `2ac3a57d`, sweep dihapus.)** `docs/architecture.md` ("Archived pre-retirement Phase 5 … no described lease, sideband, network-recovery … path is active") menggambarkan orphan cleanup sebagai arsip, padahal `apps/telefun/src/server.ts` masih menjalankan `orphanCleanupWorker` yang memanggil `claim_telefun_realtime_orphans` ±2.850 kali per hari di prod.

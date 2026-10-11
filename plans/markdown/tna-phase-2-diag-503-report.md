# Diagnosis 503 TNA — Fase 2

## Status dan scope

Branch `feat/tna-phase-2`; HEAD dan **main lokal** sama: `ed1c2222da16f1b21be00244b0efb2b33d9845af`.
Diagnosis saja, bukan implementasi perbaikan. Skill `trainers-superapp-tdd` dan `debugging` dimuat. Investigasi di luar change lanes; lane usulan perbaikan dijelaskan di bawah.

Tidak ada perubahan T1, rumus, assertion, dependency manifest, migrasi, unit test, commit, push, deployment, remote, atau T2. Instrumentasi sementara pada route dan spec lama sudah dihapus; diff kedua file kembali kosong. Root typecheck/lint/build tidak dijalankan karena tidak ada perubahan produk.

## Akar penyebab dengan bukti

**503 berasal dari validasi output: `TNA_PARAMETERS_INVALID`. Bukan exception query atau regresi SQL T1.**

Respons instrumented:

```json
{
  "success": false,
  "error": {
    "code": "TNA_PARAMETERS_INVALID",
    "message": "Data parameter tidak dapat diproses. Silakan coba lagi."
  }
}
```

Zod melaporkan 12 issue `invalid_format`, `format: uuid`, `message: Invalid UUID`:

| Path                                                  | Nilai aktual                           |
| ----------------------------------------------------- | -------------------------------------- |
| `items[i].comparePeriods[0].periodId`, untuk `i=0..4` | `f1000000-0000-0000-0000-000000000005` |
| `items[i].comparePeriods[1].periodId`, untuk `i=0..4` | `f1000000-0000-0000-0000-000000000003` |
| `compare_period_ids[0]`                               | `f1000000-0000-0000-0000-000000000005` |
| `compare_period_ids[1]`                               | `f1000000-0000-0000-0000-000000000003` |

Kontrak `packages/types/src/tna.ts:75,226–230`: `tnaPeriodMetricsSchema.periodId` dan setiap `tnaParametersResponseSchema.compare_period_ids` memakai `z.string().uuid()`. Regex runtime mengharuskan nibble versi `[1-8]` pada grup ketiga dan variant `[89abAB]` pada grup keempat (atau UUID nil/max khusus). Kedua seed memiliki `0000` pada kedua grup tersebut. PostgreSQL menerima literalnya sebagai tipe UUID, tetapi schema API menolaknya. Tidak ada kegagalan angka metrik, `trendStatus`, atau pembagian nol pada log Zod ini.

Rantai penyebab:

1. `supabase/seeds/004_qa_periods.sql:7–12` membuat periode Januari–Juni **2024** dengan ID `f100...` tersebut.
2. `supabase/seeds/006_qa_temuan.sql` membuat tiga baris audit chat: dua pada Maret dan satu pada Mei 2024. Baris dengan nilai 3 tanpa temuan tetap merupakan audit presence.
3. `apps/web/e2e/helpers/tnaFixture.ts:142–145` membuat periode fixture Januari–April tahun **2080–2099**. Namespace memisahkan UUID/peserta, tetapi tidak mengisolasi kalender query produk.
4. `services/tna/metrics.ts:93–116` membaca dan mengurutkan seluruh periode yang terlihat. `services/tna/parameters.ts:121–153` memilih periode lebih lama dengan audit untuk layanan, menggunakan `dataScope: all` dari route.
5. Maka Januari fixture **bukan** periode audited paling awal dalam database seeded. Engine secara benar memilih Mei lalu Maret 2024 sebagai dua pembanding; asumsi komentar/assertion spec “No earlier audited period” tidak berlaku.
6. UUID pembanding masuk snapshot dan `compare_period_ids`, kemudian `routes/tna.ts:216–232` menolak output dengan 503. Spec langsung membaca `body.data.items`, sehingga TypeError menutupi error API asli.

Koreksi konteks prompt: catch endpoint daftar parameter saat ini mengembalikan **`TNA_PARAMETERS_UNAVAILABLE`**, bukan `TNA_UNAVAILABLE`; kode terakhir ada pada helper `tnaFailure` untuk endpoint lain. Instrumentasi catch pada daftar tidak menghasilkan `DIAG_503_CAUGHT`. Jalur `analysis.ts` bukan penyebab request daftar ini.

## Reproduksi dan kontrol main

Semua Playwright serial, satu worker, retry nol; Hono asli in-process, JWT/RLS dan Supabase lokal. Endpoint awal diverifikasi `127.0.0.1:54321/54322`; kontrol memakai `127.0.0.1:55421/55422`. Fetch guard fixture memblokir egress non-loopback. Tidak ada browser/dev-server tambahan.

Artefak: `.pi/orchestrator/tna-phase-2/t1-evidence/`.

Perintah **P** dari root:

```bash
pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --project=tna-real-backend tna-metrics-api.spec.ts --grep 'trendStatus separates' --workers=1
```

Perintah **M** sama, tetapi `--dir /tmp/tna-diag-503-main/apps/web`.

| Perintah / keadaan                                                                        | Exit | Artefak / hasil                                                                                            |
| ----------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------- |
| P, sebelum instrumentasi                                                                  | 1    | `diag-503-repro.log`: GET 503; TypeError di `item()`                                                       |
| P, log issue Zod + body + catch sementara                                                 | 1    | `diag-503-instrumented.log`: 12 issue UUID; body `TNA_PARAMETERS_INVALID`                                  |
| `git worktree add --detach /tmp/tna-diag-503-main main`                                   | 0    | checkout `ed1c222`, tanpa stash/reset branch kerja                                                         |
| `pnpm --dir /tmp/tna-diag-503-main install --offline --frozen-lockfile --ignore-scripts`  | 0    | `diag-503-main-install.log`; dependency/workspace main terpisah                                            |
| Start stack main baru, perintah di bawah                                                  | 0    | `diag-503-main-start.log`: semua migrasi main + tujuh seed direplay; **tanpa migrasi T1**                  |
| M, source main tanpa instrumentasi                                                        | 1    | `diag-503-main-repro.log`: GET 503; TypeError identik                                                      |
| M, log issue Zod + body sementara                                                         | 1    | `diag-503-main-instrumented.log`: kode, 12 path, dan ID seed identik                                       |
| Kontrol data terbatas di stack disposable main, lalu spec serial lengkap                  | 0    | `diag-503-main-no-seed-control.log`: `DELETE 3`; **7 passed**, termasuk seluruh kasus tren                 |
| M, setelah instrumentasi dihapus, tanpa tiga baris seed chat                              | 1    | `diag-503-main-no-seed-grep.log`: GET pertama/kedua **200**; bukan 503, tetapi `Expected: 2 / Received: 3` |
| Stop stack diagnosis                                                                      | 0    | `diag-503-cleanup.log`: stack T1 tetap berjalan                                                            |
| `git diff --exit-code -- apps/api/src/routes/tna.ts apps/web/e2e/tna-metrics-api.spec.ts` | 0    | instrumentasi branch kerja bersih                                                                          |

### Stack main bersih

Config **ignored**, dibuat khusus di worktree, menggunakan konfigurasi lokal yang sama dengan stack awal kecuali project ID `tna-diag-503-main`, API/DB/shadow port `55421/55422/55420`, dan studio/inbucket/analytics disabled. Seed paths tujuh file repo dipertahankan agar kontrol mereproduksi kondisi, bukan menyembunyikannya.

```bash
cd /tmp/tna-diag-503-main
supabase start -x storage-api,imgproxy,realtime,studio,edge-runtime,logflare,vector,mailpit,supavisor,postgres-meta
```

Stack dibuat dari volume baru; **tidak menjalankan `supabase db reset`**. Status env ditulis privat (`0600`) ke `.env.integration` worktree tanpa mencetak credential. Log startup disanitasi. Supabase CLI lokal `2.98.2`; CI menggunakan `2.120.0`, jadi bukan klaim parity versi CI.

Read-only SQL setelah E2E main: periode chat seeded `2024/3` memiliki 2 baris, `2024/5` memiliki 1; seluruh akun `e2e-browser-%@local.test` berjumlah 0 setelah cleanup fixture.

### Kontrol kausal, bukan perbaikan

Hanya pada **stack disposable milik diagnosis**, bukan stack `trainerssuperappvite`, tiga baris seed audit chat dihapus secara exact-ID:

```bash
docker exec supabase_db_tna-diag-503-main psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -c "DELETE FROM qa_temuan WHERE id IN ('aa000000-0000-0000-0000-000000000004','aa000000-0000-0000-0000-000000000005','aa000000-0000-0000-0000-000000000007') AND service_type='chat';"
pnpm --dir /tmp/tna-diag-503-main/apps/web exec playwright test --config=playwright.api.config.ts --project=tna-real-backend tna-metrics-api.spec.ts --workers=1
```

DELETE exit 0, tepat 3 baris; E2E exit 0, **7 passed**. Ini membuktikan hilangnya substrat pembanding seed menghilangkan 503 dan memenuhi kontrak tren tanpa perubahan produk/schema/assertion. Bukan usulan menghapus data stack pengguna untuk membuat gate hijau.

Kontrol grep selanjutnya mengungkap masalah spec kedua: assertion `risingMapped.findings === 2` mengandalkan test sebelumnya `data below MIN_FINDINGS...` yang menghapus satu temuan periode ketiga. Saat hanya grep kasus tren, temuan masih 3. Jadi perintah grep berguna mereproduksi 503, tetapi belum merupakan regression gate mandiri yang valid setelah penyebab 503 dihilangkan.

## Klasifikasi dan CI

**Klasifikasi utama: masalah seed data lokal + isolasi/asumsi spec Fase 1.** Bukan bukti bug rumus produk Fase 1, bukan regresi T1, dan bukan stack acak rusak: main fresh replay mereproduksi kegagalan secara deterministik dengan seed repo.

Ada ketidakcocokan kontrak data fixture: seed UUID diterima DB tetapi tidak memenuhi schema API. Walaupun URI/product validator tetap fail-closed, dataset dengan ID serupa dapat memicu masalah yang sama. Tidak ada inspeksi data remote, jadi laporan ini tidak menyimpulkan apakah data produksi memiliki ID tersebut.

`.github/workflows/ci.yml` **tidak menjalankan spec ini atau Playwright**. Job verify menjalankan install/lint/typecheck/build/audit; job migrations mengecek rollback dan fresh migration replay. Browser configs juga mengabaikan `*-api.spec.ts`; spec ini tersedia pada project `tna-real-backend` di config API khusus. Replay CI sendiri tidak menguji respons endpoint. Tidak memeriksa riwayat run CI remote.

## Usulan perbaikan minimal — BELUM dieksekusi

1. **Fixture/spec E2E, Lane C**: buat kondisi “tidak ada pembanding” benar-benar eksplisit dan terisolasi. Pada stack disposable, gunakan kalender fixture yang terverifikasi mendahului setiap audit layanan existing (preflight/fail-closed bila tidak bisa), atau gunakan setup E2E dedicated tanpa audit seed. Jangan mempersempit query produk ke namespace test, menghapus seed pada stack bersama, atau melonggarkan assertion `comparePeriods: []`.
2. Jadikan kasus tren self-contained: siapkan penghapusan satu temuan yang dibutuhkan dalam setup kasus itu, bukan mengandalkan test `MIN_FINDINGS` sebelumnya; assert status 200/success sebelum mengakses data agar error API terlihat. Tetap pertahankan expected findings dan semantik tren. Ini diperlukan agar grep menjadi gate fokus yang repeatable.
3. **Follow-up seed data, Lane D konservatif** (ID/FK lintas tabel dan kontrak API): ganti UUID sintetis tidak sesuai schema dengan UUID valid dan seluruh referensinya di seed terkait. Scope FK harus diinventarisasi sebelum persetujuan; mengganti UUID saja **tidak** memperbaiki asumsi “no comparison” karena audit seed tetap ada. Jangan melonggarkan `z.string().uuid()` atau menyunting ID database existing sebagai jalan pintas.

Prioritas paling kecil untuk membuka regresi metrik ialah butir 1–2, dengan persetujuan Fajar dan RED → GREEN focused E2E, kemudian serial spec lengkap. Butir 3 merupakan utang seed terpisah, bukan syarat mengubah rumus. Tidak satu pun usulan di atas diterapkan pada source.

## Apakah memblokir T2?

**Tidak ditemukan blocker teknis produk untuk implementasi T2 yang berasal dari 503 ini**: main tanpa T1 sudah gagal, dan main dengan kontrol substrat menjalankan seluruh spec metrik hijau. Namun **gate regresi seeded belum hijau**; jangan menyebut integrasi/rilis PASS. Persetujuan perbaikan fixture dan verifikasi gate yang repeatable perlu diselesaikan sebelum menutup gap. T2 tetap tidak dimulai dalam sesi diagnosis ini.

## Cleanup dan hygiene

- Semua instrumentasi route/spec di kedua worktree dihapus; diff source diagnosis kosong.
- Tidak menyentuh file T1 yang dirty; status awal kembali identik sebelum laporan baru ditulis.
- Stack diagnosis dihentikan dengan `supabase stop --workdir /tmp/tna-diag-503-main --no-backup` (exit 0); hanya volume diagnosis disposable dibuang. Stack pengguna tetap hidup.
- File credential worktree dan `.branches` CLI task-owned dihapus. Worktree main retained di `/tmp/tna-diag-503-main`, tracked/untracked status bersih; config ignored/dependency lokal tetap tersedia. Tidak ada proses server/worker diagnosis tersisa.
- Check scoped formatting dan `git diff --check` dicatat di `diag-503-report-check.log`. Tidak menjalankan unit suite atau root quality/build gate.

```text
STATUS: DIAGNOSED; tidak ada perbaikan produk/spec/seed diterapkan; T2 belum dimulai.
VERIFIED: 503 TNA_PARAMETERS_INVALID + 12 issue UUID; main fresh seeded stack gagal identik; kontrol data main serial 7/7 lulus; grep mengungkap dependensi antar-test; CI tidak menjalankan spec; instrumentasi bersih, stack diagnosis berhenti.
GAPS: Gate seeded tetap gagal; perbaikan fixture/seed menunggu persetujuan; produksi dan CI runtime tidak diuji; main yang dikontrol adalah ref lokal ed1c222, tanpa fetch remote.
```

# TNA Fase 5 — Laporan T2 (API katalog)

- **Tanggal:** 2026-11-07. Baseline `962815c4` (`main`).
- **Rencana:** [`tna-phase-5.md`](tna-phase-5.md) rev. 2 (D25, K32–K36, P-1–P-4). Lane **D** (kontrak API baru).
- **Target:** backend lokal (Hono in-process + Supabase lokal). Tidak ada produksi.

## Kontrak

| Method & path                          | Izin        | Isi                                                                                                                                      |
| -------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /tna/programs`                    | `tna.read`  | Tidak berubah: program aktif saja, dipakai form rencana dan saran program.                                                               |
| `GET /tna/programs?include_inactive=1` | `tna.read`  | Semua program (aktif dan nonaktif) + `plan_count` (rencana status apa pun). Query lain → 400.                                            |
| `GET /tna/programs/coverage`           | `tna.read`  | `{ uncovered_clusters }`: klaster `rootCauseClusterIds` yang tidak dipicu program aktif, **tanpa** `lainnya` (P-2).                      |
| `POST /tna/programs`                   | `tna.write` | Buat program (P-1). 201; kode ganda 409 `TNA_PROGRAM_CODE_EXISTS`; body tidak valid 422 `TNA_INVALID_PROGRAM`.                           |
| `PATCH /tna/programs/:id`              | `tna.write` | Ubah field tanpa `code`, wajib `expected_updated_at`; basi 409 `TNA_PROGRAM_STALE`; tidak ada 404 `TNA_PROGRAM_NOT_FOUND`; id rusak 400. |
| `POST /tna/programs/:id/active`        | `tna.write` | `{ active, expected_updated_at }`; basi 409.                                                                                             |
| `GET /tna/plans/:id`                   | `tna.read`  | Tambah `program: { code, name, gap_type, source }`: `snapshot` bila rencana sudah diaktifkan sesudah Fase 5, selain itu `catalog` (P-3). |

- **K35:** `createTnaProgramSchema` / `updateTnaProgramSchema` (strict) memvalidasi klaster terhadap `rootCauseClusterIds`, layanan terhadap `serviceTypeSchema`, modul terhadap `ketik/pdkt/telefun`, semuanya unik; nama 3–120 dan deskripsi 10–1000 setelah trim; kode `^[a-z][a-z0-9-]{2,47}$`. `created_by`/`is_active` di body ditolak.
- **Actor** selalu dari autentikasi. `logActivity` (`module: tna`): "Menambah", "Mengubah", "Mengaktifkan", atau "Menonaktifkan program TNA: {code}".
- **Narasi Ringkasan TNA** memakai nama program dari snapshot bila ada, jadi mengganti nama program tidak mengubah ringkasan rencana yang sudah aktif.
- `TnaProgram` membawa `updated_at`, `created_by`, `updated_by`; `TnaPlan` membawa `program_snapshot`.

## File

| File                                           | Isi                                                                                                               |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/services/tna/catalog-service.ts` | Baru: daftar katalog + `plan_count`, coverage, tiga writer RPC + log aktivitas.                                   |
| `apps/api/src/routes/tna.ts`                   | Query `include_inactive`, route coverage dan tiga route tulis; `invalidProgram` 422.                              |
| `apps/api/src/services/tna/errors.ts`          | `TNA_PROGRAM_CODE_EXISTS`, `TNA_PROGRAM_STALE` (409), `TNA_PROGRAM_NOT_FOUND` (404), `TNA_INVALID_PROGRAM` (422). |
| `apps/api/src/services/tna/read-service.ts`    | `program` di detail rencana; narasi memakai nama yang ditampilkan.                                                |
| `packages/types/src/tna.ts`                    | Schema katalog, `TnaCatalogProgram`, `TnaProgramCoverage`, `tnaProgramSnapshotSchema`, `TnaPlanDetail.program`.   |
| `apps/web/e2e/helpers/tnaHarness.ts`           | Mock hermetic mengikuti kontrak baru (field program dan `program` di detail).                                     |
| `apps/web/e2e/tna-catalog-api.spec.ts`         | Spec baru (6 test).                                                                                               |

## Spec `tna-catalog-api.spec.ts`

1. Create: trim nama, field server-owned, log aktivitas; kode ganda 409; 10 body tidak valid 422 (klaster/layanan/modul tak dikenal, duplikat, kode, nama, deskripsi, gap, `is_active`, `created_by`); hanya satu baris tersimpan.
2. Daftar: program nonaktif hilang dari daftar default (tanpa `plan_count`) tetapi ada di `include_inactive=1` dengan `plan_count`; jumlah rencana seed cocok dengan SQL; toggle basi 409; log aktif/nonaktif.
3. PATCH: ubah field dengan revisi baru dan log; basi 409, `code` 422, kosong 422, klaster tak dikenal 422, id tidak ada 404, id rusak 400; nama tidak berubah oleh percobaan gagal.
4. Coverage: `lainnya` tidak pernah muncul; klaster yang dipicu program baru hilang dari daftar dan kembali seperti semula setelah program dinonaktifkan.
5. Snapshot: draft menampilkan `source: catalog`; aktivasi lewat API mengisi `program_snapshot`; setelah program diganti nama dan gap, detail tetap menampilkan nama dan gap lama (`source: snapshot`) dan narasi memuat nama lama; program yang dipakai boleh dinonaktifkan dan rencana tetap terbaca.
6. Akses: admin bisa membuat; leader/agent 403 dan tanpa token 401 di lima endpoint katalog; data tidak berubah.

## Bukti eksekusi (satu runner pada satu waktu)

| Langkah                  | Perintah                                                                                                               | Hasil                                                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| RED                      | `apps/web`: `pnpm exec playwright test tna-catalog-api.spec.ts -c playwright.api.config.ts --project=tna-real-backend` | exit 1: `POST /programs` 404 (route belum ada); 5 test berikutnya tidak jalan (serial)                                         |
| GREEN                    | sama                                                                                                                   | exit 0, **6 passed**                                                                                                           |
| Regresi API TNA          | `pnpm exec playwright test -c playwright.api.config.ts --project=tna-real-backend`                                     | exit 0, **110 passed**                                                                                                         |
| Typecheck                | `pnpm --filter @trainers/{types,api,web} typecheck`                                                                    | types/api exit 0; web pertama exit 1 (mock harness dan interface `TnaPlan` belum mengikuti kontrak), setelah diperbaiki exit 0 |
| Lint, format, whitespace | `eslint` pada file tersentuh; `prettier --check`; `git diff --check`                                                   | exit 0                                                                                                                         |

Spec browser hermetic TNA **tidak** dijalankan di T2: perubahan web hanya menambah field di mock tanpa perubahan UI. Regresi browser dijalankan di T3.

## Rilis

Kode T2 membaca kolom baru (`updated_at`, `created_by`, `updated_by`, `program_snapshot`). `main` auto-deploy, dan produksi belum punya migrasi `20261107120000`, jadi push sebelum migrasi akan membuat `GET /tna/programs` gagal parse. **Commit T2 hanya lokal; push menunggu apply produksi** (izin Fajar).

## Berikutnya

T3: UI katalog (tab Katalog, form tambah/ubah, aktif/nonaktif dengan konfirmasi jumlah rencana, "Klaster tanpa program", baris "Program" di detail rencana).

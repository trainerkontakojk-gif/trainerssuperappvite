# TNA Fase 5 — Laporan T1 (migrasi katalog + rollback)

- **Tanggal:** 2026-11-07. Baseline `95e2b6ce` (`main`).
- **Rencana:** [`tna-phase-5.md`](tna-phase-5.md) rev. 2 (D24, K32–K35, P-1, P-3, P-4). Lane **D** (schema, trigger, RPC).
- **Skill:** `trainers-superapp-tdd`, `supabase-migration`.
- **Target:** Supabase lokal saja (stack minimal). **Belum diterapkan ke produksi.**

## Isi migrasi `20261107120000_tna_phase5_catalog.sql`

| Objek                                                            | Isi                                                                                                                                                                                                            |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tna_programs`                                                   | Kolom `updated_at` (default `now()`), `created_by`, `updated_by` (FK `auth.users`, NULL untuk seed); CHECK `suggested_modules <@ {ketik,pdkt,telefun}`.                                                        |
| Trigger `tna_program_guard` → `guard_program()`                  | `code` immutable (`TNA_PROGRAM_CODE_IMMUTABLE`); `id`/`created_at`/`created_by` immutable (`TNA_PROGRAM_IDENTITY_IMMUTABLE`); `updated_at` maju monoton seperti `tna_plans`.                                   |
| `tna_plans.program_snapshot`                                     | `jsonb` `{code, name, gap_type}`.                                                                                                                                                                              |
| Trigger `tna_plan_program_snapshot` → `guard_program_snapshot()` | INSERT wajib NULL; pada `draft → aktif` diisi dari baris program dalam UPDATE yang sama (nilai kiriman diabaikan); selain itu tidak boleh berubah untuk role apa pun (`TNA_PROGRAM_SNAPSHOT_IMMUTABLE`).       |
| `tna_create_program(uuid,jsonb)`                                 | Tujuh kunci persis; kode `^[a-z][a-z0-9-]{2,47}$`; kode ganda → `TNA_PROGRAM_CODE_EXISTS`.                                                                                                                     |
| `tna_update_program(uuid,uuid,timestamptz,jsonb)`                | Subset tidak kosong dari enam field tanpa `code`; `TNA_PROGRAM_NOT_FOUND`, `TNA_PROGRAM_STALE`.                                                                                                                |
| `tna_set_program_active(uuid,uuid,timestamptz,boolean)`          | Aktif/nonaktif dengan revisi; `TNA_PROGRAM_STALE`.                                                                                                                                                             |
| Helper `tna_internal`                                            | `validate_program` (nama 3–120, deskripsi 10–1000, gap 4 nilai, array string unik tidak kosong: klaster ≤ 20, layanan ≤ 10, modul ≤ 3 dari katalog) → `TNA_INVALID_PROGRAM`; `valid_text_array`, `text_array`. |

- Ketiga entry point public: `SECURITY DEFINER`, pernyataan pertama `assert_service_role()`, lalu `require_actor()`. EXECUTE tetap untuk `anon`/`authenticated`/`service_role` (K6), tanpa `REVOKE`. Helper `tna_internal` baru dicabut EXECUTE-nya dari semua client role (hanya dipanggil fungsi owner).
- Keanggotaan klaster dan layanan divalidasi di API (K35, T2). Database hanya memvalidasi bentuk dan modul.

### Penyederhanaan dibanding D24

D24 merencanakan `CREATE OR REPLACE` untuk `tna_activate_plan` agar mengisi snapshot. Sebagai gantinya, snapshot diisi trigger tersendiri pada transisi `draft → aktif`. Hasilnya:

- body Fase 2 `tna_activate_plan` dan `guard_plan` tidak disalin ulang atau diubah;
- snapshot juga terisi bila aktivasi lewat jalur lain, dan nilai kiriman tidak pernah dipercaya;
- rollback tidak perlu memulihkan body fungsi apa pun.

Keputusan K32–K37 tidak berubah.

## Rollback `rollback_20261107120000_tna_phase5_catalog.sql`

Fail-closed `TNA_PHASE5_ROLLBACK_DATA_PRESENT` bila ada program dengan `created_by`/`updated_by` terisi (dibuat atau diubah lewat writer katalog) atau rencana dengan `program_snapshot`. Bila bersih: buang tiga writer, tiga helper, dua trigger beserta fungsinya, CHECK, dan empat kolom. Baris ditambahkan ke `supabase/rollbacks/README.md`.

## Spec

- **Baru:** `apps/web/e2e/tna-catalog-db-api.spec.ts` (5 test, project `tna-real-backend`):
  1. kolom, writer, dan signature lama terpasang; tujuh seed tetap aktif tanpa `created_by` (P-4);
  2. create: field server-owned, kode ganda, 14 payload invalid + kunci hilang, actor leader ditolak, tanpa baris tersisa;
  3. update/toggle: revisi basi, `code` di payload, payload kosong, id tidak ada, program nonaktif menolak rencana baru (`TNA_PROGRAM_INACTIVE`), service role tidak bisa mengganti `code` atau menyimpan modul di luar katalog (`23514`);
  4. client role: admin/trainer membaca, leader/agent nol baris, DML langsung `42501`, ketiga RPC `TNA_FORBIDDEN`, DB tidak restart;
  5. snapshot: NULL saat draft, draft tidak bisa diberi snapshot, aktivasi mengisi `{code,name,gap_type}`, ganti nama program tidak mengubah snapshot, overwrite ditolak, program boleh dinonaktifkan sementara rencana tetap utuh.
- **Diperbarui:** `tna-access-api.spec.ts` — inventaris `MUTATION_FUNCTIONS` (fungsi `tna_*` yang boleh ada di schema `public`) ditambah tiga writer katalog. Uji ini sengaja gagal di regresi pertama sampai inventaris diperbarui.

## Bukti eksekusi (satu runner pada satu waktu)

| Langkah                        | Perintah                                                                                                                  | Hasil                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| RED                            | `apps/web`: `pnpm exec playwright test tna-catalog-db-api.spec.ts -c playwright.api.config.ts --project=tna-real-backend` | exit 1, `phase 5 columns missing` (Received `"none"`); spec serial, fungsi baru tidak dipanggil                                        |
| Replay                         | `supabase db reset --local`                                                                                               | exit 0                                                                                                                                 |
| GREEN                          | sama dengan RED                                                                                                           | exit 0, **5 passed**                                                                                                                   |
| Rollback dengan data           | `updated_by` diisi pada satu seed lalu rollback dijalankan via `psql -v ON_ERROR_STOP=1`                                  | exit 3, `TNA_PHASE5_ROLLBACK_DATA_PRESENT`; kolom tetap ada                                                                            |
| Rollback bersih                | data dikembalikan, rollback dijalankan ulang                                                                              | exit 0; 0 kolom dan 0 fungsi Fase 5 tersisa; 7 program                                                                                 |
| Spec setelah rollback          | spec katalog                                                                                                              | exit 1 (RED lagi)                                                                                                                      |
| Fase 1–3 setelah rollback      | `tna-practice-db-api`, `tna-evaluation-db-api`, `tna-plan-api`, `tna-access-api`                                          | exit 0, **28 passed**                                                                                                                  |
| Replay ulang + regresi API TNA | `supabase db reset --local`; `pnpm exec playwright test -c playwright.api.config.ts --project=tna-real-backend`           | percobaan 1: 102 passed, 1 failed (inventaris `tna-access-api`), 1 tidak jalan (serial). Setelah inventaris diperbarui: **104 passed** |
| Typecheck web + E2E            | `pnpm --filter @trainers/web typecheck`                                                                                   | exit 0                                                                                                                                 |
| Lint, format, whitespace       | `eslint` dan `prettier --check` pada dua spec; `git diff --check`                                                         | exit 0                                                                                                                                 |

## Berikutnya

T2: API katalog (`GET /tna/programs?include_inactive=1` dengan `plan_count`, `GET /tna/programs/coverage` tanpa `lainnya` (P-2), `POST`/`PATCH /tna/programs`, `POST /tna/programs/:id/active`) dengan `tna.write` (P-1), validasi K35 di zod, `logActivity`, serta narasi dan detail rencana memakai `program_snapshot` (P-3). Apply produksi migrasi ini menunggu izin Fajar.

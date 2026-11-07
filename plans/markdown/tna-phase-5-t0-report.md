# TNA Fase 5 — Laporan T0 (discovery read-only)

- **Tanggal:** 2026-11-07. Baseline `c55825f9` (`main`).
- **Rencana:** [`tna-phase-5.md`](tna-phase-5.md) rev. 2 (K32–K37 disetujui).
- **Target:** kode repo dan Supabase lokal (`docker exec supabase_db_trainerssuperappvite psql`). Tidak ada query produksi (itu T4), tidak ada perubahan kode atau data.

## Ringkasan

- **Tidak ada STOP.** S24: seed hanya memakai modul `ketik`, `pdkt`, dan `telefun`, jadi CHECK modul aman. S25: tidak ada consumer aplikasi yang memakai `code` program sebagai kunci. `code` hanya dipakai fixture tes, dan `code` tetap immutable.
- Empat penyesuaian implementasi diusulkan (P-1 sampai P-4). Tidak ada yang mengubah keputusan K32–K37.

## Fakta

### Consumer `tna_programs`

| Lokasi                                          | Pemakaian                                                                                                                                                                                       |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/services/tna/read-service.ts:29`  | `listTnaPrograms`: `is_active = true`, urut `code`, parse `tnaProgramSchema`. Dipakai `GET /tna/programs` dan saran program.                                                                    |
| `apps/api/src/services/tna/read-service.ts:167` | Detail rencana membaca program per `id` **tanpa** filter aktif, jadi rencana dengan program nonaktif tetap terbaca (RLS tidak menyaring `is_active`).                                           |
| `apps/api/src/services/tna/detail.ts:64`        | Saran program: program aktif dengan `service_types` kosong atau memuat layanan, **dan** `trigger_clusters` beririsan dengan klaster hasil.                                                      |
| `apps/api/src/services/tna/narrative.ts:86`     | Ringkasan TNA Fase 1: "Direkomendasikan {program.name} …". **Satu-satunya tempat nama program tampil di detail rencana.**                                                                       |
| `apps/web/src/routes/tna/need.tsx:59`           | Katalog untuk pilihan program saat membuat rencana; default = saran pertama, lalu program aktif pertama.                                                                                        |
| `apps/web/src/routes/tna/PlanForm.tsx`          | `<select>` program (hanya saat membuat) dan default latihan dari `suggested_modules` (Fase 3).                                                                                                  |
| SQL `tna_create_plan`                           | Menolak program nonaktif (Fase 1, dipertahankan di Fase 3).                                                                                                                                     |
| EFEK                                            | Memakai tabel terpisah `efek_programs`; **tidak** terdampak.                                                                                                                                    |
| Spec E2E                                        | `tna-access-api`, `tna-evaluation-db-api`, `tna-practice-*`, `tna-evaluation-*`, `tna-plan-api` mencari seed `effective-probing` lewat `code`; `tna-plan-api` membuat program nonaktif sendiri. |

### Schema lokal

- Kolom `tna_programs`: `id`, `code` (UNIQUE), `name`, `description`, `gap_type` (CHECK 4 nilai), `trigger_clusters`, `service_types`, `suggested_modules` (`text[]`, default `{}`), `is_active`, `created_at`. **Belum ada** `updated_at`/`created_by`/`updated_by`, CHECK modul, atau trigger.
- RLS: SELECT `is_admin_or_trainer()`; `authenticated` hanya SELECT; `service_role` ALL.
- `tna_plans` belum punya kolom program selain `program_id`. Definisi terakhir `tna_activate_plan` dan `tna_internal.guard_plan` ada di migrasi Fase 2 `20261011130000`, jadi rollback Fase 5 harus mengembalikan body Fase 2 itu.
- Sembilan entry point `public.tna_*`; belum ada fungsi katalog.

### Seed (7 program, semua aktif)

| code                          | gap       | klaster pemicu                                                         | layanan | modul                |
| ----------------------------- | --------- | ---------------------------------------------------------------------- | ------- | -------------------- |
| `akurasi-penggunaan-sistem`   | proses    | salah_penggunaan_sistem                                                | semua   | —                    |
| `coaching-individu`           | perilaku  | —                                                                      | semua   | —                    |
| `effective-probing`           | skill     | kurang_menggali                                                        | semua   | ketik, telefun       |
| `ketelitian-verifikasi-data`  | skill     | kurang_teliti_verifikasi_data, salah_nama_perusahaan_produk            | semua   | ketik, pdkt          |
| `post-ojt-reinforcement`      | skill     | —                                                                      | semua   | ketik, pdkt, telefun |
| `professional-email-handling` | skill     | —                                                                      | email   | pdkt                 |
| `refreshment-standar-jawaban` | knowledge | kurang_paham_standar_jawaban, kelebihan_standar_jawaban, salah_jawaban | semua   | ketik                |

Klaster dari `rootCauseClusterIds` (11) yang **tidak dipicu** program aktif: `hold_waktu_tunggu`, `proses_ideb_slik`, `komunikasi_layanan`, dan `lainnya`.

### Akses dan UI

- `CAPABILITIES` (`packages/types/src/access.ts:80`): `tna.read` dan `tna.write` sama-sama `["admin", "trainer"]`. Leader/agent tidak punya akses TNA (Fase 4 dibatalkan).
- `TnaTabs.tsx` punya dua tab: "Kebutuhan & rencana" dan "EFEK". Route `/tna*` dijaga `requireCapability("tna.read")`.
- Label klaster yang ramah pengguna sudah ada di `apps/web/src/routes/tna/utils.ts` (mis. `hold_waktu_tunggu` → "Durasi hold/waktu tunggu"). Validasi server memakai `rootCauseClusterIds` dan `VALID_SERVICE_TYPES` (`packages/types/src/sidak.ts:14`).

## Penyesuaian implementasi (usulan)

- **P-1. Pakai `tna.write`, bukan kapabilitas baru.** K32 memberi katalog ke admin + trainer, peran yang persis sama dengan `tna.write`. Kapabilitas `tna.catalog.manage` hanya menambah satu entri matriks dan satu cabang guard tanpa membedakan siapa pun. Bila suatu saat katalog perlu dipersempit (mis. admin saja), kapabilitas terpisah bisa ditambah saat itu.
- **P-2. `lainnya` tidak dihitung sebagai celah.** "Lainnya" adalah klaster penampung, bukan kebutuhan training spesifik. Bagian "Klaster tanpa program" (K36) hanya menampilkan `hold_waktu_tunggu`, `proses_ideb_slik`, dan `komunikasi_layanan`.
- **P-3. Lingkup snapshot program (K34).** Karena nama program saat ini hanya muncul di Ringkasan TNA, `program_snapshot` dipakai oleh:
  - narasi Ringkasan TNA untuk rencana `aktif`, `evaluasi`, dan `selesai`;
  - baris baru "Program" di daftar terkunci detail rencana.

  Rencana yang diaktifkan sebelum Fase 5 (snapshot NULL) memakai nama program terkini. Produksi punya 0 rencana TNA (preflight Fase 3, 2026-11-07), jadi tidak perlu backfill.

- **P-4. Spec memakai program fixture sendiri.** Banyak spec bergantung pada seed `effective-probing` yang aktif. Spec Fase 5 tidak menonaktifkan atau mengubah seed; mereka membuat program fixture dengan kode unik dan membersihkannya.

## Catatan untuk T1

- Tambah `updated_at` (default `now()`), `created_by`, `updated_by`, dan CHECK `suggested_modules <@ {ketik,pdkt,telefun}` ke `tna_programs`; tambah `program_snapshot jsonb` ke `tna_plans`.
- `guard_plan` (body Fase 2) diganti: `program_snapshot` NULL selama `draft`, diisi sekali di transisi `draft → aktif`, lalu immutable. Trigger baru di `tna_programs` membuat `code` immutable.
- `tna_activate_plan` diganti dengan signature sama untuk mengisi snapshot; tiga fungsi katalog baru memakai guard `assert_service_role()` di baris pertama, tanpa `REVOKE EXECUTE`.
- Rollback fail-closed bila sudah ada program buatan pengguna atau snapshot terisi, lalu mengembalikan body Fase 2.

## Berikutnya

T1 (migrasi, fungsi, trigger, rollback), RED-first real backend, setelah Fajar menyetujui P-1 sampai P-4.

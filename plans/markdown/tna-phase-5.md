# TNA (Training Needs Analysis) — Fase 5: Katalog Program via UI dan Parameter Lama Tanpa Master

- **Status:** DRAF rev. 1 — keputusan K32–K37 menunggu Fajar. Belum ada kode, migrasi, atau test.
- **Tanggal rencana:** 2026-11-04.
- **Baseline saat perencanaan:** `1b366ee9` (`main`). Mulai dari `main` terbaru di branch baru, mis. `feat/tna-phase-5`.
- **Fondasi:** Fase 1 (katalog seed K4, kunci parameter K8) dan perbaikan SIDAK [`sidak-unmapped-indicator-findings.md`](sidak-unmapped-indicator-findings.md) (commit `c62e4f85`: parameter baru selalu mendapat master). Tidak bergantung pada Fase 3 atau 4, jadi bisa dikerjakan paralel atau lebih dulu.
- **Executor:** Codex atau agent lain, satu task per sesi. T1 (migrasi/guard) sebaiknya Claude.
- **Risk lane:** **Lane D**: migrasi, fungsi mutasi service-role baru, kontrak API, antarmuka; Bagian B bisa menyentuh data produksi SIDAK.

## 0. Wajib dibaca executor sebelum mulai

1. `AGENTS.md` → `docs/AGENT_WORKFLOW.md`; skill `trainers-superapp-tdd`, `supabase-migration` (T1, T5), `ui-ux-pro-max`/`impeccable` (T3), `thermo-nuclear` (T6). Bukan `superpowers:*`.
2. Fase 1 D3.1 (`tna_programs`), D3.2 (guard), D3.3 (seed dan aturan saran program); `apps/api/src/services/tna/detail.ts` (pencocokan saran).
3. `packages/types/src/sidak.ts` `rootCauseClusterIds` (sumber tunggal id klaster).
4. `plans/markdown/sidak-unmapped-indicator-findings.md` seluruhnya, terutama §Data lama (backfill), K-d, T6, dan prasyarat deploy.

## Requirement

### Konteks bisnis

**Bagian A: katalog.** Program training TNA saat ini hanya bisa ditambah lewat migrasi. Trainer perlu menambah program baru, memperbaiki deskripsi, mengatur klaster pemicu dan modul latihan, serta menonaktifkan program lama dari aplikasi.

**Bagian B: parameter lama tanpa master.** Sejak `c62e4f85`, parameter baru di versi aturan SIDAK selalu mendapat master, jadi masalah ke depan sudah tertutup. Yang tersisa adalah **snapshot lama** tanpa `legacy_indicator_id` (bila ada di produksi). Parameter itu tidak bisa dipakai di TNA dan memblokir Sesi Tanpa Temuan pada layanannya.

### Fakta kode yang membentuk rencana ini

- `tna_programs` (`code` unik, `gap_type`, `trigger_clusters`, `service_types`, `suggested_modules`, `is_active`) di-seed 7 baris. Rencana mereferensikan program `on delete restrict`, jadi program terpakai tidak bisa dihapus.
- Saran program di `detail.ts`: program aktif yang `trigger_clusters` memuat klaster tervalidasi **dan** `service_types` kosong atau memuat layanan kebutuhan.
- Klaster yang ditambah setelah seed (`hold_waktu_tunggu`, `proses_ideb_slik`, `komunikasi_layanan`) **tidak dipicu program mana pun**. Kebutuhan dengan klaster ini belum pernah mendapat saran.
- Nilai `trigger_clusters` dan `suggested_modules` tidak divalidasi di DB.
- Backfill SIDAK (T6 rencana SIDAK) masih menunggu hasil query produksi read-only (K-d) dan izin Fajar.

## 1. Keputusan (menunggu Fajar)

| #   | Aspek                        | Usulan (rekomendasi)                                                                                                                                                                                                                                           | Alternatif                                                     | Status |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------ |
| K32 | Siapa yang mengelola katalog | **Admin + trainer** (kapabilitas baru `tna.catalog.manage`), sama dengan yang membuat rencana.                                                                                                                                                                 | Admin saja.                                                    | Usulan |
| K33 | Yang bisa diubah             | Tambah program; ubah `name`, `description`, `gap_type`, `trigger_clusters`, `service_types`, `suggested_modules`; aktif/nonaktif. **`code` tidak bisa diubah** setelah dibuat. Tidak ada hapus; nonaktifkan saja.                                              | Boleh hapus program yang belum pernah dipakai.                 | Usulan |
| K34 | Dampak ke rencana lama       | Rencana menyimpan `program_id`, jadi perubahan program terlihat di rencana lama. Usulan: rencana `aktif`/`evaluasi`/`selesai` menampilkan **nama program saat aktivasi** dari snapshot baru `program_snapshot` (diisi saat aktivasi, beku).                    | Terima bahwa rencana lama ikut berubah nama.                   | Usulan |
| K35 | Validasi nilai               | Server memvalidasi `trigger_clusters` terhadap `rootCauseClusterIds`, `service_types` terhadap `VALID_SERVICE_TYPES`, `suggested_modules` terhadap `ketik/pdkt/telefun`. DB menambah CHECK untuk `suggested_modules` saja (klaster bisa bertambah lewat kode). | CHECK DB untuk semua kolom.                                    | Usulan |
| K36 | Klaster tanpa program        | UI katalog menampilkan **"Klaster tanpa program"** agar trainer bisa menutup celah. Tidak ada seed program baru otomatis.                                                                                                                                      | Seed program untuk tiga klaster baru di migrasi ini.           | Usulan |
| K37 | Parameter lama tanpa master  | Bagian B **dimulai dengan query read-only produksi** (K-d rencana SIDAK, butuh izin Fajar). Nol baris → tutup tanpa kode. Ada baris → backfill opsi 3 (peta dikelompokkan, ditinjau Fajar) sebagai migrasi terpisah.                                           | Opsi 2 (satu master per snapshot; tren lintas versi terpecah). | Usulan |

Keputusan lama yang tetap: K5 (tanpa AI), K6 (tulis lewat RPC service-role dengan guard), K8 (kunci parameter = ID master).

### Hasil Fase 5

1. Halaman **Katalog program** (tab di `/tna`, hanya `tna.catalog.manage`): daftar program aktif/nonaktif, form tambah/ubah, toggle aktif.
2. Program nonaktif tidak muncul di saran atau pilihan rencana baru; rencana lama tetap tampil normal.
3. Bagian "Klaster tanpa program" (K36).
4. Rencana yang diaktifkan sesudah Fase 5 menyimpan `program_snapshot` (K34).
5. Bagian B: laporan hasil query produksi dan, bila perlu, migrasi backfill yang disetujui.

### Di luar cakupan Fase 5

Hapus program, versi katalog, impor/ekspor katalog, perubahan aturan saran program, perubahan registry klaster SIDAK, AI.

## 2. Desain

### D24. Data model (migrasi `<timestamp>_tna_phase5_catalog.sql` + rollback)

```
tna_programs (perubahan)
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  created_by uuid references auth.users(id),            -- NULL untuk seed
  check (suggested_modules <@ array['ketik','pdkt','telefun']::text[])

tna_plans (kolom baru, nullable)
  program_snapshot jsonb   -- { code, name, gap_type } saat aktivasi; beku (trigger)
```

- Trigger: `code` immutable; `program_snapshot` hanya diisi sekali bersamaan transisi `draft → aktif`.
- Fungsi baru (schema `public`, `SECURITY DEFINER`, pernyataan pertama `PERFORM tna_internal.assert_service_role();`, verifikasi actor, tanpa `REVOKE EXECUTE`):
  - `tna_create_program(p_actor_id, p_program jsonb)` → `TNA_PROGRAM_CODE_EXISTS`.
  - `tna_update_program(p_actor_id, p_program_id, p_expected_updated_at, p_program jsonb)` → `TNA_PROGRAM_STALE`.
  - `tna_set_program_active(p_actor_id, p_program_id, p_expected_updated_at, p_active boolean)`.
- `tna_activate_plan` diganti `CREATE OR REPLACE` dengan signature sama untuk mengisi `program_snapshot` dari baris program saat itu.
- Kode program: `^[a-z][a-z0-9-]{2,47}$`.

### D25. API

| Method & path                          | Kapabilitas          | Isi                                                                        |
| -------------------------------------- | -------------------- | -------------------------------------------------------------------------- |
| `GET /tna/programs?include_inactive=1` | `tna.read`           | Perluasan: termasuk nonaktif bila diminta; tiap item membawa `plan_count`. |
| `GET /tna/programs/coverage`           | `tna.read`           | Klaster dari `rootCauseClusterIds` yang tidak dipicu program aktif (K36).  |
| `POST /tna/programs`                   | `tna.catalog.manage` | Buat program (K33, K35).                                                   |
| `PATCH /tna/programs/:id`              | `tna.catalog.manage` | Ubah field K33 dengan `expected_updated_at`.                               |
| `POST /tna/programs/:id/active`        | `tna.catalog.manage` | `{ active, expected_updated_at }`.                                         |

Basi → 409; validasi → 422; `logActivity` (`module: tna`) untuk setiap mutasi.

### D26. Antarmuka

- Tab **Katalog** di `TnaTabs.tsx` (tersembunyi tanpa `tna.catalog.manage`).
- Daftar kartu/tabel program dengan status, gap type, klaster pemicu, layanan, modul latihan, jumlah rencana. Form di dialog (desktop) / halaman penuh (mobile). Pilihan klaster memakai label manusiawi yang sudah dipakai SIDAK.
- Nonaktifkan memakai konfirmasi yang menyebut jumlah rencana yang memakai program itu.
- Detail rencana memakai `program_snapshot.name` bila ada.

### D27. Bagian B: parameter lama tanpa master

1. Dengan izin Fajar, jalankan query read-only di §Query produksi rencana SIDAK terhadap produksi. Catat hasil di `plans/markdown/tna-phase-5-t4-report.md`.
2. Nol baris → tandai T6 rencana SIDAK "tidak diperlukan", perbarui `docs/database.md`, selesai.
3. Ada baris → siapkan peta pengelompokan per rantai `created_from_version_id` (tanpa penyatuan berdasarkan nama), minta Fajar meninjau, lalu migrasi backfill + rollback via `supabase-migration`, replay lokal. Penerapan ke produksi butuh izin terpisah.

## 3. Task

| Task | Isi                                                                                                                                                                                                                          | Bukti selesai                                  |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| T0   | **Discovery read-only**: semua consumer `tna_programs` (web + API), nilai seed live di lokal, label klaster yang tersedia, dampak CHECK `suggested_modules` pada data seed.                                                  | `plans/markdown/tna-phase-5-t0-report.md`.     |
| T1   | **Migrasi + fungsi + trigger + rollback** (D24). RED-first real backend: fungsi menolak non-service-role, `code` immutable, `program_snapshot` beku, CHECK modul, DB sehat.                                                  | RED → GREEN; replay dan rollback lokal bersih. |
| T2   | **API** (D25) + kapabilitas `tna.catalog.manage` + matriks akses. RED-first: validasi K35, kode duplikat, stale 409, program nonaktif hilang dari saran tetapi rencana lama tetap terbaca, coverage benar, leader/agent 403. | GREEN; regresi spec API TNA tetap hijau.       |
| T3   | **UI** (D26) dengan `ui-ux-pro-max`/`impeccable`. Spec browser hermetic: tambah, ubah, nonaktifkan, coverage, 409, desktop + mobile.                                                                                         | GREEN; screenshot.                             |
| T4   | **Bagian B langkah 1–2** (D27). Hanya dengan izin Fajar untuk query produksi read-only.                                                                                                                                      | Laporan dengan query dan jumlah baris.         |
| T5   | **Bagian B langkah 3** bila perlu. Migrasi terpisah, tidak diterapkan ke produksi tanpa izin.                                                                                                                                | Peta disetujui Fajar; replay/rollback lokal.   |
| T6   | **Review & dokumentasi**: `thermo-nuclear`, sinkron `docs/{modules,database,auth-rbac}.md`, gate serial, `graphify update .`.                                                                                                | `plans/markdown/tna-phase-5-t6-report.md`.     |

## 4. Strategi E2E

Real backend loopback untuk fungsi/API, hermetic browser untuk UI, satu runner pada satu waktu. Tidak ada unit test baru tanpa izin Fajar.

## 5. Rilis

Migrasi produksi hanya dengan izin Fajar (satu file + `migration repair`). Migrasi menambah kolom nullable dan fungsi baru; backend lama tidak terpengaruh. Bagian B punya izin terpisah.

## 6. STOP conditions (berhenti dan tanya Fajar)

- **S24:** Seed live punya `suggested_modules` di luar `ketik/pdkt/telefun` (CHECK akan gagal).
- **S25:** Ada consumer yang memakai `code` program sebagai kunci yang bisa rusak bila program dinonaktifkan.
- **S26:** Bagian B butuh mengubah snapshot versi aturan `published` di luar kolom mapping, atau penyatuan berdasarkan nama.
- **S27:** Query produksi atau migrasi apa pun tanpa izin eksplisit Fajar.
- STOP Fase 1–2 tetap berlaku.

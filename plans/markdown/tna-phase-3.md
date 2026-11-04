# TNA (Training Needs Analysis) — Fase 3: Penugasan Latihan Simulasi

- **Status:** DISETUJUI rev. 2 — K17, K19, K21, K22 dipilih Fajar pada 2026-11-04 (semua sesuai usulan); K18, K20, K23, K24 memakai default yang dijelaskan ke Fajar tanpa koreksi. T0 **SELESAI** 2026-11-04 (`tna-phase-3-t0-report.md`): fakta terbukti, tidak ada STOP; penyesuaian P-1–P-4 dan pertanyaan Q-1–Q-3 menunggu Fajar sebelum rev. 3 dan T1. Belum ada kode, migrasi, atau test.
- **Tanggal rencana:** 2026-11-04.
- **Baseline saat perencanaan:** `1b366ee9` (`main`). Mulai implementasi dari `main` terbaru di branch baru, mis. `feat/tna-phase-3`.
- **Fondasi:** Fase 1 ([`tna-phase-1.md`](tna-phase-1.md) rev. 7) dan Fase 2 ([`tna-phase-2.md`](tna-phase-2.md) rev. 2) selesai dan sudah di produksi. Kontrak keduanya tetap berlaku kecuali disebut lain.
- **Executor:** Codex atau agent lain, **satu task (T0–T5) per sesi**. Task migrasi/guard (T1) sebaiknya dikerjakan Claude (filter Codex pernah menolak wording guard/crash).
- **Risk lane:** **Lane D**: migrasi, fungsi mutasi service-role baru, pembacaan lintas akun dengan service-role, kontrak API publik baru, antarmuka baru.

## 0. Wajib dibaca executor sebelum mulai

1. `AGENTS.md` → `docs/AGENT_WORKFLOW.md` (Lane D, E2E-first, larangan unit test tanpa izin Fajar, larangan migrasi remote).
2. Skill `trainers-superapp-tdd` sebelum edit apa pun; `supabase-migration` di T1; `ui-ux-pro-max` sebelum T5 dan `impeccable` sesudahnya; `thermo-nuclear` di T6. **Jangan** memakai skill `superpowers:*`.
3. Rencana Fase 1 D3 (tabel, guard `tna_internal.assert_service_role()`, trigger imutabilitas) dan Fase 2 D11 (kolom evaluasi, snapshot beku saat `selesai`).
4. `supabase/migrations/20260910000000_simulation_subject_attribution.sql` dan `20261018130000_profiler_peserta_akun_link.sql` (identitas peserta di riwayat simulasi).
5. `apps/api/src/services/sidak/agent-simulations.ts` (pembacaan riwayat simulasi per peserta yang sudah ada).
6. `docs/e2e-testing.md`, lalu rencana ini sampai habis, termasuk §6 STOP conditions.

## Requirement

### Konteks bisnis

Program TNA sudah punya `suggested_modules` (mis. `effective-probing` → `telefun`, `ketik`), tetapi rencana belum memakainya. Fase 3 membuat rencana bisa **menugaskan latihan simulasi** KETIK/PDKT/Telefun kepada peserta dan menampilkan **progres latihan** di detail rencana. Latihan adalah **sinyal pendukung**: verdict Fase 2 tetap dihitung dari data SIDAK, bukan dari skor simulasi.

### Fakta kode yang membentuk rencana ini

- `tna_programs.suggested_modules text[]` sudah terisi seed Fase 1 (`ketik`, `pdkt`, `telefun`), tanpa validasi nilai di DB.
- Riwayat simulasi `ketik_history`, `pdkt_history`, `telefun_history` punya atribusi subjek: `simulation_subject_type` (`self` / `participant` / NULL legacy) dan `simulation_subject_peserta_id`. Sesi yang dijalankan trainer **atas nama** peserta tercatat `participant` + `peserta_id`.
- Sesi yang dijalankan agent sendiri tercatat `self` dengan `user_id` = akun agent. Akun agent terhubung ke peserta lewat `profiler_peserta.akun_id` (1:1, migrasi `20261018130000`).
- RLS ketiga tabel riwayat **owner-only** (`auth.uid() = user_id`). JWT trainer tidak bisa membaca riwayat akun lain, jadi K6 Fase 1 ("baca pakai JWT") tidak bisa dipenuhi untuk progres (lihat K21).
- `agent-simulations.ts` (detail agen SIDAK) sudah membaca riwayat lintas akun dengan `createAdminClient()`, hanya untuk `simulation_subject_type = 'participant'`. Ini preseden pembacaan service-role yang dibatasi backend.
- KETIK punya penugasan konfigurasi (`ketik_configuration_assignments`, kapabilitas `ketik.assignments.write`) untuk akun agent/leader. Itu menyalin konfigurasi skenario, bukan target latihan. PDKT dan Telefun tidak punya penugasan.
- Skor tiap modul berbeda skala: KETIK `final_score` 0–100, PDKT `evaluation` jsonb (status `completed`), Telefun `score` 0–10 dengan siklus scoring sendiri.

## 1. Keputusan (disetujui Fajar 2026-11-04)

| #   | Aspek                | Usulan (rekomendasi)                                                                                                                                                                                                                                                                                                     | Alternatif                                                                                  | Status              |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------- |
| K17 | Bentuk penugasan     | **Target per rencana per modul**: daftar `{ module, min_sessions }` (1–20 sesi) yang berlaku untuk **semua** peserta rencana. Default dari `suggested_modules` program, `min_sessions = 3`, bisa diubah selama `draft`.                                                                                                  | Target per peserta (lebih fleksibel, UI dan data jauh lebih berat).                         | Disetujui Fajar     |
| K18 | Jendela hitung       | Sesi dihitung bila waktunya (WIB) di antara `start_date` dan `evaluation_due_date` rencana, inklusif.                                                                                                                                                                                                                    | Sampai `end_date` saja; atau sejak aktivasi.                                                | Disetujui (default) |
| K19 | Sesi yang dihitung   | Sesi milik peserta = (a) `participant` dengan `simulation_subject_peserta_id = peserta_id`, **atau** (b) `self` dengan `user_id = profiler_peserta.akun_id`. Hanya sesi yang **selesai dinilai** (KETIK review selesai, PDKT `evaluation_status = completed`, Telefun scoring selesai). Sesi NULL legacy tidak dihitung. | Hanya (a), seperti detail agen SIDAK saat ini.                                              | Disetujui Fajar     |
| K20 | Kapan terkunci       | Target diedit selama `draft`, **dikunci saat aktivasi** bersama roster (pola K7). Progres dihitung live selama `aktif`/`evaluasi`, lalu **dibekukan saat `selesai`** ke snapshot peserta.                                                                                                                                | Target boleh diubah selama `aktif`.                                                         | Disetujui (default) |
| K21 | Jalur baca progres   | **Izin service-role baca terbatas**: hanya `services/tna/practice.ts` yang memakai admin client, hanya untuk hitungan + skor rata-rata per peserta per modul pada roster rencana yang sudah lolos `tna.read`. Tidak ada transkrip atau isi sesi di respons TNA.                                                          | Fungsi `SECURITY DEFINER` agregat dengan guard; atau buka RLS trainer ke riwayat (ditolak). | Disetujui Fajar     |
| K22 | Tampilan untuk agent | **Fase 3 hanya untuk trainer/admin.** Agent belum melihat tugasnya di aplikasi; trainer menyampaikan di kelas. Tampilan agent menunggu Fase 4 (scope peran selain admin/trainer).                                                                                                                                        | Agent melihat "Tugas latihan" di landing modul (butuh kapabilitas dan endpoint self baru).  | Disetujui Fajar     |
| K23 | Peran skor           | Skor rata-rata per modul ditampilkan sebagai **informasi**, tanpa ambang lulus dan tanpa memengaruhi verdict K14. Status per peserta hanya `belum_mulai` / `berjalan` / `memenuhi` (jumlah sesi ≥ target).                                                                                                               | Ambang skor minimal per modul.                                                              | Disetujui (default) |
| K24 | Skenario             | Fase 3 **tidak** menugaskan skenario tertentu. Detail rencana menautkan ke penugasan konfigurasi KETIK yang sudah ada bila trainer perlu.                                                                                                                                                                                | Skenario wajib per modul (butuh kontrak skenario di tiga modul).                            | Disetujui (default) |

Keputusan Fase 1/2 yang tetap: K1, K2 (admin + trainer), K5 (**tanpa AI**), K6 (tulis lewat RPC service-role dengan guard baris pertama), K14 (verdict dari SIDAK).

### Hasil Fase 3

1. Form rencana `draft` punya bagian **Latihan simulasi**: modul (pra-isi dari `suggested_modules`) dan jumlah sesi minimal.
2. Aktivasi mengunci target latihan.
3. Detail rencana `aktif`/`evaluasi`: kartu **Progres latihan** (berapa peserta memenuhi target per modul) dan kolom progres di tabel peserta.
4. Saat `selesai`, progres per peserta dibekukan dan tampil dalam mode baca. Narasi evaluasi menambah satu kalimat progres latihan.
5. Rencana tanpa target latihan tetap valid; semua perilaku Fase 1/2 tidak berubah.

### Di luar cakupan Fase 3

Tampilan tugas untuk agent/leader, notifikasi, skenario wajib, ambang skor, target per peserta, AI.

## 2. Desain

### D15. Data model (migrasi `supabase/migrations/<timestamp>_tna_phase3_practice.sql` + `supabase/rollbacks/rollback_<timestamp>_tna_phase3_practice.sql`)

```
tna_plan_practice_targets
  plan_id uuid not null references tna_plans(id) on delete cascade,
  module text not null check (module in ('ketik','pdkt','telefun')),
  min_sessions int not null check (min_sessions between 1 and 20),
  primary key (plan_id, module)

tna_plan_participants (kolom baru, nullable)
  practice_snapshot jsonb   -- NULL sampai selesai; { module: { sessions, avg_score, status } }
```

- RLS aktif; SELECT `is_admin_or_trainer()`; `REVOKE INSERT, UPDATE, DELETE` dari `anon, authenticated`. Tidak ada `REVOKE EXECUTE` pada fungsi (bug crash Postgres, K6).
- Trigger imutabilitas: `tna_plan_practice_targets` hanya boleh INSERT/UPDATE/DELETE bila rencana induk `draft`. `practice_snapshot` hanya boleh diisi sekali, bersamaan transisi `evaluasi → selesai` (pola penanda transaksi Fase 1).
- Fungsi `tna_create_plan`, `tna_update_draft_plan`, `tna_complete_plan` diganti dengan `CREATE OR REPLACE` dan **signature yang sama**: target dibawa di dalam `p_plan jsonb` (`practice_targets`), snapshot progres di payload peserta yang sudah ada. Guard service-role tetap pernyataan pertama. Bila signature harus berubah → STOP S15.
- Rollback wajib berpasangan dan diuji lokal (hapus tabel/kolom, kembalikan body fungsi Fase 2).

### D16. Mesin progres (`apps/api/src/services/tna/practice.ts`)

- Masukan: rencana (jendela K18, target K17) + roster (peserta + `akun_id`). Keluaran per peserta per modul: `sessions`, `avg_score` (skala asli modul, dibulatkan 1 desimal, `null` bila tidak ada), `status` K23.
- Query per modul dengan admin client (K21), dua cabang K19, filter jendela waktu, filter sesi selesai dinilai, **paginasi penuh** (pola `agent-simulations.ts`). Sesi yang cocok di kedua cabang dihitung sekali (dedupe `id`).
- Pakai ulang `SOURCE_CONFIG`/`getScore` dari `agent-simulations.ts` bila bisa diekstrak tanpa mengubah perilaku; jika tidak, catat di laporan T0.
- Tidak ada isi sesi, transkrip, atau nama konsumen di keluaran.

### D17. API (`apps/api/src/routes/tna.ts`)

| Method & path                             | Kapabilitas | Perubahan                                                                                                                          |
| ----------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `POST /tna/plans`, `PATCH /tna/plans/:id` | `tna.write` | Body menerima `practice_targets[]` opsional (`module` unik, `min_sessions` 1–20). Modul tidak dikenal → 422.                       |
| `GET /tna/plans/:id`                      | `tna.read`  | Tambah `practice_targets` dan `practice` (live untuk `aktif`/`evaluasi`, beku untuk `selesai`, `null` untuk `draft`/`dibatalkan`). |
| `POST /tna/plans/:id/complete`            | `tna.write` | Server menghitung progres final dan mengirimnya ke `tna_complete_plan`. Body berisi angka progres ditolak skema.                   |

- Kegagalan baca riwayat → 503 dengan pesan "Progres latihan belum bisa dimuat", tanpa menggagalkan bagian lain detail rencana bila kontrak respons mengizinkan `practice: { status: "unavailable" }` (putuskan di T0).

### D18. Narasi

Perluas `buildTnaEvaluationNarrative` (deterministik): bila ada target latihan, tambahkan sebelum kalimat penutup: "{x} dari {N} peserta memenuhi target latihan simulasi ({modul: target sesi})." Tidak ada kalimat bila tidak ada target. Narasi Fase 1 tidak berubah.

### D19. Antarmuka

- `PlanForm.tsx`: bagian **Latihan simulasi** dengan checkbox modul (pra-centang dari saran program) dan input jumlah sesi.
- `plan.tsx`: kartu **Progres latihan** (ringkasan per modul), kolom progres di tabel peserta (mobile: baris di kartu peserta), label "Data latihan mendukung, bukan pengganti hasil QA".
- State memuat/kosong/gagal dengan **Coba lagi**; mobile satu kolom tanpa overflow; komponen shadcn + `QaStatePanel`.

## 3. Task

| Task | Isi                                                                                                                                                                                                                                                                                             | Bukti selesai                                                            |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| T0   | **Discovery read-only.** Verifikasi fakta di atas pada kode live, terutama definisi "selesai dinilai" per modul, kolom waktu, skala skor, dan apakah `SOURCE_CONFIG` bisa dipakai ulang. Petakan perubahan body fungsi Fase 2. Hitung lokal berapa sesi `self` yang akun-nya terhubung peserta. | `plans/markdown/tna-phase-3-t0-report.md`; STOP bila S15–S18.            |
| T1   | **Migrasi + rollback + trigger** (D15), skill `supabase-migration`. RED-first: perluas `tna-access-api.spec.ts` (tabel baru tidak bisa ditulis JWT klien, fungsi tetap menolak non-service-role, DB sehat) dan spec imutabilitas (target terkunci setelah aktivasi, snapshot sekali tulis).     | RED → GREEN; `supabase db reset` lokal bersih; rollback → replay bersih. |
| T2   | **Mesin progres** (D16) + perluasan `GET /tna/plans/:id`. RED-first spec real backend `tna-practice-api.spec.ts`: sesi `participant`, sesi `self` via `akun_id`, sesi di luar jendela, sesi belum dinilai, sesi NULL legacy, dedupe, peserta tanpa akun.                                        | GREEN; hitungan cocok dengan perhitungan manual fixture di laporan.      |
| T3   | **Kontrak tulis** (D17): `practice_targets` di create/update/complete, pembekuan saat `selesai`, narasi D18. RED-first: modul tidak dikenal, duplikat, edit setelah aktif ditolak, angka dari body ditolak, leader/agent 403.                                                                   | GREEN; seluruh spec API TNA Fase 1/2 tetap hijau.                        |
| T4   | **UI** (D19) dengan `ui-ux-pro-max` sebelum dan `impeccable` sesudah. Perluas `tnaHarness.ts`; spec browser hermetic `tna-practice-flow.spec.ts`: isi target di draft → aktif → progres → selesai beku; state memuat/kosong/gagal; desktop + mobile.                                            | GREEN; screenshot desktop/mobile di `plans/markdown/`.                   |
| T5   | **Review & dokumentasi**: `thermo-nuclear`, perbaikan, sinkron `docs/{modules,database,auth-rbac}.md` (catat batas service-role K21), gate serial (API config + browser TNA + root typecheck/lint/build + `git diff --check`), `graphify update .`.                                             | `plans/markdown/tna-phase-3-t5-report.md` dengan perintah dan exit code. |

Setiap task menulis laporan `plans/markdown/tna-phase-3-tN-report.md` dan memperbarui baris Status. Satu runner test pada satu waktu.

## 4. Strategi E2E

- **Real backend loopback** (`helpers/sidakRealBackend.ts`, `playwright.api.config.ts`, workers 1) untuk kontrak DB/API/progres. Fixture membuat akun agent terhubung peserta, sesi riwayat di ketiga modul dengan atribusi berbeda, namespace acak, dibersihkan.
- **Hermetic browser** (`hermeticShell.ts` + `tnaHarness.ts`) untuk UI.
- Tidak ada unit test baru tanpa izin Fajar. Tidak ada pemanggilan AI (fixture menulis skor langsung).

## 5. Rilis

- Migrasi produksi **hanya** dengan izin eksplisit Fajar: satu file + `migration repair`, bukan `db push`; catat di `docs/database.md`.
- Urutan: migrasi dulu (tabel/kolom baru, body fungsi kompatibel dengan backend lama), lalu deploy API + web.
- Rollback: deploy sebelumnya + file rollback, hanya bila belum ada rencana `selesai` yang menyimpan `practice_snapshot`.

## 6. STOP conditions (berhenti dan tanya Fajar)

- **S15:** Target atau snapshot progres tidak bisa dibawa tanpa mengubah signature fungsi Fase 1/2.
- **S16:** Definisi "selesai dinilai" berbeda dari asumsi K19 untuk salah satu modul, atau sesi `self` tidak bisa dipetakan ke peserta tanpa menebak.
- **S17:** Pembacaan progres butuh service-role di luar batas K21 (mis. isi sesi, tabel non-riwayat), atau butuh mengubah RLS tabel riwayat.
- **S18:** Muncul kebutuhan tampilan agent, notifikasi, AI, skenario wajib, atau ambang skor (itu fase/keputusan lain).
- **S19:** Pengujian guard memicu `signal 11`/`PGRST001`. Jangan ulangi lebih dari sekali; laporkan potongan log.
- Semua STOP Fase 1 (S1–S9) dan Fase 2 tetap berlaku.

# TNA (Training Needs Analysis) — Fase 2: Evaluasi Pasca-Training

- **Status:** DISETUJUI rev. 2 — K9–K16 dan klarifikasi D11 disetujui Fajar pada 2026-10-11. T0 diterima; T1 memiliki bukti replay/rollback lokal dan root typecheck/lint/build. PR #51 sudah di-merge (`842273e`), branch `feat/tna-phase-2` sudah di-rebase, dan spec T1 diperbaiki di `0357846`; baseline T2 lokal kembali lulus **17/17**. T2 **SELESAI**: mesin evaluasi memakai bucket D1, baseline_sessions tersimpan saat aktivasi, pratinjau/verdict/drift dan opsi periode K9; enam UUID seed dan tujuh referensi diperbaiki dalam scope terpisah serta reset lokal disetujui Fajar. Gate T2 **6/6 dua kali**, enam grep tunggal, regresi wajib **23/23**, sepuluh tes plan non-cancellation, root typecheck/lint/build, Graphify dan diff-check lulus. Lihat `tna-phase-2-t2-report.md`. T3 **SELESAI lokal**: transisi API, cancel empat argumen beralasan, filter due WIB, writer K15 dengan migrasi/rollback baru yang disetujui Fajar; RED link-null dan route-missing → GREEN **10/10**, rollback → RED → replay bersih, regresi API TNA **51/51** termasuk seluruh **12/12** plan. Root typecheck/lint/build dan Graphify lulus; lihat `tna-phase-2-t3-report.md`. T4–T6 belum dimulai; review independen dan gate rilis/browser tetap sebelum PR di T6. Tidak ada migrasi remote/deploy.
- **Tanggal rencana:** 2026-10-11.
- **Baseline saat perencanaan:** `ed1c222` (`main`). Mulai implementasi dari `main` terbaru di branch baru, mis. `feat/tna-phase-2`.
- **Fondasi:** Fase 1 selesai (PR #30, migrasi `20261008120000` sudah di produksi). Kontrak Fase 1 tetap berlaku kecuali disebut lain: [`tna-phase-1.md`](tna-phase-1.md) rev. 7 (K1–K8, D1–D9).
- **Executor:** Codex atau agent lain. Kerjakan **satu task (T0–T6) per sesi**; jangan melompat task. Task yang menyentuh guard/crash Postgres (T1) sebaiknya dikerjakan Claude — filter Codex pernah menolak tugas berwording serupa.
- **Risk lane:** **Lane D** — migrasi/schema, fungsi mutasi service-role baru, transisi status, kontrak API publik baru, antarmuka baru.

## 0. Wajib dibaca executor sebelum mulai

1. `AGENTS.md` → `docs/AGENT_WORKFLOW.md` (Lane D, E2E-first, larangan unit test tanpa izin Fajar, larangan migrasi remote).
2. Skill `trainers-superapp-tdd` (wajib sebelum edit apa pun) dan `supabase-migration` (T1), dibaca dari `.claude/skills/supabase-migration/SKILL.md` di repo; tidak harus terpasang di `~/.pi/agent/skills/`. Untuk fungsi TNA di schema yang diekspos PostgREST, larangan `REVOKE EXECUTE` pada rencana ini mengesampingkan langkah revoke generik pada skill. `ui-ux-pro-max` sebelum T5, `impeccable` audit setelah T5, `thermo-nuclear` di T6. **Jangan** memakai skill `superpowers:*`.
3. `plans/markdown/tna-phase-1.md` rev. 7 — terutama K6 (jalur tulis + guard), K7/D4 (baseline beku), D1 (metrik), D9 (narasi).
4. `plans/markdown/tna-postgres-crash-investigation.md` — **jangan pernah** `REVOKE EXECUTE` pada fungsi di schema yang diekspos PostgREST.
5. `docs/SIDAK_LOGIC_AND_SCORING.md`, `docs/SIDAK_SCORING_GUARDRAILS.md` (tiga bucket: `auditPresenceRows` / `scoreRows` / `findingRows`).
6. `docs/e2e-testing.md` dan `plans/markdown/e2e-webserver-isolation.md` (T1–T4 selesai 2026-10-10) — verifikasi di T0 bahwa config browser default sudah aman sebelum menjalankan spec browser.
7. Rencana ini sampai habis, termasuk §6 STOP conditions.

## Requirement

### Konteks bisnis

Alur TNA: **Data → Temuan → Root Cause → Rekomendasi Training → Target → Evaluasi Pasca-Training**. Fase 1 menyimpan tiga langkah pertama sampai rencana `aktif` dengan baseline beku. Fase 2 menutup siklus: setelah tanggal evaluasi, trainer **mengevaluasi** apakah target tercapai dengan data SIDAK periode sesudah training, membandingkan peserta dengan **kelompok pembanding** (agent non-peserta), lalu **menyelesaikan** rencana dengan kesimpulan dan keputusan tindak lanjut.

### Fakta kode yang membentuk rencana ini

- `qa_periods` berbutir **bulanan** (`month`, `year`), jadi periode evaluasi = satu bulan SIDAK, bukan rentang H+30 harian.
- `tna_plans.status` CHECK sudah memuat `evaluasi` dan `selesai`, tetapi fungsi transisi Fase 1 menolaknya — Fase 2 hanya menambah fungsi/trigger, bukan mengubah CHECK.
- Baseline peserta Fase 1 (`baseline_findings`, `was_affected`) **tidak** menyimpan jumlah sesi sampel per peserta, sehingga tingkat per 100 sesi per peserta pada baseline tidak beku (lihat K12).
- Unique index `uq_tna_plans_open_need` menganggap `selesai` sebagai rencana terbuka; satu kebutuhan tidak bisa punya rencana kedua setelah selesai (lihat K15).
- Metrik populasi (`metrics.ts`) sudah menghitung sesi sampel per agent (`Math.max(MAX_SAMPLING, sessions.size)`) dan menerima `DataScope`; mesin kohort Fase 2 harus memakai ulang ini, bukan menulis rumus baru.

## 1. Keputusan (disetujui Fajar pada 2026-10-11)

Semua usulan K9–K16 disetujui melalui konfirmasi eksplisit "setuju semua", termasuk klarifikasi signature cancel dan lokasi skill di §0/D11. Persetujuan ini bukan otorisasi migrasi remote atau deployment.

| #   | Aspek                    | Usulan (rekomendasi)                                                                                                                                                                                                                                                                                                                                                                                                                   | Alternatif                                                                   | Status          |
| --- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------- |
| K9  | Periode evaluasi         | Trainer memilih **satu** periode SIDAK yang bulannya **setelah** bulan `end_date` rencana. Default: periode pertama yang memenuhi dan sudah punya audit untuk layanan tersebut.                                                                                                                                                                                                                                                        | Dua periode (rata-rata), atau periode dihitung otomatis tanpa pilihan.       | Disetujui Fajar |
| K10 | Kapan boleh dievaluasi   | Tombol **Mulai evaluasi** aktif bila tanggal hari ini (WIB) ≥ `evaluation_due_date`. Sebelum itu tampil "Evaluasi dijadwalkan {tanggal}". Server menolak lebih awal (`422 TNA_EVALUATION_NOT_DUE`).                                                                                                                                                                                                                                    | Boleh lebih awal dengan peringatan.                                          | Disetujui Fajar |
| K11 | Siklus snapshot evaluasi | Pola sama dengan baseline (K7): `aktif → evaluasi` hanya **memilih periode**; selama `evaluasi` hasil dihitung **live** sebagai pratinjau (data QA bulan itu mungkin masih diinput); hasil **dibekukan** saat `evaluasi → selesai`.                                                                                                                                                                                                    | Bekukan saat masuk `evaluasi`.                                               | Disetujui Fajar |
| K12 | Baseline per peserta     | Kohort peserta dan pembanding dihitung untuk **periode baseline dan periode evaluasi saat evaluasi** (baseline periode dihitung ulang), dengan label drift bila angka populasi hitung-ulang berbeda dari `baseline_snapshot`. **Verdict target memakai `baseline_snapshot` beku**, bukan hitung-ulang. Mulai Fase 2, aktivasi juga menyimpan `baseline_sessions` per peserta agar rencana baru punya baseline peserta yang beku penuh. | Hanya simpan ke depan; rencana yang sudah aktif tanpa analisis kohort.       | Disetujui Fajar |
| K13 | Kelompok pembanding      | Agent non-peserta pada layanan yang sama, **diaudit di periode baseline dan periode evaluasi**, lolos `isAgentExcluded`. Ditampilkan sebagai **indikasi, bukan bukti kausal**. Bila < 5 agent → label "Kelompok pembanding terlalu kecil", efek bersih tidak ditampilkan.                                                                                                                                                              | Hanya agent satu tim dengan peserta; ambang lain.                            | Disetujui Fajar |
| K14 | Verdict                  | Deterministik dari target vs metrik populasi periode evaluasi: `tercapai` (tingkat ≤ target **dan** sebaran ≤ target), `tercapai_sebagian` (salah satu), `tidak_tercapai` (keduanya tidak). Periode evaluasi `no_audit` → **tidak bisa diselesaikan** (`422 TNA_EVALUATION_NO_AUDIT`). `insufficientData` → verdict tetap, dengan catatan.                                                                                             | Verdict dipilih trainer; atau verdict berbasis peserta saja.                 | Disetujui Fajar |
| K15 | Tindak lanjut            | Saat menyelesaikan, trainer memilih `selesai_tuntas`, `perlu_rencana_lanjutan`, atau `eskalasi_non_training` + catatan wajib. `perlu_rencana_lanjutan` **tidak** membuat rencana kedua pada kebutuhan yang sama; UI membuka validasi parameter yang sama pada periode evaluasi, dan kebutuhan baru menyimpan `previous_plan_id`.                                                                                                       | Ubah unique index agar satu kebutuhan bisa punya beberapa rencana berurutan. | Disetujui Fajar |
| K16 | Pembatalan & akses       | `evaluasi → dibatalkan` diizinkan dengan alasan wajib (juga mulai berlaku untuk `aktif → dibatalkan`). Semua aksi evaluasi memakai kapabilitas `tna.write` yang ada (admin + trainer); tidak ada kapabilitas baru.                                                                                                                                                                                                                     | Hanya admin boleh menyelesaikan; pembatalan tanpa alasan seperti Fase 1.     | Disetujui Fajar |

Keputusan Fase 1 yang tetap: K1 (modul sendiri), K2 (admin + trainer), K5 (**tanpa AI**), K6 (baca JWT/RLS, tulis lewat RPC service-role dengan guard baris pertama), K8 (parameter legacy-mapped saja).

### Hasil Fase 2

1. **Daftar "Perlu dievaluasi"** di `/tna`: rencana `aktif` yang sudah jatuh tempo, dan rencana `evaluasi` yang belum selesai.
2. **Mulai evaluasi** (`aktif → evaluasi`) dengan memilih periode evaluasi (K9, K10).
3. **Pratinjau evaluasi** live (K11): metrik populasi periode evaluasi vs baseline beku vs target; kohort peserta vs pembanding (K12, K13); tabel per peserta.
4. **Ganti periode evaluasi** selama `evaluasi`.
5. **Selesaikan** (`evaluasi → selesai`): server menghitung ulang, membekukan hasil, menetapkan verdict (K14), menyimpan kesimpulan dan tindak lanjut (K15).
6. **Hasil beku** pada detail rencana `selesai` + Ringkasan Evaluasi deterministik (perluasan D9).
7. Transisi lengkap: `draft → aktif | dibatalkan`, `aktif → evaluasi | dibatalkan`, `evaluasi → selesai | dibatalkan`. `selesai` final.

### Di luar cakupan Fase 2 (kandidat fase berikutnya, §7)

Penugasan simulasi KETIK/PDKT/Telefun, akses leader, UI kelola katalog program, dukungan indikator unmapped (K8), notifikasi/email jatuh tempo, ekspor narasi (PDF/DOCX), narasi AI, segmentasi pasca-OJT, dashboard efektivitas lintas rencana, penghapusan permanen data TNA, entri TNA di `MobileTabBar`.

## 2. Desain

### D10. Metrik evaluasi

Semua angka memakai mesin Fase 1 (`getTnaParameterAnalysis` / `metrics.ts`) dengan `service_type`, `indicator_id`, dan `compare_count` milik kebutuhan; hanya `period_id` yang diganti periode evaluasi. Tidak ada rumus baru untuk tingkat/sebaran/sesi.

- **Populasi evaluasi** = metrik D1 untuk periode evaluasi (`ratePer100`, `spreadPct`, `findings`, `auditedAgents`, `sampledSessions`, `auditStatus`, `insufficientData`).
- **Kohort** (fungsi baru `cohorts.ts`, memakai bucket yang sama):

| Kohort     | Anggota                                                                                   | Dihitung untuk              |
| ---------- | ----------------------------------------------------------------------------------------- | --------------------------- |
| Peserta    | Peserta terkunci saat aktivasi (`peserta_id` tidak null) yang diaudit di periode tersebut | Periode baseline & evaluasi |
| Pembanding | K13                                                                                       | Periode baseline & evaluasi |

Per kohort per periode: `agents`, `findings`, `sampledSessions`, `ratePer100 = findings / sampledSessions × 100`, `spreadPct`. Lalu `delta = rate_evaluasi − rate_baseline` per kohort, dan `efek_bersih = delta_peserta − delta_pembanding` (hanya bila kedua kohort ≥ ambang K13).

- **Per peserta:** `baseline_findings` (beku), `baseline_sessions` (beku bila ada, else hitung-ulang berlabel), `eval_findings`, `eval_sessions`, `audited_in_eval` (peserta yang tidak diaudit di periode evaluasi ditandai "Tidak diaudit", tidak dihitung nol).
- **Drift:** `baseline_recompute_drift` = selisih `findings`/`auditedAgents` populasi hitung-ulang terhadap `baseline_snapshot`; UI menampilkan "Data QA periode baseline berubah sejak aktivasi" bila ≠ 0.
- `evaluation_snapshot` memuat `metric_version: 1`, `computed_at`, `evaluation_period_id`, populasi, kohort, drift, dan verdict.

### D11. Data model (migrasi `supabase/migrations/<timestamp>_tna_phase2_evaluation.sql` + `supabase/rollbacks/rollback_<timestamp>_tna_phase2_evaluation.sql`)

```
tna_plans (kolom baru, nullable)
  evaluation_period_id uuid references qa_periods(id) on delete restrict,  -- diisi saat aktif → evaluasi
  evaluation_started_at timestamptz,
  evaluation_snapshot jsonb,              -- NULL sampai selesai; beku (trigger)
  verdict text check in ('tercapai','tercapai_sebagian','tidak_tercapai'),
  conclusion_note text check (char_length(btrim(conclusion_note)) between 10 and 2000),
  follow_up text check in ('selesai_tuntas','perlu_rencana_lanjutan','eskalasi_non_training'),
  completed_at timestamptz,
  cancel_reason text check (char_length(btrim(cancel_reason)) between 10 and 1000)

tna_plan_participants (kolom baru, nullable)
  baseline_sessions int,                  -- diisi saat aktivasi untuk rencana baru (K12)
  eval_findings int, eval_sessions int, audited_in_eval boolean   -- diisi saat selesai

tna_needs (kolom baru, nullable; tetap append-only)
  previous_plan_id uuid references tna_plans(id) on delete restrict   -- K15
```

- Constraint konsistensi: `status = 'selesai'` ⇒ `evaluation_snapshot`, `verdict`, `follow_up`, `completed_at` tidak null; `status = 'evaluasi'` ⇒ `evaluation_period_id` tidak null.
- Trigger Fase 1 diperluas: kolom evaluasi dan kolom peserta evaluasi **immutable** setelah `selesai`; `evaluation_period_id` hanya boleh berubah saat `evaluasi`; tidak ada transisi keluar dari `selesai`.
- Fungsi aktivasi Fase 1 diganti (`CREATE OR REPLACE`, signature kompatibel) agar menerima `baseline_sessions` opsional per peserta.
- Pembatalan K16: tambahkan overload `public.tna_cancel_plan(uuid, uuid, timestamptz, text)` untuk alasan pembatalan. Ganti body fungsi 3-argumen lama dengan `CREATE OR REPLACE` tanpa mengubah signature: hanya `draft` boleh dibatalkan; `aktif`/`evaluasi` ditolak dengan `TNA_CANCEL_REASON_REQUIRED`. Kedua fungsi memakai guard service-role sebagai pernyataan pertama; tidak ada `REVOKE EXECUTE`. Backend baru memakai overload 4-argumen. Selama jeda migrasi → deploy, backend lama tetap dapat membatalkan `draft`, tetapi pembatalan `aktif` sengaja ditolak agar alasan wajib tidak bisa dilewati. Pertahankan validasi actor, optimistic revision, dan penolakan status final.
- Rollback Fase 2 wajib berpasangan dan diuji lokal. Fase 1 belum memiliki file rollback karena aturan tersebut diberlakukan sesudahnya; T1 tidak perlu membuat rollback retroaktif Fase 1.
- Index: `tna_plans(status, evaluation_due_date)` untuk daftar "Perlu dievaluasi".
- RLS: tidak ada policy baru untuk klien (SELECT tetap `is_admin_or_trainer()`); kolom baru ikut policy tabel.

**Fungsi mutasi baru** (schema `public`, `SECURITY DEFINER`, `SET search_path = public, tna_internal`, **pernyataan pertama** `PERFORM tna_internal.assert_service_role();`, lalu verifikasi actor admin/trainer, satu transaksi, kode error stabil). **Tidak ada `REVOKE EXECUTE`.**

| Fungsi                         | Transisi / efek                                          | Error utama                                                                                                  |
| ------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `tna_start_plan_evaluation`    | `aktif → evaluasi`, set periode + `started_at`           | `TNA_PLAN_NOT_ACTIVE`, `TNA_EVALUATION_NOT_DUE`, `TNA_EVALUATION_PERIOD_INVALID`, `TNA_PLAN_STALE`           |
| `tna_update_evaluation_period` | ganti periode selama `evaluasi`                          | `TNA_PLAN_NOT_EVALUATING`, `TNA_EVALUATION_PERIOD_INVALID`, `TNA_PLAN_STALE`                                 |
| `tna_complete_plan`            | `evaluasi → selesai`, bekukan snapshot + peserta         | `TNA_EVALUATION_NO_AUDIT`, `TNA_EVALUATION_PARTICIPANT_MISMATCH`, `TNA_INVALID_EVALUATION`, `TNA_PLAN_STALE` |
| `tna_cancel_plan` (perluas)    | `aktif`/`evaluasi` → `dibatalkan` dengan `cancel_reason` | `TNA_CANCEL_REASON_REQUIRED`, `TNA_PLAN_TRANSITION_CONFLICT`                                                 |

`TNA_EVALUATION_PERIOD_INVALID`: periode tidak ada, atau bulan periode ≤ bulan `end_date` (K9). Verdict dihitung di backend TypeScript **dan** dicek ulang di fungsi dari angka snapshot vs target rencana (pertahanan berlapis, sama seperti cek target saat aktivasi).

### D12. API (`apps/api/src/routes/tna.ts`)

| Method & path                          | Kapabilitas | Sukses | Isi                                                                                                                                              |
| -------------------------------------- | ----------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /tna/plans?status=…&due=1`        | `tna.read`  | 200    | Perluasan: filter `due=1` = `aktif` jatuh tempo + `evaluasi`; tiap item membawa `evaluation_due`                                                 |
| `GET /tna/plans/:id`                   | `tna.read`  | 200    | Perluasan: `evaluation` = pratinjau live (status `evaluasi`) atau snapshot beku (`selesai`); `evaluation_period_options` saat `aktif`/`evaluasi` |
| `POST /tna/plans/:id/start-evaluation` | `tna.write` | 200    | Body `{ evaluation_period_id, expected_updated_at }`                                                                                             |
| `PATCH /tna/plans/:id/evaluation`      | `tna.write` | 200    | Body `{ evaluation_period_id, expected_updated_at }`                                                                                             |
| `POST /tna/plans/:id/complete`         | `tna.write` | 200    | Body `{ conclusion_note, follow_up, expected_updated_at }`; server menghitung snapshot & verdict                                                 |
| `POST /tna/plans/:id/cancel`           | `tna.write` | 200    | Perluasan: `cancel_reason` wajib untuk `aktif`/`evaluasi`                                                                                        |
| `POST /tna/needs`                      | `tna.write` | 201    | Perluasan: `previous_plan_id` opsional; harus rencana `selesai` dengan `follow_up = perlu_rencana_lanjutan` dan parameter sama                   |

- Tipe di `packages/types/src/tna.ts`. Body berisi field metrik/snapshot/verdict **ditolak skema** (strict) — klien tidak pernah mengirim angka.
- Peta error: `TNA_PLAN_STALE`/`TNA_PLAN_TRANSITION_CONFLICT` → 409; validasi bisnis → 422; pesan ramah berbahasa Indonesia, bukan error database mentah.
- Setiap mutasi `logActivity` (`module: tna`).

### D13. Narasi evaluasi (perluasan `narrative.ts`, deterministik)

> "Evaluasi {periode evaluasi}: tingkat ketidaksesuaian parameter _{parameter}_ ({layanan}) {turun/naik/tetap} dari {baseline} menjadi {eval} per 100 sesi sampel (target ≤ {target}), dengan sebaran {spreadBaseline}% → {spreadEval}% (target ≤ {targetSpread}%). Target {tercapai | tercapai sebagian | tidak tercapai}. Peserta yang diaudit ({n} dari {N}) berubah {deltaPeserta} per 100 sesi, sedangkan kelompok pembanding ({m} agent) berubah {deltaPembanding}."

- Kohort pembanding kecil → kalimat terakhir diganti "Kelompok pembanding terlalu kecil untuk dibandingkan."
- `insufficientData` → "Catatan: data periode evaluasi belum cukup untuk kesimpulan kuat."
- Status `evaluasi` diberi awalan `Pratinjau:` (pola Fase 1). Selalu ada kalimat penutup "Perbandingan ini indikatif, bukan bukti sebab-akibat."

### D14. Antarmuka

- `/tna`: bagian baru **"Perlu dievaluasi"** di atas "Kebutuhan & rencana terbaru" (badge "Jatuh tempo {tanggal}" / "Sedang dievaluasi"); empty state bila tidak ada.
- `/tna/rencana/$id`:
  - `aktif` sebelum jatuh tempo: info "Evaluasi dijadwalkan {tanggal}"; sesudah: tombol **Mulai evaluasi** → dialog pilih periode (default K9).
  - `evaluasi`: pemilih periode, kartu Baseline beku / Evaluasi / Target dengan status per target, kartu kohort peserta vs pembanding, tabel peserta (sort; peserta tidak diaudit diberi label), banner drift, form **Selesaikan** (kesimpulan + tindak lanjut) dengan konfirmasi; tombol **Batalkan** dengan alasan.
  - `selesai`: semua di atas dalam mode baca, chip verdict, Ringkasan Evaluasi; bila `perlu_rencana_lanjutan` → tombol **Validasi ulang parameter** ke `/tna/parameter?...&period={periode evaluasi}&previous_plan={id}`.
  - 409 → "Rencana sudah berubah, muat ulang" (pola Fase 1).
- Mobile satu kolom, tanpa overflow horizontal; tabel peserta jadi daftar kartu di mobile. Komponen shadcn + `QaStatePanel`; status/verdict memakai map label typed (pola T6).
- Copy menegaskan: angka per 100 sesi sampel; pembanding indikatif.

## 3. Task

| Task | Isi                                                                                                                                                                                                                                                                                                                                                                                                   | Bukti selesai                                                                                            |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| T0   | **Discovery read-only.** Verifikasi fakta §Requirement di kode live; pastikan isolasi webServer browser E2E aman dipakai; petakan perubahan pada fungsi aktivasi/cancel dan trigger Fase 1; pastikan `metrics.ts` dapat mengembalikan sesi & temuan per agent tanpa mengubah rumus; daftar consumer `TnaPlanDetail`/`TnaPlanStatus`. Tidak ada akses produksi.                                        | `plans/markdown/tna-phase-2-t0-report.md`; keputusan K9–K16 tercatat; STOP bila ada temuan S10–S12.      |
| T1   | **Migrasi + rollback + fungsi/trigger** (D11) memakai skill `supabase-migration`. RED-first: perluas `tna-access-api.spec.ts` (fungsi baru ditolak `TNA_FORBIDDEN` untuk anon/trainer/leader/agent JWT, DB tetap sehat, service-role mencapai validasi bisnis) dan spec baru `tna-evaluation-db-api.spec.ts` (immutability setelah selesai, constraint status, transisi ilegal). Replay bersih lokal. | Spec RED → GREEN; `supabase db reset` lokal bersih; rollback diuji di lokal; tanpa `signal 11`.          |
| T2   | **Mesin evaluasi** (D10): `cohorts.ts`, `evaluation.ts`, verdict, drift; `baseline_sessions` saat aktivasi; perluasan `GET /tna/plans/:id` (pratinjau) dan opsi periode. RED-first spec `tna-evaluation-metrics-api.spec.ts` dengan fixture: pembanding cukup/kecil, peserta tidak diaudit, periode evaluasi `no_audit`, drift baseline, phantom batch (guardrail SIDAK #3).                          | Spec GREEN; angka kohort cocok dengan perhitungan manual fixture yang dicatat di laporan.                |
| T3   | **Transisi** (D12): start-evaluation, ganti periode, complete, cancel beralasan, `previous_plan_id` pada `POST /needs`, filter `due=1`, `logActivity`. RED-first spec `tna-evaluation-flow-api.spec.ts`: due/not-due (jam WIB), periode invalid, stale 409, double-complete, body berisi angka ditolak, leader/agent 403.                                                                             | Spec GREEN; seluruh spec TNA API Fase 1 tetap hijau.                                                     |
| T4   | **Narasi evaluasi** (D13) + label status/verdict/tindak lanjut di `utils.ts`. RED-first assertion narasi di spec T2/T3 (tercapai, sebagian, tidak tercapai, pembanding kecil, insufficient, pratinjau).                                                                                                                                                                                               | Spec GREEN.                                                                                              |
| T5   | **UI** (D14). `ui-ux-pro-max` sebelum, `impeccable` audit/polish sesudah. Perluas `tnaHarness.ts`; spec browser hermetic baru `tna-evaluation-flow.spec.ts`: daftar "Perlu dievaluasi" → mulai evaluasi → ganti periode → selesaikan → hasil beku → validasi ulang; state memuat/kosong/gagal; 409; desktop + mobile tanpa overflow; leader diarahkan `/unauthorized`.                                | Spec GREEN memakai config browser yang sudah terisolasi; screenshot desktop/mobile di `plans/markdown/`. |
| T6   | **Review & dokumentasi**: `thermo-nuclear`, perbaikan, sinkronisasi `docs/{modules,database,auth-rbac,README}.md`, full gate serial (API config + spec browser TNA + root typecheck/lint/build + `git diff --check`), `graphify update .`.                                                                                                                                                            | `plans/markdown/tna-phase-2-t6-report.md` dengan perintah & exit code persis.                            |

Setiap task menulis laporan `plans/markdown/tna-phase-2-tN-report.md` (perintah, exit code, log, keputusan) dan memperbarui baris Status rencana ini. Satu runner test pada satu waktu.

### T3 — perluasan writer K15 (disetujui Fajar 2026-10-12)

Live `tna_create_need(uuid,jsonb)` Fase 1 mengabaikan `previous_plan_id`; T1 hanya menyediakan kolom. Fajar menyetujui migrasi dan rollback **baru** yang minimal: `CREATE OR REPLACE` dengan signature/guard service-role tetap, validasi K15 di dalam fungsi, tanpa mengubah migrasi T1. Link hanya ke rencana `selesai` dengan `follow_up = perlu_rencana_lanjutan`, layanan dan indikator sama. Alur validasi ulang memakai periode evaluasi rencana sebelumnya sesuai K15; tidak menambah pembatasan periode baru pada RPC. UUID link malformed/nonexistent dan hubungan invalid ditolak atomik dengan `TNA_PREVIOUS_PLAN_INVALID` (422). Tidak mengubah unique index, RLS, grants EXECUTE, ataupun data existing.

RED pertama melalui Playwright real-backend membuktikan link tersimpan dan validasi RPC langsung (bukan hanya HTTP). Sesudah GREEN: replay bersih lokal, rollback mengembalikan body Fase 1 tanpa menghapus data/kolom, lalu forward lagi dan regresi TNA API. Rollback writer tidak menghilangkan link existing, tetapi writer lama kembali mengabaikan link; hentikan pemakaian fitur link saat rollback. Deploy/push/remote tidak diotorisasi. Scope T3: `routes/tna.ts`, `services/tna/{write-service,read-service,errors}.ts`, `packages/types/src/tna.ts`, spec flow dan adaptasi assertion kontrak Fase 1, satu pasangan migrasi/rollback dan indeks rollback, laporan/status. T4–T6 tetap terpisah; review independen sebelum PR dijadwalkan di T6.

## 4. Strategi E2E

- **Real backend loopback** (`helpers/sidakRealBackend.ts`, `playwright.api.config.ts`, workers 1, retries 0) untuk semua kontrak API/DB/guard. Fixture namespace acak, dibersihkan; fetch guard menolak egress non-loopback.
- **Hermetic browser** (`helpers/hermeticShell.ts` + `tnaHarness.ts`) untuk UI, hanya setelah T0 memastikan config browser tidak menyalakan dev server terhadap Supabase hosted.
- Waktu "jatuh tempo" diuji dengan tanggal fixture relatif terhadap hari ini (WIB), bukan dengan memalsukan jam sistem.
- Tidak ada unit test baru tanpa izin Fajar. Tidak ada pemanggilan AI.

## 5. Rilis

- Migrasi produksi **hanya** dengan otorisasi eksplisit Fajar. Riwayat migrasi remote tidak sinkron dengan repo, jadi pola Fase 1 berlaku: terapkan satu file + `migration repair`, **bukan** `db push`; catat di `docs/database.md`.
- Urutan aman: migrasi dulu (kolom nullable, fungsi baru tidak dipakai backend lama), lalu deploy API + web. Rollback: deploy sebelumnya + `rollback_<timestamp>_tna_phase2_evaluation.sql` (hanya bila belum ada rencana `selesai`).
- Sebelum migrasi produksi, cek read-only jumlah rencana `aktif` (kandidat evaluasi pertama) — dengan izin Fajar.

## 6. STOP conditions (berhenti dan tanya Fajar)

- **S1–S9 Fase 1** tetap berlaku.
- **S10:** Kohort tidak bisa dihitung dengan memakai ulang `metrics.ts`/bucket SIDAK tanpa mengubah rumus tingkat/sesi Fase 1.
- **S11:** Perubahan fungsi aktivasi/cancel Fase 1 tidak bisa kompatibel dengan rencana `aktif`/`dibatalkan` yang sudah ada di produksi.
- **S12:** Isolasi webServer browser belum menjamin E2E tidak menyentuh Supabase hosted.
- **S13:** Kebutuhan mengubah `uq_tna_plans_open_need` atau CHECK status (bertentangan dengan K15 usulan).
- **S14:** Muncul kebutuhan AI, notifikasi, akses leader, atau penugasan simulasi — itu fase lain.

## 7. Peta fase berikutnya (belum direncanakan rinci)

| Fase | Fokus                                                                                                                          | Prasyarat / catatan                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 3    | **Penugasan simulasi** KETIK/PDKT/Telefun dari `suggested_modules` program ke peserta, plus progres latihan di detail rencana  | Kontrak penugasan per modul; data latihan sebagai sinyal pendukung evaluasi, bukan pengganti SIDAK |
| 4    | **Akses leader** (D8 Fase 1): scope TNA di `resolveDataScope()`, RLS per scope, siapa boleh aktivasi/evaluasi                  | Keputusan kebocoran metrik populasi lintas tim                                                     |
| 5    | **Katalog program via UI** + **indikator unmapped** (K8; butuh perbaikan jalur tulis SIDAK)                                    | Rencana SIDAK terpisah untuk identitas kanonik indikator                                           |
| 6    | **Dashboard efektivitas** lintas rencana (tingkat keberhasilan per program/gap type), ekspor Ringkasan, notifikasi jatuh tempo | Butuh cukup rencana `selesai` agar bermakna                                                        |

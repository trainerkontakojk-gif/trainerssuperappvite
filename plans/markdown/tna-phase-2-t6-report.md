# TNA Fase 2 — T6: Review & dokumentasi

## Status

**T6 selesai lokal — menunggu keputusan Fajar untuk commit, PR, dan migrasi produksi.** Lane D (migrasi, guard DB, kontrak API). Branch `feat/tna-phase-2`, HEAD awal `0fa1342` (checkpoint T5). Mulai 2026-10-14T00:10:17Z. Tidak ada commit, push, PR, deploy, akses produksi, atau migrasi remote pada T6.

- Verdict thermo-nuclear: **PASS** untuk cakupan rilis Fase 2. Tidak ada P0/P1. P2-1 diperbaiki atas keputusan Fajar; P2-2 diterima sebagai tindak lanjut.
- Perbaikan T6: P2-1 (skema baca kebutuhan toleran kolom tambahan) dan dua P3 (format tanggal kalender di UI, screenshot spec yang menimpa bukti T5).
- Docs kanonik Fase 2 disinkronkan dengan kode live.
- Gate penuh lulus serial: API real-backend 55/55, browser hermetic 23/23, typecheck/lint/build exit 0.

## Independensi review

T6 dikerjakan langsung oleh sesi orkestrator Claude Code atas permintaan Fajar ("kerjakan sendiri jangan subagent"). Sesi ini tidak menulis kode T1–T5. Namun independensinya **parsial**: sebelum T6, sesi ini sudah membaca self-review di laporan T3/T5 dan menulis empat catatan untuk diff T5. Review T6 tetap dimulai dari `git diff main...HEAD` (46 file) dan membaca SQL, service, route, tipe, UI, serta spec langsung, bukan dari klaim laporan.

## Scope review

- SQL: `20261011130000_tna_phase2_evaluation.sql`, `20261012150000_tna_need_previous_plan.sql`, kedua rollback, perubahan seed UUID periode.
- API: `routes/tna.ts`, `services/tna/{write-service,read-service,evaluation,cohorts,narrative,errors,baseline,analysis}.ts`.
- Kontrak: `packages/types/src/tna.ts` (dibandingkan dengan `main` untuk kompatibilitas urutan rilis).
- UI: `routes/tna/{Evaluation,plan,index,parameter,utils}.tsx`, `router.tsx`.
- Spec: lima spec API/DB evaluasi + `tna-evaluation-flow.spec.ts` + harness.
- Privilege lokal diperiksa read-only lewat `psql` ke `127.0.0.1:54322` (bukan produksi).

Yang dikonfirmasi benar:

- Guard-first tetap pada empat fungsi public baru/overload; tidak ada `REVOKE EXECUTE` pada schema yang diekspos.
- Trigger menolak transisi ilegal dan perubahan hasil setelah `selesai`, juga untuk UPDATE privileged langsung (marker transaction-local).
- DB menghitung ulang verdict dari populasi vs target dan menolak snapshot yang tidak konsisten (K14); `no_audit` → `TNA_EVALUATION_NO_AUDIT`.
- Body mutasi strict; klien tidak bisa mengirim angka, snapshot, atau verdict.
- K12: kalimat utama narasi dan verdict memakai baseline beku/populasi; K13 ambang 5 dari `thresholds.ts`; K15 divalidasi atomik di `tna_create_need`.
- Narasi `selesai` dibaca dari snapshot tersimpan; narasi Fase 1 tidak berubah.
- Error DB tak dikenal tetap dilempar (503), tidak menjadi sukses palsu; setiap transisi sukses memanggil `logActivity`.
- Schema baca di `main` (API lama) tidak strict, sehingga urutan "migrasi dulu, deploy kemudian" aman untuk pembacaan.
- Tidak ada AI, dependency baru, unit test baru, atau perubahan rumus `metrics.ts`/SIDAK.

## Temuan

| ID   | Severity   | Lokasi                                                                                         | Skenario gagal                                                                                                                                                                                                                                                                                                             | Keputusan                                                                                                                                                                                                                                                                                                                                                |
| ---- | ---------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2-1 | P2         | `packages/types/src/tna.ts:193–205`, `:388`; pembacaan `read-service.ts` memakai `select("*")` | `createTnaNeedSchema` sekarang `.strict()` dan `tnaNeedSchema` meng-`extend` darinya, sehingga skema **baca** kebutuhan ikut strict (diverifikasi: zod 4 `extend` mempertahankan strict). Migrasi masa depan yang menambah kolom ke `tna_needs` akan membuat semua GET kebutuhan/rencana 503 selama jeda migrasi → deploy. | **Diperbaiki atas keputusan Fajar (2026-10-14).** `tnaNeedSchema` dibangun dari `z.object({ ...createTnaNeedSchema.shape, ... })`: baca menerima kolom tambahan, input tetap strict (dicek dengan `node`/zod 4). Tanpa E2E baru karena butuh kolom sementara di DB; Fajar menyetujui perbaikan langsung. Regresi API 55/55, typecheck/lint/build exit 0. |
| P2-2 | P2         | `apps/api/src/services/tna/evaluation.ts:144–173`                                              | `getTnaEvaluationPeriodOptions` mengambil seluruh baris QA untuk **setiap** periode setelah bulan pelatihan, berurutan, pada setiap GET detail rencana `aktif`/`evaluasi`. Biaya tumbuh linear dengan jumlah bulan sejak pelatihan.                                                                                        | Diterima untuk rilis ini (bukan masalah kebenaran; data lokal kecil). Kandidat tindak lanjut: kueri ringan audit-presence per periode yang tetap memakai aturan `isAgentExcluded`. Membatasi opsi hanya untuk rencana jatuh tempo akan mengubah kontrak D12.                                                                                             |
| P3-1 | P3         | `apps/web/src/routes/tna/index.tsx:224`, `Evaluation.tsx:111`                                  | "Jatuh tempo 2026-11-11 (WIB)" dan "Evaluasi dijadwalkan 2026-11-11" tampil sebagai ISO mentah.                                                                                                                                                                                                                            | **Diperbaiki.** Helper `calendarDate` di `utils.ts` (UTC-safe, `id-ID`). RED 2 failed (assertion teks) → GREEN 2/2.                                                                                                                                                                                                                                      |
| P3-2 | P3         | `apps/web/e2e/tna-evaluation-flow.spec.ts:88–96`, `:168–170`                                   | Setiap run spec menimpa enam PNG bukti T5 yang ter-commit di `plans/markdown/` (terlihat saat gate: `tna-phase-2-t5-mobile-selesai.png` berubah).                                                                                                                                                                          | **Diperbaiki.** Screenshot ke `testInfo.outputPath(...)`, pola yang sama dengan `tna-flow.spec.ts`. PNG T5 dipulihkan dari HEAD. Spec ulang 14/14 tanpa perubahan file tracked.                                                                                                                                                                          |
| P3-3 | P3         | `Evaluation.tsx:184–200`                                                                       | Status per target ("Tercapai/Belum tercapai") dihitung di klien dari angka server, menduplikasi perbandingan K14.                                                                                                                                                                                                          | Diterima. Perbandingan memakai nilai mentah yang sama dengan server; verdict otoritatif tetap dari server dan dicek DB. Memindahkan ke server berarti perubahan kontrak snapshot.                                                                                                                                                                        |
| P3-4 | P3         | `Evaluation.tsx:241`, `:253`                                                                   | Delta dan efek bersih tampil sebagai angka bertanda, sedangkan narasi memakai kata turun/naik/tetap.                                                                                                                                                                                                                       | Diterima. Kartu metrik numerik; narasi adalah ringkasan kata-kata.                                                                                                                                                                                                                                                                                       |
| P3-5 | P3         | `Evaluation.tsx` (~540 baris)                                                                  | Satu komponen memuat seluruh surface evaluasi.                                                                                                                                                                                                                                                                             | Diterima; jauh di bawah batas ~1.000 baris, kohesif, editor draft terpisah.                                                                                                                                                                                                                                                                              |
| P3-6 | P3         | Migrasi `20261011130000:248–339`, `:343`                                                       | Helper baru `valid_eval_period` dan `validate_evaluation_snapshot` memakai EXECUTE default, sehingga `service_role` (yang kini punya USAGE `tna_internal`) bisa memanggilnya langsung — berbeda dari helper Fase 1 yang dicabut. Anon/authenticated tidak bisa (tanpa USAGE).                                              | Didokumentasikan di `docs/database.md`. Disengaja agar UPDATE privileged melewati trigger yang sama; mengubahnya butuh migrasi baru (STOP).                                                                                                                                                                                                              |
| P3-7 | P3         | Rollback `20261011130000:10–13`                                                                | Rollback fondasi fail-closed bila ada `baseline_sessions`, yang terisi pada **setiap** aktivasi sesudah deploy. Jadi rollback DB praktis mustahil setelah aktivasi pertama — lebih ketat dari §5 rencana ("hanya bila belum ada rencana `selesai`").                                                                       | Didokumentasikan apa adanya di `docs/database.md` (rollback aplikasi saja atau perbaikan maju setelah ada aktivasi). Fail-closed adalah perilaku aman.                                                                                                                                                                                                   |
| P3-8 | P3         | Fungsi `tna_cancel_plan` 3 argumen                                                             | Selama jeda migrasi → deploy, API lama memanggil cancel 3 argumen; rencana `aktif` kini ditolak `TNA_CANCEL_REASON_REQUIRED`, yang tidak dikenal API lama → 503.                                                                                                                                                           | Didokumentasikan di langkah rilis: deploy segera sesudah migrasi.                                                                                                                                                                                                                                                                                        |
| P3-9 | P3         | `baseline.ts` (cabang `peserta_id === null`)                                                   | Peserta tanpa profil saat aktivasi dibekukan dengan `baseline_sessions = 0`, bukan `NULL`.                                                                                                                                                                                                                                 | Diterima; roster draft divalidasi sehingga kasus ini praktis tidak terjadi.                                                                                                                                                                                                                                                                              |
| Q-1  | Pertanyaan | `20261012150000` (K15)                                                                         | Beberapa kebutuhan baru boleh menautkan rencana `selesai` yang sama sebagai `previous_plan_id`.                                                                                                                                                                                                                            | Dikonfirmasi Fajar 2026-10-14: **boleh**. Tidak ada perubahan.                                                                                                                                                                                                                                                                                           |

## Files T6

| File                                       | Perubahan                                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `packages/types/src/tna.ts`                | `tnaNeedSchema` toleran kolom tambahan (P2-1)                                                  |
| `apps/web/src/routes/tna/utils.ts`         | Helper `calendarDate` (P3-1)                                                                   |
| `apps/web/src/routes/tna/index.tsx`        | "Jatuh tempo" memakai `calendarDate`                                                           |
| `apps/web/src/routes/tna/Evaluation.tsx`   | "Evaluasi dijadwalkan" memakai `calendarDate`                                                  |
| `apps/web/e2e/tna-evaluation-flow.spec.ts` | Assertion tanggal terformat; screenshot ke `testInfo.outputPath` (P3-2)                        |
| `docs/database.md`                         | Bagian **TNA — Evaluasi pasca-training (Fase 2)**: kolom, transisi, RPC, guard, rilis/rollback |
| `docs/modules.md`                          | Bagian 9: alur evaluasi, jatuh tempo, kohort, verdict, tindak lanjut, endpoint, narasi         |
| `docs/auth-rbac.md`                        | Bagian **TNA — evaluasi (Fase 2)**: tanpa kapabilitas baru, jalur tulis, alasan pembatalan     |
| `docs/README.md`                           | Indeks TNA Fase 2                                                                              |
| `plans/markdown/tna-phase-2.md`            | Baris Status                                                                                   |
| `plans/markdown/tna-phase-2-t6-report.md`  | Laporan ini                                                                                    |

Tidak ada perubahan SQL atau API pada T6. Satu perubahan tipe: `packages/types/src/tna.ts` (`tnaNeedSchema`, P2-1). `docs/e2e-testing.md` tidak mendaftar spec per modul, jadi tidak diubah.

## RED → GREEN

1. Assertion tanggal ditulis lebih dulu di dua tes browser. RED: 2 failed, keduanya karena teks `Jatuh tempo 11 November 2026 (WIB)` / `Evaluasi dijadwalkan 11 November 2026 (WIB).` tidak ditemukan.
2. Helper `calendarDate` + dua pemakaian. GREEN: 2/2.
3. P3-2 adalah perubahan test-only (lokasi screenshot); dibuktikan dengan spec evaluasi 14/14 dan `git status` tanpa perubahan PNG.

## Perintah, exit code, dan log

Log di scratchpad sesi (`t6-evidence/`), bukan file yang di-commit.

| #   | Perintah                                                                                                                                                                | Exit / hasil                                                                                                                                  | Log                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 1   | `pnpm --dir apps/web exec playwright test --config=playwright.config.ts tna-evaluation-flow.spec.ts --grep 'evaluasi 1440:\|belum jatuh tempo' --workers=1 --retries=0` | 1, RED 2 failed (assertion tanggal)                                                                                                           | `red-date.log`           |
| 2   | Perintah fokus yang sama                                                                                                                                                | 0, 2 passed                                                                                                                                   | `green-date.log`         |
| 3   | `pnpm exec prettier --check` (file TS/TSX/docs yang disentuh, kecuali `auth-rbac.md` legacy)                                                                            | 0                                                                                                                                             | —                        |
| 4   | `node scripts/check-migration-rollbacks.mjs`                                                                                                                            | 0, "Rollback check passed (2 new migration(s))"                                                                                               | `rollback-check.log`     |
| 5   | Replay DB                                                                                                                                                               | **Tidak diulang**: SQL tidak berubah sejak T3 (`737434d`); riwayat lokal memuat `20261011130000` dan `20261012150000`                         | —                        |
| 6   | `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --project=tna-real-backend --workers=1 --retries=0`                                         | **0, 55 passed**                                                                                                                              | `api-gate.log`           |
| 7   | `pnpm --dir apps/web exec playwright test --config=playwright.config.ts tna-flow.spec.ts tna-evaluation-flow.spec.ts --workers=1 --retries=0`                           | **0, 23 passed**                                                                                                                              | `browser-gate.log`       |
| 8   | `pnpm typecheck --concurrency=1`                                                                                                                                        | **0**, 4/4                                                                                                                                    | `typecheck.log`          |
| 9   | `pnpm lint --concurrency=1`                                                                                                                                             | **0**, 0 error; 8 API + 90 web warning existing, tidak ada di file TNA                                                                        | `lint.log`               |
| 10  | `pnpm build --concurrency=1`                                                                                                                                            | **0**, 3/3                                                                                                                                    | `build.log`              |
| 11  | `docker logs --since 2026-10-14T00:10:17Z supabase_db_trainerssuperappvite \| grep -ciE "signal 11\|segmentation fault"`                                                | 0 kemunculan                                                                                                                                  | —                        |
| 12  | `git diff --check`                                                                                                                                                      | 0                                                                                                                                             | —                        |
| 13  | Spec evaluasi ulang setelah P3-2 (`tna-evaluation-flow.spec.ts`)                                                                                                        | **0, 14 passed**; tidak ada PNG tracked berubah                                                                                               | `browser-eval-final.log` |
| 14  | `pnpm --filter @trainers/web exec tsc --noEmit` dan `eslint` pada empat file yang disentuh setelah P3-2                                                                 | 0 / 0                                                                                                                                         | `web-tsc-final.log`      |
| 15  | `GRAPHIFY_MAX_WORKERS=1 graphify update .`                                                                                                                              | **0**, sekitar 1 menit 46 detik (00:24:28–00:26:14 UTC); graf dibangun ulang 15.513 node, 28.343 edge; HTML viz dilewati karena terlalu besar | `graphify.log`           |

Setelah P2-1: `pnpm typecheck --concurrency=1` exit 0 (`typecheck-p21.log`), API `tna-real-backend` **55/55** exit 0 (`api-gate-p21.log`), `pnpm lint --concurrency=1` exit 0 dengan warning existing yang sama (`lint-p21.log`), `pnpm build --concurrency=1` exit 0 (`build-p21.log`). Graphify (#15) dijalankan sebelum P2-1; perubahan itu satu ekspresi skema di file yang sudah ada.

Gate browser (#7) berjalan sebelum P3-2; spec yang sama dijalankan ulang setelahnya (#13). Tidak menjalankan unit suite, suite lintas modul, atau target non-loopback.

## Kesehatan dan cleanup lokal

- Docker/Supabase lokal sehat; tidak ada `signal 11` sejak awal T6.
- Satu runner pada satu waktu; tidak ada dev server/runner tersisa setelah gate.
- `.claude/launch.json`, `.impeccable/`, `mockups/`, `plans/markdown/shell-beranda-redesign.md`, `supabase/.branches/` tidak disentuh dan tidak di-stage.
- `graphify-out/` gitignored dan tidak masuk diff. Graphify lulus dengan `GRAPHIFY_MAX_WORKERS=1` (T5 gagal karena timeout 180 detik dengan 4 worker).

## Risiko rilis tersisa

- **Migrasi produksi sudah dijalankan 2026-10-14** (pasca-T6, atas izin Fajar): kedua file + `migration repair`, verifikasi read-only lulus; catatan lengkap di `docs/database.md` § Apply produksi 2026-10-14. Deploy API + web lewat merge PR #65 masih menunggu.
- **Riwayat migrasi remote tidak sinkron** dengan repo; wajib pola satu file + `migration repair`, bukan `db push`.
- **T3 pernah membaca `qa_periods` produksi secara read-only (GET PostgREST, 2026-10-12)** atas izin Fajar, untuk memvalidasi UUID periode. Tidak ada tulis ke produksi.
- Jeda migrasi → deploy: pembatalan rencana `aktif` dari API lama gagal (P3-8).
- Rollback DB praktis hanya sebelum aktivasi pertama sesudah deploy (P3-7).
- P2-2 (biaya opsi periode) tetap sebagai tindak lanjut pasca-rilis.

## Draft PR (belum dibuat)

**Judul:** `feat(tna): phase 2 post-training evaluation`

```markdown
## Ringkasan

TNA Fase 2: evaluasi pasca-training untuk rencana aktif.

- **T1** — Migrasi `20261011130000_tna_phase2_evaluation`: kolom evaluasi, transisi aktif → evaluasi → selesai/dibatalkan, RPC start/ganti periode/complete/cancel beralasan, guard trigger, validasi snapshot + verdict di DB.
- **T2** — Mesin evaluasi: populasi periode evaluasi, kohort peserta vs pembanding (K13, ambang 5), drift baseline, sesi baseline per peserta saat aktivasi, opsi periode (K9).
- **T3** — Endpoint transisi, filter `due=1` (WIB), pembatalan beralasan, `previous_plan_id` (migrasi `20261012150000_tna_need_previous_plan`), peta error 409/422/503, `logActivity`.
- **T4** — Narasi evaluasi deterministik (`evaluation_narrative`) dan label status/verdict/tindak lanjut.
- **T5** — UI: "Perlu dievaluasi", mulai/ganti periode/selesaikan/batalkan, hasil beku, validasi ulang parameter.
- **T6** — Review thermo-nuclear, perbaikan P3, docs kanonik.

## Migrasi dan rollback

| Migrasi                                     | Rollback                                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------------------- |
| `20261011130000_tna_phase2_evaluation.sql`  | `rollback_20261011130000_tna_phase2_evaluation.sql` (fail-closed bila ada data Fase 2) |
| `20261012150000_tna_need_previous_plan.sql` | `rollback_20261012150000_tna_need_previous_plan.sql` (jalankan lebih dulu)             |

## Bukti

- API real-backend `tna-real-backend`: 55/55
- Browser hermetic `tna-flow` + `tna-evaluation-flow`: 23/23
- `pnpm typecheck` / `pnpm lint` / `pnpm build` (serial): exit 0
- `node scripts/check-migration-rollbacks.mjs`: exit 0
- Replay + rollback lokal: laporan T1/T3

## Langkah rilis

1. Cek read-only jumlah rencana `aktif` di produksi.
2. Terapkan `20261011130000` lalu `20261012150000` satu per satu + `supabase migration repair --status applied`. Bukan `db push`.
3. Deploy API + web segera.

Rollback: aplikasi dulu, lalu `rollback_20261012150000` → `rollback_20261011130000`; hanya mungkin sebelum ada aktivasi/pembatalan beralasan sesudah deploy.

## Risiko

Lihat `plans/markdown/tna-phase-2-t6-report.md` § Risiko rilis tersisa.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

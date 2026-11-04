# TNA Fase 3 — Laporan T1 (migrasi, rollback, trigger)

- **Tanggal:** 2026-11-04. Baseline `972f3de4` (`main`).
- **Rencana:** [`tna-phase-3.md`](tna-phase-3.md) rev. 3 (D15, P-1, P-2). Lane **D**.
- **Target:** hanya Supabase lokal loopback (`supabase start` dengan `storage-api, imgproxy, logflare, vector, realtime, studio, postgres-meta, edge-runtime, mailpit` dikecualikan karena container analytics/vector/realtime tidak sehat di mesin ini). Tidak ada akses produksi, push migrasi, atau deploy.

## File

| File                                                                 | Isi                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `supabase/migrations/20261104120000_tna_phase3_practice.sql`         | Tabel `tna_plan_practice_targets` (PK `plan_id, module`; modul `ketik/pdkt/telefun`; `min_sessions` 1–20; RLS SELECT admin/trainer; klien tanpa DML), kolom `tna_plan_participants.practice_snapshot`, trigger `guard_practice_target`, helper `replace_practice_targets` dan `valid_practice_snapshot`, body baru `tna_create_plan`, `tna_update_draft_plan`, `tna_complete_plan`, `guard_participant`. Signature semua fungsi publik tetap. Tidak ada `REVOKE EXECUTE` (K6). |
| `supabase/rollbacks/rollback_20261104120000_tna_phase3_practice.sql` | Menolak (`TNA_PHASE3_ROLLBACK_DATA_PRESENT`) bila ada target atau snapshot; mengembalikan body Fase 1/2 yang **disalin otomatis** dari migrasi `20261008120000` dan `20261011130000` (bukan diketik ulang); drop tabel, kolom, helper.                                                                                                                                                                                                                                         |
| `supabase/rollbacks/README.md`                                       | Baris rollback baru.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `apps/web/e2e/tna-practice-db-api.spec.ts`                           | Spec real backend baru (6 test), otomatis masuk project `tna-real-backend` (`tna-*-api.spec.ts`).                                                                                                                                                                                                                                                                                                                                                                              |

## Kontrak yang dibuktikan spec

1. Tabel dan kolom terpasang, RLS aktif, signature Fase 1/2 tidak berubah.
2. `practice_targets` di `tna_create_plan`: modul tak dikenal, duplikat, 0, 21, bukan array, key tambahan → `TNA_INVALID_PRACTICE_TARGETS`. Di `tna_update_draft_plan`: key tidak ada = target tetap; array = ganti penuh dan `updated_at` naik; array invalid = tidak ada yang berubah; `[]` = kosong.
3. JWT admin/trainer/leader/agent: baca sesuai RLS (leader/agent nol baris), INSERT/UPDATE/DELETE langsung → `42501`, RPC → `TNA_FORBIDDEN`; checkpointer tidak restart (tanpa crash K6), `SELECT 1` sehat.
4. Setelah aktivasi, service role pun tidak bisa INSERT/UPDATE/DELETE target (`TNA_PRACTICE_TARGETS_IMMUTABLE`); writer draft menolak (`TNA_PLAN_NOT_DRAFT`).
5. Penyelesaian dengan target: tanpa `practice`, modul kurang/lebih, status tidak cocok jumlah sesi, skor tanpa sesi, skor Telefun > 10, sesi negatif, key tambahan → `TNA_PRACTICE_SNAPSHOT_INVALID`. Tulis langsung di luar marker → `TNA_PARTICIPANTS_IMMUTABLE`. Payload valid tersimpan persis dan beku setelah `selesai`.
6. Rencana tanpa target: payload Fase 2 (4 key) tetap diterima, `practice` ditolak, snapshot tetap `NULL`.

## Bukti eksekusi (berurutan, satu runner)

| Langkah                                  | Perintah                                                                                                                       | Hasil                                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Replay sebelum migrasi                   | `supabase db reset --local`                                                                                                    | exit 0                                                                                                                       |
| RED                                      | `pnpm exec playwright test tna-practice-db-api.spec.ts -c playwright.api.config.ts --project=tna-real-backend` (di `apps/web`) | exit 1: `tna_plan_practice_targets missing`; 1 failed, 5 did not run (serial)                                                |
| Replay dengan migrasi (percobaan 1)      | `supabase db reset --local`                                                                                                    | **gagal**: `syntax error at end of input`. Penyebab: `CASE … THEN` di dalam kondisi `IF` PL/pgSQL. Diperbaiki dengan kurung. |
| Replay dengan migrasi (percobaan 2)      | `supabase db reset --local`                                                                                                    | exit 0, migrasi `20261104120000` diterapkan                                                                                  |
| GREEN                                    | spec yang sama                                                                                                                 | exit 0, **6 passed**                                                                                                         |
| Rollback menolak data                    | sisipkan satu rencana + target lewat `psql`, jalankan file rollback                                                            | `ERROR: TNA_PHASE3_ROLLBACK_DATA_PRESENT`, tabel dan baris tetap ada                                                         |
| Rollback bersih                          | hapus data probe, jalankan file rollback                                                                                       | exit 0; tabel hilang, kolom hilang                                                                                           |
| Setelah rollback → RED                   | spec yang sama                                                                                                                 | exit 1: `tna_plan_practice_targets missing`                                                                                  |
| Setelah rollback, perilaku Fase 1/2 utuh | `tna-evaluation-db-api.spec.ts tna-plan-api.spec.ts`                                                                           | exit 0, **18 passed**                                                                                                        |
| Replay bersih lagi                       | `supabase db reset --local`                                                                                                    | exit 0                                                                                                                       |
| Regresi seluruh spec API TNA             | `pnpm exec playwright test -c playwright.api.config.ts --project=tna-real-backend`                                             | exit 0, **93 passed** (termasuk 6 baru), 2,6 menit                                                                           |
| Typecheck spec                           | `pnpm exec tsc --noEmit -p tsconfig.e2e.json` (di `apps/web`)                                                                  | exit 0                                                                                                                       |
| Lint spec                                | `pnpm exec eslint e2e/tna-practice-db-api.spec.ts`                                                                             | exit 0                                                                                                                       |

Catatan: satu dry-run `psql` terhadap DB lokal sempat ter-commit karena file migrasi punya `BEGIN/COMMIT` sendiri; DB lokal langsung di-reset bersih sesudahnya, jadi semua bukti di atas berasal dari replay bersih.

## Tidak dijalankan

Root `pnpm typecheck`/`lint`/`build`, spec browser, dan Graphify: tidak ada perubahan kode aplikasi di T1 (hanya SQL dan satu spec); gate penuh dijalankan di T5. Tidak ada unit test.

## Rilis

Belum diterapkan ke produksi. Saat rilis: satu file + `migration repair` dengan izin Fajar, sebelum deploy API T2/T3. Selama jeda migrasi → deploy, backend lama tetap aman: ia tidak mengirim `practice_targets` maupun `practice`, dan rencana tanpa target memakai payload Fase 2 apa adanya.

## Berikutnya

T2: mesin progres (`services/tna/practice.ts`, D16) dan perluasan `GET /tna/plans/:id`.

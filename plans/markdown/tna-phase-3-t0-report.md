# TNA Fase 3 — Laporan T0 (discovery read-only)

- **Tanggal:** 2026-11-04. Baseline `01926c09` (`main`).
- **Rencana:** [`tna-phase-3.md`](tna-phase-3.md) rev. 2 (K17–K24 disetujui).
- **Batas:** hanya membaca kode, migrasi, dan spec di repo. Tidak ada edit kode, migrasi, test, atau akses produksi. Supabase lokal **tidak berjalan** (container `supabase_db_trainerssuperappvite` berstatus exited) dan tidak dinyalakan. Seed lokal (`supabase/seeds/001–007`) tidak berisi riwayat simulasi, jadi hitungan lokal sesi `self` dengan akun terhubung pasti 0 dan tidak bermakna. Angka produksi butuh izin Fajar (lihat Q-3).

## Ringkasan

Fakta rencana terbukti di kode. Tidak ada STOP S15–S18. Ada empat penyesuaian desain yang harus masuk rev. 3 sebelum T1 (§4), dan tiga pertanyaan terbuka untuk Fajar (§5). Yang terpenting: **agent tidak bisa memulai Telefun sendiri** (batas harian default 0), jadi target Telefun hanya bisa dipenuhi lewat sesi yang dijalankan trainer atas nama peserta.

## 1. Sumber simulasi (verifikasi K19, D16)

Semua dari `apps/api/src/services/sidak/agent-simulations.ts` (`SOURCE_CONFIG`, `getScore`, `getReviewStatus`) dan migrasi tabel riwayat.

| Modul   | Tabel             | Kolom waktu (`timestamptz`)        | "Selesai dinilai"                                                                                                           | Skor & skala              |
| ------- | ----------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| KETIK   | `ketik_history`   | `date` (default `now()`)           | `review_status = 'completed'` (diset worker review bersama `final_score`)                                                   | `final_score` 0–100       |
| PDKT    | `pdkt_history`    | `timestamp`, fallback `created_at` | `evaluation_status = 'completed'`                                                                                           | `evaluation->score` 0–100 |
| Telefun | `telefun_history` | `created_at`                       | `scoring_status = 'completed'`; bila `scoring_status` NULL (baris lama) → `status = 'completed'` **dan** `score` tidak NULL | `score` 0–10              |

- `normalizeReviewStatus` (`monitoring-history-service.ts:202`) hanya mengenal `pending/processing/completed/failed`; nilai lain → `not_started`. Mesin progres boleh memakai ulang `getReviewStatus`, lalu menghitung hanya `completed`.
- Telefun punya `scoring_failed_permanently` (migrasi `20261104090000`) dan pensiun administratif (`20261027073000`). Keduanya bukan `completed`, jadi otomatis tidak dihitung. Sesuai K19.
- Monitoring juga membaca tabel lama `results` (`module = 'telefun'`) sebagai kompatibilitas. Baris itu tidak punya atribusi subjek, jadi **tidak dihitung** (konsisten dengan K19 "NULL legacy tidak dihitung").
- `SOURCE_CONFIG`, `getScore`, `getReviewStatus`, dan `occurredAt` adalah fungsi/konstanta privat modul. Ekstraksi ke `apps/api/src/services/simulations/source-config.ts` (atau ekspor dari file yang sama) adalah **pure lift** tanpa perubahan perilaku. `select` per modul untuk TNA cukup `id, user_id, <waktu>, <skor>, <status>, simulation_subject_type, simulation_subject_peserta_id`, tanpa `messages`/konsumen (K21).
- Query detail agen SIDAK saat ini hanya cabang `participant`. Cabang `self` (K19b) baru: `simulation_subject_type = 'self' AND user_id = profiler_peserta.akun_id`. Nilai `akun_id` dibaca bersama roster (admin client, kolom tunggal).

### Penghapusan riwayat

KETIK (`services/ketik/settings-history.ts:295–315`) dan PDKT (`routes/pdkt/history.ts:240,259`) melakukan **hard delete**, dan kapabilitas `*.history.delete` dimiliki semua peran termasuk agent. Akibatnya progres live bisa **turun** bila pemilik menghapus sesi. Ini diterima oleh K20 (progres live, beku saat `selesai`), tetapi UI wajib menyebutnya (§4 P-4).

## 2. Batas latihan harian (temuan baru)

`plans/markdown/kontrol-user-fase-2.md` + migrasi `20261018150000_practice_quota.sql`: memulai latihan dibatasi per hari di server. Default **agent/leader: KETIK 3, PDKT 3, Telefun 0** (403 `PRACTICE_NOT_ALLOWED`). Admin/trainer tak terbatas; override per user ada di `practice_limit_overrides`.

Dampak:

- Target Telefun **tidak bisa dipenuhi agent sendiri** kecuali ada override. Satu-satunya jalur default adalah sesi yang dijalankan trainer dengan peserta sebagai subjek (cabang K19a).
- Target KETIK/PDKT > 3 tetap bisa dipenuhi selama beberapa hari; jendela K18 biasanya cukup.
- Lihat Q-1.

## 3. Fungsi RPC dan trigger (verifikasi D15, S15)

| Objek                               | Temuan                                                                                                                                                                                                    | Konsekuensi untuk T1                                                                                                                                               |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tna_create_plan(uuid,jsonb,jsonb)` | Membaca field `p_plan` satu per satu; key tak dikenal diabaikan.                                                                                                                                          | `p_plan->'practice_targets'` bisa ditambahkan dengan `CREATE OR REPLACE`, **signature sama**. Insert target dalam transaksi yang sama.                             |
| `tna_update_draft_plan(...)`        | Selalu `UPDATE tna_plans` (field `coalesce`), jadi `updated_at` naik walau hanya target yang berubah.                                                                                                     | Optimistic concurrency tetap jalan. Ganti target penuh (delete + insert) bila key `practice_targets` ada; abaikan bila key tidak ada.                              |
| `tna_activate_plan` (body Fase 2)   | Tidak perlu diubah.                                                                                                                                                                                       | Kunci target ditegakkan trigger tabel target (rencana induk ≠ `draft` → tolak).                                                                                    |
| `tna_complete_plan` (8 argumen)     | Payload peserta divalidasi **ketat**: tiap objek wajib tepat key `audited_in_eval, eval_findings, eval_sessions, participant_id`. `validate_evaluation_snapshot` juga mengunci key `evaluation_snapshot`. | Snapshot progres tidak bisa disisipkan tanpa mengganti body. Usulan P-1: izinkan key opsional kelima `practice` (signature tetap). Payload lama 4 key tetap valid. |
| `tna_internal.guard_participant()`  | Cabang `tna.completing_plan` membandingkan `to_jsonb(NEW) - eval_*` dengan `OLD`; kolom lain yang berubah → `TNA_PARTICIPANTS_IMMUTABLE`.                                                                 | Wajib `CREATE OR REPLACE` agar `practice_snapshot` ikut dikecualikan di cabang completing dan dikunci setelah `selesai`. Body ini juga harus ada di file rollback. |
| Grant                               | Semua fungsi publik `GRANT EXECUTE ... TO anon, authenticated, service_role`, guard di baris pertama.                                                                                                     | Pertahankan pola; tidak ada `REVOKE EXECUTE`.                                                                                                                      |

Kesimpulan S15: **tidak terpicu**. Semua perubahan bisa memakai signature yang ada; yang berubah hanya body (`tna_create_plan`, `tna_update_draft_plan`, `tna_complete_plan`, `guard_participant`).

## 4. Penyesuaian desain untuk rev. 3

- **P-1 (D15):** `tna_complete_plan` menerima key opsional `practice` per peserta (`{ ketik?|pdkt?|telefun?: { sessions int ≥0, avg_score numeric|null, status } }`), divalidasi ketat. Wajib ada untuk setiap modul target bila rencana punya target; dilarang bila tidak ada target. Payload tanpa `practice` tetap diterima untuk rencana tanpa target (kompatibel dengan backend lama selama jeda migrasi → deploy).
- **P-2 (D15):** daftar fungsi yang diganti ditulis eksplisit: `tna_create_plan`, `tna_update_draft_plan`, `tna_complete_plan`, `tna_internal.guard_participant`. Rollback mengembalikan body Fase 2 persis.
- **P-3 (D16):** sumber dan "selesai dinilai" mengikuti tabel §1; tabel `results` lama tidak dibaca. Ekstraksi `SOURCE_CONFIG`/`getScore`/`getReviewStatus` sebagai pure lift dan diverifikasi oleh spec detail agen SIDAK yang ada tetap hijau.
- **P-4 (D19):** UI progres menampilkan "Progres dihitung dari riwayat saat ini; sesi yang dihapus tidak terhitung" dan, untuk target Telefun, catatan dari Q-1.

## 5. Pertanyaan terbuka untuk Fajar

- **Q-1 (Telefun):** Agent default tidak bisa memulai Telefun. Usulan: form rencana tetap boleh memilih Telefun, dengan catatan "Sesi Telefun dijalankan trainer atas nama peserta"; Fase 3 **tidak** mengubah batas harian atau membuat override otomatis. Alternatif: buang Telefun dari pilihan target sampai ada kebijakan override.
- **Q-2 (skor Telefun):** Skala 0–10 vs 0–100. Usulan: tampilkan apa adanya dengan satuan ("7,4 / 10"), tanpa konversi.
- **Q-3 (produksi):** Untuk memperkirakan berapa banyak latihan yang akan terhitung lewat cabang `self`, perlu query read-only produksi: jumlah `profiler_peserta` dengan `akun_id` terisi dan jumlah sesi `self` per modul 90 hari terakhir milik akun tersebut. Tidak wajib untuk T1; hanya jalan bila Fajar mengizinkan.

## 6. Consumer yang terdampak

- Tipe: `packages/types/src/tna.ts` (`createTnaPlanSchema`/`updateTnaDraftPlanSchema` `.strict()` → wajib menambah `practice_targets`; `tnaPlanParticipantSchema` non-strict, kolom baru aman dibaca; `TnaPlanDetail` menambah `practice_targets` dan `practice`).
- API: `routes/tna.ts`, `services/tna/{read-service,write-service,narrative}.ts`, modul baru `services/tna/practice.ts`.
- Web: `routes/tna/{PlanForm,plan,Evaluation}.tsx`, `utils.ts`.
- E2E: `tna-plan-api.spec.ts`, `tna-evaluation-flow-api.spec.ts`, `helpers/tnaHarness.ts`. Pola fixture riwayat dengan admin client ada di `ketik-history-api.spec.ts`, `monitoring-riwayat-api.spec.ts`, `pdkt-replier-attribution-api.spec.ts`; pola tautan `akun_id` di `access-scope-api.spec.ts` dan `user-peserta-link-api.spec.ts`.

## 7. Perintah yang dijalankan

Semua read-only: `sed`/`grep`/`ls` pada `supabase/migrations`, `apps/api/src`, `packages/types/src`, `apps/web/e2e`, `plans/markdown`; `supabase status` (melaporkan container DB exited); `docker ps`. Tidak ada test, build, atau query database.

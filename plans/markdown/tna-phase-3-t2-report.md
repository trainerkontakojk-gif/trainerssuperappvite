# TNA Fase 3 — Laporan T2 (mesin progres latihan)

- **Tanggal:** 2026-11-04. Baseline `176521df` (`main`).
- **Rencana:** [`tna-phase-3.md`](tna-phase-3.md) rev. 3 (D16, D17 bagian baca, K18–K21, K23, P-3, P-4). Lane **D** (pembacaan service-role baru, kontrak API publik).
- **Target:** hanya Supabase lokal loopback. Tidak ada akses produksi atau deploy.

## Perubahan

| File                                                  | Isi                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/services/simulations/sources.ts` (baru) | **Pure lift** dari `services/sidak/agent-simulations.ts`: `RawSimulationRow`, `asObject/asString/asNumber`, `occurredAt`, `getScore`, `getReviewStatus`, plus `SIMULATION_SOURCES` (tabel + kolom waktu) dan `SIMULATION_STATUS_COLUMNS` (kolom minimal untuk status/skor/waktu).                                             |
| `apps/api/src/services/sidak/agent-simulations.ts`    | Memakai helper bersama; `SOURCE_CONFIG` memakai `SIMULATION_SOURCES` dengan `select` yang sama persis. Diff: 13 baris tambah (import dan spread), 89 hapus, tanpa perubahan perilaku. File ini memang belum Prettier-clean sebelum perubahan, jadi tidak diformat ulang.                                                      |
| `apps/api/src/services/tna/practice.ts` (baru)        | `loadTnaPracticeTargets` (JWT/RLS), `computeTnaPlanPractice` (live), `frozenTnaPlanPractice`, `unavailableTnaPlanPractice`, `practiceWindow`, `practiceStatus`. Satu-satunya modul TNA yang membaca riwayat simulasi dengan service role (K21).                                                                               |
| `apps/api/src/services/tna/read-service.ts`           | `GET /tna/plans/:id` menambah `practice_targets` dan `practice`.                                                                                                                                                                                                                                                              |
| `packages/types/src/tna.ts`                           | Skema/tipe `tnaPracticeModuleSchema`, `tnaPracticeTargetSchema`, `tnaPracticeEntrySchema`, `tnaPracticeModulesSchema`, `TnaParticipantPractice`, `TnaPracticeSummary`, `TnaPlanPractice`; `practice_snapshot` di peserta; `TnaPlanDetail.practice_targets?` dan `practice?` (opsional agar harness browser lama tetap valid). |
| `apps/web/e2e/tna-practice-api.spec.ts` (baru)        | 3 test real backend (project `tna-real-backend`).                                                                                                                                                                                                                                                                             |

## Kontrak

- `practice_targets`: daftar target urut modul, selalu ada (kosong bila tidak ada target).
- `practice`:
  - `null` untuk `draft`/`dibatalkan` atau rencana tanpa target.
  - `aktif`/`evaluasi`: `state: "live"`, dihitung dari riwayat saat ini.
  - `selesai`: `state: "frozen"` dari `practice_snapshot`; perubahan riwayat sesudahnya tidak berpengaruh.
  - Kegagalan membaca riwayat: `state: "unavailable"` dengan daftar kosong; bagian lain detail rencana tetap terbaca. Ini satu fallback terbatas untuk kegagalan yang bisa dicoba ulang. Error lain tetap menggagalkan request.
- Per peserta per modul target: `{ sessions, avg_score, status }`. `avg_score` skala asli modul, dibulatkan 1 desimal, `null` bila 0 sesi. `summary` per modul: `{ module, min_sessions, met, total }`.
- Aturan hitung:
  - Jendela K18: `start_date` 00.00 WIB (inklusif) sampai hari sesudah `evaluation_due_date` 00.00 WIB (eksklusif).
  - Cabang K19a: `simulation_subject_type = 'participant'` dengan `peserta_id` roster.
  - Cabang K19b: `'self'` dengan `user_id` = `profiler_peserta.akun_id` roster.
  - Hanya sesi `completed` menurut `getReviewStatus` **dan** punya skor.
  - Baris tanpa subjek (NULL legacy) dan tabel `results` tidak dibaca.
  - Dedupe per `id`.
- K21: respons hanya angka; spec memastikan judul skenario, nama konsumen, `messages`, dan `user_id` tidak muncul.

## Bukti eksekusi (satu runner pada satu waktu)

| Langkah                                    | Perintah                                                                                                                    | Hasil                                                                                                                                                                                                             |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RED                                        | `pnpm exec playwright test tna-practice-api.spec.ts -c playwright.api.config.ts --project=tna-real-backend` (di `apps/web`) | exit 1: `practice_targets` `undefined`; fixture riwayat tersisip tanpa error                                                                                                                                      |
| GREEN                                      | sama                                                                                                                        | exit 0, **3 passed**                                                                                                                                                                                              |
| Typecheck                                  | `tsc --noEmit` untuk web, `tsconfig.e2e.json`, API, `packages/types`                                                        | semua exit 0                                                                                                                                                                                                      |
| Lint                                       | eslint pada 4 file API yang berubah dan spec baru                                                                           | exit 0                                                                                                                                                                                                            |
| Regresi SIDAK simulasi (kode yang di-lift) | `--project=monitoring-numbers-real-backend` (memuat `/sidak/agents/:id/simulations`)                                        | exit 0, **6 passed**                                                                                                                                                                                              |
| Regresi API TNA (percobaan 1)              | `--project=tna-real-backend`                                                                                                | **tidak sah**: stack Supabase lokal mati di tengah run (DB `Exited (137)`, lalu auth/rest/kong). Docker hanya 3,9 GiB dan container `deploy-*` milik Fajar juga berjalan. Gejalanya `Connection refused` dan 401. |
| Restart                                    | `supabase stop`, `supabase start -x …` (layanan minimal), `supabase db reset --local`                                       | exit 0, semua container sehat                                                                                                                                                                                     |
| Regresi API TNA (ulang)                    | `--project=tna-real-backend`                                                                                                | exit 0, **96 passed** (93 sebelumnya + 3 baru), stack tetap sehat sesudahnya                                                                                                                                      |

## Tidak diuji / catatan

- Jalur `state: "unavailable"` tidak dibuktikan E2E. Memaksa kegagalan baca riwayat di backend lokal butuh merusak tabel atau koneksi bersama. Usulan: buktikan di T4 lewat spec browser hermetic (respons `unavailable` → kartu "Coba lagi").
- Sesi `completed` tanpa skor tidak dihitung (rule DB P-1 mewajibkan rata-rata bila sesi > 0).
- Unit test lama untuk `agent-simulations` (`apps/api/src/__tests__/sidak-agent-simulation*.test.ts`) tidak dijalankan sesuai aturan repo. Bukti perilaku lift berasal dari spec real backend `monitoring-numbers` di atas.
- Root `pnpm lint`/`build` dan Graphify dijalankan di T5.

## Berikutnya

T3: kontrak tulis (`practice_targets` di `POST/PATCH /tna/plans`, progres final di `POST /plans/:id/complete`), narasi D18.

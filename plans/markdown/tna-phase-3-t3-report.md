# TNA Fase 3 — Laporan T3 (kontrak tulis dan narasi)

- **Tanggal:** 2026-11-06. Baseline `8e93f188` (`main`).
- **Rencana:** [`tna-phase-3.md`](tna-phase-3.md) rev. 3 (D17 bagian tulis, D18, P-1). Lane **D** (kontrak API publik).
- **Target:** hanya Supabase lokal loopback (layanan minimal). Tidak ada akses produksi atau deploy.

## Perubahan

| File                                         | Isi                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/types/src/tna.ts`                  | Skema latihan dipindah ke atas skema input rencana. `createTnaPlanSchema` dan `updateTnaDraftPlanSchema` menerima `practice_targets` opsional: maksimal 3, modul unik, `min_sessions` bilangan bulat 1–20, tanpa key lain. Body tetap `.strict()`.                                                                           |
| `apps/api/src/services/tna/write-service.ts` | Create/patch meneruskan `practice_targets` di `p_plan` apa adanya; tidak mengirim key berarti target tidak berubah. `completeTnaPlan` menghitung progres di server dan mengirim `practice` per peserta ke `tna_complete_plan`. Bila riwayat gagal dibaca, penyelesaian berhenti (tidak membekukan angka yang tidak lengkap). |
| `apps/api/src/services/tna/errors.ts`        | `TNA_INVALID_PRACTICE_TARGETS` → 422, `TNA_PRACTICE_TARGETS_IMMUTABLE` → 409, `TNA_PRACTICE_SNAPSHOT_INVALID` → 409, semua dengan pesan Indonesia.                                                                                                                                                                           |
| `apps/api/src/routes/tna.ts`                 | `TnaPracticeUnavailableError` → 503 `TNA_PRACTICE_UNAVAILABLE` ("Progres latihan simulasi belum bisa dimuat. Coba lagi sebelum menyelesaikan rencana.").                                                                                                                                                                     |
| `apps/api/src/services/tna/narrative.ts`     | D18: kalimat "{x} dari {N} peserta memenuhi target latihan simulasi ({KETIK 2 sesi, Telefun 1 sesi})." sebelum penutup. Peserta dihitung memenuhi hanya bila **semua** modul target terpenuhi. Bila progres `unavailable`: "Progres latihan simulasi belum dapat dimuat." Tidak ada kalimat bila tidak ada target.           |
| `apps/api/src/services/tna/read-service.ts`  | Progres dihitung sebelum narasi evaluasi lalu diteruskan ke narasi.                                                                                                                                                                                                                                                          |
| `apps/web/e2e/tna-practice-api.spec.ts`      | 3 test T3 baru. Test T2 "frozen" kini menghapus sesi tambahannya sendiri supaya fixture bersama tidak berubah.                                                                                                                                                                                                               |

## Kontrak yang dibuktikan spec

1. `POST /plans`: modul tak dikenal, duplikat, 0, 21, pecahan, atau key tambahan → 400. Target valid tersimpan dan terbaca urut modul.
2. `PATCH /plans/:id`: `practice_targets` mengganti penuh; tidak mengirim key berarti target tetap. Setelah aktivasi → 409 `TNA_PLAN_NOT_DRAFT`.
3. `POST /plans/:id/complete`: body dengan `practice` → 400 (klien tidak pernah mengirim angka). Penyelesaian sah membekukan progres yang dihitung server, tersimpan untuk kedua peserta, dan terbaca sebagai `frozen`.
4. Narasi pratinjau dan narasi beku memuat "1 dari 2 peserta memenuhi target latihan simulasi (KETIK 2 sesi, Telefun 1 sesi)." tepat sebelum "Perbandingan ini indikatif".
5. Rencana tanpa target: narasi tanpa kalimat latihan, penyelesaian Fase 2 tetap jalan, `practice` `null`.

## Bukti eksekusi (satu runner pada satu waktu)

| Langkah         | Perintah                                                                                                                                                  | Hasil                                                                                                                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack lokal     | `supabase stop`, `supabase start -x storage-api,imgproxy,logflare,vector,realtime,studio,postgres-meta,edge-runtime,mailpit`, `supabase db reset --local` | exit 0                                                                                                                                                                                            |
| RED             | `pnpm exec playwright test tna-practice-api.spec.ts -c playwright.api.config.ts --project=tna-real-backend` (di `apps/web`)                               | exit 1: test T3 pertama mendapat 400 `VALIDATION_ERROR` untuk `practice_targets` (skema ketat); 3 test T2 lulus                                                                                   |
| GREEN           | sama                                                                                                                                                      | exit 0, **6 passed**                                                                                                                                                                              |
| Typecheck       | `tsc --noEmit` web, API, `packages/types`                                                                                                                 | exit 0                                                                                                                                                                                            |
| Typecheck E2E   | `pnpm exec tsc --noEmit -p tsconfig.e2e.json`                                                                                                             | exit 1, **sudah ada sebelumnya**: 2 error di `sidak-agent-detail-service-default.spec.ts` (commit SIDAK `aa281c32`). Jumlah error sama ketika perubahan T3 di-stash. Tidak ada error di file TNA. |
| Lint            | eslint pada 5 file API yang berubah dan spec                                                                                                              | exit 0                                                                                                                                                                                            |
| Regresi API TNA | `--project=tna-real-backend`                                                                                                                              | exit 0, **99 passed** (96 + 3 baru); stack tetap sehat                                                                                                                                            |

## Tidak diuji / catatan

- Jalur 503 `TNA_PRACTICE_UNAVAILABLE` saat penyelesaian tidak dibuktikan E2E (alasan sama dengan T2). Jalur ini dipetakan eksplisit dan tidak membekukan data.
- Kode `TNA_PRACTICE_SNAPSHOT_INVALID` hanya muncul bila payload server tidak cocok dengan target (mis. target berubah di antara hitung dan RPC, yang mustahil setelah aktivasi). Pemetaan 409 adalah pengaman.
- Root `pnpm lint`/`build`, Graphify, dan review `thermo-nuclear` di T5.

## Berikutnya

T4: UI (D19) dengan `ui-ux-pro-max` sebelum dan `impeccable` sesudah, spec browser hermetic, termasuk tampilan `unavailable`.

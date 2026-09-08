# Phase 215 — Telefun in-process scoring worker

**Tanggal:** 2026-09-04  
**Scope:** `apps/api` scoring queue/runtime, additive Supabase fencing migration, dan dokumentasi deployment.  
**Status:** Implementasi lokal selesai; migration/deployment production belum dijalankan.

## Tujuan

Mengurangi biaya service Railway terpisah dengan menjalankan polling Telefun scoring
sebagai embedded worker di proses API, tanpa menghapus queue durable, retry/backoff,
assessment, usage log, recording, atau history.

## Perubahan

- `apps/api/src/api-runtime.ts` menjadi owner HTTP server + embedded worker.
- `apps/api/src/index.ts` memakai runtime tersebut; `SIGTERM`/`SIGINT` shutdown
  worker lebih dulu lalu HTTP.
- `processNextBatch()` tetap pure dan poll interval deployment tetap 30 detik,
  batch default 5.
- `analyzeVoiceQuality()` tidak lagi menulis `score`, `voice_assessment`, atau
  `scoring_status` langsung. Hasil dan kegagalan dipersist melalui scoring service
  dan RPC claim-fenced.
- Lease claim bersama ditetapkan 300 detik, di atas timeout provider Gemini sekitar
  180 detik.
- Setiap claim membuat UUID dan hanya menyimpan SHA-256 hash + owner. Completion,
  failure, dan reschedule dibatasi pada token claim yang masih aktif.
- Migration `20260904150000_telefun_scoring_claim_fencing.sql` additive: menambah
  metadata claim, overload RPC tokenized, dan compatibility signature legacy dengan
  lease 300 detik. Rollback tersedia tetapi tidak boleh dijalankan saat claim
  tokenized masih aktif.
- Batas fencing terhadap billing: fencing mencegah **duplikasi persistensi** hasil
  claim lama, tetapi TIDAK mencegah tagihan provider yang sudah berjalan (Gemini
  mem-billing panggilan yang sudah dimulai). Karena itu lease 300 detik wajib
  di semua jalur claim sebelum worker lama dilepas — lease harus lebih besar dari
  timeout provider (~180 detik).
- Contract tests perilaku fencing (di `telefun-scoring-claim-fencing.test.ts`):
  claim menolak token/owner kosong, stale-reclaim hanya setelah lease lewat, dan
  write tokenized hanya mutasi bila token row masih cocok (legacy butuh token NULL).
- Shutdown release worker meneruskan token claim aktif (`releaseClaim(..., token)`)
  sehingga reschedule ter-fencing; terverifikasi di
  `telefun-scoring-worker-runtime.test.ts`.
- Railway `@trainers/scoring-worker` belum dimatikan; statusnya fallback rollout
  sampai embedded worker dibuktikan di production.

## Verifikasi lokal

Focused Vitest yang sudah lulus:

- `telefun-analysis-hold.test.ts` — 9 tests
- `telefun-scoring-concurrent-retry.test.ts` — 4 tests
- `telefun-recording-state.test.ts` — 6 tests
- `telefun-scoring-claim-fencing.test.ts` + `telefun-scoring-migration-contracts.test.ts` — 42 tests

TypeScript via binary langsung:

- `/usr/local/bin/node apps/api/node_modules/typescript/bin/tsc --noEmit --pretty false` — PASS

Catatan: pemanggilan `pnpm --filter @trainers/api exec tsc --noEmit` pada sesi
ini tidak selesai dalam batas waktu tool, sementara binary TypeScript yang sama
secara langsung selesai dengan exit 0. Full `pnpm lint`, `pnpm build`, dan
`pnpm test:core` masih menjadi release gate berikutnya.

## Rollout checklist

1. Apply migration ke project Supabase production yang benar dan verifikasi
   signature/kolom melalui readback.
2. Deploy API dengan:
   `TELEFUN_SCORING_WORKER_ENABLED=true`, `INTERVAL_MS=30000`, `BATCH_SIZE=5`,
   `CLAIM_TIMEOUT_SECONDS=300`.
3. Buktikan queue drain, retry, satu claim per sesi, dan tidak ada stale
   completion/completion ganda melalui log + DB.
4. Scale-to-zero service Railway lama; jangan drop compatibility signatures
   sebelum service lama benar-benar disabled/deleted.
5. Rollback hanya dengan kill switch API (`...ENABLED=false`) dan prosedur
   migration terkontrol setelah active token claims settled.

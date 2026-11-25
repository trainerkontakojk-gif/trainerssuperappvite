# Telefun — pensiunkan Gemini 3.0 Flash Live + rapikan ketidakcocokan transkripsi

Status: dikerjakan 2026-11-25. Lane **C** (registry model bersama di `packages/types`, dipakai API, server Telefun, dan web; tanpa skema, auth/RLS, atau migrasi).

## Requirement

Fajar (2026-11-25):

1. `gemini-3.0-flash-live-preview` sudah tidak aktif di Google. Bukti lokal 2026-11-25: Gemini Live menolak setup model ini dengan `1008 not found` (lihat `telefun-live-transcript-fidelity.md`). Model ini tidak boleh lagi bisa dipilih di Telefun.
2. Ketidakcocokan kode/dokumentasi yang dilaporkan setelah commit `950c31dd` diperbaiki:
   - setup Gemini di web (`buildTelefunLiveSetupMessage`) masih mengirim `inputAudioTranscription: {}`/`outputAudioTranscription: {}`, padahal server mengirim petunjuk bahasa;
   - unit test lama `GeminiLiveAdapter.test.ts` dan `telefun-live-protocol.test.ts` masih mengharapkan `{}`;
   - nama test `transcript.test.ts` "flushes on speaker switch" tidak sesuai perilaku (lane dua pembicara di-commit bersama saat flush, bukan saat pembicara berganti).

Kriteria penerimaan (E2E):

- Pengaturan Telefun hanya menawarkan Gemini 3.8 Live dan Gemini 3.1 Flash Live. Pengguna yang menyimpan 3.0 dikembalikan ke 3.8 dengan pesan "model lama" (`legacy-model`), bukan "model tidak dikenali".
- `GET /monitoring/pricing` menampilkan baris harga 3.0 sebagai riwayat realtime Gemini yang tidak bisa diubah (`historical: true`, `editable: false`, nama dan provider tetap terbaca). `PUT` harganya ditolak `UNKNOWN_MODEL`. `GET /models?module=telefun` tidak memuat 3.0.

Di luar cakupan: menghapus baris `ai_pricing_settings` atau riwayat pemakaian 3.0, mengubah sesi lama, mengubah prompt konsumen.

## Design

- `packages/types/src/ai-models.ts`: entri 3.0 pindah dari `TELEFUN_LIVE_MODELS` ke `TELEFUN_RETIRED_GEMINI_LIVE_MODELS` (metadata baca-saja, tidak pernah bisa dipilih). `getRetiredTelefunModel(id)` mencari di registry OpenAI historis lalu Gemini pensiun, untuk konsumen yang hanya butuh nama/provider/mode harga. `normalizeTelefunLiveModelSelection` memberi `legacy-model` untuk model Gemini pensiun.
- API: daftar harga (`ai-pricing-service.ts`) dan `resolveModalityPricing` memakai `getRetiredTelefunModel`. Web monitoring memakai daftar pensiun untuk nama model.
- Konfigurasi transkripsi pindah ke `packages/types` (`TELEFUN_TRANSCRIPTION_CONFIG`), dipakai server Telefun dan setup web, supaya satu sumber.
- Unit test lama yang menyebut 3.0 atau `{}` diperbarui nilainya agar tidak menjadi contoh usang; tidak dijalankan (kebijakan AGENTS.md, perlu persetujuan Fajar).

## Tasklist

- [x] RED: test baru di `telefun-flow-landing.spec.ts` (pengaturan) dan `monitoring-models-api-policy.spec.ts` (harga pensiun); jalankan dan pastikan gagal.
- [x] GREEN: registry pensiun, lookup, normalisasi, konsumen API/web.
- [x] Fixture, unit test lama, dan dokumentasi yang menyebut 3.0 sebagai pilihan aktif (commit 1).
- [ ] Konfigurasi transkripsi bersama, unit test `{}` usang, nama test `transcript.test.ts` (commit 2).
- [ ] `thermo-nuclear`, gate (E2E terfokus, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `git diff --check`), CHANGELOG, commit + push.

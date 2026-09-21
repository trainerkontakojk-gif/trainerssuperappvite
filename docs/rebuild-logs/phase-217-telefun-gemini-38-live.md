# Phase 217 — Telefun Gemini 3.8 Live Default

Tanggal: 2026-09-21
Scope: menambahkan `gemini-3.8-live` sebagai pilihan dan default Telefun tanpa menghapus model Gemini Live sebelumnya.

## Perubahan

- Registry aktif Telefun sekarang berisi `gemini-3.8-live`, `gemini-3.1-flash-live-preview`, dan `gemini-3.0-flash-live-preview`.
- `gemini-3.8-live` menjadi default untuk settings kosong/baru dan fallback model unknown.
- Persisted selection 3.1/3.0 yang eksplisit tetap dipertahankan.
- API model list, browser settings, LiveSession, WebSocket proxy, tests, dan dokumentasi disinkronkan.
- Migration baru: `supabase/migrations/20260921143009_add_gemini_38_live_telefun_pricing.sql`.

## Database apply

- Canonical production target diverifikasi sebagai Supabase project
  `ruosnjmtywcrghjgqugz` (Singapore), bukan linked legacy project
  `kkeiiwyyefaofljippnj` (Tokyo).
- `supabase migration list --linked` menunjukkan remote-only history
  `20260908093728` dan tiga migration lokal yang pernah diaplikasikan via REST
  tetapi belum tercatat di migration history. Karena itu `supabase db push`
  berhenti fail-closed; migration repair tidak dijalankan.
- SQL migration diterapkan secara setara melalui PostgREST service-role ke
  project canonical. Row `gemini-3.8-live` berhasil dibuat dengan:
  - input audio: `$3.00 / 1M`
  - output audio: `$12.00 / 1M`
  - input text: `$0.75 / 1M`
  - output text: `$4.50 / 1M`
- Read-back HTTP 200 memverifikasi row `gemini-3.8-live` dan mempertahankan row
  `gemini-3.1-flash-live-preview` serta `gemini-3.0-flash-live-preview`.
- Migration file tetap idempotent (`ON CONFLICT DO NOTHING`). Migration history
  remote tidak direpair atau dipalsukan.

## Verifikasi

- API focused tests: 43 passed.
- Telefun focused tests: 79 passed.
- Web focused tests: 76 passed.
- API, Telefun, dan Web typecheck: PASS.
- API, Telefun, dan Web production build: PASS.
- ESLint file tersentuh: PASS.
- `git diff --check`: PASS.

## Deployment

Code dan migration belum dipush/deploy pada saat log ini dibuat. Push dilakukan
setelah dokumentasi dan database read-back selesai diverifikasi.

# Phase 220 — Telefun MUTE/HOLD Recording Capture Gate

Tanggal: 2026-09-22
Scope: mencegah suara agent masuk ke hasil replay ketika MUTE atau HOLD aktif, tanpa menghentikan recorder atau merusak timeline rekaman.

## Perubahan

- `LiveSession` memakai satu capture gate untuk seluruh microphone audio track:
  `track.enabled = !isMuted && !isHeld`.
- Gate diterapkan setelah `getUserMedia()` memperoleh stream dan setiap kali
  `setMute()` atau `setHold()` mengubah state.
- `MediaRecorder` tetap berjalan selama MUTE/HOLD. Interval tersebut dipertahankan
  dalam `full_call.webm` dan `agent_only.webm` sebagai silence, bukan dengan
  pause/restart recorder atau menghapus bagian timeline.
- Gate capture tetap terpisah dari gate pengiriman audio ke Gemini dan dari
  pembersihan playback AI saat HOLD.
- Regression coverage mencakup kedua state secara terpisah, state overlap,
  urutan `MUTE → HOLD → unhold` dan `HOLD → MUTE → unhold`, repeated toggle,
  close ketika muted/held, serta race sebelum stream tersedia.
- Perubahan dibatasi pada alur recording Telefun. Tidak ada perubahan SIDAK,
  API, schema, migration, provider call, deployment, atau OpenAI WebRTC.

## Verifikasi

- Focused Telefun suite: **6 files / 59 tests PASS**.
- Web typecheck: **PASS**.
- `pnpm lint`: **PASS**, 0 error; warning hanya warning existing.
- `pnpm test:core`: **PASS** — API 25 files/282 tests, Telefun 11 files/158
  tests, Web 16 files/211 tests.
- `pnpm build`: **PASS**.
- `git diff --check`: **PASS**.
- GPT-5.6-Sol xhigh audit-and-repair: **PASS**, tidak menemukan gap in-scope
  tambahan dan tidak mengubah file.
- `pnpm test:affected`: **97/98 PASS**. Satu failure historis pada
  `src/__tests__/telefun-live-session-auth.test.ts` mengharapkan
  `gemini-3.1-flash-live-preview`, sedangkan source aktif memakai
  `gemini-3.8-live`; failure ini unrelated dan tidak diubah.

## Batas Bukti

Browser encoded-WebM proof masih **OPEN**. Automated tests memverifikasi state
`MediaStreamTrack.enabled` dan komposisi state, tetapi repo belum memiliki
harness provider-free yang menjalankan graph recording `LiveSession` sebenarnya
serta membaca waveform/bytes hasil encode Chromium `MediaRecorder`. Tidak ada
klaim bahwa raw WebM atau replay production telah diverifikasi dalam phase ini.

## Status

Implementasi dan dokumentasi tercatat dalam commit ini. Tidak ada provider call,
paid smoke, deployment, push, atau migration pada phase ini.

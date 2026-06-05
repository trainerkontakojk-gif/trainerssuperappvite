# Phase 123: Telefun Live Reconnect, AudioWorklet & Enhanced Timing

## Summary

Meningkatkan stabilitas sesi live Telefun dengan reconnect lifecycle, AudioWorklet untuk pemrosesan mikrofon modern, enhanced timing cues, dan keepalive ping.

## Perubahan Utama

### 1. Server Reconnect Lifecycle (`apps/telefun/src/server.ts`)
- **goAway Detection**: Proxy server mendeteksi `goAway.timeLeft` dari Gemini untuk mengetahui waktu tersisa sebelum koneksi ditutup.
- **Session Resumption**: Menangkap `sessionResumptionUpdate.newHandle` untuk reconnect proaktif dengan session handle.
- **Cached Setup**: Setup message di-cache dan di-resend saat reconnect, menyertakan session handle jika ada.
- **Stale Socket Guard**: `isCurrentGeminiSocket()` mencegah event dari socket lama diproses setelah reconnect.
- **Reconnect Backoff**: Exponential backoff dengan `MAX_RECONNECT_ATTEMPTS`, hanya flush audio setelah `setupComplete`.
- **Client Status**: Client menerima `session_reconnecting` (menampilkan "Menyambung ulang...") dan `session_resumed` (menampilkan "Tersambung").

### 2. Keepalive Ping (`apps/telefun/src/server.ts`)
- Server mengirim ping berkala setiap 30 detik ke client WebSocket dan Gemini WebSocket untuk mengurangi idle disconnect.

### 3. AudioWorklet (`apps/web/public/audio-input-processor.js`, `geminiService.ts`)
- **AudioWorklet**: Browser modern menggunakan `AudioWorkletNode` dengan processor `telefun-audio-input-processor` untuk pemrosesan mikrofon. Ukuran frame 4096 sample, mengirim Float32Array via message port.
- **Fallback**: Jika AudioWorklet tidak tersedia atau gagal load, fallback ke `ScriptProcessorNode`. Timeline event `audio_worklet_fallback` dicatat.
- **Extracted Helper**: `processInputAudioFrame()` di `liveProtocol.ts` menangani volume RMS, silence detection, dan PCM16 conversion secara terpusat.
- **Cleanup**: workletNode di-disconnect dan port.onMessage di-null kan saat cleanup.

### 4. Enhanced Time Cues (`timingGuards.ts`, `PhoneInterface.tsx`, `promptBuilder.ts`)
- **4-Phase Cues**: Dari 2 fase (30s, 20s) menjadi 4 fase bertahap (2 menit, 1 menit, 30s, 20s).
- **Sent Cues Set**: Mengganti 2 boolean ref dengan `Set<TelefunTimeCue>` untuk menghindari missed cues.
- **Threshold Logic**: Threshold adjusted:
  - `2min`: totalSeconds >= 300 && remaining <= 120
  - `1min`: totalSeconds >= 180 && remaining <= 60
  - `30s`: totalSeconds >= 51 && remaining <= 30
  - `20s`: totalSeconds >= 21 && remaining <= 20
- **App Timer Authority**: `getTimeCueInstruction()` di promptBuilder menghasilkan instruksi spesifik per fase. AI TIDAK diminta mengestimasi waktu sendiri. ATURAN BICARA point 7: "JANGAN menutup telepon berdasarkan perkiraan waktu sendiri."

### 5. Prompt Builder Enhancements (`promptBuilder.ts`)
- **Removed Time Limit Instruction**: `timeLimitInstruction` dihapus dari system instruction karena app timer adalah satu-satunya otoritas timeout.
- **Enhanced Silent Handling**: Silent instruction diperpanjang untuk realistic mode (30-45 detik jeda).
- **Enhanced Time Cue Instructions**: Perintah penutup bertahap (2 menit → arah penutup, 1 menit → persiapan penutup, 30s → mulai tutup, 20s → HARUS tutup).

### 6. Stalled Response Watchdog (`geminiService.ts`)
- Threshold dinaikkan: `STALLED_RESPONSE_START_MS` 12000→20000, `STALLED_RESPONSE_MID_MS` 15000→25000 untuk mengurangi false positive.

### 7. LiveProtocol (`liveProtocol.ts`)
- Setup message sekarang menyertakan `sessionResumption: {}` dan `contextWindowCompression: { slidingWindow: {} }` untuk sesi panjang (>5 menit).
- `processInputAudioFrame()` helper menangani volume, silence, dan PCM16 conversion secara terpusat.

### 8. Timeline Events (`types.ts`)
- Added: `audio_worklet_enabled`, `audio_worklet_fallback`, `session_reconnecting`, `session_resumed`.

### 9. Docs Updated (`docs/modules.md`)
- Menambahkan dokumentasi untuk Gemini Live Session Management, Server Reconnect Lifecycle, Keepalive, AudioWorklet, dan App Timer Authority.

## File Berubah

| File | Perubahan |
|------|-----------|
| `apps/telefun/src/server.ts` | Reconnect lifecycle, keepalive ping, cached setup, stale socket guard |
| `apps/telefun/src/server-protocol.ts` | `getGeminiGoAwayTimeLeftSeconds()`, `getSessionResumptionHandle()`, `isCurrentGeminiSocket()` |
| `apps/telefun/src/server-protocol.test.ts` | 3 new test cases (goAway, sessionResumption, stale socket) |
| `apps/web/public/audio-input-processor.js` | NEW: AudioWorklet processor (41 lines) |
| `apps/web/src/routes/telefun/services/geminiService.ts` | AudioWorklet integration, setupInputProcessing async, extracted handleInputAudioFrame, stalled watchdog threshold increased, session_reconnecting/resumed handling |
| `apps/web/src/routes/telefun/services/liveProtocol.ts` | contextWindowCompression, sessionResumption, processInputAudioFrame helper |
| `apps/web/src/routes/telefun/services/promptBuilder.ts` | Removed timeLimitInstruction, enhanced silent/timecue instructions, 4-phase time cues |
| `apps/web/src/routes/telefun/services/timingGuards.ts` | TelefunTimeCue type, 4-phase threshold, sentCues Set |
| `apps/web/src/routes/telefun/services/guards.ts` | Removed getTelefunTimeCueThreshold (moved to timingGuards) |
| `apps/web/src/routes/telefun/types.ts` | 4 new timeline event types |
| `apps/web/src/routes/telefun/components/PhoneInterface.tsx` | sentTimeCues Set, multi-phase cue handling |
| `apps/web/src/__tests__/telefun-live-protocol.test.ts` | Tests for processInputAudioFrame |
| `apps/web/src/__tests__/telefun-prompt-builder.test.ts` | Updated assertions for new prompt format |
| `apps/web/src/__tests__/telefun-timing-guards.test.ts` | Tests for 4-phase time cue thresholds |
| `apps/web/src/__tests__/telefun-audio-worklet.test.ts` | NEW: AudioWorklet processor tests |
| `docs/modules.md` | Updated Telefun module documentation |

## Hasil Pengujian

Pre-push checklist:
- **Lint**: `pnpm lint` — 0 error
- **Build**: `pnpm build` — 0 error
- **Test**: `pnpm test` — full suite passed

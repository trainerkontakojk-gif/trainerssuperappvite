# Phase 116: Telefun Disable Silence and Dead-Air Detectors

**Ringkasan:** Mematikan `SilenceDetector` server-side Telefun dan client `Dead Air Detector`, lalu memperpanjang silent instruction realistic menjadi 3x lebih sabar.

## Perubahan

- `apps/telefun/src/server.ts` — tidak lagi import, instantiate, start, ping, stop, atau register callback `SilenceDetector`.
- `apps/telefun/src/silence.ts` — hapus class `SilenceDetector` (tidak dipakai lagi), `UtteranceBuffer` tetap.
- Server tidak lagi mengirim `{ type: "silence" }` ke browser.
- `apps/web/src/routes/telefun/services/geminiService.ts` — hapus state/constants dead-air (`deadAirSilenceMs`, `DEAD_AIR_THRESHOLD_MS`, `DEAD_AIR_COOLDOWN_MS`, `deadAirLastPromptMs`), hapus block dead-air detection dari audio frame loop, hapus method `sendDeadAirPrompt()`, stalled watchdog tidak lagi call `sendDeadAirPrompt()` (hanya reset timer).
- Time-cue telemetry dipisahkan dari dead-air: event `dead_air_prompt_sent` tidak lagi dipakai untuk prompt waktu, diganti menjadi `time_cue_prompt_sent`.
- `apps/web/src/routes/telefun/services/promptBuilder.ts` — ubah silent instruction dari `<10` / `10-15` detik menjadi `<30` / `30-45` detik.
- Silent behavior tinggal dikelola oleh prompt Telefun dan Gemini Live VAD.
- Client handler `msg.type === "silence"` tetap dipertahankan untuk backward compatibility dengan server lama (tidak memicu prompt baru).

## File Baru

- `apps/telefun/src/server-silence-detector.test.ts` — static guard bahwa server tidak instantiate/mengirim silence event.
- `apps/web/src/__tests__/telefun-dead-air-disabled.test.ts` — static guard bahwa client tidak memiliki constants/method dead-air.

## Verifikasi

- `pnpm --filter @trainers/telefun test src/server-silence-detector.test.ts src/server-protocol.test.ts`
- `pnpm --filter @trainers/telefun build`
- `pnpm --filter @trainers/web test src/__tests__/telefun-dead-air-disabled.test.ts src/__tests__/telefun-prompt-builder.test.ts`
- `pnpm --filter @trainers/web build`

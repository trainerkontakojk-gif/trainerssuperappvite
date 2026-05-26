# Phase 47a — Telefun Call UI Parity, Replay Seek/Retry, dan Prompt Perilaku Legacy (Final Audit)

## Summary

Menutup gap parity antara Vite rebuild dengan reference Next.js pada modul Telefun, mencakup tiga area utama: system instruction prompt builder, call UI phone interface, dan replay annotation generation.

## Changed Files

| File | Diff |
|---|---|
| `apps/web/src/routes/telefun/services/promptBuilder.ts` | +189 |
| `apps/web/src/routes/telefun/services/geminiService.ts` | +173 |
| `apps/web/src/routes/telefun/components/PhoneInterface.tsx` | +821 |
| `apps/web/src/routes/telefun/components/ReplayAnnotator.tsx` | +107 |
| `apps/api/src/routes/telefun.ts` | +237 |
| `apps/web/src/__tests__/telefun-prompt-builder.test.ts` | +231 |
| `apps/web/src/routes/telefun/index.tsx` | +6 |
| `apps/web/src/routes/telefun/types.ts` | +1 |

**Total**: 8 files, +1426/-339 lines

## What Was Done

### 1. Prompt Perilaku Legacy (`promptBuilder.ts`)
- Emotion instruction branching per consumer name keywords (marah/ngeyel/emosi → nada tinggi cepat, gaptek/bingung → bicara lambat, sedih/pasrah → bicara pelan)
- KONSISTENSI SUARA 5-point section (gender lock, no lawan jenis, pitch/tone konsisten, no mimicking, fallback)
- ATURAN ROLEPLAY 3 rules (separate from ATURAN BICARA)
- ATURAN BICARA expanded ke 6 rules (no berhenti mendadak, abaikan noise, sela kondisional, short response guard, acknowledgment continuation)
- Pacing instruction 6 sub-rules (realistic) vs 2 (training_fast)
- Time limit dengan concrete closing phrases (`"Ya sudah terima kasih, saya tutup"`, `"Pulsa saya habis"`)
- Script dual format support (DIALOG + POIN ALUR)
- New helpers: `getConsumerTypeHint()`, `getTimeCueInstruction()`

### 2. GeminiService Hardening (`geminiService.ts`)
- `sendDeadAirPrompt()` — Persona-aware dead air recovery
- `sendInterruptionPrompt()` — Persona-aware long-speech interruption
- `sendTimeCue()` — Persona-aware + urgency-level (≤20s PRIORITAS TINGGI)
- Dead air detection: 7s silence threshold, 12s cooldown
- Long-speech interruption: 60s threshold, 60s cooldown
- Setup timeout guard: 15s `CONNECT_SETUP_TIMEOUT_MS`
- Stalled response watchdog: 1s polling, 12s response start / 15s mid-response timeout

### 3. Call UI Parity (`PhoneInterface.tsx`)
- Ringtone sequence: 440Hz+480Hz dual oscillator, ~2.5s ring-pause cycle
- Hold music: E major arpeggio (329.63, 440, 554.37, 659.25 Hz) + LFO pulse 0.5 Hz
- Hold timer: 60s first hold, 180s subsequent, warnings at ≤10s (animate-bounce) dan ≤0s (red badge)
- Volume indicator: 5-category color (Senyap/Tenang-Netral/Tegas-Peringatan/Tinggi-Urgensi) + tick markers at 33%/66%
- Avatar upgrade: h-48 w-48 md:h-72 md:w-72, initials text-5xl/7xl, UserRound icon background, inner ring decoration, bottom shape, hold overlay with Pause+countdown, AI speaking ping ring, dual ping rings for ringing state
- Status card: per-state dynamic bg/text/border (blue/ringing, green/speaking, dark-green/waiting, yellow/hold, red/error)
- Control bar: circular buttons with labels below, desktop vertical layout (md:flex-col md:w-32), backdrop-blur
- Radial gradient overlay + timer badge (top-right pill with pulsing dot + Clock3 + monospace format)

### 4. Replay Annotation (`ReplayAnnotator.tsx` + API)
- Moment selector dropdown (5 types: missed_empathy, good_de_escalation, long_pause, interruption, technique_usage)
- Character counter (500 max) with overflow warning
- AI generation button ("Analisis AI") with loading state
- New API endpoint: `POST /telefun/annotations/generate/:id`
  - Downloads agent recording from Supabase storage
  - Calls Gemini 3.1 Flash Lite with annotation schema
  - Deletes stale AI annotations
  - Inserts new AI annotations
  - Updates coaching summary with checksum metadata

### 5. Tests
- `telefun-prompt-builder.test.ts`: 19 tests (emotion branching, KONSISTENSI SUARA, ATURAN ROLEPLAY, expanded ATURAN BICARA, pacing, time limit, script format, consumer hints, time cue instruction)

## Verification

- **Lint**: 0 errors (web + api)
- **Tests**: 237/239 web pass, 278/282 API pass (pre-existing failures unchanged)
- **Build**: Web build succeeds, API typecheck clean
- **Type**: `stalled_response_watchdog` added to `TelefunTimelineEventName`

## Hotfix — Dead Air Double-Fire

Manual dead-air detection (7s threshold) was running concurrently with RealisticMode's `prolongedSilenceHandler` (8s `check_in`) and `fallbackResponseManager` (5s after agent stops), causing aggressive overlapping prompts.

**Fix**: Added `!this.orchestrator` guard on manual dead-air detection. When realistic mode is active, only the orchestrator's silence/fallback handlers manage timing:
- `prolongedSilenceHandler`: 8s check-in, 20s closing prompt, 35s session end
- `fallbackResponseManager`: 5s timeout after agent stops speaking

Manual detection remains as fallback for non-realistic mode calls.

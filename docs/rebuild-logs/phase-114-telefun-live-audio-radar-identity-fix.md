# Phase 114: Telefun Live Audio, Orchestrator, Radar, dan Identity Fix

**Ringkasan:** Memperbaiki 5 bug Telefun: identity gender-first, orchestrator removal, audio encoding hardening, communication profile canonicalization, radar chart data-key fix.

## Perubahan

### 1. Gender-First Identity Resolver
- **File:** `apps/web/src/routes/telefun/telefunSettings.ts`
- `resolveFinalIdentity()` diubah menjadi gender-first: gender final ditentukan sebelum fallback profile.
- Helper `pickIdentityProfileForGender()` memilih dari pool sesuai gender.
- `voiceName` selalu lewat `resolveVoiceForGender()` dengan gender final.
- Test: 4 characterization tests (male all-empty, female all-empty, Kore→male normalisasi, partial fill).
- **Files modified:** `telefunSettings.ts`, `telefun-settings-model-default.test.ts`.

### 2. Prompt-Only Realistic Mode (Orchestrator Removal)
- **File:** `apps/web/src/routes/telefun/services/geminiService.ts`
- `RealisticModeOrchestrator` dihapus dari runtime path `LiveSession`.
- Semua frame-loop orchestrator calls (evaluateAudioFrame, evaluateFallbackResponse, evaluateProlongedSilence, etc.) dihapus.
- Interruption guard dan speech segment tracking tetap dipertahankan.
- Dead-air detection non-orchestrator dengan cooldown tetap aktif.
- `SessionMetricsExtended` disederhanakan menjadi `SessionMetrics`.
- **File:** `apps/web/src/routes/telefun/services/promptBuilder.ts`
- Ditambahkan SILENT HANDLING section di system prompt untuk realistic mode dengan aturan non-agresif.
- **Files modified:** `geminiService.ts`, `promptBuilder.ts`, `telefun-prompt-builder.test.ts`.

### 3. Audio Forwarding Hardening
- **File:** `apps/web/src/routes/telefun/services/liveProtocol.ts`
- Helper `float32ToPcm16Buffer()` diekstrak dari inline code `geminiService.ts`.
- `geminiService.ts` sekarang menggunakan helper tersebut.
- **Files modified:** `liveProtocol.ts`, `geminiService.ts`.
- **Test:** Validasi PCM16 conversion, clamping, dan base64 roundtrip.
- **File:** `apps/telefun/src/server-protocol.test.ts` — test `realtimeInput.audio` sebagai forwardable message.

### 4. Canonical Communication Profile Builder
- **File:** `packages/types/src/telefun-communication-profile.ts` (NEW)
- Benchmark defaults, status evaluation, value builders, dan profile builder dipindahkan ke shared helper.
- Backward compatible: API re-export dari shared helper.
- Web `getCommunicationProfileFromAssessment()` menggunakan shared `buildCommunicationProfileFromAssessment()`.
- **Files modified:** `packages/types/src/index.ts`, `apps/api/src/lib/telefun-communication-profile.ts`, `apps/web/src/lib/voiceAssessmentUtils.ts`.

### 5. Radar Chart Data Key & Dimension Guard Fix
- **File:** `apps/web/src/routes/telefun/components/VoiceRadarChart.tsx`
- Chart data menggunakan `VoiceRadarDatum` dengan explicit `userValue` dan `targetValue`.
- `Radar` dataKey berubah dari `(d) => d[d.subject] || 0` → `"userValue"` (Hasil Anda) dan `"targetValue"` (Target QA).
- Axis chart memakai metric key stabil (`speakingRate`, `fillers`, dst.) dan label hanya untuk tampilan.
- Ditambahkan `ResizeObserver` render guard: chart hanya mount saat wrapper punya non-zero dimension.
- Helper `buildVoiceRadarData()` dengan 2 unit tests.
- **Files modified:** `VoiceRadarChart.tsx`, `telefun-communication-profile.test.tsx`.

## Files Changed

| File | Change |
|------|--------|
| `packages/types/src/telefun-communication-profile.ts` | **NEW** — shared profile builder |
| `packages/types/src/index.ts` | +export telefun-communication-profile |
| `apps/web/src/routes/telefun/telefunSettings.ts` | Gender-first identity resolver |
| `apps/web/src/routes/telefun/services/geminiService.ts` | Orchestrator dihapus, audio encoding |
| `apps/web/src/routes/telefun/services/liveProtocol.ts` | +float32ToPcm16Buffer helper |
| `apps/web/src/routes/telefun/services/promptBuilder.ts` | +SILENT HANDLING section |
| `apps/web/src/routes/telefun/components/VoiceRadarChart.tsx` | Explicit dataKey + ResizeObserver |
| `apps/web/src/lib/voiceAssessmentUtils.ts` | Delegasi ke shared helper |
| `apps/api/src/lib/telefun-communication-profile.ts` | Re-export dari shared helper |
| `apps/web/src/__tests__/telefun-settings-model-default.test.ts` | +4 identity characterization tests |
| `apps/web/src/__tests__/telefun-prompt-builder.test.ts` | +2 silent handling tests |
| `apps/web/src/__tests__/telefun-live-protocol.test.ts` | +3 audio encoding tests |
| `apps/web/src/__tests__/telefun-communication-profile.test.tsx` | +5 radar data helper tests |
| `apps/telefun/src/server-protocol.test.ts` | +1 realtime audio forwardable test |

## Post-Audit Verification (2026-06-04)

- `pnpm --filter @trainers/web test src/__tests__/telefun-settings-model-default.test.ts src/__tests__/telefun-live-protocol.test.ts src/__tests__/telefun-communication-profile.test.tsx src/__tests__/telefun-voice-assessment-utils.test.ts src/__tests__/telefun-prompt-builder.test.ts` — 5 files / 91 tests PASS.
- `pnpm --filter @trainers/api test src/__tests__/telefun-communication-profile.test.ts` — 1 file / 30 tests PASS.
- `pnpm --filter @trainers/telefun test src/server-protocol.test.ts` — 1 file / 5 tests PASS.
- `pnpm --filter @trainers/web build` — PASS, with existing Vite chunk-size warning.
- `pnpm --filter @trainers/api build` — PASS.
- `pnpm --filter @trainers/telefun build` — PASS.

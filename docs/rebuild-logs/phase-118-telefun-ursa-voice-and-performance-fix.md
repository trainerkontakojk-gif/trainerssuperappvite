# Phase 118: Telefun Ursa Voice And Performance Fix

**Goal:** Fix `Ursa` voice fallback sounding female (invalid provider voice), and reduce Telefun perceived weight.

## Voice Registry Boundary

- Created `telefunVoiceRegistry.ts` — canonical Gemini Live voice registry with provider-validated voice names:
  - Male: `Puck`, `Charon`, `Fenrir`, `Orus`
  - Female: `Kore`, `Leda`, `Aoede`
  - Type-safe `GeminiLiveVoiceName` and `resolveGeminiLiveVoice()` with gender-aware fallback
  - `isGeminiLiveVoiceName()` guard for settings parsing
- `telefunSettings.ts`:
  - `MALE_VOICES` / `FEMALE_VOICES` now delegate to `GEMINI_LIVE_VOICES_BY_GENDER`
  - `VOICE_OPTIONS` pruned to valid voices only
  - `DEFAULT_IDENTITY_POOL` replaces invalid voices: `Dipper`→`Charon`, `Ursa`→`Puck`, `Capella`→`Kore`, `Lyra`→`Aoede`, `Vega`→`Leda`
  - `parseTelefunSettings()` normalizes persisted `voiceName` through `isGeminiLiveVoiceName()` — invalid voices are silently cleared (preserving gender)
- `geminiService.ts` `sendSetup()` uses `resolveGeminiLiveVoice()` with `resolvedIdentity.voiceName` + `resolvedIdentity.gender` instead of raw `config.voiceName`

## Performance Optimizations

- `ReviewModal` lazy-loaded via `React.lazy` + `Suspense` in `index.tsx`
- `VoiceRadarChart` split: `VoiceRadarChartInner.tsx` holds static Recharts import, `VoiceRadarChart.tsx` lazily loads it, and pure radar data mapping lives in `voiceRadarData.ts`
- Usage baseline capture fire-and-forget (no longer blocks session creation)
- Initial settings/history load effect changed from `[view]` to `[]` — stops reloading on every view change
- `new Set(dbRecords.map(...))` extracted outside the filter loop
- Volume throttled: `onVolumeChange` emits at most 5Hz or when volume bucket changes; `volumeSamples` capped at 1000 entries

## Files Modified

- `apps/web/src/routes/telefun/telefunVoiceRegistry.ts` — **NEW**: canonical Gemini Live voice registry
- `apps/web/src/routes/telefun/telefunSettings.ts` — Replaced hardcoded voice lists with registry, pruned VOICE_OPTIONS, normalized identity pool, `parseTelefunSettings` voice validation
- `apps/web/src/routes/telefun/services/geminiService.ts` — `sendSetup()` uses registry resolver; throttled `onVolumeChange`; capped `volumeSamples`
- `apps/web/src/routes/telefun/index.tsx` — `ReviewModal` lazy; `useEffect` `[]` dependency; fire-and-forget usage baseline; `dbRecordIds` extracted
- `apps/web/src/routes/telefun/components/VoiceRadarChartInner.tsx` — **NEW**: heavy Recharts chart component
- `apps/web/src/routes/telefun/components/VoiceRadarChart.tsx` — Lightweight lazy-loading wrapper
- `apps/web/src/routes/telefun/components/voiceRadarData.ts` — **NEW**: pure radar data helper, keeps Recharts out of pure tests
- `apps/web/src/__tests__/telefun-settings-model-default.test.ts` — 3 new regression tests for Ursa/Dipper/Capella normalization
- `apps/web/src/__tests__/telefun-live-protocol.test.ts` — 2 new regression tests for setup message voice validation
- `apps/web/src/__tests__/telefun-communication-profile.test.tsx` — Updated to `waitFor` for lazy-loaded chart; pre-imports inner chunk
- `docs/rebuild-logs/phase-118-telefun-ursa-voice-and-performance-fix.md` — **NEW**: rebuild log

## Verification

- Lint: 0 errors (existing warnings remain)
- TypeScript: `tsc --noEmit` passes
- Tests: 56 targeted Telefun voice/chart/realtime tests pass
- Additional adapter/usage checks: 29 tests pass

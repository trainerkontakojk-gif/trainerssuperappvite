# Phase 45: Telefun Production Voice And Session Save Repair

**Date:** 2026-05-25
**Status:** DONE

## Root Cause
1. **Database Schema Mismatch:** The hosted target Supabase was missing the `feedback` column in the `telefun_history` table, causing PostgREST to return `42703 column does not exist` when saving/patching sessions.
2. **Incorrect Finalization Sequence:** The client triggered the scoring endpoint `/telefun/score/:id` *before* the agent recording blob was uploaded and finalized. Because the backend analyzer needs to download the agent's audio to perform assessment, the scoring failed.
3. **Mismatched Live Audio Decoding:** The client only played audio if the received WebSocket frame was an `ArrayBuffer` (raw binary). However, the Gemini Live API over WebSocket wraps audio responses as base64-encoded PCM inside JSON messages (`serverContent.modelTurn.parts[].inlineData.data`).
4. **Ungated Realtime Audio:** The client sent microphone audio chunks immediately on WebSocket connection before the Gemini Live `setupComplete` acknowledgement was received.

## Changes

### apps/web
- Created `sessionFinalizer.ts` to orchestrate deterministic session saving: upload recordings, patch session metadata, finalize recording paths, request scoring, and patch assessment results.
- Created `services/liveProtocol.ts` helpers: `parsePcmSampleRate`, `base64ToUint8Array`, `extractGeminiInlineAudioChunks`, and `shouldSendRealtimeAudio` to decode JSON audio and gate microphone input.
- Modified `index.tsx` to integrate `finalizeTelefunSession` inside `handleRecordingReady`.
- Modified `services/geminiService.ts` to decode base64 audio chunks, pass sample rate to `playPcm()`, gate microphone input until setup complete, and reset flags on reconnect.
- Modified `types.ts` to declare `setup_complete` and `first_user_audio_chunk_sent` timeline events.

### apps/api
- Created `supabase/migrations/20260525000400_telefun_history_add_feedback.sql` to add the missing `feedback` column.
- Modified `routes/telefun.ts` to add payload update builder `buildTelefunSessionUpdatePayload`, summarize feedback with `buildTelefunFeedbackSummary`, and update the patch and score endpoints.

### apps/telefun
- Created `src/server-protocol.ts` helpers `isGeminiSetupMessage` and `hasGeminiSetupComplete`.
- Modified `src/server.ts` to queue client audio/text messages until `setupComplete` is received from Gemini.

### Tests
- Created `apps/api/src/__tests__/telefun-schema-contract.test.ts` (verifies all columns written by API are declared in SQL migrations).
- Created `apps/web/src/__tests__/telefun-session-finalizer.test.ts` (verifies deterministic upload-then-score sequence).
- Modified `apps/web/src/__tests__/telefun-live-protocol.test.ts` (covers base64 decoding, sample rate extraction, and gating logic).
- Modified `apps/telefun/src/server-protocol.test.ts` (covers setup detection).
- Modified `apps/api/src/__tests__/telefun-routes.test.ts` (covers update payload and feedback summary helpers).

## Verification
- All focused tests passed:
  - `pnpm --filter @trainers/api test -- telefun-schema-contract` (PASS)
  - `VITE_SUPABASE_URL=https://dummy.supabase.co SUPABASE_SERVICE_ROLE_KEY=dummy pnpm --filter @trainers/api test -- telefun-routes` (PASS)
  - `pnpm --filter @trainers/web test -- telefun` (18 tests passed)
  - `pnpm --filter @trainers/telefun test` (5 tests passed)

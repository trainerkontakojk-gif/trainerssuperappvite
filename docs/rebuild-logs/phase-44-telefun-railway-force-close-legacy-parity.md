# Phase 44: Telefun Railway Force-Close & Legacy Parity Fix

**Date:** 2026-05-25
**Status:** DONE

## Root Cause
1. Client audio packets were sent as raw binaryPCM ArrayBuffers, while the WebSocket proxy server attempted to read them as UTF-8 strings before sending to Gemini, leading to payload corruption and Gemini force-closing the connection.
2. The client did not leverage the dedicated `telefunModelId` settings configuration for Gemini Live voice sessions, leading to potential model configuration conflicts.
3. Web interface masked WebSocket close codes (`4001`, `4003`, `1006`, `1011`), making debugging of deployment failures extremely opaque.
4. Duplicate database rows were created for each session due to the proxy and frontend API both generating database rows independently.
5. Recording storage path did not comply with RLS security policies, causing recording finalization to fail.

## Changes

### apps/web
- Created `services/liveProtocol.ts` to implement WS URL normalization, close-code mapping, Gemini Live setup messages, and base64 PCM JSON audio packets.
- Created `services/promptBuilder.ts` to generate complete, structured system instructions from identity and roleplay configurations.
- Created `services/timingGuards.ts` to implement duration cues at 30 seconds and 20 seconds remaining.
- Created `recordingPath.ts` to build secure, RLS-compliant recording paths matching the `<user_id>/<session_id>/(full_call|agent_only).webm` format.
- Modified `services/geminiService.ts` to integrate protocol/prompt helpers, encode microphone audio chunks, map close-code warnings, and reject invalid transport configurations.
- Modified `index.tsx` to pass scenario/consumer configurations, fetch authenticated userId, store recording files, and attach WebSocket connection directly to the pre-created API session.
- Modified `components/PhoneInterface.tsx` to handle close errors gracefully and trigger duration cues/auto-end hook.

### apps/telefun
- Created `src/server-protocol.ts` to implement validation of Gemini-forwardable messages.
- Modified `src/server.ts` to parse, validate, and forward structured JSON payloads directly to Gemini, bypassing custom raw binary utterance buffering.
- Modified `src/db.ts` to include `getOwnedSessionId` helper to prevent duplicate sessions.
- Modified `package.json` to configure test suite execution.

### apps/api
- Refactored `routes/telefun.ts` to define insert/upsert payload builders and enforce strict recording file path ownership.

### Tests
- Created `apps/web/src/__tests__/telefun-live-protocol.test.ts`
- Created `apps/web/src/__tests__/telefun-prompt-builder.test.ts`
- Created `apps/web/src/__tests__/telefun-timing-guards.test.ts`
- Created `apps/web/src/__tests__/telefun-recording-path.test.ts`
- Created `apps/api/src/__tests__/telefun-routes.test.ts`
- Created `apps/telefun/src/server-protocol.test.ts`

## Verification
- All 6 new test files passed successfully in Vitest:
  - `pnpm --filter @trainers/web test -- telefun` (14 tests passed)
  - `VITE_SUPABASE_URL=https://dummy.supabase.co SUPABASE_SERVICE_ROLE_KEY=dummy pnpm --filter @trainers/api test -- telefun-routes` (3 tests passed)
  - `pnpm --filter @trainers/telefun test` (2 tests passed)
- TypeScript build passes on all services:
  - `pnpm --filter @trainers/telefun build` (PASS)
  - `pnpm --filter @trainers/web build` (PASS)
  - `pnpm --filter @trainers/api build` (PASS)

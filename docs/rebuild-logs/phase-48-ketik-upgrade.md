# Phase 48: KETIK Legacy Parity Upgrade

## Summary

Menyamakan modul KETIK Vite dengan reference-repo untuk 3 fitur yang belum terport:

1. **SessionTimingContext** — Backend kini menerima `remainingSeconds`/`elapsedSeconds` dan menghasilkan instruksi waktu 3-tier (near end / wrap up / still long)
2. **strictScriptMode** — OpenRouter menerima extra instruction ketat saat scenario memiliki script
3. **allowSolutionAcknowledgement** — Frontend mendeteksi apakah agen sedang memberi instruksi saat timeout, sehingga tidak mengirim closing message yang tidak pantas

## Key Changes

### Backend (`apps/api/src/services/ketik-service.ts`)

- Added `SessionTimingContext` interface (`remainingSeconds`, `elapsedSeconds`, `totalDurationSeconds`)
- Added `formatDurationLabel()` helper for human-readable duration
- Rewrote `buildTimeLimitInstruction()` with 3-tier time awareness:
  - `nearEndThreshold` (15% of total, min 20s, max 45s): consumer BOLEH mulai menutup
  - `wrapUpThreshold` (30% of total, min 45s, max 90s): BELUM perlu menutup
  - Default (still long): JANGAN menutup, fokus substansi
- Added `strictScriptMode` for OpenRouter: extra system instruction when scenario has script, temp clamped to max 0.55
- `generateConsumerResponse()` now accepts optional `timing?: SessionTimingContext` parameter
- Prompt enhanced with extra instructions matching reference

### Backend Routes (`apps/api/src/routes/ketik.ts`)

- `/generate` endpoint now passes `remainingSeconds`, `elapsedSeconds`, `totalDurationSeconds` to service

### Shared Types (`packages/types/src/index.ts`)

- `generateMessageSchema` now has optional `remainingSeconds: z.number().optional()` and `elapsedSeconds: z.number().optional()`

### Frontend ChatInterface (`apps/web/src/routes/ketik/components/ChatInterface.tsx`)

- Added `allowSolutionAcknowledgement()` with:
  - `STRICT_INSTRUCTIONAL_CUES` (11 cue words: silakan, mohon, harap, etc.)
  - `ACTION_VERB_CUES` (7 action verbs: coba, klik, tekan, etc.)
  - `hasStructuralSteps()` — detects numbered/bulleted lists
  - `countCuesWithBoundary()` — counts instructional cues with word boundaries
  - Returns true if agent is giving clear instructions to consumer
- Updated `handleSend()` to pass `remainingSeconds` and `elapsedSeconds` to backend
- Updated `handleSessionTimeout()` to check `allowSolutionAcknowledgement()` before sending closing message:
  - If agent is mid-instruction: just expire session without sending consumer closing message
  - Otherwise: send legacy fallback closing text

## Changed Files

- `apps/api/src/services/ketik-service.ts` — +100 lines (3-tier time, strictScriptMode, timing context)
- `apps/api/src/routes/ketik.ts` — +5 lines (pass timing to service)
- `packages/types/src/index.ts` — +2 lines (optional timing fields in schema)
- `apps/web/src/routes/ketik/components/ChatInterface.tsx` — +70 lines (allowSolutionAcknowledgement, send timing)

## Verification

- `pnpm --filter @trainers/api test` — 278 passed (telefun env failure pre-existing)
- `pnpm --filter @trainers/web test` — 238 passed (access-groups timeout pre-existing)
- `pnpm build` — Full monorepo build succeeds

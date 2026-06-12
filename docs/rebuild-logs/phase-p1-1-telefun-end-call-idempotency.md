# Phase P1.1 — Telefun End-Call Idempotency

## Changes

### Frontend: `geminiService.ts` (LiveSession)
- Added `recordingFinalizationPromise` and `resolveRecordingFinalization` fields to track recording completion.
- Added a memoized `disconnectPromise`; duplicate calls return the same Promise instance and cannot start a second drain/finalization flow.
- `stopRecording()` now creates a Promise that `disconnect()` can await.
- `emitRecording()` is now `async`, awaits `onRecordingComplete()`, and resolves the finalization promise afterward.
- `disconnect()` now awaits `recordingFinalizationPromise` before resolving, ensuring recording callback completes before navigation.

### Frontend: `PhoneInterface.tsx`
- Added `isDisconnecting` state and `endCallStartedRef`/`isDisconnectingRef` refs for idempotency guard.
- `handleEndCall()` uses `endCallStartedRef` to prevent concurrent end-call executions.
- UI: End Call button is disabled during disconnecting, with accessible label and visual feedback.
- Hold and microphone controls are also disabled and guarded while disconnect/finalization is active.
- `session.onRecordingComplete` callback checks `isDisconnectingRef` before navigating home — the disconnect flow handles navigation instead.
- Cleanup effect skips disconnect if `endCallStartedRef` is already true.

### Database Migration: `20260611200000_telefun_scoring_lifecycle.sql`
- New columns on `telefun_history`: `scoring_status`, `scoring_claimed_at`, `scoring_completed_at`, `scoring_attempt_count`, `scoring_last_error`.
- CHECK constraint on `scoring_status`: `pending`, `processing`, `completed`, `failed`.
- Indexes for status queries and stale processing detection.
- RPC `claim_telefun_scoring(UUID, INT)`: atomic claim with stale-timeout recovery. Transitions `pending`/`failed` → `processing`. Returns `false` for `completed` or active `processing`.
- RPC `complete_telefun_scoring(UUID, NUMERIC, JSONB)`: marks as `completed` with score and assessment.
- RPC `fail_telefun_scoring(UUID, TEXT)`: marks as `failed` with error message.
- All lifecycle RPC table references are schema-qualified because the functions use an empty `search_path`.
- Grants: `service_role` only (not `public`/`anon`/`authenticated`) — mutation RPCs are backend-only via admin client.

### Backend: `recordings.ts` — `/score/:id` route
- Added atomic `claim_telefun_scoring` RPC call before analysis.
- If claim fails and session is `completed`, returns cached assessment (no AI billing).
- If claim fails and session is `processing`, returns 409 conflict.
- On analysis success: calls `complete_telefun_scoring` RPC.
- On analysis failure (route error or internal): calls `fail_telefun_scoring` RPC.

### Backend: `telefun-analysis.ts`
- Success path now sets `scoring_status='completed'` and `scoring_completed_at`.
- Error paths set `scoring_status='failed'` and `scoring_last_error`.

### Tests Added
- `telefun-phone-interface-end-call.test.ts`: executable non-JSX harness for double-click guard, disabled controls, navigation ordering, and Promise identity.
- `telefun-phone-interface-finalizer.test.ts`: proves `disconnect()` remains pending until async `onRecordingComplete()` resolves.
- `telefun-scoring-lifecycle-schema.test.ts`: migration column/RPC/grant contract, status transition validation.
- `telefun-scoring-concurrent-retry.test.ts`: exercises the real Hono route with an in-flight first request, verifies the second request gets 409, and preserves cached score `0`.

## Risk Mitigation
- **Stuck in processing**: stale timeout (default 120s) allows reclamation; `claim_telefun_scoring` checks `scoring_claimed_at` age.
- **Grant leak**: RPCs are `SECURITY DEFINER`, revoked from `public`/`anon`/`authenticated`, only granted to `service_role`.
- **UI lock prevents retry**: if disconnect fails before recording complete, cleanup effect can still trigger disconnect (guarded by `endCallStartedRef`).

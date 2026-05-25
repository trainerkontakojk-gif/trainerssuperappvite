# Phase 46: Telefun End-Call Lifecycle Stabilization & Finalization Hardening

**Date:** 2026-05-25
**Status:** DONE

## Goal
To implement and verify **Phase 1: Stabilize End-Call & Finalization (P0)** of the Telefun V2 plan, eliminating race conditions during call teardown and securing deterministic session creation fallback.

## Root Cause & Gaps Resolved
1. **Race Condition on Unmount:** When a call ended (via disconnect, error, or manual hangup), the parent component (`TelefunLanding`) instantly switched `view` to `"home"` and cleared `activeSessionConfig`. This unmounted `PhoneInterface` immediately. During unmount, its cleanup hook called `session.disconnect()`, which stopped media recorders and queued `emitRecording` (500ms timeout). However, since `PhoneInterface` was already unmounted, its internal `mountedRef.current` was `false`, causing the recording completion callback to discard the audio blobs and skip `onRecordingReady`.
2. **Missing Fallback Session Creation:** If upfront session creation failed at call start, `activeSessionId` remained empty. When the call finished, the client discarded the recordings and metrics because no `sessionId` was available.

## Changes

### apps/web

#### `PhoneInterface.tsx`
- Extended `callState` to support the `"finalizing"` status.
- Introduced `callStateRef` and helper `setCallStateWithRef` to prevent state stale closures inside the main connection effect and timer.
- Refactored `onStatusChange`, `onError`, and timeout limits: if a call has connected and subsequently ends/disconnects/encounters an error, it transitions the UI to `"finalizing"` and sets status to `"Sedang menyimpan rekaman..."` rather than instantly terminating.
- Modified `session.onRecordingComplete`: it now awaits the `onRecordingReady` callback. Once it finishes, if the component remains mounted, it calls `onEndSession("completed")` for cleanup.
- Disabled control buttons (Mute, Hold, Akhiri) when in `"finalizing"` state.
- Changed the "Akhiri" button's visual state to show "Menyimpan..." and a loading spinner during finalization.

#### `index.tsx`
- Modified `handleRecordingReady` to perform fallback session creation with `postApi("/telefun/sessions", ...)` if `activeSessionId` is falsy at the end of the call, resolving a fallback UUID if that fails.
- Destructured `uploadFailed` from the finalizer's return value and show a warning toast notifying the user that the recording failed to upload but the session was saved.
- Moved `setView("home")` and clearing of active configurations into the `finally` block of `handleRecordingReady`, keeping the finalizing UI mounted until all upload, patch, and scoring operations conclude.

#### `sessionFinalizer.ts`
- Extended `finalizeTelefunSession`'s return type to include `uploadFailed: boolean`.
- Tracked failed uploads for full-call and agent-only audio blobs, returning a granular status to the caller.

## Verification
- Ran telefun unit tests:
  `pnpm --filter @trainers/web test -- telefun` (18 tests passed, 100% success)
- Built the web package successfully:
  `pnpm --filter @trainers/web build` (tsc and rollup succeeded)

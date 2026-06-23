# Phase: Telefun 15-Minute Self-Close & Resumption Reliability

## Summary

Fixed the Telefun long-session behavior that allowed a 15-minute simulation to end early after the AI consumer accepted an initial solution. The repair keeps app time cues as the only closing authority, preserves Gemini Live reconnect setup with the latest session-resumption handle, and records final duration from elapsed runtime metrics instead of the UI connection-state counter.

## Changes

- `apps/web/src/routes/telefun/services/promptBuilder.ts`
  - Added `ATURAN PENYELESAIAN MASALAH`.
  - Clarifies that initial solutions, website/link/form-report instructions, SLA estimates, reference numbers, or good explanations are not completion signals.
  - Keeps the consumer cooperative while requiring follow-up questions or concern confirmation until the app sends a closing cue.
- `apps/telefun/src/server-protocol.ts`
  - Added `buildGeminiReconnectSetupMessage()` as a pure helper.
  - Preserves cached setup fields and injects the latest `sessionResumption.handle` for proactive reconnects after `goAway.timeLeft`.
- `apps/web/src/routes/telefun/components/PhoneInterface.tsx`
  - Uses `session_metrics.sessionDurationMs` as the primary final duration source.
  - Falls back to the UI counter only when elapsed runtime metrics are unavailable.

## Verification

- RED verified:
  - Prompt test failed before `ATURAN PENYELESAIAN MASALAH` existed.
  - Reconnect helper test failed before helper export existed.
  - Duration test failed because final duration was still taken from the UI counter.
- GREEN verified:
  - `pnpm --filter @trainers/web exec vitest run src/__tests__/telefun-prompt-builder.test.ts src/__tests__/telefun-phone-interface-end-call.test.ts`
  - `pnpm --filter @trainers/telefun test -- server-protocol`

## Rollback

Revert the touched prompt builder, protocol helper/server usage, PhoneInterface duration handoff, tests, and this documentation. No database migration was introduced.


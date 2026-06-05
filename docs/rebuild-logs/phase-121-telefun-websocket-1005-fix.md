# Phase 121: Telefun WebSocket 1005 Simulation Close Fix

## Requirement

Prevent false-positive `Koneksi WebSocket ditutup dengan kode 1005` errors from showing up in the UI when the user ends a call, during normal unmount cleanup, or during session timeout.

## Design

1. **Client intentional close:** Explicitly pass client close code (`1000`) and reason (`"Client ended Telefun session"`) in `disconnect()`, preventing the browser from raising status-less `1005` events on normal close.
2. **Close-code mapping:**
   - Map `1000` to `normal` severity to prevent error warnings.
   - Map `1005` to `network` severity with a descriptive, actionable Indonesian diagnostic message directing the user/developer to check connection, railway proxy, or upstream Gemini.
3. **Idempotence & State guards:** Guard `onError` triggers in `onclose` so that user-intended actions or timeout signals do not get overwritten by generic close messages. Keep recording completions idempotent with `stopRecordingOnce()`.
4. **Proxy close code hardening:** Validate and sanitize close codes returned from the Gemini Live API upstream to prevent sending invalid reserved codes (`1005`, `1006`, etc.) in close frames to the browser, returning `1011` fallback instead.

## Affected Files

- [liveProtocol.ts](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/web/src/routes/telefun/services/liveProtocol.ts)
- [geminiService.ts](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/web/src/routes/telefun/services/geminiService.ts)
- [PhoneInterface.tsx](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/web/src/routes/telefun/components/PhoneInterface.tsx)
- [server-close.ts](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/telefun/src/server-close.ts)
- [server.ts](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/telefun/src/server.ts)
- [telefun-live-protocol.test.ts](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/web/src/__tests__/telefun-live-protocol.test.ts)
- [server-close.test.ts](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/telefun/src/server-close.test.ts)
- [modules.md](file:///Users/nadindyta/Downloads/trainerssuperappvite/docs/modules.md)

## Verification

- Web tests: `pnpm --filter @trainers/web test telefun` passed (15 files, 186 tests).
- Server tests: `pnpm --filter @trainers/telefun test` passed (3 files, 10 tests).
- Monorepo full build `pnpm build` succeeded successfully.
- Code graph synchronized via `graphify update .`.

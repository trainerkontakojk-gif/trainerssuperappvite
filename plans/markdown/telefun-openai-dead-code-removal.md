# Telefun — remove dead OpenAI code

- **Status:** Implemented on `claude/project-thread-8hrwo8`.
- **Risk lane:** Lane C (multi-file deletion, no intended runtime change).
- **Requested by:** Fajar, 2026-10-17 (project thread "Pelajari isi aplikasi Trainers SuperApp").

## Requirement

OpenAI Realtime Telefun is permanently retired (`docs/architecture.md`). Source files that no production entrypoint imports are deleted, together with the unit tests that only exercised them. Nothing reachable changes, and the owner-bound DELETE cleanup path for historical WebRTC calls stays intact.

## Design

- Reachability: a transitive import walk from `apps/telefun/src/server.ts` and `apps/web/src/main.tsx` (relative and `@/` imports), plus an importer search over `apps/`, `packages/` and `scripts/`, including tests and `vi.mock` paths.
- Deleted, Telefun server: `openai-voice-assessment.ts`, `scoring-audio.ts`, `providers/OpenAIRealtimeAdapter.ts`, `providers/openai-realtime-tool-coordinator.ts`, `realtime-webrtc/rollout-gate.ts`, and their tests.
- Deleted, web: `services/liveProtocol/openai.ts`, `services/telefunProviderReadiness.ts`, and `services/openaiWebRtc/{brokerCleanup,cleanup-owner,cleanup,connectDiagnostics,events,interruptionController,openaiWebRtcSession,recording,recordingFinalizer,responseCreateController,sessionMetricsTracker}.ts`, with the three web tests that imported them.
- Kept: `openaiWebRtc/brokerApi.ts` and `contracts.ts` (DELETE cleanup used by `telefunTransport.ts`), and every `realtime-webrtc/*` module the server still imports.
- `providers/openai-realtime-event-observer.test.ts`: the adapter-vs-sideband parity case now asserts the same snapshot against the sideband wrapper alone.
- `scripts/test-core.json`: stale entries for deleted tests removed.
- Out of scope: `lib/replayAnnotationHelpers.ts` and `services/reviewTypes.ts` are also unreachable but are not OpenAI code.

## Tasklist

- [x] Reachability map and importer check.
- [x] Delete files; fix the observer test; prune the manifest.
- [x] Root typecheck, lint and build; Telefun server boot with health 200.

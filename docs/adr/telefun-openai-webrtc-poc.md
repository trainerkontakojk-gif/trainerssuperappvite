# ADR: Telefun OpenAI WebRTC POC (Phase 3 integration)

- **Status:** Accepted for capability-gated, non-production Phase 3 PhoneInterface integration; supersedes the isolated browser-scope wording below
- **Date:** 2026-07-28
- **Supersedes:** only the OpenAI WebRTC POC scope; baseline Gemini WS and the existing provider-adapter ADR remain unchanged

## Context

Telefun production already has a stable Gemini Live WebSocket baseline and an OpenAI WebSocket adapter behind an additive provider-router design. The OpenAI WebRTC effort remains a default-off, non-production POC, now integrated additively through `PhoneInterface` only when the capability gate, rollout flag, and allowlist permit it. The integration preserves the server trust boundary for transcript, usage, finalization, and ownership checks.

The contract is aligned with the official OpenAI Realtime WebRTC/server-control docs (verified via Context7): a unified `POST /v1/realtime/calls` upstream that sends multipart `sdp` + `session`, a `Location` header carrying the call identifier, a sideband control socket on `wss://api.openai.com/v1/realtime?call_id=...`, and an explicit session-bound `DELETE` endpoint for cleanup.

## Decision

For Phase 3, Telefun uses the additive broker in `apps/telefun/src/realtime-webrtc/` and the WebRTC transport in `apps/web/src/routes/telefun/services/openaiWebRtc/`, selected by `PhoneInterface` only behind the capability gate. The Gemini Live WebSocket and legacy OpenAI WebSocket paths remain unchanged.

- Browser → Telefun: raw `application/sdp` only
- Telefun → OpenAI: multipart `sdp` + canonical server-built `session`
- Telefun → OpenAI sideband: control/event authority bound to parsed `call_id`
- Canonical POC model/voice: `gpt-realtime-2.1`; voice is server-owned from persisted consumer gender: `cedar` for `male`, `marin` for `female` or missing/blank
- Broker access: only authenticated admin/trainer profiles with owned, pre-created, active Telefun sessions
- Rollout flag: `TELEFUN_OPENAI_WEBRTC_POC_ENABLED=false` by default

The Phase 3 integration is not a production rollout and does not claim recording, hold, barge-in, or fallback-provider parity. `PhoneInterface` constructs the selected transport before ringtone so end/unmount uses the existing idempotent session-bound failed cleanup path; it delays `connect()` and media/provider work until ringtone ends and never falls back mid-call.

## Constraints

- `sessionId` must come from the path and must refer to an owned `active` session already created by the API.
- Browser input is fail-closed raw SDP; no browser-supplied model, voice, prompt, or provider config is accepted.
- `Location` / `call_id` are validated as opaque provider identifiers before sideband is opened.
- Transcript and usage are deduped and finalized exactly once; incomplete usage is audited, not synthesized.
- Cleanup is idempotent: browser close, DELETE retry, or `?outcome=failed` must not double-finalize.
- Production health/readiness remains non-billable and must not open paid provider sessions.

## Rollback

Disable `TELEFUN_OPENAI_WEBRTC_POC_ENABLED` and keep the existing Gemini WebSocket baseline plus the legacy OpenAI WebSocket path unchanged.

## Phase 3 rollout constraints

- `TELEFUN_OPENAI_WEBRTC_POC_ENABLED=false` remains the default; capability gating and the exact UUID allowlist must also permit a session.
- The integration is non-production and automated verification uses fake boundaries only. No paid/manual OpenAI smoke test is implied or claimed.
- Authenticated owner-bound failed DELETE cleanup remains available for an already-created session when provider start is kill-switched off.
- LiveSession Gemini and legacy OpenAI WebSocket behavior remain the rollback/baseline paths; no provider fallback occurs during an active call.

## Phase 2 implementation note

Implementation reality later added a shared OpenAI-only event observer and WS-only tool coordinator inside Telefun. The sideband path remains observation-only/server-authority, with scoped exactly-once dedupe and bounded diagnostics/frame limits. This internal extraction supports the Phase 3 integration; it does not imply production rollout or alter the Gemini baseline, legacy OpenAI WebSocket routing, or the default-off `TELEFUN_OPENAI_WEBRTC_POC_ENABLED` guard.

## References

- `docs/telefun.md`
- `docs/deployment.md`
- `docs/architecture.md`
- `docs/telefun-openai-webrtc-technical-audit.md`
- `docs/adr/telefun-realtime-provider-adapters.md`
- `apps/telefun/src/realtime-webrtc/*`
- `apps/web/src/routes/telefun/services/openaiWebRtc/*`

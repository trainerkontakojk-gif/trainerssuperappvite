# Telefun

> **Runtime status:** Telefun is Gemini Live only. The selectable models are
> `gemini-3.1-flash-live-preview` and `gemini-3.0-flash-live-preview`.
> GPT/OpenAI Realtime is permanently retired for Telefun and no configuration,
> cohort, cached browser bundle, or request can start it.

Telefun is a voice-simulation module for `admin` and `trainer`. It uses a React
browser client, the Hono API for settings/history/recordings, and the Telefun
WebSocket service for Gemini Live.

## Active runtime

```text
Browser LiveSession
  → authenticated WebSocket /ws
  → GeminiLiveAdapter
  → Gemini Live

Browser settings/history/recordings
  → API /api/v1/telefun
  → Supabase (owner/RLS-bound reads and writes)
```

- `LiveSession`, `PhoneInterface`, and `createTelefunTransport()` use Gemini
  only. A persisted OpenAI model or transport is normalized to the default
  Gemini model before a new browser session starts.
- The active protocol barrel exports only Gemini/common protocol helpers. The
  retired WebRTC capability compatibility value is static and unavailable; the
  browser does not fetch it during startup.
- `GET /api/v1/ai/models?module=telefun` returns the two active Gemini Live
  models only. Historical GPT realtime IDs are not selectable or valid for a
  new configure frame.
- `telefun_session_configure` accepts only a Gemini Live model, Gemini voice,
  and its canonical sample rate. Historical GPT input is rejected before an
  adapter is constructed.
- Settings and session writes reject historical GPT realtime IDs and
  `openai-audio`/`openai-webrtc` transports with
  `400 TELEFUN_OPENAI_DISABLED`. Reads normalize a persisted retired selection
  to Gemini without writing the row back.

## Session flow

1. The browser creates or resumes an owned Telefun session through the API.
2. `LiveSession` obtains microphone access, sends first-message authentication,
   then sends Gemini configuration and setup.
3. Audio, transcript collection, hold/mute, recording, and Gemini usage remain
   on the existing Gemini path.
4. A normal end drains the Gemini session, persists the recording/history, and
   queues Gemini voice scoring when appropriate.

Historical raw model and transport fields remain visible in history. Settings
normalization never rewrites historical history rows.

## Historical OpenAI Realtime compatibility

Historical `gpt-realtime-2.1`, `gpt-realtime-2.1-mini`, `openai-audio`, and
`openai-webrtc` values are data-only compatibility metadata. They remain
readable for authorized history, transcript, recording, feedback, usage, and
pricing views. They are not an admission path.

### Owner-bound WebRTC cleanup

The only retained Telefun OpenAI provider operation is cleanup for an
already-owned historical WebRTC call:

| Method | Path | Behavior |
| --- | --- | --- |
| `POST` | `/telefun/realtime/openai/webrtc/sessions/:sessionId/call` | Always `404`; no auth, body parse, provider, SDP, media, or start work. |
| `OPTIONS` for `POST` | same | Always `404`. |
| `OPTIONS` for `DELETE` | same | Exact-origin cleanup CORS only. |
| `DELETE` | same | Authenticated owner-bound cleanup only. |

`DELETE` requires an exact allowed origin, bearer token, active
admin/trainer profile, ownership, historical `openai-webrtc` transport, and a
recognized historical realtime model. It never accepts a Gemini row as cleanup.

For a bound attempt, the encrypted provider-call reference is read only by the
server-side durable-attempt boundary. The cleanup manager receives a strict
server-only decrypt callback, validates the resulting call ID against its stored
hash, and can issue only the documented hangup request. It cannot create a call,
construct SDP, open a sideband, send media, score audio, or emit new usage.

- A missing or invalid cleanup key/reference/call ID leaves the attempt
  retryable and returns the established safe `503` finalization response.
- A no-attempt terminalization may complete locally. An orphan with no encrypted
  reference is terminalized locally only when a server-side lookup proves that
  no provider call was bound; otherwise it remains retryable.
- Successful durable cleanup is `204`; lifecycle conflict is `409`; foreign,
  absent, or nonhistorical rows are hidden as `404`.

A deprecated cached-module shell may fail closed before any media or provider
work. It is not wired into a new Telefun flow; the only functional browser
compatibility request is an owner-bound `DELETE`.

### Historical scoring and pricing

- A valid cached historical voice assessment is returned unchanged and makes no
  provider or usage call.
- A terminal uncached historical OpenAI realtime row is permanently failed with
  `410 TELEFUN_OPENAI_SCORING_DISABLED`; it is not retried, requeued, sent to
  Gemini, or logged as new usage.
- An active/pending historical WebRTC lifecycle row remains cleanup-owned and
  is not scored.
- Retirement detection uses both stored model and transport so transport-only
  historical rows receive the same treatment.
- Existing `ai_usage_logs` and realtime price snapshots remain immutable and
  readable. Historical realtime pricing is display-only/read-only.

## API and data access

The API routes retain existing owner/auth/RLS and error behavior for:

- session and history reads;
- signed recording access and recording reconciliation;
- feedback projection from an existing canonical voice assessment;
- monitoring usage/history reads; and
- historical pricing display.

No historical attempt, recording, transcript, usage row, assessment, or pricing
snapshot is deleted, rewritten, or backfilled because the realtime path is
retired.

## Environment

### Telefun service

| Variable | Meaning |
| --- | --- |
| `GEMINI_API_KEY` | Required Gemini Live credential. |
| `OPENAI_API_KEY` | Optional, server-only historical hangup credential; never enables Telefun OpenAI Realtime. |
| `TELEFUN_OPENAI_WEBRTC_ORPHAN_KEY` | Optional server-only key for encrypted historical cleanup references. Missing/invalid values fail cleanup retryably. |
| `ALLOWED_ORIGINS` | Exact production origins; applies to the cleanup `DELETE` CORS boundary. |
| `TELEFUN_INTERNAL_TOKEN` | Independent internal scoring-worker health credential; it does not enable OpenAI scoring. |

All `TELEFUN_OPENAI*` enablement, cohort, allowlist, and model-rollout inputs
are retired no-ops. They must not be used in deployment instructions or as a
future feature flag.

### Direct OpenAI text is separate

`OPENAI_API_KEY` in `apps/api` remains required for existing direct OpenAI text
operations such as KETIK, PDKT, and QA. Those models and their pricing/usage
paths are outside Telefun retirement. Telefun never exposes this key to the
browser.

## Verification

Run fake/unit checks only; do not call a provider, perform paid/manual smoke,
run remote cleanup, migrate data, or deploy as evidence for this change.

```bash
pnpm --filter @trainers/telefun exec vitest run \
  src/realtime-webrtc/call-manager.test.ts \
  src/realtime-webrtc/http-broker.test.ts \
  src/realtime-webrtc/orphan-cleanup.test.ts \
  src/realtime-webrtc/contracts.test.ts

pnpm --filter @trainers/api exec vitest run \
  src/__tests__/telefun-routes.test.ts \
  src/__tests__/telefun-scoring-routing.test.ts \
  src/__tests__/telefun-scoring-service.test.ts

pnpm --filter @trainers/web exec vitest run \
  src/__tests__/telefun-live-session-auth.test.ts \
  src/__tests__/telefun-transport.test.ts \
  src/__tests__/telefun-web-rtc-capability.test.ts
```

## Archived pre-retirement material

The Phase 1–7 OpenAI WebRTC/sideband/provider-start implementation notes remain
in `docs/rebuild-logs/` and the historical ADR/audit files as evidence only.
They do **not** describe a supported runtime, deployment configuration, scoring
flow, browser transport, or provider test plan. This document supersedes their
active-operation guidance.

# KETIK — akhir waktu chat: konsumen pamit, agen tetap bisa menutup

Lane D (RPC migration on `ketik_sessions` lifecycle, plus web + API behavior).

## Requirement

Decision (Fajar, 2026-10-21):

- When the simulation timer runs out, or after the consumer has closed the chat, the agent can still type and send messages (e.g. a closing greeting) until they click **Akhiri chat**. Those messages are stored and reviewed. The AI consumer does not reply to them.
- When the timer runs out and the consumer has not closed the chat yet, the consumer sends one closing message with a reason to end the chat, in character, then the chat is marked closed by the consumer. If the consumer already said goodbye, the closing produces no message and only closes the chat.
- Telaah "Data konsumen yang terlihat di panel agen" shows the phone number too (it was missing after **Akhiri chat**).
- Unchanged: the legacy `/turns` endpoint still rejects expired or closed sessions; a finished session accepts nothing.

## Design

- Migration `supabase/migrations/20261021090000_ketik_post_expiry_closing.sql` (rollback in `supabase/rollbacks/`):
  - `append_ketik_session_message`: drop the `consumer_closed` and expiry rejections; only `state <> 'active'` ends appends.
  - `claim_ketik_session_response`: after expiry (consumer not closed) the claim is a closing claim: it skips the "last sender is not agent" no-op and returns `closing: true`.
  - `settle_ketik_session_response`: no expiry rejection; a publication after expiry always sets `consumer_closed = true`.
- API `server-sessions.ts`: `requestServerKetikResponse` passes `closing` to generation; `generateConsumerResponse` gets a `closing` timing flag whose instruction asks for one short goodbye with a reason (or `[NO_RESPONSE]` if already said goodbye).
- Web `useServerKetikChat`: sending and appending depend only on the session being active (not finished); queued bubbles render after close; on expiry with the consumer not closed, request one closing response (retried every 2 s while a browser clock ahead of the server gets a no-op). `ChatInterface` keeps the composer after expiry/close with a status line above it.
- Web `KetikReviewVerification`: add the phone number to the visible-data card.

No data-loss risk: functions only (`CREATE OR REPLACE`, same signatures, grants unchanged: `service_role` only).

## Tasklist

- [x] RED: `ketik-session-api.spec.ts` (post-expiry append, one closing reply, no further AI), `ketik-server-chat.spec.ts` (composer stays after expiry/close, closing reply shown, no reply to post-close messages), `ketik-flow.spec.ts` (phone in Telaah card).
- [x] GREEN: migration + rollback, API, web.
- [x] Local replay, focused E2E, thermo-nuclear, typecheck/lint, changelog.
- [x] Production: with Fajar's explicit approval, applied `20261021090000_ketik_post_expiry_closing.sql` once on 2026-10-21 before pushing the API/web code; repaired migration history and verified function definitions, service-role-only EXECUTE and remote applied status (all exit 0). Evidence: `docs/database.md`, KETIK post-expiry closing.

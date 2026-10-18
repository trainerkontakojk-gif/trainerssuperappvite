# Kontrol pengguna — Fase 2: batas latihan harian di server

Lane D (schema, RLS, API contract, Telefun server auth). Parent plan and mockup: https://claude.ai/artifact/3VQC3ERfjVLh8P6pLqMpT4. Phase 1: `kontrol-user-fase-1.md`.

## Requirement

- Starting practice is limited per day, counted on the server:
  - KETIK: each new session start counts 1. Chat messages are free.
  - PDKT: each new email counts 1. Replying is free, so every counted email can be answered (Fajar, 2026-10-18).
  - Telefun: each call start counts 1.
- Default rules: agent and leader get KETIK 3, PDKT 3, Telefun 0 (cannot start). Admin and trainer are unlimited.
- A per-user override (limit, optional end date) wins over the role rule. Editing UI comes in phase 4; the table exists now so the rule logic is complete.
- One day is the Asia/Jakarta calendar date; the count restarts at 00.00 WIB.
- A failed AI generation or failed start gives the quota back. Retrying the same request (same request id) counts once.
- A limit reached returns HTTP 429 `PRACTICE_LIMIT_REACHED` with a plain message and the reset time. A zero limit returns 403 `PRACTICE_NOT_ALLOWED`.
- Gaps closed so the limit cannot be bypassed:
  - The Telefun call server only accepts a session created by the API (it already checked the limit): it must be the caller's own, still `active`, created in the last 30 minutes, by an active account whose role may use Telefun. The legacy "create a session when none is given" path is removed.
  - Owners can no longer insert or update `telefun_history` directly; every write already goes through backend service-role code.
  - PDKT emails can be inserted through database functions the browser can call. A reply to an email whose creation was never counted counts against the person replying, once per email.
  - `POST /pdkt/session/init` and the plain `POST /pdkt/mailbox/batch` count like `session/create`. Saving a generated email with its retry token stays free.

## Design

Database (`20261018150000_practice_quota.sql`, rollback in `supabase/rollbacks/`):

- `practice_limit_rules(module, role, daily_limit null = unlimited, updated_at, updated_by)`, primary key `(module, role)`, seeded with the defaults.
- `practice_limit_overrides(user_id, module, daily_limit null = unlimited, ends_on date null, note, created_by, timestamps)`, unique `(user_id, module)`.
- `practice_usage(user_id, module, usage_date, request_key, created_at, refunded_at)`, unique `(user_id, module, request_key)`, index on `(user_id, module, usage_date)` for counted rows.
- RLS on all three with no browser policies; privileges revoked from `anon` and `authenticated`.
- `consume_practice_quota(user, module, key)` (service role only): a per-user/module advisory lock, then replay → allowed; refunded replay → re-counted if room; otherwise compare today's count with the resolved limit. Returns `{allowed, reason, limit, used, resets_at}`.
- `refund_practice_quota(user, module, key)` (service role only).
- Backfill: one counted row per existing canonical PDKT email (`created_by_user_id`, key `client_request_id` or `mailbox:<id>`, date = its WIB creation date), so old emails stay free to answer.
- Drop policies `telefun_history_insert_own` and `telefun_history_update_own`.

API (`apps/api`):

- New `services/practice-quota.ts`: `consumePracticeQuota`, `refundPracticeQuota`, `PracticeQuotaError`, and `ensurePdktReplyCounted`.
- KETIK `startServerKetikSession`: count after the idempotent replay and assignment checks, with key = `requestId`; refund if the start RPC fails.
- PDKT `session/create` and `session/init`: key = `client_request_id` (generated when missing and passed down so the saved email carries it); refund on AI or config failure. Plain `mailbox/batch` counts with its `client_request_id`; the token path does not. `mailbox/reply` calls `ensurePdktReplyCounted` first.
- Telefun `POST /sessions`: the API generates the session id, counts with it as key, inserts the row with that id, refunds if the insert fails.

Web: KETIK and PDKT show the server's limit message when a start is refused (hermetic tests in `ketik-server-chat.spec.ts` and `pdkt-resilience.spec.ts`).

Telefun server (`apps/telefun`):

- `TelefunAuthGate` needs a `sessionId`; `createSession` is removed.
- `getStartableSessionId` replaces `getOwnedSessionId` with the checks above.

Out of scope (later phases): showing remaining quota, Telefun for everyone and giving back a Telefun start whose call never connected (3), the Batas latihan page and override dialog (4), KETIK re-score limit (5).

## Tasklist

- [x] RED: `e2e/practice-quota-api.spec.ts` (real local backend: KETIK, PDKT, Telefun, overrides, refunds, DB privileges, Telefun gate).
- [x] Migration + rollback + README row; local replay and rollback test.
- [x] Types, quota service, KETIK/PDKT/Telefun hooks.
- [x] Telefun gate; remove superseded `createSession` unit cases.
- [x] GREEN focused specs plus affected KETIK/PDKT/Telefun specs; root typecheck, lint, build; thermo-nuclear review.
- [ ] CHANGELOG, docs note, PR, merge when CI is green.

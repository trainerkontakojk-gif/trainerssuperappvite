# Telefun scoring: permanent failures leave the retry queue

Lane D (schema + RPC + queue contract). Date: 2026-11-04.

## Requirement

- A scoring failure that `classifyScoringError` calls **permanent** (for example
  `TELEFUN_AGENT_SHORT_SPEECH_ERROR`, "no agent audio", invalid assessment) must
  not be picked up again by the embedded scoring worker. Today it is re-queued
  until `scoring_attempt_count >= MAX_SCORING_ATTEMPTS`, and each retry of a
  short recording pays for another Gemini transcription.
- Applies to both writers: the worker (`analyzeWithRetry` in
  `apps/api/src/services/telefun-scoring-service.ts`) and the manual route
  `POST /telefun/score/:id` (`apps/api/src/routes/telefun/recording-scoring.ts`).
- Transient failures keep today's behavior: worker reschedules with backoff;
  a manual transient failure stays due (null retry date) for the queue.
- An explicit manual retry (user presses "Telaah" again) stays allowed after a
  permanent failure; once it claims the row the permanent marker is cleared.

## Design

- Column `telefun_history.scoring_failed_permanently boolean not null default false`.
  Existing rows default to `false` (no backfill: we cannot tell old permanent
  failures apart, and the attempt budget still bounds them).
- RPC `public.fail_telefun_scoring_permanently(p_session_id uuid, p_error text,
p_claim_token_hash text) returns boolean`: same claim-token fence as the 3-arg
  `fail_telefun_scoring`, also sets the marker. `SECURITY DEFINER`,
  `search_path ''`, first statement `app_internal.assert_service_role()`,
  `REVOKE ALL FROM PUBLIC, anon, authenticated`, `GRANT EXECUTE TO service_role`.
- Trigger `BEFORE UPDATE` on `telefun_history`: whenever `scoring_status` is not
  `failed` after the update, force the marker to `false`. Every claim (worker or
  manual) moves the row to `processing`, so a later transient failure or
  reschedule can never inherit a stale marker, and no existing RPC needs to be
  redefined.
- API: the service's fail helper takes a `permanent` flag. Worker passes
  `errorType === "permanent"` (attempt exhaustion keeps the plain fail — the
  attempt budget already removes it). Manual route passes
  `classifyScoringError(...) === "permanent"`.
- Queue: `fetchPendingJobs` adds `scoring_failed_permanently.is.false` to the
  active-row branch, before `LIMIT`.
- Roles touched: `service_role` only (new RPC); no client grants. No data loss
  forward; rollback drops the column (loses only the marker).
- Deploy order: the migration must reach production **before** the API code
  (Railway auto-deploys `main`); otherwise the manual route fails closed with
  `SCORING_STATE_UNAVAILABLE` on permanent failures and the worker query
  errors. Remote apply needs Fajar's explicit approval.

## Tasklist

- [x] Plan (this file).
- [x] RED: flip the short-speech case in `apps/web/e2e/telefun-scoring-api.spec.ts`
      (manual permanent failure is not queued; manual retry still works) and add a
      worker case (worker permanent failure is not re-queued).
- [x] Migration `supabase/migrations/20261104090000_telefun_scoring_permanent_failure.sql` + `supabase/rollbacks/rollback_20261104090000_telefun_scoring_permanent_failure.sql` + README row.
- [x] API: service fail helper, worker branch, manual route, queue filter.
- [x] Local replay (`scripts/integration/supabase-bootstrap.sh`), focused E2E green,
      typecheck/build, thermo-nuclear review, changelog.
- [ ] Remote apply only after Fajar approves; then push.

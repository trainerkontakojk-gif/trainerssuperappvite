# D5.1 service_role-only allowlist reconciliation

Lane D (security/RLS guard). Local-only; production untouched.

## Requirement

`apps/web/e2e/exposed-function-guard-api.spec.ts` (project `db-guard-real-backend`) failed 3 of 4 tests after `supabase db reset --local` on 2026-11-03: D5.1 found 13 `public` functions revoked from anon and authenticated that were not in `SERVICE_ROLE_ONLY_BY_DESIGN`, and Group A/B stopped at the same precondition. Per `docs/architecture.md` "Batas snapshot D5.1", every such function must be allowlisted with a reason backed by a denial matrix, or switched to the in-function guard pattern.

## Design

- Live catalog (read-only query on local Postgres): 30 functions revoked from both client roles, plus the authenticated-only PDKT reply RPC. The 17 existing allowlist signatures still match exactly; 13 are new: `append_ketik_session_message`, `claim_ketik_session_response`, `fail_ketik_session_response`, `settle_ketik_session_response`, `consume_practice_quota`, `refund_practice_quota`, `practice_quota_status`, `resolve_practice_limit`, `practice_today_summary`, `monitoring_sessions_page`, `link_profiler_peserta_account`, `revoke_user_sessions`, `retire_telefun_openai_scoring`.
- Every migration that creates them revokes EXECUTE from anon/authenticated and grants only service_role, and every caller is an `apps/api` service, so they are service_role-only by design: allowlist, not in-function guard.
- Existing module specs proved a 42501 denial for only some of them (KETIK session, Telefun retirement; practice quota only asserted "some error"; five had none). Add one D5.9 test in the guard spec that calls every allowlist entry through PostgREST as anon and as an authenticated admin JWT, requiring `42501 permission denied for function …`, a live sentinel connection, and unchanged row counts. New allowlist entries are covered automatically.
- Unmasking Group B showed both legacy PDKT reply wrappers now return `42501 Unauthorized` (401) instead of `P0001`, because the reply-attribution migration made them delegate to `submit_pdkt_mailbox_reply_with_subject`. Anon is still denied; update the expectation for those two wrappers only.

## Tasklist

- [x] RED: run `db-guard-real-backend`, record the 13 unexpected signatures.
- [x] Add the 13 exact signatures in catalog order; document the owners.
- [x] Add D5.9 denial matrix; extend side-effect tables with KETIK session/review/assignment and `practice_usage`.
- [x] Update Group B for the delegated reply wrappers.
- [x] GREEN: project passes 5/5.
- [x] Update `docs/architecture.md` count and CHANGELOG.

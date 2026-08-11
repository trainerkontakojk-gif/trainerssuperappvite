# Phase 6 — WebRTC paid-smoke connect repair execution

- Date: 2026-08-10
- Repair base: `8e9fdc3621f0f812f5a655e4935b2dd736b5b27f`
- Execution branch at checkpoint: `main`
- Provider calls: `0`
- Remote database mutations: `true` — authorized production Supabase, scoped to Telefun OpenAI WebRTC
- Application deployments: `0`

## Verdict

The browser-side SDP repair is reproducible and provider-free on the frozen
candidate. The hosted Phase 5 database subgate is now complete on the canonical
production database after explicit operator authorization, but Phase 6 remains
**NO-GO** for staging application deployment and paid smoke.

The strongest validated trigger is the pre-`8e9fdc3` browser code that called
`.trim()` on the SDP answer and removed its terminal `CRLF`. The candidate
canonicalizer in `brokerApi.ts` preserves canonical line endings and exactly
one terminal `CRLF`. Chromium 148 rejected the old form 10/10 and accepted the
candidate form 10/10. This proves the source regression and repair; it does not
prove which unversioned Web artifact handled the historical failed calls.

The previous server evidence remains unchanged: OpenAI call creation returned
201 and reached `sideband_connected`, then the first server finalizer was an
authenticated browser DELETE with failed outcome. That confirms the cleanup
boundary, not the exact historical browser stage.

## Scoped implementation

- Added `apps/web/scripts/verify-openai-webrtc-sdp-chromium.mjs`.
- Added the `test:webrtc-sdp-chromium` package command.
- The probe imports the actual candidate `brokerApi.ts` through Vite SSR and
  refuses to run if its worktree blob differs from `HEAD`.
- Chromium runs offline with every browser request aborted. The broker response
  is an in-process fake; raw SDP, bearer values, prompts, URLs, and exceptions
  are not persisted.
- Malformed CLI invocations also persist sanitized failure evidence when a
  valid `--output` path was supplied.
- No application runtime, Railway deployment, environment variable, rollout
  flag, Gemini path, legacy OpenAI path, or provider behavior was changed.
- The separately authorized production database operation was limited to stale
  OpenAI WebRTC lifecycle reconciliation and an atomic Phase 5
  rollback/reapply proof. It did not enable WebRTC or make a provider call.

## Candidate-linked verification

| Gate                                    | Result                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| Focused WebRTC client                   | PASS — 69/69                                                                  |
| Phase 6 Telefun WebRTC/lifecycle matrix | PASS — 142/142                                                                |
| Phase 6 API matrix                      | PASS — 52/52                                                                  |
| Phase 6 Web matrix                      | PASS — 123/123                                                                |
| Telefun Gemini/legacy OpenAI regression | PASS — 168/168                                                                |
| Web legacy/live lifecycle regression    | PASS — 70/70                                                                  |
| `test:core`                             | PASS — API 143, Telefun 391, Web 151; total 685                               |
| Typecheck                               | PASS — 4/4 tasks                                                              |
| Lint                                    | PASS — existing warnings only; probe clean                                    |
| Build                                   | PASS — 3/3 tasks                                                              |
| Chromium SDP probe                      | PASS — old trim rejected 10/10; candidate accepted 10/10; outbound requests 0 |
| Thermo-nuclear maintainability review   | PASS after the malformed-CLI evidence fix; no P0/P1/P2                        |
| `test:full`                             | PASS — 4/4 root tasks; Web 146/146 files and 1,262/1,262 tests                |

The original concurrent root runs failed on varying unrelated Web files at the
unchanged 5-second per-test timeout. Every failed file passed independently, and
the final remaining test took 4.157 seconds by itself. The Web Vitest pool is now
bounded to one worker on this 4-core/8-GB host. The canonical root gate then
passed without increasing any timeout, skipping tests, or weakening assertions.

## Authorized production database execution

Fajar confirmed that this project has no staging database and explicitly
authorized the canonical production Supabase database as the target, provided
the operation remained isolated from other database domains and the Telefun
Gemini path. A read-only preflight and private backup were completed before any
write.

- Target: linked Supabase project `ruosnjmtywcrghjgqugz`.
- Initial WebRTC state: 10 histories, including five stale active histories;
  six attempts, including one stale `claimed/pending` attempt and one old
  terminal `orphaned` attempt; five leases; and six usage attempts requiring
  audit confirmation.
- Reconciliation: four attempt-less histories were finalized as failed; the
  stale claimed attempt was finalized through the canonical Phase 5 RPCs; the
  old orphan attempt/lease was mapped to the Phase 4-compatible failed state;
  and the one missing failed usage-audit row was inserted.
- Rollback proof: the canonical Phase 5 rollback and migration bodies were run
  back-to-back in one PostgreSQL transaction under an advisory lock. Lease,
  rate-limit, metric, attempt-column, RLS, function-grant, and migration-history
  assertions passed before commit. External sessions never observed an
  intermediate schema because PostgreSQL transactional DDL committed atomically.
- Final WebRTC state: all 10 histories failed and inactive; all six attempts
  `ended/failed`; all six incomplete attempts have matching failed OpenAI usage
  audit rows; five leases are `released/failed`; no active/cleanup lease,
  nonterminal attempt, or Phase-5-only outcome remains.
- Security: RLS is enabled on all three Phase 5 tables; public, `anon`, and
  `authenticated` have no DML/EXECUTE access; `service_role` retains the required
  table and 10-function access.
- Migration state: local and remote migration histories are synchronized through
  `20260810130000`; the Phase 5 migration-history row exists exactly once.
- Gemini boundary: before/after values remained exactly 47 non-WebRTC histories,
  four active/pending histories, latest history
  `2026-08-10T01:35:50.243204+00`, 854 Gemini usage rows, and latest Gemini usage
  `2026-08-03T08:25:43.485655+00`.
- Final verification completed at `2026-08-10T23:49:47Z`; provider calls stayed
  at zero.

Private database-state evidence was retained outside the repository with mode
`0600`:

| Snapshot             | Private path                                                                             | SHA-256                                                            |
| -------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Before writes        | `~/.hermes/backups/trainerssuperappvite/telefun-webrtc-production-20260810T233513Z.json` | `b905b1225bb184c20d78438340db2859dc1323836183fa11137f436245efd93b` |
| After reconciliation | `~/.hermes/backups/trainerssuperappvite/telefun-webrtc-production-20260810T234113Z.json` | `c29127ed51495c6cf2c74bf44104c4ce85451a8d10884c2a831e9fb69b3b271c` |

## Hosted readiness audit

Read-only inspection plus the authorized database operation found:

- the hosted database contains the Phase 4, Phase 5, prompt-parity, and
  recording-status migrations;
- all five WebRTC tables have RLS enabled, no effective
  public/anon/authenticated table privileges, and service-role DML;
- all 22 Phase 4/5 WebRTC functions deny public/anon/authenticated execution
  and allow service-role execution;
- the stale OpenAI WebRTC lifecycle state is drained and reconciled, and the
  canonical Phase 5 rollback/reapply proof committed successfully;
- the measured Gemini/non-WebRTC aggregate counts and latest timestamps remained
  exactly unchanged;
- project-wide security advisors are not fully clean; a non-WebRTC
  security-definer-view error remains;
- Railway staging has zero active/latest deployments for Web, API, and Telefun;
  Web/API health checks timed out and Telefun returned HTTP 404;
- no staging artifact can be linked to the candidate SHA, so a provider-free
  real-browser staging path cannot be executed;
- the staging Web service variable-name inventory includes a service-role key
  name. Its value was not read and no exposure was claimed, but configuration
  ownership must verify/remove it before a public Web deployment.

The remaining application/deployment conditions block candidate staging rollout
and any paid provider validation. They no longer block the hosted Phase 5
database rollback drill.

## Plan disposition

| Task                            | Status                                                       |
| ------------------------------- | ------------------------------------------------------------ |
| 1 — freeze candidate            | COMPLETE; local-only SHA, not deployed parity                |
| 2 — source regression proof     | COMPLETE; reproducible provider-free artifact                |
| 3 — proportional local gates    | COMPLETE; scoped gates and canonical `test:full` pass        |
| 4 — hosted readiness            | COMPLETE for DB: reconciliation + rollback/reapply committed |
| 5 — staging deploy              | NOT RUN; staging services and immutable parity still absent  |
| 6 — cohort + paid authorization | EXCLUDED by operator for this execution                      |
| 7 — exactly one paid smoke      | EXCLUDED; provider calls remain zero                         |
| 8 — final review                | COMPLETE with Phase 6 NO-GO                                  |

## Required operator sequence

The database prerequisite is complete. Remaining operator sequence:

1. Review the Web service secret-name inventory and prove that no backend-only
   service-role value can reach a public build.
2. Deploy the exact candidate SHA to Web, API, and Telefun staging with both
   WebRTC flags false; record immutable artifact/deployment parity and HTTP 200
   service health.
3. Run the authenticated provider-free browser staging path and verify exact
   origin, matching API/Telefun allowlists, lease timing, and capability gates.
4. Only after those gates pass, provide the canonical one-user cohort and
   time-bounded paid authorization with one call, zero retries, positive USD
   budget, spend control, and an 80% abort threshold.

Production application runtime remains untouched; only the scoped database
operation above was authorized and performed. A future paid failure must stop
after the first call and requires new authorization before any retry.

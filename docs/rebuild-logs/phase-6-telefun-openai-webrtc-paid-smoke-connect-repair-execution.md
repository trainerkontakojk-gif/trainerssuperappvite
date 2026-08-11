# Phase 6 — WebRTC paid-smoke connect repair execution

- Initial execution date: 2026-08-10
- Staging follow-up: 2026-08-11
- Repair base: `8e9fdc3621f0f812f5a655e4935b2dd736b5b27f`
- Deployed staging candidate: `2b2545ba90e8d1e50913236c7353729f4ef8ed65`
- Candidate branch: `candidate/telefun-webrtc-phase6-20260811`
- Provider calls: `0`
- Remote database mutations: `true` on 2026-08-10 only — authorized production Supabase, scoped to Telefun OpenAI WebRTC
- Application deployments: `3` staging, `0` production

## Verdict

The browser-side SDP repair is reproducible locally and the exact candidate was
deployed successfully to Web/API/Telefun staging with WebRTC flags off. The
hosted Phase 5 database subgate, staging health, provider-free browser/HTTP
checks, origin/allowlist boundary, and public-bundle secret scan pass. Phase 6
remains **NO-GO for enabling WebRTC or paid smoke** because no authenticated
staging session, full kill-switch/restart evidence, or paid authorization was
provided.

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
- The 2026-08-10 source/database step did not deploy an application, change a
  Railway environment variable, enable rollout, alter Gemini/legacy OpenAI, or
  make a provider call.
- The 2026-08-11 follow-up changed only the two staging WebRTC POC flags to
  `false`, temporarily bypassed and then restored staging watch patterns, and
  deployed the candidate to staging. It made no database mutation or provider
  call.
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

## Hosted readiness audit — 2026-08-10 pre-staging checkpoint

The initial read-only inspection plus the authorized database operation found:

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
- at the initial checkpoint, Railway staging had zero active/latest deployments
  for Web, API, and Telefun; Web/API health checks timed out and Telefun returned
  HTTP 404;
- no staging artifact was linked to the candidate SHA at that checkpoint, so a
  provider-free real-browser staging path could not run;
- the staging Web service variable-name inventory included backend-only secret
  names. The follow-up scan below later proved their exact values and names were
  absent from the deployed public bundle.

Those application conditions blocked staging at the 2026-08-10 checkpoint only.
The hosted Phase 5 database rollback drill was already complete.

## Staging deployment follow-up — 2026-08-11

Fajar then authorized a staging-only, flags-off application deployment with no
paid/provider call, production application deployment, production database
mutation, or Gemini change.

### Candidate provenance

- Branch: `candidate/telefun-webrtc-phase6-20260811`.
- Deployed candidate: `2b2545ba90e8d1e50913236c7353729f4ef8ed65`.
- Remote branch SHA matched the clean detached upload worktree SHA.
- The candidate-linked Chromium gate passed again: canonical SDP 10/10 accepted,
  legacy trimmed SDP 10/10 rejected, outbound network blocked, provider calls 0.
- Railway local uploads report `commitHash=null` and `branch=null`; the
  provenance chain is therefore the clean worktree, remote SHA parity, exact-SHA
  CLI message, deployment IDs, and image digests, not independent Railway Git
  attestation.

### Deployments

| Service             | Deployment ID                          | Status  | Image digest                                                              |
| ------------------- | -------------------------------------- | ------- | ------------------------------------------------------------------------- |
| `@trainers/web`     | `1ff6807a-721b-4a11-8be9-a6c141c7659e` | SUCCESS | `sha256:a6d45c018a80fce607d905c30755cd816792a8c0e749b392da348f2924cc489b` |
| `@trainers/api`     | `d747d8a4-e69c-4b4b-b676-e7e9d7c4d5b8` | SUCCESS | `sha256:31a4a5fadca797e7725cfb924673c432f6f24f921fae3e092eba95aefbe4d02e` |
| `@trainers/telefun` | `971ac812-cc90-4f4b-b41d-6b3527d89634` | SUCCESS | `sha256:c167eb06031cce87a96ba8f0a9f9944244cb58a1e33d455bae2cfe5878ee9433` |

The first API/Telefun uploads were skipped because the candidate did not change
their watched source paths. Their **staging-only** watch patterns were cleared,
the same clean candidate was uploaded, and the exact original patterns
`/apps/api/**` and `/apps/telefun/**` were restored immediately. All three
service manifests had `preDeployCommand=null`; no migration ran.

### Provider-free gates

| Gate                                  | Result                                                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------- |
| Web root                              | HTTP 200                                                                                |
| API `/api/health`                     | HTTP 200, `status=ok`                                                                   |
| Telefun `/health`                     | HTTP 200; Gemini and legacy OpenAI configured/ready                                     |
| WebRTC POC flags                      | `false` on API and Telefun                                                              |
| Origin/allowlist/internal boundary    | exact staging origin; allowlists equal; internal tokens equal without persisting values |
| Broker POST while off                 | HTTP 404 before auth/provider                                                           |
| Broker POST preflight while off       | HTTP 404                                                                                |
| Broker DELETE cleanup preflight       | HTTP 204 with exact staging origin                                                      |
| Broker DELETE without authentication  | HTTP 401; no lifecycle/provider action                                                  |
| API capability without authentication | HTTP 401                                                                                |
| Chromium staging landing              | PASS; no console/page/request failure and no AI-provider request                        |
| Public Web bundle secret scan         | PASS; 145 files, 5,338,019 bytes; configured backend secret values absent               |

The authenticated capability/UI path was not exercised because no staging auth
session was available. This is a documented remaining gate, not a hidden pass.

### Database/provider boundary after staging

Read-only verification at `2026-08-11T02:06:22Z` found the WebRTC lifecycle
unchanged: 10 failed histories, six ended/failed attempts, five released/failed
leases, and zero active/cleanup/Phase-5-only state. OpenAI WebRTC usage had six
failed audit rows, zero success rows, and latest creation
`2026-08-10T23:39:00Z`, before staging deployment.

Gemini usage was 857 with latest creation `2026-08-11T01:15:10Z`; non-WebRTC
history latest creation remained `2026-08-10T01:35:50Z`. Both timestamps precede
the first staging deployment at `2026-08-11T01:52:24Z`. The three-row increase
from the historical 854 baseline occurred before deployment and is not
attributed to this staging verification.

Private consolidated evidence, mode `0600`:

- `~/.hermes/backups/trainerssuperappvite/telefun-webrtc-staging-20260811T021115Z.json`
- SHA-256 `01a015df9393032417864c34db2c3b20b9afbd2ca6d5e109ae64ee8223635c39`

Provider calls remained `0`, paid smoke remained unrun, and production
application/runtime remained untouched.

## Plan disposition

| Task                            | Status                                                                     |
| ------------------------------- | -------------------------------------------------------------------------- |
| 1 — freeze candidate            | COMPLETE; branch pushed, SHA `2b2545b`                                     |
| 2 — source regression proof     | COMPLETE; reproducible provider-free artifact                              |
| 3 — proportional local gates    | COMPLETE; scoped gates and canonical `test:full` pass                      |
| 4 — hosted readiness            | COMPLETE for DB: reconciliation + rollback/reapply committed               |
| 5 — staging deploy              | COMPLETE; Web/API/Telefun SUCCESS, flags off, provider-free gates pass     |
| 6 — authenticated staged path   | PARTIAL; unauthenticated landing/HTTP pass, no valid staging auth session  |
| 7 — cohort + paid authorization | EXCLUDED; no authorization/budget                                          |
| 8 — exactly one paid smoke      | EXCLUDED; provider calls remain zero                                       |
| 9 — final review                | Staging provider-free GO; WebRTC enablement/paid runtime remains **NO-GO** |

## Required operator sequence

The database, candidate freeze, staging deploy, health, public-bundle boundary,
and unauthenticated provider-free gates are complete. Remaining operator
sequence:

1. Obtain a valid staging trainer/admin auth session and run the authenticated
   capability/UI path with both WebRTC flags still false and provider hosts
   blocked.
2. Add independent build/runtime SHA attestation if Railway-native commit parity
   is a release requirement; do not infer it from `commitHash=null`.
3. Run the full kill-switch/restart and cross-replica drill without provider
   calls, then repeat Gemini/legacy regression.
4. Only after those gates pass, provide the canonical one-user cohort and
   time-bounded paid authorization with one call, zero retries, positive USD
   budget, spend control, and an 80% abort threshold.

Production application runtime remains untouched. The 2026-08-11 post-deploy
database operations were read-only. A future paid failure must stop after the
first call and requires new authorization before any retry.

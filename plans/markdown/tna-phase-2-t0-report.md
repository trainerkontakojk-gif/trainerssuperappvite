# TNA Phase 2 — T0 prerequisite discovery

## IMPLEMENTATION REPORT / STATUS: complete

**OBJECTIVE:** Read-only discovery for T0 of `plans/markdown/tna-phase-2.md`; verify requirements against live source, E2E isolation, Phase 1 transition/trigger compatibility, SIDAK metric reuse, and all live type consumers. No Phase 2 implementation or approval inferred.

**CHANGES:** Created only this report and `.pi/orchestrator/tna-phase-2/t0.md`. No product, test, config, migration, plan, or instruction files changed. No tests, dev servers, DB, migration, remote access, or external research used. Current branch/baseline: `main` at `ed1c2222da16f1b21be00244b0efb2b33d9845af`. Initial `git status --short` showed only pre-existing untracked `.impeccable/`, `mockups/`, and `plans/markdown/tna-phase-2.md`; preserved them.

## Findings and evidence

### Requirement fact checks

| Phase 2 statement | Live-source evidence | Finding |
| --- | --- | --- |
| QA periods are monthly | `packages/types/src/sidak.ts` period schema; TNA source fetches `qa_periods(id, month, year)` in `apps/api/src/services/tna/metrics.ts:75-86`; month/year ordering is explicit. | Verified: monthly periods, not a daily interval. |
| `evaluasi` and `selesai` exist in status CHECK but Phase 1 transitions do not allow them | `supabase/migrations/20261008120000_tna_phase1.sql:47-52` CHECK includes all five states; `:136-139` allows only `draft→aktif/dibatalkan` and `aktif→dibatalkan`; cancel RPC at `:325-335` accepts only draft/aktif. | Verified. Phase 2 needs constraint-preserving trigger/function replacement, not a new status CHECK. |
| Baseline participants have findings/affected flag but no session count | Migration `:56-63`; shared participant schema `packages/types/src/tna.ts:183-194`; `computeTnaBaseline()` in `apps/api/src/services/tna/baseline.ts:27-55` creates findings and affected only. | Verified. `baseline_sessions` is absent. |
| Completed still matches the open-need unique index | Migration `:53`: partial unique index predicate is `status <> 'dibatalkan'`. | Verified. Under the proposed K15 path, a second plan cannot be added to the same need without changing the index; K15’s revalidation/new-need route avoids that. S13 is not triggered by the recommended path, but a contract worker must preserve this boundary. |
| Shared metric path computes sampled sessions with the existing per-agent floor and accepts scope | `apps/api/src/services/tna/metrics.ts:147-191` groups by participant, excludes non-service agents, calls `getScoreRows()`, obtains session IDs via shared `getTemuanSessionKey()`, and sums `Math.max(MAX_SAMPLING, sessions.size)`. Fetches use `fetchAllPages`, `order("id")`, and `applyPesertaScope` at `:94-116`. `analysis.ts:11-50` returns metrics plus finding rows. | Verified. No replacement formula is needed for population/cohort computations. See S10 below for the per-agent projection approach and its limit. |

Other key invariants: Phase 1’s baseline snapshot is created from authenticated-JWT reads, then sent only through `supabaseAdmin.rpc` for mutation (`apps/api/src/services/tna/write-service.ts:135-160`); the module labels this the sole service-role write boundary (`:19`). `docs/SIDAK_SCORING_GUARDRAILS.md` §3 requires audit-presence, score, and findings buckets; TNA uses corresponding existing helpers and excludes phantom rows from findings (`metrics.ts:166-210`).

### Phase 1 activation/cancel/trigger compatibility map

- **Activation:** `tna_activate_plan(uuid,uuid,timestamptz,jsonb,jsonb)` at migration `:282-323` verifies actor/plan revision, baseline, targets, exact participant-roster match; transitions draft→active and writes participant baseline values atomically. Participant writes are protected by `tna_internal.guard_participant()` (`:162-196`) and the transaction-local `tna.activating_plan` marker (`:313-321`). Phase 2’s `baseline_sessions` extension must remain inside this atomic transition and preserve the existing five-argument signature if using `CREATE OR REPLACE` as D11 specifies. Avoid weakening the marker or adding a direct participant write path.
- **Cancellation:** `tna_cancel_plan(uuid,uuid,timestamptz)` at `:325-335`; current web API sends only `expected_updated_at` (`apps/api/src/routes/tna.ts:365-380`, `apps/api/src/services/tna/write-service.ts:166-180`). Existing E2E covers draft cancel, active cancel preserving the frozen baseline, invalid follow-on transitions and activate/cancel concurrency (`apps/web/e2e/tna-plan-api.spec.ts:446-518`). K16 adds a reason for active/evaluating cancellation. Because PostgreSQL cannot `CREATE OR REPLACE` a function with a changed argument signature, the contract owner must decide the safe RPC signature/overload strategy and ensure any retained legacy signature cannot bypass the new reason requirement. Keep the service-role guard first in each public entry point; never use `REVOKE EXECUTE` on exposed public functions.
- **Status trigger:** `tna_internal.guard_plan()` in migration `:116-160` currently rejects transitions beyond Phase 1. It enforces identity/baseline immutability, draft-only editable plan fields, cancel timestamp semantics and revision updates. `guard_participant()` (`:162-196`) rejects writes outside draft except baseline fill and actual FK cleanup. Phase 2 needs targeted allowed transitions and evaluation-column/participant-column immutability while preserving all current checks and finality of `selesai`.
- **Compatibility assessment:** schema keeps the Phase 2 lifecycle statuses in the existing CHECK and Phase 2 columns are specified nullable, which is compatible with extant `aktif`/`dibatalkan` rows at schema-shape level. `CREATE OR REPLACE` with unchanged activation signature is structurally compatible. This is not proof of actual production data/runtime compatibility: no remote inspection is authorized. `docs/database.md:327` records Phase 1 migration applied in production and says its guard was not exercised there. Phase 2 plan explicitly requires Fajar authorization for any production migration (`tna-phase-2.md:177-181`). No `tna`-named Phase 1 rollback file exists under `supabase/rollbacks`; do not imply rollback is already available.

### Browser E2E isolation — S12

Static implementation evidence supports the planned **hermetic browser** path:

- Default browser config (`apps/web/playwright.config.ts:35-45`) starts only Vite (`pnpm --filter @trainers/web dev --host 127.0.0.1 --strictPort`), passes `E2E_WEB_SERVER_ENV`, uses `reuseExistingServer: false`, and excludes API specs (`:11-14`). Access-web config has the same no-reuse/E2E-env arrangement (`apps/web/playwright.access-web.config.ts:22-27`).
- `apps/web/e2e/helpers/e2eTargets.ts:10-23` pins Supabase and Telefun to `127.0.0.1:9`, uses a placeholder anon key, app origin localhost:3005, and empty API URL (Vite proxy path); no backend or Telefun server is launched. `apps/web/vite.config.ts:20-24` proxies `/api` only to `http://localhost:3001`.
- `e2e-target-isolation.spec.ts:34-47` inspects Vite-inlined env; `:49-96` forces a session refresh and aborts off-machine HTTP(S)/WS(S) requests while asserting no Supabase/Railway egress. `tna-flow.spec.ts:13` runs `assertLocalDevOnlyTarget()`; it waits for required API mocks before `expectHermetic()` at e.g. `:110-118`, and the shared `hermeticShell.ts:154-218` fulfills only allowlisted app APIs/auth and aborts unhandled/external requests. The E2E policy requires this order (`docs/e2e-testing.md`, “Hermetic harness rules”).
- **S12 judgment:** not triggered by source inspection: configured browser path is isolated from hosted Supabase and refuses existing server reuse. This is static/config-plus-existing-test evidence, not a fresh runtime execution; T0 constraints prohibited running browser E2E. The real-backend API project is separate and must additionally use its existing loopback/env pin/fetch guards (`playwright.api.config.ts:3-9,17-28`; `docs/e2e-testing.md`, “Real-backend specs”). No claim is made about arbitrary scripts or a developer manually bypassing these configs.

### S10 — cohort/session reuse

**Not triggered, with implementation caveat.** `buildPeriodBucket(period, rows)` returns participant IDs, source rows and existing aggregate `sampledSessions`; `periodMetrics(bucket, indicatorId)` applies the established count/rate/spread/no-audit semantics (`metrics.ts:147-230`). The raw bucket rows retain `peserta_id`, `profiler_peserta`, `no_tiket`, `created_at`, and phantom marker. A new cohort can filter the already fetched period rows by participant membership, then call the same bucket/metric functions; per-participant sessions can likewise be obtained from a single-agent subset. This reuses `getScoreRows`, `getTemuanSessionKey`, `MAX_SAMPLING`, `isAgentExcluded`, and `isCountableFinding` rather than restating the session/rate formula. It is feasible without modifying D1 formulas.

Caveat for next contract owner: bucket API currently returns only aggregate session count, not a per-agent session map. Specify a minimal pure projection/helper or single-agent bucket reuse, retain original row order for fallback session keys, and test mixed real+phantom, phantom-only, non-service, and absent-audit cases. There is no current persisted cohort implementation or tested Phase 2 metric result; discovery only establishes a viable source-level path.

### All live `TnaPlanDetail` / `TnaPlanStatus` consumers

`rg -n 'TnaPlanDetail|TnaPlanStatus' --glob '!**/node_modules/**' --glob '!plans/markdown/tna-phase-2.md' .` returned these live consumers:

- `packages/types/src/tna.ts:49,180,233`: status union/schema, `TnaPlan.status`, and detail response shape.
- `apps/api/src/services/tna/read-service.ts:9-10,78-80,123-126`: imports status/detail types; list filter and detail return.
- `apps/api/src/routes/tna.ts:317-328`: detail endpoint consumes the service response (and status query for list at `:304-315`).
- `apps/web/src/routes/tna/plan.tsx:5,28-30,51-56`: detail fetch and page consumer.
- `apps/web/src/routes/tna/utils.ts:2,15-21`: exhaustive typed status-label map.
- `apps/web/e2e/helpers/tnaHarness.ts:7,124-154`: typed hermetic detail fixture.
- `apps/web/e2e/tna-plan-api.spec.ts:7,27`: detail typing/extension in real-backend flow coverage.

Related status display/list callers (not direct `TnaPlanDetail` type imports) are `apps/web/src/routes/tna/index.tsx:227-235` and `need.tsx:120-132`, both using `planStatusLabels`; new union values must keep this exhaustive map current. `TnaPlan` itself is also used in `apps/web/e2e/tna-plan-api.spec.ts` and harness as returned by the same `rg` query context.

### Recommended next-contract ownership/interface inventory

This is a handoff proposal, not an approved plan or implementation assignment. Keep K9–K16 unresolved pending Fajar. Phase 2 overall remains Lane D; missing prerequisite skill `supabase-migration` was checked at `/Users/nadindyta/.pi/agent/skills/supabase-migration/SKILL.md` and is absent here (do not invent or substitute it).

| Owner boundary | Recommended interface/ownership for contract worker |
| --- | --- |
| `packages/types/src/tna.ts` | Own strict new schemas/types for evaluation state/snapshot/cohorts, evaluation actions and cancellation reason; reject client-supplied metrics/snapshots/verdict. Extend plan/detail/list response types and keep status/verdict/follow-up label maps exhaustive. |
| `apps/api/src/services/tna/metrics.ts` + proposed `cohorts.ts` | Keep the existing period/bucket as the only authority for sessions/findings/rate/spread. Define cohort membership/input and outputs; do not duplicate bucket logic. Make per-agent sampled-session access explicit while preserving D1 output. |
| `baseline.ts` / `write-service.ts` / public SQL RPC | Carry optional baseline session values only through draft→active transaction; maintain current snapshot, participant matching, row locks, optimistic revision, actor checks, and guard-first service-role security. Define cancel reason RPC compatibility before coding. |
| Migration + rollback (`supabase/migrations`, `supabase/rollbacks`) | Nullable additive columns, existing status/index intact, narrow trigger replacement, evaluation RPCs and indexes. Preserve public function argument/signature strategy and internal schema boundary; no `REVOKE EXECUTE`; provide guarded rollback per plan. First reconcile production migration claim via existing docs with Fajar; do not access remote in discovery. |
| `read-service.ts` / `routes/tna.ts` / `errors.ts` | Own due filter + response enrichment, period choices, live evaluation preview/frozen completion, status/error mapping, and user-JWT reads. Mutations use only service write boundary and `tna.write`; retain activity logging. |
| `apps/web/src/routes/tna/index.tsx`, `plan.tsx`, `utils.ts`, `tnaHarness.ts` | Own due queue, evaluation detail/preview/complete/cancel UX, responsive cohort/member presentation, status/verdict/follow-up labels and hermetic fixtures/spec. Route compatibility with existing `/tna/rencana/$id`; no MobileTabBar scope creep. |
| `apps/web/e2e` API configs/specs | API/DB invariants go through real-backend loopback projects and fetch guards; UI flow through browser default hermetic config. Tests must be RED-first under approved Lane D contract and never run against hosted services. |
| Canonical docs and reports | T6 owns `docs/{modules,database,auth-rbac,README}.md` synchronization; each task owns its report. Keep the main plan decision/status untouched until an authorized integration owner updates it. |

## K9–K16 decision ledger (all explicitly pending)

No decision/approval was discovered or inferred. Compact recommendations from the draft only:

- **K9 pending:** one monthly QA period strictly after plan `end_date`; default first eligible period with service audit.
- **K10 pending:** start only on/after `evaluation_due_date` using WIB; earlier request rejected server-side.
- **K11 pending:** select period on entry, compute live preview during `evaluasi`, freeze on completion.
- **K12 pending:** cohort baseline recomputation with drift label, verdict against frozen population snapshot; persist `baseline_sessions` prospectively at activation.
- **K13 pending:** nonparticipant agents for same service audited in both periods and not excluded; fewer than five means comparison/effect suppressed and marked too small.
- **K14 pending:** deterministic verdict from population rate and spread vs both targets; no-audit cannot complete; insufficient data remains caveated.
- **K15 pending:** required conclusion/follow-up; revalidation creates a new need linked to completed predecessor, preserving existing open-need unique index.
- **K16 pending:** reasoned cancel for active/evaluating; keep current admin/trainer `tna.write` capability.

## STOP conditions S10–S12

- **S10 — not triggered by static source evidence:** supported by existing reusable bucket/row/session helpers, above. Runtime behavior and cohort outputs remain unverified; future tests required before implementation is accepted.
- **S11 — no structural incompatibility found; runtime compatibility remains unproven:** existing status rows/checks/signatures permit an additive nullable migration and same-signature activation replacement. Production contains Phase 1 per `docs/database.md:327`, but T0 cannot inspect it. A reason-bearing cancel may require a new/overloaded RPC signature; ensure old entrypoint cannot bypass reason or stop for Fajar if safe coexistence cannot be guaranteed. No production data/state claim is made.
- **S12 — not triggered by static config/spec inspection:** browser configs are web-only, explicitly isolated, fail on reused listener; current network guard/spec verifies bundle env and refresh egress. No browser test was run, so runtime evidence was not freshly reproduced.

No S10–S12 finding requires stopping this read-only T0. This is not authorization to start T1 or any later task. Phase 2 plan status stays untouched and its K9–K16 remain pending.

## Verification record

Read-only commands actually run (all exited 0 unless noted):

- `git status --short` — exit 0; baseline dirty paths recorded above.
- `git rev-parse HEAD; git branch --show-current` — exit 0; baseline SHA and `main` recorded above.
- `rg --files ...` inventory and targeted `rg -n` symbol/caller/config/schema searches — exit 0; paths and line evidence cited throughout.
- `nl -ba ... | sed -n ...` source/config/report excerpts — exit 0; cited line ranges above.
- `find supabase/rollbacks -maxdepth 1 -type f -name '*tna*' -print` — exit 0, no TNA-named rollback found.
- Skill presence check for `supabase-migration` — absent at expected installed path.
- `git diff --check` — see final command result recorded in handoff; it checks tracked diff only (new reports are untracked until staging). No stage was performed.

No E2E, non-E2E tests, typecheck, lint, build, migrations, dev servers, DB operations or remote calls were run. Static inspection cannot establish current production schema/data, database health, deployed function bodies/grants, or E2E runtime behavior.

## GAPS

1. All K9–K16 decisions remain unresolved; no contract hash exists and implementation must not begin from this discovery alone.
2. Phase 1 production statements rely on existing documentation/reports, not new remote inspection. The local crash investigation says T1 remains blocked pending operator decision; do not perform/repeat RPC crash probes. Production guard safety is not proven by a successful production call (none permitted).
3. No Phase 2 cohort runtime spec exists or was run. The reusable bucket path is a static feasibility finding only.
4. Cancellation RPC signature/backward-compatibility and the missing installed `supabase-migration` skill require explicit contract/workflow resolution before T1.
5. This report and handoff are discovery completion only, not Phase 2 implementation approval or completion.

---

## IMPLEMENTATION REPORT / STATUS: complete

**OBJECTIVE:** Complete T0 prerequisite discovery only.

**CHANGES:** Added only this report and `.pi/orchestrator/tna-phase-2/t0.md`; product implementation remains untouched.

**VERIFIED:** Static requirement/source cross-check, E2E config/helper guard inspection, activation/cancel/trigger inventory, metric reuse feasibility, consumer search, K9–K16 pending ledger, and S10–S12 disposition. `git diff --check` exit 0 after report creation; final `git status --short` is recorded in handoff.

**JUDGMENT CALLS:** S10 and S12 not triggered by static evidence; S11 has no structural incompatibility found but production compatibility is not verified. T0 completion does not authorize T1.

**GAPS:** No tests/runtime/browser/DB/remote checks. Cohort behavior, live production state and health, Phase 1 deployment behavior, and cancel RPC compatibility remain unverified or unresolved as described above.

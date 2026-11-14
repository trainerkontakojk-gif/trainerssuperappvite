# Enable verified Hydrogen audio and safe annotation errors

Lane D: model eligibility and API error contract. User authorized enabling Hydrogen for Telefun and repairing error handling. Prior real Hydrogen evidence verified transcription/assessment/coaching and the repaired replay annotation request; no further paid calls are needed.

## Requirement

- Offer Hydrogen in Telefun assessment model policy alongside Gemini 3.8 Flash, preserving code defaults and the Gemini Live consumer model.
- Do not expose database error details from annotation list/create/delete/generation endpoints.
- Preserve unrelated work; no production database/policy mutation or migration is needed.

## Design

- Set supportsAudioInput on the canonical Hydrogen model registry; eligibility and Monitoring options derive from the existing shared contract.
- Remove candidate capability overrides from local regression and opt-in diagnostics now that production registry declares support.
- Replace annotation route database catch messages with static Indonesian messages while retaining error codes/statuses and server diagnostics for generation errors.
- Real local JWT/Hono/Postgres E2E verifies available options and selected Hydrogen usage; inject a PostgREST error response to exercise error rendering for all four annotation operations without damaging the database. Provider fixtures block paid egress.
- Graphify resolved annotation schema owner; existing policy filter and registry inspected. No new external API/library contract: reuse previously verified Gemini contract and existing Supabase API.

## Tasklist

- [x] RED E2E: Hydrogen eligible without worker overrides; four database failures do not leak details.
- [x] Enable registry and repair messages; GREEN E2E.
- [x] Scoped review, typecheck/lint/build, graph update, documentation and changelog.
- [x] Prepare main integration and preserve unrelated plans; commit/push and deployment results are reported from Git/Railway after integration.

## Evidence and review

- RED: `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --project telefun-annotations-real-backend --project monitoring-models-real-backend -g 'friendly annotation error|Hydrogen is additive' --reporter=line --workers=1` — exit 1, five expected failures: four raw database messages and missing Hydrogen eligibility.
- GREEN: `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --project telefun-annotations-real-backend --project monitoring-models-real-backend --project telefun-scoring-real-backend --project telefun-hydrogen-audio-real-backend --reporter=line --workers=1` — exit 0, 42 passed / two paid diagnostics skipped. An initial setup issue in the new policy test used the pricing primary key instead of model_id conflict resolution; corrected the fixture with onConflict model_id before the final pass. No production or paid provider calls.
- Target identity: intended healthy trainerssuperappvite local Supabase stack, API 127.0.0.1:54321 / Postgres 127.0.0.1:54322; required application tables verified before E2E.
- Assertions cover real JWT/Hono/Postgres policy save/GET with Hydrogen selected, Flash code default and eligibility retained, generated usage tagged Hydrogen with no candidate capability override, and static errors preserving status/codes on four operations. PostgREST error transport is a fixture; no destructive database outage was induced.
- Thermo-nuclear/provider review: the canonical capability enables existing eligibility filtering without a second model list, removes test capability overrides, adds no fallback or state machine, and keeps touched specs below 1000 lines. Existing annotated replacement remains separate writes; no transactionality claim. AI usage logging/provider path unchanged, no new dependency or service API.
- Documentation mismatch resolved: raw database error responses conflicted with AGENTS' friendly-error rule. The canonical assessment contract now documents the corrected messages and available models. Earlier readiness notes remain historical; this authorization supersedes their disabled-capability state.

- `pnpm typecheck`, `pnpm lint`, `pnpm build` all exited 0 after GREEN. Existing lint warnings remain outside changed files; no new warnings matched changed paths. Production/provider credentials were not used by these checks.

- `GRAPHIFY_MAX_WORKERS=1 graphify update .` — exit 0, 19956 nodes / 38039 edges / 1267 communities. Ignored graph cache only. Final format and diff checks pass before staging.
- Read-only Railway context verified the configured Trainers project/service/production environment using CLI 5.8.0; previous annotation repair deployment was SUCCESS. No manual deploy or infrastructure mutation was invoked; activation relies on the configured main auto-deploy and its status is checked after push.

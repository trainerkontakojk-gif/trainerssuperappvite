# AI Thinking Level Policy

## Requirement

Make Gemini `thinkingConfig.thinkingLevel` configurable per use case from Monitoring → Model. Persist each scope's policy and audit history, resolve it on the backend against the effective model's verified capabilities, and omit `thinkingConfig` for provider-default settings, non-Gemini providers, unsupported levels, and unverified model support. Preserve the existing AI usage logging behavior and keep all verification on disposable local targets.

The eight scopes and code defaults are:

| Scope | Code default |
| --- | --- |
| `ketik_reply` | `LOW` |
| `ketik_review` | provider default (`null`) |
| `pdkt_reply` | `LOW` |
| `pdkt_evaluation` | provider default (`null`) |
| `telefun_transcription` | `LOW` |
| `telefun_assessment` | provider default (`null`) |
| `telefun_coaching` | `MEDIUM` |
| `sidak_forecast` | `LOW` |

## Design

- Add one shared typed scope registry in `packages/types` with Indonesian labels, descriptions, and defaults. Add explicit supported-thinking-level metadata to each Gemini text model. Record unsupported-to-verify models as unverified with no allowed levels until official Gemini API documentation confirms support.
- Add backend-only `ai_thinking_policy` and `ai_thinking_policy_audit` tables, RLS with no `anon`/`authenticated` access, and atomic service-role set/reset RPCs. The paired rollback drops both tables and RPCs, so policy and audit rows are intentionally lost if rolled back.
- Add a 60-second cached backend resolver with DB policy precedence and code-default fallback for missing/invalid rows or database errors. Its model gate returns no level for unknown, non-Gemini, or unsupported/unverified models; it never remaps a level.
- Reuse `monitoring.models.read` and `monitoring.models.write` for list/set/reset/audit. These existing capabilities allow admins and trainers; do not add admin-only capabilities.
- Add a Thinking level section and edit dialog under Monitoring → Model for the same admins and trainers. Show effective/default model support and warnings for selectable models that will ignore the selected level. Model-table and thinking-table state changes use explicit reducers.
- Resolve and pass levels for the scoped Gemini GenerateContent callers. Non-Gemini routes remain unchanged; exclude Gemini image generation and Telefun Live.
- Update architecture/Telefun docs with the policy, capability boundary, provider behavior, verified model support, and gaps.

Roles touched: `anon` and `authenticated` are denied table/RPC access; `service_role` is the only database role granted access. API access reuses the existing model-policy capability middleware for admins and trainers; the E2E denial case uses `agent` (which lacks these capabilities). No remote Supabase project is in scope.

## Tasklist

- [x] Read repository instructions, workflow, TDD, migration, and thermo-nuclear skills; classify as Lane D.
- [x] Inspect the existing model policy, model registry, callers, UI, migration history, and local E2E harness.
- [x] Verify official Gemini API thinking-level support for selectable Gemini text models and record gaps.
- [x] Add focused RED-first Playwright coverage for UI persistence/audit, admin-and-trainer model-policy access, denial for a role without model-policy access (`agent`), and provider request payloads including provider-default and unsupported combinations.
- [x] Add shared scope/model types and model capability metadata.
- [x] Add forward migration and paired rollback, and document rollback ordering/data loss.
- [x] Add backend resolver, API routes with shared model-policy access, and client RPC types.
- [x] Add the Monitoring → Model section and reducer-driven edit flow.
- [x] Wire every in-scope Gemini GenerateContent caller.
- [x] Update architecture and Telefun documentation and the 2026-11-23 changelog.
- [x] Run clean disposable replay/rollback, focused RED-first Playwright checks, requested typechecks/lint, Graphify refresh, and Impeccable detection; finish final diff checks and thermo-nuclear review before handoff.
- [x] Leave changes uncommitted and unpushed.

## Execution note

The live official [Gemini thinking guide](https://ai.google.dev/gemini-api/docs/thinking) lists these levels for models selectable in this repository:

| Model | Verified levels |
| --- | --- |
| `gemini-4-hydrogen` | `LOW`, `MEDIUM`, `HIGH`, `XHIGH` |
| `gemini-3.8-flash` | `LOW`, `MEDIUM`, `HIGH` |
| `gemini-3.5-flash-lite` | `MINIMAL`, `LOW`, `MEDIUM`, `HIGH` |
| `gemini-3-flash-preview` | `MINIMAL`, `LOW`, `MEDIUM`, `HIGH` |
| `gemini-3.1-pro-preview` | `LOW`, `MEDIUM`, `HIGH` |
| `gemini-3.1-flash-lite` | `MINIMAL`, `LOW`, `MEDIUM`, `HIGH` |

`gemini-3.5-flash` is absent from the current guide and stays unverified (no level sent). The earlier Hydrogen-LOW-only and 3.1-Flash-Lite fail-closed overrides were based on a misread of the guide and were removed after the orchestrator re-read https://aistudio.google.com/docs/thinking on 2026-11-23: the registry now follows the guide's table. `XHIGH` (Hydrogen, Neon) is not in the project enum yet. Context7 was unavailable (`npx` not installed), so the official guide is the external source.

RED evidence: before implementation, the Monitoring UI cases failed because the section and routes did not exist (2 failed); Telefun retained the existing LOW assertion and the three new policy cases failed on missing policy endpoints (1 passed, 3 failed). Green evidence: final Monitoring run passed 3/3, including save/audit, a simulated post-save reload failure, and access denial; the focused Telefun provider-payload run passed 4/4. All Playwright runs used retries=0. The tests used the disposable project under `scratch/ai-thinking-policy-20261123`; a clean replay, paired rollback, schema/RLS/grant checks, expected missing-RPC response after rollback, and clean replay completed there. No remote Supabase project was used.

Thermo-nuclear review simplified the API response contracts to use the shared types and fixed two dialog lifecycle bugs: a save followed by a failed reload now reports the reload failure accurately, and a second initial data response no longer closes an active edit. The focused regression E2E covers these cases.

The resource gate was green before each heavy run; the final measured state had about 21 GB disk free and pressure level 1. `pnpm --filter @trainers/api typecheck`, `pnpm --filter @trainers/web typecheck`, touched-file ESLint, `pnpm --filter @trainers/api build`, and `pnpm --filter @trainers/web build` passed. Graphify rebuilt its local graph (20,499 nodes, 39,860 edges); Impeccable returned no findings for the Monitoring UI. Final `git diff --check` and the thermo-nuclear review are complete. Changes remain uncommitted and unpushed.

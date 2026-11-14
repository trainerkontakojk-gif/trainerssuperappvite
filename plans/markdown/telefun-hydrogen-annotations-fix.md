# Repair Hydrogen replay annotation requests

Lane D: Gemini provider request/response contract and AI usage evidence. Scope: replay annotation generation, local regression and opt-in Hydrogen diagnostic. No migration or production policy change.

## Requirement

- Restore successful annotation generation with Hydrogen while preserving Gemini 3.8 Flash and current defaults.
- Keep the 30 annotation / 5 recommendation / 500 character limits and validate provider values before writes.
- Provider rejection must be an honest, human-friendly failure and must preserve existing annotations/coaching.
- Repeat the failed annotation step with exactly one permitted Hydrogen request, existing synthetic local WebM, no TTS, retry, scoring or coaching generation calls.
- Verify real local Hono/JWT/Postgres annotation/coaching persistence and ai_usage_logs.model_id.

## Design

- Google structured output documentation explains that array/numeric bounds expand grammar states and can cause 400 INVALID_ARGUMENT. Remove those bounds from the provider schema and keep limits in descriptions/prompt and backend validation/normalization. maxLength is ignored by the provider, so removing it alone cannot establish a fix.
- Preserve basic types, required properties and classification enums; use integer timestamps/priority. Validate JSON values with Zod before deleting previous rows. Preserve existing slicing limits for oversized valid responses.
- Check result.success before parsing; use a static friendly failure, without leaking raw provider errors. Invalid JSON/values also fail before writes.
- Default Playwright API regressions use real loopback Supabase with provider/storage fixtures and dummy credentials. Dedicated live diagnostic remains opt-in; add an annotation-only case with a one-call cap for the authorized recheck.
- Graphify REPLAY_ANNOTATION_SCHEMA resolved owning route; live imports and fetch guard reviewed. Context7 /websites/ai_google_dev_api consulted. Official guidance: https://aistudio.google.com/docs/structured-output#simplifying-complex-schemas.
- Existing documentation's unsupported-schema-keyword hypothesis is revised: current docs explicitly ignore maxLength and support maxItems/minimum/maximum, but reject overly complex grammars. The exact original rejecting field was not identified by the generic provider response.

## Tasklist

- [x] Local RED E2E for simplified request, successful persistence/logging and server limits.
- [x] Local RED E2E for provider errors and invalid data preserving prior rows.
- [x] Minimum route repair; local GREEN E2E.
- [x] One annotation-only real Hydrogen request; retain sanitized evidence and limitations.
- [x] Scoped maintainability/provider/usage review, root typecheck/lint/build and diff checks.
- [x] Update evidence/changelog and prepare main integration; preserve unrelated dirty plans. Commit/push completion is reported from Git after the checks below.

## Verification evidence

- Before product changes, the initial 7-case local regression reported 6 failures / 1 pass (exit 1). The isolated Hydrogen schema RED run (exit 1) reached the real route, confirmed Hydrogen selection, and failed because the outgoing schema contained maxItems/maxLength/minimum/maximum. Provider failure and invalid-value cases also failed against the old implementation. An earlier fixture checksum setup error was corrected before this behavioral RED evidence.
- `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --project telefun-annotations-real-backend --reporter=line --workers=1`: exit 0, 7 passed. Real loopback JWT/Hono/Postgres, provider/storage fixtures; no paid calls. Covers simplified request, model usage, persisted annotation/coaching, manual-note preservation, output caps, provider rejection, invalid JSON/priority/category/timestamp before writes.
- `pnpm typecheck`: exit 0, all four workspaces including web E2E compilation.
- The annotation-only command in [sanitized live evidence](../evidence/telefun-hydrogen-annotations-fix-2026-11-14.json) exited 0: exactly one provider call, HTTP 200, modelVersion gemini-4-hydrogen, 1477 input / 228 visible output + 599 thinking tokens. Real local API persisted 3 annotations / 2 recommendations and logged model_id gemini-4-hydrogen, 1477 input / 827 billed output tokens. Estimated Standard token cost USD 0.008418, not an invoice. No TTS call.
- This shows the repaired request is accepted; the original generic 400 did not identify a single rejecting constraint, so no per-keyword causality claim is made. Current documentation supports the grammar complexity diagnosis and local bounds strategy.

## Review and limits

- Scope review: shared Gemini wrapper and billing logic untouched; every successful annotated request still logs usage through generateGeminiContent. No auth/RLS/schema/state transition change. Candidate audio flag is confined to test workers and restored; production registry/defaults unchanged.
- Maintainability review uses thermo-nuclear-code-quality-review: enums have one definition, the provider boundary is typed/validated before writes, and the standalone regression/opt-in diagnostic stay below 1000 lines. Existing deletion/insert/summary RPC remain separate writes; this change does not claim transactionality for database failures. Provider/validation failures are proved to happen before these writes.
- Historical first run remains 3 successful stages / annotation failure. This recheck ran only the repaired annotation stage; it does not replace that history with an invented full workflow pass. Audio eligibility is unchanged because this task repairs and verifies the annotation request only.

## Additional checks

- Combined annotation/scoring regression: `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --project telefun-annotations-real-backend --project telefun-scoring-real-backend --reporter=line --workers=1` — exit 0, 22 passed; no real provider requests.
- Default opt-in safety: `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --project telefun-hydrogen-audio-real-backend --reporter=line --workers=1` — exit 0, 2 skipped without live opt-in. Full-flow and annotation-only cases now select mutually exclusive four-call/one-call budgets, preventing an extra paid request when a whole project is selected.
- Final `pnpm typecheck` — exit 0, four workspaces. `pnpm lint` — exit 0 with existing warnings (none on changed files); after the final diagnostic selection guards, `pnpm --dir apps/web exec eslint e2e/telefun-hydrogen-audio-api.spec.ts` also exited 0.
- Documentation/implementation discrepancy retained outside this request repair: the route's existing outer database-error catch still returns error.message, whereas AGENTS requires human-friendly database failures. New provider/validation error responses use static friendly messages; raw database-outage handling and transactional replacement remain follow-up work, without claiming this fix resolves either.

- Local Graphify update completed: 19929 nodes, 38014 edges, 1262 communities; cache is ignored. The process session was no longer available after continuation, so completion is evidenced by the final log, without inventing an observed exit status.

- `pnpm build` — exit 0, all three build tasks successful. Final format/diff checks run before staging; no additional provider calls were needed after the single successful annotation recheck.

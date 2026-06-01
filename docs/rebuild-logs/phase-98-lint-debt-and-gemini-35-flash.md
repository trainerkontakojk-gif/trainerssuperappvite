# Phase 98: Lint Debt Cleanup & Gemini 3.5 Flash Option

## Summary

In this phase, we addressed code quality debt by resolving the remaining lint issues and integrated the newly available Gemini 3.5 Flash model option across modules.

### 1. Lint Debt Resolution
* Statically imported `readdirSync` in `apps/api/src/__tests__/helpers/rls-policy-source.ts` instead of using CommonJS `require()`.
* Added the caught error as a `cause` parameter when throwing the JSON parse error in `apps/api/src/lib/ai-json.ts`.
* Removed unused imports, variables, and arguments across multiple test and service files in both `apps/api` and `apps/telefun` workspaces.
* Verified that `pnpm lint` now completes with 0 errors.

### 2. Gemini 3.5 Flash Integration
* Added the model `gemini-3.5-flash` in the canonical shared types list `packages/types/src/ai-models.ts` with 180s timeout and text/image capabilities.
* Centralized `TEXT_SIMULATION_MODELS` and `AiModelModule` in the shared registry so API and Web consume the same text-model contract for `/models?module=qa-analyzer`, filtering out image-only models.
* Wired the SIDAK Report AI component to consume `TEXT_SIMULATION_MODELS` instead of raw `AI_MODELS`, ensuring image-only models like `gemini-3.1-flash-image` are omitted from the report model selection.
* Verified that both KETIK and PDKT settings modals automatically render the new `Gemini 3.5 Flash` option from the canonical registry.

## Verification

* **Unit Tests**:
  * Added `apps/api/src/__tests__/ai-models.test.ts` asserting that Gemini 3.5 Flash routes to the `gemini` provider and `qa-analyzer` queries return text models.
  * Added `apps/web/src/__tests__/sidak-reports-ai.test.tsx` verifying that SIDAK Report AI renders `Gemini 3.5 Flash` and excludes `gemini-3.1-flash-image`.
  * Added assertions in both KETIK and PDKT settings modal tests to check for `Gemini 3.5 Flash`.
  * All tests pass successfully.
* **API Smoke Test**:
* Created `scripts/ai/smoke-gemini-model.mjs` as the canonical smoke helper for validating `gemini-3.5-flash`.
  * Validated that `gemini-3.5-flash` resolves and successfully outputs "OK" from the Google Gemini API using a valid `GEMINI_API_KEY`.
* **Lint Check**:
  * Executed `pnpm lint` on the monorepo, verifying 0 errors.

# Phase 202: OpenRouter Error Refactoring & DeepSeek Models

## Changes

### 1. OpenRouter Error Refactoring (`apps/api/src/lib/openrouter.ts`)

Extracted inline error formatting into two pure helper functions:

- `formatOpenRouterError(status, errorText)` — centralizes error message generation with structured handling for:
  - `429` — "Server AI sedang sibuk. Coba lagi."
  - `401` — "API Key OpenRouter tidak valid: {detail}"
  - `402` — "Kredit OpenRouter tidak cukup: {detail}" (NEW)
  - `403` — "OpenRouter menolak akses: {detail}" (NEW)
  - Other — detail message or generic fallback
- `parseOpenRouterErrorMessage(errorText)` — safely extracts `error.message` from JSON response body

Reduced ~30 lines of inline if/else/try-catch to ~20 lines of clean helper functions.

### 2. KETIK AI Error Suppression (Frontend)

New file `apps/web/src/routes/ketik/lib/ketik-error.ts`:

- `shouldLogKetikGenerationError(error)` — returns `false` for `ApiError` with `code === "AI_ERROR"`, `true` otherwise.
- ChatInterface.tsx wraps `console.error` with this guard to prevent expected AI errors from polluting browser console.

### 3. Model Registry Cleanup (`packages/types/src/ai-models.ts`)

- Removed deprecated models:
  - `openai/gpt-oss-120b:free` (no longer available)
  - `google/gemini-2.0-flash-lite` (superseded)
- Added new models:
  - `deepseek/deepseek-v4-pro` (180s timeout, complex tasks)
  - `deepseek/deepseek-v4-flash` (120s timeout, fast & efficient)

### 4. Documentation

- `docs/modules.md` — Added note about expected AI errors not polluting console
- `docs/architecture.md` — Updated OpenRouter error handling section with 402/403 codes

## Files Modified

| File | Change |
|------|--------|
| `apps/api/src/lib/openrouter.ts` | Extracted `formatOpenRouterError()` + `parseOpenRouterErrorMessage()`, added 402/403 support |
| `apps/api/src/__tests__/openrouter.test.ts` | NEW — unit test for 401 error detail passthrough |
| `apps/web/src/routes/ketik/lib/ketik-error.ts` | NEW — `shouldLogKetikGenerationError()` guard |
| `apps/web/src/__tests__/ketik-error.test.ts` | NEW — 3 unit tests for error guard |
| `apps/web/src/routes/ketik/components/ChatInterface.tsx` | Wrapped `console.error` with error guard |
| `packages/types/src/ai-models.ts` | Removed 2 deprecated models, added 2 DeepSeek models |
| `docs/modules.md` | Added "Expected AI errors" note |
| `docs/architecture.md` | Updated OpenRouter error handling section |

## Test Results

- OpenRouter: 1 API unit test (401 error detail passthrough)
- KETIK error: 3 frontend unit tests (AI_ERROR suppressed, NOT_FOUND logged, non-ApiError logged)
- All existing tests pass

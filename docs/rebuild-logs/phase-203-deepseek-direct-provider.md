# Phase 203: DeepSeek Direct Provider + KETIK/PDKT Word Count Policy

## Summary

Added DeepSeek as a native first-class AI provider alongside Gemini and OpenRouter.

## Changes

### 1. DeepSeek API Client (NEW)

`apps/api/src/lib/deepseek.ts` — Native DeepSeek API client at `https://api.deepseek.com/chat/completions`:

- 4-attempt retry with backoff for 429
- JSON mode via `response_format: { type: "json_object" }`
- Structured error formatting (429/401/402/403 + generic)
- Usage logging to `ai_usage_logs` via `logAiUsage()`
- System instruction support
- Configurable temperature, timeout per model

### 2. Model Registry

`packages/types/src/ai-models.ts`:

- New `AIProvider = "deepseek"` type
- `DEEPSEEK_MODELS` array: `deepseek-v4-pro` (180s, ketik/pdkt) and `deepseek-v4-flash` (120s, ketik/pdkt)
- `KETIK_PDKT_MODELS = TEXT_MODELS + DEEPSEEK_MODELS`
- `availableModules` field on `AiModelInfo`
- DeepSeek removed from `TEXT_MODELS`; Qwen 3.5 Flash restored

`apps/api/src/lib/ai-models.ts`:

- `MODEL_REGISTRY` combines `AI_MODELS + DEEPSEEK_MODELS`
- Provider lookups via registry instead of `/` detection
- `getModelsForModule("ketik"|"pdkt")` returns `KETIK_PDKT_MODELS`

### 3. Provider Routing

- `routes/ai.ts`: `isDeepSeek` → `generateDeepSeekContent()`
- `ketik/consumer-response.ts`: DeepSeek in system instruction, temperature, call routing
- `pdkt/shared-utils.ts`: DeepSeek in `callAI()` helper
- `pdkt/session-service.ts`: `getPdktWordCountPolicy()` relaxes threshold for DeepSeek

### 4. Frontend Updates

- `KetikSystemTab.tsx`: Uses `KETIK_PDKT_MODELS`, adds emerald badge for deepseek
- `PdktSystemTab.tsx`: Uses `model.provider` instead of `/` check, adds deepseek badge
- `aiModels.ts`: Fallback to `KETIK_PDKT_MODELS` for KETIK/PDKT
- `unwrap-response.ts`: Non-JSON content-type fallback handling

### 5. Environment

- `.env.example` and `env.ts`: Added optional `DEEPSEEK_API_KEY`

## Files Modified/Added

- `apps/api/src/lib/deepseek.ts` — NEW
- `apps/api/src/__tests__/deepseek.test.ts` — NEW
- `packages/types/src/ai-models.ts` — registry changes
- `apps/api/src/lib/ai-models.ts` — registry + routing
- `apps/api/src/lib/env.ts` / `.env.example` — env var
- `apps/api/src/lib/ai-usage.ts` — AIProvider type
- `apps/api/src/routes/ai.ts` — DeepSeek routing
- 6 service files updated (KETIK, PDKT)
- 7 test files updated
- 5 frontend files updated
- `docs/modules.md` — DeepSeek notes

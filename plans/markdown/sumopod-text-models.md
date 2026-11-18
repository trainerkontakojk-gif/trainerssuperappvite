# SumoPod text models (GPT 6 Luna, DeepSeek V4.1 Flash)

Lane D: a new AI provider, a new secret (`SUMOPOD_API_KEY`), and AI usage logging.

## Requirement

- Fajar can choose **GPT 6 Luna** (`gpt-6-luna`) and **DeepSeek V4.1 Flash**
  (`deepseek-v4.1-flash-1017`), served by SumoPod, wherever text models are
  selectable today: KETIK and PDKT simulation model, QA analyzer list, and the
  admin AI-task policy for `ketik_review`, `ketik_review_fallback`, and
  `default_text`.
- Telefun stays on Gemini Live only: the new models never appear in the Telefun
  model list, and `telefun_assessment` / `sidak_forecast` stay Gemini-only.
- Every SumoPod call is logged with `logAiUsage()` (provider `sumopod`, the
  model id, prompt/completion tokens). No pricing row exists yet, so cost is
  zero until a price is entered in Monitoring → Harga.
- A missing `SUMOPOD_API_KEY` fails closed with a human-friendly error; it never
  silently routes to another provider.

## Design

- `packages/types/src/ai-models.ts`: `AIProvider` gains `"sumopod"`; two
  `TEXT_MODELS` entries with `provider: "sumopod"`; both ids join
  `KETIK_PDKT_MODEL_IDS` (which feeds `SELECTABLE_MODEL_IDS`). Not added to any
  Telefun registry.
- `apps/api/src/lib/sumopod.ts`: `generateSumoPodContent()` calls
  `POST https://ai.sumopod.com/v1/chat/completions`
  (OpenAI-compatible; verified 2026-11-18 against the live `/v1/models` list and
  test calls: both models honor `temperature` and `response_format`
  `json_schema`). Same option shape, retry (429/5xx, 4 attempts), timeout,
  abort, sanitize and usage-logging semantics as `generateOpenAIContent()`.
- `apps/api/src/lib/ai-text.ts`: `generateCompatibleContent(provider, options)`
  routes the two OpenAI-style providers (`openai`, `sumopod`) so call sites keep
  one Gemini branch and one non-Gemini branch instead of a third branch each.
- Call sites: `services/pdkt/shared-utils.ts` (`callAI`),
  `services/ketik/consumer-response.ts`, `services/ketik/review-processor.ts`
  (primary and fallback). Non-Gemini providers get the explicit temperature and
  KETIK "script mode" that OpenAI gets today.
- `resolveModelProvider()` / `getProviderFromModelId()` accept `sumopod`.
- `.env.example` documents `SUMOPOD_API_KEY`.
  Railway needs `SUMOPOD_API_KEY` before the models work in production.

## Tasklist

1. RED: `apps/web/e2e/sumopod-models-api.spec.ts` (real JWT, Hono app, local
   Supabase, SumoPod stubbed in `fetch`):
   - KETIK/PDKT model list includes both models; Telefun list excludes them.
   - A KETIK session on `gpt-6-luna` sends its consumer turn to SumoPod
     `chat/completions` with the SumoPod key, returns the stubbed reply, and
     writes an `ai_usage_logs` row with provider `sumopod`.
   - Without `SUMOPOD_API_KEY` the turn fails with a readable error and no
     request leaves for SumoPod.
2. GREEN: types registry, `sumopod.ts`, `ai-text.ts`, call sites, env docs.
3. `thermo-nuclear` review; `pnpm typecheck`, `pnpm lint`, `pnpm build`,
   `git diff --check`.
4. Docs: model registry note in `docs/architecture.md` if it lists providers;
   CHANGELOG entry.

## Follow-up (2026-11-18): Claude Sonnet 5.5 and Opus 5.5

- Ids `claude-sonnet-5-5` and `claude-opus-5-5` from the live SumoPod `/v1/models`
  list join `TEXT_MODELS` and `KETIK_PDKT_MODEL_IDS`; no Telefun registry.
- Live check: both accept `temperature` but ignore `response_format`
  `json_schema` (fenced JSON with extra fields). KETIK review and PDKT parse via
  `extractJsonObjectText`, which strips fences, so no adapter change.
- E2E: `sumopod-models-api.spec.ts` routes each SumoPod model to SumoPod;
  `monitoring-models-api-policy.spec.ts` active pricing inventory 9 -> 11.

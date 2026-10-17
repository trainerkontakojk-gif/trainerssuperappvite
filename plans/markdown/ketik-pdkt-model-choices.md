# KETIK & PDKT model choices

## Requirement

Fajar (2026-10-17): KETIK and PDKT may only offer Gemini 3.8 Flash and Gemini 3.5 Flash Lite. Telefun is unchanged. Verified on ai.google.dev (2026-10-17): `gemini-3.8-flash` and `gemini-3.5-flash-lite` are the newest stable Flash and Flash-Lite text models.

Acceptance:
- KETIK and PDKT settings show exactly those two models.
- A saved older model never breaks settings or sessions: old Flash-Lite choices become `gemini-3.5-flash-lite`, everything else `gemini-3.8-flash`.
- The server applies the same rule when creating new KETIK and PDKT sessions, so a browser cannot request another model.
- Existing sessions keep the model in their stored snapshot (still in the registry), so replies and evaluations of old sessions keep working.
- Telefun, QA analyzer and the KETIK review primary/fallback are untouched.

## Design

- `packages/types/src/ai-models.ts`: `KETIK_PDKT_MODEL_IDS`, `KETIK_PDKT_MODELS` filtered from `TEXT_MODELS`, and `coerceKetikPdktModelId`.
- Web: `coerceKetikModelId` and `coercePdktModelId` delegate to the shared helper.
- API: KETIK settings read (`settings-history.ts`), KETIK session start (`server-sessions.ts`), PDKT generation config (`session-service.ts`) use the shared helper.

## Tasklist

- [x] RED: hermetic E2E in `ketik-flow.spec.ts` and `pdkt-flow.spec.ts` (9 options shown before the change).
- [x] GREEN: shared helper and call sites; E2E pass.
- [x] Update `ketik-session-api.spec.ts` expectations (saved `gpt-5.4-mini` now starts on `gemini-3.8-flash`); could not run here: local Supabase images could not be pulled.
- [x] Docs and changelog.

## Follow-up (Fajar, 2026-10-17)

- SIDAK dashboard forecast narration moves from `gemini-3.1-flash-lite` to `gemini-3.8-flash` via `SIDAK_FORECAST_MODEL`. No local E2E can observe the server-side model (browser forecast specs mock `/api`; real-backend specs need local Supabase), so this is verified by typecheck/build only.
- `POST /v1/ai/generate` and the `ai.generate` capability are removed: no page called it and it accepted any model while logging usage as KETIK. RED/GREEN: `access-matrix-api.spec.ts` "retired free-form AI endpoint is gone" (gate-stub project). The `ai_generate` usage category stays so older usage logs keep their label.

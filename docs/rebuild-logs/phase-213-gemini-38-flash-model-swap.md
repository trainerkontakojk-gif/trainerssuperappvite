# Phase 213 — Gemini 3.8 Flash Model Swap (3.7 → 3.8)

Tanggal: 2026-09-03
Scope: default text model Ketik/PDKT/Telefun scoring + pricing plumbing. Telefun Live realtime registry tidak tersentuh.

## Kenapa
Model baru `gemini-3.8-flash` tersedia (ai.google.dev, verified 2026-09-03).
Pricing Standard Paid Tier Global identik dengan 3.7:
- intro s/d 2026-12-31: input $0.75 / output $3.75 per 1M
- mulai 2027-01-01: $1.50 / $7.50 per 1M
- $0.375/$1.875 = tier Batch/Flex, TIDAK dipakai (sistem pakai Standard).

## Yang berubah
- `packages/types/src/ai-models.ts`: DEFAULT_AI_MODEL_ID + TEXT_MODELS[0] → `gemini-3.8-flash`
- `apps/api/src/lib/ai-models.ts`: LEGACY_ALIASES `gemini-3.7-flash → gemini-3.8-flash`, `gemini-3.6-flash → gemini-3.8-flash`
- Hardcoded caller: `services/ketik/review-processor.ts`, `lib/telefun-analysis.ts` (2x: voice_assessment + coaching_summary), `routes/telefun/annotations.ts`
- Fallback pricing: `lib/ai-usage.ts` pricingByModel key → 3.8 @ 0.75/3.75
- Frontend: `pdktSettings.ts` (DEFAULT_PDKT_MODEL_ID), `ketik/simulation.tsx`, `pdkt/simulation.tsx`
- Migration BARU `supabase/migrations/20260903000000_add_gemini_38_flash_pricing.sql` (idempotent; copy custom pricing 3.7 → 3.8; backfill WIB month untuk 3.8/3.7/3.6). Migration lama 20260821 TIDAK diedit.
- Tests: ai-models, ketik-service, ketik-review-processor, telefun-scoring-routing, pdkt-settings, pdkt-mailbox, settings-draft-helpers
- Docs: `MONITORING_TOKEN_USAGE_BILLING.md` (kanonik 3.8 + catatan alias legacy)

## Guardrail
- Dist `packages/types/dist/` = build artifact (regenerate saat build), tidak diedit manual.
- Historical `ai-billing-credit-report-2026-08-22.md` dibiarkan apa adanya (snapshot tanggal).
- Sisa string `gemini-3.7-flash` yang sah: LEGACY_ALIASES, assert negatif di ai-models.test, referensi legacy di migration baru.

## Verifikasi
- api vitest (4 file): 37 passed
- web vitest (3 file): 51 passed
- pricing-contract.test: 6 passed
- tsc --noEmit api + web: PASS
- prettier warn = pre-existing drift (HEAD juga warn), tidak direformat
- validate-migrations: blocked (butuh DATABASE_URL)

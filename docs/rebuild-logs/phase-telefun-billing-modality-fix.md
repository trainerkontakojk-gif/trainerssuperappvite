# Phase: Telefun Billing Per-Modality Fix

**Date:** 2026-06-18
**Issue:** Telefun usage tracking mismatch 165.9% vs Google billing

## Problem

Gemini Live API (`gemini-3.1-flash-live-preview`) charges **per modality**:
- Input text: $0.75/M tokens
- Input audio: $3.00/M tokens
- Output text: $4.50/M tokens
- Output audio: $12.00/M tokens

The system only tracked total tokens (`promptTokenCount`, `result`) with flat pricing ($3/$12), causing massive undercounting of actual costs.

**Evidence:** Logged Rp11,287 IDR vs Google billing Rp30,017 IDR (165.9% diff)

## Root Cause

1. `LiveUsageSnapshot` only stored 3 fields: prompt, response, total — no modality breakdown
2. `parseUsageMetadata()` discarded `promptTokensDetails[]` and `responseTokensDetails[]` (only used as fallback)
3. `ai_usage_logs` table had no columns for audio/text token separation
4. Cost calculated with single pricing pair ($3/$12) for ALL tokens

## Changes

### New Files
- `supabase/migrations/20260618210000_ai_usage_modality_tokens.sql` — 11 new columns for modality tracking
- `supabase/migrations/20260618220000_ai_usage_reconciliation_view.sql` — audit view for billing reconciliation
- `supabase/rollbacks/rollback_20260618220000_ai_usage_reconciliation_view.sql` — rollback for view
- `apps/api/src/lib/modality-pricing.ts` — per-modality pricing helper
- `apps/api/src/__tests__/modality-pricing.test.ts` — pricing tests
- `apps/telefun/src/__tests__/usage-modality.test.ts` — parser/modality tests (9 tests)

### Modified Files
- `apps/telefun/src/usage.ts` — +215 lines: `ModalityTokenBreakdown`, `sumModalityDetails()`, updated `parseUsageMetadata()`, `mergeSnapshot()`, `flushLiveUsage()`
- `apps/api/src/lib/ai-usage.ts` — +100 lines: modality fields in `TokenUsage`, `calculateModalityCost()` integration, backward-compatible legacy fallback

### Schema Changes (Migration 002 extension)
New nullable columns on `ai_usage_logs`:
- `input_text_tokens`, `input_audio_tokens`, `input_unspecified_tokens`
- `output_text_tokens`, `output_audio_tokens`, `output_unspecified_tokens`
- `input_text_price_usd_per_million`, `input_audio_price_usd_per_million`
- `output_text_price_usd_per_million`, `output_audio_price_usd_per_million`
- `raw_usage_metadata` (JSONB)

## Key Design Decisions

1. **Backward-compatible**: All new columns nullable/optional — existing code continues to work
2. **No retroactive data changes**: Historical logs preserved as-is; reconciliation view for audit
3. **Auto-detection**: `resolveModalityPricing()` auto-applies Gemini Live pricing for models matching `*gemini*live*`
4. **Unspecified tokens fallback**: When modality breakdown unavailable, tokens priced at flat rate
5. **Modality sum validation**: `parseUsageMetadata()` discards breakdown if sum ≠ total (safety check)

## Verification

- Lint: 0 errors
- Build: 3/3 workspaces
- Telefun tests: 70/70 (incl. 9 new modality tests)
- API tests: 117/117 (incl. modality-pricing tests)
- Test:core: 168/168

## Agents Used

- **Codex (GPT 5.5 xhigh)**: Plan creation + code review
- **Agy (Gemini 3.5 Flash High)**: Implementation of Phase 1-4
- **Moy (Hermes)**: Coordination, verification, type fix

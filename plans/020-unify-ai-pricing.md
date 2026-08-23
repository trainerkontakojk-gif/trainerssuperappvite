# Plan 020 — Unify AI Pricing Constants (api ↔ telefun ↔ shared package)

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (billing-adjacent; mitigated by characterization tests)
- **Depends on**: none
- **Category**: tech debt / billing correctness
- **Planned at**: commit `2ae678b`, 2026-08-23

## Why this matters

AI pricing constants are duplicated across `apps/api` and `apps/telefun`.
Commit `1cd3b75` ("fix: correct AI pricing to official rate cards") proved
the drift risk is real: the api fallback table was corrected but telefun's
hardcoded copies were not touched. Today the two sides agree only by luck:

| Constant | api | telefun | Shared? |
|---|---|---|---|
| Gemini Live modality rates (0.75/3.0/4.5/12.0) | `apps/api/src/lib/modality-pricing.ts:44-49` (`GEMINI_LIVE_PRICING`) | `apps/telefun/src/usage.ts:7-12` (`GEMINI_LIVE_PRICING`) | ❌ duplicated |
| Default USD→IDR rate (15000) | `apps/api/src/lib/ai-billing-settings.ts:1` | `apps/telefun/src/usage.ts:6` | ❌ duplicated |
| Gemini per-minute audio floor (0.005 in + 0.018 out) | — | `apps/telefun/src/usage.ts:14-17` (`PER_MINUTE_AUDIO_*_USD`) | ❌ hardcoded |
| Gemini Live fallback input/output per million (3.0 / 12.0) | `apps/api/src/lib/ai-usage.ts:141-143` | `apps/telefun/src/usage.ts:1181-1186` | ❌ magic numbers |

Any future rate-card change must be hand-synced to up to three files.
The fix: one shared module in `@trainers/types`, both apps consume it.

## Current state (evidence, at commit `2ae678b`)

### packages/types — runtime-capable shared package

`packages/types/package.json`: `"main": "./src/index.ts"` (source-shipped
workspace package), dependency zod ^3.0.0, and it already exports runtime
functions (`getTelefunLiveModel` at `src/ai-models.ts:177`). So adding a
pure-constants module here is consistent with the existing pattern.

### The duplicated blocks

**api side**
```ts
// apps/api/src/lib/modality-pricing.ts:44-49
const GEMINI_LIVE_PRICING = {
  inputTextPriceUsdPerMillion: 0.75,
  inputAudioPriceUsdPerMillion: 3.0,
  outputTextPriceUsdPerMillion: 4.5,
  outputAudioPriceUsdPerMillion: 12.0,
} as const;
```
```ts
// apps/api/src/lib/ai-usage.ts:139-146 (fallback ladder excerpt)
} else if (isGeminiLive) {
  resolvedDefaultInput = 3.0;
  resolvedDefaultOutput = 12.0;
}
```
```ts
// apps/api/src/lib/ai-billing-settings.ts:1
export const DEFAULT_USD_TO_IDR_RATE = 15000;
```

**telefun side**
```ts
// apps/telefun/src/usage.ts:1-17
import { createClient } from "@supabase/supabase-js";
import { getTelefunLiveModel } from "@trainers/types";
...
const DEFAULT_USD_TO_IDR_RATE = 15000;
const GEMINI_LIVE_PRICING = { ...same four numbers... } as const;
const PER_MINUTE_AUDIO_INPUT_USD = 0.005;
const PER_MINUTE_AUDIO_OUTPUT_USD = 0.018;
```
plus magic numbers in `flushLiveUsage` (`usage.ts:1181-1186`):
```ts
const usesGeminiLivePricing = model.realtime.transport === "gemini-live";
const inputPricePerMillion =
  pricing?.input_price_usd_per_million ?? (usesGeminiLivePricing ? 3.0 : 0);
const outputPricePerMillion =
  pricing?.output_price_usd_per_million ??
  (usesGeminiLivePricing ? 12.0 : 0);
```

## Design

New module `packages/types/src/ai-pricing.ts`, exported via
`packages/types/src/index.ts`. Pure constants + one tiny resolver — no I/O,
no Supabase, no env access (keeps the types package dependency-free).

Single source of truth for:
1. `DEFAULT_USD_TO_IDR_RATE` (= 15000)
2. `GEMINI_LIVE_PRICING` (text-in 0.75 / audio-in 3.0 / text-out 4.5 /
   audio-out 12.0)
3. `GEMINI_PER_MINUTE_AUDIO_USD` ({ input: 0.005, output: 0.018 }) with a
   derived `geminiPerMinuteTotalUsd()` helper replacing
   `PER_MINUTE_AUDIO_TOTAL_USD`
4. `resolveGeminiLiveFallbackPerMillion(transport)` → `{ input: number; output: number }`
   returning `{ input: 3.0, output: 12.0 }` for `"gemini-live"` transport
   else `{ input: 0, output: 0 }` — used by BOTH fallback sites
   (api `ai-usage.ts` ladder + telefun `flushLiveUsage`).

## Steps

### Step 1 — create `packages/types/src/ai-pricing.ts`

Content (final):

```ts
/**
 * Single source of truth for AI rate-card constants.
 *
 * Consumed by apps/api and apps/telefun so that a price update lands in
 * exactly ONE file. History lesson: commit 1cd3b75 fixed the api fallback
 * rates while telefun's copies silently kept stale values — do not let
 * that happen again by editing these numbers anywhere else.
 */

export const DEFAULT_USD_TO_IDR_RATE = 15000;

export const GEMINI_LIVE_PRICING = {
  inputTextPriceUsdPerMillion: 0.75,
  inputAudioPriceUsdPerMillion: 3.0,
  outputTextPriceUsdPerMillion: 4.5,
  outputAudioPriceUsdPerMillion: 12.0,
} as const;

/** Official Gemini Live audio floor: $0.005/min input + $0.018/min output. */
export const GEMINI_PER_MINUTE_AUDIO_USD = {
  input: 0.005,
  output: 0.018,
} as const;

export function geminiPerMinuteTotalUsd(): number {
  return GEMINI_PER_MINUTE_AUDIO_USD.input + GEMINI_PER_MINUTE_AUDIO_USD.output;
}

/**
 * Fallback per-million token prices when ai_pricing_settings has no row
 * (or lacks the column values) for a model.
 *
 * Gemini Live transport bills audio at $3/M in and $12/M out; anything
 * else has no known rate and prices at zero.
 */
export function resolveGeminiLiveFallbackPerMillion(
  isGeminiLiveTransport: boolean,
): { input: number; output: number } {
  return isGeminiLiveTransport
    ? {
        input: GEMINI_LIVE_PRICING.inputAudioPriceUsdPerMillion,
        output: GEMINI_LIVE_PRICING.outputAudioPriceUsdPerMillion,
      }
    : { input: 0, output: 0 };
}
```

Also update `packages/types/src/index.ts`: append
`export * from "./ai-pricing";`.

### Step 2 — rewire apps/api

1. `apps/api/src/lib/modality-pricing.ts`:
   - delete local `GEMINI_LIVE_PRICING`;
   - add `import { GEMINI_LIVE_PRICING } from "@trainers/types";`
   - keep `liveDefaults = isGeminiLive ? GEMINI_LIVE_PRICING : null`.
2. `apps/api/src/lib/ai-billing-settings.ts`:
   - delete local `DEFAULT_USD_TO_IDR_RATE`;
   - add `import { DEFAULT_USD_TO_IDR_RATE } from "@trainers/types";`
   - keep the `export` (existing importers unaffected):
     `export { DEFAULT_USD_TO_IDR_RATE };`
3. `apps/api/src/lib/ai-usage.ts`:
   - extend the existing `@trainers/types` import with
     `resolveGeminiLiveFallbackPerMillion`;
   - replace lines ~139-143:
     ```ts
     } else if (isGeminiLive) {
       const fb = resolveGeminiLiveFallbackPerMillion(true);
       resolvedDefaultInput = fb.input;
       resolvedDefaultOutput = fb.output;
     }
     ```

### Step 3 — rewire apps/telefun

In `apps/telefun/src/usage.ts`:
1. extend import: `import { ..., getTelefunLiveModel } from "@trainers/types";`
2. delete the four duplicated constant blocks (lines ~5-17).
3. `calculatePerMinuteCost`: use `geminiPerMinuteTotalUsd()`.
4. `flushLiveUsage` (~1181): replace magic numbers with the resolver:
   ```ts
   const usesGeminiLivePricing = model.realtime.transport === "gemini-live";
   const geminiFallback = resolveGeminiLiveFallbackPerMillion(usesGeminiLivePricing);
   const inputPricePerMillion = pricing?.input_price_usd_per_million ?? geminiFallback.input;
   const outputPricePerMillion = pricing?.output_price_usd_per_million ?? geminiFallback.output;
   ```
5. `calculateLiveUsageCost` keeps its signature — its body already reads
   `GEMINI_LIVE_PRICING.*`, now imported.

## Out of scope (do NOT touch)

- DB rows in `ai_pricing_settings` / migration seeds (runtime source of truth).
- `pricing-contract.ts`, admin pricing UI, scoring-worker env mirroring.
- The OpenAI realtime cost path in telefun usage.ts (DB-priced, no dup).
- Any behavior change: all numbers byte-for-byte identical to current code.

## Verification gates

Run from repo root unless noted:
```bash
# G1 — anti-duplication sweep: every command prints ONLY node_modules hits (or nothing)
grep -rn "inputTextPriceUsdPerMillion: 0.75" apps --include="*.ts" --include="*.tsx"
grep -rn "= 15000" apps --include="*.ts"
grep -rn "PER_MINUTE_AUDIO" apps/telefun/src --include="*.ts"

# G2 — typecheck all workspaces (~4 min)
pnpm turbo run typecheck

# G3 — targeted unit tests
cd apps/web && npx vitest run src/__tests__/spreadsheet-unification.test.ts   # sanity: unrelated plan still green
cd ../api && npx vitest run src/__tests__/ai-usage-summary-breakdown.test.ts
cd ../../apps/web ...
```

## Done criteria

- [x] G1 clean (zero non-node_modules hits), G2 4/4 pass, G3 green
- [x] `git grep "0.005"` shows the literal only in `packages/types/src/ai-pricing.ts` (+ tests/docs)

## Execution notes (2026-08-23)

- Executed on branch `advisor/020-unify-ai-pricing` (from main @ `2ae678b`).
- Shipped `packages/types/src/ai-pricing.ts` (+ export in index); consumers
  rewired: api `modality-pricing.ts`, `ai-billing-settings.ts` (keeps
  re-export so existing importers are untouched), `ai-usage.ts` fallback
  ladder; telefun `usage.ts` — all four duplicate blocks removed, including
  the DEFAULT_USD_TO_IDR_RATE used by legacy `getBillingRate()` path.
- Characterization test: `apps/telefun/src/__tests__/ai-pricing-shared.test.ts`
  (5 tests). Placed under telefun because `packages/types` has no vitest
  runner of its own — zero new dependencies.
- Actual verification results: anti-duplication greps clean;
  `pnpm turbo run typecheck` → 4 successful, 4 total (4m38s);
  telefun vitest **393/393** (38 files), api targeted **7/7**,
  web spreadsheet sanity **9/9**.
- **Status: DONE**

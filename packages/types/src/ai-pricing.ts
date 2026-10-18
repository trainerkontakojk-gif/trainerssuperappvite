/**
 * Single source of truth for AI rate-card constants.
 *
 * Consumed by apps/api and apps/telefun so that a price update lands in
 * exactly ONE file. History lesson: commit 1cd3b75 fixed the api fallback
 * rates while telefun's copies silently kept stale values — do not edit
 * these numbers anywhere else.
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
  return (
    GEMINI_PER_MINUTE_AUDIO_USD.input + GEMINI_PER_MINUTE_AUDIO_USD.output
  );
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

/** A price row and the moment it took effect (`null` = since forever). */
export interface PricingInEffect {
  effective_since: string | null;
}

/**
 * The price that applies now: the newer of the current price
 * (`ai_pricing_settings`, in effect since its `updated_at`) and the latest
 * schedule row already due. Callers fetch both; this is the only rule.
 */
export function pickEffectivePricing<T extends PricingInEffect>(
  current: T | null,
  dueSchedule: T | null,
): T | null {
  if (!current) return dueSchedule;
  if (!dueSchedule) return current;
  const since = (row: T) =>
    row.effective_since ? Date.parse(row.effective_since) : -Infinity;
  return since(dueSchedule) > since(current) ? dueSchedule : current;
}

/**
 * True when `ai_pricing_schedule` does not exist yet (migration
 * 20261017220000 not applied): callers then use current prices only.
 */
export function isMissingPricingScheduleTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: string; message?: string };
  return (
    (code === "42P01" || code === "PGRST205") &&
    String(message ?? "").includes("ai_pricing_schedule")
  );
}

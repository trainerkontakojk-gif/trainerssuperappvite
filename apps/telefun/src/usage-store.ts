/**
 * Shared persistence helpers for Telefun AI usage logging: the server-only
 * Supabase admin client, billing-rate lookup, and schema-drift detection.
 */

import { createClient } from "@supabase/supabase-js";
import { DEFAULT_USD_TO_IDR_RATE, pickEffectivePricing } from "@trainers/types";
import { env } from "./env.js";

export const admin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
);

export function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function isPostgrestError(error: unknown): error is {
  code?: string;
  message?: string;
} {
  return Boolean(error && typeof error === "object");
}

function isMissingBillingKeyColumnError(error: unknown): boolean {
  if (!error) return false;
  const err = isPostgrestError(error) ? error : {};
  const message = String(err.message || "").toLowerCase();

  if (err.code === "42703") {
    return (
      message.includes("ai_billing_settings.key") ||
      /column .*key/.test(message)
    );
  }

  if (err.code === "PGRST204") {
    return message.includes("schema cache") && message.includes("key");
  }

  return false;
}

export function isMissingAiUsageModalityColumnError(error: unknown): boolean {
  if (!error) return false;
  const err = isPostgrestError(error) ? error : {};
  const message = String(err.message || "").toLowerCase();
  const newColumnPattern =
    "input_text_tokens|input_audio_tokens|input_unspecified_tokens|output_text_tokens|output_audio_tokens|output_unspecified_tokens|input_text_price_usd_per_million|input_audio_price_usd_per_million|output_text_price_usd_per_million|output_audio_price_usd_per_million|session_duration_ms|per_minute_cost_usd|per_minute_cost_idr|final_cost_usd|final_cost_idr|raw_usage_metadata|live_turn_count|latest_input_tokens|latest_output_tokens|latest_total_tokens|context_rebilled_cost_usd|context_rebilled_cost_idr";

  if (err.code === "42703") {
    return new RegExp(
      `ai_usage_logs\\.(${newColumnPattern})|column .*(${newColumnPattern})`,
    ).test(message);
  }

  if (err.code === "PGRST204") {
    return (
      message.includes("schema cache") &&
      new RegExp(newColumnPattern).test(message)
    );
  }

  return false;
}

export async function getBillingRate(): Promise<number> {
  const singletonResult = await admin
    .from("ai_billing_settings")
    .select("usd_to_idr_rate")
    .eq("key", "default")
    .maybeSingle();

  if (!singletonResult.error) {
    return singletonResult.data?.usd_to_idr_rate ?? DEFAULT_USD_TO_IDR_RATE;
  }

  if (!isMissingBillingKeyColumnError(singletonResult.error)) {
    throw singletonResult.error;
  }

  const legacyResult = await admin
    .from("ai_billing_settings")
    .select("usd_to_idr_rate")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (legacyResult.error) throw legacyResult.error;
  return legacyResult.data?.usd_to_idr_rate ?? DEFAULT_USD_TO_IDR_RATE;
}

export function readPricingRate(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

type LivePricingRow = {
  input_price_usd_per_million: number | null;
  output_price_usd_per_million: number | null;
  effective_since: string | null;
};

/**
 * Input/output price in effect now for a Telefun model: the newer of the
 * current price and the latest due schedule (`pickEffectivePricing`). Read
 * errors, including a missing schedule table, count as "no row" so the
 * caller's fallback rate applies, as before schedules existed.
 */
export async function readEffectiveLivePricing(
  modelId: string,
): Promise<LivePricingRow | null> {
  const columns = "input_price_usd_per_million, output_price_usd_per_million";
  const [current, due] = await Promise.all([
    admin
      .from("ai_pricing_settings")
      .select(`${columns}, updated_at`)
      .eq("model_id", modelId)
      .maybeSingle(),
    admin
      .from("ai_pricing_schedule")
      .select(`${columns}, effective_from`)
      .eq("model_id", modelId)
      .lte("effective_from", new Date().toISOString())
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return pickEffectivePricing<LivePricingRow>(
    current.data
      ? { ...current.data, effective_since: current.data.updated_at ?? null }
      : null,
    due.data ? { ...due.data, effective_since: due.data.effective_from } : null,
  );
}

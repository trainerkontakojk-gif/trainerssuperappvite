import {
  isMissingPricingScheduleTable,
  pickEffectivePricing,
} from "@trainers/types";
import type { createAdminClient } from "./supabase";
import {
  isMissingRealtimePricingColumn,
  REALTIME_PRICING_COLUMNS,
} from "./pricing-contract";

type AdminClient = ReturnType<typeof createAdminClient>;

export type EffectivePricingRow = {
  input_price_usd_per_million: number | null;
  output_price_usd_per_million: number | null;
  effective_since: string | null;
} & Partial<Record<(typeof REALTIME_PRICING_COLUMNS)[number], number | null>>;

const LEGACY_COLUMNS =
  "input_price_usd_per_million, output_price_usd_per_million";
const PRICE_COLUMNS = `${LEGACY_COLUMNS}, ${REALTIME_PRICING_COLUMNS.join(", ")}`;

async function readCurrentPricing(
  admin: AdminClient,
  modelId: string,
): Promise<EffectivePricingRow | null> {
  const read = (columns: string) =>
    admin
      .from("ai_pricing_settings")
      .select(`${columns}, updated_at`)
      .eq("model_id", modelId)
      .maybeSingle();
  let result = await read(PRICE_COLUMNS);
  if (result.error && isMissingRealtimePricingColumn(result.error)) {
    result = await read(LEGACY_COLUMNS);
  }
  if (result.error) throw result.error;
  if (!result.data) return null;
  const { updated_at, ...prices } = result.data as unknown as Record<
    string,
    number | string | null
  >;
  return {
    ...(prices as Omit<EffectivePricingRow, "effective_since">),
    effective_since: typeof updated_at === "string" ? updated_at : null,
  };
}

async function readDueSchedule(
  admin: AdminClient,
  modelId: string,
  at: Date,
): Promise<EffectivePricingRow | null> {
  const { data, error } = await admin
    .from("ai_pricing_schedule")
    .select(`${PRICE_COLUMNS}, effective_from`)
    .eq("model_id", modelId)
    .lte("effective_from", at.toISOString())
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingPricingScheduleTable(error)) return null;
    throw error;
  }
  if (!data) return null;
  const { effective_from, ...prices } = data as unknown as Record<
    string,
    number | string | null
  >;
  return {
    ...(prices as Omit<EffectivePricingRow, "effective_since">),
    effective_since: effective_from as string,
  };
}

/** Price in effect for `modelId` at `at`: see `pickEffectivePricing`. */
export async function readEffectivePricing(
  admin: AdminClient,
  modelId: string,
  at = new Date(),
): Promise<EffectivePricingRow | null> {
  const [current, due] = await Promise.all([
    readCurrentPricing(admin, modelId),
    readDueSchedule(admin, modelId, at),
  ]);
  return pickEffectivePricing(current, due);
}

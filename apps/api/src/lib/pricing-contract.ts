import { z } from "zod";

export const REALTIME_PRICING_COLUMNS = [
  "input_text_price_usd_per_million",
  "cached_input_text_price_usd_per_million",
  "input_audio_price_usd_per_million",
  "cached_input_audio_price_usd_per_million",
  "output_text_price_usd_per_million",
  "output_audio_price_usd_per_million",
] as const;

const nonNegativeRate = z.number().finite().min(0);

export const pricingUpsertSchema = z.object({
  model_id: z.string(),
  input_price_usd_per_million: nonNegativeRate,
  output_price_usd_per_million: nonNegativeRate,
  input_text_price_usd_per_million: nonNegativeRate.nullable().optional(),
  cached_input_text_price_usd_per_million: nonNegativeRate
    .nullable()
    .optional(),
  input_audio_price_usd_per_million: nonNegativeRate.nullable().optional(),
  cached_input_audio_price_usd_per_million: nonNegativeRate
    .nullable()
    .optional(),
  output_text_price_usd_per_million: nonNegativeRate.nullable().optional(),
  output_audio_price_usd_per_million: nonNegativeRate.nullable().optional(),
});

export function isMissingRealtimePricingColumn(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string };
  if (candidate.code !== "42703" && candidate.code !== "PGRST204") return false;
  const message = String(candidate.message ?? "").toLowerCase();
  return REALTIME_PRICING_COLUMNS.some((column) => message.includes(column));
}

export function buildPricingUpsertPayload(
  body: z.infer<typeof pricingUpsertSchema>,
  updatedAt: string,
) {
  const modalityRates = Object.fromEntries(
    REALTIME_PRICING_COLUMNS.flatMap((column) =>
      Object.prototype.hasOwnProperty.call(body, column)
        ? [[column, body[column]]]
        : [],
    ),
  );
  return {
    model_id: body.model_id,
    input_price_usd_per_million: body.input_price_usd_per_million,
    output_price_usd_per_million: body.output_price_usd_per_million,
    ...modalityRates,
    updated_at: updatedAt,
  };
}

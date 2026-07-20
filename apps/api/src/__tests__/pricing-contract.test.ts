import { describe, expect, it } from "vitest";
import {
  buildPricingUpsertPayload,
  isMissingRealtimePricingColumn,
  pricingUpsertSchema,
} from "../lib/pricing-contract";

const legacyPayload = {
  model_id: "gemini-3.1-flash-lite",
  input_price_usd_per_million: 1,
  output_price_usd_per_million: 2,
};

describe("monitoring pricing contract", () => {
  it("keeps legacy payloads valid without erasing modality rates", () => {
    const parsed = pricingUpsertSchema.parse(legacyPayload);
    expect(buildPricingUpsertPayload(parsed, "2026-07-18T00:00:00.000Z")).toEqual({
      ...legacyPayload,
      updated_at: "2026-07-18T00:00:00.000Z",
    });
  });

  it("accepts six non-negative realtime rates and preserves explicit null", () => {
    const parsed = pricingUpsertSchema.parse({
      ...legacyPayload,
      input_text_price_usd_per_million: 4,
      cached_input_text_price_usd_per_million: 0.4,
      input_audio_price_usd_per_million: 32,
      cached_input_audio_price_usd_per_million: null,
      output_text_price_usd_per_million: 24,
      output_audio_price_usd_per_million: 64,
    });
    expect(buildPricingUpsertPayload(parsed, "now")).toMatchObject({
      input_text_price_usd_per_million: 4,
      cached_input_audio_price_usd_per_million: null,
      output_audio_price_usd_per_million: 64,
    });
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid rates (%s)",
    (rate) => {
      expect(
        pricingUpsertSchema.safeParse({
          ...legacyPayload,
          input_audio_price_usd_per_million: rate,
        }).success,
      ).toBe(false);
    },
  );

  it("retries only missing expanded pricing columns", () => {
    expect(
      isMissingRealtimePricingColumn({
        code: "PGRST204",
        message: "cached_input_audio_price_usd_per_million missing from schema cache",
      }),
    ).toBe(true);
    expect(
      isMissingRealtimePricingColumn({ code: "42501", message: "denied" }),
    ).toBe(false);
  });
});

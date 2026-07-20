import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL(
    "../../../../supabase/migrations/20260717231616_telefun_openai_realtime_modality_pricing.sql",
    import.meta.url,
  ),
);
const migrationSql = readFileSync(migrationPath, "utf8");

describe("Telefun OpenAI realtime pricing migration", () => {
  it("adds six pricing rates and cached usage snapshots additively", () => {
    for (const column of [
      "input_text_price_usd_per_million",
      "cached_input_text_price_usd_per_million",
      "input_audio_price_usd_per_million",
      "cached_input_audio_price_usd_per_million",
      "output_text_price_usd_per_million",
      "output_audio_price_usd_per_million",
      "cached_input_text_tokens",
      "cached_input_audio_tokens",
      "cached_input_tokens",
      "billing_model",
    ]) {
      expect(migrationSql).toContain(`ADD COLUMN IF NOT EXISTS ${column}`);
    }
  });

  it("seeds both canonical model IDs with the verified modality rates", () => {
    expect(migrationSql).toContain("gpt-realtime-2.1");
    expect(migrationSql).toContain("gpt-realtime-2.1-mini");
    expect(migrationSql).toContain("ON CONFLICT (model_id) DO UPDATE");
    expect(migrationSql).toMatch(
      /'gpt-realtime-2\.1',\s*4(?:\.0+)?,\s*24(?:\.0+)?,\s*4(?:\.0+)?,\s*0\.4(?:0+)?,\s*32(?:\.0+)?,\s*0\.4(?:0+)?,\s*24(?:\.0+)?,\s*64(?:\.0+)?/,
    );
    expect(migrationSql).toMatch(
      /'gpt-realtime-2\.1-mini',\s*0\.6(?:0+)?,\s*2\.4(?:0+)?,\s*0\.6(?:0+)?,\s*0\.06,\s*10(?:\.0+)?,\s*0\.3(?:0+)?,\s*2\.4(?:0+)?,\s*20(?:\.0+)?/,
    );
  });

  it("keeps the reconciliation view RLS-aware and subtracts cached tokens from full-rate inputs", () => {
    expect(migrationSql).toContain("WITH (security_invoker = true)");
    expect(migrationSql).toMatch(
      /GREATEST\(COALESCE\(l\.input_text_tokens, 0\) - COALESCE\(l\.cached_input_text_tokens, 0\), 0\)/,
    );
    expect(migrationSql).toMatch(
      /GREATEST\(COALESCE\(l\.input_audio_tokens, 0\) - COALESCE\(l\.cached_input_audio_tokens, 0\), 0\)/,
    );
    expect(migrationSql).toContain(
      "COALESCE(l.cached_input_text_price_usd_per_million, l.input_text_price_usd_per_million)",
    );
    expect(migrationSql).toContain(
      "COALESCE(l.cached_input_audio_price_usd_per_million, l.input_audio_price_usd_per_million)",
    );
    expect(migrationSql).toContain("l.cached_input_tokens IS NULL");
    expect(migrationSql).toContain(
      "COALESCE(l.cached_input_text_tokens, 0) + COALESCE(l.cached_input_audio_tokens, 0) <> l.cached_input_tokens",
    );
    expect(migrationSql).toContain(
      "COALESCE(l.input_text_tokens, 0) + COALESCE(l.input_audio_tokens, 0) <> l.input_tokens",
    );
    expect(migrationSql).toContain(
      "COALESCE(l.output_text_tokens, 0) + COALESCE(l.output_audio_tokens, 0) <> l.output_tokens",
    );
    expect(migrationSql).toContain(
      "l.input_tokens + l.output_tokens <> l.total_tokens",
    );
    expect(migrationSql).toContain(
      "WHEN NOT openai_usage_breakdown_valid THEN NULL",
    );
  });
});

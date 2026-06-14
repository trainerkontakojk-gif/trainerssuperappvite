import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("SIDAK dashboard forecast snapshot migration", () => {
  const migrationPath = resolve(
    __dirname,
    "../../../../supabase/migrations/20260614090000_sidak_dashboard_forecast_snapshots.sql",
  );

  it("creates a service-role-only persisted snapshot contract", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS public\.sidak_dashboard_forecast_snapshots/i,
    );
    expect(sql).toMatch(/payload JSONB NOT NULL/i);
    expect(sql).toMatch(
      /UNIQUE\s*\(filter_key,\s*data_fingerprint,\s*horizon_months\)/i,
    );
    expect(sql).toMatch(
      /ALTER TABLE public\.sidak_dashboard_forecast_snapshots ENABLE ROW LEVEL SECURITY/i,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON public\.sidak_dashboard_forecast_snapshots FROM PUBLIC,\s*anon,\s*authenticated/i,
    );
    expect(sql).toMatch(
      /GRANT ALL ON public\.sidak_dashboard_forecast_snapshots TO service_role/i,
    );
  });
});

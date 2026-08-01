// Merged dari sidak-profiler-lookup-indexes / sidak-slik-subparameters / sidak-dashboard-forecast (konsolidasi fragmentasi)
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("current SIDAK/Profiler lookup indexes migration", () => {
  const migrationPath = resolve(
    __dirname,
    "../../../../supabase/migrations/20260630003553_add_current_sidak_profiler_lookup_indexes.sql",
  );

  const sql = readFileSync(migrationPath, "utf8");

  it("adds only the currently used folder hierarchy and summary refresh indexes", () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_profiler_folders_parent_name_id\s+ON public\.profiler_folders\(parent_id,\s*name,\s*id\)/i,
    );
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_qa_dashboard_period_summary_folder_period\s+ON public\.qa_dashboard_period_summary\(folder_id,\s*period_id\)/i,
    );
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_qa_dashboard_agent_period_summary_period_service\s+ON public\.qa_dashboard_agent_period_summary\(period_id,\s*service_type\)/i,
    );
  });

  it("does not sweep unrelated Supabase advisor findings into this migration", () => {
    expect(sql).not.toMatch(/profiler_folders\(trainer_id/i);
    expect(sql).not.toMatch(/profiler_folders\(year_id/i);
    expect(sql).not.toMatch(
      /access_groups|activity_logs|ketik_|pdkt_|reports/i,
    );
  });
});

const migrationPath = resolve(
  __dirname,
  "../../../../supabase/migrations/20260716160000_add_slik_qa_subparameters.sql",
);
const seedPath = resolve(
  __dirname,
  "../../../../supabase/seeds/005_qa_indicators.sql",
);
const publishMigrationPath = resolve(
  __dirname,
  "../../../../supabase/migrations/20260716163000_publish_slik_subparameter_baseline_january.sql",
);

const sql = readFileSync(migrationPath, "utf8");

describe("SLIK sub-parameter migration", () => {
  it("defines exactly 13 scored leaves with 100% weight inside each category", () => {
    const tuplePattern =
      /\(\s*(?:NULL|'[^']*'),\s*'([^']+)',\s*'(non_critical|critical)',\s*(0\.\d+)::numeric,\s*false,\s*(\d+)\s*\)/g;
    const rows = Array.from(sql.matchAll(tuplePattern)).map((match) => ({
      name: match[1],
      category: match[2],
      bobot: Number(match[3]),
      sortOrder: Number(match[4]),
    }));

    expect(rows).toHaveLength(13);
    expect(
      rows
        .filter((row) => row.category === "non_critical")
        .reduce((sum, row) => sum + row.bobot, 0),
    ).toBeCloseTo(1, 5);
    expect(
      rows
        .filter((row) => row.category === "critical")
        .reduce((sum, row) => sum + row.bobot, 0),
    ).toBeCloseTo(1, 5);
    expect(rows.map((row) => row.sortOrder)).toEqual([
      10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130,
    ]);
  });

  it("preserves published history and prepares only a draft revision", () => {
    expect(sql).toMatch(/status\s*=\s*'draft'/i);
    expect(sql).toMatch(/created_from_version_id/i);
    expect(sql).toMatch(/published snapshot remains immutable/i);
    expect(sql).not.toMatch(
      /UPDATE\s+public\.qa_service_rule_indicators[\s\S]*status\s*=\s*'published'/i,
    );
  });

  it("deactivates legacy SLIK master rows and keeps future drafts canonical", () => {
    expect(sql).toMatch(
      /UPDATE public\.qa_indicators\s+SET is_active = false\s+WHERE service_type = 'slik'/i,
    );
    expect(sql).toMatch(/indicator\.is_active = true/i);
    expect(sql).toMatch(/uq_qa_indicators_service_group_name/i);
  });

  it("keeps post-migration seeds compatible with grouped uniqueness", () => {
    const seedSql = readFileSync(seedPath, "utf8");
    expect(seedSql).toContain("ON CONFLICT DO NOTHING");
    expect(seedSql).not.toContain("ON CONFLICT (service_type, name)");
  });

  it("promotes the canonical template as a guarded January baseline", () => {
    const publishSql = readFileSync(publishMigrationPath, "utf8");

    expect(publishSql).toMatch(/month = 1[\s\S]*year = 2026/i);
    expect(publishSql).toMatch(/WHERE service_type = 'slik'/i);
    expect(publishSql).toMatch(/IF existing_findings > 0/i);
    expect(publishSql).toMatch(/\) <> 13 THEN/i);
    expect(publishSql).toMatch(/status = 'superseded'/i);
    expect(publishSql).toMatch(/status = 'published'/i);
  });
});

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

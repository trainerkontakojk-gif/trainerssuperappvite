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
    expect(sql).not.toMatch(/access_groups|activity_logs|ketik_|pdkt_|reports/i);
  });
});

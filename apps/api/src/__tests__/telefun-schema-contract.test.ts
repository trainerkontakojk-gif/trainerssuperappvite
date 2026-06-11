import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

describe("Telefun schema contract", () => {
  it("declares every telefun_history column written by the API", () => {
    const migrationsDir = join(process.cwd(), "../../supabase/migrations");
    const sql = readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .map((file) => readFileSync(join(migrationsDir, file), "utf8"))
      .join("\n");

    for (const column of [
      "recording_path",
      "agent_recording_path",
      "session_metrics",
      "voice_dashboard_metrics",
      "disruption_results",
      "persona_config",
      "realistic_mode_enabled",
      "score",
      "feedback",
    ]) {
      expect(sql.toLowerCase()).toContain(column);
    }
  });

  it("contains terminal migration that drops the legacy 2-argument upsert_telefun_coaching_summary overload", () => {
    const migrationsDir = join(process.cwd(), "../../supabase/migrations");
    const migrationName =
      "20260611100000_fix_telefun_coaching_summary_rpc_contract.sql";
    const sql = readFileSync(join(migrationsDir, migrationName), "utf8");

    expect(sql).toContain(
      "DROP FUNCTION IF EXISTS public.upsert_telefun_coaching_summary(UUID, JSONB);",
    );
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.upsert_telefun_coaching_summary(UUID, JSONB, INTEGER, TEXT)",
    );
    expect(sql).toContain("FROM public, anon;");
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.upsert_telefun_coaching_summary(UUID, JSONB, INTEGER, TEXT)",
    );
    expect(sql).toContain("TO authenticated, service_role;");

    const laterDefinitions = readdirSync(migrationsDir)
      .filter((file) => file > migrationName && file.endsWith(".sql"))
      .map((file) => readFileSync(join(migrationsDir, file), "utf8"))
      .join("\n");
    expect(laterDefinitions).not.toContain(
      "FUNCTION public.upsert_telefun_coaching_summary",
    );
  });

  it("keeps metadata defaults on the final coaching summary signature", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "../../supabase/migrations/20260523000000_telefun_parity_extensions.sql",
      ),
      "utf8",
    );

    expect(migration).toMatch(
      /p_ai_annotation_count INTEGER DEFAULT NULL,\s+p_ai_annotation_checksum TEXT DEFAULT NULL/,
    );
  });
});

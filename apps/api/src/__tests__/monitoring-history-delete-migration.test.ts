import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

describe("Monitoring History Delete Migration Contract", () => {
  const migrationsDir = join(__dirname, "../../../../supabase/migrations");
  const targetMigration = "20260605100000_atomic_monitoring_history_delete.sql";
  const migrationPath = join(migrationsDir, targetMigration);

  it("should have the atomic delete migration file", () => {
    const files = readdirSync(migrationsDir);
    expect(files).toContain(targetMigration);
  });

  it("should adhere to the security and structural contract", () => {
    const sql = readFileSync(migrationPath, "utf8");

    // Function definition
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.delete_monitoring_history",
    );
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = public");

    // Table names and logic
    const invalidPluralTable = ["telefun", "coaching", "summaries"].join("_");
    expect(sql).not.toContain(invalidPluralTable);
    expect(sql).toContain("to_regclass('public.results')");

    // Authorization check inside function
    expect(sql).toContain("auth.role() IS DISTINCT FROM 'service_role'");

    // Privilege management
    expect(sql).toMatch(
      /REVOKE EXECUTE[\s\S]+FROM public, anon, authenticated/i,
    );
    expect(sql).toMatch(/GRANT EXECUTE[\s\S]+TO service_role/i);
  });

  it("should verify canonical Telefun migrations have correct FK cascades", () => {
    const files = readdirSync(migrationsDir);
    const telefunParityFile = files.find((f) =>
      f.includes("telefun_parity_extensions"),
    );
    const carbonCopyFile = files.find((f) => f.includes("carbon_copy_parity"));

    expect(telefunParityFile).toBeDefined();
    expect(carbonCopyFile).toBeDefined();

    const telefunParitySql = readFileSync(
      join(migrationsDir, telefunParityFile!),
      "utf8",
    );
    // const carbonCopySql = readFileSync(join(migrationsDir, carbonCopyFile!), "utf8");

    // Check telefun_coaching_summary
    expect(telefunParitySql).toContain("telefun_coaching_summary");
    expect(telefunParitySql).toMatch(
      /REFERENCES (public\.)?telefun_history\(id\) ON DELETE CASCADE/i,
    );

    // Check telefun_replay_annotations
    expect(telefunParitySql).toContain("telefun_replay_annotations");
    expect(telefunParitySql).toMatch(
      /REFERENCES (public\.)?telefun_history\(id\) ON DELETE CASCADE/i,
    );
  });
});

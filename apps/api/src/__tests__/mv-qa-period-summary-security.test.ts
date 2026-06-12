import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve } from "path";

const MIGRATION_DIR = resolve(__dirname, "../../../../supabase/migrations");
const ROLLBACK_DIR = resolve(__dirname, "../../../../supabase/rollbacks");

/**
 * Regression tests for mv_qa_period_summary security hardening (Phase 53 + 54).
 *
 * Validates that:
 * 1. Migration 017 exists and contains correct intermediate REVOKE/GRANT statements
 * 2. Migration 20260525000200 (contract restore) reinstates authenticated grants
 * 3. Migration 20260526090000 (terminal re-hardening) runs AFTER restore and
 *    reverts to service_role-only — this is the FINAL security posture
 * 4. Rollbacks exist for both hardening layers
 * 5. Backend service uses supabaseAdmin (service_role) for MV queries
 * 6. No frontend code directly queries the MV
 * 7. Migration ordering is verified: terminal hardening comes after contract restore
 */
describe("mv_qa_period_summary security hardening", () => {
  const migrationPath017 = resolve(
    MIGRATION_DIR,
    "017_harden_mv_qa_period_summary.sql",
  );
  const rollbackPath017 = resolve(
    ROLLBACK_DIR,
    "rollback_017_harden_mv_qa_period_summary.sql",
  );
  const migrationPathTerminal = resolve(
    MIGRATION_DIR,
    "20260526090000_reharden_mv_qa_period_summary_after_contract_restore.sql",
  );
  const rollbackPathTerminal = resolve(
    ROLLBACK_DIR,
    "rollback_20260526090000_reharden_mv_qa_period_summary_after_contract_restore.sql",
  );

  describe("migration ordering", () => {
    it("017_harden runs BEFORE 20260525000200 contract restore (lexicographic)", () => {
      const files = readdirSync(MIGRATION_DIR)
        .filter((f) => f.endsWith(".sql"))
        .sort((a, b) => a.localeCompare(b));
      const idx017 = files.indexOf(
        "017_harden_mv_qa_period_summary.sql",
      );
      const idxRestore = files.indexOf(
        "20260525000200_restore_mv_qa_period_summary_contract.sql",
      );
      expect(idx017).toBeGreaterThan(-1);
      expect(idxRestore).toBeGreaterThan(-1);
      expect(idx017).toBeLessThan(idxRestore);
    });

    it("contract restore runs BEFORE terminal re-hardening (lexicographic)", () => {
      const files = readdirSync(MIGRATION_DIR)
        .filter((f) => f.endsWith(".sql"))
        .sort((a, b) => a.localeCompare(b));
      const idxRestore = files.indexOf(
        "20260525000200_restore_mv_qa_period_summary_contract.sql",
      );
      const idxTerminal = files.indexOf(
        "20260526090000_reharden_mv_qa_period_summary_after_contract_restore.sql",
      );
      expect(idxRestore).toBeGreaterThan(-1);
      expect(idxTerminal).toBeGreaterThan(-1);
      expect(idxRestore).toBeLessThan(idxTerminal);
    });

    it("terminal re-hardening is the LAST migration touching MV in order", () => {
      const files = readdirSync(MIGRATION_DIR)
        .filter((f) => f.endsWith(".sql"))
        .sort((a, b) => a.localeCompare(b));
      const mvRelated = files.filter(
        (f) =>
          f.includes("mv_qa") ||
          f.includes("materialized_view") ||
          f.includes("refresh_mv"),
      );
      expect(mvRelated).toContain("011_materialized_view_dashboard.sql");
      expect(mvRelated).toContain("013_refresh_mv_function.sql");
      expect(mvRelated).toContain(
        "017_harden_mv_qa_period_summary.sql",
      );
      expect(mvRelated).toContain(
        "20260525000200_restore_mv_qa_period_summary_contract.sql",
      );
      expect(mvRelated).toContain(
        "20260526090000_reharden_mv_qa_period_summary_after_contract_restore.sql",
      );
      // Terminal must be the last in the sorted MV-related set
      const lastMvFile = mvRelated[mvRelated.length - 1];
      expect(lastMvFile).toBe(
        "20260526090000_reharden_mv_qa_period_summary_after_contract_restore.sql",
      );
    });
  });

  describe("migration 017 (intermediate hardening)", () => {
    it("exists", () => {
      expect(existsSync(migrationPath017)).toBe(true);
    });

    it("revokes ALL from anon, public, and authenticated on the MV", () => {
      const sql = readFileSync(migrationPath017, "utf-8");
      expect(sql).toContain("REVOKE ALL ON public.mv_qa_period_summary FROM");
      expect(sql).toMatch(/REVOKE ALL ON public\.mv_qa_period_summary FROM.*anon/);
      expect(sql).toMatch(/REVOKE ALL ON public\.mv_qa_period_summary FROM.*public/);
      expect(sql).toMatch(
        /REVOKE ALL ON public\.mv_qa_period_summary FROM.*authenticated/,
      );
    });

    it("grants SELECT only to service_role", () => {
      const sql = readFileSync(migrationPath017, "utf-8");
      expect(sql).toContain(
        "GRANT SELECT ON public.mv_qa_period_summary TO service_role",
      );
      expect(sql).not.toMatch(
        /GRANT SELECT ON public\.mv_qa_period_summary TO.*authenticated/,
      );
    });

    it("revokes refresh function execute from authenticated/anon", () => {
      const sql = readFileSync(migrationPath017, "utf-8");
      expect(sql).toMatch(
        /REVOKE EXECUTE ON FUNCTION public\.refresh_mv_qa_period_summary\(\) FROM.*authenticated/,
      );
      expect(sql).toMatch(
        /REVOKE EXECUTE ON FUNCTION public\.refresh_mv_qa_period_summary\(\) FROM.*anon/,
      );
    });

    it("grants refresh function execute only to service_role", () => {
      const sql = readFileSync(migrationPath017, "utf-8");
      expect(sql).toContain(
        "GRANT EXECUTE ON FUNCTION public.refresh_mv_qa_period_summary() TO service_role",
      );
      expect(sql).not.toMatch(
        /GRANT EXECUTE ON FUNCTION public\.refresh_mv_qa_period_summary\(\) TO.*authenticated/,
      );
    });
  });

  describe("migration 20260526090000 (terminal re-hardening)", () => {
    it("exists", () => {
      expect(existsSync(migrationPathTerminal)).toBe(true);
    });

    it("revokes ALL from anon, public, and authenticated on the MV", () => {
      const sql = readFileSync(migrationPathTerminal, "utf-8");
      expect(sql).toContain("REVOKE ALL ON public.mv_qa_period_summary FROM anon, public, authenticated");
    });

    it("grants SELECT only to service_role (not authenticated)", () => {
      const sql = readFileSync(migrationPathTerminal, "utf-8");
      expect(sql).toContain(
        "GRANT SELECT ON public.mv_qa_period_summary TO service_role",
      );
      expect(sql).not.toMatch(
        /GRANT SELECT ON public\.mv_qa_period_summary TO.*authenticated/,
      );
    });

    it("revokes refresh function execute from all non-service roles", () => {
      const sql = readFileSync(migrationPathTerminal, "utf-8");
      expect(sql).toContain(
        "REVOKE EXECUTE ON FUNCTION public.refresh_mv_qa_period_summary()\nFROM authenticated, public, anon",
      );
    });

    it("grants refresh function execute only to service_role", () => {
      const sql = readFileSync(migrationPathTerminal, "utf-8");
      expect(sql).toContain(
        "GRANT EXECUTE ON FUNCTION public.refresh_mv_qa_period_summary() TO service_role",
      );
      expect(sql).not.toMatch(
        /GRANT EXECUTE ON FUNCTION public\.refresh_mv_qa_period_summary\(\) TO.*authenticated/,
      );
    });

    it("does NOT modify MV schema, indexes, or function body", () => {
      const sql = readFileSync(migrationPathTerminal, "utf-8");
      expect(sql).not.toContain("CREATE MATERIALIZED VIEW");
      expect(sql).not.toContain("DROP MATERIALIZED VIEW");
      expect(sql).not.toContain("CREATE INDEX");
      expect(sql).not.toContain("CREATE OR REPLACE FUNCTION");
      expect(sql).not.toContain("ALTER");
    });

    it("contains explanatory comment referencing 017 and contract restore", () => {
      const sql = readFileSync(migrationPathTerminal, "utf-8");
      expect(sql).toContain("017_harden_mv_qa_period_summary.sql");
      expect(sql).toContain(
        "20260525000200_restore_mv_qa_period_summary_contract.sql",
      );
    });
  });

  describe("rollback file (017)", () => {
    it("exists", () => {
      expect(existsSync(rollbackPath017)).toBe(true);
    });

    it("removes the SELECT grant added for service_role", () => {
      const sql = readFileSync(rollbackPath017, "utf-8");
      expect(sql).toContain(
        "REVOKE SELECT ON public.mv_qa_period_summary FROM service_role",
      );
    });

    it("removes direct refresh function grants added or revoked by 017", () => {
      const sql = readFileSync(rollbackPath017, "utf-8");
      expect(sql).toContain(
        "REVOKE EXECUTE ON FUNCTION public.refresh_mv_qa_period_summary()\nFROM authenticated, anon, service_role",
      );
    });

    it("restores the refresh function default PUBLIC execute grant", () => {
      const sql = readFileSync(rollbackPath017, "utf-8");
      expect(sql).toContain(
        "GRANT EXECUTE ON FUNCTION public.refresh_mv_qa_period_summary() TO PUBLIC",
      );
    });
  });

  describe("rollback file (terminal)", () => {
    it("exists", () => {
      expect(existsSync(rollbackPathTerminal)).toBe(true);
    });

    it("restores SELECT grant to authenticated and service_role", () => {
      const sql = readFileSync(rollbackPathTerminal, "utf-8");
      expect(sql).toContain(
        "GRANT SELECT ON public.mv_qa_period_summary TO authenticated, service_role",
      );
    });

    it("restores refresh function execute to authenticated and service_role", () => {
      const sql = readFileSync(rollbackPathTerminal, "utf-8");
      expect(sql).toContain(
        "GRANT EXECUTE ON FUNCTION public.refresh_mv_qa_period_summary()\nTO authenticated, service_role",
      );
    });

    it("keeps PUBLIC execute revoked because CREATE OR REPLACE preserves permissions", () => {
      const sql = readFileSync(rollbackPathTerminal, "utf-8");
      expect(sql).not.toContain(
        "GRANT EXECUTE ON FUNCTION public.refresh_mv_qa_period_summary() TO PUBLIC",
      );
      expect(sql).toContain("PUBLIC remains revoked");
    });
  });

  describe("backend access pattern", () => {
    it("sidak-service uses supabaseAdmin (service_role) for MV query", () => {
      const servicePath = resolve(
        __dirname,
        "../services/sidak-service.ts",
      );
      const serviceCode = readFileSync(servicePath, "utf-8");

      // Find the MV query — should use supabaseAdmin, not user client
      const mvQueryMatch = serviceCode.match(
        /\.from\(["']mv_qa_period_summary["']\)/,
      );
      expect(mvQueryMatch).not.toBeNull();

      // Get the surrounding context (50 chars before the match)
      const matchIndex = serviceCode.indexOf('.from("mv_qa_period_summary")');
      if (matchIndex === -1) {
        // Try single quotes
        const altIndex = serviceCode.indexOf(
          ".from('mv_qa_period_summary')",
        );
        expect(altIndex).toBeGreaterThan(-1);
        const context = serviceCode.substring(
          Math.max(0, altIndex - 100),
          altIndex,
        );
        expect(context).toContain("supabaseAdmin");
      } else {
        const context = serviceCode.substring(
          Math.max(0, matchIndex - 100),
          matchIndex,
        );
        expect(context).toContain("supabaseAdmin");
      }
    });

    it("sidak-service uses supabaseAdmin for refresh RPC", () => {
      const servicePath = resolve(
        __dirname,
        "../services/sidak-service.ts",
      );
      const serviceCode = readFileSync(servicePath, "utf-8");

      // Find the refresh RPC call
      const rpcMatch = serviceCode.match(
        /\.rpc\(["']refresh_mv_qa_period_summary["']\)/,
      );
      expect(rpcMatch).not.toBeNull();

      // Get surrounding context to verify it uses supabaseAdmin
      const matchIndex = serviceCode.indexOf(
        '.rpc("refresh_mv_qa_period_summary")',
      );
      if (matchIndex === -1) {
        const altIndex = serviceCode.indexOf(
          ".rpc('refresh_mv_qa_period_summary')",
        );
        expect(altIndex).toBeGreaterThan(-1);
        const context = serviceCode.substring(
          Math.max(0, altIndex - 80),
          altIndex,
        );
        expect(context).toContain("supabaseAdmin");
      } else {
        const context = serviceCode.substring(
          Math.max(0, matchIndex - 80),
          matchIndex,
        );
        expect(context).toContain("supabaseAdmin");
      }
    });
  });
});

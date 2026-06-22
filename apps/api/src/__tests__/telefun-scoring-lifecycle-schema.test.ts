import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

describe("Telefun scoring lifecycle migration contract", () => {
  const migrationsDir = join(process.cwd(), "../../supabase/migrations");
  const migrationName = "20260611200000_telefun_scoring_lifecycle.sql";
  const migrationPath = join(migrationsDir, migrationName);

  it("exists before the retry queue migration that extends its contract", () => {
    const sqlFiles = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const retryMigration = "20260611201000_telefun_scoring_retry_queue.sql";
    expect(sqlFiles.indexOf(migrationName)).toBeGreaterThanOrEqual(0);
    expect(sqlFiles.indexOf(retryMigration)).toBeGreaterThan(
      sqlFiles.indexOf(migrationName),
    );
  });

  it("adds scoring lifecycle columns to telefun_history", () => {
    const sql = readFileSync(migrationPath, "utf8");
    const columns = [
      "scoring_status",
      "scoring_claimed_at",
      "scoring_completed_at",
      "scoring_attempt_count",
      "scoring_last_error",
    ];
    for (const col of columns) {
      expect(sql.toLowerCase()).toContain(col);
    }
  });

  it("declares CHECK constraint on scoring_status with valid enum values", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/scoring_status[\s\S]*CHECK[\s\S]*IN[\s\S]*pending[\s\S]*processing[\s\S]*completed[\s\S]*failed/i);
  });

  it("declares claim_telefun_scoring RPC with correct signature", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("claim_telefun_scoring");
    expect(sql).toContain("p_session_id UUID");
    expect(sql).toContain("p_claim_timeout_seconds INT DEFAULT 120");
    expect(sql).toContain("RETURNS BOOLEAN");
    expect(sql).toContain("SECURITY DEFINER");
  });

  it("declares complete_telefun_scoring RPC with correct signature", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("complete_telefun_scoring");
    expect(sql).toContain("p_session_id UUID");
    expect(sql).toContain("p_score NUMERIC");
    expect(sql).toContain("p_voice_assessment JSONB DEFAULT NULL");
    expect(sql).toContain("RETURNS BOOLEAN");
    expect(sql).toContain("SECURITY DEFINER");
  });

  it("declares fail_telefun_scoring RPC with correct signature", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("fail_telefun_scoring");
    expect(sql).toContain("p_session_id UUID");
    expect(sql).toContain("p_error TEXT");
    expect(sql).toContain("RETURNS BOOLEAN");
    expect(sql).toContain("SECURITY DEFINER");
  });

  it("grants EXECUTE to service_role only for mutation RPCs (not public/anon/authenticated)", () => {
    const sql = readFileSync(migrationPath, "utf8");
    // REVOKE FROM public, anon
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.claim_telefun_scoring");
    expect(sql).toContain("FROM public, anon");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.complete_telefun_scoring");
    expect(sql).toContain("FROM public, anon");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.fail_telefun_scoring");
    expect(sql).toContain("FROM public, anon");
    // GRANT TO service_role
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.claim_telefun_scoring");
    expect(sql).toContain("TO service_role");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.complete_telefun_scoring");
    expect(sql).toContain("TO service_role");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.fail_telefun_scoring");
    expect(sql).toContain("TO service_role");
    // authenticated must NOT have mutation RPC grants
    const authGrants = sql.match(/TO authenticated/g);
    expect(authGrants).toBeNull();
  });

  it("claim RPC implements stale-procession recovery based on timeout", () => {
    const sql = readFileSync(migrationPath, "utf8");
    // Check that the claim logic handles 'pending' and 'failed' statuses
    expect(sql).toContain("v_current_status = 'completed'");
    expect(sql).toContain("v_current_status = 'processing'");
    // Check stale timeout logic
    expect(sql).toContain("p_claim_timeout_seconds");
    expect(sql).toContain("v_now - v_claimed_at");
  });

  it("schema-qualifies telefun_history when search_path is empty", () => {
    const lifecycleSql = readFileSync(migrationPath, "utf8");
    const retrySql = readFileSync(
      join(migrationsDir, "20260611201000_telefun_scoring_retry_queue.sql"),
      "utf8",
    );

    for (const sql of [lifecycleSql, retrySql]) {
      expect(sql).toContain("FROM public.telefun_history");
      expect(sql).toContain("UPDATE public.telefun_history");
    }
  });

  it("only P1.6 retry queue and terminal repair migration re-define the lifecycle RPCs", () => {
    const retryFile = "20260611201000_telefun_scoring_retry_queue.sql";
    const terminalFile = "20260622150000_repair_telefun_scoring_lifecycle_contract.sql";
    const allowed = new Set([retryFile, terminalFile]);
    const allFiles = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql") && f > migrationName && !allowed.has(f))
      .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
      .join("\n");
    expect(allFiles).not.toMatch(/FUNCTION\s+public\.claim_telefun_scoring/i);
    expect(allFiles).not.toMatch(/FUNCTION\s+public\.complete_telefun_scoring/i);
    expect(allFiles).not.toMatch(/FUNCTION\s+public\.fail_telefun_scoring/i);
  });
});

describe("Telefun scoring status transition rules", () => {
  it("validates status transitions via CHECK constraint values", () => {
    const migrationPath = join(
      process.cwd(),
      "../../supabase/migrations/20260611200000_telefun_scoring_lifecycle.sql",
    );
    const sql = readFileSync(migrationPath, "utf8");

    // CHECK constraint must only allow pending, processing, completed, failed
    const allowed = ["pending", "processing", "completed", "failed"];
    for (const s of allowed) {
      expect(sql.toLowerCase()).toContain(s);
    }

    // Should not allow arbitrary status values
    expect(sql).not.toContain("'active'");
  });

  it("claim RPC only claims pending, failed, or stale processing", () => {
    const migrationPath = join(
      process.cwd(),
      "../../supabase/migrations/20260611200000_telefun_scoring_lifecycle.sql",
    );
    const sql = readFileSync(migrationPath, "utf8");

    // If completed, return false
    expect(sql).toMatch(/v_current_status\s*=\s*'completed'/);
    // If processing and not stale, return false
    expect(sql).toMatch(/v_current_status\s*=\s*'processing'/);
  });
});

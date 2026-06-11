import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

describe("Telefun scoring retry migration contract", () => {
  const migrationsDir = join(process.cwd(), "../../supabase/migrations");
  const p1Migration = "20260611200000_telefun_scoring_lifecycle.sql";
  const p16Migration = "20260611201000_telefun_scoring_retry_queue.sql";
  const p16Path = join(migrationsDir, p16Migration);

  it("exists after the P1.1 lifecycle migration", () => {
    const sqlFiles = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const idxP1 = sqlFiles.indexOf(p1Migration);
    const idxP16 = sqlFiles.indexOf(p16Migration);
    expect(idxP1).toBeGreaterThanOrEqual(0);
    expect(idxP16).toBeGreaterThan(idxP1);
  });

  it("adds scoring_next_attempt_at column to telefun_history", () => {
    const sql = readFileSync(p16Path, "utf8");
    expect(sql).toContain("scoring_next_attempt_at");
    expect(sql).toContain("TIMESTAMPTZ");
  });

  it("creates idx_telefun_scoring_retry_queue index", () => {
    const sql = readFileSync(p16Path, "utf8");
    expect(sql).toContain("idx_telefun_scoring_retry_queue");
    expect(sql).toContain("scoring_status IN ('pending', 'failed')");
  });

  it("updates claim_telefun_scoring to be next_attempt_at aware", () => {
    const sql = readFileSync(p16Path, "utf8");
    // Must select next_attempt_at
    expect(sql).toContain("scoring_next_attempt_at");
    // Must check next_attempt_at in the claim logic
    expect(sql).toContain("v_next_attempt > v_now");
    // Must clear next_attempt_at on claim
    expect(sql).toContain("scoring_next_attempt_at = NULL");
  });

  it("declares reschedule_telefun_scoring RPC with correct signature", () => {
    const sql = readFileSync(p16Path, "utf8");
    expect(sql).toContain("reschedule_telefun_scoring");
    expect(sql).toContain("p_session_id UUID");
    expect(sql).toContain("p_error TEXT");
    expect(sql).toContain("p_next_attempt_at TIMESTAMPTZ");
    expect(sql).toContain("RETURNS BOOLEAN");
    expect(sql).toContain("SECURITY DEFINER");
  });

  it("declares enqueue_telefun_scoring RPC with correct signature", () => {
    const sql = readFileSync(p16Path, "utf8");
    expect(sql).toContain("enqueue_telefun_scoring");
    expect(sql).toContain("p_session_id UUID");
    expect(sql).toContain("RETURNS BOOLEAN");
    expect(sql).toContain("SECURITY DEFINER");
  });

  it("enqueue_telefun_scoring only targets pending or failed sessions", () => {
    const sql = readFileSync(p16Path, "utf8");
    expect(sql).toContain("scoring_status IN ('pending', 'failed')");
    expect(sql).not.toContain("IS DISTINCT FROM 'completed'");
  });

  it("reschedule targets processing or failed sessions only", () => {
    const sql = readFileSync(p16Path, "utf8");
    expect(sql).toContain("scoring_status IN ('processing', 'failed')");
  });

  it("grants EXECUTE to service_role only for all RPCs", () => {
    const sql = readFileSync(p16Path, "utf8");
    // Revoke from public, anon
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.claim_telefun_scoring");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.complete_telefun_scoring");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.fail_telefun_scoring");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.reschedule_telefun_scoring");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.enqueue_telefun_scoring");
    // Grant to service_role
    const serviceGrants = sql.match(/GRANT EXECUTE ON FUNCTION .* TO service_role/g);
    expect(serviceGrants).toHaveLength(5);
    // No authenticated grants
    const authGrants = sql.match(/TO authenticated/g);
    expect(authGrants).toBeNull();
  });

  it("schema-qualifies telefun_history when search_path is empty", () => {
    const sql = readFileSync(p16Path, "utf8");
    expect(sql).toContain("FROM public.telefun_history");
    expect(sql).toContain("UPDATE public.telefun_history");
  });

  it("no later migration re-defines the same RPCs", () => {
    const allFiles = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql") && f > p16Migration)
      .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
      .join("\n");
    expect(allFiles).not.toMatch(/FUNCTION\s+public\.reschedule_telefun_scoring/i);
    expect(allFiles).not.toMatch(/FUNCTION\s+public\.enqueue_telefun_scoring/i);
  });
});

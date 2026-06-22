import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

describe("Telefun scoring repair migration contract", () => {
  const migrationsDir = join(process.cwd(), "../../supabase/migrations");
  const migrationName = "20260622150000_repair_telefun_scoring_lifecycle_contract.sql";
  const migrationPath = join(migrationsDir, migrationName);

  it("exists after the retry queue migration", () => {
    const sqlFiles = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const retryMigration = "20260611201000_telefun_scoring_retry_queue.sql";
    expect(sqlFiles.indexOf(migrationName)).toBeGreaterThan(
      sqlFiles.indexOf(retryMigration),
    );
  });

  it("adds all 6 scoring columns with IF NOT EXISTS", () => {
    const sql = readFileSync(migrationPath, "utf8");
    const columns = [
      "scoring_status",
      "scoring_claimed_at",
      "scoring_completed_at",
      "scoring_attempt_count",
      "scoring_last_error",
      "scoring_next_attempt_at",
    ];
    for (const col of columns) {
      expect(sql.toLowerCase()).toContain(col);
    }
    // All columns use ADD COLUMN IF NOT EXISTS
    const addColumnMatches = sql.match(/ADD COLUMN IF NOT EXISTS/g);
    expect(addColumnMatches).toBeTruthy();
    expect(addColumnMatches!.length).toBeGreaterThanOrEqual(6);
  });

  it("re-creates all 5 RPCs with SECURITY DEFINER", () => {
    const sql = readFileSync(migrationPath, "utf8");
    const rpcs = [
      "claim_telefun_scoring",
      "complete_telefun_scoring",
      "fail_telefun_scoring",
      "reschedule_telefun_scoring",
      "enqueue_telefun_scoring",
    ];
    for (const rpc of rpcs) {
      expect(sql).toContain(rpc);
    }
    const secDefinerMatches = sql.match(/SECURITY DEFINER/g);
    expect(secDefinerMatches).toBeTruthy();
    expect(secDefinerMatches!.length).toBeGreaterThanOrEqual(5);
  });

  it("enqueue_telefun_scoring guards against processing → pending", () => {
    const sql = readFileSync(migrationPath, "utf8");
    // Must NOT target 'processing' — guard prevents re-enqueue
    expect(sql).toContain("IS DISTINCT FROM 'processing'");
    expect(sql).toContain("IS DISTINCT FROM 'completed'");
  });

  it("grants EXECUTE to service_role only for all 5 RPCs", () => {
    const sql = readFileSync(migrationPath, "utf8");
    // Revoke from public, anon
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.claim_telefun_scoring");
    expect(sql).toContain("FROM public, anon");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.complete_telefun_scoring");
    expect(sql).toContain("FROM public, anon");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.fail_telefun_scoring");
    expect(sql).toContain("FROM public, anon");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.reschedule_telefun_scoring");
    expect(sql).toContain("FROM public, anon");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.enqueue_telefun_scoring");
    expect(sql).toContain("FROM public, anon");
    // Grant to service_role
    const serviceGrants = sql.match(/GRANT EXECUTE ON FUNCTION .* TO service_role/g);
    expect(serviceGrants).toHaveLength(5);
    // No authenticated/anonymous grants
    const authGrants = sql.match(/TO (authenticated|anon)/g);
    expect(authGrants).toBeNull();
  });

  it("bulk-updates existing sessions: completed when score+assessment exist", () => {
    const sql = readFileSync(migrationPath, "utf8");
    const completedBackfill = sql.match(
      /UPDATE public\.telefun_history[\s\S]*?SET[\s\S]*?scoring_status = 'completed'[\s\S]*?;/,
    )?.[0];

    expect(completedBackfill).toBeDefined();
    expect(completedBackfill).toContain("score IS NOT NULL");
    expect(completedBackfill).toContain("voice_assessment IS NOT NULL");
    expect(completedBackfill).not.toContain("scoring_status IS NULL");
  });

  it("bulk-updates remaining sessions to pending", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("SET scoring_status = 'pending'");
    expect(sql).toContain("WHERE scoring_status IS NULL");
  });

  it("reloads PostgREST schema cache via NOTIFY", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });

  it("creates all 3 indexes with IF NOT EXISTS", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("idx_telefun_scoring_status");
    expect(sql).toContain("idx_telefun_scoring_claimed_at");
    expect(sql).toContain("idx_telefun_scoring_retry_queue");
    const idxMatches = sql.match(/CREATE INDEX IF NOT EXISTS/g);
    expect(idxMatches).toBeTruthy();
    expect(idxMatches!.length).toBeGreaterThanOrEqual(3);
  });

  it("repairs the status check constraint even when the column already exists", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("telefun_history_scoring_status_check");
    expect(sql).toMatch(/pg_constraint/i);
  });

  it("revokes direct authenticated execution before granting service_role", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.claim_telefun_scoring\(UUID, INT\) FROM public, anon, authenticated/,
    );
  });

  it("runs as one transaction", () => {
    const sql = readFileSync(migrationPath, "utf8").trim();
    expect(sql).toMatch(/(?:^|\n)BEGIN;/);
    expect(sql).toMatch(/COMMIT;$/);
  });
});

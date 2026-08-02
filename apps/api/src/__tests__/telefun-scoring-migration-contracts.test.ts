// Merged from telefun-scoring-lifecycle-schema / -repair-migration / -retry-migration (konsolidasi fragmentasi)
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
    expect(sql).toMatch(
      /scoring_status[\s\S]*CHECK[\s\S]*IN[\s\S]*pending[\s\S]*processing[\s\S]*completed[\s\S]*failed/i,
    );
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
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.claim_telefun_scoring",
    );
    expect(sql).toContain("FROM public, anon");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.complete_telefun_scoring",
    );
    expect(sql).toContain("FROM public, anon");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.fail_telefun_scoring");
    expect(sql).toContain("FROM public, anon");
    // GRANT TO service_role
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.claim_telefun_scoring",
    );
    expect(sql).toContain("TO service_role");
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.complete_telefun_scoring",
    );
    expect(sql).toContain("TO service_role");
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.fail_telefun_scoring",
    );
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

  it("only retry, terminal repair, and Phase 4 migration re-define lifecycle RPCs", () => {
    const retryFile = "20260611201000_telefun_scoring_retry_queue.sql";
    const terminalFile =
      "20260622150000_repair_telefun_scoring_lifecycle_contract.sql";
    const phase4File =
      "20260801120000_telefun_openai_webrtc_phase4_durable_lifecycle.sql";
    const allowed = new Set([retryFile, terminalFile, phase4File]);
    const allFiles = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql") && f > migrationName && !allowed.has(f))
      .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
      .join("\n");
    expect(allFiles).not.toMatch(/FUNCTION\s+public\.claim_telefun_scoring/i);
    expect(allFiles).not.toMatch(
      /FUNCTION\s+public\.complete_telefun_scoring/i,
    );
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

describe("Telefun scoring repair migration contract", () => {
  const migrationsDir = join(process.cwd(), "../../supabase/migrations");
  const migrationName =
    "20260622150000_repair_telefun_scoring_lifecycle_contract.sql";
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
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.claim_telefun_scoring",
    );
    expect(sql).toContain("FROM public, anon");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.complete_telefun_scoring",
    );
    expect(sql).toContain("FROM public, anon");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.fail_telefun_scoring");
    expect(sql).toContain("FROM public, anon");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.reschedule_telefun_scoring",
    );
    expect(sql).toContain("FROM public, anon");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.enqueue_telefun_scoring",
    );
    expect(sql).toContain("FROM public, anon");
    // Grant to service_role
    const serviceGrants = sql.match(
      /GRANT EXECUTE ON FUNCTION .* TO service_role/g,
    );
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

  it("enqueue_telefun_scoring targets non-completed sessions", () => {
    const sql = readFileSync(p16Path, "utf8");
    expect(sql).toContain("IS DISTINCT FROM 'completed'");
  });

  it("reschedule targets processing or failed sessions only", () => {
    const sql = readFileSync(p16Path, "utf8");
    expect(sql).toContain("scoring_status IN ('processing', 'failed')");
  });

  it("grants EXECUTE to service_role only for all RPCs", () => {
    const sql = readFileSync(p16Path, "utf8");
    // Revoke from public, anon
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.claim_telefun_scoring",
    );
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.complete_telefun_scoring",
    );
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.fail_telefun_scoring");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.reschedule_telefun_scoring",
    );
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.enqueue_telefun_scoring",
    );
    // Grant to service_role
    const serviceGrants = sql.match(
      /GRANT EXECUTE ON FUNCTION .* TO service_role/g,
    );
    expect(serviceGrants).toHaveLength(5);
    // No authenticated grants
    const authGrants = sql.match(/TO authenticated/g);
    expect(authGrants).toBeNull();
  });

  it("no later migration except terminal repair and Phase 4 re-defines the same RPCs", () => {
    const terminalFile =
      "20260622150000_repair_telefun_scoring_lifecycle_contract.sql";
    const phase4File =
      "20260801120000_telefun_openai_webrtc_phase4_durable_lifecycle.sql";
    const allFiles = readdirSync(migrationsDir)
      .filter(
        (f) =>
          f.endsWith(".sql") &&
          f > p16Migration &&
          f !== terminalFile &&
          f !== phase4File,
      )
      .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
      .join("\n");
    expect(allFiles).not.toMatch(
      /FUNCTION\s+public\.reschedule_telefun_scoring/i,
    );
    expect(allFiles).not.toMatch(/FUNCTION\s+public\.enqueue_telefun_scoring/i);
  });
});

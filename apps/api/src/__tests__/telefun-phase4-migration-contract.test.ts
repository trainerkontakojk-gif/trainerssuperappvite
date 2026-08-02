import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrationName =
  "20260801120000_telefun_openai_webrtc_phase4_durable_lifecycle.sql";
const rollbackName =
  "rollback_20260801120000_telefun_openai_webrtc_phase4_durable_lifecycle.sql";

function readMigration(name: string): string {
  return readFileSync(join(process.cwd(), "../../supabase/migrations", name), "utf8");
}

function readRollback(): string {
  return readFileSync(
    join(process.cwd(), "../../supabase/rollbacks", rollbackName),
    "utf8",
  );
}

describe("Telefun OpenAI WebRTC Phase 4 migration contract", () => {
  it("ships the additive migration and rollback artifacts", () => {
    expect(
      existsSync(join(process.cwd(), "../../supabase/migrations", migrationName)),
    ).toBe(true);
    expect(
      existsSync(join(process.cwd(), "../../supabase/rollbacks", rollbackName)),
    ).toBe(true);
  });

  it("defines bounded recording readiness state and durable attempt/outbox tables", () => {
    const sql = readMigration(migrationName);

    for (const column of [
      "recording_status",
      "recording_ready_at",
      "recording_error",
      "scoring_ready_at",
    ]) {
      expect(sql).toContain(column);
    }
    for (const table of [
      "public.telefun_realtime_attempts",
      "public.telefun_realtime_transcript_events",
    ]) {
      expect(sql).toContain(table);
    }
    expect(sql).toContain("UNIQUE(session_id)");
    expect(sql).toContain("UNIQUE(finalization_key)");
    expect(sql).toContain("UNIQUE(usage_request_id)");
    expect(sql).toContain("UNIQUE(attempt_id, dedupe_key)");
    expect(sql).toContain("UNIQUE(attempt_id, sequence)");
    expect(sql).toContain("char_length(recording_error) <= 512");
    expect(sql).toContain("provider_call_id_hash");
  });

  it("defines service-role-only security-definer lifecycle RPCs", () => {
    const sql = readMigration(migrationName);
    const functions = [
      "claim_telefun_realtime_attempt",
      "bind_telefun_realtime_provider_call",
      "mark_telefun_realtime_sideband_connected",
      "checkpoint_telefun_realtime_transcript",
      "begin_telefun_realtime_finalization",
      "finalize_telefun_realtime_attempt",
      "mark_telefun_realtime_usage",
      "mark_telefun_recording_uploaded",
      "mark_telefun_recording_ready",
      "fail_telefun_realtime_session_without_attempt",
    ];

    for (const functionName of functions) {
      expect(sql).toContain(`FUNCTION public.${functionName}`);
    }
    expect(sql.match(/SECURITY DEFINER/g)?.length).toBeGreaterThanOrEqual(
      functions.length,
    );
    expect(sql).toContain("SET search_path = ''");
    expect(sql).toContain("REVOKE ALL ON TABLE public.telefun_realtime_attempts");
    expect(sql).toContain(
      "REVOKE ALL ON TABLE public.telefun_realtime_transcript_events",
    );
    expect(sql).toContain("FROM public, anon, authenticated");
    expect(sql).toContain("TO service_role");
  });

  it("keeps WebRTC scoring behind terminal and seekable-agent readiness", () => {
    const sql = readMigration(migrationName);
    expect(sql).toContain("scoring_ready_at IS NOT NULL");
    expect(sql).toMatch(/(?:telefun_transport|v_transport)\s*=\s*'openai-webrtc'/);
    expect(sql).toContain("agent_recording_path");
    expect(sql).toContain("status = 'completed'");
    expect(sql).toContain("seekable\\.webm");
  });

  it("checks the attempt before treating terminal history as a no-attempt success", () => {
    const sql = readMigration(migrationName);
    const start = sql.indexOf(
      "CREATE OR REPLACE FUNCTION public.fail_telefun_realtime_session_without_attempt(",
    );
    const end = sql.indexOf(
      "CREATE OR REPLACE FUNCTION public.claim_telefun_realtime_attempt(",
      start,
    );
    const functionBody = sql.slice(start, end);
    expect(functionBody).toContain("attempt_exists_active");
    expect(functionBody).toContain("attempt_exists_terminal");
    expect(functionBody.indexOf("SELECT a.state INTO v_attempt_state")).toBeLessThan(
      functionBody.indexOf("IF v_history.status IN ('completed', 'failed')"),
    );
  });

  it("fails closed for active history deletion and preserves failed capture latches", () => {
    const sql = readMigration(migrationName);
    expect(sql).toContain("prevent_active_telefun_history_delete");
    expect(sql).toContain("CREATE TRIGGER telefun_history_block_active_webrtc_delete");
    expect(sql).toContain("CREATE TRIGGER telefun_attempt_block_active_delete");
    expect(sql).toContain("prevent_active_telefun_attempt_delete");
    expect(sql).toContain("capture_failed");
    expect(sql).toMatch(/recording_status\s*=\s*'failed'[\s\S]*?RETURN QUERY/);
    expect(sql).toContain("v_session.recording_status = 'failed'");
  });

  it("invalidates WebRTC processing and row-locks completion with legacy preservation", () => {
    const sql = readMigration(migrationName);
    expect(sql).toContain("scoring_status = 'failed'");
    expect(sql).toContain("scoring_claimed_at = NULL");
    expect(sql).toContain("scoring_last_error = 'Recording capture failed'");

    const start = sql.indexOf(
      "CREATE OR REPLACE FUNCTION public.complete_telefun_scoring(",
    );
    expect(start).toBeGreaterThanOrEqual(0);
    const completion = sql.slice(start);
    expect(completion).toContain("FOR UPDATE");
    expect(completion).toContain("v_status <> 'completed'");
    expect(completion).toContain("v_scoring_ready_at IS NULL");
    expect(completion).toContain("agent_only\\.seekable\\.webm");
    expect(completion).toContain(
      "v_transport IS DISTINCT FROM 'openai-webrtc'",
    );
  });

  it("restores the pre-Phase-4 completion body before dropping additive columns", () => {
    const sql = readRollback();
    const start = sql.indexOf(
      "CREATE OR REPLACE FUNCTION public.complete_telefun_scoring(",
    );
    const drop = sql.indexOf("DROP COLUMN IF EXISTS recording_status");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(drop).toBeGreaterThan(start);
    const nextFunction = sql.indexOf(
      "CREATE OR REPLACE FUNCTION public.claim_telefun_scoring(",
      start,
    );
    const completion = sql.slice(start, nextFunction > start ? nextFunction : drop);
    expect(completion).toContain(
      "WHERE id = p_session_id\n    AND scoring_status = 'processing'",
    );
    expect(completion).toContain("RETURN FOUND;");
    expect(completion).not.toContain("FOR UPDATE");
  });
});

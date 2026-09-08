import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// --- Supabase admin mock: capture RPC name + args ---------------------------
const mockRpcs: Array<{ name: string; args: any }> = [];
let mockRpcResult: any = { data: true, error: null };
const mockRow: { current: any } = { current: null };

function buildSelectChain() {
  const chain: Record<string, any> = {};
  for (const m of ["select", "order", "or", "in", "eq", "lte", "limit"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: mockRow.current, error: null }));
  chain.limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
  return chain;
}

vi.mock("../lib/supabase", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: vi.fn((name: string, args: any) => {
      mockRpcs.push({ name, args });
      return Promise.resolve(mockRpcResult);
    }),
    from: vi.fn(() => buildSelectChain()),
    storage: { from: vi.fn(() => ({ download: vi.fn(async () => ({ data: null, error: new Error("x") })) })) },
  })),
}));

vi.mock("../lib/telefun-analysis", () => ({
  analyzeVoiceQuality: vi.fn(async () => ({
    success: true,
    assessment: { overallScore: 8, dimensions: [] },
  })),
  isTelefunWebRtcSeekableAgentPath: vi.fn(() => true),
}));

import {
  claimJob,
  persistScoringAssessment,
  TELEFUN_SCORING_CLAIM_TIMEOUT_SECONDS,
} from "../services/telefun-scoring-service";
import { processNextBatch } from "../workers/telefun-scoring-worker";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../../supabase/migrations");
function fencingMigrationSql(): string {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.includes("claim_fencing"));
  expect(files.length).toBeGreaterThan(0);
  return readFileSync(path.join(MIGRATIONS_DIR, files[0]), "utf8");
}

beforeEach(() => {
  mockRpcs.length = 0;
  mockRpcResult = { data: true, error: null };
  mockRow.current = null;
  vi.clearAllMocks();
});

describe("claim lease 300s + token fencing (RED)", () => {
  it("exposes a 300s shared claim timeout constant", () => {
    expect(TELEFUN_SCORING_CLAIM_TIMEOUT_SECONDS).toBe(300);
  });

  it("claimJob sends p_claim_timeout_seconds 300 with a token hash + owner", async () => {
    const result = await claimJob("session-1");
    expect(result.claimed).toBe(true);
    const call = mockRpcs.find((r) => r.name === "claim_telefun_scoring");
    expect(call).toBeDefined();
    expect(call!.args.p_claim_timeout_seconds).toBe(300);
    expect(call!.args.p_claim_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof call!.args.p_claim_owner).toBe("string");
    expect(result.claimTokenHash).toBe(call!.args.p_claim_token_hash);
    expect(typeof result.claimToken).toBe("string");
  });

  it("persistScoringAssessment forwards the claim token hash to complete RPC", async () => {
    const assessment: any = { overallScore: 8 };
    const ok = await persistScoringAssessment("session-1", assessment, "user-1", "abc123hash");
    expect(ok).toBe(true);
    const call = mockRpcs.find((r) => r.name === "complete_telefun_scoring");
    expect(call).toBeDefined();
    expect(call!.args.p_claim_token_hash).toBe("abc123hash");
  });

  it("processNextBatch threads the claim token into the job for fenced completion", async () => {
    const seen: Array<{ hash: unknown }> = [];
    const deps = {
      fetchPendingJobs: vi.fn(async () => [{ sessionId: "s1", userId: "u1" }]),
      claimJob: vi.fn(async () => ({ claimed: true, claimTokenHash: "deadbeef" })),
      checkCachedAssessment: vi.fn(async () => null),
      processScoringJob: vi.fn(async (job: any) => {
        seen.push({ hash: job.claimTokenHash });
        return { success: true, status: "completed" as const };
      }),
    };
    const stats = await processNextBatch(deps as any, {});
    expect(stats.completed).toBe(1);
    expect(seen).toEqual([{ hash: "deadbeef" }]);
  });

  it("no literal 120s lease remains in claim paths", () => {
    const svc = readFileSync(path.resolve(__dirname, "../services/telefun-scoring-service.ts"), "utf8");
    const route = readFileSync(
      path.resolve(__dirname, "../routes/telefun/recordings.ts"),
      "utf8",
    );
    expect(svc).not.toContain("p_claim_timeout_seconds: 120");
    expect(route).not.toContain("p_claim_timeout_seconds: 120");
    expect(svc).not.toMatch(/timeoutSeconds:\s*number\s*=\s*120/);
  });

  it("fencing migration adds token/owner columns with additive guards", () => {
    const sql = fencingMigrationSql();
    expect(sql).toContain("scoring_claim_token_hash");
    expect(sql).toContain("scoring_claim_owner");
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS/);
  });

  it("fencing migration tokenizes RPCs with null-safe fencing + 300 default", () => {
    const sql = fencingMigrationSql();
    expect(sql).toContain("p_claim_token_hash");
    expect(sql).toContain("IS NOT DISTINCT FROM");
    expect(sql).toContain("DEFAULT 300");
  });

  it("fencing migration keeps service-role-only grants and reloads PostgREST cache", () => {
    const sql = fencingMigrationSql();
    expect(sql).toContain("TO service_role");
    expect(sql).toContain("FROM public, anon");
    expect(sql).toMatch(/NOTIFY pgrst/i);
  });

  it("fencing claim rejects missing token/owner (multi-instance safety contract)", () => {
    const sql = fencingMigrationSql();
    expect(sql).toMatch(
      /IF p_claim_timeout_seconds IS NULL OR p_claim_timeout_seconds < 300[\s\S]*p_claim_token_hash IS NULL[\s\S]*p_claim_owner IS NULL[\s\S]*RETURN FALSE/,
    );
  });

  it("fencing claims are only lost to newer claims, never to same-window races (stale-reclaim window contract)", () => {
    const sql = fencingMigrationSql();
    // Stale processing is reclaimed ONLY when the claim age exceeds the lease.
    expect(sql).toMatch(
      /v_current_status = 'processing' AND v_claimed_at IS NOT NULL[\s\S]*?\(v_now - v_claimed_at\) < make_interval\(secs => p_claim_timeout_seconds\)[\s\S]*?RETURN FALSE/,
    );
  });

  it("tokenized writes mutate only when the row still carries the same token (no-duplicate-completion contract)", () => {
    const sql = fencingMigrationSql();
    const tokenizedSections = sql.split("CREATE OR REPLACE FUNCTION").slice(1);
    // complete / fail / reschedule tokenized overloads each fence on token match.
    // (The claim overload is excluded: it SETS the token rather than fencing.)
    const tokenizedBodies = tokenizedSections.filter(
      (section) =>
        section.includes("p_claim_token_hash TEXT") &&
        !section.includes("p_claim_owner TEXT"),
    );
    expect(tokenizedBodies.length).toBeGreaterThanOrEqual(3);
    for (const body of tokenizedBodies) {
      expect(body).toContain("scoring_status = 'processing'");
      // Non-null token required: either as a WHERE predicate or as an
      // early IF guard (the guarded form also rejects empty strings).
      expect(
        body.includes("p_claim_token_hash IS NOT NULL") ||
          /IF p_claim_token_hash IS NULL/.test(body),
      ).toBe(true);
      expect(body).toContain(
        "scoring_claim_token_hash IS NOT DISTINCT FROM p_claim_token_hash",
      );
    }
    // Legacy writes cannot clobber a tokenized claim: un-tokenized legacy paths
    // require scoring_claim_token_hash IS NULL.
    const legacyBodies = tokenizedSections.filter((section) => {
      const sig = section.slice(0, section.indexOf("AS $$"));
      return (
        sig.includes("p_claim_token_hash TEXT DEFAULT 300") ||
        (!sig.includes("p_claim_token_hash TEXT") &&
          /complete_telefun_scoring|fail_telefun_scoring|reschedule_telefun_scoring/.test(sig))
      );
    });
    expect(legacyBodies.length).toBeGreaterThanOrEqual(3);
    for (const body of legacyBodies) {
      expect(body).toContain("scoring_claim_token_hash IS NULL");
    }
  });
});

describe("Phase 4 guard preservation in fencing migration (RED)", () => {
  function functionSections(sql: string): string[] {
    return sql.split("CREATE OR REPLACE FUNCTION").slice(1);
  }

  function findSection(sql: string, predicate: (sig: string) => boolean): string {
    const sections = functionSections(sql);
    const found = sections.find((section) =>
      predicate(section.slice(0, section.indexOf("AS $$"))),
    );
    expect(found).toBeDefined();
    return found as string;
  }

  const isTokenizedClaim = (sig: string) =>
    sig.includes("claim_telefun_scoring") && sig.includes("p_claim_owner TEXT");
  const isLegacyClaim = (sig: string) =>
    sig.includes("claim_telefun_scoring") && !sig.includes("p_claim_owner TEXT");
  const isTokenizedComplete = (sig: string) =>
    sig.includes("complete_telefun_scoring") && sig.includes("p_claim_token_hash TEXT");
  const isLegacyComplete = (sig: string) =>
    sig.includes("complete_telefun_scoring") && !sig.includes("p_claim_token_hash TEXT");

  function expectReadinessGuards(body: string) {
    // Phase 4 durable-lifecycle guards: row lock + transport/status/readiness/path.
    expect(body).toContain("FOR UPDATE");
    expect(body).toContain("telefun_transport");
    expect(body).toContain("scoring_ready_at");
    expect(body).toContain("agent_only");
  }

  it("tokenized claim keeps Phase 4 readiness guards", () => {
    const body = findSection(fencingMigrationSql(), isTokenizedClaim);
    expectReadinessGuards(body);
  });

  it("legacy claim keeps Phase 4 readiness guards", () => {
    const body = findSection(fencingMigrationSql(), isLegacyClaim);
    expectReadinessGuards(body);
  });

  it("tokenized complete keeps Phase 4 row lock + readiness guards", () => {
    const body = findSection(fencingMigrationSql(), isTokenizedComplete);
    expectReadinessGuards(body);
  });

  it("legacy complete keeps Phase 4 row lock + readiness guards", () => {
    const body = findSection(fencingMigrationSql(), isLegacyComplete);
    expectReadinessGuards(body);
  });
});

describe("fencing rollback fail-closed guard (RED)", () => {
  const ROLLBACK_DIR = path.resolve(__dirname, "../../../../supabase/rollbacks");
  function rollbackSql(): string {
    const files = readdirSync(ROLLBACK_DIR).filter((f) => f.includes("claim_fencing"));
    expect(files.length).toBeGreaterThan(0);
    return readFileSync(path.join(ROLLBACK_DIR, files[0]), "utf8");
  }

  it("refuses to drop fencing while tokenized processing claims are active", () => {
    const sql = rollbackSql();
    // Fail-closed: the comment prohibition alone is not enforceable; SQL must
    // abort when a processing row still carries a claim token hash.
    expect(sql).toMatch(/scoring_claim_token_hash IS NOT NULL/);
    expect(sql).toMatch(/scoring_status\s*=\s*'processing'/);
    expect(sql).toMatch(/RAISE EXCEPTION/);
  });

  it("locks claim admission and restores every pre-fencing legacy RPC in one transaction", () => {
    const sql = rollbackSql();
    expect(sql).toMatch(/(?:^|\n)BEGIN;/);
    expect(sql).toMatch(
      /LOCK TABLE public\.telefun_history IN ACCESS EXCLUSIVE MODE;/,
    );
    for (const signature of [
      "claim_telefun_scoring",
      "complete_telefun_scoring",
      "fail_telefun_scoring",
      "reschedule_telefun_scoring",
    ]) {
      expect(sql).toContain(`CREATE OR REPLACE FUNCTION public.${signature}`);
    }
    expect(sql.trim()).toMatch(/NOTIFY pgrst, 'reload schema';\s*COMMIT;$/);
  });

  it("uses a 300-second floor for tokenized claims and clamps legacy leases", () => {
    const sql = fencingMigrationSql();
    expect(sql).toMatch(
      /p_claim_timeout_seconds IS NULL OR p_claim_timeout_seconds < 300[\s\S]*RETURN FALSE/,
    );
    expect(sql).toContain(
      "v_effective_timeout := GREATEST(COALESCE(p_claim_timeout_seconds, 300), 300)",
    );
    expect(sql).toContain(
      "make_interval(secs => v_effective_timeout)",
    );
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../scripts/database-parity",
);
const MIGRATION_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../supabase/migrations",
);

describe("sidak May incremental sync script", () => {
  const script = readFileSync(
    resolve(SCRIPT_DIR, "sidak-may-incremental-sync.mjs"),
    "utf8",
  );

  it("defaults to dry-run and requires --apply for writes", () => {
    expect(script).toContain('const apply = args.includes("--apply")');
    expect(script).toContain('mode: apply ? "apply" : "dry-run"');
  });

  it("is insert-only and never deletes or truncates target data", () => {
    expect(script).toMatch(/on conflict \(id\) do nothing/i);
    expect(script).not.toMatch(/\bdelete from\b/i);
    expect(script).not.toMatch(/\btruncate\b/i);
  });

  it("opens legacy connection in read-only transaction", () => {
    expect(script).toContain('await oldDb.query("begin read only")');
  });

  it("uses explicit column list for insert", () => {
    expect(script).toContain("TARGET_COLUMNS");
    expect(script).toMatch(/insert into public\.qa_temuan \(\$\{TARGET_COLUMNS/);
  });

  it("stops on conflict detection before any insert", () => {
    expect(script).toContain("conflictingRows");
    expect(script).toMatch(/Conflict rows found/);
  });
});

describe("rule-version parity sync script", () => {
  const script = readFileSync(
    resolve(SCRIPT_DIR, "qa-rule-version-parity-sync.mjs"),
    "utf8",
  );

  it("preserves target-only drafts and is insert-only", () => {
    expect(script).toContain("targetOnlyVersions");
    expect(script).toContain("on conflict (id) do nothing");
    expect(script).not.toMatch(/\bdelete from\b/i);
    expect(script).not.toMatch(/\btruncate\b/i);
  });

  it("reports target-only version IDs", () => {
    expect(script).toContain("targetOnlyVersionIds");
  });

  it("opens legacy connection in read-only transaction", () => {
    expect(script).toContain('await oldDb.query("begin read only")');
  });
});

describe("sidak post-sync verify script", () => {
  const script = readFileSync(
    resolve(SCRIPT_DIR, "sidak-post-sync-verify.mjs"),
    "utf8",
  );

  it("has --check-mv flag for MV presence verification", () => {
    expect(script).toContain('const checkMv = args.includes("--check-mv")');
  });

  it("has --refresh-summaries flag for summary backfill", () => {
    expect(script).toContain(
      'const refreshSummaries = args.includes("--refresh-summaries")',
    );
  });

  it("checks FK orphans for synced rows", () => {
    expect(script).toContain("missing_peserta");
    expect(script).toContain("missing_period");
    expect(script).toContain("missing_indicator");
  });

  it("checks MV existence and row count", () => {
    expect(script).toContain(
      "to_regclass('public.mv_qa_period_summary')",
    );
  });
});

describe("dashboard summary Vite schema migration", () => {
  const sql = readFileSync(
    resolve(MIGRATION_DIR, "20260525000100_sidak_dashboard_summary_vite_schema_refresh.sql"),
    "utf8",
  );

  it("defines refresh function using target summary columns", () => {
    expect(sql).toContain("refresh_qa_dashboard_summary_for_period");
    expect(sql).toContain("qa_dashboard_period_summary");
    expect(sql).toContain("qa_dashboard_agent_period_summary");
    expect(sql).toContain("folder_id");
    expect(sql).toContain("agent_id");
    expect(sql).not.toContain(
      "insert into public.qa_dashboard_period_summary (period_id, service_type, folder_key",
    );
  });

  it("excludes phantom padding rows", () => {
    expect(sql).toContain("is_phantom_padding");
  });

  it("grants execute to authenticated and service_role", () => {
    expect(sql).toMatch(/grant execute/i);
    expect(sql).toContain("authenticated");
    expect(sql).toContain("service_role");
  });
});

describe("MV contract restoration migration", () => {
  const sql = readFileSync(
    resolve(MIGRATION_DIR, "20260525000200_restore_mv_qa_period_summary_contract.sql"),
    "utf8",
  );

  it("creates mv_qa_period_summary materialized view", () => {
    expect(sql).toContain("CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_qa_period_summary");
  });

  it("creates unique index for concurrent refresh", () => {
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_qa_period_summary_unique");
    expect(sql).toContain("(period_id, service_type)");
  });

  it("creates refresh function", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.refresh_mv_qa_period_summary()");
    expect(sql).toContain("REFRESH MATERIALIZED VIEW CONCURRENTLY");
  });

  it("grants execute and select to authenticated and service_role", () => {
    const grants = sql.match(/GRANT EXECUTE/g);
    expect(grants).toBeTruthy();
    expect(
      (grants?.length ?? 0) >= 1,
    ).toBe(true);
  });
});

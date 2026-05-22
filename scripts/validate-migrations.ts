/**
 * Migration Validator CLI Script
 *
 * Executes all migration files sequentially against a fresh PostgreSQL database
 * to validate they run cleanly from an empty state.
 *
 * Usage: tsx scripts/validate-migrations.ts
 *
 * Environment:
 *   DATABASE_URL or SUPABASE_DB_URL - PostgreSQL connection string
 */

import { Client } from "pg";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface MigrationError {
  line?: number;
  statement?: string;
  message: string;
}

export interface MigrationResult {
  filename: string;
  status: "pass" | "fail";
  durationMs: number;
  error?: MigrationError;
}

export interface MigrationReport {
  results: MigrationResult[];
  totalFiles: number;
  passed: number;
  failed: number;
  haltedAt?: string;
}

// ─── Core Logic (exported for testing) ────────────────────────────────────────

/**
 * Reads migration files from the given directory in ascending filename order.
 */
export async function getMigrationFiles(
  migrationsDir: string
): Promise<string[]> {
  const entries = await readdir(migrationsDir);
  const sqlFiles = entries
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
  return sqlFiles;
}

/**
 * Extracts the approximate line number from a PostgreSQL error position
 * within the SQL content.
 */
export function getErrorLine(
  sql: string,
  position: string | undefined
): number | undefined {
  if (!position) return undefined;
  const pos = parseInt(position, 10);
  if (isNaN(pos)) return undefined;
  const upToError = sql.substring(0, pos);
  return upToError.split("\n").length;
}

/**
 * Extracts the failing statement from SQL content near the error position.
 * Splits by semicolons and finds the statement containing the error position.
 */
export function getFailingStatement(
  sql: string,
  position: string | undefined
): string | undefined {
  if (!position) return undefined;
  const pos = parseInt(position, 10);
  if (isNaN(pos)) return undefined;

  // Find the statement that contains the error position
  let currentPos = 0;
  const statements = sql.split(";");
  for (const stmt of statements) {
    const stmtEnd = currentPos + stmt.length + 1; // +1 for the semicolon
    if (pos <= stmtEnd) {
      const trimmed = stmt.trim();
      // Truncate long statements for readability
      return trimmed.length > 200 ? trimmed.substring(0, 200) + "..." : trimmed;
    }
    currentPos = stmtEnd;
  }
  return undefined;
}

/**
 * Executes a single migration file against the database with a timeout.
 */
export async function executeMigration(
  client: Client,
  migrationsDir: string,
  filename: string,
  timeoutMs: number = 30_000
): Promise<MigrationResult> {
  const filePath = join(migrationsDir, filename);
  const sql = await readFile(filePath, "utf-8");

  const start = performance.now();

  try {
    // Execute with statement_timeout for the 30-second limit
    await client.query(`SET statement_timeout = '${timeoutMs}ms'`);
    await client.query(sql);
    const durationMs = Math.round(performance.now() - start);

    return {
      filename,
      status: "pass",
      durationMs,
    };
  } catch (err: unknown) {
    const durationMs = Math.round(performance.now() - start);
    const pgError = err as {
      message?: string;
      position?: string;
      code?: string;
    };

    const isTimeout =
      pgError.code === "57014" || // query_canceled (statement_timeout)
      durationMs >= timeoutMs;

    const errorMessage = isTimeout
      ? `Timeout: migration exceeded ${timeoutMs}ms limit`
      : pgError.message || "Unknown PostgreSQL error";

    return {
      filename,
      status: "fail",
      durationMs,
      error: {
        line: getErrorLine(sql, pgError.position),
        statement: getFailingStatement(sql, pgError.position),
        message: errorMessage,
      },
    };
  }
}

/**
 * Validates all migrations by executing them sequentially.
 * Halts on first failure.
 */
export async function validateMigrations(
  dbUrl: string,
  migrationsDir?: string
): Promise<MigrationReport> {
  const resolvedDir =
    migrationsDir || resolve(process.cwd(), "supabase/migrations");

  const files = await getMigrationFiles(resolvedDir);
  const results: MigrationResult[] = [];

  if (files.length === 0) {
    return {
      results: [],
      totalFiles: 0,
      passed: 0,
      failed: 0,
    };
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    for (const filename of files) {
      const result = await executeMigration(client, resolvedDir, filename);
      results.push(result);

      if (result.status === "fail") {
        // Halt on first failure
        return {
          results,
          totalFiles: files.length,
          passed: results.filter((r) => r.status === "pass").length,
          failed: 1,
          haltedAt: filename,
        };
      }
    }
  } finally {
    await client.end();
  }

  return {
    results,
    totalFiles: files.length,
    passed: results.length,
    failed: 0,
  };
}

/**
 * Formats the migration report for stdout output.
 */
export function formatReport(report: MigrationReport): string {
  return JSON.stringify(report, null, 2);
}

// ─── CLI Entry Point ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const dbUrl =
    process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

  if (!dbUrl) {
    console.error(
      "Error: DATABASE_URL or SUPABASE_DB_URL environment variable is required."
    );
    process.exit(1);
  }

  try {
    const report = await validateMigrations(dbUrl);
    console.log(formatReport(report));

    if (report.failed > 0) {
      process.exit(1);
    }
  } catch (err: unknown) {
    const error = err as Error;
    console.error(
      JSON.stringify(
        {
          error: "Connection or execution failure",
          message: error.message,
        },
        null,
        2
      )
    );
    process.exit(1);
  }
}

// Run if executed directly
const isMainModule =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("validate-migrations.ts") ||
    process.argv[1].endsWith("validate-migrations"));

if (isMainModule) {
  main();
}

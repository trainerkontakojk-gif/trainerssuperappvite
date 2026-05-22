/**
 * Seed Manager CLI Script
 *
 * Applies seed SQL files from supabase/seeds/ to the local/dev database.
 * Includes a production guard that prevents accidental execution against production.
 *
 * Usage: tsx scripts/seed.ts
 * pnpm script: pnpm seed
 *
 * Environment variables:
 *   SUPABASE_DB_URL or DATABASE_URL - PostgreSQL connection string
 *   NODE_ENV - If 'production', seed will abort
 */

import { Client } from "pg";
import * as fs from "node:fs";
import * as path from "node:path";

/** Patterns that indicate a production database URL */
const PRODUCTION_HOST_PATTERNS = [
  "supabase.co",
  "supabase.com",
  "prod",
  "production",
];

/**
 * Determines if the current environment is production.
 * Returns true if NODE_ENV is 'production' or the database URL contains
 * production host patterns.
 */
export function isProductionEnvironment(
  nodeEnv: string | undefined,
  dbUrl: string | undefined,
): boolean {
  // Check NODE_ENV
  if (nodeEnv?.toLowerCase() === "production") {
    return true;
  }

  // Check database URL for production host patterns
  if (dbUrl) {
    const urlLower = dbUrl.toLowerCase();
    for (const pattern of PRODUCTION_HOST_PATTERNS) {
      if (urlLower.includes(pattern)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Reads all SQL files from the seeds directory in ascending filename order.
 */
export function getSeedFiles(seedDir: string): string[] {
  if (!fs.existsSync(seedDir)) {
    throw new Error(`Seed directory not found: ${seedDir}`);
  }

  const files = fs
    .readdirSync(seedDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  return files;
}

/**
 * Applies all seed SQL files from the given directory to the database.
 * Files are applied in ascending filename order.
 * The seed SQL files are expected to use ON CONFLICT clauses for idempotent execution.
 */
export async function applySeed(config: {
  seedDir: string;
  targetDbUrl: string;
}): Promise<{ applied: string[]; totalFiles: number }> {
  const { seedDir, targetDbUrl } = config;

  const files = getSeedFiles(seedDir);

  if (files.length === 0) {
    console.log("No seed files found in", seedDir);
    return { applied: [], totalFiles: 0 };
  }

  const client = new Client({ connectionString: targetDbUrl });

  try {
    await client.connect();
    console.log(
      `Connected to database. Applying ${files.length} seed file(s)...`,
    );

    const applied: string[] = [];

    for (const file of files) {
      const filePath = path.join(seedDir, file);
      const sql = fs.readFileSync(filePath, "utf-8");

      console.log(`  Applying: ${file}...`);
      await client.query(sql);
      applied.push(file);
      console.log(`  ✓ ${file} applied successfully`);
    }

    return { applied, totalFiles: files.length };
  } finally {
    await client.end();
  }
}

/**
 * Main entry point for the seed manager CLI.
 */
async function main(): Promise<void> {
  const nodeEnv = process.env.NODE_ENV;
  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

  // Production guard
  if (isProductionEnvironment(nodeEnv, dbUrl)) {
    console.error(
      "ERROR: Seed data cannot be applied to a production environment.\n" +
        "Detected production via NODE_ENV or database URL pattern.\n" +
        "Aborting.",
    );
    process.exit(1);
  }

  if (!dbUrl) {
    console.error(
      "ERROR: No database URL found.\n" +
        "Set SUPABASE_DB_URL or DATABASE_URL environment variable.",
    );
    process.exit(1);
  }

  const seedDir = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    "supabase",
    "seeds",
  );

  try {
    const result = await applySeed({ seedDir, targetDbUrl: dbUrl });

    console.log(
      `\nSeed complete: ${result.applied.length}/${result.totalFiles} file(s) applied.`,
    );
    console.log("Applied files:");
    for (const file of result.applied) {
      console.log(`  - ${file}`);
    }
  } catch (error) {
    let message: string;
    if (error instanceof AggregateError) {
      message = error.errors.map((e: Error) => e.message).join("; ");
    } else if (error instanceof Error) {
      message = error.message;
    } else {
      message = String(error);
    }
    console.error(
      `\nERROR: Seed failed: ${message || "Unknown connection error"}`,
    );
    process.exit(1);
  }
}

main();

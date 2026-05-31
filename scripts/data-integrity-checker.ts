/**
 * Data Integrity Checker CLI Script
 *
 * Scans production database for data quality issues including dummy/test data,
 * duplicate records, naming inconsistencies, and broken foto references.
 *
 * Usage:
 *   tsx scripts/data-integrity-checker.ts check-dummy
 *   tsx scripts/data-integrity-checker.ts check-duplicates
 *   tsx scripts/data-integrity-checker.ts check-names
 *   tsx scripts/data-integrity-checker.ts check-fotos
 *
 * Environment:
 *   DATABASE_URL or SUPABASE_DB_URL - PostgreSQL connection string
 */

import { Client } from "pg";
import {
  checkDummy,
  checkDuplicates,
  checkNames,
  checkFotos,
} from "./data-integrity/runner";
import type {
  IntegrityReport,
  DuplicateReport,
  FotoReport,
  NameConsistencyReport,
} from "./data-integrity/types";

// Re-export type definitions for import safety in test suites
export * from "./data-integrity/types";
export * from "./data-integrity/dummy-detector";
export * from "./data-integrity/duplicate-detector";
export * from "./data-integrity/name-consistency";
export * from "./data-integrity/foto-checker";
export { checkDummy, checkDuplicates, checkNames, checkFotos };

type SubCommand = (
  client: Client,
) => Promise<
  IntegrityReport | DuplicateReport | FotoReport | NameConsistencyReport
>;

const SUB_COMMANDS: Record<string, SubCommand> = {
  "check-dummy": checkDummy,
  "check-duplicates": checkDuplicates,
  "check-names": checkNames,
  "check-fotos": checkFotos,
};

async function main(): Promise<void> {
  const subCommand = process.argv[2];

  if (!subCommand) {
    console.error(
      "Usage: tsx scripts/data-integrity-checker.ts <sub-command>\n\n" +
        "Available sub-commands:\n" +
        "  check-dummy       Scan for test/dummy data patterns\n" +
        "  check-duplicates  Find duplicate agent/profiler records\n" +
        "  check-names       Detect naming inconsistencies\n" +
        "  check-fotos       Validate foto/avatar references",
    );
    process.exit(1);
  }

  const handler = SUB_COMMANDS[subCommand];
  if (!handler) {
    console.error(
      `Unknown sub-command: "${subCommand}"\n\n` +
        "Available sub-commands: " +
        Object.keys(SUB_COMMANDS).join(", "),
    );
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error(
      "Error: DATABASE_URL or SUPABASE_DB_URL environment variable is required.",
    );
    process.exit(1);
  }

  const client = new Client({ connectionString: dbUrl });

  try {
    await client.connect();

    // Set statement timeout to 60 seconds for performance constraint
    await client.query("SET statement_timeout = '60000ms'");

    const report = await handler(client);
    console.log(JSON.stringify(report, null, 2));

    const totalMatches =
      "totalMatches" in report
        ? report.totalMatches
        : report.totalDuplicateGroups;

    if (totalMatches === 0) {
      console.error(
        `\n✓ No matches found. ${report.totalRowsScanned} rows scanned across all tables.`,
      );
    } else {
      console.error(
        `\n⚠ Found ${totalMatches} match(es) in ${report.totalRowsScanned} rows scanned.`,
      );
    }
  } catch (err: unknown) {
    const error = err as Error;
    console.error(
      JSON.stringify(
        {
          error: "Data integrity check failed",
          message: error.message,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run if executed directly
const isMainModule =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("data-integrity-checker.ts") ||
    process.argv[1].endsWith("data-integrity-checker"));

if (isMainModule) {
  main();
}

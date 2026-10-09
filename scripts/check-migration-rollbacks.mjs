#!/usr/bin/env node
// Fail when a migration added since <base> has no paired rollback script.
// Older migrations predate the convention, so only additions are checked.
// Usage: node scripts/check-migration-rollbacks.mjs [base-ref]  (default origin/main)
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename } from "node:path";

const base = process.argv[2] ?? "origin/main";
const added = execFileSync(
  "git",
  [
    "diff",
    "--name-only",
    "--diff-filter=A",
    `${base}...HEAD`,
    "--",
    "supabase/migrations/*.sql",
  ],
  { encoding: "utf8" },
)
  .split("\n")
  .filter(Boolean);

const missing = added
  .map((path) => `supabase/rollbacks/rollback_${basename(path)}`)
  .filter((rollback) => !existsSync(rollback));

if (missing.length > 0) {
  console.error("Missing rollback scripts for new migrations:");
  for (const rollback of missing) console.error(`  - ${rollback}`);
  process.exit(1);
}
console.log(
  `Rollback check passed (${added.length} new migration(s) since ${base}).`,
);

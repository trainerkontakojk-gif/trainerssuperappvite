#!/usr/bin/env node
// Run the curated "core contract" test list for one app package.
// Canonical list: scripts/test-core.json (single source of truth).
// Usage: node scripts/test-core.mjs <web|api>
//
// Add a new critical test to the "core" gate by appending its path to
// scripts/test-core.json — no package.json edits needed.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = process.argv[2];
const lists = JSON.parse(
  readFileSync(join(root, "scripts/test-core.json"), "utf8"),
);
const entry = lists[pkg];

if (!entry) {
  console.error(
    `Unknown package "${pkg}". Valid packages: ${Object.keys(lists).join(", ")}`,
  );
  process.exit(1);
}

const args = ["run"];
if (entry.config) args.push("--config", entry.config);
args.push(...entry.files);

execFileSync("vitest", args, {
  stdio: "inherit",
  cwd: join(root, "apps", pkg),
});

#!/usr/bin/env node
// Fail when a non-merge commit since <base> does not add a CHANGELOG.md entry.
// Commits before the changelog policy are not checked: only <base>..HEAD.
// Commits authored by Dependabot are exempt.
// Usage: node scripts/check-changelog.mjs [base-ref]  (default origin/main)
import { execFileSync } from "node:child_process";

const base = process.argv[2] ?? "origin/main";
const git = (...args) => execFileSync("git", args, { encoding: "utf8" });

const commits = git("rev-list", "--no-merges", `${base}..HEAD`)
  .split("\n")
  .filter(Boolean);

// Dependabot cannot write changelog entries; its PR titles already name each
// bump. Squash-merges of its PRs keep it as author, so they are exempt too.
const DEPENDABOT_EMAIL = "49699333+dependabot[bot]@users.noreply.github.com";

const missing = commits.filter((sha) => {
  if (git("log", "-1", "--format=%ae", sha).trim() === DEPENDABOT_EMAIL) {
    return false;
  }
  const diff = git(
    "show",
    "--format=",
    "--unified=0",
    sha,
    "--",
    "CHANGELOG.md",
  );
  return !/^\+- \S/m.test(diff);
});

if (missing.length > 0) {
  console.error(
    "Commits without a CHANGELOG.md entry (- type(scope): summary):",
  );
  for (const sha of missing) {
    console.error(`  - ${git("log", "-1", "--format=%h %s", sha).trim()}`);
  }
  process.exit(1);
}
console.log(
  `Changelog check passed (${commits.length} commit(s) since ${base}).`,
);

---
name: pr-ready
description: Pre-PR gate for Trainers SuperApp — run the lane's checks in order, collect exact evidence, and draft the PR body. Use before asking Fajar to commit, push, or open a PR.
---

# PR-ready gate (Claude Code adapter)

Canonical gates live in `docs/AGENT_WORKFLOW.md` §7–8. This skill runs them in order and reports evidence. It never commits, pushes, or opens a PR; those happen only on Fajar's explicit request.

## 1. Scope

- `git status --short` and `git diff --stat <base>...HEAD`: confirm only owned or planned paths changed and no `.env*`, credentials, or `graphify-out/` artifacts slipped in.
- Restate the lane (A/B/C/D) and which gates apply.

## 2. Checks (stop at the first unexplained failure)

| Lane | Run                                                                                                                                                                              |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A    | Format/structure checks for touched files, `git diff --check`                                                                                                                    |
| B    | Focused E2E if runtime changed, affected workspace `lint`/`typecheck`                                                                                                            |
| C    | Focused E2E, affected checks, `thermo-nuclear` review, then final checks                                                                                                         |
| D    | All of C plus root `pnpm typecheck`, `pnpm lint`, `pnpm build`; for migrations also `node scripts/check-migration-rollbacks.mjs` and a local replay (`supabase-migration` skill) |

Final checks for C/D:

```bash
pnpm --filter @trainers/web test:e2e -- <focused-spec>
pnpm lint
pnpm build
git diff --check
```

Run one Playwright job at a time. Never run unit suites (`test:fast`, `test:core`, and so on) unless Fajar approved it for this change.

## 3. Report

Give Fajar:

- each command with its exit code, plus the relevant pass/fail lines;
- anything skipped and why;
- a draft PR body: **Summary**, **Why**, **Verification** (the commands above), **Risk/Rollback** (for migrations, the rollback file and data-loss note), ending with the attribution line from the session instructions.

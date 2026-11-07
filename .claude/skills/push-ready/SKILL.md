---
name: push-ready
description: Pre-push gate for Trainers SuperApp — run the lane's checks in order, collect exact evidence, then commit and push to main. Use before every commit/push of finished work.
---

# Push-ready gate (Claude Code adapter)

Canonical gates live in `docs/AGENT_WORKFLOW.md` §7–8. This skill runs them in order and reports evidence. Committing and pushing to `main` are pre-authorized once the gates pass (`AGENTS.md`, standing authorization); open a PR or use a feature branch only when Fajar asks. Deploys, remote Supabase changes, and migrations against a non-local project still need Fajar's explicit OK.

## 1. Scope

- `git status --short` and `git diff --stat`: confirm only owned or planned paths changed and no `.env*`, credentials, or `graphify-out/` artifacts slipped in. Leave unrelated dirty or untracked files out of the commit.
- Restate the lane (A/B/C/D) and which gates apply.
- Each commit adds its `- type(scope): summary` entry under today's `## YYYY-MM-DD` heading in `CHANGELOG.md` (Changelog gate). Split unrelated changes into separate commits, each with its own entry.

## 2. Checks (stop at the first unexplained failure)

| Lane | Run                                                                                                                                                                              |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A    | Format/structure checks for touched files, `git diff --check`                                                                                                                    |
| B    | Focused E2E if runtime changed, affected workspace `lint` and `typecheck` scripts                                                                                                |
| C    | Focused E2E, affected checks, `thermo-nuclear` review, then final checks                                                                                                         |
| D    | All of C plus root `pnpm typecheck`, `pnpm lint`, `pnpm build`; for migrations also `node scripts/check-migration-rollbacks.mjs` and a local replay (`supabase-migration` skill) |

Any change under `apps/web/e2e/` needs `pnpm --filter @trainers/web typecheck` (it covers `tsconfig.e2e.json`, which CI checks) even in Lane A/B.

Final checks for C/D:

```bash
pnpm --dir apps/web exec playwright test <spec-file> -g "<test name>" --reporter=line --workers=1
pnpm typecheck
pnpm lint
pnpm build
git diff --check
```

Run one Playwright job at a time. Never run unit suites (`test:fast`, `test:core`, and so on) unless Fajar approved it for this change.

## 3. Commit, push, report

1. Commit with a subject matching the changelog entry; never bypass hooks (`--no-verify` is blocked).
2. `git push origin main` (or the branch Fajar named).
3. Check CI once with `gh run list --limit 3` after it has had time to finish; do not leave a long-running watcher.

Tell Fajar:

- each command with its exit code, plus the relevant pass/fail lines;
- anything skipped and why;
- the commits pushed (hash and subject) and the CI result, or that CI was still running.

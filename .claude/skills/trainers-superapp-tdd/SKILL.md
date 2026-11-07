---
name: trainers-superapp-tdd
description: Primary Trainers SuperApp TDD workflow. Load BEFORE editing for any Lane B/C/D behavior, bug fix, regression, security, permission, auth/RLS, schema/migration, or API-contract work — E2E-first RED-GREEN-REFACTOR with risk-lane classification and repository-specific checks.
---

# Trainers SuperApp TDD (Claude Code adapter)

Use for this repository, especially `apps/telefun`, `apps/api`, `apps/web`, and shared packages.

## Rules

- Before editing, read `docs/AGENT_WORKFLOW.md` and classify the task into a risk lane (A/B/C/D); state the lane and planning artifact in the final report.
- Read the PRD/plan and repository instructions completely before editing.
- `AGENTS.md` and `docs/AGENT_WORKFLOW.md` take precedence over this skill. For runtime behavior/regressions, use focused Playwright E2E as the default regression test, RED-first when applicable, against a verified local or explicitly test-only disposable target.
- If E2E cannot prove a distinct invariant, stop and ask Fajar (use `AskUserQuestion`) before adding or running any non-E2E test. Never add unit tests to `scripts/test-core.json` or `scripts/test-fast.json`.
- Write the focused failing test first (RED), run it, then implement the minimum (GREEN), then refactor.
- Default execution is direct implementation in this Claude Code session. Do not spawn subagents unless the user explicitly asks.
- Keep tests in the app they exercise. Do not modify unrelated files.
- Knowledge tools: follow the Graphify/Context7 matrix in `docs/AGENT_WORKFLOW.md` §5 using the project `graphify` and `context7` skills.

## Vitest gotchas (approved exceptions only)

Use these notes only after Fajar explicitly approves a non-E2E test exception. They are not permission to add or run unit tests by default.

- `apps/telefun` has `globals: false`; import `afterEach, describe, expect, it, vi` from `vitest`.
- Mock paths resolve from the test file directory. A wrong path often causes a timeout because the real network module runs.
- Use `vi.hoisted` for shared mock state.
- For request-body parsing, prefer manual `req.on('data'/'end')` mocks over `Readable.from` when timing is flaky.
- When return types change, update both mocks and handler truthiness checks.
- Derive communication-profile fixtures with the canonical builder rather than duplicating contract fields.

## Verification from repo root

Canonical tier definitions, gates, and lane exceptions live in `docs/AGENT_WORKFLOW.md` §7. Do not report durations unless measured in this session.

- Focused E2E: `pnpm --dir apps/web exec playwright test <spec-file> -g "<test name>" --reporter=line --workers=1`, with output redirected to a scratchpad log rather than piped through `tail`. API-only specs add `--config=playwright.api.config.ts --project <name>`. First inspect the Playwright config and the inherited env; every target must be local or test-only and disposable.
- Never use `pnpm --filter @trainers/web test:e2e -- …`: the literal `--` reaches Playwright, `-g` stops being an option, and the whole suite runs.
- Existing Vitest scripts and suite manifests are legacy inventory. Do not run `test:affected`, `test:core`, `test:fast`, or `test:full` as default verification.

Typecheck/build (use the workspace `typecheck` scripts, not bare `tsc --noEmit`):

```bash
pnpm --filter @trainers/telefun typecheck
pnpm --filter @trainers/api typecheck
pnpm --filter @trainers/web typecheck   # also checks tsconfig.e2e.json, as CI does
pnpm --dir apps/telefun build
pnpm --dir apps/api build
```

When shared types, web UI, or any file under `apps/web/e2e/` changes, include the web typecheck. Trust actual command output over stale editor diagnostics.

## Final gate

Report exact commands, exit status, files changed, and pre-existing failures. Never claim Railway or browser verification without running it.

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

- Focused E2E: `pnpm --filter @trainers/web test:e2e -- <focused-spec>` — first inspect `apps/web/playwright.config.ts` and the inherited env; every target must be local or test-only and disposable.
- Existing Vitest scripts and suite manifests are legacy inventory. Do not run `test:affected`, `test:core`, `test:fast`, or `test:full` as default verification.

Typecheck/build:

```bash
pnpm --dir apps/telefun exec tsc --noEmit -p tsconfig.json
pnpm --dir apps/api exec tsc --noEmit -p tsconfig.json
pnpm --filter @trainers/web exec tsc --noEmit
pnpm --dir apps/telefun build
pnpm --dir apps/api build
```

When shared types or web UI change, include the web typecheck. Trust actual command output over stale editor diagnostics.

## Final gate

Report exact commands, exit status, files changed, and pre-existing failures. Never claim Railway or browser verification without running it.

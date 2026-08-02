# Plan 016: Separate focused, affected, typecheck, and final verification loops

> **Executor instructions**: Follow RED-GREEN-REFACTOR for any script behavior introduced here. Run each verification command and stop on any STOP condition. Update `plans/README.md` when complete.
>
> **Drift check (run first)**: `git diff --stat e356c91..HEAD -- package.json turbo.json apps/api/package.json apps/web/package.json apps/telefun/package.json packages/types/package.json AGENTS.md docs/README.md docs/AGENT_WORKFLOW.md`
> The working tree was heavily modified when this plan was written. Preserve unrelated changes and stop if package scripts have already been redesigned.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED — command changes can silently skip tests if semantics are unclear
- **Depends on**: `plans/014-add-risk-based-workflow-lanes.md`
- **Category**: tests, dx, perf
- **Planned at**: commit `e356c91`, 2026-08-01

## Why this matters

The documented `test:targeted` loop claims 10–30 seconds, but a measured run on the current dirty tree took 58.27 seconds and executed 107 API, 29 web, and all 24 Telefun test files. `--changed` means Git-affected tests, not one task's focused regression, and the root Turbo command starts every test-capable workspace. The project also lacks a standalone root typecheck, forcing agents toward production builds for compiler feedback. Explicit focused, affected, typecheck, and final gates will fail faster and avoid repeated full builds.

## Current state

Root `package.json:15-21`:

```json
"lint": "turbo lint",
"test": "turbo test",
"test:targeted": "turbo test:targeted",
"test:core": "turbo test:core",
"test:fast": "turbo test:fast",
"test:full": "turbo test:full"
```

Workspace behavior:

- API: `vitest run --changed` for targeted; `tsc` only through `build`.
- Web: `vitest run --config vitest.config.fast.ts --changed`; `build` combines `tsc && vite build`.
- Telefun: `test:core`, `test:fast`, and `test:full` all run the same full suite.
- Shared types has only `lint`; no build, test, or typecheck script.
- `turbo.json:33-36` marks `test:core` uncached and dependent on upstream builds.
- `AGENTS.md:92` orders root lint → root build → test:core, placing the expensive build before a likely behavioral failure.

Existing focused-test command pattern to preserve:

```bash
pnpm --filter @trainers/api exec vitest run src/__tests__/<file>.test.ts
pnpm --filter @trainers/web exec vitest run src/__tests__/<file>.test.tsx
pnpm --filter @trainers/telefun exec vitest run src/<file>.test.ts
```

## Commands you will need

| Purpose       | Command                                                                                                                                                                                                                | Expected on success         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| JSON parse    | `node -e "for (const f of ['package.json','apps/api/package.json','apps/web/package.json','apps/telefun/package.json','packages/types/package.json']) JSON.parse(require('fs').readFileSync(f,'utf8'))"`               | exit 0                      |
| Typecheck     | `pnpm typecheck`                                                                                                                                                                                                       | exit 0, no emit             |
| Focused smoke | `pnpm --filter @trainers/api exec vitest run src/__tests__/auth-middleware.test.ts`                                                                                                                                    | focused file passes         |
| Core gate     | `pnpm test:core`                                                                                                                                                                                                       | all curated core tests pass |
| Lint          | `pnpm lint`                                                                                                                                                                                                            | exit 0                      |
| Build         | `pnpm build`                                                                                                                                                                                                           | exit 0                      |
| Format        | `pnpm exec prettier --check package.json turbo.json apps/api/package.json apps/web/package.json apps/telefun/package.json packages/types/package.json AGENTS.md docs/README.md docs/AGENT_WORKFLOW.md plans/README.md` | exit 0                      |

## Scope

**In scope**:

- `package.json`
- `turbo.json`
- `apps/api/package.json`
- `apps/web/package.json`
- `apps/telefun/package.json`
- `packages/types/package.json`
- `AGENTS.md`
- `docs/README.md`
- `docs/AGENT_WORKFLOW.md`
- `plans/README.md`

**Out of scope**:

- Test source files and production source code
- `scripts/test-core.json` contents
- Vitest configuration behavior
- Adding dependencies
- CI workflow creation
- Reducing the curated security/auth/schema coverage in `test:core`
- Fixing unrelated existing test failures

## Git workflow

Use the existing branch. Do not reset the dirty tree. Do not commit or push unless explicitly requested.

## Steps

### Step 1: Add standalone typecheck tasks

Add `typecheck` scripts:

- API: `tsc --noEmit`
- Web: `tsc --noEmit`
- Telefun: `tsc --noEmit`
- Shared types: `tsc --noEmit`
- Root: `turbo typecheck`

Add a Turbo `typecheck` task with upstream typecheck dependency and no emitted outputs. Do not replace production builds; this is a faster intermediate gate.

**Verify**: JSON parse passes, then `pnpm typecheck` exits 0. If unrelated dirty-tree errors exist, capture them and follow the STOP conditions rather than weakening compiler options.

### Step 2: Clarify focused versus affected semantics

Keep `test:targeted` as a compatibility alias if removal would break existing usage, but document it as **Git-affected**, with duration dependent on working-tree breadth. Add a root script alias named `test:affected` pointing to the same Turbo task or rename the Turbo task only if all references are updated atomically.

Document focused commands using explicit workspace and test file paths. Do not create a wrapper that guesses workspace from filenames unless it has dedicated tests.

**Verify**: `rg -n "test:affected\|focused\|Git-affected\|--filter.*vitest run" AGENTS.md docs/README.md docs/AGENT_WORKFLOW.md package.json` finds clear semantics.

### Step 3: Align workspace test-tier descriptions

Document that Telefun's current suite is small enough that affected/core/fast may converge on the full package suite. Do not falsely advertise different coverage. Retain `test:core` compatibility because root Turbo invokes it.

For Web, explicitly note that the fast config excludes component-heavy coverage and must not be used as final evidence for `.tsx` behavior unless the exact test is run with the default config.

**Verify**: docs no longer promise a fixed 10–30 second duration for all dirty-tree states.

### Step 4: Reorder verification for fail-fast behavior

Update the canonical workflow order:

1. `git diff --check` and focused regression;
2. affected workspace lint/typecheck;
3. affected/relevant suite;
4. `test:core` for Lane C/D;
5. production build once at the final applicable gate;
6. full suite once in CI/pre-merge/release for product behavior.

Do not run root build separately in every worker; the integration owner runs it once.

**Verify**: `rg -n "focused.*typecheck\|test:core\|production build\|CI\|pre-merge" docs/AGENT_WORKFLOW.md AGENTS.md` shows the ordered gate.

### Step 5: Run progressive verification

Run JSON parse, typecheck, focused smoke, core, lint, and build in that order. Record exact exit codes. If the pre-existing Telefun scoring failure remains unrelated to this config-only change, stop and report it rather than changing product tests.

**Verify**: every applicable command exits 0, or the executor stops with the exact pre-existing failure and no product-code edits.

## Test plan

No new product tests. Validate script behavior by:

- parsing all changed JSON;
- running standalone root typecheck;
- running one explicit focused API test;
- running existing core, lint, and build gates;
- confirming docs use `affected` and `focused` accurately.

## Done criteria

- [ ] Every TypeScript workspace has `typecheck` using `--noEmit`.
- [ ] Root `pnpm typecheck` exists and Turbo recognizes it.
- [ ] `test:targeted` is no longer described as reliably focused or fixed-duration.
- [ ] Explicit workspace/file focused commands are documented.
- [ ] Final build runs after faster failure-prone checks.
- [ ] Root build is owned by final integration, not every worker.
- [ ] No test file or product source is modified.
- [ ] All applicable verification commands pass.

## STOP conditions

Stop if:

- Existing package-script changes conflict with this design.
- `tsc --noEmit` requires changing compiler strictness or product code.
- A command fails because of unrelated current Telefun implementation changes; report the exact failure rather than editing them.
- Preserving `test:targeted` compatibility is impossible without changing CI or undocumented external automation.
- The change would skip `.tsx` core tests or reduce security/auth coverage.

## Maintenance notes

Treat explicit-file Vitest as development evidence, `--changed` as broad affected evidence, `test:core` as curated pre-push evidence, and full tests as pre-merge/release evidence. Update documented durations from measurements, not assumptions.

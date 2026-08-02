# Plan 014: Add risk-based workflow lanes and proportional quality gates

> **Executor instructions**: Execute this plan only after Plan 013 is DONE. Follow every step and verification command. Stop on any STOP condition; do not improvise. Update `plans/README.md` when complete.
>
> **Drift check (run first)**: `git diff --stat e356c91..HEAD -- AGENTS.md docs/AGENT_WORKFLOW.md docs/README.md`
> Plan 013 is expected to change these files. Compare the live structure with Plan 013's result; stop if it did not establish `docs/AGENT_WORKFLOW.md` as the detailed canonical workflow.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED — an overly permissive lane could bypass necessary testing or security review
- **Depends on**: `plans/013-canonicalize-agent-instructions.md`
- **Category**: dx, tests, docs
- **Planned at**: commit `e356c91`, 2026-08-01

## Why this matters

The current rules impose a full persisted plan, broad context discovery, and full quality review on nearly every code task. That overhead is justified for security, schema, public contracts, cross-module behavior, and UI redesigns, but not for a typo, docs correction, local refactor, or one-file visual token fix. A four-lane risk matrix preserves strict gates where failure is costly while shortening low-risk feedback loops.

## Current state

- `AGENTS.md:145-159` requires a full spec and `plan/markdown/<fitur>.md` for all work.
- `AGENTS.md:42-53` broadly requires Thermo and both UI skills.
- `docs/AGENT_WORKFLOW.md:97` requires Wiki navigation checks before implementation even though Wiki is discovery-only.
- `docs/AGENT_WORKFLOW.md:106-108` lists test, root lint, and root build without a docs/config exception, while `AGENTS.md:92` says docs/config should use targeted checks. This is internally inconsistent.
- TDD must remain mandatory for behavior, bug, security, permission, schema, migration, and API-contract changes.

## Commands you will need

| Purpose            | Command                                                                                                           | Expected on success                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Format             | `pnpm exec prettier --check AGENTS.md docs/AGENT_WORKFLOW.md docs/README.md plans/README.md`                      | exit 0                               |
| Lane presence      | `rg -n "Lane A\|Lane B\|Lane C\|Lane D" docs/AGENT_WORKFLOW.md`                                                   | four lane definitions                |
| Blanket-rule check | `rg -n "Setiap plan.*WAJIB\|Wiki sudah dicek" AGENTS.md docs/AGENT_WORKFLOW.md`                                   | no unconditional matches             |
| Safety check       | `rg -n "security\|permission\|schema\|migration\|API contract\|TDD\|test-first" AGENTS.md docs/AGENT_WORKFLOW.md` | strict high-risk requirements remain |
| Diff hygiene       | `git diff --check -- AGENTS.md docs/AGENT_WORKFLOW.md docs/README.md plans/README.md`                             | exit 0                               |

## Scope

**In scope**:

- `AGENTS.md`
- `docs/AGENT_WORKFLOW.md`
- `docs/README.md`
- `plans/README.md`

**Out of scope**:

- Package scripts and Turbo configuration (Plan 016)
- Graphify/Context7 policy details (Plan 017)
- Global orchestrator skill (Plan 015)
- Product code, tests, migrations, or CI configuration
- Weakening mandatory regression tests for behavior or security changes

## Git workflow

Use the existing branch. Do not commit, push, or publish unless explicitly requested.

## Steps

### Step 1: Add the canonical four-lane matrix

Add a table to `docs/AGENT_WORKFLOW.md` with these classifications:

- **Lane A — docs/config-only**: documentation, comments, simple ignored-file/config corrections with no runtime behavior. No persisted plan, Graphify, product tests, root lint, root build, Thermo, or UI audit. Run relevant syntax/format checks and `git diff --check`.
- **Lane B — local low-risk**: one module, established pattern, no public contract/security/schema/access-control change. Use an inline mini-spec (goal, acceptance criteria, files, focused verification). Run focused tests where behavior is touched, workspace lint/typecheck, and self-review. A persisted plan is optional.
- **Lane C — standard behavior/cross-file**: behavior change, bug fix, or multi-file implementation with moderate blast radius. Persist a plan, use TDD, run focused tests plus affected workspace checks, and run Thermo before final verification.
- **Lane D — high-risk/release**: security, permissions, auth/RLS, schema/migration, public API contract, cross-module architecture, AI billing/usage, production deployment, or significant UI redesign. Full persisted plan, strict TDD, specialist review, root gates, and full-suite/CI verification.

Classification is based on risk, not just file count. If uncertain, select the higher lane.

**Verify**: lane-presence command returns exactly four definitions.

### Step 2: Define planning thresholds

Replace the blanket persisted-plan requirement with:

- Lane A: no plan file.
- Lane B: inline mini-spec unless the user explicitly asks for a persisted plan.
- Lane C/D: `plan/markdown/<feature>.md` with Requirement, Design, and Tasklist.
- User-approved existing plans must still be drift-checked before execution.

Keep spec-driven thinking for every lane; only the artifact size changes.

**Verify**: `rg -n "inline mini-spec\|plan/markdown\|Lane [ABCD]" docs/AGENT_WORKFLOW.md AGENTS.md` shows proportional planning rules.

### Step 3: Make skill gates proportional

Document:

- `thermo-nuclear`: required for Lane C/D code changes; optional checklist/self-review for Lane B; skipped for Lane A.
- `ui-ux-pro-max`: required before a new interface or significant redesign, not for copy-only or a known design-token correction.
- `impeccable`: required for layout, interaction, responsive, accessibility, or meaningful visual changes before PR; not for docs or invisible refactors.
- TDD skill: use the repo-specific TDD skill as the primary TDD workflow; do not load multiple overlapping TDD skills unless one adds a missing capability.

Security/auth/schema/API behavior remains Lane D regardless of apparent code size.

**Verify**: safety-check command confirms strict terms remain.

### Step 4: Make Wiki and docs impact-driven

Remove mandatory Wiki navigation from every pre-implementation checklist. Require Wiki inspection/sync only when the task affects a summary, navigation, contributor workflow, or public contract that the Wiki actually mirrors.

Require canonical docs updates only for changed architecture, public/API/schema contracts, deployment/operations, or user-visible behavior not already documented. A regression fix that restores an existing documented contract does not need a new phase log.

**Verify**: blanket-rule check has no unconditional match; Wiki-required cases remain documented.

### Step 5: Align pre/post checklists with lanes

Rewrite the checklists so Lane A does not inherit root lint/build. Ensure Lane C/D still require appropriate tests and final gates. Link command details to the test tiering section rather than duplicate command prose in multiple files.

**Verify**: format and diff-hygiene commands pass.

## Test plan

No product test is required. Structural assertions:

- all four lanes exist;
- high-risk categories map to Lane D;
- persisted planning is mandatory only for Lane C/D;
- docs/config-only work does not require root lint/build;
- TDD remains mandatory for behavior and regression changes.

## Done criteria

- [ ] Four risk lanes are canonical in `docs/AGENT_WORKFLOW.md`.
- [ ] `AGENTS.md` contains only a concise lane summary and pointer.
- [ ] No unconditional Wiki pre-check remains.
- [ ] No blanket full-plan requirement remains for Lane A/B.
- [ ] Security, permission, auth/RLS, schema, migration, API contract, and AI usage/billing remain high risk.
- [ ] All verification commands pass.
- [ ] Only in-scope files are modified.

## STOP conditions

Stop if:

- Plan 013 has not landed or chose a different canonical workflow file.
- A proposed shortcut would remove required regression tests from a behavior or security change.
- Risk classification cannot distinguish docs/config from runtime configuration safely; report the ambiguous config class instead.
- The changes require editing package scripts; defer those edits to Plan 016.

## Maintenance notes

Review lane classification at task start and again if scope expands. Any task that crosses a trust boundary automatically moves upward. The objective is proportional evidence, not fewer checks regardless of risk.

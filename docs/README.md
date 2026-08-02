# Trainers SuperApp documentation index

This file is navigation, not a second workflow or tool-policy source. Use the owning document for rules and the linked canonical document for technical contracts.

## Instruction ownership

- [`AGENTS.md`](../AGENTS.md) — concise project guardrails for every harness.
- [`docs/AGENT_WORKFLOW.md`](AGENT_WORKFLOW.md) — detailed source-of-truth, risk-lane, planning, knowledge-tool, and verification policy.
- [`GEMINI.md`](../GEMINI.md) — Gemini-host adapter only.
- [`docs/PHASE_PROGRESS.md`](PHASE_PROGRESS.md) — historical phase record, not runtime instructions.
- [`DESIGN.md`](../DESIGN.md) → [`docs/design.md`](design.md) — root design pointer and canonical design system.

## Start here

- [`README.md`](../README.md) — product overview, setup, environments, and common commands.
- [`architecture.md`](architecture.md) — monorepo structure, data flow, backend-first boundaries, and runtime contracts.
- [`auth-rbac.md`](auth-rbac.md) — authentication, approval, roles, and route access.
- [`database.md`](database.md) — schema, RLS, grants, storage, and billing-related data.
- [`modules.md`](modules.md) — human-readable module guide for Dashboard, KETIK, PDKT, Telefun, Profiler/KTP, and SIDAK.
- [`deployment.md`](deployment.md) — deployment and operational configuration.

## Module and contract references

- [`MONITORING_TOKEN_USAGE_BILLING.md`](MONITORING_TOKEN_USAGE_BILLING.md) — AI usage and billing contract.
- [`SIDAK_LOGIC_AND_SCORING.md`](SIDAK_LOGIC_AND_SCORING.md) — SIDAK scoring and aggregation rules.
- [`SIDAK_SCORING_GUARDRAILS.md`](SIDAK_SCORING_GUARDRAILS.md) — safeguards for scoring changes.
- [`LEADER_APPROVAL_ACCESS.md`](LEADER_APPROVAL_ACCESS.md) — leader approval-based KTP/SIDAK access.
- [`telefun.md`](telefun.md) — Telefun module contract and operations.
- [`TELEFUN_ASSESSMENT_CONTRACT.md`](TELEFUN_ASSESSMENT_CONTRACT.md) — Telefun assessment trust boundary and score contract.
- [`integration-tests.md`](integration-tests.md) — PDKT Mailbox RPC integration tests.
- [`checklist-audit-trainers-superapp.md`](checklist-audit-trainers-superapp.md) — parity and audit checklist.

## Verification navigation

### Focused versus Git-affected tests

A focused loop invokes Vitest with an explicit file and runs that file only. For a Web `.tsx` test, use the default Web config rather than the fast config:

```bash
pnpm --filter @trainers/api exec vitest run src/__tests__/<file>.test.ts
pnpm --filter @trainers/web exec vitest run src/__tests__/<file>.test.tsx
pnpm --filter @trainers/telefun exec vitest run src/<file>.test.ts
```

The `--changed` task is different: it selects Git-affected work through Turbo. Its scope and duration depend on the breadth of the dirty tree and task graph, so it is not a promise that one named file or a fixed short interval will run.

### Root tooling contract

The root manifests provide these commands without changing the existing test tiers:

```json
"typecheck": "turbo typecheck",
"test:affected": "turbo test:targeted"
```

Use `pnpm test:affected` for the Git-affected loop. `pnpm test:targeted` remains a compatibility name for the same Turbo task, so do not run both as separate evidence; neither replaces an explicit-file focused command. Workspace typechecking uses `tsc --noEmit`, and there is no workspace-level `test:affected` task.

### Common verification references

- `pnpm lint` — root lint gate when the selected lane requires it.
- `pnpm test:core` — curated cross-module contracts; Web `.tsx` entries must execute under the default configuration.
- `pnpm build` — production build gate for applicable behavior/release work.
- `git diff --check` — whitespace and patch hygiene.

The complete fail-fast ladder and lane exceptions are defined only in [`docs/AGENT_WORKFLOW.md`](AGENT_WORKFLOW.md).

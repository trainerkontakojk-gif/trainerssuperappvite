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
- [`feature-agent-detail-export-csv-md-html.md`](feature-agent-detail-export-csv-md-html.md) — agent-detail report export contract and regression coverage.
- [`SIDAK_SCORING_GUARDRAILS.md`](SIDAK_SCORING_GUARDRAILS.md) — safeguards for scoring changes.
- [`LEADER_APPROVAL_ACCESS.md`](LEADER_APPROVAL_ACCESS.md) — leader approval-based KTP/SIDAK access.
- [`SIDAK_SIMULATION_HISTORY.md`](SIDAK_SIMULATION_HISTORY.md) — SIDAK agent simulation history API, attribution, and leader recording scope.
- [`telefun.md`](telefun.md) — Telefun module contract and operations.
- [`TELEFUN_ASSESSMENT_CONTRACT.md`](TELEFUN_ASSESSMENT_CONTRACT.md) — Telefun assessment trust boundary and score contract.
- [`integration-tests.md`](integration-tests.md) — PDKT Mailbox RPC integration tests.
- [`checklist-audit-trainers-superapp.md`](checklist-audit-trainers-superapp.md) — parity and audit checklist.

## Verification navigation

Command meanings only; E2E policy, target-safety checks, tier exceptions, and verification gates live in [`docs/AGENT_WORKFLOW.md`](AGENT_WORKFLOW.md) §7.

- **Runtime behavior** — focused Playwright E2E: `pnpm --filter @trainers/web test:e2e -- <focused-spec>`. Run only after verifying all targets are local/test-only and disposable.
- **Legacy unit-suite commands** — `pnpm test:affected`, `pnpm test:targeted`, `pnpm test:core`, `pnpm test:fast`, and `pnpm test:full` remain in the repository but are not default verification for new work. Do not add unit tests or run these suites without Fajar's explicit approval.
- **`pnpm lint` / `pnpm typecheck` / `pnpm build` / `git diff --check`** — compile/quality gates when the selected lane requires them; they do not replace E2E behavior evidence.

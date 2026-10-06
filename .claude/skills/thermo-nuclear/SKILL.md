---
name: thermo-nuclear
description: Strict maintainability and correctness review gate required after implementation and before final verification for Lane C/D code changes (thermo-nuclear / thermonuclear review).
---

# Thermo-Nuclear Code Quality Gate (Claude Code adapter)

Use after implementation and after any UI audit, before the final verification/PR gate. This is a strict read-and-review workflow; do not soften material findings into suggestions. Built-in `/code-review` may supplement this gate but does not replace it.

## Audit scope

1. Read the complete diff (`git diff`, plus untracked files), changed files, relevant tests, and project instructions.
2. Trace behavior across boundaries: input, validation, service, persistence, API contract, and UI.
3. Check correctness, security, error handling, race conditions, stale state, type safety, and test gaps.
4. Check maintainability: giant file growth, duplicated logic, unnecessary abstraction, branch/condition explosion, stringly-typed contracts, needlessly complex sequencing, and logic placed in the wrong layer (backend-first per `AGENTS.md`).
5. Look for the "code judo" move: a simpler design that removes concepts, branches, or indirection rather than adding patches.
6. After fixes, rerun the focused E2E and relevant typecheck/lint/build.

## Non-negotiable standards

- No hardcoded secrets or unsafe input handling.
- No production behavior change without a regression/feature test unless Fajar explicitly approves an exception.
- Reuse canonical helpers and types; do not duplicate business rules.
- Do not push a file past roughly 1,000 lines without a documented, justified reason.
- Do not accept a working-but-fragile patch when a materially simpler safe design is practical.
- Preserve existing behavior outside the approved scope.

## Fail-closed findings

A material security issue, data-loss risk, broken core flow, API contract mismatch, or unverified claim means the gate is NOT PASS. Classify each finding as P0/P1/P2/P3 with `file:line`, evidence, impact, and remediation.

## Verification

Use actual commands and results. At minimum:

```bash
git diff --check
git status --short
```

Then run the narrowest relevant E2E, typecheck/lint, and build. Do not claim independent review or visual QA unless it was actually performed.

## Final output

```text
Verdict: PASS | NEEDS_FIX | BLOCKED
Findings:
Evidence:
Verification:
Scope notes:
```

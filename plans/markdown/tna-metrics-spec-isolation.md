# TNA metrics spec isolation

Risk lane: **C** (shared E2E fixture/regression fix, no product contract/schema change).

## Requirement

Make the metrics trend case pass independently and the full metrics spec repeatable on a seeded loopback database, preserving all expected metrics/trends and seed rows. Work only in `fix/tna-metrics-spec-isolation` worktree based on local main `ed1c222`.

## Design

- Use approach (a): select an unoccupied January–April year within `qa_periods` year CHECK 2000–2100, strictly before every existing chat audit year. Read-only SQL preflight fails closed if unavailable. All five existing shared-fixture consumers remain chat and keep their own UUID namespace.
- Set up the trend case's own removal of mapped agent 2's selected-period finding, idempotently; retain expected findings 2 and all trend assertions.
- Assert response status/success in the metrics request helper before any data access, with explicit expected status for negative cases.
- No product, seed, migration, formula, query, or assertion relaxation; no remote/unit/commit/T2 work.

## Tasklist

- [x] Remove old diagnosis worktree; create isolated fix branch/worktree; install offline; pin loopback credentials privately.
- [x] Reproduce focused RED before implementation (`red-trend.log`, exit 1, GET 503/TypeError).
- [x] Implement fixture preflight and self-contained response-guarded trend case.
- [x] GREEN focused grep; full metrics twice serial.
- [x] All five fixture consumers GREEN on a fresh seeded main-schema stack: 29 passed, exit 0. Prior main/T1 mismatch run retained as historical evidence; product/schema/assertions unchanged.
- [x] Web typecheck, web lint, thermo-nuclear scoped self-review, diff check, report.

## Initial verification environment gap (resolved by approved stack swap)

Reuse the only running stack `trainerssuperappvite`; do not stop or change its SQL T1. Main's access spec asserts exactly five Phase 1 RPCs, whereas T1 adds evaluation/cancellation RPCs; main's plan spec uses the old active cancellation path. Their potential failures must be recorded as gaps rather than hidden or repaired outside this scope. All fixture-created rows are exact-ID cleaned; seed remains untouched. After review approval, the T1 stack was stopped temporarily, a fresh main-schema stack passed all 29 tests, then T1 was restored with an approved local reset and its focused gate passed 10/10. See the report update.

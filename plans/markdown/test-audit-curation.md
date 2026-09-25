# Test audit curation

## Requirement

Keep unit tests only when they protect real behavior or contracts that Playwright E2E does not cover. Remove tautological, obsolete, duplicate, and implementation-detail tests; preserve distinct security, API, data, scoring, and user-flow regressions. Do not change production behavior.

## Design

Compare each candidate against production code, sibling tests, and the actual E2E suite. Remove only cases with no distinct regression value or with stronger retained proof. Keep changes incremental, verify every affected suite, and report pre-existing or contention-sensitive failures separately.

## Tasklist

- [x] Read repository instructions, inspect E2E coverage, and preserve the pre-existing dirty worktree.
- [x] Audit same-branch input-shape cases, duplicated retired WebRTC source probes, and owner-boundary overlapping assertions; record baseline focused Web coverage.
- [x] Delete only high-confidence duplicates; retain cases with distinct observable contracts.
- [x] Re-run focused regressions, curated core tests, focused lint, and diff checks; record E2E scope.

## Audit outcome

Earlier intermediate audit notes recorded 26 removals and coverage measurements for that intermediate state only; those percentages are not current evidence. The current tracked diff removes 50 test declarations and adds/replaces 5 consolidated cases, for 45 fewer declarations across 23 test files; six entire low-signal test files were deleted. The worktree already contained the curation batch at session start; it was preserved. Two unused Vitest imports were additionally removed after lint identified them.


High-confidence removals were self-reimplemented password checks, style/word-ban and retired-path source probes, plus overlapping cases consolidated into stronger retained behavior tests. Production code is unchanged. The five Playwright specs cover a Profiler create/duplicate flow, public landing accessibility, optional real magic-link auth, synthetic/opt-in visual checks, and SIDAK detail/export; auth/RLS, API/data boundaries, scoring/retry, and protocol/audio unit contracts remain because E2E does not exercise them.

Verification: latest focused regressions passed (API 130/130 across 3 files; Web 25/25). The serialized root core run `pnpm exec turbo run test:core --concurrency=1` passed all 3 tasks: API 284/284 (25 files), Web 213/213 (16 files), Telefun 157/157 (11 files). Focused ESLint passed on the changed test files, and `git diff --check` passed. Playwright E2E was not run: production behavior was unchanged, and the existing E2E specs do not exercise the removed unit-only contracts.


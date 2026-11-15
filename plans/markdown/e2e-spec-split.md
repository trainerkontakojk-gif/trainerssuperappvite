# Split the oversized E2E specs

Lane C (test-code restructure across many files; no product runtime change).

## Requirement

- The 14 Playwright specs in `apps/web/e2e/` above 1,100 lines are split so each
  resulting spec stays near or below ~1,000 lines. A single test body longer than
  that may keep its file above the target; the test itself is not rewritten.
- Coverage is unchanged: the set of `project | describe path > test title` that
  Playwright lists for the split files equals the set listed for the original
  spec (checked with `playwright test --list --reporter=json`).
- Shared fixtures, mocks, and helper functions move to one module per original
  spec under `apps/web/e2e/helpers/`, so the split specs do not duplicate them.
- File-level setup (`test.use`, top-level hooks, `test.describe.configure`,
  per-file fixture directories) is repeated in every split spec, so each file
  keeps the setup its tests ran under before.
- Playwright configs that match a spec by file name list the new files.
- Docs that name a removed spec point to its replacements.

## Design

- A one-off TypeScript compiler-API script (kept out of the repo) classifies each
  spec's top-level statements: imports, declarations (moved to the helper and
  exported), file-level setup (copied into each split spec), and test units
  (`test(...)`, `test.describe(...)`, and loops that register tests). Units can
  be taken whole or, for one big `describe`, by child test; the describe is then
  rebuilt around the chosen children with all of its hooks. Imports are
  resolved per output file with the type checker, so a shadowed local name does
  not produce an unused import.
- The script refuses to move into a helper: a `let` (an imported binding cannot
  be reassigned), anything that reads `import.meta`/`__dirname` (the path would
  change), and any statement that registers tests without being a unit.
- Module-level mutable state that helpers and tests share becomes a `const`
  holder (`{ current }` or a state object) so it can live in the helper.
- Real-backend API specs run their `beforeAll`/`afterAll` once per split file
  instead of once per spec; per-file state (namespaces, counters, provider
  switches) is re-initialised at the start of each file so a later file in the
  same worker starts from the same state the original file started from.
  Tests that depend on an earlier test in a serial file stay in the same file.

## Tasklist

- [x] Hermetic browser specs: `telefun-audio-fidelity`, `pdkt-flow`,
      `sidak-reports-data`, `sidak-agent-report-download`,
      `sidak-jadwal-shifting`, `ketik-flow`, `telefun-flow`,
      `sidak-dashboard-insights`, `ketik-server-chat`.
- [x] Real-backend/API specs: `sidak-temuan-dates-api`,
      `telefun-scoring-queue-api`, `ketik-session-api`,
      `ketik-review-worker-api`, `monitoring-models-api`; update
      `playwright.api.config.ts` (and the access configs if they match).
- [x] Per spec: `--list` parity, `pnpm --filter @trainers/web typecheck`,
      eslint on the new files, then the split specs run green (failures
      compared against the original spec from `HEAD`).
- [x] Update docs that name removed specs (`docs/e2e-testing.md` layout rule,
      `docs/modules.md`, `docs/SIDAK_LOGIC_AND_SCORING.md`, feature docs,
      helper comments).
- [x] `thermo-nuclear` review, CHANGELOG entry, commit.
- [x] Follow-up: `tna-efek` (1,172 lines, missed by the original count) split
      into `tna-efek-sessions`, `tna-efek-summary`, and
      `tna-efek-exclusions-export` with `helpers/tnaEfekHarness.ts`.
- [x] Follow-up: trim the split files left above ~1,000 lines. The stalled
      AudioWorklet input test moves from `telefun-audio-fidelity-playback`
      (1,026 → 857) to `-recording`; the print and scroll-hint tests move from
      `sidak-agent-report-download-html` (1,011 → 759) to a new `-print` spec.
      `telefun-audio-fidelity-signal` stays at 1,058 lines because its single
      test is about 966 lines and splitting it would mean rewriting the test.

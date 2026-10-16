# PDKT integrity, recovery, and complete history

## Requirement

Lane D. Authorized by the user's `perbaiki` after the read-only PDKT audit.
Baseline: `dd49b2fa`; checkout was clean. Initial implementation authorization
excluded commit/push. The user explicitly authorized commit and push to `main`
on 2026-10-17. Deployment, remote migration, hosted data access, and paid provider
requests remain outside scope.

Close the eight audited defects without changing scoring or the Pahami →
Tanggapi → Telaah composition:

1. Authenticated clients cannot fabricate history/evaluation rows; the existing
   user-JWT reply RPC and backend evaluator must still work.
2. A failed evaluation can be retried immediately; processing leases and fencing
   must still prevent duplicate/stale workers from overwriting results.
3. Detail failures have a visible error, explicit retry and usable mobile Back.
4. Loading/failed settings cannot silently create sessions with defaults. Only a
   successful `data: null` permits defaults; recovery requires an explicit retry.
5. Deleting history preserves the email and shows an honest terminal
   "telaah sudah dihapus" state, without a spinner or a no-op retry button.
6. A rejected re-review request preserves the previous result and retry action.
7. All public message/history/retry projections hide private recipient metadata
   and answer references. Direct history JSON reads must not bypass projection.
8. Mailbox/history reads fetch every page deterministically and fail the whole
   request on a page error; landing totals and CSV receive complete data.

## Design

- Use existing `fetchAllPages` with stable timestamp + ID ordering. Preserve the
  current array response contract and lightweight mailbox list; no new dependency
  or frontend pagination protocol is needed for this corrective change.
- Remove client history INSERT/UPDATE privileges/policy. Restrict direct SELECT
  to safe scalar/evaluation columns; read private JSON on the backend only after
  user-JWT/RLS visibility is established. Keep private snapshots for evaluation
  and Monitoring, and redact them at public response boundaries.
- Pair a new CLI-created migration with a rollback. No data deletion/backfill.
  Verify forward and rollback on the disposable loopback integration database.
- Make terminal failed/completed-incomplete evaluations immediately reclaimable;
  retain the attempt timestamp compare-and-set on every write. Check active
  processing and concurrent retry behavior through authenticated real routes.
- Preserve history-deletion semantics and mailbox delete permissions: do not
  silently delete a trainer's shared email when its replier deletes history.
- Add explicit settings/detail load states, bounded request cancellation and
  buttons built from existing Alert/Button components. Preserve drafts and
  completed results when an operation fails.

Owned scope: PDKT routes/services/components and their focused E2E specs,
`apps/web/playwright.api.config.ts` project registration, migration/rollback and
rollback index, canonical module/database/E2E documentation and plan index.
Shared pagination/auth helpers and unrelated modules stay unchanged unless a
confirmed prerequisite is reported first.

Shared public history metadata is added in `packages/types/src/pdkt.ts`; the raw
evaluation/Monitoring config contract remains intact. The existing legacy React
fixture adapter is adjusted for the settings controller so typecheck remains
valid; no unit tests are added or run.

Knowledge: Graphify queried `processPdktEvaluation` and `fetchMailboxItems`;
live imports/callers remain authoritative. Context7 verified Supabase grants,
column privileges and stable ordered paging. Local repository TDD and migration
adapters loaded; no non-E2E tests will be added or run.

## Tasklist

- [x] Read workflow/skills, audit baseline, relevant contracts and live callers.
- [x] Establish disposable loopback DB and isolated guarded browser target.
- [x] Add authenticated API E2E for integrity/privacy/retry/paging/deletion;
      browser E2E for detail/settings/re-review/deleted-history recovery.
- [x] Run RED and record the expected failures before runtime edits.
- [x] Implement the narrow backend/frontend fixes and paired migration.
- [x] Run focused GREEN, legitimate controls and owning PDKT regression specs.
- [x] Verify local forward/rollback and clean migration replay.
- [x] Run security-boundary, maintainability and Impeccable reviews.
- [x] Run root typecheck/lint/build serially; diff/rollback checks; one Graphify update per integrated code batch.
- [x] Update canonical contracts and record exact verification evidence.

## Evidence

Progress: local loopback Supabase started successfully with auxiliary services
excluded. The existing owner INSERT policy was confirmed live locally. API RED
first run: 5 failed / 1 passed (one generation fixture needed `consumerTypeId`);
corrected privacy/history RED: 2 expected failures (raw recipient and 1000/1001
history cap). Browser RED: 6 expected failures. First browser GREEN: 6/6 passed.
First API GREEN: 5/7 passed; two corrected follow-ups: 2/2 passed (provider
fixture needed expected-answer alignment; 500-ID URLs exceeded the gateway
request-line limit, now bounded to 100). All local gates complete.

- API regression: `pnpm --dir apps/web exec playwright test --config playwright.api.config.ts --project pdkt-resilience-real-backend --project pdkt-evaluation-errors-real-backend --project pdkt-privacy-real-backend --project pdkt-review-evidence-real-backend --workers=1 --trace on`, exit 0, 17 passed (34.0s). Log `/tmp/pdkt-api-regression.log`.
- Browser focused: `E2E_APP_ORIGIN=http://localhost:3007 pnpm --dir apps/web exec playwright test pdkt-resilience.spec.ts --config test-results/pdkt-resilience.config.ts --workers=1 --trace on`, exit 0, 6 passed (35.6s); subsequent full regression also includes repeated failed retries and theme/contrast/target checks. Log `/tmp/pdkt-browser-green.log`.
- Web initial typecheck failed on changed public-vs-internal config/legacy fixture types. Internal Monitoring config and the legacy fixture adapter were preserved; follow-up `pnpm --dir apps/web exec tsc --noEmit`, exit 0. No non-E2E tests ran.

### Final behavior and migration evidence

- Owning browser regression: `E2E_APP_ORIGIN=http://localhost:3007 pnpm --dir apps/web exec playwright test pdkt-flow.spec.ts pdkt-resilience.spec.ts --config test-results/pdkt-resilience.config.ts --workers=1 --trace on --max-failures=1`, exit 0, **89 passed (8.5m)**. Log `/tmp/pdkt-browser-regression.log`; traces/screenshots preserved in `apps/web/test-results/pdkt-resilience-browser-full-regression/`. A stale landing fixture was corrected to use the public email subject instead of a private scenario title; its focused rerun passed before the full run.
- Review found the empty-mailbox `Buat email pertama` action also needed the settings guard. Corrected RED explicitly selects `Semua`: 2 expected failures (`Received: enabled`), exit 1, `/tmp/pdkt-settings-empty-red.log`; traces retained in `apps/web/test-results/pdkt-resilience-browser-settings-red/`. First probe omitted that filter and failed because the control was absent; that was fixture setup, not valid RED evidence.
- Final focused browser command: `E2E_APP_ORIGIN=http://localhost:3007 pnpm --dir apps/web exec playwright test pdkt-resilience.spec.ts --config test-results/pdkt-resilience.config.ts --workers=1 --trace on`, exit 0, **6 passed (28.6s)**. Includes actual Back → reselect → retry at both widths, empty-state creation disabled, repeated failed settings retries, light/dark contrast, 44px targets, keyboard focus, completed score preservation and missing-history state. Log `/tmp/pdkt-browser-final-focused.log`; final traces/screenshots preserved in `apps/web/test-results/pdkt-resilience-browser-final-focused/`.
- Forward and paired rollback SQL each ran with `psql -X -v ON_ERROR_STOP=1 -f <migration-or-rollback>` against the loopback URL from ignored `apps/api/.env.integration`, exit 0. Rollback E2E: `pnpm --dir apps/web exec playwright test --config playwright.api.config.ts --project pdkt-resilience-real-backend --grep 'direct authenticated|private history JSON' --workers=1 --trace on`, exit 1, **2 expected failures** because fabricated INSERT and raw config reads became allowed again. Log `/tmp/pdkt-rollback-red.log`; traces in `apps/web/test-results/pdkt-rollback-api-red/`. Forward SQL reapplied successfully.
- `supabase db reset --local`, exit 0: **84 migrations plus all configured seeds replayed**, latest version `20261016153729`. Log `/tmp/pdkt-clean-migration-replay.log`. Same four-project API command above then passed again: **17 passed (36.0s), exit 0**, `/tmp/pdkt-api-final-replay.log`, traces preserved in `apps/web/test-results/pdkt-api-clean-replay/`.
- Read-only `pg_class`/`pg_policies`/privilege inspection after replay: RLS enabled, only `pdkt_history_select_own`, scalar SELECT true, config/emails SELECT false, client INSERT/UPDATE false, service-role access true. Log `/tmp/pdkt-final-local-grants.log`. These are database diagnostics; no non-E2E test suite was added/run. CLI 2.98.2 exposes no `db advisors` command, so no advisor result is claimed.
- `supabase stop --project-id trainerssuperappvite`, exit 0; task-owned local services stopped and volumes retained. No remote command, paid provider request, commit, push, deployment, or hosted migration.

### Specialist review

Separate security/compatibility pass traced flat/alias init, create, encrypted
retry, mailbox detail, history, direct SELECT/filter/INSERT/UPDATE, ownership and
all projection callers. Positive controls retain owner scalar/API reads, private
stored snapshots, user-JWT reply RPC, shared mailbox deletion permissions,
existing Monitoring config and legitimate re-review. Active-processing and
concurrent retries preserve atomic claiming; success/failure writes retain
timestamp fencing. The API determines owner scope and RLS-visible IDs before
service-role reads; both ID and owner predicates stay on the private read.

Thermo-nuclear review: one settings resource replaces two independent fetch/save
paths; one detail loader owns cache/error/retry/cancellation. Simulation shrank
from 1,402 to 1,361 lines; ReviewStage remains below 1,000 (993). Existing paging
utility is reused, private reads are bounded to 100 IDs, no dependency or broad
refactor was added. The review caught the empty-state creation sibling and the
rollback comment was corrected: the projected API remains compatible with the
rollback, so reverting the API first is not required.

Final paging review also bounded mailbox pages to 100 because each page's
creator-profile decoration uses an `in` URL. This preserves the previous safe
profile-query cardinality while walking every page; the 110-email E2E now
exercises two mailbox pages. The first graph update had just completed, so this
narrow repair is a second integrated code batch and requires a final incremental
update after its focused E2E/quality gates.

Impeccable final audit covers the changed recovery surfaces, not a whole-app
certification: accessibility **3/4**, performance **3/4**, responsive **3/4**,
theming **4/4**, implementation integrity **4/4**; **17/20 (Good)**. Two bounded
visual rounds verified 390/1280px notices, light/dark, and deleted-history view.
Inherited destructive button text was corrected to foreground tokens. Text
contrast/44px targets/focus passed rendered checks; physical touch, screen
readers and text zoom were not exercised. No new animations/assets/dependencies
or decorative success states. Final detector command:
`/Users/nadindyta/.agents/skills/impeccable/scripts/impeccable detect --json apps/web/src/routes/pdkt/index.tsx apps/web/src/routes/pdkt/simulation.tsx apps/web/src/routes/pdkt/components/MailboxSidebar.tsx apps/web/src/routes/pdkt/components/EmailDetailPane.tsx apps/web/src/routes/pdkt/components/PdktReviewStage.tsx apps/web/src/routes/pdkt/components/PdktSettingsNotice.tsx`,
exit 0, `[]`; log `/tmp/pdkt-impeccable-detect.json`.

### Compile and quality gates

- Root typecheck initially failed on Supabase's inferred `GenericStringError`
  for a dynamically joined select string. The exact same selected columns are
  now a string literal so the SDK infers the row. A second run identified one
  retired-scenario E2E fixture carrying `isActive`; it now supplies the public
  `{ id }` contract. Final `pnpm typecheck --concurrency=1 --cache=local:rw`, exit
  0, all 4 workspaces including E2E TypeScript, 12.951s. Log
  `/tmp/pdkt-root-typecheck.log`.
- `pnpm lint --concurrency=1 --cache=local:rw`, exit 0, all 4 workspaces,
  1m3.056s. Log `/tmp/pdkt-root-lint.log`. Web has 70 warnings: 69 outside this
  change or already present (including `historyLoading`); one new DOM-ref
  heuristic on numeric request-generation cleanup was reviewed. Cleanup must
  invalidate the latest request, including explicit reloads; copying a stale
  numeric value would not do that. No rule suppression or gate weakening.
- `pnpm build --concurrency=1 --cache=local:rw`, exit 0, all 3 build tasks,
  20.654s. Log `/tmp/pdkt-root-build.log`; no remote cache writes.
- Changed retired-scenario fixture rerun:
  `E2E_APP_ORIGIN=http://localhost:3007 pnpm --dir apps/web exec playwright test pdkt-flow.spec.ts --grep 'agent legacy pemilih skenario' --config test-results/pdkt-resilience.config.ts --workers=1 --trace on`,
  exit 0, **3 passed (18.6s)**, `/tmp/pdkt-browser-public-fixture.log`; traces
  `apps/web/test-results/pdkt-resilience-browser/`.
- Final query literal confirmation after compilation:
  `pnpm --dir apps/web exec playwright test --config playwright.api.config.ts --project pdkt-resilience-real-backend --grep 'private history JSON|history includes every page' --workers=1 --trace on`,
  exit 0, **2 passed (13.5s)**, `/tmp/pdkt-api-final-query.log`; final traces
  `apps/web/test-results/pdkt-api-final-history-query/`. The local disposable services were restarted for
  this check and stopped again with retained volumes.
- Final mailbox page-size confirmation:
  `pnpm --dir apps/web exec playwright test --config playwright.api.config.ts --project pdkt-resilience-real-backend --grep 'mailbox includes older emails' --workers=1 --trace on`,
  exit 0, **1 passed (6.1s)**, `/tmp/pdkt-api-final-mailbox.log`; final trace
  `apps/web/test-results/api/`. The 110 rows span two 100-row pages. Local
  services stopped again successfully, retaining volumes.
- After that narrow paging repair, all root gates ran again sequentially with
  `--concurrency=1 --cache=local:rw`: `pnpm typecheck`, exit 0, 4 workspaces,
  18.334s; `pnpm lint`, exit 0, 4 workspaces, 53.595s; `pnpm build`, exit 0,
  3 build tasks, 19.847s. Final logs `/tmp/pdkt-root-typecheck-final.log`,
  `/tmp/pdkt-root-lint-final.log`, `/tmp/pdkt-root-build-final.log`. API has
  8 existing warnings in untouched files; web warnings remain as reviewed above.
- `node scripts/check-migration-rollbacks.mjs dd49b2fa`, exit 0, checks 0
  committed additions because this work remains uncommitted. The actual new
  migration/rollback pair is checked separately in the final structural check
  and both directions were executed locally as recorded above.
- Working-tree structural check, exit 0: new migration timestamp/name valid,
  exact paired rollback exists, all 9 untracked text files have final newlines
  and no trailing whitespace. `git diff --check`, exit 0.
- Scoped Prettier check of all 23 changed TS/TSX files plus the new plan,
  exit 0, `/tmp/pdkt-format-check.log`. Canonical documentation was updated in
  `docs/modules.md`, `docs/database.md`, `docs/e2e-testing.md` and the rollback
  index; no mirrored Wiki file was found or modified.
- Graphify: `graphify update .` completed once for the initial integrated code
  batch, exit 0, `/tmp/pdkt-graphify-update.log`; after the final mailbox batch
  bound repair, `graphify update .` completed again, exit 0,
  `/tmp/pdkt-graphify-final-update.log`. Final local code graph: 16,020 nodes,
  30,513 edges, 1,046 communities; JSON/report updated. HTML visualization was
  skipped by the tool's 5,000-node limit. Generated graph cache stays ignored.

## Outcome

**Fixed locally: all eight audited findings.** Failure and bypass triggers no
longer reproduce with the forward migration; legitimate PDKT flows still pass.
No unresolved failing gate. Lint warnings and the exact proof limits are
recorded above. No non-E2E test suite was added or run.

The source, paired migration/rollback, regression specs and canonical contracts
are verified for the authorized commit and push to `main`. Hosted behavior is
not claimed: the new grants must be applied with the application release under
separate deployment/migration authorization.

Browser mocks prove
UI behavior only; real JWT/Hono/PostgREST E2E proves backend/RLS behavior. Local
migration checks do not establish hosted deployment state.

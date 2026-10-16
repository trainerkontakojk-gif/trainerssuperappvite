# KETIK: evidence-led feedback and annotation navigation

Lane D: additive review contract and cross-file backend/UI behavior. User authorized local fixes after read-only audit. No commit/push/deploy/remote migration. Initial tree clean.

## Requirement

- Sudah baik lists concrete good agent responses with quotes/reasons, never dimensions selected by score.
- Perbaiki dulu includes all fix notes and weaknesses, even at scores >=75; score explanations retain advice/examples at any score.
- Every dimension has a discoverable explanation of fulfilled/missing expectations and transcript evidence. Missing/legacy explanations are honestly identified as general guidance, never transcript-derived diagnoses.
- Annotation labels jump to the corresponding result tab/item; result quotes jump back to transcript. Focus, repeated activation, mobile/desktop and reduced motion work.
- Preserve stored scores and five-dimension arithmetic. No invented numerical deductions or automatic re-review of historical records.

## Design

- Add optional evidence quotes and provenance to dimension guidance. AI supplies narration/evidence; backend validates evidence against agent/consumer transcript, owns scores/verdict/rank. Missing evidence uses explicitly general guidance. Request all five explanations in response schema and strengthen rubric with observable criteria.
- Reuse existing JSONB education storage; no migration. Existing persisted explanations without provenance are presented as unverified historical notes.
- Separate review result renderer from stage to avoid growing a near-1000-line file. Controlled result tabs support inline annotation callbacks and focused targets. All weaknesses remain visible; specific good/fix notes retain original numbering.
- Reuse shared QuoteMark onSelect; no changes to PDKT/Telefun behavior.
- Verify browser behavior through hermetic KETIK flow and backend worker/API through existing loopback E2E harness (real JWT/DB/worker, disposable provider HTTP). No non-E2E tests.

## Tasklist

- [x] Read workflow/TDD adapter, existing redesign plan, design and target isolation; inspect graph callers.
- [x] RED browser regressions: concrete strengths/high-score errors, per-aspect explanations, bidirectional navigation and legacy disclosure.
- [x] RED worker/API regressions: evidence validation, missing narration/evidence, legacy fallback and unchanged scoring.
- [x] GREEN contract/backend explanations, result tabs and navigation.
- [x] GREEN focused E2E; visual checks 390/1280, keyboard, reduced motion, console.
- [x] Review: thermo-nuclear, Impeccable mechanical detector and scoped UI audit.
- [x] Typecheck, lint, build, diff-check, one graph update; document exact evidence and limitations.

## Verification evidence

- Browser plugin skill is unavailable; used repository Playwright as required by its test contract. Existing SIDAK worktree owns :3005; did not stop or reuse it. Task-owned Playwright config at `apps/web/test-results/ketik-config.ts` imports the normal config, overrides baseURL/webServer to :3006 and keeps loopback E2E env/reuseExistingServer=false. Preflight now exposes a separate `assertLocalDevOnlyTargetAt(origin)`; zero-argument callback remains compatible with other suites.
- Browser RED: 3 intended failures before implementation (high-score fix omitted, inline marker absent, aspect explanation button absent). RED traces retained under `apps/web/test-results/ketik-feedback-red/`.
- Backend first attempt was infrastructure-blocked (Supabase loopback not running), not RED. Started only local auth/DB/API/gateway, from existing local backup. Valid RED then failed on missing source/evidence through real JWT/API/worker. No remote commands or provider traffic; test transport redirects provider HTTP to a loopback fixture.
- GREEN browser command: `E2E_APP_ORIGIN=http://localhost:3006 pnpm --dir apps/web exec playwright test --config test-results/ketik-config.ts ketik-flow.spec.ts --grep 'KETIK Telaah' --trace on`: **16 passed**, exit 0. After final compatibility fix, reran new regressions with `--grep 'feedback berbukti|penanda anotasi lompat|penjelasan skor lama'`: **3 passed**, exit 0.
- GREEN backend command: `pnpm --dir apps/web exec playwright test --config playwright.api.config.ts --project ketik-review-worker-real-backend --grep 'score explanations preserve|a real worker claims once' --trace on`: **2 passed**, exit 0 after final backend batch. Covers matching quotes, repaired IDs, rejected fictional quotes, empty narration, absent dimensions, historical fallback, unchanged arithmetic, durable worker publication and manual trigger invariants.
- Final traces/screenshots: `apps/web/test-results/ketik-feedback/` and `apps/web/test-results/api/`. Inspected desktop 1280 and mobile 390 screenshots; focus targets visible, no horizontal overflow. Keyboard/repeated activation/reduced motion passed; new navigation test captured no pageerror. Contrast/light-dark and 12px floor passed in full Telaah suite.
- Thermo-nuclear self-review: extracted result renderer (Stage 458 lines, Result 561), reused quote matching in backend transcript module, kept score ownership unchanged, no cyclic policy/annotation import, no scope changes to PDKT/Telefun. No unresolved blocker.
- Impeccable detector exit 2: one existing warning on typo mark `border-b-2` + `rounded-sm` in `quoteMarks.tsx`; this is the established semantic typo underline, not a card accent. Preserved intentional behavior. Changed result renderer hook found no deterministic design issue.
- Typecheck initially caught a callback signature regression in the port preflight helper; fixed by preserving the zero-argument entry point. Final root checks recorded below when complete.

Limit: fixture provider responses prove backend contracts and UI, not live-model scoring calibration. Old results retain stored scores; detailed evidence requires a successful manually requested rerun. Evidence existence does not prove AI reasoning correctness.

### Final root gates

- `pnpm typecheck --concurrency=1`: exit 0, 4/4 tasks (final backend normalization included).
- `pnpm lint --concurrency=1`: exit 0, 4/4 tasks; existing warnings, none in the changed product files.
- `pnpm build --concurrency=1`: exit 0, 3/3 tasks.
- No unit/Vitest tests run. No commit, push, deploy, remote data change, or migration.

- `graphify update .`: exit 0, completed once after final code batch; output `/tmp/ketik-graphify-update.log`.
- `git diff --check`: exit 0. Final path review contains only scoped backend/types/KETIK UI/tests/docs and the port-preflight compatibility helper; no tracked generated build/cache files.
- Stopped the task-started local Supabase project with `supabase stop --project-id trainerssuperappvite` (exit 0, local volume backup retained). E2E :3006 server is stopped; existing SIDAK :3005 was not touched.

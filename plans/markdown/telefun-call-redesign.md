# Telefun call redesign (Lane C)

## Requirement

Implement the approved Main/Berdering/Ditahan/Gagal/Ponsel references using app tokens and existing components; the revised brief wins over mockup differences. Restore consumer portrait and initials fallback. Keep the elapsed call timer, sr-only label, max-duration timeout and internal AI cues; never display remaining call time/countdown/progress. Keep the hold timer, progress, warning, growing overtime, manual-only release, metrics/music/end cue and useTelefunHoldClock unchanged. Add a live microphone rolling waveform. Preserve dock behavior, confirmation and recording callback arguments. Failed calls offer cleanup-first retry with the identical config or return to landing. No services/backend/schema changes.

## Design

Operate-mode constraint record: avatar → display name → one phone/city line with accessible labels → state pill → waveform/helper. Single centered column with 24px rhythm, 128px phone / 168px desktop Avatar, 28px/36px display name. Use module-telefun ringing halos, chart-green speaking halos and bars, dim grayscale held/failed portraits, dark pause badge. Header: Phone chip, title/participant, state chip, elapsed timer. All decorative animation/transitions respect reduced motion. Hold band remains behaviorally unchanged. Failure: inline alert, two 44px buttons, no dock. At 390px no horizontal overflow; short heights may scroll the main column.

Waveform owns its fixed-length 28-sample history and samples the latest level every 90ms, isolating history renders from the screen. Silent bars are low/neutral; muted bars are immediately flat; no synthetic speech animation.

Retry uses the route's existing double-click guard and session creator with a snapshot of the failed config, preserving scenario, identity, model and subject selection. Await failed-attempt disconnect before creating a new session, then key PhoneInterface by session ID. Terminal recording callbacks are retained until explicit failed cleanup so automatic recording completion cannot dismiss the alert. Failed cleanup signals the existing failed end reason before delivering the retained recording; the route saves it without navigating to Telaah. Successful-call recording/end semantics remain unchanged.

Owned paths: PhoneInterface.tsx, HoldStatusDisplay.tsx (only if needed), index.tsx (retry wiring), telefun-call.spec.ts, telefunFixtures.ts, this plan, CHANGELOG.md, requested implementation report. Do not edit hooks, services, holdMetrics, unit tests or other paths.

## Tasklist

- [x] Inspect lifecycle, revised brief, partial fixture diff, references, Avatar helper and hermetic local targets.
- [x] Add focused E2E for portrait/fallback, advancing header timer/no remaining-time UI, waveform/mute/hold, manual hold beyond 60s, failure retry/return and 390px/reduced motion; confirm RED.
- [x] Implement token-based screen, preserve hold band/clock and cleanup-first guarded retry.
- [x] Verify GREEN with telefun-call.spec.ts only, one worker.
- [x] Run web typecheck, changed-file lint, applicable scoped build, diff check and owned-path review.
- [x] In-thread maintainability/UI audit; report exact evidence and legacy-test gaps.

## Verification outcome

RED: the new portrait/helper and failure alert tests failed before implementation; after correcting the inherited fixture to use an actual abnormal WebSocket close, the failure alert still failed as expected. Final `cd apps/web && pnpm exec playwright test e2e/telefun-call.spec.ts`: **12 passed (1.3m)**, one worker. Web and E2E TypeScript checks, changed-file ESLint, web production build, and `git diff --check` passed. Impeccable detector returned `[]`; desktop/mobile and failure screenshots were inspected (portraits intentionally use a local 1px fixture). Full command history and intermediate failures are in the requested implementation report.

Maintainability judgment: PhoneInterface is now about 1,045 lines, including the pre-existing audio/lifecycle implementation. Keep the small waveform subtree local because this contract prohibits new component files or hook/service edits; do not move lifecycle code into the hold display merely to satisfy a line-count heuristic. HoldStatusDisplay/useTelefunHoldClock/holdMetrics/services remain unchanged. Graphify cache updates belong to the integration owner, not this worker.

Follow-up outside ownership: docs/design.md:299 still describes the old initials/dl/thin-meter screen. Existing telefun-phone-interface-end-call.test.ts contains stale ringtone/connect-call assumptions predating this task; it was read, not edited or run.

## Safety and evidence

Inherited dirty work: apps/web/e2e/helpers/telefunFixtures.ts and this untracked plan only. Reviewed and retained the useful failure/socket/portrait fixture seams. Playwright starts its own web server at localhost:3005 with loopback port-9 API/Supabase/voice targets; HTTP and WebSocket routes are hermetic. Portraits are fulfilled/failed locally. No unit tests, agents, remote writes, commits or deployments. Graphify PhoneInterface query corroborated route/transport/Avatar dependencies; live sources remain authoritative. No new library/dependency usage requiring Context7; Playwright clock uses the suite's established API.

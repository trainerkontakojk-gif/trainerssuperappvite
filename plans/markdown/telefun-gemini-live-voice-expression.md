# Telefun Gemini 3.8 Live — execution of agreed Plan v2

> **RESUMED BY FAJAR — 27 October 2026, resource-gated.** Fajar explicitly requested continuation with advanced delegation and safe Mac resource usage. Intake HEAD is `37249ac0fe0e60771cbfbbe3a3a1ec247f373020` on `telefun/failed-capture-scoring-policy`, with a clean worktree. The historical interrupted Pi worker and old unchecked tasks below are not proof that the committed backend fixes are absent. Reconcile each against current source and evidence before changing status. At 07:00–07:04 WIB the 8 GB Mac had only 5–9 minutes uptime, load average declined from 41.04 to 26.08, the second CPU sample showed 37.35% idle, initial memory-pressure free percentage was 72%, and swap use was zero. Begin with bounded read-only inspection; no browser, database, build, or test stack was started for this resume. Recheck live resources before each heavy gate and run only one heavy job at a time. Do not stop unrelated applications or erase test volumes. Advanced delegation `deleg_18b4ccc4` is a read-only backend/SQL specialist reconciliation, with tests/services/writes forbidden. Paid Gemini evaluation, voice/example activation, push/deploy and remote database mutations remain outside this resume's authorization. Earlier passing gates must be matched to their actual code snapshot; they do not automatically certify this commit.

## Requirement

Execute Fajar's exact six-phase Plan v2 (25 October 2026), as revised through three rounds of Claude Opus 5.5 high discussion. Canonical full audit: `/Users/nadindyta/Downloads/telefun-plan-v2-audit-kesepakatan.md`; original SHA-256 `4890aa596769e5fc6a554b53a019425a0fd8067d8bf341e587c7bba64d80aad7`.

Fajar authorizes implementation and advanced delegation, including Pi if appropriate. This does not remove the agreed listening/device, voice/example approval, paid-call budget or remote-write gates. No commit, push, deploy, remote migration/DB mutation, provider call, or change to other profiles is authorized in this execution batch. Preserve existing dirty work. The initial browser-only audio batch was Lane C. The explicitly approved backend/queue extension below is **Lane D**; prepare and exercise additive migrations/rollback only against verified local disposable targets, never a linked/remote project.

## Design

### Explicit scope extension — failed capture must never be scored

Fajar answered the clarification with: **“Jangan nilai jika salah satu rekaman gagal; perluas scope ke backend dan pengujian antrean.”** This supersedes the earlier browser-only boundary for this specific policy. The read-only postrepair review identified that the existing Gemini finalize endpoint can enqueue whenever an agent path exists even when `captureStatus` is failed, and existing database claim guards only enforce readiness for retired WebRTC rows.

- Preserve every valid completed recording independently; never drop a valid agent file merely to prevent scoring.
- A failure of either required recording must be authoritative in backend enqueue, claim, direct/manual scoring and durable state transitions. No incomplete/failed capture may invoke an AI evaluator, including a previously queued job or a late retry/ready callback.
- Trace canonical latest SQL definitions, worker claim/fencing and all scoring entrypoints before edits. Prefer existing fields and contracts; do not invent a new scoring system or revive WebRTC. Preserve historical records and completed score reads.
- If an already-processing claim is invalidated by capture failure, invalidate its fencing/readiness and prohibit new provider work or late score persistence. Do not claim to cancel a provider request that already reached the provider unless the runtime actually supports it; report the race boundary precisely.
- Add a forward migration plus safe rollback only if durable SQL guards require it. Preserve service-role-only guards, search paths, grants, lease/fencing, ownership and retry constraints. No `supabase db push`, linked project write, production migration or release.
- E2E-first: real local Hono routes and verified loopback disposable database/RPC/queue path; provider/storage transport fixtures fail closed. Include failed full/valid agent, valid full/failed agent, both failed, valid both positive control, re-enqueue/reclaim/direct-score denial, delayed ready/failure races and failed transition persistence. Browser-only request spies are insufficient proof of queue suppression.
- Complete remaining browser correctness repairs from the postrepair review: lifetime recorder-error detection, failed recovery ordering, confirmed cleanup completion, object-based stale-auth assertion and ACK-pending oracle.
- Backend/worker specialist review and root affected typecheck/lint/build plus the safe E2E gates are required before local integration acceptance. Remote deployment remains a separate authorization and evidence gate.

Local test prerequisite discovery: Docker socket was unavailable. OrbStack was started for test dependency recovery; verify its containers and target ports before any test use. No remote database is an alternative fallback.

### Current executable batch: phase 1 + preparation for phase 6

- Input context remains 16 kHz, provider PCM/MIME 16 kHz, input metrics cadence and agent-only capture graph unchanged.
- Output/mixing context uses device-native rate without `sampleRate` constructor option. Verify actual rate; Gemini PCM buffers retain source rate 24 kHz; scheduling clock belongs to output context.
- AI connects only to output speaker and full-call recording. A second `createMediaStreamSource` from the original mic stream connects only to full-call destination in output context. Never connect nodes across contexts, or mic to speaker.
- Native below 24 kHz is a capability limitation, not grounds to block a formerly working call. Do not force 16 kHz, silently swap architecture, or claim fidelity PASS. Existing observable console diagnostics may record actual rates; no UI indicator, new event-name, persistence or schema.
- Both contexts have bounded startup/error/end/partial-worklet-load cleanup and resume handling. Use existing playback-blocked/retry UX; do not confuse low native rate with autoplay blocking. Hold/mute, pickup/ring, interruptions, output queue drain and actual recorder final chunk must remain correct.
- Preserve recorder codec/bitrate 32 kbps for both. Speaker bandwidth and decoded recording fidelity are separate acceptance contracts. If codec limits recording, report the limitation rather than altering bitrate/storage or weakening checks.
- Scoring audio contract is preserved mechanically; numerical score equality and real-model acting improvement are not promised.

### Verification

Use real browser UI flow and fail-closed hermetic mock service targets. Feed declared synthetic 24 kHz PCM through the actual model event path and real AudioContext/MediaRecorder graphs. Use known mic input and decode actual captured upload bodies. Do not replace product graph or business logic with fake successful output.

Freeze control/calibration thresholds before RED: positive direct-recorder codec control and old-graph negative control, with signal and duration metrics. RED must fail for the intended audio regression, not disabled MicCheck, auth/network/setup or arbitrary timeout. Real audio clock is not advanced by Playwright's virtual page clock. Cover speaker high-frequency preservation, provider sample rate/MIME and pitch, mixed vs agent-only isolation, chunk continuity/finalization, hold/mute, worklet/fallback, autoplay blocked/retry without unconditional autoplay flags, cleanup and partial startup, and mock limited-native-rate continuation. Device Safari/iPhone/Android acceptance remains a separate manual gate.

Only focused Playwright E2E; no unit/Vitest/isolated tests without separate permission. Existing Playwright env is loopback Vite-only and `/api`/Supabase/Telefun dead-loopback defaults; verify hermetic interceptors and guards for each run. Serial workers/checks on this host. Compile/lint/build are allowed quality gates, not runtime proof.

### Remaining phases (not silently dropped)

- F2 voice: candidate pool/listening and Fajar approval required before activation; preserve full catalog, manual selection, gender and retry/legacy/custom invariants.
- F3 prompt restructure: separate checkpoint, hard role first and all safety/identity/hold/time/closure guards retained. Do not fold into audio batch; dirty two-patch mini-plan remains baseline.
- F4 oral examples: prepare proposal, await Fajar's text approval; neutral Kak allowed, no invented facts or universal quota.
- F5 MOOD: deferred until controlled evidence of unwanted drift, protocol safety and new-control/cost approval. No periodic injection now.
- F6 evaluation: prepare offline paired-PCM artifacts, blind rubric and device checklist now; paid Live/scoring calls require explicit budget/target/retry/privacy approval.
- VAD/Extended Thinking: deferred higher-risk contract/pricing decisions.
- 3.1 retirement: separate deadline track before 17 November 2026; retain historical lookup. 3.0 deadline unverified, no forced retirement bundled here.

## Phase 6 offline listening preparation — 2026-10-26

No model or provider audio was generated. The blinded pair is stored outside the
repository at
`~/.hermes/cache/scratch/telefun-v2-implementation/phase6-offline-ab/blind/`;
the randomized mapping is isolated in the sibling `key/answer-key.md`. It uses
the same synthetic 24 kHz, 1.6 s 1 kHz + 10 kHz PCM through the direct native-rate
48 kHz graph and the old 16 kHz graph, encoded by the same browser MediaRecorder
at requested 32 kbps. Decoded controls are both 1.56 s. This comparison is only
for graph coloration/aliasing, not speech, voice/persona, naturalness or model
acting.

The pre-RED numeric gate remains unchanged: full-call 10 kHz RMS must be at least
0.5 of the direct 32 kbps codec control, and 6 kHz alias RMS must be at most 0.5
of the measured 10 kHz RMS. The frozen direct control measured 10 kHz RMS
`0.0988557`; the old 16 kHz control had no measurable 10 kHz component and 6 kHz
alias RMS `0.0863097`. The pair is blinded for optional human listening; this does
not replace the technical E2E gate or establish device fidelity.

### Listening rubric and predeclared graph-only decision rule

Use the same level, randomized order and two listens. Record A/B preference,
confidence (`low`/`medium`/`high`) and whether the difference is clear or
uncertain. Use 1–5 anchors:

| Dimension                                  | 1                                                      | 3                                                          | 5                                               | Graph-only pair   |
| ------------------------------------------ | ------------------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------- | ----------------- |
| Clarity / artifacts                        | Unusable or severe distortion                          | Understandable with recurring audible coloration/artifacts | Clear, clean, no salient artifacts              | Rate              |
| Naturalness                                | Strongly artificial or distracting                     | Mixed/noticeably synthetic                                 | Convincingly natural                            | N/A: tone fixture |
| Persona fit                                | Contradicts the approved consumer type                 | Mixed/inconsistent                                         | Consistent with the approved type               | N/A: no speech    |
| Response to template vs concrete assurance | Ignores explicit evidence or remains implausibly stuck | Partially proportional                                     | Reacts proportionally without dropping the role | N/A: no dialogue  |
| Role / procedure                           | Role or safety boundary broken                         | Minor inconsistency                                        | Correct role and procedure throughout           | N/A: no dialogue  |

For this graph-only listening, the native-rate sample must not score below the
legacy sample on clarity/artifacts on either repeat. A lower or uncertain result
is recorded as inconclusive/needs Fajar review, not reclassified as a technical
pass. These anchors are not new application indicators. Any future voice/prompt
or provider evaluation needs Fajar's explicit call/scoring budget, target,
retry, privacy/storage and listening approval first.

### Audio gate evidence — 2026-10-26

The focused synthetic Chromium test
`apps/web/e2e/telefun-audio-fidelity.spec.ts` measured the output-context tap at
48 kHz: 10 kHz RMS `0.1069466`, 6 kHz alias RMS `0.0001678`, retention `1.0818`
versus the frozen direct-codec control, alias ratio `0.00157`. This output graph
path passes its frozen `0.5`/`0.5` spectral thresholds. Five uploaded full-call
captures measured retention `0.0823`, `0.0997`, `0.4057`, `0.6755` and `0.6911`
versus the same direct-codec control; two met and three missed the pre-RED `0.5`
criterion. The full-suite run reports
`recordingHighFrequencyCriterionMet: true` for its `0.6911` capture, while a
subsequent focused rerun reports `false` at `0.0997`; the gate is inconsistent
and **not accepted** overall. It must not be called reliably green. The 32 kbps
recorder settings and criterion remain unchanged. The observed full-call result
is documented, not hidden by the separate speaker-graph result. Evidence logs:
`~/.hermes/cache/scratch/telefun-v2-implementation/speaker-graph-test.log`,
`speaker-graph-final-retry.log`, `green-final.log`, `strict-codec-control.log`,
and `green-separated-gates.log`.

The latest full serial audio-fidelity run (15 tests, 9 passed / 6 failed) on
2026-10-26 measured full-call retention `0.1753` versus the frozen direct-codec
10 kHz RMS `0.0988557`; the matched full-mix control was also `0.1753`, below
`0.5`. Pre-encoder full-mix 10 kHz RMS was `0.1069`, and speaker-path retention
was `1.0812` with alias ratio `0.00157`, so the failure is specifically in the
full-call recording gate, not the speaker graph. Another isolated run measured
`0.6901` and passed the same gate. This run-to-run spread leaves recording
acceptance inconsistent and **blocked**; no threshold or 32 kbps setting was
changed. Full run log: `~/.hermes/cache/scratch/telefun-v2-implementation/e2e-lifecycle-final-full.log`.

### Manual device evidence template (all rows intentionally untested)

| Date / run ID | Physical device + OS | Browser / version | Selected mic / output device | Observed input / output rates | Permission / autoplay conditions | Scenario / model / voice (only if authorized) | Duration / approval reference | Result + artifact hashes | Cleanup / issues |
| ------------- | -------------------- | ----------------- | ---------------------------- | ----------------------------- | -------------------------------- | --------------------------------------------- | ----------------------------- | ------------------------ | ---------------- |
|               |                      |                   |                              |                               |                                  |                                               |                               |                          |                  |

Safari/macOS, iPhone and Android acceptance remains a separate manual gate.

## Verification snapshot — 2026-10-26

- The latest full serial command was
  `pnpm --filter @trainers/web exec playwright test --config playwright.config.ts e2e/telefun-audio-fidelity.spec.ts --headed`
  (log: `~/.hermes/cache/scratch/telefun-v2-implementation/e2e-lifecycle-final-full.log`).
  It ran 15 tests: 9 passed and 6 failed. The strict full-call retention gate
  failed at `0.1753`; five other tests hit setup/resource-timeout failures under
  the loaded host. The later E2E-only changes enabled the ring-start button
  precondition and extended time budgets; the complete suite was not rerun
  afterward.
- Focused final lifecycle rerun of server-close retry, matching drain ACK, and
  missing-ACK bounded shutdown passed `3/3` using one worker
  (`e2e-lifecycle-focused-final.log`). Other focused passes: cancel during
  resume + stale WebSocket open `2/2`; user-driven retry + mute/hold `2/2`;
  missing agent recorder stop `1/1`; AI hold/resume `1/1`. The latest full run's
  strict recording gate remains the acceptance blocker despite a separate
  isolated pass at `0.6901`.
- Final quality checks passed after the latest source/test edits:
  `pnpm --filter @trainers/web typecheck`, scoped ESLint on the four changed
  Telefun source files plus the audio E2E/helper, Prettier check, `git diff
--check`, and `pnpm --filter @trainers/web build`. Build emitted only Vite's
  existing warning about `__dirname` in `vite.config.ts`. No full E2E rerun was
  attempted after timeout adjustments; host load was observed above 40 at one
  point, and unrelated system/OpenBot processes were left untouched.
- Graphify's query twice resolved to the same broad 156-node `LiveSession` BFS
  and was not useful; per workflow, stopped querying and used live imports,
  callers, code and E2Es. One `graphify update .` completed after the code batch.
- Parent independent advanced-delegation reviews **were authorized and performed**
  (`deleg_cb00504f` and `deleg_7c8c659f`). The child was forbidden to spawn extra
  agents; that restriction did not prohibit the parent's independent review.
  The latest review remains NEEDS_FIX and motivated the backend scope decision.
  Physical-device and human-listening gates remain unrun.

## Tasklist

- [x] Read complete agreed plan, live workflow, initial Git state and test target isolation.
- [x] Start independent advanced-delegation read-only acceptance review.
- [x] Record and freeze baseline worktree/prompt fingerprints and calibrated audio acceptance before RED.
- [x] Pi single-writer: add focused real-signal E2E and prove intended RED.
- [x] Implement dual-context audio and owned lifecycle repairs; focused graph/lifecycle E2E passes. Uploaded full-call high-frequency acceptance remains inconsistent/unaccepted, as recorded above.
- [x] Integrate the reviewed lifecycle/oracle findings within scope; no additional coding agent was launched.
- [ ] Lane D: implement Fajar's explicit failed-capture backend/queue policy, preserving valid sibling recordings and all billing/auth/fencing boundaries.
- [ ] Prove backend/RPC/claim/direct-score policy with real local E2E plus rollback/forward coverage; no remote mutations or provider calls.
- [ ] Repair and re-review remaining lifetime recorder errors, immediate recovery ordering, confirmed context release, and E2E oracle gaps.
- [ ] Re-run the complete E2E suite after the last timing/precondition-only test edits when host load permits. The latest full suite still fails the frozen full-call gate, so phase-1 acceptance is not granted.
- [x] Integration owner: one Graphify update after the final code batch; `git diff --check` passed.
- [x] Prepare phase 6 offline A/B, listening anchors and manual device evidence template.
- [x] Report exact completed work, actual checks and remaining phase-by-phase gates; do not mark all six phases implemented.

## Evidence and ownership

- Pre-existing dirty: CHANGELOG.md, promptBuilder.ts, telefun-consumer-prompt.spec.ts, docs/telefun.md, untracked mini-plan. Preserve bytes outside scoped incremental additions.
- Execution baseline manifest: `~/.hermes/cache/scratch/telefun-v2-execution-baseline.json`.
- Advanced read-only review: `deleg_a2fdb934` / `gpt-6.1-sol`.
- One Pi writer will own liveSession.ts, focused audio E2E/helper files, and scoped docs/changelog/this execution checklist only. Parent does not concurrently write these files while Pi is active.
- gbrain code_blast/code_callers returned permission_denied to agent calls; Graphify query + direct source/import/caller inspection is the documented fallback. Graphify has historical stale nodes, so live source wins.


## R5 implementation checkpoint — 26 October 2026

Emilia selected design A: a small disposal coordinator outside React. This
Lane C browser repair is part of the current Lane D integration batch. The
coordinator owns only audio release/admission and bounded context-close retry;
recording, protocol, finalization and upload remain in their existing owners.
The active backend/SQL/E2E backend snapshot is frozen while Rem verifies it.
Fajar explicitly approved the isolated analysis-guard unit cases and API suite
via OpenBot: “Izinkan unit test dan suite API”.

- [x] Add E2E source oracles for held-close re-entry, admission timeout and repeated rejection/exhaustion; strengthen early mic-release and preserve startup-abort/unmount cases.
- [x] Implement retained disposal ownership for disconnect/unmount/startup-abort, with pending close joined and three actual close attempts per context.
- [x] Update analysis unit fixtures with an active matching claim and add absent/changed-hash and failed-capture provider-denial cases.
- [ ] Rem: execute focused browser E2E and API suite serially; Ram has not run tests/build/typecheck/DB/browser because of the resource constraint.
- [ ] Emilia: independently review incremental R5 patch and runtime evidence before acceptance.


## Four deterministic audio failures — Ram, 27 October 2026

Lane C browser correction within the Lane D integration. Scope: PhoneInterface
and the audio-fidelity spec only; no backend, audio thresholds, bitrate, provider,
DB or remote changes. Preserve the 35-path dirty checkpoint.

Requirement: stale socket open cannot authenticate after shutdown; server-close
retry waits for recorder/audio release and completes a picked-up new call;
missing recorder completion preserves its valid sibling and saves failed capture
without scoring; hold stops real AI speaker signal and release resumes it.

Design: replace timer-driven stale-open injection with an explicit gate, require
pickup before retry-call recording assertions, keep the speaker analyser clocked
through zero input after sources disconnect. Re-evaluate the terminal reason
after awaited shutdown so a capture failure arising during it delivers its saved
failed recording. Keep cleanup ownership/retry guards unchanged.

- [x] Verify baseline hashes and Rem's five identical RED runs.
- [x] Validate corrected fixture ordering against unchanged production source:
      RED 2 passed / 2 failed; server-close retry and hold passed. Stale-open
      accessor injection still allowed authentication, so intercept open dispatch
      before the registered listener and keep the no-auth/CLOSED assertions.
- [x] Confirm missing-stop production failure: terminal capture failure during
      awaited disconnect left a pending recording behind the original reason.
      Re-read the terminal ref after successful disconnect before notifying route
      and flushing the failed recording; cleanup/scoring guards are retained.
- [x] Repair confirmed production failure; GREEN four-case batch: 3 passed /
      1 failed (stale-open oracle). After navigation, install the socket probe on
      the actual Playwright mock; stale-open-only verification: 1 passed / 0 failed.
      No batch retry. Every run used resource/usage gates and released its lock.
- [x] Record per-case classification, hashes, results and the historical 10 kHz
      blocker in Shared/telefun/ram-four-audio.md with incremental patch/scope proof.
      Web + E2E typecheck and scoped ESLint passed; no build or full-suite rerun.
      Final spec change after E2E is a type-safe alias of the same AudioContext.
- [ ] Integration owner: review evidence, rerun full gates when appropriate, and
      resolve frozen 10 kHz retention acceptance without lowering its threshold.

## Resource-gated resume — 27 October 2026

Requirement: continue authorized local repairs with advanced delegation while keeping the Mac safe. Route `delegate`; narrow Lane D retirement/queue repair before any new voice/prompt activation. Parent owns orchestration and acceptance; one Pi writer owns the scoped repair. Contract: `/Users/nadindyta/.hermes/cache/scratch/telefun-v2-resume-contract.md`, SHA-256 `62bfec966f4bdb483a6f8deaff9918281df2048b075104a873767836139ce073`, 4755 bytes.

- Advanced review `deleg_18b4ccc4` identified a current P1: historical pending/due retry rows bypass readiness in `fetchPendingJobs`, but both claim RPC overloads reject them. They can repeatedly occupy the page and starve Gemini; direct historical terminal scoring can return 503 instead of retirement 410. Parent verified the production query, worker, route, SQL and existing E2E gap. Existing failed-capture admission/fencing repairs were not reported as absent.
- Repair design: a narrow administrative retirement path, not a failed-capture scoring-readiness bypass. Preserve current claim/enqueue/completion/provider/latch restrictions; terminalize only eligible retired historical work without provider calls, preserve cache and live claims, and retain existing auth/error contracts. Additive migration plus matching rollback only if needed; never edit the committed migration to hide drift.
- Pi `openai-codex/gpt-6-luna`, thinking `max`, process `proc_9451b44964fd`, prepares only real-backend E2E regressions in the first stage. No tests/services/builds delegated to it at this stage. Parent runs RED after Pi exits, then resumes the same implementation owner with actual evidence.
- The stopped Docker engine was started after current resource checks. Existing volumes were retained. The task-owned minimal stack has only database, auth, PostgREST and Kong; actual published bindings read back as `127.0.0.1:54321` and `127.0.0.1:54322`. Docker bridge option is loopback. Capture-readiness helper and both claim/fail overloads exist in the current local catalog. No migration was applied by this resume yet. Initial container memory was under 250 MiB in aggregate (the largest was Kong at about 100 MiB); host memory-pressure free remained 65%, swap zero. No Chromium/Vite/build/typecheck was started. The CLI's generic wildcard notice does not supersede actual port bindings.
- Advanced review `deleg_59eb2126` independently inspects existing audio source/metrics read-only; no audio tests or edits authorized to that child.

[at 07:04 27.10.2026] GATE backend-source-review STATUS=rejected worker=deleg_18b4ccc4 open_items=retired-queue-starvation,manual-retired-503
[at 07:11 27.10.2026] GATE local-target-preflight STATUS=accepted worker=Moy open_items=real-backend-RED,implementation,serial-GREEN,fresh-review

### Handover after Pi completion — 27 October 2026

Fajar requested an updated unfinished-work handover so another agent can continue. Pi implementation process `proc_d9fb8c46a397` completed normally, exit 0; its final report is **partial: implementation authored, verification pending** at `~/.hermes/cache/scratch/telefun-v2-resume-pi-implement.log`. Parent read the report and final migration/rollback and checked `git diff --check` (exit 0). No matching active Pi writer or Playwright/Vite process remained at the 07:31 readback. The minimal local DB/auth/PostgREST/Kong stack remained running on loopback; storage was not started. Do not interpret historical stopped-stack evidence as current state.

The final additive RPC signature is `public.retire_telefun_openai_scoring(uuid,text,jsonb) RETURNS boolean`; the rollback drops that exact signature. The previously committed failed-capture migration/rollback remain unchanged. New product/test/SQL/docs changes are uncommitted. The parent did not apply the new migration or run postimplementation GREEN, typecheck, lint, build, Graphify update or fresh review. Those gates and the RPC cache-preservation review are explicitly transferred, not accepted. No further writer or product gate was launched after this handover checkpoint.

Authoritative current handover: `/Users/nadindyta/Downloads/telefun-plan-v2-pekerjaan-belum-selesai.md`. It includes final ownership, exact modified paths, RED evidence, local-target/resource preflight, remaining migration/E2E/quality/review gates, 10 kHz investigation and all six phases. Read live Git/process/resource state before takeover; preserve dirty work. Paid evaluation, voice/example activation, remote DB mutation and release remain gated separately.

[at 07:31 27.10.2026] GATE writer-stage-only STATUS=accepted worker=Pi-single-owner open_items=local-migration-and-rollback,serial-GREEN,quality-gates,cache-preservation-review,fresh-review,10khz-fidelity,manual-device-and-listening

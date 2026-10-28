# Telefun — live playback crackle investigation

Local commit checkpoint: `5ec2f8e89dca354fc5e58a1299ff4a5598e327ab`, `fix(telefun): jaga kontinuitas playback PCM dengan lead 240 ms dan antrean antar-turn`, on `telefun/failed-capture-scoring-policy`. Five scoped source/test/doc/changelog paths committed; committed code blobs match final acceptance hashes and changelog gate passes. No push/deploy. This plan is now tracked per `plans/markdown/README.md`; earlier no-commit snapshots below remain historical.

> **LOCAL PASS — 28 October 2026,11:26WIB: Moy completed this continuation directly without delegation.** Final-source focused browser10/10, broad audio26/26, root typecheck/lint/build, scoped format, Graphify and diff-check PASS. Source hashes match both final manifests. Existing0.4s input spread and waveform limits remain frozen. Historical failures below remain failures; their precise causes are not inferred from later passes. No paid Gemini/device acceptance, remote mutation or rollout. Full report: `/Users/nadindyta/Downloads/telefun-gemini38-resume-20261028.md`.
>
> Historical checkpoint: **STOP / BLOCKED — verified 28 October 2026, 09:17 WIB.** The explicitly authorized two-blocker continuation is NOT accepted. All eight workers used; final Sol closure audit rejected a pre-callback stall-detection gap. Parent-authored pacing experiments after the reviewed snapshot also remain unaccepted; latest jitter run failed stimulus span0.640s vs<0.450s. No task runner/port3006 listener remains. Preserve dirty work, no new worker/test loop from duplicate completion notifications. Paid provider/device/remote work remains outside scope. Full latest evidence/status: `/Users/nadindyta/Downloads/telefun-gemini38-resume-20261028.md`. Historical passes below do not certify current source.

## Requirement

Fajar reports cracked/distorted live AI speech at localhost. Historical resumptions used advanced delegation; the latest instruction explicitly requires Moy to work directly without delegation. No real Gemini calls, remote changes, or unrelated server shutdown. Distinguish a reproducible playback transport defect from the still-unverified exact cause of Fajar's listening symptom.

## Design

Lane C. Intake HEAD `6e4e0721f34fb541f95f2f0b11421dd79bebb91b`, clean worktree. Playback source has not changed since `37249ac0`; current prompt and band-energy-test changes remain intact. Current `playPcm` schedules each chunk at max(currentTime,nextStartTime) with no startup headroom. Hypothesis: realistic delayed PCM delivery can exhaust the queue and introduce audible gaps; investigate before product edits. Capture actual rendered speaker PCM in a hermetic browser UI flow, compare a phase-continuous source with scheduled/observed gaps, preserve unclipped low-frequency synthetic PCM as a positive control. Existing full-call/agent-only fidelity/hold/interrupt/finalization controls remain mandatory and unchanged.

The user's current dev server occupies port3005 and cannot be safely reused for hermetic tests. Use an ephemeral scratch Playwright config on loopback3006, pinned dead-loopback API/Supabase/voice env, fail-closed network interception, one headed Chromium worker, retries0. Keep the user's existing server untouched. Owning spec uses existing assertLocalDevOnlyTargetAt(origin) so safety checks cover the actual test origin.

Allowed product surface if hypothesis is confirmed: existing LiveSession playback scheduling only, preserving sample rates, levels, recorder32kbps, model/voice/prompt, billing, mute/hold/interrupt/drain/cleanup. Do not change microphone/scoring or audio acceptance gates. No new UI indicators. A small bounded scheduling headroom may be justified only after intended RED. Any larger resampler/queue architecture or provider experiment needs a separate decision.

## Initial tasklist (historical; latest closure below)

- [x] Check live Git, agents, dev server, resource and source. No competing code writer identified; existing app stack preserved.
- [x] Add realistic chunk spacing to existing hermetic socket fixture and one real-render jitter E2E; prove intended RED with an audio-thread observer.
- [x] Implement bounded 240 ms initial/recovery playback headroom; final jitter E2E passed 3/3 repetitions, retries0, same 6 ms silence/1 ms adjacency thresholds.
- [ ] Finish audio regression verification. Fresh final batch1 on repaired/formatted source stopped: 5 passed, 1 failed, 3 unrun; provider-input payload duration 5.12 s versus observed wall clock 5.594 s gives 0.474 s, exceeding unchanged <0.4 s gate. No rerun or threshold change. Prior pre-repair batch2 8/8 is not final certification. Remaining batches and typecheck/lint/build deferred pending this unexplained input-timing failure.
- [ ] Final fresh blind re-gate REJECTED: actual browser arrival spacing for the 100 ms jitter stimulus is logged but not asserted; a burst could falsely pass. Parent verified the missing assertion in spec1887-1970. Two review rounds exhausted: STOP this run family, no further repair/review chain. Initial Terra lifecycle review's consecutive-turn finding was repaired with RED→GREEN.
- [x] Canonical Telefun audio contract and handover updated in place, scoped test/doc formatting and git diff --check passed. This is not final acceptance; Graphify, remaining regression/typecheck/lint/build/coverage and real Gemini/device listening acceptance remain incomplete.

## Authorized continuation — two test blockers, 28 October 2026 07:33 WIB

Fajar explicitly instructed `lanjut bereskan` after the blocked-gate explanation. Reopen only jitter-stimulus validity and provider-input timing diagnosis, then required regression/quality closure. The rejected prior gates below remain historical evidence, not erased or relabeled PASS. Same run family, five prior workers retained in count; implementation is worker6/8. Contract: `~/.hermes/cache/scratch/telefun-playback-blocker-contract.md`, SHA-256 `e9768783a79990f7d062f9940f7d0dcbab6b275e16e92bc96e6a93e9aec0c728`, 7328 bytes.

- Assert actual browser jitter delivery so collapsed bursts cannot count as the intended paced stimulus; maintain all waveform thresholds and no-lead RED proof.
- Trace source audio clock, browser send and Node receipt before changing the duration oracle. Keep 0.4 s bound and strict audio/frame integrity; do not call unknown failure flaky or silently remove wall-clock evidence.
- Worker owns only the existing spec/fixture; permanent runtime changes require parent evidence review. No paid/provider/device/remote scope reopened. One heavy job at a time; resource intake free60%,swap148.75MB, no3005/3006 listener.
- Current continuation is in progress; jitter stimulus now asserted (four24kHz/80ms chunks, spacings>75ms/<140ms,total>270ms,speaker connections), no-lead mutation RED and byte-restored source GREEN. Audio thresholds unchanged; an initially too-narrow125ms stimulus upper bound failed and is retained as failed evidence, final140ms tolerance explicit. Provider-input blocker remains open: worker7 now implements synchronized Worklet/source-clock, browser-send and Node-receipt diagnostics before oracle edits. Parent owns broader regression, web/E2E typecheck, lint/format/build, Graphify and final independent closure audit.

## Approved single-owner repair — 28 October 2026, 09:21 WIB

Fajar approved the revised strategy with `oke`: Moy implements directly, one fresh independent review only after source and verification are frozen. This supersedes the earlier STOP only for this bounded repair, not for paid/provider/device/remote work. Historical eight-worker family and rejected audits remain recorded; there is no new implementation fan-out.

Acceptance frozen before edits:

**Final audit09:36: REJECTED.** Frozen hashes matched. Missing controlled-fault realization assertions: the scheduled pre-callback stall must be proven≥600ms and between evaluated source deliveries; receipt-lag must also be proven realized. Existing raw counterexample data is not a substitute for fail-closed assertions in every run. No repair/review chain reopened; no source edits or heavy gates after this verdict. Normal gap0.4121s and invalid jitter0.149333s remain acceptance blockers; full ladder unrun.

- Input: retain exact Worklet frame/payload/order checks and0.4s bounds; also bound every adjacent actual browser send gap and every local phase error relative to the independent Worklet clock. Prove old gate accepts a600ms pre-callback stall with catch-up, then repaired gate rejects it while normal/receiver-observer-lag control passes. No claim about initial absolute capture latency or cause of historical0.474s failure.
- Jitter: simplify only test observation by batching audio-thread samples while preserving every128-frame quantum index and all waveform samples. Remove failed browser socket-pacing experiment and use existing hermetic100ms sender fixture. Frozen stimulus75–140ms adjacent actual spacing, total>270ms, four80ms24k chunks. No tolerance retuning: if invalid stimulus persists, report environment/test-target blocker and stop.
- Keep waveform silence<6ms, scheduling gaps<1ms, utterance completeness±4ms, peak bounds and missing-signal-block guard unchanged; runtime byte-identical.
- Max one controlled diagnostic per root-cause hypothesis, then focused final verification. Run broad audio26, web/E2E typecheck, scoped lint/format/build and Graphify only if focused gates valid. Freeze hashes before independent review; no edits while reviewer runs.
- Exact permanent code ownership: existing fidelity spec and existing fixture if needed; no runtime/API/DB/model/voice/prompt/bitrate changes. Preserve all old dirty work and raw evidence. One heavy workload at a time, safe runner loopback3006/dead providers, retries0.

## Approved Opus-informed test repair — 28 October 2026, 09:59 WIB

Lane C continuation, scope: existing `apps/web/e2e/telefun-audio-fidelity.spec.ts`, this plan and owning status docs. Before source spec hash e060b7672df9383dcaa53c93b4e1d7cf2a8612932a11a8a9b32c5313142d1e45. Existing current-source normal-gap/jitter failures are retained RED evidence of the harness contract problem. No implementation fan-out; no new paid consultation or reviewer automatically authorized.

Design frozen before edits:

- Input source/payload/receiver byte and contiguous frame checks retained as explicit violations, never disabled in fault modes. Timing acceptance is anchor-independent offset spread max(sendTime−sourceEndTime)−min(offset)<0.4s; adjacent gaps/endpoint spans/callback delay remain diagnostics, not conflicting contracts.
- Controlled stalls900ms (400ms tolerance+256ms block+200ms margin rounded up to100ms). Verify actual duration, ordinal, placement before enough remaining evaluated sends and predicted ≥400ms delay. Receipt observer logs arrival before delay and proves each intended600ms delay. Invalid controls fail red with INVALID-CONTROL. Negative modes pass only for their exact expected violation set; unrelated failures cannot count as successful controls.
- Jitter keeps original4×80ms24kHz fixture/100ms sender and all waveform/speaker/count/rate/quantum guards. Add browser WebSocket ingress timestamps before the product handler and compare to scheduling-side observations. Derive valid cumulative lateness from240ms lead minus one render quantum; require predicted zero-lead hole>6ms as well as nonzero cumulative lateness so bursts/non-discriminating stimuli fail INVALID-STIMULUS. Over-budget arrivals fail OUT-OF-CONTRACT, not pass.
- Verify initial lead using the observed ingress→source.start clock interval, not an unjustified ±one-quantum equality across different observation points; subsequent schedule adjacency still<1ms. Waveform silence<6ms, full320ms±4ms, peak0.2..0.3, zero missing signal quanta unchanged.
- Add playbackDrain start/end/iteration durations as diagnostics only; no worker/DFT architecture changes or extra product timing thresholds.
- Freeze code hash before attempt1. Five fidelity modes (none,receipt-lag,drop-send,stall-send,stall-before-callback), jitter3repeats, consecutive-turn once. One headed worker/retries0, immutable artifact labels. Attempt2 only for one evidence-explained harness defect; no retuning or unrelated product repair. Valid product failure stops; repeated invalid controls/stimuli/no-fault spread stop with evidence. After focused acceptance: all26 audio regressions, web+E2E typecheck, lint/format/build, self-review and one Graphify update. No unit/paid Gemini/device/remote work.

Tasklist:

- [x] Repair existing spec, self-review and freeze hashes.
- [x] Execute focused acceptance with self-validating controls: final-source10/10, no retries.
- [x] Execute applicable broad regression and quality gates: audio26/26; root typecheck/lint/build, scoped format, Graphify and diff-check exit0. Lint has0errors,74warnings outside changed code paths.
- [x] Update status/handover with exact results and unresolved scope. Device/paid Gemini/release remain outside this local closure; independent review EXCLUDED under latest no-delegation instruction.

## Direct-owner continuation evidence and review

- Opus attempt1 remains FAILED (no-fault spread0.7367s, timeout). One instrumented browser run passed spread0.1878s; CPU profile shows React dev JSX overhead and drain analysis work, but does not establish the historical failure cause.
- Attempt2 input controls5/5 passed unchanged bounds and exact expected violations. Parent tool interrupted jitter after420s; preserve partial results without counting acceptance. A hash-pinned continuation reran only interrupted jitter and remaining turns: jitter3/3 and turns1/1 passed (9 focused checks total, no retries).
- Self-review found a further distinct harness defect: adjacent ingress spacing is not a simulation of a zero-lead playback queue. Three front-loaded chunks can queue enough audio that a later adjacent gap>6ms produces no playback hole. Add one actual-browser front-loaded negative stimulus in the existing test/fixture, prove intended RED, then simulate the zero-lead queue before classifying stimulus; keep all amplitude/completeness/silence/adjacency/input bounds unchanged. This changes the spec/fixture hash, so prior focused results are historical, not final-source certification.
- Front-loaded counterexample produced intended browser RED: cumulative lateness0 but old classifier VALID. The fixed classifier simulates queued zero-lead audio. Node-timer and cross-CDP timing attempts after the fix produced INVALID-CONTROL and remain failed evidence; negative receiver delivery is now held locally160ms in the browser, preserving PCM/completion order. It is explicitly distinct from normal read-only network ingress. Final frozen control passed; all waveform guards remain unchanged.
- Final manifests: `~/.hermes/cache/scratch/telefun-playback-gates/owner-final-acceptance-manifest.json` BROWSER-PASS (focused10,broad26,overlap reported separately) and `owner-final-quality-manifest.json` QUALITY-PASS. Spec SHA256 `31eb4640943a8935f0580cdc8ee574136b68c6fad1b5ea32427e7da8f685ee30`; fixture `00cb2f64b7282aa0b7dc6247c736371821681757bdbf7358b796fc789808511b`; runtime unchanged `04920cf8c8e2a9a42c9fa09dc5f044e4e0c7c9ab395bad681d78504c9875de7f`.
- No delegation, units, paid providers, runtime edits beyond the preserved initial fix, remote mutation, commit/push or deployment. Final source verified11:26WIB; no task runner or3006 listener remains. Graphify refreshed once without LLM; large-graph HTML viz excluded by its limit,graph.json/report updated. Review is Moy's self-review, not a new independent audit. Physical-device/listening and rollout remain unverified.

## Resource safety

Mac8GB; initial pressure free60%, swap1143.25MB, second CPU sample45%idle. Recheck before every heavy job. No simultaneous tests/build/typecheck. Do not stop existing server/DB/editor or change global settings. CDP attach is unavailable (configured HTTP endpoint not usable; HTTP version probe failed), so no live-provider reproduction is implied. Local hermetic reproduction uses no external API.

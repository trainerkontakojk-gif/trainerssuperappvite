# Telefun — angry-consumer voice-expression prompt

> SCOPE CORRECTION: This is a separate two-patch prompt mini-plan recovered from
> the October 23 Claude context. It is NOT the six-phase voice-expression Plan v2
> dated October 25 supplied by Fajar. Opus agreement below covers only this
> mini-plan. The Plan v2 audio-fidelity phase and remaining phases were not
> reviewed/agreed/executed in that discussion. Local passing checks do not close
> Fajar's original full-plan request.

## Requirement

Fajar requested that Moy ask Claude Code for the Gemini 3.8 Live voice-expression
plan, audit it, discuss it with Opus 5.5 at high effort until agreement, and only
then execute work that can safely proceed locally while Fajar is unavailable.

Baseline: `main`, `5d5c98e4b292956be0dc8a4b7ce2974d31cc4340`, clean working tree.
Lane C: bounded consumer-prompt behavior change; no external API/config changes.

The existing implementation already contains angry pacing, gradual de-escalation,
venting, refusing the first solution, and role preservation after insults. Two
remaining prompt issues are in scope: passive waiting after short agent replies
and the lack of a compact angry-tone reminder at the end of the prompt.

### Evidence and agreement

- Original Claude context: session `5eb4afef-ef62-4d3c-bfa6-205082ce2cb4`.
- Read-only drift audit: Opus `claude-opus-5-5`, invoked with `--effort high`,
  forked session `b713438c-9caa-4126-a7fd-1120403eb816`.
- Moy independently read the current prompt, existing E2E, session/voice wiring,
  and hermetic harness. Model/voice/prompt causality is not established.
- Moy challenged the unsupported ranking of model causality, narrowed the change
  to two prompt edits, and required control precedence and unchanged non-angry
  behavior. Opus accepted with minor wording corrections in session
  `39af86de-d1c2-48ef-9202-9276e36f3fa2` (`AGREED`). Execution starts only after
  that agreement. This second discussion used no tools or subagents; the first
  audit used read-only file tools. CLI model metadata confirms Opus 5.5.
- Raw discussion outputs and execution logs are local scratch evidence under
  `~/.hermes/cache/scratch/telefun-expression-*`; they are not repository inputs.

## Design

### A. Angry continuation

Use the existing `isAngry` boolean to replace only the continuation suffix for
`marah`: ask the agent with an annoyed tone rather than offering passive waiting.
Keep the common prohibition on inventing information, and existing bounded
venting and procedural rules. Preserve the old suffix byte-for-byte for all
other consumer types. This changes instructions, not speech triggers or timing.

### B. Final angry-tone reminder

Append one short paragraph only for `marah`, after the technical-voice sentence:

> PENGINGAT NADA (MARAH): Tetap sebagai konsumen yang kesal: nada tegas, tidak
> sabar, dan tekanan pada inti keluhan. Emosi turun bertahap sesuai tangga
> kesabaran, bukan langsung ramah setelah solusi pertama. Jangan mengarang fakta,
> memaki, memakai SARA, atau mengancam fisik. Selama hold tetap diam; aturan hold,
> isyarat waktu, dan penutupan dari aplikasi tetap diutamakan di atas pengingat ini.

The existing prompt already references its patience ladder. The reminder does not
force permanent high volume, duplicate the full profile, or grant new behavior.
Hold and application time/closure controls take precedence over the reminder.
The role contract and primary emotion instructions remain at the start.

### Owned files

- `apps/web/src/routes/telefun/services/promptBuilder.ts`
- `apps/web/e2e/telefun-consumer-prompt.spec.ts` (extend existing cases)
- `CHANGELOG.md`
- This plan, updated in place with execution evidence.
- Optional local canonical `docs/telefun.md`: brief contract/verification note,
  not staged or committed.

### Explicit exclusions

No voice-pool restriction, default-model change, new Gemini setup parameters,
provider/transport change, UI/indicator, schema/migration, API/billing change,
recording change, timer/auto-speech change, KETIK edit, or broad prompt rewrite.
No unit/legacy suite runs. No commit, push, deploy, remote database mutation, or
paid model/audio calls. Production remains untouched.

### Acceptance

1. Through the existing browser start-call flow, the configured angry prompt
   contains `tagih agen dengan nada kesal` and not `atau tunggu agen bicara`.
2. Angry reminder appears exactly once, after technical-voice guidance, at the
   end, within its last 600 characters. It preserves role, no invented facts,
   gradual de-escalation, and explicit hold/time/closure precedence.
3. Friendly prompt retains the original continuation, has no angry reminder,
   and still ends with the original technical-voice sentence.
4. Existing role/identity/salutation, hold, timing, call, and recording E2E stay
   green. Tests inspect configuration and mocked lifecycle, not real vocal tone.
5. All browser service targets are loopback/test-only: standard Playwright starts
   only Vite; `E2E_WEB_SERVER_ENV` pins Supabase/API/Telefun to `127.0.0.1:9`;
   HTTP is fail-closed and the voice socket is intercepted locally. No real DB
   or Gemini call is needed.

## Tasklist

- [x] Retrieve original context and audit live drift with Opus 5.5 high.
- [x] Challenge assumptions and reach explicit agreement before execution.
- [x] Capture baseline and confirm safe hermetic E2E configuration.
- [x] Extend existing E2E assertions and record intended RED.
- [x] Implement A+B minimally and record GREEN for prompt + call specs, serial.
- [x] Read-only thermo-nuclear review; address in-scope findings.
- [x] Web/E2E typecheck, scoped lint/format, web build, diff check.
- [x] Refresh Graphify once after final integrated code changes.
- [x] Record exact results and morning decisions in this file.

## Verification evidence

The deliverable is a verified local candidate, not a release. All local gates,
including the single Graphify refresh, have passed. No commit/push/deploy occurred.

### Completed local gates

- Full integration: `pnpm exec playwright test
e2e/telefun-consumer-prompt.spec.ts e2e/telefun-call.spec.ts --workers=1
--headed --reporter=line`, from `apps/web`: **20 passed (5.0m)**, exit 0.
- After review, strengthened the technical-voice anchor existence assertion so
  `indexOf === -1` cannot pass ordering vacuously, and formatted the spec.
- Fresh final prompt E2E: `pnpm exec playwright test
e2e/telefun-consumer-prompt.spec.ts --workers=1 --headed --reporter=line`,
  from `apps/web`: **8 passed (1.6m)**, exit 0. The source did not change after
  the 20-test integration run.
- `pnpm --filter @trainers/web typecheck`: exit 0, covering
  `tsc --noEmit && tsc -p tsconfig.e2e.json`.
- From `apps/web`, `pnpm exec eslint
src/routes/telefun/services/promptBuilder.ts
e2e/telefun-consumer-prompt.spec.ts`: exit 0.
- `pnpm exec prettier --check` on the two TS files, `CHANGELOG.md`,
  `docs/telefun.md`, and this plan: exit 0 before final evidence edits; rerun
  scoped formatting after those edits.
- `pnpm --filter @trainers/web build`: exit 0. Build env explicitly pins
  service URLs to loopback; this is a test-target build, not a rollout artifact.
- `git diff --check`: exit 0; index remains empty and baseline HEAD unchanged.
- No new case supersedes a distinct existing unit contract; unrelated legacy
  tests remain untouched and no unit/legacy suites were executed.
- `GRAPHIFY_MAX_WORKERS=1 graphify update .`: exit 0, one refresh; code graph
  rebuilt with 17,861 nodes and 34,283 edges. HTML visualization skipped by the
  tool because the graph exceeds its 5,000-node limit; code-graph refresh passed.
- Exact serial commands, exits, timing and log paths are captured in local
  scratch `telefun-expression-gates.json`. Final scoped formatting/diff checks
  were rerun after updating this evidence.

### RED and review history

- Initial headless E2E: exit 1 before configuration, at the disabled start button
  while MicCheck was still requesting access. This is NOT the intended RED.
- Headed E2E, unchanged fake-media flags: `pnpm exec playwright test
e2e/telefun-consumer-prompt.spec.ts -g 'konsumen marah ngotot' --workers=1
--headed --trace on --reporter=line`, from `apps/web`, exit 1 on the missing
  `tagih agen dengan nada kesal` string. Log: `telefun-expression-red-headed.log`.
- After implementing A only, the same focused command without `--trace on`
  exited 1 on the missing reminder. Log: `telefun-expression-red-reminder.log`.
  Thus A and B each have an intended-content RED, not a selector/compiler failure.
- Opus read-only thermo-nuclear review: source/test PASS, no P0/P1/P2 findings;
  overall verification closure still conditional on GREEN and remaining gates.
  P3 follow-ups: scoped formatting, assert technical-voice anchor exists before
  comparing positions, and avoid behavior overclaim in docs. Documentation wording
  has been clarified. Reviewer limitations: no `git diff` execution and only the
  first 305 lines of the E2E spec read; Moy independently inspected the full diff.

## Morning decisions

- Authorize and perform a controlled paid voice evaluation with matching voice,
  scenario, and interaction; local prompt assertions cannot establish audibility,
  anger intensity, role adherence, or relative Gemini model performance.
- Decide whether to change random voice selection, after checking documented
  voice characteristics; preserve trainer-pinned voices.
- Decide whether a larger prompt rewrite or a model change is warranted only
  after controlled evidence.
- Review the local diff and approve rollout separately. No automatic push or
  deployment is part of this overnight task.

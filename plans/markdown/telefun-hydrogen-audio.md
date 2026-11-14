# Verify Hydrogen for Telefun assessment and annotations

Lane D: AI provider/usage and eligibility. User explicitly requested audio testing after asking why Hydrogen is unavailable for assessment.

## Requirement

- Verify real WebM/Opus Indonesian synthetic speech through transcription, voice assessment, coaching, and replay annotation routes.
- Real Hono/JWT/local Supabase storage/logging; no production database or real user recording.
- Bounded live Gemini smoke: maximum four calls to Hydrogen only. Cap output at 8192 tokens and use LOW thinking for the smoke to bound spend; record these test-only differences from default assessment thinking.
- Verify actual model ID and token/cost records. Preserve Gemini 3.8 Flash, current task defaults, and Gemini Live consumer model.
- Enable registry audio capability only after successful live audio proof and local E2E; no new migration or production policy mutation.

## Design

- Keep existing Telefun scoring regression unchanged. A dedicated opt-in diagnostic project stays separate so paid provider transport cannot leak into ordinary fixtures; default run skips it without credentials/network. The original owning spec exceeded 1000 lines when extended, so the bounded smoke was extracted.
- In live mode, candidate audio eligibility is enabled only within the test process until the real provider smoke succeeds; default E2E tests still verify production registry eligibility normally.
- Keep credentials in memory, loaded from existing local env files only in live mode; never print keys/proxy credentials or send local JWTs to Google.
- Observe real provider status/modelVersion/usage and verify local persisted assessments, annotations and usage rows. Synthetic storage bytes replace the existing fake audio fixture; provider is real only for the bounded opt-in run.
- Graphify exact transcribeTelefunAgentAudio query confirmed assessment/transcription/annotation callers. Existing code/SDK contracts inspected; reuse GenerateContent audio/webm + JSON schemas.

## Tasklist

- [x] Add focused RED E2E for Hydrogen scoring/coaching/annotations (400 MODEL_NOT_ELIGIBLE before candidate test-only flag).
- [x] Generate valid local synthetic Indonesian WebM/Opus audio (22.015s, mono Opus 48 kHz).
- [x] Run four real provider requests: transcription, assessment, coaching returned 200; annotation returned 400 INVALID_ARGUMENT and product route returned 500 NO_ANNOTATIONS. Audio keyword assertion was not reached in this first run.
- [ ] BLOCKED by failed annotation request: supportsAudioInput stays unchanged; no production option is enabled. Do not mark all flows verified.
- [x] Review and verify the diagnostic harness; document evidence and integrate on main. No product/runtime code or migration changes.

Proof boundaries: local provider fixtures prove routing/state/persistence, not audio comprehension; live smoke proves acceptance and basic content/JSON compatibility for the supplied synthetic clip under LOW thinking, not broad human scoring accuracy or production latency.


## Actual live result — 2026-11-14

Command (exit 1):

```sh
E2E_HYDROGEN_LIVE_SMOKE=1 E2E_HYDROGEN_AUDIO_FILE=/tmp/telefun-hydrogen-audio/agent.webm pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --project telefun-hydrogen-audio-real-backend --reporter=json --workers=1
```

Exactly four HTTP calls were made; no retry or extra paid diagnostic calls followed:

- Transcription: HTTP 200, modelVersion gemini-4-hydrogen, 1272 input / 220 visible output + 553 thinking tokens.
- Assessment: HTTP 200, same model, 3426 input / 884 output. Local score endpoint returned 200 with valid assessment parsing/persistence.
- Coaching: HTTP 200, same model, 3360 input / 236 output. Nonempty coaching recommendations were verified in local Postgres before annotation began.
- Annotation: upstream HTTP 400 INVALID_ARGUMENT (Request contains an invalid argument). App converted this to HTTP 500 NO_ANNOTATIONS because the route continues parsing result.text without first checking result.success.

[Actual provider evidence](../evidence/telefun-hydrogen-audio-2026-11-14.json) records model versions, tokens, timings, synthetic audio SHA-256 and evidence limits. Standard-price estimate from reported successful token counts is USD 0.0262845; this is not an invoice or confirmed provider charge. The failed annotation reported no usage.

This proves Hydrogen accepts this audio/structured transcription and scoring requests. It does not prove full annotation compatibility, transcript keyword accuracy (assertion not reached), broad grading quality, default HIGH-thinking behavior, production latency or production UI. Audio eligibility therefore remains disabled per D6. No production database write, policy/default switch, registry capability edit, or manual app deploy occurred.

## Offline findings and next validation

Annotation uniquely supplies maxLength=500, maxItems=30/5 and numeric priority bounds in responseSchema. Other three successful requests do not use those annotation constraints. Schema incompatibility is a candidate explanation; the generic provider error does not identify which argument caused it, so causality is not confirmed.
Context7 confirms responseSchema uses the Gemini OpenAPI subset while responseJsonSchema has a different supported-keyword set; schema simplification or correct-format conversion should be verified before enabling the capability. Existing backend slicing already caps annotation/recommendation counts and text lengths. Do not silently remove validation or convert provider failure into empty successful annotations.

A follow-up should first reproduce/review the exact annotation schema, preserve server limits, expose an honest provider failure, then authorize a new narrowly bounded live recheck. All four initially announced provider calls have been used.

## Repeatable synthetic audio

```sh
say -v Damayanti -r 175 -o /tmp/agent.aiff 'Selamat pagi. Saya Rina dari layanan konsumen Otoritas Jasa Keuangan. Saya memahami keluhan Bapak mengenai tagihan yang tidak sesuai. Mohon jelaskan tanggal transaksi dan jumlah tagihannya. Kode latihan hari ini adalah Melati Tujuh. Saya akan membantu menjelaskan langkah pengaduan. Terima kasih.'
ffmpeg -i /tmp/agent.aiff -c:a libopus -ar 48000 -ac 1 -b:a 24k /tmp/agent.webm
```

The committed diagnostic is opt-in only and intentionally remains a readiness gate that can fail; its default skip is not GREEN proof of live compatibility. Candidate capability changes are confined to the Playwright worker and restored on cleanup. Full provider-key material is never printed; only existing configured credentials are read in explicit live mode. Storage fixture is synthetic bytes, while provider requests and local Hono/JWT/database are real.


## Harness verification

- After isolating the live-only diagnostic, `pnpm typecheck`, `pnpm lint`, `pnpm build` all exited 0. An initial Buffer/BodyInit typing mismatch in the diagnostic was corrected by copying synthetic bytes into Uint8Array; no runtime product code changed.
- `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --project telefun-hydrogen-audio-real-backend --project telefun-scoring-real-backend --reporter=line --workers=1` — exit 0, 15 existing local scoring regressions passed and the live-only diagnostic skipped because opt-in was absent. This is not a second live result or evidence that annotation readiness passed.
- Final source audit: only explicit live mode loads real credentials; destination is pinned to Hydrogen GenerateContent; calls are capped at four; output is capped at 8192/LOW for this diagnostic; local policy/rows are owned by the disposable user and cleaned up; failed attempts remain attached. Existing scoring regression file is unchanged.
- Diagnostic was extracted from the original large spec to avoid growing it beyond 1000 lines. The standalone file is under 400 lines and introduces no production state machine, fallback or provider behavior.

- `graphify update .`: exit 0; 19879 nodes, 37956 edges, 1265 communities; local graph updated and oversized HTML view skipped automatically.
- Final `git diff --check`: exit 0. Only the opt-in diagnostic/configuration, evidence and documentation are integrated. Existing 15 scoring regressions are unchanged; three pre-existing untracked plans remain untouched.
- Testing request is complete with a partial-failure result. The conditional capability-enable step is intentionally incomplete because live annotations failed; it requires a separate corrective change and bounded live confirmation, not a claim of readiness.

# Phase: Telefun Persona Prompt Improvements

## Scope

Implemented the approved prompt-only P0/P1 improvements plus lightweight P2 anti-break-character guidance and a stable short persona consistency seed. No `liveSession`, provider, schema, UI, demographic field, or dynamic branching changes were made.

## Changes

- Added patience/objection ladders, tiered motivation guidance, and explicit no-scoring-gate/no-invented-facts constraints.
- Added realistic voice guidance for short utterances, occasional disfluency/false starts, contextual light code-switching, backchannels, and non-monologue turn-taking.
- Added per-consumer reaction guidance and knowledge boundaries with unknown-ID fallbacks.
- Added Indonesian phone etiquette, conditional small talk, clarification, and external-interruption turn-taking guidance.
- Strengthened roleplay anti-break-character instructions while retaining runtime time-cue, hold, script, gender, and technical voice boundaries.
- Added an eight-character stable consistency anchor derived from existing session/persona inputs; it is prompt context only, not provider determinism.
- Added a scenario-data boundary and sanitization for runtime markers and prompt-like control labels in title, instruction, and script fields.
- Expanded prompt-builder coverage for seed stability/differentiation without PII in the seed line, unknown consumer fallbacks, pacing verbosity, and scenario marker neutralization.

## Verification

- `pnpm --filter @trainers/web test -- telefun-prompt-builder.test.ts` — unsupported in this workspace invocation; command timed out while running unrelated tests (nonzero).
- The requested pre-implementation invocation was nonzero because its `--` argument caused the workspace script to run unrelated tests until timeout. The supported focused command then completed green after implementation: 25 tests passed.
- `pnpm --filter @trainers/web exec tsc --noEmit` — passed (exit 0).
- `pnpm --filter @trainers/web exec vitest run src/__tests__/telefun-prompt-builder.test.ts` — passed: 29 tests (exit 0).
- `pnpm --filter @trainers/web exec tsc --noEmit` — passed (exit 0).
- `pnpm --filter @trainers/web lint` — passed (exit 0) with existing warnings.
- `pnpm --filter @trainers/web build` — passed (exit 0).
- `git diff --check` — passed (exit 0).
- `graphify update .` — completed successfully after repair.

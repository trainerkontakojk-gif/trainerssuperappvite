# Telefun recordings route — move scoring out

- **Status:** Implemented on `claude/project-thread-8hrwo8`.
- **Risk lane:** Lane C (multi-file refactor, no intended behavior change).
- **Requested by:** Fajar, 2026-10-17 (project thread "Pelajari isi aplikasi Trainers SuperApp", item "file terlalu besar").

## Requirement

`apps/api/src/routes/telefun/recordings.ts` was 1,054 lines; the `POST /score/:id` handler alone was ~500. Move scoring into its own file with the same route, status codes and bodies.

## Design

- `recording-scoring.ts`: the scoring helpers (`SCORING_STATE_SELECT`, cached-response builders, historical OpenAI checks) and `scoreRecording(c)`, the former inline handler body.
- `recordings.ts` (459 lines): finalize, recording URL and coaching-summary routes, plus `telefunRecordings.post("/score/:id", scoreRecording)`. It exports `TelefunRecordingVariables` for the handler's context type.
- These routes are registered as statements, not a chain, so the Hono RPC types are unaffected.
- A whitespace-insensitive comparison matched the moved helpers, the handler body, and the remaining file against the original.

## Tasklist

- [x] Split; API `tsc --noEmit`, ESLint (no warnings on either file), API build.
- [x] `access-matrix-api.spec.ts` (`gate-stub`): 24 passed.
- [x] In-process before/after request to `/score/:id`, `/recording/:id`, `/coaching-summary/:id` with an unreachable database: identical status and body.

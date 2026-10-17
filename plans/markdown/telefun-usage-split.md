# Telefun usage — split the usage logger file

- **Status:** Implemented on `claude/project-thread-8hrwo8`.
- **Risk lane:** Lane C (multi-file refactor, no intended behavior change).
- **Requested by:** Fajar, 2026-10-17 (project thread "Pelajari isi aplikasi Trainers SuperApp", item "file terlalu besar").

## Requirement

`apps/telefun/src/usage.ts` was 1,291 lines mixing the live Gemini usage path (used by `server.ts` on every call) with the retired OpenAI Realtime usage code (reachable only from legacy WebRTC finalization and tests). Separate them so the live path reads on its own. Importers keep importing `./usage.js` unchanged.

## Design

- `usage-store.ts`: server-only Supabase admin client, `roundUsd`, billing-rate lookup, pricing-rate parsing, schema-drift checks.
- `usage-live.ts`: Gemini Live snapshot/turn types, accumulator, and cost functions.
- `usage-openai.ts`: retired OpenAI Realtime parsing, accumulator, cost, and its two persistence functions.
- `usage.ts` (167 lines): `flushLiveUsage` plus `export *` of the live and OpenAI modules, so every existing import keeps working.
- Code moved verbatim with `export` added; a whitespace-insensitive comparison against the original matched for every module, apart from Prettier's leading union `|` and one trailing comma. `flushLiveUsage` was not reformatted.

## Tasklist

- [x] Split and wire imports.
- [x] Telefun `tsc --noEmit`, ESLint, `pnpm --dir apps/telefun build`.
- [x] Server boot with loopback-only dummy env: `/health` returned 200.

# Telefun Gemini Live Voice Catalog Expansion

## Requirement

Add the official Gemini Live/TTS voice catalog to Telefun using the user-approved community gender mapping. Preserve all existing voices and gender-filter behavior, keep `gemini-3.8-live` as the active model default, and ensure invalid/legacy voice values still normalize safely.

Approved mapping:

- Female: `Zephyr`, `Kore`, `Leda`, `Aoede`, `Callirrhoe`, `Autonoe`, `Despina`, `Erinome`, `Laomedeia`, `Achernar`, `Gacrux`, `Pulcherrima`, `Vindemiatrix`, `Sulafat`
- Male: `Puck`, `Charon`, `Fenrir`, `Orus`, `Enceladus`, `Iapetus`, `Umbriel`, `Algieba`, `Algenib`, `Rasalgethi`, `Schedar`, `Alnilam`, `Achird`, `Zubenelgenubi`, `Sadachbia`, `Sadaltager`

## Design

- Keep `GEMINI_LIVE_VOICES_BY_GENDER` as the single source of truth.
- Derive the flat Gemini voice list and type from the two gender arrays, preserving the existing male-first/female-second ordering unless tests require a deliberate catalog order.
- Keep `DEFAULT_GEMINI_LIVE_VOICE = "Kore"`.
- Do not change OpenAI historical voice metadata or Telefun model registry behavior.
- Existing persisted voices remain valid; invalid/retired voices continue to normalize through the existing resolver.
- UI automatically consumes the shared gender lists through `getVoicesForModel`; no new UI structure is needed.

## Tasklist

1. Add a failing shared voice-registry test covering all 30 approved voices and exact gender membership.
2. Run the focused voice-registry test and confirm the expected RED failure.
3. Expand `packages/types/src/telefun-voices.ts` with the approved female/male voice arrays.
4. Run the shared/web voice tests and confirm GREEN.
5. Update any stale voice-count/voice-option assertions and add a regression check that invalid voices still normalize safely.
6. Update canonical Telefun documentation and a rebuild log describing the approved gender mapping.
7. Run affected API/Web/Telefun tests, typechecks, lint, and production builds.
8. Review `git diff`, `git diff --check`, and preserve old voice/model behavior before reporting completion.

## Files

- Modify: `packages/types/src/telefun-voices.ts`
- Test: `apps/web/src/__tests__/telefun-voice-registry.test.ts`
- Test: any affected Telefun settings/identity tests discovered by focused failure
- Modify: `docs/telefun.md` and/or `docs/modules.md` if the voice catalog is documented there
- Create: `docs/rebuild-logs/phase-218-telefun-gemini-live-voice-catalog.md`

## Verification

```bash
pnpm --dir apps/web exec vitest run src/__tests__/telefun-voice-registry.test.ts
pnpm --dir apps/web exec vitest run src/__tests__/telefun-settings-model-default.test.ts src/__tests__/telefun-live-protocol.test.ts
pnpm --dir apps/api exec tsc --noEmit -p tsconfig.json
pnpm --dir apps/telefun exec tsc --noEmit -p tsconfig.json
pnpm --filter @trainers/web exec tsc --noEmit
pnpm --dir apps/api build
pnpm --dir apps/telefun build
pnpm --filter @trainers/web build
git diff --check
```

## Risk / Decision

Google documents the voice names and vocal characteristics but does not publish a first-party male/female field for the complete catalog. The gender mapping above is explicitly approved by Fajar and is based on the researched Gemini voice catalogs; it must not be silently changed during implementation.

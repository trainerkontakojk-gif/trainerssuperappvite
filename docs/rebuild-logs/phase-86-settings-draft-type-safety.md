# Phase 86 - Settings Draft Type Safety Hardening

## Summary

Phase 86 eliminates unsafe `as T` type assertions and `as any` casts from the settings draft system across all 3 modules (Telefun, KETIK, PDKT). Changes are behavior-preserving and improve compile-time safety.

## Changes

### Core Hooks

- **`useCrudForm`**: Added `createItem(id, draft)` factory function to replace inline `{ ...draft } as T` construction. Added optional `updateItem(item, draft)` for custom merge logic. Added optional `isEqual(left, right)` comparator (default: `shallowEqualDraft`) replacing `JSON.stringify` comparison for dirty detection.
- **`useCollectionDraft`**: Replaced `idPrefix` + `extraDefaults` pattern with `create(draft)` factory function. Removed `as T` type assertions. The caller now constructs the full object including id.

### Type Additions

- **`telefunSettings.ts`**: Added `TelefunTransport` type alias (`"gemini-live" | "openai-audio"`) and `TelefunVoiceModel` interface. Typed `VOICE_MODELS` as `TelefunVoiceModel[]`.

### Module Updates (Telefun, KETIK, PDKT)

- All 6 settings tab components (`*ConsumersTab`, `*ScenariosTab`) now use `create` factory in `applyCollectionDraft` calls instead of `idPrefix`/`extraDefaults`.
- All 3 `use*SettingsDraft` hooks pass `createItem` to `useCrudForm`.
- All `setLocalSettings` prop types changed from `React.Dispatch<React.SetStateAction<any>>` to typed `AppSettings`.
- All `(prev: any)` inline callbacks changed to `(prev)` with inferred types.
- All `(item: any)` / `(s: any)` filter/map callbacks changed to inferred types.
- `as any` casts on select `onChange` handlers replaced with `as Type["field"]` indexed access types.

### Tests

- `settings-draft-helpers.test.ts` updated to use `create` factory pattern.

## Files Modified

- `apps/web/src/hooks/useCrudForm.ts`
- `apps/web/src/hooks/useCollectionDraft.ts`
- `apps/web/src/routes/telefun/telefunSettings.ts`
- `apps/web/src/routes/telefun/components/settings/useTelefunSettingsDraft.ts`
- `apps/web/src/routes/telefun/components/settings/TelefunConsumersTab.tsx`
- `apps/web/src/routes/telefun/components/settings/TelefunScenariosTab.tsx`
- `apps/web/src/routes/ketik/components/settings/useKetikSettingsDraft.ts`
- `apps/web/src/routes/ketik/components/settings/KetikConsumersTab.tsx`
- `apps/web/src/routes/ketik/components/settings/KetikScenariosTab.tsx`
- `apps/web/src/routes/pdkt/components/settings/usePdktSettingsDraft.ts`
- `apps/web/src/routes/pdkt/components/settings/PdktConsumersTab.tsx`
- `apps/web/src/routes/pdkt/components/settings/PdktScenariosTab.tsx`
- `apps/web/src/routes/pdkt/components/settings/PdktIdentityTab.tsx`
- `apps/web/src/__tests__/settings-draft-helpers.test.ts`

## Verification

```bash
pnpm --filter @trainers/web test -- src/__tests__/settings-draft-helpers.test.ts
pnpm --filter @trainers/web exec tsc --noEmit
pnpm lint
pnpm build
pnpm test
```

## Notes

This phase is behavior-preserving. It does not change Supabase schema, API contracts, scoring formulas, or visible UI. It eliminates 15+ `as any` / `as T` assertions from the settings draft system.

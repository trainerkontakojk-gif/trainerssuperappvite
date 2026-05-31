# Phase 85 - Thermo Quality Gate Hardening

## Summary

Phase 85 fixes the maintainability blockers found after the phase 78-84 decomposition branch:

- settings draft saves now build new immutable settings objects instead of mutating state snapshots;
- repeated settings tab save branches now use one typed collection-draft helper;
- SIDAK input rule indicator derivation now has one source of truth;
- whitespace and lint blockers from the decomposition branch were cleared;
- Graphify evidence was refreshed after the cleanup.

## Verification

Commands run:

```bash
git diff --check origin/main..HEAD
pnpm --filter @trainers/web test -- src/__tests__/settings-draft-helpers.test.ts src/__tests__/sidak-input-rule-model.test.ts src/__tests__/ketik-settings-modal.test.tsx src/__tests__/pdkt-settings-modal.test.tsx src/__tests__/telefun-settings-model-default.test.ts src/__tests__/sidak-input-legacy-refresh.test.tsx src/__tests__/sidak-input-parity.test.tsx src/__tests__/sidak-input-agents-shape.test.ts
pnpm --filter @trainers/web exec tsc --noEmit
pnpm lint
pnpm build
pnpm test
```

## Notes

This phase is behavior-preserving. It does not change Supabase schema, API contracts, scoring formulas, or visible UI.

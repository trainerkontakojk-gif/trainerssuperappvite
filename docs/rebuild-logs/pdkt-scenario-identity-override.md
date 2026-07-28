# PDKT Scenario Identity Override

## Summary

The PDKT settings boundary now preserves optional per-scenario `identity` data inside `pdkt.scenarios[]` while still stripping legacy `isLicensed`.
`readPdktSettings()` and `writePdktSettings()` keep unrelated scenario metadata intact.

## Behavior

- Scenario identity is optional and stored per scenario.
- Namespaced settings read/write preserve scenario `identity` objects as-is.
- Legacy `isLicensed` is removed on sanitize/read/write.
- Unrelated scenario metadata is preserved.

## Precedence

Runtime resolution is expected to follow:

1. scenario override
2. global `customIdentity`
3. generated fallback

The API layer does not resolve this precedence; it only preserves the JSON contract needed by the resolver.

## Backward compatibility

- Legacy scenarios without `identity` remain valid.
- Existing unknown scenario metadata stays untouched.
- No database migration is required because the settings payload is JSON.
- The outer namespaced `pdkt` envelope continues to round-trip through the API.

## Verification

Known verification from this task:

- `pnpm --filter @trainers/api exec vitest run src/__tests__/pdkt-settings.test.ts` — passed
- `git diff --check` — passed

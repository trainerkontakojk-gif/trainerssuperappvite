# Phase 14 — Testing (Vitest API Unit Tests + Frontend Component Tests)

## Infrastructure

### API Testing (`apps/api`)

- Installed `vitest` v4.1.6
- Created `vitest.config.ts` (node environment, globals)
- Added `"test": "vitest run"` script to `apps/api/package.json`

### Frontend Testing (`apps/web`)

- Installed `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`
- Created `vitest.config.ts` (jsdom environment, setup file, globals)
- Created `src/__tests__/setup.ts` (jest-dom matchers + localStorage polyfill)
- Added `"test": "vitest run"` script to `apps/web/package.json`

### Turbo/Root

- Added `test` task to `turbo.json`
- Added `"test": "turbo test"` script to root `package.json`

## Test Coverage

### 1. API Service Tests — `apps/api/src/__tests__/` (62 tests)

| File                       | Tests | Description                                                                                                                                                                                                                                 |
| -------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scoring.test.ts`          | 35    | Pure logic: `resolveServiceTypeFromTeam`, `computeEffectiveService`, `calculateSessionScoreFromTemuan`, `calculateQAScoreFromTemuan` (weighted/flat/no_category modes, MAX_SAMPLING=5), `isAgentExcluded`, `scoreColor/Bg/Label`            |
| `sidak-service.test.ts`    | 11    | Supabase-mocked CRUD: `getPeriods`, `createPeriod`, `getIndicators`, `createTemuanBatch` (FK error → user-friendly message), `getTemuan` (filters, pagination), `deleteTemuan`, `getAgents`                                                 |
| `profiler-service.test.ts` | 16    | Supabase-mocked: `getYears`, `createYear`, `getFolders`, `createFolder`, `getPeserta`, `getPesertaById` (not-found → throw), `getPesertaByBatch`, `createPeserta`, `updatePeserta`, `deletePeserta`, `getTeams`, `createTeam`, `deleteTeam` |

### 2. Frontend Tests — `apps/web/src/__tests__/` (18 tests)

| File                     | Tests | Description                                                                                                |
| ------------------------ | ----- | ---------------------------------------------------------------------------------------------------------- |
| `useQueryParams.test.ts` | 4     | URL parsing: empty, single param, multiple params, encoded values                                          |
| `useApi.test.ts`         | 6     | Hook behavior: fetch → data/loading/error, null path, API error, refetch, postApi (JSON body, error throw) |
| `app-config.test.ts`     | 5     | Module validation: count, required fields, href format, unique IDs, dashboard config                       |
| `excel-utils.test.ts`    | 3     | `validateImportRows`: valid passthrough, invalid separation, duplicate detection                           |

### Technical Details

**Supabase Mock (API tests):**

```ts
// Proxy-based thenable mock — all chain methods return same proxy,
// `await query` triggers `then` trap → resolves to per-test data
function buildQuery(onAwait) {
  const q = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") return (resolve) => resolve(onAwait());
        return () => q;
      },
    },
  );
  return q;
}
```

### Build: ✅ All 80 tests pass across both packages

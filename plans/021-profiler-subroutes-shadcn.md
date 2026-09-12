# Plan 021: Align Profiler Subroutes with shadcn/ui

## Requirement

Bring every Profiler subroute and its route-owned UI component into the same
shadcn/Base UI visual language already applied to `/profiler`, without changing
API contracts, route paths, export formats, participant data behavior, or role
permissions.

In scope:

- `/profiler/slides`
- `/profiler/table`
- `/profiler/analytics`
- `/profiler/export`
- `/profiler/add`
- `/profiler/import`
- `/profiler/teams`
- Their route-owned components under `components/slides`, `components/table`,
  and `components/export`.

`/profiler/download` remains the existing redirect to `/profiler/export`.

## Design

- Reuse the installed shadcn/Base UI primitives and semantic tokens: `Card`,
  `Button`, `Badge`, `Input`, `Label`, `Select`/`Combobox`, `Dialog`, `Alert`,
  `Empty`, `Skeleton`, `Progress`, `Separator`, `Table`, and `Tabs` where they
  fit the existing flow.
- Keep one consistent Profiler shell: `PageHeroHeader`/back navigation, compact
  max-width content containers, crisp borders, restrained surfaces, Outfit
  headings, Inter body text, Lucide icons, and 44px touch targets.
- Preserve every existing data fetch, mutation, query parameter, export helper,
  participant selection, chart, slide mode, pagination, and read-only rule.
- Replace bespoke overlays, gradients, oversized radii, raw form controls, and
  custom loading/empty/error markup only where the equivalent shadcn primitive
  exists. Keep specialized slide/canvas and chart rendering intact.
- Use responsive stacking for phone/tablet layouts, stable loading space, visible
  focus states, labeled inputs, keyboard-safe controls, and reduced-motion
  fallbacks for route-owned animations.

## Tasklist

- [x] Audit live subroute files, route-owned components, tests, and dirty paths.
- [x] Align shared route header/back-navigation patterns and route containers.
- [x] Refactor Add, Import, Teams, and Analytics surfaces to shadcn primitives
      while preserving their data flows and visualizations.
- [x] Refactor Table, Slides, and Export surfaces plus their route-owned
      controls/cards/modals to the same component vocabulary.
- [x] Add or preserve loading, empty, error, disabled, success, and read-only
      states without changing behavior.
- [x] Run focused Profiler tests, scoped lint, typecheck, Prettier, detector,
      production build, and `git diff --check`.
- [x] Update `plans/README.md` status after all gates pass.

## Verification

- `pnpm --filter @trainers/web exec vitest run --config vitest.config.ts --maxWorkers=1 --no-file-parallelism <focused Profiler tests>`
- `pnpm --filter @trainers/web typecheck`
- `pnpm --filter @trainers/web exec eslint <changed Profiler files>`
- `pnpm exec prettier --check <changed Profiler files>`
- `pnpm --filter @trainers/web build`
- `git diff --check`

## Scope guard

Do not change `apps/api`, migrations, `packages/types`, route permissions, or
the Profiler API service. Stop and report if a visual change requires changing
an external contract or if an existing test encodes behavior that the redesign
would remove.

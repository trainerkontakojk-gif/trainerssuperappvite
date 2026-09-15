# Plan 024: Align remaining product surfaces with Trainers shadcn/ui system

## Requirement

Apply the approved Trainers product direction to the remaining high-traffic
authenticated surfaces that still use bespoke controls, decorative glass
surfaces, or inconsistent status treatments. Use the existing shadcn/Base UI
primitives and semantic tokens as the default vocabulary. Preserve routes,
API calls, permissions, data transformations, export formats, simulation
behavior, and specialized chart/mailbox rendering.

In scope:

- shared product header/intro surfaces used by module pages;
- Dashboard overview and trend controls;
- PDKT landing/workspace shell and route-owned modal/action controls;
- SIDAK landing surface;
- Monitoring shell, filters, tables, states, and pricing controls;
- Account settings;
- Dashboard activity and user-management surfaces where the conversion is
  local and does not alter their existing mutation flow.

Out of scope:

- API, migrations, packages/types, permissions, or backend contracts;
- replacing specialized simulation/canvas/chart assets;
- changing scoring, polling, export, attribution, or confirmation behavior;
- introducing another component library or new dependencies.

## Design

- Use `Card`, `Button`, `Badge`, `Alert`, `Empty`, `Skeleton`, `Input`,
  `Label`, `Select`, `Tabs`, `Table`, `Dialog`, and `Separator` where they
  match the current interaction.
- Prefer `bg-background`, `bg-card`, `bg-muted`, `text-foreground`,
  `text-muted-foreground`, and module tokens over local hex/pastel classes.
- Keep the product calm and data-first: crisp borders, 8–12px control radii,
  restrained module accents, no decorative backdrop blur/gradient/glow, no
  oversized rounded cards, and no hover-only essential actions.
- Maintain 44px touch targets for primary controls, explicit labels, visible
  focus states, responsive stacking/overflow behavior, stable skeleton loading,
  useful empty/error states, and reduced-motion fallbacks.
- Leave dense mailbox, chart, and simulation internals intact when a wrapper
  conversion is sufficient; do not use a visual cleanup as a reason to change
  their data or event flow.

## Tasklist

- [x] Capture current Git state and focused baseline tests.
- [x] Align shared header/intro and global product surface tokens.
- [x] Convert Dashboard and SIDAK entry surfaces to shadcn primitives.
- [x] Convert PDKT entry/workspace shells and route-owned action/modal shells.
- [x] Convert Monitoring, Account, activity, and user-management controls and
      states while preserving existing handlers and test-facing copy.
- [x] Run changed-surface tests, lint, typecheck, build, anti-slop detector,
      and `git diff --check`.
- [x] Run the Impeccable audit/polish review and record remaining visual runtime
      limitations if browser verification is unavailable.

## Verification

```bash
pnpm --filter @trainers/web exec vitest run --config vitest.config.ts \
  --maxWorkers=1 --no-file-parallelism <focused changed UI tests>
pnpm --filter @trainers/web exec eslint <changed files>
pnpm --filter @trainers/web exec tsc --noEmit
pnpm typecheck
pnpm --filter @trainers/web exec vite build
node ~/.agents/skills/impeccable/scripts/detect.mjs --json <changed markup files>
git diff --check
```

## Completion evidence

- Full web suite: 172 files, 1,253 tests passed.
- Full monorepo suite: API 156 files / 1,501 passed and 1 skipped; Telefun 38
  files / 395 passed; Web 172 files / 1,253 passed.
- `pnpm typecheck`, web typecheck, web build, and `git diff --check` passed.
- `pnpm lint` passed with existing warnings only (no errors).
- The scoped Impeccable detector reports zero findings. A repository-wide scan
  still reports unrelated landing-font/animation findings and a test fixture
  image warning.
- Browser-based visual verification was unavailable in this harness; source
  review, responsive class review, and the detector were used for the final
  polish pass.

## Scope guard

Stop if a visual change requires modifying an API/schema/permission contract,
if an existing regression test encodes behavior that would be removed, or if a
specialized simulation/chart interaction cannot be retained behind the new
surface wrapper.

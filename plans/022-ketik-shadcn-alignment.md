# Plan 022: Align KETIK UI with shadcn/ui

## Requirement

Rapikan seluruh permukaan utama `/ketik` dan komponen route-owned yang terkait
agar mengikuti visual vocabulary shadcn/Base UI dan design system Trainers
SuperApp, tanpa mengubah route, kontrak API, timer, attribution peserta, CSV
export, atau alur review AI.

In scope:

- `/ketik` landing/actions
- KETIK chat session and review mode
- settings modal shell and tab navigation
- history modal/list and empty/error states
- session review modal and progress states
- KETIK message bubbles/lightbox where needed for consistency

Out of scope:

- `apps/api`, migrations, `packages/types`, API payloads, permissions, and
  scoring/review behavior
- replacing the existing scenario animation asset with a new illustration
- redesigning unrelated PDKT/Telefun surfaces

## Design

- Reuse installed shadcn/Base UI primitives: `Button`, `Card`, `Badge`,
  `Dialog`, `Tabs`, `Alert`, `Empty`, `Progress`, `Skeleton`, `Separator`,
  `Input`, `Textarea`, and `ScrollArea` where they match the current flow.
- Use semantic tokens and the existing `module-clean-app[data-module='ketik']`
  accent instead of screen-local raw status colors. Keep blue as the KETIK
  module identity and reserve destructive styling for destructive actions.
- Keep the information hierarchy task-first: start simulation is the primary
  action; settings/history/usage are secondary; review and export actions are
  explicit and keyboard reachable.
- Preserve readable dense layouts with 44px touch targets, visible focus,
  labeled form controls, responsive stacking at small widths, and reduced-motion
  fallbacks. Avoid nested cards, decorative gradients, hover-only actions, and
  custom overlay behavior when a shadcn primitive exists.

## Tasklist

- [x] Capture baseline dirty paths and current focused KETIK tests.
- [x] Refactor landing action panel to shadcn `Card`/`Button`/`Badge` and
      improve responsive hierarchy without changing handlers.
- [x] Refactor `ChatInterface` toolbar, status chips, composer, errors, and
      loading indicator to shadcn primitives while preserving timer/template/
      export behavior.
- [x] Refactor settings modal shell to `Dialog`/`Tabs`/`Button` and keep all
      tab-owned state and test-facing labels intact.
- [x] Refactor history and review modal shells, empty/status/progress states,
      and destructive action affordances to shadcn primitives.
- [x] Align the settings tab forms and CRUD affordances with shadcn controls;
      keep the specialized message bubble/lightbox controls unchanged because
      they already provide image-specific behavior and focus handling.
- [x] Exercise the existing focused regression assertions for the changed
      states with the default `.tsx` Vitest config.
- [x] Run proportional gates: changed-surface ESLint, Web and root typecheck,
      production build, Prettier, and `git diff --check`.
- [ ] Optional monorepo-wide `pnpm lint`, `pnpm test:core`, and live browser
      pass remain outside this focused UI change; no API/schema/runtime proof is
      implied by this plan.
- [x] Update this plan and `plans/README.md` after the applicable gates pass.

## Verification

```bash
pnpm --filter @trainers/web exec vitest run --config vitest.config.ts --maxWorkers=1 --no-file-parallelism \
  src/__tests__/ketik-landing.test.tsx \
  src/__tests__/ketik-chat-interface.test.tsx \
  src/__tests__/ketik-settings-modal.test.tsx \
  src/__tests__/ketik-review-progress.test.tsx \
  src/__tests__/ketik-history-subject.test.tsx
pnpm --filter @trainers/web typecheck
pnpm --filter @trainers/web exec eslint <changed KETIK files>
pnpm typecheck
pnpm --filter @trainers/web exec vite build
git diff --check
```

Evidence from this execution: focused KETIK tests passed 50/50 across five
files; changed-surface ESLint completed with zero errors and seven pre-existing
warnings; Web and root typecheck passed; production build passed; Prettier and
`git diff --check` passed.

## Scope guard

Do not change API routes, schemas, migrations, session/review contracts,
participant attribution, or unrelated modules. If a visual change requires a
behavioral contract change, stop and report it separately.

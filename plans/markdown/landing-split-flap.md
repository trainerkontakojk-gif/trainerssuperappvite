# Landing split-flap redesign

Lane C — public landing behavior/UI change across several web files. No API,
schema, auth/RLS, or access-control change. Approved visual source:
`mockups/landing-page/index.html` (local, untracked on `feat/tna-phase-2`).

## Requirement

- Hero contains only the wordmark "Trainers SuperApp", shown on a 2 × 8
  split-flap board. With motion allowed, the board flips through module names
  (KETIK/PDKT → TELEFUN/KTP → SIDAK/TNA, module colors), then lands on the
  wordmark in under ~5 s. Hover or tap reshuffles and lands again.
- `prefers-reduced-motion: reduce` shows every board's final text at once.
- After the hero: module departure board (code tiles land when visible, module
  name, function), sticky stage with six illustrative scenes driven by scroll,
  Latih → Evaluasi → Susun cycle with a scroll-filled line, final CTA, footer
  with a small wordmark board, module links that jump to their stage step,
  and platform actions.
- Auth behavior is unchanged: guests see `Masuk ke Platform` / `Ajukan Akses`
  (open the existing `AuthModal` in login/register mode); a session sees
  `Buka Dashboard` and no `Masuk ke Platform`. Nothing renders while auth is
  being checked.
- Display type stays within `docs/design.md` (≤ 6rem); module colors come from
  the existing `--module-*` tokens; no gradients, blobs, or shadows; no
  horizontal overflow at 320–1440 px; WCAG 2.1 AA automated checks pass.
- Non-goals: changing `AuthModal`, `LandingAuthClient`, routing, page title,
  or adding real data to the illustrative scenes.

## Design

- `apps/web/src/routes/index.tsx` composes the page and owns auth-dependent
  actions through `AuthContext`.
- `apps/web/src/components/landing/SplitFlapBoard.tsx`: board component plus
  imperative flip engine (Web Animations API, characters via `data-ch` +
  `::before`, `aria-hidden`; accessible text comes from `sr-only`). Triggers:
  `intro` frames on mount, land-on-view, hover/tap reshuffle; state exposed via
  `data-state` / `data-frame` for E2E.
- `apps/web/src/components/landing/ModuleStory.tsx`: departure board, story
  steps, sticky stage scenes, scroll activation (step centre vs. middle of the
  visible area beside/below the stage).
- `apps/web/src/components/landing/landingModules.ts`: module copy shared by
  departures, story, and footer links.
- `apps/web/src/routes/landing.css`: page-level landing styles (tokens, header,
  hero, sections, footer) plus the unchanged auth-modal section;
  `SplitFlapBoard.css` and `ModuleStory.css` sit next to their components so
  no stylesheet passes ~1,000 lines. `.landing-wrapper` uses `overflow-x: clip`
  so sticky positioning works.

## Tasklist

- [x] RED: `apps/web/e2e/landing-split-flap.spec.ts` (hermetic guest shell)
      fails against the current landing.
- [x] GREEN: implement components, route, and CSS.
- [x] Regression: `landing-auth`, `accessibility`, `typography-floor`,
      `design-token-contrast`, `e2e-target-isolation` specs still pass.
- [x] Web typecheck + lint on changed files.
- [x] `thermo-nuclear` review, `impeccable` audit, fixes.
- [x] Docs: landing note in `docs/design.md`.

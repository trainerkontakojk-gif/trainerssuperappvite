---
name: ui-ux-pro-max
description: Establish product UX constraints and acceptance criteria BEFORE building a new interface or significant UI redesign in Trainers SuperApp; hands off to the impeccable skill for the post-implementation audit/polish gate.
---

# UI/UX Pro Max (Claude Code adapter)

This project skill provides the UI/UX workflow; it does not pretend a separate UI/UX Pro Max plugin is installed. It owns the **pre-design product brief**. The `impeccable` skill is the post-implementation quality gate, not another design-direction pass.

## Before implementation

1. Read `AGENTS.md`, `docs/design.md` (canonical design system; root `DESIGN.md` is only a pointer), existing layout primitives, tokens, component patterns, and sibling screens.
2. If the user supplies a screenshot/reference, treat it as the visual source of truth for structure and hierarchy; adapt it to the product's tokens and real data.
3. Define a compact constraint record: target surface, information hierarchy, responsive behavior, required states, existing typography/color tokens to preserve, acceptance criteria, and explicit non-goals.
4. Reuse existing components (`apps/web` shadcn setup, see `apps/web/components.json`) and tokens before introducing new conventions. Do not add a new design indicator or structure without approval.

## Design requirements

- Mobile-first: define narrow-screen behavior before desktop polish.
- Every interactive state needs a visible affordance: default, hover, focus, active, disabled, loading, empty, error, and success where relevant.
- Keep primary actions obvious and touch targets usable (≥44px).
- Maintain readable contrast in light and dark modes.
- Use semantic HTML and keyboard-accessible controls.
- Prefer restrained, purposeful motion; respect reduced-motion preferences.
- Use real product copy and data. Avoid generic AI marketing copy, invented statistics, ornamental gradients, blob backgrounds, and excessive glassmorphism.

## Implementation flow

1. Follow `trainers-superapp-tdd`; this skill does not authorize tests disallowed by repository policy.
2. Build within existing component, token, and route boundaries.
3. Verify the source contract and all relevant UI states.
4. Run the `impeccable` audit/polish gate after implementation.
5. Use focused Playwright E2E for changed runtime behavior; ask Fajar before adding or running a non-E2E test.

## Deliverable

Report design decisions, files changed, responsive/accessibility checks, tests, and visual runtime checks separately. If no screenshot/browser verification actually ran, do not claim visual equivalence.

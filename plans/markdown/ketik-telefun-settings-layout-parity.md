# KETIK and Telefun Settings Layout Parity

## Requirement

Align the KETIK and Telefun simulation settings with the existing PDKT settings layout, including the Masalah, Karakter, Identitas, and remaining module tabs. Keep the modules' fields, labels, scenario/template behavior, voice/provider controls, save and close behavior, and persistence unchanged. The work is limited to the web settings UI and shared presentation primitives; it must not change API, schema, or simulation contracts.

## Design

- Use PDKT's responsive settings dialog, tab navigation, header/footer hierarchy, content gutters, section headings, field labels, and selection-card treatment as the visual reference.
- Promote the existing PDKT settings presentation primitives into the shared web components area and update PDKT to import from that shared location. Use the same primitives in KETIK and Telefun rather than coupling either module to PDKT route code.
- Standardize KETIK and Telefun settings tab content around clear sections and consistent form spacing. Preserve each module's distinct data and controls, including KETIK templates and duration settings and Telefun readiness, model, voice, and pacing settings.
- Keep modal keyboard behavior, focus handling, close/save loading states, and responsive scrolling accessible. Do not add decorative surfaces or change product copy except where needed to make existing section labels consistent.
- Update the existing settings-modal test suites for the shared layout contract; do not create a parallel suite.

## Tasklist

- [x] Inspect PDKT, KETIK, and Telefun settings shells, panels, design tokens, and existing settings tests; confirm the settings-only scope.
- [x] Add focused layout assertions to the existing KETIK and Telefun settings tests and confirm the expected failure.
- [x] Extract shared settings presentation primitives and align KETIK and Telefun modal shells and tab panels with PDKT.
- [x] Run focused settings tests, affected web typecheck/lint, format checks, production build, and `git diff --check` as required by the Lane D gate.
- [x] Inspect desktop and mobile rendered settings on a local authenticated test surface and record the browser-validation result.
- [x] Complete the Impeccable visual review and review the final diff for behavior or contract drift.

## Verification

- RED: the new Telefun tab-navigation assertion failed before the shell refactor because its settings UI had no tablist; KETIK's tab assertion passed.
- Focused suites: 2 files, 21 tests passed (`ketik-settings-modal.test.tsx`, `telefun-settings-modal-accessibility.test.tsx`).
- Lane D gates: `pnpm typecheck`, `pnpm lint`, `pnpm test:core`, and `pnpm build` passed. Root lint reported existing warnings only; the changed files pass focused ESLint and Prettier checks.
- Rendered check: Playwright against the production preview at 1440×1000 and 390×844. Both routes exposed and switched through their settings tabs; Escape closed the dialog; document width stayed within the mobile viewport; dialog bounds were 14–376px within the 390px viewport; no console issues or failed requests remained after allowing the official font and OJK logo hosts.

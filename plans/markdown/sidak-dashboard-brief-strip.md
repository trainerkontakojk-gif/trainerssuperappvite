# SIDAK dashboard compact conclusion strip

## Requirement

Replace the tall three-step conclusion on `/sidak/dashboard` with one compact, responsive summary strip that presents a verdict word, finding trend, target context, and—only for coaching actions—the rising focus parameter and count of agents with findings on it. Preserve the capability-gated TNA link, ranking fallback, hidden accessible section heading, and no-insight behavior. Correct backend copy that ambiguously states the target was achieved while some agents remain below target, and keep focus-parameter copy distinct from total finding trends.

## Design

Keep the existing single bordered card and use one inline paragraph with a status dot plus an explicit Indonesian verdict word. Compose trend facts from `what`, target text from `soWhat`, and the focus/count clause from `focusParameter` only when `nowWhat.action` is `coach_focus_agents`. Do not display names, coaching recommendations, step labels, or an agent disclosure. Keep the action button at a 44px minimum touch height. Leave `DashboardInsights` unchanged.

## Tasklist

- [x] Update the focused browser E2E first and confirm the old UI fails the new strip assertions.
- [x] Implement the strip and remove the now-unused inline agent-list component.
- [x] Correct backend `soWhat` wording and update its local-backend Playwright E2E assertion.
- [x] Update the SIDAK logic/scoring documentation for the new presentation.
- [x] Run focused browser and API Playwright E2E, workspace typecheck and lint, quality review, detector, and final diff checks.
- [x] Save desktop and phone screenshots from the focused browser E2E run.

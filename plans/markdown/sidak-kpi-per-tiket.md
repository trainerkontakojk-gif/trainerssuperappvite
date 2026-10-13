# SIDAK Dashboard — KPI Temuan per Parameter dan per Tiket

Lane C: behavior change across `apps/api`, `packages/types`, and `apps/web`, with an additive-and-removal change to the internal dashboard response (`DashboardSummary`, `periodMetrics`, `sparklines`).

## Requirement

Fajar (2026-10-13): on `/sidak/dashboard`, replace the KPI cards "Total Temuan QA" and "Rata-rata Temuan per Agen" with:

1. **Total Temuan QA per Parameter**: the existing `totalDefects` (one countable `qa_temuan` row = one finding).
2. **Total Temuan QA per Tiket**: the number of tickets with at least one countable finding.

Ticket counting rule, matching the SIDAK heatmap `tiket` unit (`apps/api/src/services/sidak/heatmap-service.ts`):

- Only rows that pass `isCountableFinding()` count.
- Rows with a non-empty `no_tiket` count once per distinct ticket number.
- Rows without a ticket number count as one ticket per row (they cannot be grouped).
- The per-period sparkline counts tickets within each period. The range total is the sum of the per-period counts, the same way `totalDefects` is summed.

Acceptance:

- `GET /api/v1/sidak/dashboard` returns `summary.totalTickets`, `periodMetrics[].totalTickets`, and `sparklines["total-tickets"]` for both the single-period and the range branch.
- The card shows the ticket count with a month-over-month delta (lower is better) and a sparkline.
- `avgDefectsPerAudit`, `periodMetrics[].avg`, and `sparklines["avg-defects"]` are removed. They have no other consumer.

## Design

- `shared-constants.ts`: add `hasTicketNumber()` and `countFindingTickets(rows)`. The heatmap's whole-period count reuses them so both screens share one rule.
- `dashboard-trends.ts`: compute `totalTickets` per period. Replace the `avg-defects` sparkline with `total-tickets`.
- `dashboard-data.ts`: single-period branch counts tickets from the countable rows in the agent loop. The range branch sums `periodMetrics[].totalTickets`.
- `packages/types/src/sidak.ts`: `DashboardSummary.totalTickets` replaces `avgDefectsPerAudit`. `periodMetrics[].totalTickets` replaces `avg`.
- `apps/web/src/routes/sidak/dashboard.tsx`: relabel the first card and replace the second card.
- `docs/SIDAK_LOGIC_AND_SCORING.md`: update the summary formula table.

## Tasklist

- [x] RED: `apps/web/e2e/sidak-dashboard-kpi-api.spec.ts` seeds a local fixture and asserts ticket and parameter counts for the single-period and range branches.
- [x] GREEN: backend and types.
- [x] GREEN: frontend card, plus the hermetic `sidak-dashboard-insights.spec.ts` fixture updated and asserting the new labels.
- [x] Docs, typecheck, lint, focused E2E, `thermo-nuclear`, `git diff --check`.

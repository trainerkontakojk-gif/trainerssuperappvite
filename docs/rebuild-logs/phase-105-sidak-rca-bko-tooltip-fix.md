# Phase 105 — SIDAK RCA BKO Tooltip Fix

## Summary
Fixed the Root Cause Analysis (RCA/Pareto) hover tooltip issues for the BKO service (where bars are sparse or short) by upgrading the ParetoChart tooltip, cursor configuration, bar parameters, and legend. Also removed double-truncation of parameter names in the dashboard data mapping.

## Changes

### apps/web/src/components/sidak/ParetoChart.tsx
- Exported custom `ParetoTooltip` component that displays the full parameter name, counts, cumulative percents, and categories.
- Added the active layanan label to the tooltip so the hover card preserves service context instead of only showing the parameter name.
- Added a hover `cursor` highlight (`fill="currentColor"`, `opacity={0.04}`) to improve hit-area awareness.
- Configured `<Bar>` with `minPointSize={4}` so that extremely short bars are visually visible and targets for hover.
- Normalized category mappings: `critical`, `non_critical`, and `none` (fallback Slate color / "No Category" label).
- Added an extra legend item for `No Category` (displayed only when data includes `category: "none"`).

### apps/web/src/routes/sidak/dashboard.tsx
- Removed premature slicing of `p.name` in the `sortedPareto` mapping selector, preserving the full name for the chart. Presentational truncation is handled correctly at XAxis' tickFormatter.
- Passed the selected layanan label into `ParetoChart` using the shared service label map.

### apps/web/src/__tests__/ParetoChart.test.tsx
- Created a new unit/regression test suite that verifies the custom tooltip rendering for all category cases (`critical`, `non_critical`, `none`), handles null/empty payloads, and ensures the ParetoChart renders correctly.
- Extended the tooltip tests to assert that the layanan label appears in the hover card.

### apps/web/src/__tests__/sidak-dashboard-parity.test.tsx
- Added a hoisted `paretoChartMock` to capture chart props.
- Added a test case `passes full RCA parameter names to ParetoChart` to assert that full names are sent down from the dashboard mapping.
- Added assertion that the dashboard passes the layanan label into the chart props.

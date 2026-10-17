# Monitoring history tab — split the component file

- **Status:** Implemented on `claude/project-thread-8hrwo8`.
- **Risk lane:** Lane C (multi-file refactor, no intended behavior change).
- **Requested by:** Fajar, 2026-10-17 (project thread "Pelajari isi aplikasi Trainers SuperApp", item "file terlalu besar").

## Requirement

`apps/web/src/routes/monitoring/components/HistoryTab.tsx` was 1,121 lines. Move its stateless pieces out so the component holds only filter/pagination state and the table layout, with the same rendered markup.

## Design

- `HistoryTabCells.tsx`: `formatDateString`, `getPageNumbers`, and the four cell renderers (`renderModuleBadge`, `renderStatusBadge`, `renderConsumerContext`, `renderScoresAndMetrics`). They were closures that read no component state; they are still called as plain functions, so no new React components or DOM appear.
- `HistoryKpiCards.tsx`: the four session-count cards.
- `HistoryTab.tsx` (700 lines): state, filtering, pagination, table and pager. Only imports and the moved blocks changed; the rest was not reformatted.
- A whitespace-insensitive comparison matched every moved body and the remaining file against the original.

## Tasklist

- [x] Baseline `monitoring.spec.ts`: 14 passed.
- [x] Extract; web typecheck, ESLint, root build.
- [x] `monitoring.spec.ts` after: 14 passed.

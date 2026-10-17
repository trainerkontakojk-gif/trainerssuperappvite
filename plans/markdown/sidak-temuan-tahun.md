# SIDAK: batch findings missing `qa_temuan.tahun`

## Requirement

Findings created via `POST /sidak/temuan/batch` must appear in agent detail,
scores, ranking, trends, and reports for their period's year.

## Design

- Root cause: `createTemuanBatch` did not set `tahun`; perfect-session did.
  Readers (`agent-directory`, `sidak-ranking-service`, `service-trends`,
  `forecast`, `report-data`, `dashboard-data`) filter `.eq("tahun", year)`.
- Fix at the writer (one insert path left without it): read `qa_periods.year`
  for the batch period and write it on every row. Changing ~8 readers to join
  on period year was rejected as wider and slower.
- `updateTemuan` cannot change `period_id`, so `tahun` cannot drift on update.
- Migration `20261017090000_backfill_qa_temuan_tahun` fills existing NULLs
  from the period year (NULL rows only; updated_at trigger skipped). Rollback
  is a documented no-op. Local replay only; remote apply needs Fajar's OK.

## Tasklist

- [x] RED: `sidak-heatmap-integration.spec.ts` asserts the batch period's
      `findingsCount` in `getAgentDetail` equals inserted rows.
- [x] Write `tahun` in `createTemuanBatch`.
- [x] Backfill migration + rollback + README row; local replay.
- [x] Spec GREEN twice in a row.

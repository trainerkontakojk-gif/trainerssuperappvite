# SIDAK dashboard speed and month-range fix

Lane C (bug fix + cross-file backend performance change, no schema change).

## Requirement

- The SIDAK dashboard (`GET /sidak/dashboard`) loads noticeably slowly. Make it
  load faster without changing any score or KPI formula.
- Bug: when the dashboard is narrowed to a month range (`startMonth`/`endMonth`),
  the KPI cards and trend respect the range, but the "Agen dengan temuan
  terbanyak" table, Pareto, donut, and per-service totals still count the whole
  year. Every panel must use the same month range.
- SIDAK-excluded staff (QA, trainer, team leader, excluded folders) stay
  excluded.

## Design

Causes found in `apps/api/src/services/sidak/dashboard-data.ts`:

1. `fetchAllTemuan` pages with `OFFSET` (`range`) ordered by `id` while
   filtering on `tahun`, which has no index. Each later page rescans the rows
   skipped by earlier pages.
2. A month range is not turned into a period filter, so the whole year is
   always fetched (the bug above, and extra rows).
3. Every request reads the whole `profiler_peserta` table to build an
   excluded-ID list, then sends that list as a `NOT IN (...)` in the URL of
   every temuan page.
4. Each (service, period) pair resolves its rule version with its own
   3 queries (period, all published versions of the service, snapshot
   indicators). A full year with all services is dozens of pairs and well over
   a hundred small queries per load.

Fix:

1. Keyset pagination (`id > lastId`) with explicit columns.
2. Resolve the year + month range to the matching `period_id`s and filter on
   them (indexed `idx_qa_temuan_period_service`), keeping the `tahun` filter.
3. Apply `isAgentExcluded` to the joined `profiler_peserta` columns in memory;
   drop the full-table read and the `NOT IN` list.
4. A per-request loader in `period-scoring-context.ts` that fetches published
   versions once per service, reuses the already-loaded period list, and
   fetches each snapshot once per rule version. Rule selection logic is moved,
   unchanged, into a pure `pickEffectiveRuleVersion`.
5. Route: read agent scope and filter scope in parallel.

## Tasklist

- [ ] RED: extend `apps/web/e2e/sidak-dashboard-kpi-api.spec.ts` with a
      one-month range that expects top agents/Pareto to count only that month,
      and an excluded-staff guard.
- [ ] Implement 1–5.
- [ ] GREEN: run the spec against local disposable Supabase.
- [ ] API typecheck, lint; thermo-nuclear review.

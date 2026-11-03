# SIDAK parallel paging — Beranda and SIDAK analytics latency

Lane C (behavior-preserving performance fix across `apps/api` services; no
schema, RLS, grant, or public contract change). Source:
[`laporan-performa-production-2026-11-03.md`](laporan-performa-production-2026-11-03.md).

## Requirement

Beranda (`/home/attention`, `/sidak/dashboard/trend`, `/sidak/dashboard/forecast`)
and the SIDAK dashboard, forecast, ranking, and agent pages wait 1–3.4 s (p50,
Railway production, 7 days) on endpoints that read a whole year of
`qa_temuan`.

Measured cause (read-only, production, 2026-11-03): `qa_temuan` holds 8,313
rows for 2026 (5,023 non-phantom), `profiler_peserta` 143, `qa_periods` 11,
`qa_indicators` 78. Fetching the year in 1,000-row pages took 3.39 s
sequentially and 0.96 s with four pages in flight from the same client. The
cost is sequential PostgREST round trips, not in-memory aggregation.

Acceptance:

1. The year-wide `qa_temuan` reads used by `/home/attention`, `/sidak/agents`,
   `/sidak/dashboard` (and therefore the forecast), and `/sidak/dashboard/trend`
   keep more than one PostgREST request in flight.
2. Results stay complete and identical in content: every row is returned once,
   including rows past the third page, and totals match a SQL oracle.
3. `getAgentDirectorySummary` loads peserta, temuan, periods, and indicators
   concurrently instead of one after another.
4. No schema, RLS, grant, API response shape, or caching semantics change.

Out of scope (follow-up): the first visit of a SIDAK session loads the
dashboard, forecast, and ranking pages once for all teams and again after the
default team is chosen (`tim === null` path in `sidak/dashboard.tsx`,
`ranking.tsx`, `forecast.tsx`).

## Design

- `fetchAllPages` gains an opt-in `concurrency` (default 1, unchanged for every
  existing caller). With `concurrency = n` it requests pages in waves of `n`
  offsets and keeps rows up to and including the first short page, so the
  result equals the sequential walk.
- `fetchAllByIdPartitions` (new, same module) keeps the keyset paging chosen in
  [`sidak-dashboard-speed.md`](sidak-dashboard-speed.md): it splits the UUID
  space into four `id` ranges and walks each range with `id > lastId` in
  parallel, then concatenates ranges in order, so rows stay sorted by `id`.
  The `(tahun, id)` index still serves each range.
- `dashboard-data.fetchAllTemuan` uses the partitions; `service-trends` and the
  agent directory use waves of 4.
- `getAgentDirectorySummary` starts peserta, temuan, periods, and per-service
  indicators together; `getDashboardData` also starts soft-deleted ids and
  folder resolution with periods/indicators/weights.

## Tasklist

1. RED: `apps/web/e2e/sidak-parallel-paging-api.spec.ts` (project
   `sidak-parallel-paging-real-backend`), fixture year 2097 with >2,000 rows,
   tracks in-flight `qa_temuan` requests and asserts completeness oracles.
2. GREEN: pagination helpers and the four call sites above.
3. Re-run `home-attention-api.spec.ts` and `sidak-dashboard-kpi-api.spec.ts`
   as regression.
4. API typecheck, lint, `thermo-nuclear`, `git diff --check`.

## Batch 2 — dashboard join and forecast cache lookup (2026-11-03)

### Requirement

After batch 1 (deployed `d8f07770`), the Beranda forecast `cacheOnly` request
still takes ~1.8 s. Local profiling at production scale (7,865 synthetic rows,
loopback Supabase) shows forecast `cacheOnly` costs the same as
`getDashboardData` (medians 596 ms vs 652 ms), and the temuan read with the
`profiler_peserta!inner(...)` embed costs 405 ms vs 237 ms for temuan plus a
separate peserta read (median of 9).

Acceptance:

1. `getDashboardData` reads `qa_temuan` without the peserta embed; peserta
   come from one `profiler_peserta` read, attached in memory. Team filters
   resolve to the team's `peserta_id`s. Totals, exclusions, and team filtering
   stay identical (FK `qa_temuan.peserta_id` is `ON DELETE CASCADE`, so the
   inner join never dropped rows).
2. The forecast reads the stored fingerprints for its filter while the
   dashboard data loads, so a `cacheOnly` miss needs no trailing round trip
   and a hit needs one (the payload).
3. Forecast statuses are unchanged: `missing` with no snapshot, `fresh`/`hit`
   on a matching fingerprint, `stale` after the data changes.
4. The forecast route resolves agent scope and filter scope together.

Out of scope, needs Fajar's decision: the first-visit double load. The default
team is chosen from the unscoped team list that `GET /sidak/dashboard` returns
for every role, while `/sidak/folders` is scoped for leaders, so resolving the
default before the first fetch changes leaders' default or needs an API change.

### Tasklist

1. RED in `sidak-parallel-paging-api.spec.ts`: no `profiler_peserta` embed in
   `qa_temuan` requests; team-filtered totals match an oracle; forecast
   `missing` → refresh → `hit` → `stale`, with the snapshot lookup overlapping
   the temuan reads.
2. GREEN in `dashboard-data.ts`, `dashboard-forecast.ts`,
   `dashboard-forecast-store.ts`, and the forecast route.
3. Regression: KPI, brief, access-scope, home-attention specs.

# SIDAK report scope and archive filtering

## Requirement

1. `POST /sidak/reports/data` must enforce approved leader participant and service scope like the management report. Empty approved participant scope is forbidden. With no requested service, detail rows are restricted to allowed services. Scope failures return 403; unexpected failures return a friendly 500 response while `ScopeUnavailableError` still propagates. Admin/trainer response behavior stays unchanged.
2. Investigate what `showArchived` means in the current Profiler schema and UI before changing it. Only implement a single unambiguous existing representation; if it requires a migration or has multiple plausible meanings, stop without a second commit. If implemented, default reports/dashboard/directory omit archived records and `showArchived=true` includes them, with API E2E coverage and canonical documentation updated.

## Design

For the data report route, resolve `getAccessibleSidakFilters(user.id, role)` and pass both `agentIds` and `allowedServices` to the report query. Preserve nullable participant scope semantics for non-leaders and use the same friendly error policy as the management report. Apply service filtering in the database query.

For the archive investigation, inspect migrations, local schema availability, participant/account lifecycle, Profiler UI behavior, and every caller of `getSoftDeletedPesertaIds`. Do not infer an archive marker from unrelated year/folder organization. No schema changes are authorized.

## Tasklist

- [x] Add a focused real-backend Playwright spec first; verify a local-only Supabase target and capture RED.
- [x] Implement service/participant scope validation and database service allowlisting; capture GREEN.
- [x] Run focused API and required reports-data browser E2Es serially, workspace typechecks, changed-file eslint, and self-review.
- [ ] Investigate the live archive semantics after commit 1; only proceed with a second focused RED/GREEN implementation and its regression E2Es if semantics are unambiguous and need no migration.
- [ ] Update `docs/SIDAK_LOGIC_AND_SCORING.md` if archive behavior changes; record evidence and stop otherwise.

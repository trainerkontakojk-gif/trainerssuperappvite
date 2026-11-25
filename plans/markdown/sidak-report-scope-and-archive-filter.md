# SIDAK report scope and archive filtering

## Requirement

1. `POST /sidak/reports/data` must enforce approved leader participant and service scope like the management report. Empty approved participant scope is forbidden. With no requested service, detail rows are restricted to allowed services. Scope failures return 403; unexpected failures return a friendly 500 response while `ScopeUnavailableError` still propagates. Admin/trainer response behavior stays unchanged.
2. Investigate what `showArchived` means in the current Profiler schema and UI before changing it. Only implement a single unambiguous existing representation; if it requires a migration or has multiple plausible meanings, stop without a second commit. If implemented, default reports/dashboard/directory omit archived records and `showArchived=true` includes them, with API E2E coverage and canonical documentation updated.

## Design

For the data report route, resolve `getAccessibleSidakFilters(user.id, role)` and pass both `agentIds` and `allowedServices` to the report query. Preserve nullable participant scope semantics for non-leaders and use the same friendly error policy as the management report. Apply service filtering in the database query.

For the archive investigation, the live local schema has no `deleted_at`, `is_active`, or status marker on `profiler_peserta`; its current account FK is `akun_id` to `profiles`, whose `is_deleted` and `status` fields match the existing canonical contract in `docs/database.md` and `docs/architecture.md`. Profiler's "arsip tahun" is only year/folder organization, and deleting a participant in the UI is a hard delete. Account soft-delete marks `profiles.is_deleted` and unlinks the participant, while inactive accounts can remain linked. This distinguishes year archive from the documented linked-account exclusion contract; no schema migration is needed. Query the current FK and exclude linked profiles where `is_deleted` or status `inactive`. The affected SIDAK callers are dashboard data, data report rows (including management report detail/aggregates), and `getAgents`.

## Tasklist

- [x] Add a focused real-backend Playwright spec first; verify a local-only Supabase target and capture RED.
- [x] Implement service/participant scope validation and database service allowlisting; capture GREEN.
- [x] Run focused API and required reports-data browser E2Es serially, workspace typechecks, changed-file eslint, and self-review.
- [x] Investigate live schema, migration history, Profiler archive/delete behavior, and linked-account lifecycle; distinguish year folders from account status and record the no-migration decision.
- [x] Implement the typed `akun_id` profile query; prove default exclusion and `showArchived` inclusion for Dashboard, data report, and management report with local real-backend E2E.
- [x] Update `docs/SIDAK_LOGIC_AND_SCORING.md` and `docs/database.md` to describe the effective filter.

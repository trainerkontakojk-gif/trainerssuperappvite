# Profiler service — split by topic

- **Status:** Implemented on `claude/project-thread-8hrwo8`.
- **Risk lane:** Lane C (multi-file refactor, no intended behavior change).
- **Requested by:** Fajar, 2026-10-17 (project thread "Pelajari isi aplikasi Trainers SuperApp", item "file terlalu besar").

## Requirement

`apps/api/src/services/profiler-service.ts` was 1,054 lines of independent data functions covering years/folders, participants and teams. Split it by topic, keeping `./profiler-service` as the single import path for routes and tests.

## Design

- `profiler-folder-service.ts`: years, folders (create/rename/delete/duplicate) and folder counts.
- `profiler-team-service.ts`: team list, create, delete.
- `profiler-service.ts` (635 lines): participant functions plus `export *` of the two modules, so `routes/profiler.ts` and existing `vi.mock("../services/profiler-service")` calls keep working.
- Whole top-level blocks moved without edits; the groups share no helpers.

## Tasklist

- [x] Split; API `tsc --noEmit`, ESLint, Prettier (file was Prettier-clean), API build.
- [x] `access-matrix-api.spec.ts` (`gate-stub`, real API app in-process, includes profiler routes): 24 passed before and after.

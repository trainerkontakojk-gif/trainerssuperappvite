# SIDAK Digital Chat folder pairing

## Requirement

SIDAK selects the renamed top-level Profiler folder `Tim Digital Chat` for the `chat` service. Admin access-group options show `Digital Chat`. The folder row rename is a separate production operation owned by Fajar.

## Design

Change the existing default-folder map and admin display label. Keep the service key `chat` and participant team value `Chat`. Update the affected fixtures and product terminology.

## Tasklist

- [x] Run the Forecast service-switch regression with the renamed fixture before changing the map.
- [x] Update the map, admin label, fixtures, product terminology, and changelog.
- [x] Review the diff and verify the focused browser specs and web/API workspaces serially.

The Forecast service-switch regression failed with `Semua Tim` before the map change. After the change, all 35 SIDAK browser cases passed, including the renamed-folder selection and scoped requests. The mocked admin case passed, as did web/API typechecks, lint, and the whitespace check.

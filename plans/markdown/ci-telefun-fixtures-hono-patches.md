# CI repair: Telefun fixtures and Hono security patches — 2026-11-15

## Requirement

Fajar approved fixing both CI failure families after review of run `43673889967` (`42e58de0`) and prior run `43623410245` (`b6b4ba0c`). Preserve all CI gates, security checks, regression assertions, and unrelated dirty plans. No production mutations, provider calls, migration changes, new dependencies, audit ignores, or unit tests.

Lane D overall: security dependency patch upgrades affect runtime middleware/server. Fixture/regrouping changes alone are Lane C. Work directly and verify serially.

Acceptance:

- Telefun language evidence fixture explicitly handles `GET /rest/v1/ai_model_policy`; unknown traffic remains fail-closed.
- Proxy E2E models the current public annotation provider-failure contract and handles policy reads. Keep proxy routing, no-fallback, liveness, unexpected request and secret-redaction assertions intact.
- Preserve the real-database idle-orphan regression, move it to a separate API spec/project outside the CI no-backend project set, and run it on a task-owned disposable loopback target. Missing disposable configuration still fails; no `skip` workaround.
- Upgrade only Hono and its Node adapter to patched version floors (`^4.13.16`, `^2.1.6`) in direct manifests and existing transitive override policy/lockfile. `pnpm audit --prod` must pass with no new ignores.
- Re-run all seven no-backend CI projects, focused local backend checks, root typecheck/lint/build, frozen-lockfile validation and diff checks. Commit and push to `main` after gates; report actual CI result.

## Design

Root causes already observed in CI: three evidence tests treat the new policy read as unexpected; three API proxy tests expect `NO_ANNOTATIONS` instead of the current upstream-failure `GENERATION_ERROR`; one disposable-DB-only idle test is incorrectly included in a no-backend project. Dependency audit reports six moderate and one low advisory against `hono` and `@hono/node-server`.

Use existing fixtures and helpers rather than production changes. Extract the idle test unchanged to `telefun-idle-orphans-api.spec.ts`, add `telefun-idle-orphans-real-backend` to `playwright.api.config.ts`, leave CI project names/audit blocking behavior intact. Use isolated Supabase ports 55321/55322, verify project/container identity and loopback, query aggregates only, stop task-owned containers after verification without touching the user's existing stack. No `.env*` edits.

Context7 `/honojs/hono` confirms `serve({ fetch: app.fetch, port, hostname })` and router API; patch installation does not require changing the app integration. Exact patch/security floors come from `pnpm audit --prod`, not unversioned docs. Existing `hono` override means both direct and transitive dependency constraints must be updated. Add the same security override for `@hono/node-server`: updating only the direct API dependency leaves SDK's old optional adapter in the production tree. pnpm resolved Hono `4.13.18` and adapter `2.1.8` within those patch lines; no unrelated packages were upgraded. No broad `pnpm update --latest`.

## Tasklist

- [x] Reproduce seven focused E2E failures and production dependency audit locally (RED), preserve outputs.
- [x] Fix explicit policy fixture, error contract, and extract the disposable DB test/project.
- [x] Run focused E2E GREEN and the extracted idle test on a verified task-owned disposable DB.
- [x] Patch direct dependency floors/override and update only corresponding lockfile entries; verify audit GREEN and frozen install.
- [x] Thermo-nuclear self-review; run complete no-backend CI projects, relevant backend regression, root typecheck/lint/build, diff checks.
- [ ] Update canonical E2E documentation and changelog; two scoped commits (fixture grouping, dependency security patches); push once and inspect CI.
- [x] Record evidence and resource cleanup under `plans/evidence/ci-telefun-fixtures-hono-patches-2026-11-15.md`.

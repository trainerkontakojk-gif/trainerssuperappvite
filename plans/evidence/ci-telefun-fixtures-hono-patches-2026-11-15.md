# CI repair evidence — 2026-11-15

## Contract and scope

User approved both repairs after inspection of CI `43673889967` (`42e58de0`) and previous CI `43623410245` (`b6b4ba0c`). Both already had the same failures. Plan: `plans/markdown/ci-telefun-fixtures-hono-patches.md`. Lane D overall (runtime security dependency patch), direct execution, no delegation.

Owned files: two existing Telefun API E2E fixtures, one extracted idle-orphan spec, API Playwright project config, canonical E2E documentation, API/web dependency manifests, existing workspace override policy and lockfile, plan/evidence and changelog. No application service/API implementation, schema, migration, CI gate, audit ignore, `.env*`, or unrelated plan changed. Three unrelated untracked user plans remain untouched.

## RED evidence

- `pnpm --dir apps/web exec playwright test --config playwright.api.config.ts --project telefun-language-evidence-stub --project gemini-egress-proxy --workers=1 --reporter=line` — exit 1, **7 failed / 9 passed**. Three language-evidence failures report unexpected `GET /rest/v1/ai_model_policy`. Three API proxy failures expect `NO_ANNOTATIONS` but receive the current safe upstream-error `GENERATION_ERROR`. The idle probe fails with `Disposable Supabase workdir required` because it was misclassified in a no-backend project.
- `pnpm audit --prod --json` — exit 1, **six moderate + one low** advisories affecting `hono` and `@hono/node-server`. Advisory floors are Hono 4.13.16 and Node adapter 2.1.6.
- The interrupted install was inspected before retry: no install process remained and the lockfile still had old versions. The successful resumed command was `pnpm install --ignore-scripts --prefer-offline --network-concurrency=1 --child-concurrency=1` (exit 0). A first direct dependency upgrade left two moderate advisories through the SDK's optional old Node adapter, confirmed by `pnpm --recursive why @hono/node-server`; the existing override mechanism was then extended to cover that adapter too.

Raw local outputs are ignored under `artifacts/ci-telefun-repair/`; the advisory baseline was also inspected as `/tmp/ci-audit-red.json`. No credentials or real provider response was committed.

## Implementation

- Explicit policy-read fixture returns `[]`, allowing the product resolver to use its code default. Unknown HTTP requests still fail closed and are asserted empty.
- Proxy annotation tests assert exact `GENERATION_ERROR` plus human-friendly message for failed upstream calls. HTTP 500, service liveness, Supabase direct routing, CONNECT targets, no direct fallback, unexpected traffic, process survival and secret-redaction assertions are retained.
- The idle-orphan test body is moved unchanged to `telefun-idle-orphans-api.spec.ts` and registered as `telefun-idle-orphans-real-backend`. No `skip`, weakened guard, missing assertion, or CI exclusion pattern was introduced. All 63 pre-existing test cases remain: 62 no-backend cases plus one explicit real-database case.
- Direct manifest and override floors follow existing caret conventions (`^4.13.16`, `^2.1.6`). The lockfile resolves **Hono 4.13.18** and **@hono/node-server 2.1.8**, including SDK transitives. Only these two packages and their peer-key references change; other dependency versions remain unchanged. No new dependency or audit ignore was added.

## Disposable target and cleanup

Created `/tmp/trainers-ci-idle-20261115`, identity `trainers-ci-idle-20261115`; verified no listener on 55321/55322 before start and verified Docker project label before migrations. Local CLI config uses API 55321 / DB 55322 and separate auxiliary ports. Existing repo migrations were replayed via a temporary symlink, using `supabase migration up --local --workdir /tmp/trainers-ci-idle-20261115` (exit 0). No remote target or production data was used.

`E2E_SUPABASE_WORKDIR=/tmp/trainers-ci-idle-20261115 pnpm --dir apps/web exec playwright test --config playwright.api.config.ts --project telefun-idle-orphans-real-backend --workers=1 --reporter=line` — exit 0, **1 passed**, `idle orphan claim count: 0`. PostgreSQL had the actual migrated orphan RPC and `pg_stat_statements`, not an empty-schema substitute.

An additional Monitoring backend run initially passed 17 and failed two SIDAK forecast cases because the fresh migration-only DB contained no `call` indicators. Verified indicator counts by service (only `slik` and `bko`), then applied the existing `supabase/seeds/005_qa_indicators.sql` to this task-owned DB only; the unchanged 19-case suite then passed. No application/test assertions were altered to hide this setup gap.

`supabase stop --workdir /tmp/trainers-ci-idle-20261115 --no-backup` — exit 0. Read-back showed zero task-owned containers, while all seven pre-existing `trainerssuperappvite` containers remained running. Test child services exit through their existing cleanup helper.

After extraction, invoking the explicit idle project without `E2E_SUPABASE_WORKDIR` was also checked: expected exit 1 with the exact `Disposable Supabase workdir required` error, confirming fail-closed behavior instead of silently skipping or using the developer's DB.

## GREEN / release gates

All heavy commands ran serially. Full CI project set:

```bash
pnpm --dir apps/web exec playwright test --config playwright.api.config.ts \
  --project gate-stub --project rate-limit-stub \
  --project pdkt-consumer-email-stub --project telefun-language-evidence-stub \
  --project dev-database-guard --project subdomain-robots \
  --project gemini-egress-proxy --workers=1 --reporter=line
```

Exit 0, **62 passed** after dependency installation. Fixtures/child-process preloads pin loopback services and deny provider egress. No live browser, remote database, or production provider is involved.

| Additional command                                                                                                                                                                                    | Exit | Result                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------- |
| Focused two-project command from RED, after fixture correction                                                                                                                                        | 0    | 15 passed                                                  |
| `E2E_SUPABASE_WORKDIR=/tmp/trainers-ci-idle-20261115 pnpm --dir apps/web exec playwright test --config playwright.api.config.ts --project monitoring-models-real-backend --workers=1 --reporter=line` | 0    | 19 passed after QA indicator seed                          |
| Explicit idle project above                                                                                                                                                                           | 0    | 1 passed; orphan calls delta zero                          |
| `pnpm audit --prod`                                                                                                                                                                                   | 0    | No known vulnerabilities found                             |
| `pnpm install --frozen-lockfile --ignore-scripts --prefer-offline --network-concurrency=1 --child-concurrency=1`                                                                                      | 0    | Lockfile up to date; resolution skipped                    |
| `TURBO_CONCURRENCY=1 pnpm typecheck`                                                                                                                                                                  | 0    | Four workspaces; web includes E2E TypeScript               |
| `TURBO_CONCURRENCY=1 pnpm lint`                                                                                                                                                                       | 0    | Four workspaces; web 75 pre-existing warnings, zero errors |
| `TURBO_CONCURRENCY=1 pnpm build`                                                                                                                                                                      | 0    | Three workspace builds                                     |
| `GRAPHIFY_MAX_WORKERS=1 graphify update .`                                                                                                                                                            | 0    | Local ignored cache updated with one extraction worker     |
| `git diff --check`                                                                                                                                                                                    | 0    | No whitespace errors                                       |

Final distinct E2E coverage: **82 passed** (62 + 19 + 1). No unit tests were added or run. Vite's existing native-loader warning and existing ESLint warnings were not changed.

## Thermo-nuclear self-review

Verdict: PASS for implementation/local gates, not independent review or a claim about remote CI.

- Followed failing evidence rather than changing product behavior to satisfy stale tests. Annotation route source distinguishes failed generation from successful empty results.
- CI workflow remains unchanged: audit still blocks every production advisory, and all seven no-backend projects remain selected.
- Idle regression is retained, executable, target-guarded and actually passed against migrated local Postgres. No coverage was silently deleted.
- Dependency changes preserve majors, existing manifest conventions and Hono Node `serve({ fetch: app.fetch })` integration. Context7 `/honojs/hono` resolution/query confirmed that integration; exact patched floors came from the audit, since Context7 examples are not release-specific security proof.
- Graphify traced `bootLocalService` callers; live source/config/imports controlled the extraction and fixture edits. No generated graph file was added.
- Documentation drift corrected: the CI project described itself as no-backend while including a real-DB-only probe; E2E docs now identify the local-only project and required disposable ports. The repo README still advertises legacy `pnpm test`; canonical workflow remains authoritative and no unit suite was run.
- All task-owned temporary services were stopped. No `.env` or production system was modified and unrelated dirty plans were preserved.

## Integration status at evidence creation

Ready for two scoped commits (fixture/project repair; Hono security patches) and one push to `main`. Actual post-push GitHub CI status will be checked and reported separately; local GREEN is not remote CI evidence.

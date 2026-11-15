# Selectable AI pricing — execution evidence (2026-11-15)

## Scope and status

Lane D. Contract: `plans/markdown/ai-pricing-selectable-models.md`.
Direct implementation, no delegation. Local implementation and release gates passed; deployed API read-back remains a separate post-push check. No migration, remote database write, history deletion, historical repricing, provider call, or manual production deployment was performed.

Initial checkout: `main` at `b6b4ba0c`. The user-provided pricing plan was untracked and is included with this change. Three unrelated untracked plans (`cloudflare-security-audit-partial-2026-11-04.md`, `sidak-temuan-row-cache.md`, `supabase-egress-reduction.md`) were preserved and excluded.

## RED → GREEN

Local targets were checked before execution: integration API `127.0.0.1:54321`, database `127.0.0.1:54322`, Docker label `trainerssuperappvite`. OrbStack was started to restore access to the existing local integration stack; no database reset or `.env*` edit was used. Browser configs start only Vite on loopback with dead-port API/Supabase/Telefun defaults, never production backend processes. Provider responses in API regressions are local HTTP fixtures or in-process fail-closed HTTP interception.

1. `pnpm --dir apps/web exec playwright test --config playwright.api.config.ts --project monitoring-models-real-backend -g 'selectable pricing|retired pricing' --workers=1 --reporter=line` — RED exit 1: two failures, active Hydrogen missing `editable: true`; GPT Mini missing `historical: true` / `editable: false`. An initial test fixture upsert conflict was corrected before recording this product RED. GREEN exit 0: 2 passed after implementation.
2. Runtime audit found live paths bypassing the settings coercion: KETIK retained session snapshot → consumer response; PDKT `/mailbox/evaluate` config → `callAI`.
3. `pnpm --dir apps/web exec playwright test --config playwright.api.config.ts --project monitoring-models-real-backend -g 'legacy KETIK snapshots' --workers=1 --reporter=line` — RED exit 1: both KETIK `gpt-5.4-mini` snapshot and PDKT `deepseek-v4-pro` evaluation reached OpenAI. GREEN exit 0: 1 passed after applying existing `coerceKetikPdktModelId` at those two provider boundaries. Error status remains 502, not fabricated success; persisted KETIK snapshot remains unchanged.

Local full outputs (ignored, not committed): `artifacts/ai-pricing-selectable/{red,green-focused,red-runtime,green-runtime}.log`. Reproduce with the commands above against a loopback integration database.

## Final verification

All suites ran serially, one Playwright worker, no unit-suite execution:

| Command                                                                                                                                                     | Exit | Result                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------- |
| `pnpm --dir apps/web exec playwright test --config playwright.api.config.ts --project monitoring-models-real-backend --workers=1 --reporter=line`           | 0    | 19 passed                                                                                |
| `pnpm --dir apps/web exec playwright test --config playwright.api.config.ts --project monitoring-pricing-schedule-real-backend --workers=1 --reporter=line` | 0    | 6 passed                                                                                 |
| `pnpm --dir apps/web exec playwright test --config playwright.api.config.ts --project ketik-errors-real-backend --workers=1 --reporter=line`                | 0    | 5 passed                                                                                 |
| `pnpm --dir apps/web exec playwright test monitoring-models.spec.ts --workers=1 --reporter=line`                                                            | 0    | 1 passed                                                                                 |
| `pnpm --dir apps/web exec playwright test monitoring-harga.spec.ts --workers=1 --reporter=line`                                                             | 0    | 6 passed                                                                                 |
| `TURBO_CONCURRENCY=1 pnpm typecheck`                                                                                                                        | 0    | 4 workspaces; web includes E2E TypeScript                                                |
| `TURBO_CONCURRENCY=1 pnpm lint`                                                                                                                             | 0    | 4 workspaces; web reports 75 warnings, zero errors; warning paths unchanged by this task |
| `TURBO_CONCURRENCY=1 pnpm build`                                                                                                                            | 0    | 3 workspace builds                                                                       |
| `git diff --check`                                                                                                                                          | 0    | No whitespace errors                                                                     |
| `graphify update .`                                                                                                                                         | 0    | Local ignored graph updated; no graph artifact committed                                 |

Total final E2E: **37 passed**. The pricing-schedule suite initially failed because `KNOWN_MODEL` was retired `gemini-3.1-flash-lite`; changing that fixture to selectable `gemini-3.5-flash-lite` restored all six existing assertions without weakening them. No unrelated product fix was needed. Vite reports its existing `__dirname`/native config loader warning.

Logs for these commands are under ignored `artifacts/ai-pricing-selectable/`.

## Production preflight: SELECT only

Supabase MCP discovery failed (offline, `fetch failed: bad port`). Fallback: authenticated Supabase CLI 2.98.2 Management API. The linked project file was read and verified exactly `ruosnjmtywcrghjgqugz` before either command. Only grouped configuration and usage counts were returned; no user data, JWT, credentials, or raw query logs were copied.

```sql
SELECT task, model_id, count(*) AS policies
FROM public.ai_model_policy GROUP BY task, model_id ORDER BY task;
SELECT model_id, count(*) AS calls
FROM public.ai_usage_logs
WHERE created_at > now() - interval '30 days'
GROUP BY model_id ORDER BY model_id;
```

Commands: `supabase db query --linked '<SELECT above>' -o json` — both exit 0.

P1: `default_text`, `ketik_review`, `sidak_forecast`, `telefun_assessment` use `gemini-4-hydrogen`; `ketik_review_fallback` explicitly uses `gemini-3.8-flash`. No orphan policy or effective primary/fallback collision. The new Flash Lite **code default does not overwrite** this valid explicit Flash fallback. No production reset is necessary.

P2 (30 days): `gemini-3.1-flash-live-preview` 2 calls; `gemini-3.5-flash-lite` 1; `gemini-3.8-flash` 175; `gemini-3.8-live` 10. No retired model appeared. These counts alone do not establish unreachable code; the T4 regressions above close the two concrete reachable legacy paths independently.

## Thermo-nuclear self-review

Verdict: PASS (implementation and local gates; not a claim of independent review or deployed verification).

- Shared allowlist is derived from module choice lists, not duplicated IDs. Models added only to `TEXT_MODELS` do not become selectable/priced automatically.
- Pricing, generic/module catalogs, and task policy validation agree; seven active rows; Live excluded from GenerateContent task eligibility. Hydrogen audio eligibility from newer commits is retained.
- Active pricing explicitly editable; retired settings rows remain read-only with existing history/schedule interpretation. Legacy normalization, wrappers, fallback price tables, RLS/capability checks, mutations, and historical cost snapshots remain unchanged.
- Regression covers both directions of pricing/catalog equality, absence of active OpenAI, fallback default, retired pricing/policy writes, stale policy resolution, actual legacy provider routing, and immutable stored snapshot. Existing suites retain missing-price, schedule, audit rollback, lease, authorization, Hydrogen and usage-cost coverage.
- No new dependency, lifecycle, abstraction, migration, or product UI layout was added. No UI redesign audit or Context7 lookup required for this internal selection-policy change.
- The existing Monitoring API spec exceeds approximately 1,000 lines after these regressions. Keeping its shared real JWT/database setup, global policy cache reset and cleanup together avoids introducing a separate harness/config refactor in the billing change; this bounded exception is also recorded in the plan.
- Graphify symbol query traced policy callers; live `rg`/imports determined the provider-boundary changes. Generated graph files remain ignored.

## Documentation drift

Corrected within scope: architecture previously counted two Live models while code has three, still described direct OpenAI fallback/selectability, and still called Hydrogen audio disabled despite `b6b4ba0c`. Monitoring billing documentation also described every registry model as editable; it now documents selectable vs historical pricing.

Remaining pre-existing discrepancies outside this selection-policy change: `README.md` advertises `pnpm test` while canonical workflow treats unit suites as legacy inventory requiring approval. `docs/MONITORING_TOKEN_USAGE_BILLING.md` still has generic missing-pricing statements saying usage is omitted; current Hydrogen behavior retains token evidence at zero cost, and legacy fallback rate behavior is unchanged. These logging/docs contracts were not silently changed or used to authorize billing changes.

## Post-push verification

Pending at evidence creation: observe this commit's automatic Railway deployment (not a manual deploy), then authenticated `GET /api/v1/ai/monitoring/pricing` must return exactly seven editable rows and historical read-only rows for retired settings. No E2E may target production. No orphan-policy mutation is required by the preflight result. Deployment/read-back status will be reported separately; local test results are not production evidence.

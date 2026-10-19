# EFEK — pengecualian agent dari analisis

Lane D: additive report API contract; no schema, authorization, or SIDAK scoring change.

## Requirement

Allow trainers to exclude an anomalous participant from an EFEK analysis with a required reason, retain attendance and individual scores, compare the full cohort with the adjusted result, and disclose exclusions in printable reports.

## Design

- Analysis-only URL filter, not a persisted/shared attendance edit. Explain that reasons travel in the link and export; avoid confidential details. At most 10 distinct agent IDs, required trimmed reason (max 200 characters).
- Add optional JSON query `exclusions` containing `{peserta_id, reason}` objects, validated by shared schemas. Applies to all participations of that agent in the filtered cohort. Empty/invalid reasons, duplicates and malformed payloads return 400. Unknown/out-of-scope IDs have no effect and are not echoed as applied exclusions.
- Backend retains all participant rows and raw monthly/individual results; optional `exclusion_reason` marks excluded rows. Program/session metrics and charts use included rows. Excluded participants never enter the non-participant comparison group. Baseline is always computed from the identical filters without exclusions.
- Program detail adds optional `analysis` with `all_participants` program summary and applied exclusions (ID, name, reason). Present only if at least one exclusion matches. Existing default response remains compatible.
- UI: a bounded agent/reason form on program detail, applied list with restore action, explicit full-vs-adjusted summaries, all participant rows retained. No automatic outlier removal, new dependencies, migrations, or remote writes.
- Scope: shared efek types, backend report, router/report query encoding, program UI, export, existing EFEK Playwright specs, canonical modules docs.

## Tasklist

- [x] RED: focused API E2E for baseline, adjusted metrics/chart/session, attendance, comparison isolation, invalid input, all excluded and restore; browser E2E for required reason, apply/remove, reload, export and mobile.
- [x] GREEN: shared validation and backend calculations.
- [x] GREEN: URL-backed UI, transparent summaries and escaped export.
- [x] Verify focused suites serially against loopback only; record infrastructure blockers honestly.
- [x] Impeccable and thermo-nuclear self-review; typecheck/lint/build serially, diff check, canonical docs.

## Discovery

Graphify query of `apps/api/src/services/efek/report.ts` identified routes, shared types and EFEK E2E callers, confirmed against live imports. Existing dirty `docs/supabase-usage-egress-audit-2026-10-19.md` is outside scope. No new external-library usage; existing React/Zod/router patterns suffice, so Context7 is not needed.

## Drift and verification evidence

A concurrent `pull --rebase --autostash origin main` replaced the legacy cache-based EFEK scoring with raw SIDAK temuan scoring during the first implementation attempt. Work was paused and Fajar explicitly approved adapting to the new HEAD (`227ab0ee`). No unrelated work was reverted. The real API fixture now pins its own published 2019 rule snapshot (and removes it in cleanup), avoiding dependence on master indicators/weights left in the disposable local database. The existing browser setup now permits TNA's canonical period query in its URL wait; no product behavior outside EFEK was changed.

- RED browser: `pnpm --dir apps/web exec playwright test tna-efek.spec.ts --grep 'pengecualian.*390' --workers=1 --trace on` — exit 1, missing `Pengecualian analisis` region.
- Initial API run was blocked by stopped loopback Supabase (fetch/SQL failure, not product RED). Started the minimal local Supabase stack; repeated `pnpm --dir apps/web exec playwright test --config playwright.api.config.ts tna-efek-report-api.spec.ts --grep 'exclusions adjust' --workers=1` — exit 1, expected 200, received 400 because the query was not yet supported.
- Final API: `pnpm --dir apps/web exec playwright test --config playwright.api.config.ts tna-efek-api.spec.ts tna-efek-report-api.spec.ts --workers=1` — exit 0, **12 passed**. Real Hono/JWT/RLS/Postgres, loopback only; no provider calls. Log `/tmp/efek-exclusions-api-final.log`.
- Final browser: `pnpm --dir apps/web exec playwright test tna-efek.spec.ts --workers=1 --trace on` — exit 0, **11 passed**. Hermetic, fail-closed network; keyboard apply, reload, restore, escaped export, all excluded, error/no stale export, and existing session/import flows.
- `pnpm exec turbo run typecheck --concurrency=1 --cache=local:rw` — exit 0, four workspaces (three cached in final run). An initial new route-inference error was fixed by explicitly returning the optional `EfekReportSearch` type; no caller edits were needed.
- `pnpm exec turbo run lint --concurrency=1 --cache=local:rw` — exit 0, existing warnings (web: 66, zero errors); none mention changed EFEK paths.
- `pnpm exec turbo run build --concurrency=1 --cache=local:rw` — exit 0, three workspace builds.
- Logs: `/tmp/efek-exclusions-{typecheck,lint,build}.log`. No unit/Vitest suites were run.
- `GRAPHIFY_MAX_WORKERS=1 graphify update .` — exit 0; ignored local graph refreshed once, no LLM extraction.
- `git diff --check` — exit 0.

### Impeccable self-audit

Verdict: PASS. Findings: no unresolved P1/P2 on the changed surface. Source review: native labels, required bounded reason, explicit non-permanent filter disclosure, token-based styling, recoverable errors, no new motion/dependencies. Mechanical detector returned `[]` (exit 0): `/tmp/efek-exclusions-impeccable.json`. Runtime: inspected locator screenshots `exclusions-390.png`, `comparison-390.png` (dark) and `exclusions-1280.png`, `comparison-1280.png` (light), under `apps/web/test-results/tna-efek-pengecualian-*/`; keyboard focus and 44px control heights pass. Initial whole-page captures clipped the app's inner scroll area; replaced with section captures. This is Chromium viewport evidence, not a physical-device or full WCAG certification.

### Thermo-nuclear self-review

Verdict: PASS. Traced query validation → backend cohort filtering → unchanged peer membership → full baseline plus adjusted metrics → retained participant rows → escaped HTML. No writes, schema changes, privilege changes, new dependencies, or changes to SIDAK scoring. Empty cohort returns null aggregates; invalid input rejects; failed loads hide stale data/export and allow reset. No superseded unit tests found. All review and checks were performed directly in this session, not by an independent reviewer. Unrelated dirty audit document preserved. At verification time, no commit, push or deployment had been performed.

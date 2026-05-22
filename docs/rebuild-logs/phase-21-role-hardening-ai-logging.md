# Phase 21: Role Hardening + AI Logging Enhancement

## Verdict
Role enforcement diperketat: QA dihapus dari mutation endpoints SIDAK/Profiler, admin routes menggunakan `adminOnly` middleware. AI usage logging ditingkatkan dengan status (success/failed/timeout) dan error_message. Soft-delete exclusion kini bisa di-override via `show_archived`.

## Scope
- Role hardening di SIDAK & Profiler routes (API + frontend guards)
- Admin route middleware change (managerOnly → adminOnly)
- AI usage logging enhancement (status, error_message, token=0 on failure)
- showArchived parameter untuk soft-delete override
- Deprecated endpoint removal (GET / → 410 Gone)
- New test infrastructure (fast-check, playwright, seed manager, data integrity checker)

## Changes
| Area | Change | Files |
| --- | --- | --- |
| Role enforcement | QA removed from SIDAK/Profiler mutation routes; leader role for reads | `apps/api/src/routes/sidak.ts`, `apps/api/src/routes/profiler.ts` |
| Admin hardening | Admin routes now `adminOnly` instead of `managerOnly` | `apps/api/src/routes/admin.ts` |
| AI usage | Added `status` + `error_message` fields; token=0 on failure | `apps/api/src/lib/ai-usage.ts` |
| Soft-delete | `show_archived` param for agents, dashboard, reports | `apps/api/src/routes/sidak.ts`, `apps/api/src/services/sidak-service.ts` |
| Deprecation | `GET /` mock endpoint → 410 Gone | `apps/api/src/app.ts` |
| Testing | fast-check, playwright config, seed manager, migration validator, RLS verifier, data integrity checker | `apps/api/src/__tests__/*`, `apps/web/playwright.config.ts` |
| Telefun settings | TelefunSettings types refined | `apps/web/src/routes/telefun/telefunSettings.ts` |

## Verification
- `pnpm lint` - ESLint passes
- `pnpm test` - Vitest suites pass
- `pnpm build` - Monorepo build passes

## Notes
- Role `qa` still has read access to KETIK/PDKT routes; mutation restriction only applies to SIDAK/Profiler.
- Fast-check added for property-based testing in future test iterations.
- AGENTS.md and GEMINI.md plan format updated to adopt `.kiro` 3-section structure.

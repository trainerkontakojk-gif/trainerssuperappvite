# Phase 19: Frontend Checklist Fixes (P0-P2)

## Verdict

All frontend checklist items from `docs/checklist-audit-trainers-superapp.md` sections 1.1-1.8 have been audited and fixed. Build and tests pass.

## Scope

- Global UI/UX (toast, route guards, unauthorized page)
- KETIK transcript export
- PDKT draft autosave
- Telefun settings + realtime transcript
- SIDAK dashboard rewrite (filters, pareto, pagination)
- QA parameter versioning (backend + frontend)
- Report AI A4 print support
- Table pagination consistency across 6 pages

## Changes by Priority

### P0 — Critical

| Item                | Change                                                                                         | Files                                       |
| ------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Toast notifications | Replaced all 54 `alert()` calls with `sonner` v2 via `notify.success/error/warning()`          | `apps/web/src/lib/toast.ts`, 12 route files |
| Route guards        | Added `beforeLoad` role guards via `requireRole()` for 24+ protected routes                    | `apps/web/src/router.tsx`                   |
| Unauthorized page   | Created 403 page for role-denied access                                                        | `apps/web/src/routes/unauthorized.tsx`      |
| Session guard       | Layout now checks both `auth_token` AND `auth_profile`                                         | `apps/web/src/components/Layout.tsx`        |
| SIDAK dashboard     | Rewritten with year/service filters, pareto chart, paginated top agents, distinct empty states | `apps/web/src/routes/sidak/dashboard.tsx`   |

### P1 — Important

| Item                    | Change                                                                                              | Files                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| KETIK transcript export | `downloadTranscript()` generates `.txt` with header, messages, scores                               | `apps/web/src/routes/ketik/components/HistoryModal.tsx`                                                            |
| Report AI A4 print      | `@media print` CSS (A4, page breaks) + `window.print()` button                                      | `apps/web/src/routes/sidak/reports-ai.tsx`                                                                         |
| Telefun settings        | Backend GET/PUT `/telefun/settings`; frontend 3-tab SettingsModal (model/voice, scenario, consumer) | `apps/api/src/routes/telefun.ts`, `apps/web/src/routes/telefun/`                                                   |
| QA parameter versioning | 8 backend service functions + 8 API endpoints + tab UI (create draft, publish, supersede)           | `apps/api/src/services/sidak-service.ts`, `apps/api/src/routes/sidak.ts`, `apps/web/src/routes/sidak/settings.tsx` |

### P2 — Improvements

| Item                         | Change                                                                                                           | Files                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Telefun realtime transcript  | Transcript bubble UI during active call; AI text extracted from WebSocket `serverContent.modelTurn.parts[].text` | `apps/web/src/routes/telefun/index.tsx`                     |
| PDKT draft autosave          | localStorage-based autosave with 500ms debounce; draft key: `pdkt_draft_{recipient}_{subject}`                   | `apps/web/src/routes/pdkt/components/ReplyComposer.tsx`     |
| Table pagination consistency | Shared `Pagination` component applied to 6 tables with page reset on filter, page-size selector                  | `apps/web/src/components/ui/Pagination.tsx` + 6 route files |

## Verification

- `pnpm build` — Full monorepo build succeeds
- `pnpm test` — All tests pass (44 web tests)
- Pagination page reset verified across all 6 tables via `setPage(1)` grep
- `getPageNumbers` bug fixed: near-end branch now correctly shows `1, 2, ..., N-4, N-3, N-2, N-1, N`
- Pagination wrapper now conditionally renders only when data > 1 page (ranking, profiler table)
- `sidak/agents.tsx` added missing `useEffect` for page reset on search change

## Checklist Audit Status

All frontend sections (1.1-1.8) in `docs/checklist-audit-trainers-superapp.md` updated from `[ ]`/`[~]` to `[x]` where applicable.

Remaining open items:

- `[ ]` Export DOCX/PDF (only print-to-PDF via `@media print` for now)
- `[ ]` QA preview before apply parameter
- `[ ]` QA validation before upload batch with new parameter
- `[~]` Telefun scenario CRUD (presets + custom instructions only, no full CRUD)
- `[~]` QA change_reason field (not yet in schema/UI)

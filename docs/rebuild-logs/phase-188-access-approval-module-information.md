# Phase 188: Access Approval Module Information

## Problem

The left request list on `/dashboard/access-approval` displayed leader name, email, date, and access group chips — but no indication of which module (`KTP`, `SIDAK`, or both) each request was for. Admins/trainers had to click each item to see the module in the right panel.

## Root Cause

The `PendingLeaderRequest.module` and `ApprovedLeaderAccess.module` fields were already present in the API response and shared types, but the frontend renderer never used them in the left list items.

## Solution

1. **`getAccessModulePresentation()` helper** — pure mapping function normalizing `ktp` → `"KTP"`, `sidak` → `"SIDAK"`, `all` → `"KTP + SIDAK"`, and unknown/null → `"Modul tidak diketahui"`. Each mapping includes search terms for the enhanced filter.

2. **`AccessModuleBadge` component** — presentational `<span>` with `aria-label="Modul akses: ..."`, inline-flex layout, indigo border/background, `Modul` prefix label, and truncation for long values. Non-interactive to preserve the parent button's accessibility.

3. **Integration into left request list** — badge rendered between the email line and access-group chips on both pending and approved tabs.

4. **Module-aware search** — filter now searches across name, email, module label, and module search terms. Includes case-insensitive matching and empty-search passthrough.

5. **Focus-visible ring** — added `focus-visible:ring-2` to request buttons for keyboard accessibility.

### UX Decisions (per UI/UX Pro Max)

- Badge placed on its own row after email, before access groups, to maintain clear information hierarchy.
- Single color palette (indigo) for all module badges — two modules don't warrant categorical color coding.
- Text label always present — color is not the sole carrier of information.
- `Modul` prefix label prevents confusion with access-group chips.

## Files Changed

| File                                                                 | Action                                                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `apps/web/src/routes/dashboard/components/AccessModuleBadge.tsx`     | **Create** — helper + badge component                                           |
| `apps/web/src/routes/dashboard/access-approval.tsx`                  | **Modify** — render badge, extend search, update placeholder, add focus-visible |
| `apps/web/src/__tests__/access-approval-module-information.test.tsx` | **Create** — 16 regression tests                                                |
| `docs/rebuild-logs/phase-188-access-approval-module-information.md`  | **Create** — this document                                                      |
| `AGENTS.md`                                                          | **Modify** — add Phase 188 entry                                                |

## Test Results

- **16/16 tests passing** (pure helper mapping, component rendering, pending labels, approved labels, fallback, module search, `all` search via "semua modul", non-interactive badge, DOM hierarchy)
- **Lint**: 0 errors (warnings are pre-existing)
- **TypeScript**: no new type errors

## Verification

- No API, database, migration, shared types, or dependency changes.
- No mutation flow changes.
- Known behavior: searching `"SIDAK"` also matches `all` requests (semantically correct because `all` covers SIDAK).
- Rollback: revert frontend changes only — no data migration needed.

## Phase Progress

188. Access Approval Module Information — Added explicit KTP/SIDAK/KTP + SIDAK module badges to pending and approved request cards in the left list, module-aware search, accessible fallback handling, and frontend regression coverage. (DONE)

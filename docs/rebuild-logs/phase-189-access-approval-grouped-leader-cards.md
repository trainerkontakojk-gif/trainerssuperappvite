# Phase 189: Access Approval Grouped Leader Cards

## Problem

When a leader requests both KTP and SIDAK access, the left request list displayed two identical identity cards (same name, same email) differing only by module badge. This wasted vertical space and slowed scanning.

## Solution

**Group presentation by `leader_user_id`, keep mutations per request ID.**

### Backend Changes

- Added `leader_user_id` to `PendingLeaderRequest` and `ApprovedLeaderAccess` shared types.
- Updated Supabase select and map in both `getPendingLeaderRequests()` and `getApprovedLeaderRequests()`.
- No database migration or endpoint changes.

### Frontend Changes

1. **`groupLeaderAccessRequests()`** — Pure helper that groups `LeaderAccessRequest[]` by `leader_user_id` into `LeaderAccessRequestGroup[]`. Each group has a union module label (e.g., `KTP + SIDAK`), sorted requests by module priority (all > ktp > sidak > unknown), and deduplicated access-group names for card summary.

2. **`resolveDefaultRequest()`** — Pure helper that picks the active request from a group, preferring current request (if still valid), then KTP, then SIDAK.

3. **Grouped card rendering** — Left list now renders one card per leader group instead of one per request. Card shows:
   - Leader identity (name, email) once
   - Combined module label badge
   - Request count (when > 1)
   - "Terbaru" prefix when timestamps differ
   - Union access-group chips (max 2 visible + overflow)

4. **Module switcher** — Right panel shows a grid of module buttons when a group has multiple requests. Active state uses `aria-pressed`, border, and background (not color alone). Switching changes the active request and its access group assignments.

5. **Mutation isolation** — All approve/reject/revoke/update_groups operations use the active request ID only. Button copy includes the module name (e.g., "Setujui Akses SIDAK").

6. **`all` semantics** — A single `all` request renders as "KTP + SIDAK" badge. If `all` coexists with specific requests, a warning about overlapping coverage is shown.

7. **Refetch reconciliation** — After mutation, refetched data re-derives groups. If sibling requests remain, selection shifts to the next valid request. If the group disappears, selection is cleared.

### AccessModuleBadge Update

The component now accepts an optional `label` prop for direct label override, used by grouped cards for the combined coverage label.

## Files Changed

| File                                                                   | Action                                                           |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `packages/types/src/admin.ts`                                          | Modify — added `leader_user_id: string` to both interfaces       |
| `apps/api/src/services/admin-service.ts`                               | Modify — select and map `leader_user_id` in both read queries    |
| `apps/api/src/__tests__/admin-leader-request-read-contract.test.ts`    | **Create** — 2 API contract tests                                |
| `apps/web/src/routes/dashboard/access-approval-grouping.ts`            | **Create** — grouping helper + default request resolver          |
| `apps/web/src/routes/dashboard/access-approval.tsx`                    | **Rewrite** — grouped cards, module switcher, mutation isolation |
| `apps/web/src/routes/dashboard/components/AccessModuleBadge.tsx`       | Modify — support `label` override prop                           |
| `apps/web/src/__tests__/access-approval-grouping.test.ts`              | **Create** — 14 pure unit tests                                  |
| `apps/web/src/__tests__/access-approval-grouped-leader-cards.test.tsx` | **Create** — 7 UI integration tests                              |
| `apps/web/src/__tests__/access-approval-module-information.test.tsx`   | Modify — added `leader_user_id` to fixtures                      |
| `docs/rebuild-logs/phase-189-access-approval-grouped-leader-cards.md`  | **Create** — this document                                       |

## Test Results

- **2/2 API contract tests** — `leader_user_id` present in both endpoints
- **14/14 grouping unit tests** — grouping, ordering, coverage, `all`, union, deduplication
- **7/7 grouped card UI tests** — one card per leader, switcher, mutation isolation, approved tab
- **16/16 Phase 188 regression tests** — existing module label and search still work
- **Lint**: 0 errors (pre-existing warnings only)

## Verification

- No database migration or new endpoints.
- No bulk approval or mutation changes.
- `all` is one concrete request, never expanded into two pseudo-requests.
- `leader_user_id` is the canonical grouping key, not email or name.
- Phase 188 module badges and search behavior are preserved.

## Phase Progress

189. Access Approval Grouped Leader Cards — Consolidated KTP/SIDAK request rows into one Leader identity card using leader_user_id, added per-module detail switching, preserved request-level approval/revoke/group mutations, and added contract plus UI regression coverage. (DONE)

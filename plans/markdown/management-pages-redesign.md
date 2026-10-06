# Management pages redesign

Lane D — significant UI redesign + public API contract removal (`DELETE /v1/admin/activity-logs/:id`).

## Requirement

Redesign the four Management pages (`/dashboard/users`, `/dashboard/access-approval`,
`/dashboard/access-groups`, `/dashboard/activities`) so they share one structure and follow
`docs/design.md` (data-first, no decorative eyebrow badges, tokens only, no nested cards).

Decisions approved by Fajar (2026-10-06):

1. Activity logs become append-only: remove the delete UI, the `DELETE /v1/admin/activity-logs/:id`
   route, `deleteActivity()` and the `admin.activityLogs.delete` capability. The DB already grants
   `authenticated` only `SELECT, INSERT` on `activity_logs` (`004_admin_core.sql`), so no migration.
2. No new backend features. Bulk actions and an access-impact preview need new endpoints and are
   deferred. Existing endpoints (revoke, reassign groups) get clearer UI.
3. Implement directly (no mockup round).

Acceptance criteria:

- All four pages render inside a shared `ManagementShell`: one `h1`, one description line, an
  actions slot, and a section nav (`nav[aria-label="Navigasi manajemen"]`) listing only the pages
  the role can open, with `aria-current="page"` on the active one. Monitoring stays a separate module.
- No native `confirm()` remains on these pages; destructive actions use an in-app dialog.
- Users: a table (`Pengguna`, `Role`, `Status`, `Terdaftar`) with status filters and counts; pending
  rows offer an inline `Setujui`; `Kelola` opens a side panel holding role change, status actions,
  reset password and delete (admin-only, never self).
- Access approval: inbox split view; approve stays disabled until ≥1 group is selected; reject needs
  a note; revoking approved access goes through a dialog that requires a reason. On narrow screens
  the list and the detail are shown one at a time, with a back control.
- Access groups: the same split view; rules read as a sentence joined by "atau" (union scope); the
  remove-rule control is always visible (not hover-only) and confirmed by a dialog; create/edit
  uses the shared `Dialog`.
- Activity logs: a table grouped by day, with no delete control. Search, type filter, CSV export and
  refresh are kept.
- Existing behavior is preserved: status/role/reset/delete user endpoints, approval/reject/revoke/
  reassign flows, rule add/remove and group create/edit.

Non-goals: bulk actions, impact preview, server-side pagination, the Monitoring page, and changes to
the access matrix beyond the removed delete row.

## Design

- `apps/web/src/routes/dashboard/components/management/`
  - `ManagementShell.tsx`: layout, header and capability-filtered section nav (reuses
    `MANAGEMENT_LINKS` minus `/monitoring`, plus `isCapabilityAllowed`).
  - `ConfirmDialog.tsx`: wraps `components/ui/dialog`, with an optional required-reason textarea.
  - `SidePanel.tsx`: `Dialog` positioned as a right-hand sheet (full screen on mobile).
  - `StatusDot.tsx`: a dot plus a text label with a semantic tone (`success | warning | muted | danger`).
  - `SegmentedFilter.tsx`: a pressed-button filter group with optional counts.
- Typography: `font-display` for `h1`/panel titles, Inter for the body, `tabular-nums` for
  dates/counts. Colors come from tokens only (`foreground`, `muted-foreground`, `border`, `card`,
  `chart-*` for status tones).
- Motion: drop per-row framer-motion entry animations and hover scale; keep the default transitions.

## Tasklist

- [x] RED: `access-matrix-api.spec.ts` asserts `DELETE /v1/admin/activity-logs/:id` is unrouted (404)
      for every role; remove the matrix row.
- [x] RED: `activities.spec.ts` asserts there is no delete control and shows the management nav.
- [x] RED: `management-pages.spec.ts` (hermetic) covers the users table and side panel, the
      in-app confirm, approval approve-wiring plus the revoke reason dialog, and the access-groups
      rule sentence plus remove confirm.
- [x] GREEN: backend removal (route, service, capability, `docs/auth-rbac.md` row).
- [x] GREEN: shared components and the four pages.
- [x] Focused E2E green; web typecheck; root typecheck/lint/build; `git diff --check`.
- [x] `thermo-nuclear` review, `impeccable` audit, then `graphify update .`.

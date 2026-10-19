# Access groups view: security invoker

Lane D (RLS/grant migration).

## Requirement

Supabase advisor `security_definer_view` flags `public.v_access_groups_with_item_counts`.
The view ran with its owner's rights, and `authenticated` kept the default grant, so any
signed-in user (agent included) could read every access group through PostgREST, past the
admin/trainer RLS policy on `access_groups`.

## Design

- `alter view ... set (security_invoker = true)` so base-table RLS applies.
- Revoke the view from `public`, `anon`, `authenticated`; keep `select` for `service_role`.
- Only reader is `getAccessGroups()` (`apps/api/src/services/admin-service.ts`) via
  `supabaseAdmin`, so the API is unaffected. No data-loss risk.

## Tasklist

- [x] RED E2E `apps/web/e2e/access-groups-view-guard-api.spec.ts` (agent read the group).
- [x] Migration `20261020090000_access_groups_view_security_invoker.sql` + paired rollback.
- [x] Local GREEN, rollback round-trip back to RED, clean replay GREEN.
- [ ] Apply to remote/prod — needs Fajar's explicit OK.

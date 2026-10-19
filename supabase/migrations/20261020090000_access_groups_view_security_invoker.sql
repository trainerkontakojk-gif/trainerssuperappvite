-- Migration: make v_access_groups_with_item_counts respect the caller's RLS
-- Purpose: fix the Supabase advisor finding security_definer_view. The view ran
-- with its owner's rights, so any signed-in user could read every access group
-- through PostgREST. Only the backend reads it, as service_role.

alter view public.v_access_groups_with_item_counts set (security_invoker = true);

revoke all on public.v_access_groups_with_item_counts from public, anon, authenticated;
grant select on public.v_access_groups_with_item_counts to service_role;

notify pgrst, 'reload schema';

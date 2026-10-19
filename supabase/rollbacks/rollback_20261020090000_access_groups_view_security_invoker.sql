-- Rollback for 20261020090000_access_groups_view_security_invoker.sql: restores
-- the owner-rights view and the default authenticated grant. No data loss, but
-- it reopens the read of every access group to any signed-in user.
BEGIN;
ALTER VIEW public.v_access_groups_with_item_counts RESET (security_invoker);
GRANT ALL ON public.v_access_groups_with_item_counts TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;

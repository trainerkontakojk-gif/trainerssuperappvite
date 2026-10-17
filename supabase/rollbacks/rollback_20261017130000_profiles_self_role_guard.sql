-- Remove guard_profile_sensitive_columns and its function. Column grants on
-- profiles still block direct self-updates of role/status/is_deleted.
DROP TRIGGER IF EXISTS guard_profile_sensitive_columns ON public.profiles;
DROP FUNCTION IF EXISTS public.prevent_self_role_status_change();

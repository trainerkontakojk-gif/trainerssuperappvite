-- Capture the prod-only guard that stops users changing their own role,
-- status or is_deleted.
--
-- Prod (ruosnjmtywcrghjgqugz) has guard_profile_sensitive_columns, but no repo
-- migration creates it (phase-37 parity audit; prod readback 2026-10-17).
-- Column grants already block direct PostgREST updates of these columns; this
-- trigger also covers SECURITY DEFINER paths that carry the user's JWT.
-- Hardened versus prod: SECURITY INVOKER (it only edits NEW), empty
-- search_path, and EXECUTE revoked. Idempotent, so applying it to prod only
-- replaces the function body.

CREATE OR REPLACE FUNCTION public.prevent_self_role_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() = NEW.id THEN
    NEW.role := OLD.role;
    NEW.status := OLD.status;
    NEW.is_deleted := OLD.is_deleted;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger functions run without EXECUTE checks; nobody needs to call it.
REVOKE ALL ON FUNCTION public.prevent_self_role_status_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_profile_sensitive_columns ON public.profiles;
CREATE TRIGGER guard_profile_sensitive_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_role_status_change();

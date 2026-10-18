-- Rollback for 20261018210000_account_active_until.sql: restores the self-edit
-- guard from 20261017130000 and drops profiles.active_until. Revert the API
-- and web first: they read the column.
BEGIN;
CREATE OR REPLACE FUNCTION public.prevent_self_role_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() = NEW.id THEN
    NEW.role := OLD.role;
    NEW.status := OLD.status;
    NEW.is_deleted := OLD.is_deleted;
  END IF;
  RETURN NEW;
END;
$function$;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS active_until;
COMMIT;

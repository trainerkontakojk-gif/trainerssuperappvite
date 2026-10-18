-- Masa aktif akun (plans/markdown/kontrol-user-fase-5b.md): the last WIB day
-- an account may be used. NULL means no limit. Only the API (service role)
-- writes it; the API refuses an account whose day has passed and ends its
-- open logins. Safe to apply twice.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active_until date;

COMMENT ON COLUMN public.profiles.active_until IS
  'Last Asia/Jakarta day the account may sign in; NULL = no limit. Written by the API only.';

-- Users can only update full_name (column grant). Keep the self-edit guard
-- covering the new column too, in case a broader grant is ever added.
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
    NEW.active_until := OLD.active_until;
  END IF;
  RETURN NEW;
END;
$function$;

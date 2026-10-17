-- Capture the prod-only triggers that log finished simulation sessions.
--
-- Prod logs every insert into ketik_history, pdkt_history and telefun_history
-- to activity_logs through these triggers; the API does not log simulation
-- sessions itself. No repo migration created them (phase-37 parity audit;
-- prod readback 2026-10-17), so local and E2E databases never logged them.
-- Same rows as prod. SECURITY DEFINER stays because the inserting role may
-- not be allowed to write activity_logs; hardened with an empty search_path
-- and EXECUTE revoked. Idempotent.

CREATE OR REPLACE FUNCTION public.log_ketik_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_name text;
BEGIN
  SELECT p.full_name INTO v_user_name FROM public.profiles AS p WHERE p.id = NEW.user_id;
  INSERT INTO public.activity_logs (user_id, user_name, action, module, type)
  VALUES (NEW.user_id, COALESCE(v_user_name, 'Unknown User'),
          'menyelesaikan sesi Ketik: ' || COALESCE(NEW.scenario_title, ''), 'ketik', 'session');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_pdkt_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_name text;
BEGIN
  SELECT p.full_name INTO v_user_name FROM public.profiles AS p WHERE p.id = NEW.user_id;
  INSERT INTO public.activity_logs (user_id, user_name, action, module, type)
  VALUES (NEW.user_id, COALESCE(v_user_name, 'Unknown User'),
          'menyelesaikan sesi PDKT', 'pdkt', 'session');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_telefun_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_name text;
BEGIN
  SELECT p.full_name INTO v_user_name FROM public.profiles AS p WHERE p.id = NEW.user_id;
  INSERT INTO public.activity_logs (user_id, user_name, action, module, type)
  VALUES (NEW.user_id, COALESCE(v_user_name, 'Unknown User'),
          'menyelesaikan sesi Telefun', 'telefun', 'session');
  RETURN NEW;
END;
$$;

-- Trigger functions run without EXECUTE checks; nobody needs to call them.
REVOKE ALL ON FUNCTION public.log_ketik_activity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_pdkt_activity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_telefun_activity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_ketik_history_insert ON public.ketik_history;
CREATE TRIGGER on_ketik_history_insert
  AFTER INSERT ON public.ketik_history
  FOR EACH ROW EXECUTE FUNCTION public.log_ketik_activity();

DROP TRIGGER IF EXISTS on_pdkt_history_insert ON public.pdkt_history;
CREATE TRIGGER on_pdkt_history_insert
  AFTER INSERT ON public.pdkt_history
  FOR EACH ROW EXECUTE FUNCTION public.log_pdkt_activity();

DROP TRIGGER IF EXISTS on_telefun_history_insert ON public.telefun_history;
CREATE TRIGGER on_telefun_history_insert
  AFTER INSERT ON public.telefun_history
  FOR EACH ROW EXECUTE FUNCTION public.log_telefun_activity();

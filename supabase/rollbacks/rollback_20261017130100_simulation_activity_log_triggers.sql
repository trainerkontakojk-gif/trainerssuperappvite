-- Remove the simulation activity-log triggers and functions. Logged rows stay
-- in activity_logs; new simulation sessions are no longer logged.
DROP TRIGGER IF EXISTS on_ketik_history_insert ON public.ketik_history;
DROP TRIGGER IF EXISTS on_pdkt_history_insert ON public.pdkt_history;
DROP TRIGGER IF EXISTS on_telefun_history_insert ON public.telefun_history;
DROP FUNCTION IF EXISTS public.log_ketik_activity();
DROP FUNCTION IF EXISTS public.log_pdkt_activity();
DROP FUNCTION IF EXISTS public.log_telefun_activity();

-- Rollback for 20261019160000_efek_training_sessions.sql: drops the EFEK
-- functions and tables. Training sessions and participant lists are lost.
BEGIN;
DROP FUNCTION IF EXISTS public.efek_delete_session(uuid,uuid);
DROP FUNCTION IF EXISTS public.efek_save_sessions(uuid,jsonb,text);
DROP TABLE IF EXISTS public.efek_participants;
DROP TABLE IF EXISTS public.efek_sessions;
DROP TABLE IF EXISTS public.efek_programs;
NOTIFY pgrst, 'reload schema';
COMMIT;

-- Stop new session/turn writes first. Never discard active transcripts.
-- Finished history/scores remain; this rollback removes their provenance label.
BEGIN;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.ketik_sessions WHERE state='active') THEN
    RAISE EXCEPTION 'Finish or explicitly preserve active sessions before rollback';
  END IF;
END $$;
DROP FUNCTION public.finish_ketik_session(uuid,uuid);
DROP FUNCTION public.publish_ketik_session_turn(uuid,uuid,uuid,uuid,jsonb,boolean);
DROP FUNCTION public.claim_ketik_session_turn(uuid,uuid,uuid,integer,text,integer);
DROP FUNCTION public.start_ketik_session(uuid,uuid,jsonb,text,uuid);
DROP TABLE public.ketik_session_turns;
DROP TABLE public.ketik_sessions;
ALTER TABLE public.ketik_history DROP COLUMN transcript_provenance;
COMMIT;

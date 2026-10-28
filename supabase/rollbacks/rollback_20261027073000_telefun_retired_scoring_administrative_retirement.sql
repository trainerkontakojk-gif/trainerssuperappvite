BEGIN;

DROP FUNCTION IF EXISTS public.retire_telefun_openai_scoring(UUID, TEXT, JSONB);

NOTIFY pgrst, 'reload schema';
COMMIT;

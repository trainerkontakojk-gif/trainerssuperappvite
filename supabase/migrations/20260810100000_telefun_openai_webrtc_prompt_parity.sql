BEGIN;

-- WebRTC stores the already-built roleplay prompt as a create-only snapshot.
-- Existing rows and legacy transports retain the server fallback via NULL.
ALTER TABLE public.telefun_history
  ADD COLUMN IF NOT EXISTS live_prompt_instructions TEXT NULL DEFAULT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.telefun_history'::regclass
      AND conname = 'telefun_history_live_prompt_instructions_check'
  ) THEN
    ALTER TABLE public.telefun_history
      ADD CONSTRAINT telefun_history_live_prompt_instructions_check
      CHECK (
        live_prompt_instructions IS NULL
        OR char_length(btrim(live_prompt_instructions)) BETWEEN 1 AND 16000
      );
  END IF;
END
$$;

COMMIT;

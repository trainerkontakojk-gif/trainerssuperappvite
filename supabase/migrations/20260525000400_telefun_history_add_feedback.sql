-- Migration: Telefun history feedback column
-- Created At: 2026-05-25T17:00:00+07:00
-- Purpose: Align API/frontend Telefun session patch contract with production schema.

ALTER TABLE public.telefun_history
  ADD COLUMN IF NOT EXISTS feedback TEXT;

COMMENT ON COLUMN public.telefun_history.feedback
  IS 'Short user-facing Telefun session feedback summary shown in history/review UI.';

NOTIFY pgrst, 'reload schema';

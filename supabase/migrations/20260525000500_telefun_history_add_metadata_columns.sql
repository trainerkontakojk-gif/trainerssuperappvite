-- Migration: Telefun history add metadata columns
-- Created At: 2026-05-25T20:10:00+07:00
-- Purpose: Add configured_duration, response_pacing_mode, telefun_model_id, and telefun_transport to telefun_history.

ALTER TABLE public.telefun_history
  ADD COLUMN IF NOT EXISTS configured_duration INTEGER,
  ADD COLUMN IF NOT EXISTS response_pacing_mode TEXT,
  ADD COLUMN IF NOT EXISTS telefun_model_id TEXT,
  ADD COLUMN IF NOT EXISTS telefun_transport TEXT;

COMMENT ON COLUMN public.telefun_history.configured_duration IS 'The configured call limit duration in seconds.';
COMMENT ON COLUMN public.telefun_history.response_pacing_mode IS 'The voice pacing mode (realistic vs fast).';
COMMENT ON COLUMN public.telefun_history.telefun_model_id IS 'The specific Gemini or other model ID used.';
COMMENT ON COLUMN public.telefun_history.telefun_transport IS 'The underlying transport type (e.g. gemini-live).';

NOTIFY pgrst, 'reload schema';

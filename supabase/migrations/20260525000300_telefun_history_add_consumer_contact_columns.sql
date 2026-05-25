-- Migration: Telefun history schema guard for parity columns
-- Created At: 2026-05-25T12:31:00+07:00
-- Note: This migration is intentionally additive/idempotent to repair
-- environments with schema drift in telefun_history.

ALTER TABLE public.telefun_history
  ADD COLUMN IF NOT EXISTS consumer_phone TEXT;

ALTER TABLE public.telefun_history
  ADD COLUMN IF NOT EXISTS consumer_city TEXT;

ALTER TABLE public.telefun_history
  ADD COLUMN IF NOT EXISTS recording_path TEXT;

ALTER TABLE public.telefun_history
  ADD COLUMN IF NOT EXISTS agent_recording_path TEXT;

ALTER TABLE public.telefun_history
  ADD COLUMN IF NOT EXISTS voice_assessment JSONB;

ALTER TABLE public.telefun_history
  ADD COLUMN IF NOT EXISTS session_metrics JSONB;

ALTER TABLE public.telefun_history
  ADD COLUMN IF NOT EXISTS voice_dashboard_metrics JSONB;

ALTER TABLE public.telefun_history
  ADD COLUMN IF NOT EXISTS disruption_config JSONB;

ALTER TABLE public.telefun_history
  ADD COLUMN IF NOT EXISTS disruption_results JSONB;

ALTER TABLE public.telefun_history
  ADD COLUMN IF NOT EXISTS persona_config JSONB;

ALTER TABLE public.telefun_history
  ADD COLUMN IF NOT EXISTS realistic_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE;

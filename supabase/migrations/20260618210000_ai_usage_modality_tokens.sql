-- Migration 20260618210000: Add modality token/rate columns to ai_usage_logs
-- Adds fine-grained modality tracking for Gemini Live sessions.
-- Nullable columns preserve unknown-vs-zero semantics for historical rows.

ALTER TABLE public.ai_usage_logs
  ADD COLUMN IF NOT EXISTS input_text_tokens integer,
  ADD COLUMN IF NOT EXISTS input_audio_tokens integer,
  ADD COLUMN IF NOT EXISTS input_unspecified_tokens integer,
  ADD COLUMN IF NOT EXISTS output_text_tokens integer,
  ADD COLUMN IF NOT EXISTS output_audio_tokens integer,
  ADD COLUMN IF NOT EXISTS output_unspecified_tokens integer,
  ADD COLUMN IF NOT EXISTS input_text_price_usd_per_million numeric,
  ADD COLUMN IF NOT EXISTS input_audio_price_usd_per_million numeric,
  ADD COLUMN IF NOT EXISTS output_text_price_usd_per_million numeric,
  ADD COLUMN IF NOT EXISTS output_audio_price_usd_per_million numeric,
  ADD COLUMN IF NOT EXISTS raw_usage_metadata jsonb;

-- Rollback manual:
-- ALTER TABLE public.ai_usage_logs
--   DROP COLUMN IF EXISTS input_text_tokens,
--   DROP COLUMN IF EXISTS input_audio_tokens,
--   DROP COLUMN IF EXISTS input_unspecified_tokens,
--   DROP COLUMN IF EXISTS output_text_tokens,
--   DROP COLUMN IF EXISTS output_audio_tokens,
--   DROP COLUMN IF EXISTS output_unspecified_tokens,
--   DROP COLUMN IF EXISTS input_text_price_usd_per_million,
--   DROP COLUMN IF EXISTS input_audio_price_usd_per_million,
--   DROP COLUMN IF EXISTS output_text_price_usd_per_million,
--   DROP COLUMN IF EXISTS output_audio_price_usd_per_million,
--   DROP COLUMN IF EXISTS raw_usage_metadata;

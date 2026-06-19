-- Migration 20260619090000: Add Telefun Live per-minute billing audit columns.
-- Nullable columns preserve historical rows and staged deploy compatibility.

ALTER TABLE public.ai_usage_logs
  ADD COLUMN IF NOT EXISTS session_duration_ms integer,
  ADD COLUMN IF NOT EXISTS per_minute_cost_usd numeric,
  ADD COLUMN IF NOT EXISTS per_minute_cost_idr numeric,
  ADD COLUMN IF NOT EXISTS final_cost_usd numeric,
  ADD COLUMN IF NOT EXISTS final_cost_idr numeric;

COMMENT ON COLUMN public.ai_usage_logs.session_duration_ms IS
  'Telefun Live session duration in milliseconds used for per-minute audio billing.';
COMMENT ON COLUMN public.ai_usage_logs.per_minute_cost_usd IS
  'Gemini Live duration-based audio cost in USD before MAX(per-token, per-minute).';
COMMENT ON COLUMN public.ai_usage_logs.per_minute_cost_idr IS
  'Gemini Live duration-based audio cost in IDR using the row usd_to_idr_rate.';
COMMENT ON COLUMN public.ai_usage_logs.final_cost_usd IS
  'Billable estimated cost in USD after MAX(per-token, per-minute) for Live models.';
COMMENT ON COLUMN public.ai_usage_logs.final_cost_idr IS
  'Billable estimated cost in IDR after MAX(per-token, per-minute) for Live models.';

ALTER TABLE public.ai_usage_logs
  ADD COLUMN IF NOT EXISTS live_turn_count integer,
  ADD COLUMN IF NOT EXISTS latest_input_tokens integer,
  ADD COLUMN IF NOT EXISTS latest_output_tokens integer,
  ADD COLUMN IF NOT EXISTS latest_total_tokens integer,
  ADD COLUMN IF NOT EXISTS context_rebilled_cost_usd numeric,
  ADD COLUMN IF NOT EXISTS context_rebilled_cost_idr numeric;

COMMENT ON COLUMN public.ai_usage_logs.live_turn_count IS
  'Number of committed billable usage snapshots in a Telefun Live session.';
COMMENT ON COLUMN public.ai_usage_logs.latest_input_tokens IS
  'Latest provider snapshot promptTokenCount for audit/debugging.';
COMMENT ON COLUMN public.ai_usage_logs.latest_output_tokens IS
  'Latest provider snapshot responseTokenCount for audit/debugging.';
COMMENT ON COLUMN public.ai_usage_logs.latest_total_tokens IS
  'Latest provider snapshot totalTokenCount for audit/debugging.';
COMMENT ON COLUMN public.ai_usage_logs.context_rebilled_cost_usd IS
  'Context-window re-billed token cost in USD (sum of per-turn charges).';
COMMENT ON COLUMN public.ai_usage_logs.context_rebilled_cost_idr IS
  'Context-window re-billed token cost in IDR.';

CREATE OR REPLACE VIEW public.v_ai_usage_recomputed_costs
WITH (security_invoker = true) AS
WITH base AS (
  SELECT
    l.*,
    CASE
      WHEN COALESCE(l.input_text_tokens, 0) + COALESCE(l.input_audio_tokens, 0) +
           COALESCE(l.input_unspecified_tokens, 0) + COALESCE(l.output_text_tokens, 0) +
           COALESCE(l.output_audio_tokens, 0) + COALESCE(l.output_unspecified_tokens, 0) > 0
      THEN ROUND((
        (COALESCE(l.input_text_tokens, 0)::numeric / 1000000) *
          COALESCE(l.input_text_price_usd_per_million, l.input_price_usd_per_million) +
        (COALESCE(l.input_audio_tokens, 0)::numeric / 1000000) *
          COALESCE(l.input_audio_price_usd_per_million, l.input_price_usd_per_million) +
        (COALESCE(l.input_unspecified_tokens, 0)::numeric / 1000000) *
          l.input_price_usd_per_million +
        (COALESCE(l.output_text_tokens, 0)::numeric / 1000000) *
          COALESCE(l.output_text_price_usd_per_million, l.output_price_usd_per_million) +
        (COALESCE(l.output_audio_tokens, 0)::numeric / 1000000) *
          COALESCE(l.output_audio_price_usd_per_million, l.output_price_usd_per_million) +
        (COALESCE(l.output_unspecified_tokens, 0)::numeric / 1000000) *
          l.output_price_usd_per_million
      ), 6)
      ELSE l.estimated_cost_usd
    END AS recomputed_per_token_cost_usd,
    CASE
      WHEN LOWER(COALESCE(l.model_id, '')) LIKE '%live%' AND l.session_duration_ms IS NOT NULL
      THEN ROUND(((GREATEST(l.session_duration_ms, 0)::numeric / 60000) * (0.005 + 0.018)), 6)
      ELSE NULL
    END AS recomputed_per_minute_cost_usd
  FROM public.ai_usage_logs l
),
costs AS (
  SELECT
    b.*,
    ROUND((b.recomputed_per_token_cost_usd * b.usd_to_idr_rate), 0) AS recomputed_per_token_cost_idr,
    CASE
      WHEN b.recomputed_per_minute_cost_usd IS NULL THEN NULL
      ELSE ROUND((b.recomputed_per_minute_cost_usd * b.usd_to_idr_rate), 0)
    END AS recomputed_per_minute_cost_idr,
    GREATEST(
      b.recomputed_per_token_cost_usd,
      COALESCE(b.recomputed_per_minute_cost_usd, 0)
    ) AS recomputed_final_cost_usd
  FROM base b
)
SELECT
  id,
  request_id,
  user_id,
  module,
  action,
  model_id,
  input_tokens,
  output_tokens,
  total_tokens,
  input_price_usd_per_million,
  output_price_usd_per_million,
  usd_to_idr_rate,
  estimated_cost_usd AS logged_cost_usd,
  estimated_cost_idr AS logged_cost_idr,
  input_text_tokens,
  input_audio_tokens,
  input_unspecified_tokens,
  output_text_tokens,
  output_audio_tokens,
  output_unspecified_tokens,
  input_text_price_usd_per_million,
  input_audio_price_usd_per_million,
  output_text_price_usd_per_million,
  output_audio_price_usd_per_million,
  raw_usage_metadata,
  ROUND((recomputed_final_cost_usd * usd_to_idr_rate), 0) AS recomputed_cost_idr,
  CASE
    WHEN estimated_cost_idr = 0 THEN NULL
    ELSE ROUND((
      (ROUND((recomputed_final_cost_usd * usd_to_idr_rate), 0) - estimated_cost_idr)
      / estimated_cost_idr
    ) * 100, 2)
  END AS cost_delta_percent,
  created_at,
  session_duration_ms,
  per_minute_cost_usd AS logged_per_minute_cost_usd,
  per_minute_cost_idr AS logged_per_minute_cost_idr,
  final_cost_usd AS logged_final_cost_usd,
  final_cost_idr AS logged_final_cost_idr,
  recomputed_per_token_cost_usd,
  recomputed_per_token_cost_idr,
  recomputed_per_minute_cost_usd,
  recomputed_per_minute_cost_idr,
  recomputed_final_cost_usd,
  ROUND((recomputed_final_cost_usd * usd_to_idr_rate), 0) AS recomputed_final_cost_idr,
  CASE
    WHEN COALESCE(final_cost_idr, estimated_cost_idr, 0) = 0 THEN NULL
    ELSE ROUND((
      (ROUND((recomputed_final_cost_usd * usd_to_idr_rate), 0) -
        COALESCE(final_cost_idr, estimated_cost_idr))
      / COALESCE(final_cost_idr, estimated_cost_idr)
    ) * 100, 2)
  END AS final_cost_delta_percent,
  live_turn_count,
  latest_input_tokens,
  latest_output_tokens,
  latest_total_tokens,
  context_rebilled_cost_usd,
  context_rebilled_cost_idr
FROM costs;

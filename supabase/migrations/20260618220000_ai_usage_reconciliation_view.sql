-- Migration: Add reconciliation view for per-modality billing audit
-- View recomputes costs using current pricing and modality token breakdown.
-- Does NOT modify existing data — read-only view for dashboard/audit use.

CREATE OR REPLACE VIEW public.v_ai_usage_recomputed_costs
WITH (security_invoker = true) AS
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
  -- Recomputed cost uses modality breakdown when available, falls back to flat pricing
  CASE
    WHEN COALESCE(input_text_tokens, 0) + COALESCE(input_audio_tokens, 0) +
         COALESCE(input_unspecified_tokens, 0) + COALESCE(output_text_tokens, 0) +
         COALESCE(output_audio_tokens, 0) + COALESCE(output_unspecified_tokens, 0) > 0
    THEN ROUND((
      (COALESCE(input_text_tokens, 0)::numeric / 1000000) *
        COALESCE(input_text_price_usd_per_million, input_price_usd_per_million) +
      (COALESCE(input_audio_tokens, 0)::numeric / 1000000) *
        COALESCE(input_audio_price_usd_per_million, input_price_usd_per_million) +
      (COALESCE(input_unspecified_tokens, 0)::numeric / 1000000) *
        input_price_usd_per_million +
      (COALESCE(output_text_tokens, 0)::numeric / 1000000) *
        COALESCE(output_text_price_usd_per_million, output_price_usd_per_million) +
      (COALESCE(output_audio_tokens, 0)::numeric / 1000000) *
        COALESCE(output_audio_price_usd_per_million, output_price_usd_per_million) +
      (COALESCE(output_unspecified_tokens, 0)::numeric / 1000000) *
        output_price_usd_per_million
    ) * usd_to_idr_rate, 0)
    ELSE estimated_cost_idr
  END AS recomputed_cost_idr,
  CASE
    WHEN estimated_cost_idr = 0 THEN NULL
    ELSE ROUND((
      (
        CASE
          WHEN COALESCE(input_text_tokens, 0) + COALESCE(input_audio_tokens, 0) +
               COALESCE(input_unspecified_tokens, 0) + COALESCE(output_text_tokens, 0) +
               COALESCE(output_audio_tokens, 0) + COALESCE(output_unspecified_tokens, 0) > 0
          THEN ROUND((
            (COALESCE(input_text_tokens, 0)::numeric / 1000000) *
              COALESCE(input_text_price_usd_per_million, input_price_usd_per_million) +
            (COALESCE(input_audio_tokens, 0)::numeric / 1000000) *
              COALESCE(input_audio_price_usd_per_million, input_price_usd_per_million) +
            (COALESCE(input_unspecified_tokens, 0)::numeric / 1000000) *
              input_price_usd_per_million +
            (COALESCE(output_text_tokens, 0)::numeric / 1000000) *
              COALESCE(output_text_price_usd_per_million, output_price_usd_per_million) +
            (COALESCE(output_audio_tokens, 0)::numeric / 1000000) *
              COALESCE(output_audio_price_usd_per_million, output_price_usd_per_million) +
            (COALESCE(output_unspecified_tokens, 0)::numeric / 1000000) *
              output_price_usd_per_million
          ) * usd_to_idr_rate, 0)
          ELSE estimated_cost_idr
        END - estimated_cost_idr
      ) / estimated_cost_idr
    ) * 100, 2)
  END AS cost_delta_percent,
  created_at
FROM public.ai_usage_logs;

-- Rollback:
-- DROP VIEW IF EXISTS public.v_ai_usage_recomputed_costs;

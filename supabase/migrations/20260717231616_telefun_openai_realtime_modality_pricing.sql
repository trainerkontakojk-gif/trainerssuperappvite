-- Add modality-aware pricing and cached-token usage snapshots for Telefun
-- OpenAI Realtime models. All columns stay nullable so historical rows retain
-- unknown-vs-zero semantics and legacy two-rate readers remain compatible.

ALTER TABLE public.ai_pricing_settings
  ADD COLUMN IF NOT EXISTS input_text_price_usd_per_million numeric,
  ADD COLUMN IF NOT EXISTS cached_input_text_price_usd_per_million numeric,
  ADD COLUMN IF NOT EXISTS input_audio_price_usd_per_million numeric,
  ADD COLUMN IF NOT EXISTS cached_input_audio_price_usd_per_million numeric,
  ADD COLUMN IF NOT EXISTS output_text_price_usd_per_million numeric,
  ADD COLUMN IF NOT EXISTS output_audio_price_usd_per_million numeric;

ALTER TABLE public.ai_usage_logs
  ADD COLUMN IF NOT EXISTS cached_input_tokens integer,
  ADD COLUMN IF NOT EXISTS cached_input_text_tokens integer,
  ADD COLUMN IF NOT EXISTS cached_input_audio_tokens integer,
  ADD COLUMN IF NOT EXISTS cached_input_text_price_usd_per_million numeric,
  ADD COLUMN IF NOT EXISTS cached_input_audio_price_usd_per_million numeric,
  ADD COLUMN IF NOT EXISTS billing_model text;

COMMENT ON COLUMN public.ai_pricing_settings.cached_input_text_price_usd_per_million IS
  'Cached text input price in USD per one million tokens.';
COMMENT ON COLUMN public.ai_pricing_settings.cached_input_audio_price_usd_per_million IS
  'Cached audio input price in USD per one million tokens.';
COMMENT ON COLUMN public.ai_usage_logs.cached_input_text_tokens IS
  'Provider-reported cached text input tokens; NULL means unavailable.';
COMMENT ON COLUMN public.ai_usage_logs.cached_input_audio_tokens IS
  'Provider-reported cached audio input tokens; NULL means unavailable.';
COMMENT ON COLUMN public.ai_usage_logs.cached_input_tokens IS
  'Provider-reported total cached input tokens; validates the modality breakdown.';
COMMENT ON COLUMN public.ai_usage_logs.billing_model IS
  'Versioned application billing interpretation used for this usage snapshot.';

-- Flat input/output rates are compatibility values for legacy readers. The six
-- modality rates below are authoritative for OpenAI Realtime reconciliation.
INSERT INTO public.ai_pricing_settings AS current_pricing (
  model_id,
  input_price_usd_per_million,
  output_price_usd_per_million,
  input_text_price_usd_per_million,
  cached_input_text_price_usd_per_million,
  input_audio_price_usd_per_million,
  cached_input_audio_price_usd_per_million,
  output_text_price_usd_per_million,
  output_audio_price_usd_per_million
)
VALUES
  ('gpt-realtime-2.1', 4.00, 24.00, 4.00, 0.40, 32.00, 0.40, 24.00, 64.00),
  ('gpt-realtime-2.1-mini', 0.60, 2.40, 0.60, 0.06, 10.00, 0.30, 2.40, 20.00)
ON CONFLICT (model_id) DO UPDATE
SET
  input_price_usd_per_million = current_pricing.input_price_usd_per_million,
  output_price_usd_per_million = current_pricing.output_price_usd_per_million,
  input_text_price_usd_per_million = COALESCE(current_pricing.input_text_price_usd_per_million, EXCLUDED.input_text_price_usd_per_million),
  cached_input_text_price_usd_per_million = COALESCE(current_pricing.cached_input_text_price_usd_per_million, EXCLUDED.cached_input_text_price_usd_per_million),
  input_audio_price_usd_per_million = COALESCE(current_pricing.input_audio_price_usd_per_million, EXCLUDED.input_audio_price_usd_per_million),
  cached_input_audio_price_usd_per_million = COALESCE(current_pricing.cached_input_audio_price_usd_per_million, EXCLUDED.cached_input_audio_price_usd_per_million),
  output_text_price_usd_per_million = COALESCE(current_pricing.output_text_price_usd_per_million, EXCLUDED.output_text_price_usd_per_million),
  output_audio_price_usd_per_million = COALESCE(current_pricing.output_audio_price_usd_per_million, EXCLUDED.output_audio_price_usd_per_million),
  updated_at = now();

-- Preserve the existing reconciliation-view column order. New cached/provider
-- audit columns are appended so CREATE OR REPLACE remains compatible with the
-- deployed view contract.
CREATE OR REPLACE VIEW public.v_ai_usage_recomputed_costs
WITH (security_invoker = true) AS
WITH classified AS (
  SELECT
    l.*,
    CASE
      WHEN l.provider <> 'openai' THEN true
      WHEN l.input_text_tokens IS NULL OR l.input_audio_tokens IS NULL THEN false
      WHEN COALESCE(l.input_text_tokens, 0) + COALESCE(l.input_audio_tokens, 0) <> l.input_tokens THEN false
      WHEN l.output_text_tokens IS NULL OR l.output_audio_tokens IS NULL THEN false
      WHEN COALESCE(l.output_text_tokens, 0) + COALESCE(l.output_audio_tokens, 0) <> l.output_tokens THEN false
      WHEN l.input_tokens + l.output_tokens <> l.total_tokens THEN false
      WHEN l.cached_input_tokens IS NULL THEN false
      WHEN l.cached_input_tokens = 0 THEN
        COALESCE(l.cached_input_text_tokens, 0) = 0 AND
        COALESCE(l.cached_input_audio_tokens, 0) = 0
      WHEN l.cached_input_text_tokens IS NULL OR l.cached_input_audio_tokens IS NULL THEN false
      WHEN COALESCE(l.cached_input_text_tokens, 0) + COALESCE(l.cached_input_audio_tokens, 0) <> l.cached_input_tokens THEN false
      WHEN l.cached_input_text_tokens > COALESCE(l.input_text_tokens, 0) THEN false
      WHEN l.cached_input_audio_tokens > COALESCE(l.input_audio_tokens, 0) THEN false
      ELSE true
    END AS openai_usage_breakdown_valid
  FROM public.ai_usage_logs l
),
base AS (
  SELECT
    l.*,
    CASE
      WHEN NOT openai_usage_breakdown_valid THEN NULL
      WHEN COALESCE(l.input_text_tokens, 0) +
           COALESCE(l.input_audio_tokens, 0) +
           COALESCE(l.input_unspecified_tokens, 0) +
           COALESCE(l.cached_input_text_tokens, 0) +
           COALESCE(l.cached_input_audio_tokens, 0) +
           COALESCE(l.output_text_tokens, 0) +
           COALESCE(l.output_audio_tokens, 0) +
           COALESCE(l.output_unspecified_tokens, 0) > 0
      THEN ROUND((
        (GREATEST(COALESCE(l.input_text_tokens, 0) - COALESCE(l.cached_input_text_tokens, 0), 0)::numeric / 1000000) *
          COALESCE(l.input_text_price_usd_per_million, l.input_price_usd_per_million) +
        (COALESCE(l.cached_input_text_tokens, 0)::numeric / 1000000) *
          COALESCE(l.cached_input_text_price_usd_per_million, l.input_text_price_usd_per_million) +
        (GREATEST(COALESCE(l.input_audio_tokens, 0) - COALESCE(l.cached_input_audio_tokens, 0), 0)::numeric / 1000000) *
          COALESCE(l.input_audio_price_usd_per_million, l.input_price_usd_per_million) +
        (COALESCE(l.cached_input_audio_tokens, 0)::numeric / 1000000) *
          COALESCE(l.cached_input_audio_price_usd_per_million, l.input_audio_price_usd_per_million) +
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
      WHEN l.provider = 'gemini'
        AND l.model_id IN (
          'gemini-3.1-flash-live-preview',
          'gemini-3.0-flash-live-preview'
        )
        AND l.session_duration_ms IS NOT NULL
      THEN ROUND(((GREATEST(l.session_duration_ms, 0)::numeric / 60000) * (0.005 + 0.018)), 6)
      ELSE NULL
    END AS recomputed_per_minute_cost_usd
  FROM classified l
),
costs AS (
  SELECT
    b.*,
    ROUND((b.recomputed_per_token_cost_usd * b.usd_to_idr_rate), 0) AS recomputed_per_token_cost_idr,
    CASE
      WHEN b.recomputed_per_minute_cost_usd IS NULL THEN NULL
      ELSE ROUND((b.recomputed_per_minute_cost_usd * b.usd_to_idr_rate), 0)
    END AS recomputed_per_minute_cost_idr,
    CASE
      WHEN b.recomputed_per_token_cost_usd IS NULL THEN NULL
      ELSE GREATEST(
        b.recomputed_per_token_cost_usd,
        COALESCE(b.recomputed_per_minute_cost_usd, 0)
      )
    END AS recomputed_final_cost_usd
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
  context_rebilled_cost_idr,
  provider,
  billing_model,
  cached_input_tokens,
  cached_input_text_tokens,
  cached_input_audio_tokens,
  cached_input_text_price_usd_per_million,
  cached_input_audio_price_usd_per_million
FROM costs;

-- Existing RLS policies and grants on the underlying tables are intentionally
-- unchanged. security_invoker keeps view reads bound to those caller rights.

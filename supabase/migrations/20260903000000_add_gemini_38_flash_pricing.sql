-- Migration: Add Gemini 3.8 Flash pricing (replaces Gemini 3.7 Flash) and backfill current-month usage
-- Context: Gemini 3.7 Flash was renamed to Gemini 3.8 Flash in TEXT_MODELS. Production
-- ai_pricing_settings still lacks a row for gemini-3.8-flash, so logAiUsage falls back to
-- 0 cost and monthly usage dashboards appear stagnant.
-- Official pricing (ai.google.dev, Paid Tier Standard Global, verified 2026-09-03):
--   gemini-3.8-flash: $0.75 / $3.75 (intro thru 2026-12-31), then $1.50 / $7.50 from 2027-01-01
--   Identical to gemini-3.7-flash intro rates. Batch/Flex tier ($0.375/$1.875) NOT used.

-- 1. Migrate pricing from legacy gemini-3.7-flash if an operator customized it
INSERT INTO public.ai_pricing_settings (
  model_id,
  input_price_usd_per_million,
  output_price_usd_per_million,
  input_text_price_usd_per_million,
  cached_input_text_price_usd_per_million,
  input_audio_price_usd_per_million,
  cached_input_audio_price_usd_per_million,
  output_text_price_usd_per_million,
  output_audio_price_usd_per_million,
  updated_at
)
SELECT
  'gemini-3.8-flash',
  input_price_usd_per_million,
  output_price_usd_per_million,
  input_text_price_usd_per_million,
  cached_input_text_price_usd_per_million,
  input_audio_price_usd_per_million,
  cached_input_audio_price_usd_per_million,
  output_text_price_usd_per_million,
  output_audio_price_usd_per_million,
  now()
FROM public.ai_pricing_settings
WHERE model_id = 'gemini-3.7-flash'
ON CONFLICT (model_id) DO NOTHING;

-- 2. Ensure canonical row (idempotent, keeps existing custom rates)
INSERT INTO public.ai_pricing_settings (model_id, input_price_usd_per_million, output_price_usd_per_million, updated_at)
VALUES
  ('gemini-3.8-flash', 0.75, 3.75, now())
ON CONFLICT (model_id) DO NOTHING;

-- 3. Correct stale/incorrect prices from earlier seeds
WITH correct_pricing(model_id, input_price, output_price) AS (
  VALUES
    ('gemini-3.8-flash', 0.75, 3.75)
)
UPDATE public.ai_pricing_settings p
SET input_price_usd_per_million = c.input_price,
    output_price_usd_per_million = c.output_price,
    updated_at = now()
FROM correct_pricing c
WHERE p.model_id = c.model_id
  AND (p.input_price_usd_per_million IS DISTINCT FROM c.input_price
    OR p.output_price_usd_per_million IS DISTINCT FROM c.output_price);

-- 4. Backfill current WIB month usage where cost is 0 but tokens are positive.
DO $$
DECLARE
  v_usd_to_idr numeric;
  v_month_start timestamptz;
  v_month_end timestamptz;
BEGIN
  BEGIN
    SELECT usd_to_idr_rate INTO v_usd_to_idr
    FROM public.ai_billing_settings
    WHERE key = 'default'
    LIMIT 1;
  EXCEPTION WHEN undefined_column THEN
    v_usd_to_idr := NULL;
  END;

  IF v_usd_to_idr IS NULL THEN
    SELECT usd_to_idr_rate INTO v_usd_to_idr
    FROM public.ai_billing_settings
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_usd_to_idr IS NULL THEN
    v_usd_to_idr := 15000;
  END IF;

  SELECT
    (date_trunc('month', (now() AT TIME ZONE 'Asia/Jakarta')) AT TIME ZONE 'Asia/Jakarta'),
    ((date_trunc('month', (now() AT TIME ZONE 'Asia/Jakarta')) + interval '1 month - 1 millisecond') AT TIME ZONE 'Asia/Jakarta')
  INTO v_month_start, v_month_end;

  -- Backfill flat pricing models (gemini-3.8-flash and legacy 3.7 / 3.6 aliases)
  UPDATE public.ai_usage_logs l
  SET
    input_price_usd_per_million = p.input_price_usd_per_million,
    output_price_usd_per_million = p.output_price_usd_per_million,
    usd_to_idr_rate = v_usd_to_idr,
    estimated_cost_usd = ROUND(
      (l.input_tokens::numeric / 1000000) * p.input_price_usd_per_million +
      (l.output_tokens::numeric / 1000000) * p.output_price_usd_per_million
    , 6),
    estimated_cost_idr = ROUND(
      (
        (l.input_tokens::numeric / 1000000) * p.input_price_usd_per_million +
        (l.output_tokens::numeric / 1000000) * p.output_price_usd_per_million
      ) * v_usd_to_idr
    , 0)
  FROM public.ai_pricing_settings p
  WHERE p.model_id = 'gemini-3.8-flash'
    AND l.model_id IN ('gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash')
    AND l.estimated_cost_idr = 0
    AND l.total_tokens > 0
    AND l.created_at >= v_month_start
    AND l.created_at <= v_month_end
    AND l.status = 'success';

  RAISE NOTICE 'Backfill completed for WIB month % to % with kurs %', v_month_start, v_month_end, v_usd_to_idr;
END $$;

-- 5. Ensure PostgREST schema cache reload (mirrors other migrations)
NOTIFY pgrst, 'reload schema';

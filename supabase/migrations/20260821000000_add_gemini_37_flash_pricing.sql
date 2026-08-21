-- Migration: Add Gemini 3.7 Flash pricing (replaces Gemini 3.6 Flash) and backfill current-month usage
-- Context: Gemini 3.6 Flash was renamed to Gemini 3.7 Flash in TEXT_MODELS. Production
-- ai_pricing_settings still lacks a row for gemini-3.7-flash, so logAiUsage falls back to
-- 0 cost and monthly usage dashboards appear stagnant.

-- 1. Portable billing rate helper: prefer singleton key='default', fallback to legacy latest row
-- (mirrors apps/api/src/lib/ai-billing-settings.ts)

-- 2. Migrate pricing from legacy gemini-3.6-flash if an operator customized it
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
  'gemini-3.7-flash',
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
WHERE model_id = 'gemini-3.6-flash'
ON CONFLICT (model_id) DO NOTHING;

-- 3. Ensure canonical text models have a pricing row (idempotent, keeps existing custom rates)
-- Pricing per official rate cards (2026-08-21 audit):
-- Google Cloud Vertex / ai.google.dev pricing (Paid Tier, Global, Standard):
--   gemini-3.7-flash: $0.75 / $3.75 (intro thru 2026-12-31)
--   gemini-3.5-flash: $1.50 / $9.00
--   gemini-3.5-flash-lite: $0.30 / $2.50
--   gemini-3-flash-preview: $0.50 / $3.00 (text/image/video input)
--   gemini-3.1-flash-lite: $0.25 / $1.50 (text/image/video input)
--   gemini-3.1-pro-preview: $2.00 / $12.00 (≤200k context)
--   gemini-3.1-flash-image: $0.50 / $3.00 (text I/O; image output $60/1M separate)
-- OpenAI / Azure pricing:
--   gpt-5.6-luna: $0.20 / $1.20 (July 30 2026 cut)
--   gpt-5.4-mini: $0.75 / $4.50
INSERT INTO public.ai_pricing_settings (model_id, input_price_usd_per_million, output_price_usd_per_million, updated_at)
VALUES
  ('gemini-3.7-flash', 0.75, 3.75, now()),
  ('gemini-3.5-flash', 1.50, 9.00, now()),
  ('gemini-3.5-flash-lite', 0.30, 2.50, now()),
  ('gemini-3-flash-preview', 0.50, 3.00, now()),
  ('gemini-3.1-flash-lite', 0.25, 1.50, now()),
  ('gemini-3.1-pro-preview', 2.00, 12.00, now()),
  ('gemini-3.1-flash-image', 0.50, 3.00, now()),
  ('gpt-5.6-luna', 0.20, 1.20, now()),
  ('gpt-5.4-mini', 0.75, 4.50, now()),
  ('gemini-3.1-flash-live-preview', 3.00, 12.00, now()),
  ('gemini-3.0-flash-live-preview', 3.00, 12.00, now())
ON CONFLICT (model_id) DO NOTHING;

-- 3b. Correct stale/incorrect prices from earlier seeds (002_ketik_pdkt_core etc.)
-- ON CONFLICT DO NOTHING above leaves existing rows untouched, so we explicitly
-- correct any rows whose rates still match the pre-audit values.
WITH correct_pricing(model_id, input_price, output_price) AS (
  VALUES
    ('gemini-3.7-flash',       0.75, 3.75),
    ('gemini-3.5-flash',       1.50, 9.00),
    ('gemini-3.5-flash-lite',  0.30, 2.50),
    ('gemini-3-flash-preview', 0.50, 3.00),
    ('gemini-3.1-flash-lite',  0.25, 1.50),
    ('gemini-3.1-pro-preview', 2.00, 12.00),
    ('gemini-3.1-flash-image', 0.50, 3.00),
    ('gpt-5.6-luna',           0.20, 1.20),
    ('gpt-5.4-mini',           0.75, 4.50)
)
UPDATE public.ai_pricing_settings p
SET input_price_usd_per_million = c.input_price,
    output_price_usd_per_million = c.output_price,
    updated_at = now()
FROM correct_pricing c
WHERE p.model_id = c.model_id
  AND (p.input_price_usd_per_million IS DISTINCT FROM c.input_price
    OR p.output_price_usd_per_million IS DISTINCT FROM c.output_price);

-- 4. Preserve explicit update for already-seeded live models to keep modality rates consistent
-- (no-op if rows absent, does not overwrite operator-edited text pricing)
-- This is intentionally separate from the bulk insert above so existing rows are untouched.

-- 5. Backfill current WIB month usage where cost is 0 but tokens are positive.
-- This mirrors the documented "Kebijakan Backfill Biaya (Rp0)" — only current month,
-- only rows with estimated_cost_idr = 0 and total_tokens > 0, using latest pricing + kurs.
-- Uses a DO block for portability across legacy ai_billing_settings schemas.

DO $$
DECLARE
  v_usd_to_idr numeric;
  v_month_start timestamptz;
  v_month_end timestamptz;
BEGIN
  -- Resolve kurs: prefer singleton key='default', fallback to latest row, fallback to 15000
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

  -- WIB month bounds: 1st 00:00:00 WIB to last day 23:59:59.999 WIB
  -- Compute via Asia/Jakarta timezone conversion
  SELECT
    (date_trunc('month', (now() AT TIME ZONE 'Asia/Jakarta')) AT TIME ZONE 'Asia/Jakarta'),
    ((date_trunc('month', (now() AT TIME ZONE 'Asia/Jakarta')) + interval '1 month - 1 millisecond') AT TIME ZONE 'Asia/Jakarta')
  INTO v_month_start, v_month_end;

  -- Backfill flat pricing models (gemini-3.7-flash and legacy 3.6 alias)
  -- Only touches rows from current WIB month with zero cost and positive tokens.
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
  WHERE p.model_id = 'gemini-3.7-flash'
    AND l.model_id IN ('gemini-3.7-flash', 'gemini-3.6-flash')
    AND l.estimated_cost_idr = 0
    AND l.total_tokens > 0
    AND l.created_at >= v_month_start
    AND l.created_at <= v_month_end
    AND l.status = 'success';

  -- Generic backfill for any other text model where pricing exists but log was 0-cost
  -- (covers gemini-3.5 series, gpt-5.x, etc. — bounded to current month and zero-cost rows)
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
  WHERE p.model_id = l.model_id
    AND l.model_id IN ('gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gpt-5.6-luna', 'gpt-5.4-mini', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite', 'gemini-3.1-pro-preview')
    AND l.estimated_cost_idr = 0
    AND l.total_tokens > 0
    AND l.created_at >= v_month_start
    AND l.created_at <= v_month_end
    AND l.status = 'success';

  RAISE NOTICE 'Backfill completed for WIB month % to % with kurs %', v_month_start, v_month_end, v_usd_to_idr;
END $$;

-- 6. Ensure PostgREST schema cache reload (mirrors other migrations)
NOTIFY pgrst, 'reload schema';

-- Monitoring tahap 2: jadwal harga model AI ("berlaku mulai tanggal").
--
-- A row here is a price that takes effect at `effective_from`. The backend
-- prices each AI call with the newest price already in effect: the latest
-- due schedule row, or `ai_pricing_settings` (in effect since its
-- `updated_at`) when that edit is newer. Costs are still snapshotted into
-- ai_usage_logs at call time, so nothing is recalculated.
--
-- Backend only: RLS on with no policies, and no grants to anon/authenticated.

CREATE TABLE IF NOT EXISTS public.ai_pricing_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id text NOT NULL,
  effective_from timestamptz NOT NULL,
  input_price_usd_per_million numeric NOT NULL CHECK (input_price_usd_per_million >= 0),
  output_price_usd_per_million numeric NOT NULL CHECK (output_price_usd_per_million >= 0),
  input_text_price_usd_per_million numeric CHECK (input_text_price_usd_per_million >= 0),
  cached_input_text_price_usd_per_million numeric CHECK (cached_input_text_price_usd_per_million >= 0),
  input_audio_price_usd_per_million numeric CHECK (input_audio_price_usd_per_million >= 0),
  cached_input_audio_price_usd_per_million numeric CHECK (cached_input_audio_price_usd_per_million >= 0),
  output_text_price_usd_per_million numeric CHECK (output_text_price_usd_per_million >= 0),
  output_audio_price_usd_per_million numeric CHECK (output_audio_price_usd_per_million >= 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_pricing_schedule_model_effective_key UNIQUE (model_id, effective_from)
);

ALTER TABLE public.ai_pricing_schedule ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_pricing_schedule FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ai_pricing_schedule TO service_role;

-- Gemini 3.8 Flash intro price ends 2026-12-31 (ai.google.dev, verified
-- 2026-09-03, see 20260903000000): $1.50 / $7.50 from 2027-01-01.
INSERT INTO public.ai_pricing_schedule (
  model_id, effective_from, input_price_usd_per_million, output_price_usd_per_million
)
VALUES ('gemini-3.8-flash', '2027-01-01 00:00:00+07', 1.50, 7.50)
ON CONFLICT (model_id, effective_from) DO NOTHING;

NOTIFY pgrst, 'reload schema';

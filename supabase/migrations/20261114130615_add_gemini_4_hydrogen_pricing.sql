-- Gemini 4 Hydrogen, Standard paid tier, verified 2026-11-14:
-- https://aistudio.google.com/docs/pricing#gemini-4-hydrogen
-- USD per million tokens: input 1.50; output (including thinking) 7.50;
-- implicit cached input 0.075. Explicit caching is not supported.
-- Add only: retain custom Hydrogen pricing, all Flash pricing/schedules, policies and old logs.
INSERT INTO public.ai_pricing_settings (
  model_id, input_price_usd_per_million, output_price_usd_per_million,
  cached_input_text_price_usd_per_million, updated_at
)
VALUES ('gemini-4-hydrogen', 1.50, 7.50, 0.075, now())
ON CONFLICT (model_id) DO NOTHING;

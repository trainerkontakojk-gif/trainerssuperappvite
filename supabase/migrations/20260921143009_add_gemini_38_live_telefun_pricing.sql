-- Add Gemini 3.8 Live as the default selectable Telefun model.
-- Google Gemini Live standard pricing: $3.00/M audio input and $12.00/M
-- audio output, with text modality rates of $0.75/M input and $4.50/M output.
-- Keep this additive and preserve any operator-customized existing row.

INSERT INTO public.ai_pricing_settings (
  model_id,
  input_price_usd_per_million,
  output_price_usd_per_million,
  input_text_price_usd_per_million,
  input_audio_price_usd_per_million,
  output_text_price_usd_per_million,
  output_audio_price_usd_per_million,
  updated_at
)
VALUES (
  'gemini-3.8-live',
  3.00,
  12.00,
  0.75,
  3.00,
  4.50,
  12.00,
  now()
)
ON CONFLICT (model_id) DO NOTHING;

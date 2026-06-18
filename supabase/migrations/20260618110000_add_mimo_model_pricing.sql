-- Add Xiaomi MiMo model pricing to ai_pricing_settings
-- MiMo V2.5 dan V2.5 Pro via OpenRouter
-- Pricing source: https://openrouter.ai/xiaomi/mimo-v2.5, https://openrouter.ai/xiaomi/mimo-v2.5-pro

INSERT INTO ai_pricing_settings (model_id, input_price_usd_per_million, output_price_usd_per_million)
VALUES
  ('xiaomi/mimo-v2.5', 0.14, 0.28),
  ('xiaomi/mimo-v2.5-pro', 0.435, 0.87)
ON CONFLICT (model_id) DO NOTHING;

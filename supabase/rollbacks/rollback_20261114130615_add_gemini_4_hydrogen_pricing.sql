-- Revert Hydrogen selections/API first. Keep usage history and every Flash row.
-- Remove only the unchanged default row seeded by this migration. If Hydrogen
-- pricing existed before apply, preserve it instead of running this rollback.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.ai_model_policy WHERE model_id = 'gemini-4-hydrogen') THEN
    RAISE EXCEPTION 'Reset Hydrogen model policies before removing its pricing';
  END IF;
END;
$$;
DELETE FROM public.ai_pricing_settings
WHERE model_id = 'gemini-4-hydrogen'
  AND input_price_usd_per_million = 1.50
  AND output_price_usd_per_million = 7.50
  AND input_text_price_usd_per_million IS NULL
  AND cached_input_text_price_usd_per_million = 0.075
  AND input_audio_price_usd_per_million IS NULL
  AND cached_input_audio_price_usd_per_million IS NULL
  AND output_text_price_usd_per_million IS NULL
  AND output_audio_price_usd_per_million IS NULL;

-- Add the annotation columns of telefun_coaching_summary on databases built
-- from migrations. 005_carbon_copy_parity creates the table without them, and
-- 20260523000000_telefun_parity_extensions declares them only inside
-- CREATE TABLE IF NOT EXISTS, which is skipped once the table exists. A clean
-- replay therefore lacked them, and upsert_telefun_coaching_summary failed
-- with 42703. Production already has the columns and both constraints
-- (checked 2026-10-10), so this migration is a no-op there.
-- Plan: plans/markdown/telefun-schema-contract-e2e.md

ALTER TABLE public.telefun_coaching_summary
  ADD COLUMN IF NOT EXISTS ai_annotation_count INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_annotation_checksum TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_annotation_completed_at TIMESTAMPTZ DEFAULT NULL;

-- ADD CONSTRAINT has no IF NOT EXISTS; guard by name so production is untouched.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'telefun_coaching_summary_ai_annotation_count_check'
      AND conrelid = 'public.telefun_coaching_summary'::regclass
  ) THEN
    ALTER TABLE public.telefun_coaching_summary
      ADD CONSTRAINT telefun_coaching_summary_ai_annotation_count_check
      CHECK (ai_annotation_count IS NULL OR ai_annotation_count >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'telefun_coaching_summary_ai_annotation_checksum_check'
      AND conrelid = 'public.telefun_coaching_summary'::regclass
  ) THEN
    ALTER TABLE public.telefun_coaching_summary
      ADD CONSTRAINT telefun_coaching_summary_ai_annotation_checksum_check
      CHECK (ai_annotation_checksum IS NULL OR ai_annotation_checksum ~ '^[a-f0-9]{64}$');
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

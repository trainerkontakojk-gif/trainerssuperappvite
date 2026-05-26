-- Clean up existing duplicates before creating the unique index.
-- Keeps the latest row (by created_at) per duplicate group.
-- Duplicate key: peserta_id + period_id + service_type + LOWER(TRIM(no_tiket)) + indicator_id.

DELETE FROM public.qa_temuan
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY peserta_id, period_id, service_type, LOWER(TRIM(no_tiket)), indicator_id
        ORDER BY created_at DESC
      ) AS rn
    FROM public.qa_temuan
    WHERE is_phantom_padding = false
      AND no_tiket IS NOT NULL
      AND TRIM(no_tiket) != ''
  ) sub
  WHERE rn > 1
);

-- Add unique index on qa_temuan to prevent duplicate input at DB level.
-- Covers: same peserta + period + service + ticket (trimmed, lowercased) + indicator.
-- Excludes: phantom padding rows and empty/whitespace-only tickets (app skips duplicate check for those).

CREATE UNIQUE INDEX IF NOT EXISTS uq_qa_temuan_duplicate_input
  ON public.qa_temuan (peserta_id, period_id, service_type, LOWER(TRIM(no_tiket)), indicator_id)
  WHERE is_phantom_padding = false AND no_tiket IS NOT NULL AND TRIM(no_tiket) != '';

-- Backfill qa_temuan.tahun from the finding's period year.
--
-- createTemuanBatch never set `tahun`, while skor/ranking/detail agent readers
-- filter `qa_temuan.tahun = <year>`, so batch-created findings were invisible
-- there. The service now writes the period year; this fills existing NULLs.
-- Only NULL rows are touched, so rows with an explicit tahun keep it.
-- session_replication_role skips the updated_at trigger: a derived-column
-- backfill is not a user edit.

SET LOCAL session_replication_role = replica;

UPDATE public.qa_temuan AS t
SET tahun = p.year
FROM public.qa_periods AS p
WHERE p.id = t.period_id
  AND t.tahun IS NULL;

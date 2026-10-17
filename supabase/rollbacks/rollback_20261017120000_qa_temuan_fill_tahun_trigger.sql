-- Remove trg_fill_tahun and its function. Rows already filled keep their tahun.
-- On prod this also removes the pre-existing (unhardened) trigger, so inserts
-- that omit tahun would store NULL again; createTemuanBatch writes it itself.
DROP TRIGGER IF EXISTS trg_fill_tahun ON public.qa_temuan;
DROP FUNCTION IF EXISTS public.fill_tahun_from_period();

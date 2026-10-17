-- Drops the SIDAK dashboard year index. No data loss; the dashboard only gets
-- slower again.
DROP INDEX IF EXISTS public.idx_qa_temuan_tahun_id;

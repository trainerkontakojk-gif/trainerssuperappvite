-- No data loss: drops the derived year-version counters and cache validators.
DROP TRIGGER IF EXISTS qa_temuan_year_version_insert ON public.qa_temuan;
DROP TRIGGER IF EXISTS qa_temuan_year_version_update ON public.qa_temuan;
DROP TRIGGER IF EXISTS qa_temuan_year_version_delete ON public.qa_temuan;
DROP TRIGGER IF EXISTS qa_temuan_year_version_truncate ON public.qa_temuan;

DROP FUNCTION IF EXISTS app_internal.bump_qa_temuan_year_version();
DROP FUNCTION IF EXISTS public.get_qa_temuan_year_version(integer);
DROP TABLE IF EXISTS app_internal.qa_temuan_year_versions;

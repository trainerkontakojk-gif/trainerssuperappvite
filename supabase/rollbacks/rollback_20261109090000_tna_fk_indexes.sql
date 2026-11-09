-- Rollback 20261109090000_tna_fk_indexes.sql: drop the TNA foreign key
-- indexes again. No data loss; advisor lint 0001 returns for these keys.
BEGIN;

DROP INDEX IF EXISTS public.idx_tna_programs_created_by;
DROP INDEX IF EXISTS public.idx_tna_programs_updated_by;

DROP INDEX IF EXISTS public.idx_tna_needs_created_by;
DROP INDEX IF EXISTS public.idx_tna_needs_indicator_id;
DROP INDEX IF EXISTS public.idx_tna_needs_period_id;
DROP INDEX IF EXISTS public.idx_tna_needs_previous_plan_id;

DROP INDEX IF EXISTS public.idx_tna_plans_created_by;
DROP INDEX IF EXISTS public.idx_tna_plans_evaluation_period_id;
DROP INDEX IF EXISTS public.idx_tna_plans_program_id;

DROP INDEX IF EXISTS public.idx_tna_plan_participants_peserta_id;

COMMIT;

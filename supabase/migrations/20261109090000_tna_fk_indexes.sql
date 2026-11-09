-- Index every TNA foreign key that has no covering index (Supabase advisor
-- lint 0001_unindexed_foreign_keys, production run 2026-11-09).
-- Without these, each delete or key change in a referenced table scans the
-- TNA table once per foreign key, and lookups by author or period scan it
-- whole. The tables are small, so a plain CREATE INDEX inside the migration
-- transaction holds its lock only briefly. No data, grant, or RLS change.
-- Plan: plans/markdown/tna-fk-indexes.md
BEGIN;

CREATE INDEX IF NOT EXISTS idx_tna_programs_created_by ON public.tna_programs(created_by);
CREATE INDEX IF NOT EXISTS idx_tna_programs_updated_by ON public.tna_programs(updated_by);

CREATE INDEX IF NOT EXISTS idx_tna_needs_created_by ON public.tna_needs(created_by);
CREATE INDEX IF NOT EXISTS idx_tna_needs_indicator_id ON public.tna_needs(indicator_id);
CREATE INDEX IF NOT EXISTS idx_tna_needs_period_id ON public.tna_needs(period_id);
CREATE INDEX IF NOT EXISTS idx_tna_needs_previous_plan_id ON public.tna_needs(previous_plan_id);

CREATE INDEX IF NOT EXISTS idx_tna_plans_created_by ON public.tna_plans(created_by);
CREATE INDEX IF NOT EXISTS idx_tna_plans_evaluation_period_id ON public.tna_plans(evaluation_period_id);
CREATE INDEX IF NOT EXISTS idx_tna_plans_program_id ON public.tna_plans(program_id);

CREATE INDEX IF NOT EXISTS idx_tna_plan_participants_peserta_id ON public.tna_plan_participants(peserta_id);

COMMIT;

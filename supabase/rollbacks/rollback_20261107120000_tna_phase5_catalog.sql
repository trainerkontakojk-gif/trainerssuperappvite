-- Rollback: 20261107120000_tna_phase5_catalog.sql
-- Roll the application back first. Fails closed when phase 5 data exists:
-- a program created or changed through the catalog writers, or any plan with
-- a program snapshot. Removing those would silently lose catalog history.
-- No existing function body was replaced, so nothing is restored. On a remote
-- project, record the revert with `supabase migration repair --status reverted`.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tna_programs WHERE created_by IS NOT NULL OR updated_by IS NOT NULL)
    OR EXISTS (SELECT 1 FROM public.tna_plans WHERE program_snapshot IS NOT NULL) THEN
    RAISE EXCEPTION 'TNA_PHASE5_ROLLBACK_DATA_PRESENT';
  END IF;
END;
$$;

DROP FUNCTION public.tna_set_program_active(uuid,uuid,timestamptz,boolean);
DROP FUNCTION public.tna_update_program(uuid,uuid,timestamptz,jsonb);
DROP FUNCTION public.tna_create_program(uuid,jsonb);
DROP FUNCTION tna_internal.validate_program(jsonb,boolean);
DROP FUNCTION tna_internal.text_array(jsonb);
DROP FUNCTION tna_internal.valid_text_array(jsonb,integer);

DROP TRIGGER tna_plan_program_snapshot ON public.tna_plans;
DROP FUNCTION tna_internal.guard_program_snapshot();
DROP TRIGGER tna_program_guard ON public.tna_programs;
DROP FUNCTION tna_internal.guard_program();

ALTER TABLE public.tna_plans DROP COLUMN program_snapshot;
ALTER TABLE public.tna_programs
  DROP CONSTRAINT tna_programs_suggested_modules_check,
  DROP COLUMN updated_by,
  DROP COLUMN created_by,
  DROP COLUMN updated_at;

COMMIT;

-- Restore the five-program CHECK on public.trainer_activities.
-- Revert the API/types first so no new rows use the two programs. Rows with
-- program 'knowledge_sharing' or 'new_hire' make the ADD CONSTRAINT fail; move
-- them to another program or delete them (data loss) before running this.
BEGIN;

ALTER TABLE public.trainer_activities
  DROP CONSTRAINT IF EXISTS trainer_activities_program_check;

ALTER TABLE public.trainer_activities
  ADD CONSTRAINT trainer_activities_program_check
  CHECK (program IN ('sobat', 'ketik', 'telefun', 'pdkt', 'ceriwis'));

COMMIT;

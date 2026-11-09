-- Add the Knowledge Sharing and New Hire programs to Kegiatan Trainers.
-- Widens the program CHECK only: every existing row still passes, and no
-- data, grant, RLS, or storage change. The allowed list mirrors
-- TRAINER_ACTIVITY_PROGRAMS in packages/types/src/kegiatan.ts.
-- Plan: plans/markdown/kegiatan-knowledge-sharing-new-hire.md
BEGIN;

ALTER TABLE public.trainer_activities
  DROP CONSTRAINT IF EXISTS trainer_activities_program_check;

ALTER TABLE public.trainer_activities
  ADD CONSTRAINT trainer_activities_program_check
  CHECK (
    program IN (
      'sobat',
      'ketik',
      'telefun',
      'pdkt',
      'ceriwis',
      'knowledge_sharing',
      'new_hire'
    )
  );

COMMIT;

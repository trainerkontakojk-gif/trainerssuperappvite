-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 20260522093000_profiler_unique_constraints.sql
-- Description: Drops the profiler_peserta_batch_nama_unique constraint
--              on profiler_peserta(batch_name, nama).
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Dependency: profiler_peserta table must exist
--
-- Data loss: None; constraint only, no columns/tables affected.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.profiler_peserta
  DROP CONSTRAINT IF EXISTS profiler_peserta_batch_nama_unique;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERY
-- Expected: Constraint should not exist (0 rows)
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT 'CONSTRAINT profiler_peserta_batch_nama_unique' AS object_type,
       COUNT(*) AS exists_count
FROM information_schema.table_constraints
WHERE table_schema = 'public'
  AND table_name = 'profiler_peserta'
  AND constraint_name = 'profiler_peserta_batch_nama_unique';

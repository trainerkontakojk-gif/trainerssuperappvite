-- ═══════════════════════════════════════════════════════
-- Rollback: Remove simulation_duration from ketik_history
-- ═══════════════════════════════════════════════════════
-- PERINGATAN: Destructive — akan menghapus data durasi
-- yang sudah tersimpan di kolom ini.

ALTER TABLE public.ketik_history
  DROP COLUMN IF EXISTS simulation_duration;

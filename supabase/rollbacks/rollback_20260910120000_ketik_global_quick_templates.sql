-- Rollback for 20260910120000_ketik_global_quick_templates.sql
-- Warning: this removes the shared copy only. Original user_settings rows are
-- intentionally left untouched and can be used to restore a prior behavior.

BEGIN;

DROP TRIGGER IF EXISTS ketik_global_settings_set_updated_at
  ON public.ketik_global_settings;
DROP TABLE IF EXISTS public.ketik_global_settings;

COMMIT;

SELECT 'TABLE public.ketik_global_settings' AS object_type,
       COUNT(*) AS exists_count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'ketik_global_settings';

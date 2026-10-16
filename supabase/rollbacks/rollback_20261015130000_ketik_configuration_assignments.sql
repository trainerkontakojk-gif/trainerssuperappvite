-- Local/test rollback: removes assignment provenance and the assignment API's
-- persistence contract. Recipient personal settings are deliberately preserved.
-- Stop assignment writes first; do not run against remote data without approval.
BEGIN;
DROP FUNCTION IF EXISTS public.assign_ketik_configuration(uuid, uuid, text, text, uuid, jsonb);
DROP TABLE IF EXISTS public.ketik_configuration_assignments;
COMMIT;

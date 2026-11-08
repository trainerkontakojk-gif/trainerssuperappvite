-- Rollback 20261107181115_sidak_atomic_rule_publish.sql: drop the atomic
-- publish RPC. No data loss: rule versions keep their status. Revert the API
-- first, or every SIDAK rule publish fails once the function is gone.
BEGIN;

DROP FUNCTION IF EXISTS public.publish_sidak_rule_version(uuid, uuid, text, boolean, uuid);

COMMIT;

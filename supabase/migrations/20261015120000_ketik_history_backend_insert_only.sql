-- KETIK scores and review status must only be persisted by the backend.
-- The legacy owner INSERT policy also allowed arbitrary final_score and
-- review_status values. Keep owner SELECT and subject-attribution rules intact.
-- service_role (used by persistSession) bypasses RLS; no new client write path.
BEGIN;

DROP POLICY IF EXISTS "ketik_history_insert_own" ON public.ketik_history;

COMMIT;

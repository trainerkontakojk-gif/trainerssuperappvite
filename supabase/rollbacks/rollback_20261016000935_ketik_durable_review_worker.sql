BEGIN;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.ketik_review_jobs WHERE status IN ('queued','processing')) THEN
    RAISE EXCEPTION 'Drain or stop active review jobs before rollback';
  END IF;
END $$;
DROP FUNCTION public.read_ketik_review(uuid,uuid);
DROP FUNCTION public.settle_ketik_review(uuid,uuid,jsonb,boolean);
DROP FUNCTION public.claim_ketik_review(text,integer,uuid);
DROP FUNCTION public.enqueue_ketik_review(uuid,uuid,uuid,boolean);
DROP FUNCTION public.can_access_ketik_review(uuid,uuid);
DROP INDEX public.ketik_review_jobs_eligible_idx;
ALTER TABLE public.ketik_review_jobs DROP COLUMN lease_token,DROP COLUMN request_id,DROP COLUMN available_at;
-- The fencing column is gone; restore the pre-E table SELECT grants.
GRANT SELECT ON public.ketik_review_jobs TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Rollback: 20260527000002_add_unique_index_ketik_review_jobs_session_id
-- Drops the unique index on ketik_review_jobs(session_id).
-- NOTE: This index existed in legacy migration 20260508110000.

DROP INDEX IF EXISTS public.ketik_review_jobs_session_id_idx;

-- Verification
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'ketik_review_jobs' AND indexname = 'ketik_review_jobs_session_id_idx';

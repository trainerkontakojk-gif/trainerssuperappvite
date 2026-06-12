-- Rollback: 20260527000000_add_unique_index_qa_temuan_duplicate_input
-- Drops the unique index on qa_temuan that prevents duplicate input.
-- NOTE: The data cleanup (DELETE of duplicates) CANNOT be undone.
--       Duplicate rows that were removed are gone permanently.

DROP INDEX IF EXISTS public.uq_qa_temuan_duplicate_input;

-- Verification
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'qa_temuan' AND indexname = 'uq_qa_temuan_duplicate_input';

-- Remove the updated_at triggers on pdkt_mailbox_items and ketik_review_jobs.
-- update_updated_at_column() is shared with other tables and stays.
DROP TRIGGER IF EXISTS tr_pdkt_mailbox_updated_at ON public.pdkt_mailbox_items;
DROP TRIGGER IF EXISTS ketik_review_jobs_updated_at ON public.ketik_review_jobs;
DROP FUNCTION IF EXISTS public.handle_pdkt_mailbox_updated_at();

BEGIN;
DROP FUNCTION public.ketik_history_page(uuid,integer,text,text,timestamptz,uuid);
DROP INDEX public.ketik_history_owner_date_id_idx;
NOTIFY pgrst,'reload schema';
COMMIT;

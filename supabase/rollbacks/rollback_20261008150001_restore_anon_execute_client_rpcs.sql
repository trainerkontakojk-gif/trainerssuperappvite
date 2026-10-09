-- WARNING: rolling back reintroduces the revoked-EXECUTE crash exposure.
-- Local pre-T3 snapshot: only postgres, authenticated and service_role had EXECUTE.
-- Function bodies and all other privileges remain unchanged. Apply atomically.
REVOKE EXECUTE ON FUNCTION public.bulk_reorder_profiler_peserta(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.soft_delete_pdkt_mailbox_item(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.submit_pdkt_mailbox_batch(text,text,text,text,text,jsonb,jsonb,jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.submit_pdkt_mailbox_batch_with_subject(text,text,text,text,text,jsonb,jsonb,jsonb,text,uuid,text,text,text,uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.submit_pdkt_mailbox_reply(uuid,jsonb,integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.submit_pdkt_mailbox_reply_with_outcome(uuid,jsonb,integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.upsert_telefun_coaching_summary(uuid,jsonb,integer,text) FROM anon;

NOTIFY pgrst, 'reload schema';

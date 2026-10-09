-- T3 / Q4: restore anon EXECUTE; existing in-body authorization is unchanged.
-- Apply atomically. Revoked EXECUTE on exposed RPCs can crash affected Postgres.
GRANT EXECUTE ON FUNCTION public.bulk_reorder_profiler_peserta(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_pdkt_mailbox_item(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_pdkt_mailbox_batch(text,text,text,text,text,jsonb,jsonb,jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_pdkt_mailbox_batch_with_subject(text,text,text,text,text,jsonb,jsonb,jsonb,text,uuid,text,text,text,uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_pdkt_mailbox_reply(uuid,jsonb,integer) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_pdkt_mailbox_reply_with_outcome(uuid,jsonb,integer) TO anon;
GRANT EXECUTE ON FUNCTION public.upsert_telefun_coaching_summary(uuid,jsonb,integer,text) TO anon;

NOTIFY pgrst, 'reload schema';

-- Global self-check, not an allowlist: future exposed functions are covered too.
DO $check$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'graphql_public')
      AND p.prokind = 'f'
      AND p.prorettype <> 'trigger'::regtype
      AND (
        NOT has_function_privilege('anon', p.oid, 'EXECUTE')
        OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
      )
  ) THEN
    RAISE EXCEPTION 'Unsafe exposed function: anon/authenticated EXECUTE is missing';
  END IF;
END;
$check$;

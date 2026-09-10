-- PDKT subject intents contain participant PII used only to bridge the
-- authoritative session/init response to the mailbox RPC. They are not
-- history and must not remain indefinitely after consumption or expiry.

CREATE OR REPLACE FUNCTION public.cleanup_pdkt_mailbox_subject_intents()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- SECURITY DEFINER changes current_user to the function owner. In hosted
  -- PostgREST, the connection session can remain `authenticator`, so accept
  -- the verified JWT role claim as well as direct postgres/service-role test
  -- sessions. EXECUTE is separately revoked from all client roles below.
  IF COALESCE(current_setting('request.jwt.claim.role', true), '') NOT IN
       ('service_role', 'postgres', 'supabase_admin')
     AND session_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: subject intent cleanup is service-role only';
  END IF;

  DELETE FROM public.pdkt_mailbox_subject_intents
   WHERE consumed_at IS NOT NULL
      OR expires_at <= clock_timestamp();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_pdkt_mailbox_subject_intents() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_pdkt_mailbox_subject_intents() TO service_role;

COMMENT ON FUNCTION public.cleanup_pdkt_mailbox_subject_intents() IS
  'Deletes consumed or expired PDKT mailbox subject intents containing temporary participant snapshots.';

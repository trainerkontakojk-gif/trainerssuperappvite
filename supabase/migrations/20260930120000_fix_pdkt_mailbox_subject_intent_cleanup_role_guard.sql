-- PDKT subject-intent cleanup is scheduled by the API every 15 minutes and runs
-- through PostgREST with the service-role key.
--
-- The original guard only read the legacy per-claim GUC
-- `request.jwt.claim.role`. Current PostgREST no longer sets the legacy claim
-- GUCs: the verified claims arrive as one JSON GUC, `request.jwt.claims`, while
-- the connection's `session_user` stays `authenticator`. A legitimate
-- service-role call therefore hit the RAISE below and logged
-- `FORBIDDEN: subject intent cleanup is service-role only` every scheduled run.
--
-- EXECUTE stays restricted to service_role by the REVOKE/GRANT at the bottom of
-- this file; this migration only teaches the in-function guard to read the role
-- from the GUC that PostgREST actually sets, keeping the legacy GUC and direct
-- postgres/service-role sessions as fallbacks.

CREATE OR REPLACE FUNCTION public.cleanup_pdkt_mailbox_subject_intents()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
  jwt_role TEXT;
BEGIN
  -- `request.jwt.claims` is JSON. A malformed or absent setting must fall
  -- through to the other checks instead of aborting cleanup with a parse error.
  BEGIN
    jwt_role := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  EXCEPTION
    WHEN others THEN
      jwt_role := NULL;
  END;

  IF jwt_role IS NULL THEN
    jwt_role := NULLIF(current_setting('request.jwt.claim.role', true), '');
  END IF;

  -- SECURITY DEFINER changes current_user to the function owner, so the guard
  -- deliberately tests the JWT role claim and session_user only.
  IF COALESCE(jwt_role, '') NOT IN ('service_role', 'postgres', 'supabase_admin')
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

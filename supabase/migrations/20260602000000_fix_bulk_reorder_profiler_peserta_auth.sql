-- Migration: 20260602000000_fix_bulk_reorder_profiler_peserta_auth.sql
-- Fixes bulk_reorder_profiler_peserta authorization block.
-- Allows service_role (e.g. backend service calling via supabaseAdmin) to bypass auth.uid() check,
-- and preserves existing checks for authenticated users.

CREATE OR REPLACE FUNCTION public.bulk_reorder_profiler_peserta(p_updates JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_total_rows INTEGER;
  v_distinct_ids INTEGER;
  v_distinct_order_numbers INTEGER;
  v_updated_rows INTEGER;
BEGIN
  -- If service role, bypass role check as the API layer (Hono route) already verified authorization.
  IF auth.role() = 'service_role' THEN
    -- service_role is allowed
  ELSIF auth.role() = 'authenticated' THEN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT lower(coalesce(role, '')) INTO v_role FROM public.profiles WHERE id = v_user_id;

    IF v_role NOT IN ('trainer', 'trainers', 'admin') THEN
      RAISE EXCEPTION 'Akses ditolak: role tidak memiliki izin untuk reorder peserta';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'array' OR jsonb_array_length(p_updates) = 0 THEN
    RETURN;
  END IF;

  SELECT COUNT(*), COUNT(DISTINCT id) INTO v_total_rows, v_distinct_ids
  FROM jsonb_to_recordset(p_updates) AS u(id UUID, nomor_urut INTEGER);

  IF v_total_rows <> v_distinct_ids THEN
    RAISE EXCEPTION 'Payload reorder mengandung id duplikat';
  END IF;

  SELECT COUNT(DISTINCT nomor_urut) INTO v_distinct_order_numbers
  FROM jsonb_to_recordset(p_updates) AS u(id UUID, nomor_urut INTEGER);

  IF v_total_rows <> v_distinct_order_numbers THEN
    RAISE EXCEPTION 'Payload reorder mengandung nomor_urut duplikat';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_updates) AS u(id UUID, nomor_urut INTEGER)
    WHERE u.id IS NULL OR u.nomor_urut IS NULL OR u.nomor_urut < 1
  ) THEN
    RAISE EXCEPTION 'Payload reorder tidak valid';
  END IF;

  UPDATE public.profiler_peserta AS p
  SET nomor_urut = u.nomor_urut
  FROM jsonb_to_recordset(p_updates) AS u(id UUID, nomor_urut INTEGER)
  WHERE p.id = u.id;

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  IF v_updated_rows <> v_total_rows THEN
    RAISE EXCEPTION 'Sebagian data reorder tidak ditemukan atau tidak ter-update';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bulk_reorder_profiler_peserta(JSONB) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.bulk_reorder_profiler_peserta(JSONB) TO authenticated, service_role;

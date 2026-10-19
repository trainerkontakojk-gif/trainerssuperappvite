-- KETIK/PDKT scenario attachments move out of JSON into Storage.
--
-- Uploaded images (and PDKT PDFs) were stored as base64 data URLs inside
-- user_settings and copied into every session, mailbox item and history row,
-- so each read downloaded them again. The API now uploads each attachment once
-- to this bucket and stores its public URL instead.
--
-- Objects are named by the SHA-256 of their bytes, so the same file is stored
-- once and its URL never changes (browsers and the CDN cache it). The bucket is
-- public like profiler-foto: anyone with the URL can read the file, and a URL
-- cannot be guessed without the file. There are no storage.objects policies,
-- so clients can neither upload nor list; only the service role writes.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'scenario-attachments',
  'scenario-attachments',
  true,
  10485760,
  ARRAY[
    'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif',
    'image/bmp', 'application/pdf'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- One-off backfill helpers for rows written before this change, driven by
-- apps/api/src/scripts/backfill-scenario-attachments.ts. Each call reads one
-- bounded page by primary key, so it stays under the API statement timeout.
-- The script downloads each distinct attachment once (by md5 of its JSON
-- literal), uploads it, then swaps the literal for the URL inside the database.

CREATE OR REPLACE FUNCTION public.scenario_attachment_backfill_columns(p_table text)
RETURNS TABLE(key_column text, json_columns text[])
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT t.key_column, t.json_columns
  FROM (VALUES
    ('user_settings', 'id', ARRAY['settings']),
    ('ketik_configuration_assignments', 'recipient_id', ARRAY['source_configuration']),
    ('ketik_sessions', 'id', ARRAY['snapshot']),
    ('pdkt_history', 'id', ARRAY['config', 'emails']),
    ('pdkt_mailbox_items', 'id', ARRAY['scenario_snapshot', 'config_snapshot', 'inbound_email', 'emails_thread'])
  ) AS t(table_name, key_column, json_columns)
  WHERE t.table_name = p_table;
$$;

-- A JSON string literal holding a supported data URL, quotes included.
CREATE OR REPLACE FUNCTION public.scenario_attachment_literal_pattern()
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT '"data:(?:image/(?:png|jpe?g|gif|webp|avif|bmp)|application/pdf);base64,[^"]*"'::text;
$$;

CREATE OR REPLACE FUNCTION public.scenario_attachment_swap(
  p_doc text,
  p_digests text[],
  p_urls text[]
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
DECLARE
  v_literal text;
  v_index integer;
BEGIN
  FOR v_literal IN
    SELECT DISTINCT m[1]
    FROM regexp_matches(p_doc, '(' || public.scenario_attachment_literal_pattern() || ')', 'gi') AS m
  LOOP
    v_index := array_position(p_digests, md5(v_literal));
    IF v_index IS NOT NULL THEN
      p_doc := replace(p_doc, v_literal, to_jsonb(p_urls[v_index])::text);
    END IF;
  END LOOP;
  RETURN p_doc;
END;
$$;

CREATE OR REPLACE FUNCTION public.scenario_attachment_backfill_scan(
  p_table text,
  p_after uuid DEFAULT NULL,
  p_limit integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key text;
  v_columns text[];
  v_doc text;
  v_result jsonb;
BEGIN
  SELECT c.key_column, c.json_columns INTO v_key, v_columns
  FROM public.scenario_attachment_backfill_columns(p_table) AS c;
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'Unknown backfill table %', p_table USING ERRCODE = '22023';
  END IF;
  SELECT string_agg(format('coalesce(t.%I::text, '''')', col), ' || '' '' || ')
  INTO v_doc
  FROM unnest(v_columns) AS col;

  EXECUTE format(
    $q$
      WITH page AS (
        SELECT %1$I AS k FROM public.%2$I
        WHERE $1 IS NULL OR %1$I > $1
        ORDER BY %1$I
        LIMIT $2
      ),
      hits AS (
        SELECT p.k, md5(m[1]) AS digest
        FROM page p
        JOIN public.%2$I t ON t.%1$I = p.k
        CROSS JOIN LATERAL regexp_matches(%3$s, %4$L, 'gi') AS m
      )
      SELECT jsonb_build_object(
        'next', (SELECT k FROM page ORDER BY k DESC LIMIT 1),
        'keys', coalesce((SELECT jsonb_agg(DISTINCT k) FROM hits), '[]'::jsonb),
        'digests', coalesce((SELECT jsonb_agg(DISTINCT digest) FROM hits), '[]'::jsonb)
      )
    $q$,
    v_key, p_table, v_doc,
    '(' || public.scenario_attachment_literal_pattern() || ')'
  )
  INTO v_result
  USING p_after, greatest(1, least(coalesce(p_limit, 25), 200));
  RETURN v_result;
END;
$$;

-- Returns the distinct literals among p_keys whose md5 is in p_digests.
CREATE OR REPLACE FUNCTION public.scenario_attachment_backfill_fetch(
  p_table text,
  p_keys uuid[],
  p_digests text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key text;
  v_columns text[];
  v_doc text;
  v_result jsonb;
BEGIN
  SELECT c.key_column, c.json_columns INTO v_key, v_columns
  FROM public.scenario_attachment_backfill_columns(p_table) AS c;
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'Unknown backfill table %', p_table USING ERRCODE = '22023';
  END IF;
  SELECT string_agg(format('coalesce(t.%I::text, '''')', col), ' || '' '' || ')
  INTO v_doc
  FROM unnest(v_columns) AS col;

  EXECUTE format(
    $q$
      SELECT coalesce(jsonb_agg(DISTINCT m[1]), '[]'::jsonb)
      FROM public.%1$I t
      CROSS JOIN LATERAL regexp_matches(%2$s, %3$L, 'gi') AS m
      WHERE t.%4$I = ANY($1) AND md5(m[1]) = ANY($2)
    $q$,
    p_table, v_doc,
    '(' || public.scenario_attachment_literal_pattern() || ')',
    v_key
  )
  INTO v_result
  USING p_keys, p_digests;
  RETURN v_result;
END;
$$;

-- Swaps each literal whose md5 is in p_digests for the matching URL.
CREATE OR REPLACE FUNCTION public.scenario_attachment_backfill_apply(
  p_table text,
  p_keys uuid[],
  p_digests text[],
  p_urls text[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key text;
  v_columns text[];
  v_set text;
  v_count integer;
BEGIN
  IF coalesce(array_length(p_digests, 1), 0) <> coalesce(array_length(p_urls, 1), 0) THEN
    RAISE EXCEPTION 'Digest and URL counts differ' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_urls) AS u WHERE u IS NULL OR u !~ '^https?://' OR u ~ '["[:space:]]') THEN
    RAISE EXCEPTION 'Invalid attachment URL' USING ERRCODE = '22023';
  END IF;
  SELECT c.key_column, c.json_columns INTO v_key, v_columns
  FROM public.scenario_attachment_backfill_columns(p_table) AS c;
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'Unknown backfill table %', p_table USING ERRCODE = '22023';
  END IF;
  SELECT string_agg(
    format('%1$I = public.scenario_attachment_swap(%1$I::text, $2, $3)::jsonb', col),
    ', '
  )
  INTO v_set
  FROM unnest(v_columns) AS col;

  EXECUTE format('UPDATE public.%I SET %s WHERE %I = ANY($1)', p_table, v_set, v_key)
  USING p_keys, p_digests, p_urls;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.scenario_attachment_backfill_columns(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.scenario_attachment_literal_pattern() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.scenario_attachment_swap(text, text[], text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.scenario_attachment_backfill_scan(text, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.scenario_attachment_backfill_fetch(text, uuid[], text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.scenario_attachment_backfill_apply(text, uuid[], text[], text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scenario_attachment_backfill_scan(text, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.scenario_attachment_backfill_fetch(text, uuid[], text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.scenario_attachment_backfill_apply(text, uuid[], text[], text[]) TO service_role;

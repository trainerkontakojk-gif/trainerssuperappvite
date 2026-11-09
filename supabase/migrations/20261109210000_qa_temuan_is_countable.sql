-- Match ECMAScript String.prototype.trim() exactly, including Unicode space
-- separators and line terminators. Keep this immutable for the stored column.
CREATE OR REPLACE FUNCTION app_internal.qa_is_countable(nilai integer, ketidaksesuaian text, sebaiknya text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(nilai, 3) < 3
    OR coalesce(length(pg_catalog.btrim(ketidaksesuaian,
      E'\t\n\013\f\r ' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')), 0) > 0
    OR coalesce(length(pg_catalog.btrim(sebaiknya,
      E'\t\n\013\f\r ' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')), 0) > 0;
$$;

REVOKE ALL ON FUNCTION app_internal.qa_is_countable(integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_internal.qa_is_countable(integer, text, text) TO authenticated, service_role;

ALTER TABLE public.qa_temuan
  ADD COLUMN is_countable boolean GENERATED ALWAYS AS (
    app_internal.qa_is_countable(nilai, ketidaksesuaian, sebaiknya)
  ) STORED;

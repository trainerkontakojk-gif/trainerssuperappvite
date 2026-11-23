-- Per-year change versions let API instances validate a cached qa_temuan year
-- without re-reading every row when the year has not changed.
CREATE TABLE IF NOT EXISTS app_internal.qa_temuan_year_versions (
  tahun integer PRIMARY KEY,
  version bigint NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

REVOKE ALL ON TABLE app_internal.qa_temuan_year_versions
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_internal.bump_qa_temuan_year_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Upsert years in ascending order so concurrent multi-year writes take the
  -- counter row locks in the same order and cannot deadlock on each other.
  IF TG_OP = 'INSERT' THEN
    INSERT INTO app_internal.qa_temuan_year_versions AS existing
      (tahun, version, changed_at)
    SELECT DISTINCT inserted_row.tahun, 1, pg_catalog.now()
    FROM new_rows AS inserted_row
    WHERE inserted_row.tahun IS NOT NULL
    ORDER BY inserted_row.tahun
    ON CONFLICT (tahun) DO UPDATE
      SET version = existing.version + 1,
          changed_at = pg_catalog.now();
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO app_internal.qa_temuan_year_versions AS existing
      (tahun, version, changed_at)
    SELECT affected.tahun, 1, pg_catalog.now()
    FROM (
      SELECT old_row.tahun FROM old_rows AS old_row
      UNION
      SELECT new_row.tahun FROM new_rows AS new_row
    ) AS affected
    WHERE affected.tahun IS NOT NULL
    ORDER BY affected.tahun
    ON CONFLICT (tahun) DO UPDATE
      SET version = existing.version + 1,
          changed_at = pg_catalog.now();
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO app_internal.qa_temuan_year_versions AS existing
      (tahun, version, changed_at)
    SELECT DISTINCT deleted_row.tahun, 1, pg_catalog.now()
    FROM old_rows AS deleted_row
    WHERE deleted_row.tahun IS NOT NULL
    ORDER BY deleted_row.tahun
    ON CONFLICT (tahun) DO UPDATE
      SET version = existing.version + 1,
          changed_at = pg_catalog.now();
  ELSIF TG_OP = 'TRUNCATE' THEN
    UPDATE app_internal.qa_temuan_year_versions AS existing
    SET version = existing.version + 1,
        changed_at = pg_catalog.now();

    -- No backfill is required. A year that has never changed has implicit
    -- version zero, so seed any years whose rows would otherwise disappear.
    INSERT INTO app_internal.qa_temuan_year_versions AS existing
      (tahun, version, changed_at)
    SELECT DISTINCT temuan.tahun, 1, pg_catalog.now()
    FROM public.qa_temuan AS temuan
    WHERE temuan.tahun IS NOT NULL
    ON CONFLICT (tahun) DO NOTHING;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION app_internal.bump_qa_temuan_year_version()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS qa_temuan_year_version_insert ON public.qa_temuan;
CREATE TRIGGER qa_temuan_year_version_insert
  AFTER INSERT ON public.qa_temuan
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION app_internal.bump_qa_temuan_year_version();

DROP TRIGGER IF EXISTS qa_temuan_year_version_update ON public.qa_temuan;
CREATE TRIGGER qa_temuan_year_version_update
  AFTER UPDATE ON public.qa_temuan
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION app_internal.bump_qa_temuan_year_version();

DROP TRIGGER IF EXISTS qa_temuan_year_version_delete ON public.qa_temuan;
CREATE TRIGGER qa_temuan_year_version_delete
  AFTER DELETE ON public.qa_temuan
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION app_internal.bump_qa_temuan_year_version();

DROP TRIGGER IF EXISTS qa_temuan_year_version_truncate ON public.qa_temuan;
CREATE TRIGGER qa_temuan_year_version_truncate
  BEFORE TRUNCATE ON public.qa_temuan
  FOR EACH STATEMENT
  EXECUTE FUNCTION app_internal.bump_qa_temuan_year_version();

ALTER TABLE public.qa_temuan
  ENABLE ALWAYS TRIGGER qa_temuan_year_version_insert;
ALTER TABLE public.qa_temuan
  ENABLE ALWAYS TRIGGER qa_temuan_year_version_update;
ALTER TABLE public.qa_temuan
  ENABLE ALWAYS TRIGGER qa_temuan_year_version_delete;
ALTER TABLE public.qa_temuan
  ENABLE ALWAYS TRIGGER qa_temuan_year_version_truncate;

CREATE OR REPLACE FUNCTION public.get_qa_temuan_year_version(p_tahun integer)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app_internal.assert_service_role();

  RETURN COALESCE(
    (
      SELECT year_version.version
      FROM app_internal.qa_temuan_year_versions AS year_version
      WHERE year_version.tahun = p_tahun
    ),
    0::bigint
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_qa_temuan_year_version(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_qa_temuan_year_version(integer)
  TO service_role;

COMMENT ON TABLE app_internal.qa_temuan_year_versions IS
  'Internal per-year change counters used to validate the API qa_temuan row cache.';

-- Local/E2E only: drops `results` and every row in it. The table predates the
-- repo on prod and holds legacy Telefun sessions, so never run this there.
-- Revert the prod access changes by hand instead if needed.
DROP TABLE IF EXISTS public.results;

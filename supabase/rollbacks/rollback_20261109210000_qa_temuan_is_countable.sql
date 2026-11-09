-- Revert API readers first; this drops only the derived column.
ALTER TABLE public.qa_temuan DROP COLUMN IF EXISTS is_countable;
DROP FUNCTION IF EXISTS app_internal.qa_is_countable(integer, text, text);

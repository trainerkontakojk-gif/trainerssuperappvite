-- Migration to add is_deleted column to profiles table and an index for it.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

-- Backfill explicit update (optional, since DEFAULT false is added, but good for parity)
UPDATE public.profiles SET is_deleted = false WHERE is_deleted IS NULL;

-- Create an index to quickly filter non-deleted users
CREATE INDEX IF NOT EXISTS profiles_is_deleted_idx ON public.profiles(is_deleted);

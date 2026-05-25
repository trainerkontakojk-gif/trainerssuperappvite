-- Migration: Add consumer_phone and consumer_city to telefun_history
-- Created At: 2026-05-25T12:31:00+07:00

ALTER TABLE public.telefun_history
  ADD COLUMN IF NOT EXISTS consumer_phone TEXT;

ALTER TABLE public.telefun_history
  ADD COLUMN IF NOT EXISTS consumer_city TEXT;

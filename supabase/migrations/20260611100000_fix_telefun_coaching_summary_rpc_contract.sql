-- Terminal migration: Fix Telefun Coaching Summary RPC Contract
-- Hapus overload legacy 2-arg (UUID, JSONB) dan tegaskan privilege signature final 4-arg.

DROP FUNCTION IF EXISTS public.upsert_telefun_coaching_summary(UUID, JSONB);

REVOKE ALL ON FUNCTION public.upsert_telefun_coaching_summary(UUID, JSONB, INTEGER, TEXT)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.upsert_telefun_coaching_summary(UUID, JSONB, INTEGER, TEXT)
  TO authenticated, service_role;

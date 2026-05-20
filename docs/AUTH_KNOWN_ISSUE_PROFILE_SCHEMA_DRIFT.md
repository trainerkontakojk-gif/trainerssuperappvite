# Auth Profile Schema Drift

## Symptom

An active admin can sign in successfully, but the sidebar falls back to `Role: User`.

## Cause

The web auth bootstrap reads `profiles.id, email, full_name, role, status, is_deleted`. If the target Supabase schema does not yet have `profiles.is_deleted`, that profile query fails and the UI never hydrates the stored role.

## Fix

- Apply `supabase/migrations/20260520054101_add_is_deleted_to_profiles.sql` to the live target.
- Keep the web auth flow tolerant with a fallback read that omits `is_deleted` until the migration is present.
- Keep `profiles.status` aligned with the database contract: `pending`, `active`, or `inactive`.

## Notes

This issue is specific to the `profiles` schema drift on the target project. It is separate from Supabase Auth login itself, which can succeed even while profile hydration fails.

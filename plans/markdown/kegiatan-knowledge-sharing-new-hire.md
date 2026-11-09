# Kegiatan Trainers: Knowledge Sharing and New Hire programs

Lane D (schema CHECK constraint + shared API contract). Requested by Fajar on 2026-11-09:
"pada laman /kegiatan tambahkan juga Program Knowledge Sharing dan New Hire".

## Requirement

- `/kegiatan` (public) and `/dashboard/kegiatan` (admin/trainer) offer two more programs after
  CERIWIS: **Knowledge Sharing** (`knowledge_sharing`) and **New Hire** (`new_hire`).
- Admins/trainers can create, edit, and publish activities for both; the public API returns them,
  grouped and filtered like the existing five, in the fixed order
  SOBAT, KETIK, Telefun, PDKT, CERIWIS, Knowledge Sharing, New Hire.
- `?program=knowledge_sharing` / `?program=new_hire` are valid shareable filters.
- No change to roles, RLS, grants, storage, or existing rows.

## Design

- `packages/types/src/kegiatan.ts`: append both entries to `TRAINER_ACTIVITY_PROGRAMS`. The zod
  enum, API ordering, router search validation, public grouping, and the admin select all derive
  from this constant, so no other runtime list changes.
- New migration `supabase/migrations/20261109120000_trainer_activities_more_programs.sql`: drop and
  re-add `trainer_activities_program_check` with the seven values. Widening only; every existing row
  still passes. Rollback restores the five-value check and fails loudly if rows with the new
  programs exist (they must be moved or deleted first; data-loss note in the rollback README).
- `apps/web/src/routes/kegiatan.css`: dot colors for both programs. They reuse existing module
  tokens not shown on this page (`--module-profiler` cyan, `--module-tna` amber), so no new token
  is needed; dots are decorative (`aria-hidden`).
- `docs/modules.md`: update the fixed program order sentence.

## Tasklist

1. RED: real-backend API test creates `knowledge_sharing` and `new_hire` activities and expects
   them in the public API after CERIWIS (`kegiatan-api.spec.ts`, project `kegiatan-real-backend`).
2. RED: hermetic browser test shows both program buttons/headings and keeps
   `?program=new_hire` in the URL (`kegiatan.spec.ts`).
3. GREEN: types constant, migration + rollback + README row, CSS dots, docs.
4. Replay locally (`scripts/integration/supabase-bootstrap.sh`), run both focused specs GREEN,
   rollback round-trip, then root typecheck/lint/build and `git diff --check`.
5. Production apply of the migration needs Fajar's explicit OK. Until it is applied, saving a
   Knowledge Sharing/New Hire activity fails the DB check and the API returns 503 "Data kegiatan
   belum dapat diproses. Silakan coba lagi." (verified locally by the rollback round-trip); the
   five existing programs are unaffected. Apply the migration before or right after the API deploy.

## Production apply 2026-11-09

- Approved by Fajar. Read-only preflight on `ruosnjmtywcrghjgqugz`: last version `20261109090000`,
  `20261109120000` not recorded, five-program check in place, 4 rows (sobat 3, ketik 1).
- `supabase db query --linked -f supabase/migrations/20261109120000_trainer_activities_more_programs.sql`
  (07:29 UTC), then `supabase migration repair --linked --status applied 20261109120000`.
- Read-only readback: version recorded; `trainer_activities_program_check` lists all seven programs
  and is validated; rows unchanged (sobat 3, ketik 1).

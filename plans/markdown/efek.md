# EFEK — Evaluasi Efektivitas dan Kinerja

Lane D (schema, RLS, API contract, new UI). Mockup approved by Fajar on 2026-10-19:
https://claude.ai/artifact/XMaxYSTiqTLE4eAbY8QJSR.

## Requirement

Trainers (admin + trainer) record which agents attended a classroom training (KETIK, PDKT,
Telefun, CERIWIS) and when, then see how each participant's official SIDAK QA score and findings
changed before vs after the training, compared with non-participants of the same service.

- Program → measured service: KETIK→chat, PDKT→email, Telefun→call, CERIWIS→cso (editable per session).
- Participants come from Profiler (`profiler_peserta`), picked manually or imported from Excel/CSV.
  Import never creates Profiler rows; unmatched names are shown and skipped.
- Only `tna.read` roles can read; only `tna.write` roles can change. Leaders and agents get 403.

## Design

Phase 1 (data + input):

- Tables `efek_programs` (seeded), `efek_sessions`, `efek_participants` (FK `profiler_peserta`
  ON DELETE CASCADE, unique per session). RLS: SELECT for `is_admin_or_trainer()`; no client writes.
- Writes go through `public.efek_save_sessions(p_actor_id, p_sessions jsonb, p_mode text)` and
  `public.efek_delete_session(p_actor_id, p_session_id)`, guarded in-function by
  `tna_internal.assert_service_role()` + `tna_internal.require_actor()` (never REVOKE EXECUTE;
  see the TNA phase 1 migration header). Modes: `create` (conflict → `EFEK_SESSION_EXISTS`),
  `merge` (import: same program + title + start date adds participants), `replace` (edit one session).
- API under `/api/v1/tna/efek`: programs, sessions list/detail/create/update/delete, `import/match`
  (server-side name matching), `import` (atomic multi-session save).
- Web: TNA gets two tabs (Kebutuhan & rencana, EFEK). `/tna/efek` lists programs and sessions;
  `/tna/efek/sesi/baru`, `/tna/efek/sesi/$id` edit; `/tna/efek/impor` parses the file in the
  browser (exceljs/CSV), sends only names to `import/match`, then commits.

Phase 2 (report): read `qa_dashboard_agent_period_summary` (official score, sessions, findings per
agent per period). Window 3 completed months before/after (1–6), training month and running month
excluded; status naik/turun at ±1 point; "data tipis" when one month on a side or < 5 sessions;
comparison = non-participants with the same service in the same months.

Phase 3: printable HTML export and an "Ikut pelatihan" line on SIDAK agent detail (admin/trainer).

## Tasklist

- [ ] P1 RED: `apps/web/e2e/tna-efek-api.spec.ts` (real backend) and `tna-efek.spec.ts` (hermetic).
- [ ] P1 migration + rollback, types, API, web, CHANGELOG, docs.
- [ ] P2 report service + UI + E2E.
- [ ] P3 export + SIDAK link + E2E.

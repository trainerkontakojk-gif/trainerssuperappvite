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

Phase 2 (report, no schema change):

- Source: `qa_dashboard_agent_period_summary` rows with `session_count > 0` (official monthly
  `final_score`, `session_count`, `findings_count`), read with the caller JWT (RLS admin/trainer).
- One row per participation (session × peserta), measured on the session's `service_type`.
  Training months = start month..end month (offset 0, excluded). Before = the `window` months
  before the start month (offset −1..−W); after = the `window` months after the end month
  (+1..+W), only months before the current Asia/Jakarta month (`data_until` = last closed month).
- Score per side = mean of monthly `final_score` over months with data. Findings per side =
  Σ findings / Σ sessions ("temuan per sesi"), raw totals kept alongside.
- Status: `menunggu` (no after month has closed), `tanpa_data` (a side has no data), else
  Δ = after − before → `naik` (≥ +1), `turun` (≤ −1), `stabil`. `thin` when a side has one month
  or fewer than 5 audit sessions. Evaluated = naik/stabil/turun.
- Comparison: per month, mean `final_score` and Σfindings/Σsessions of agents in the same service
  who never joined a session of that program. Δ relatif = Δ − (comparison after − before, over the
  participant's own months with data).
- Program card: participants, evaluated, pending, mean Δ, mean Δ relatif, naik/stabil/turun,
  findings per session before → after (evaluated only). Session row: participants, evaluated,
  mean Δ, status `terukur` (all W after months closed), `sebagian` (some), `menunggu` (none).
- Chart by relative month −W..+W: participants vs comparison (mean score, findings per session).
- API: `GET /tna/efek/report?window=&year=&tim=` (summary) and
  `GET /tna/efek/report/:program?window=&year=&tim=&session=` (detail with participants and monthly
  breakdown). Both `tna.read`. Web: `/tna/efek` gains filters and metrics; new
  `/tna/efek/program/$code` with charts (plain SVG) and a sortable participant table.

Phase 3: printable HTML export and an "Ikut pelatihan" line on SIDAK agent detail (admin/trainer).

## Tasklist

- [x] P1 RED: `apps/web/e2e/tna-efek-api.spec.ts` (real backend) and `tna-efek.spec.ts` (hermetic).
- [x] P1 migration + rollback, types, API, web, CHANGELOG, docs.
- [x] P2 report service + UI + E2E.
- [ ] P3 export + SIDAK link + E2E.

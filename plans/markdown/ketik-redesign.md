# KETIK redesign: Telaah stage, quiet chat, data landing, Riwayat page

Lane D (significant UI redesign). Source: artifact "Redesign Modul KETIK"
(claude.ai/artifact/CFwXShf77pgKSRVwpoMAkf, 2026-10-14), drift-checked against
`apps/web/src/routes/ketik` on `main` @ 42e1741.

## Requirement

Follow the PDKT pattern: one flow, data on the landing, an actionable Telaah.

1. **Telaah is a stage, not a popup.** After a chat ends the session is saved and
   the user lands on `/ketik?sesi=<id>&tahap=telaah`. Transcript left (numbered
   messages, typos underlined in place), result right: final score first, five
   aspects as one bar list, then tabs _Perbaiki dulu_, _Sudah baik_, _Ejaan_,
   _Ringkasan_. A typo finding names its message number and jumps to it.
   Typo severity is Indonesian (Berat/Sedang/Ringan).
2. **Honest review progress.** No timer-driven percentage. States: _belum
   ditelaah_ (button for roles with `ketik.review`, an explanation otherwise),
   _sedang ditelaah_ (stepwise text), _gagal_ (retry without redoing the chat),
   _selesai_. Timeout after 120 s is reported as a failure, never as success.
3. **Quiet chat room.** No stopwatch, no "Online" badge, compact header (name,
   city · phone, participant when a trainer runs it). "Akhiri chat" is a neutral
   button with an app confirmation dialog. Leaving the page while chatting warns.
   The time-up closing message mechanism stays; only the visible clock goes.
4. **Data landing.** Hero + one primary "Mulai simulasi", a quiet menu row
   (Riwayat, Pemakaian AI popover, Pengaturan), an animated chat → telaah demo
   that pauses and respects reduced motion. Below: progress (sessions this
   month, average of the last 5 reviewed, reviewing now), _Perlu tindak lanjut_
   (unreviewed/failed sessions), _Fokus berikutnya_ (lowest aspect), and
   _Hasil telaah terbaru_ with the lowest aspect per row. No invented numbers.
5. **Riwayat page.** `/ketik/history` stops redirecting and renders a table with
   status filters, search, CSV download, per-row replay and delete, and an app
   confirmation for delete/delete-all (no `window.confirm`).
6. Starting stays one click; scenario/consumer/duration remain random and hidden.

### Out of scope (needs Fajar's decision, separate PR)

- **Agent access to scenarios.** Scenarios are chosen in the browser from the
  user's own settings and sent as `scenarioDraft` to `/ketik/generate`; revoking
  `ketik.settings.read` from agents breaks starting a session unless scenario
  selection moves to the backend. That is an architecture/permission change.

### Settings dialog (added 2026-10-15)

Fajar chose "Semua peran sama": the dialog is redesigned for every role and
agent access to scenarios stays unchanged until the permission decision above.

- Header "Pengaturan KETIK" + "Berlaku untuk sesi yang Anda mulai berikutnya.";
  categories Skenario (aktif/total), Karakter konsumen, Identitas konsumen,
  Template cepat, Sesi & AI.
- Scenario list as PDKT `ScenarioList`: switch per row, search, category
  filter, "Ikuti skrip"/"Bebas" per row, Ubah + Hapus.
- Durasi, tempo, model AI as radio groups; durasi copy states participants do
  not see it.
- Footer "Belum disimpan", Tutup/Simpan, "Pulihkan bawaan"; close-with-changes,
  delete, discard, and reset use `ConfirmDialog` (no `window.confirm`).
- Shared: `PdktSwitch` → `components/settings/SettingsSwitch.tsx`; PDKT
  `ConsumerRow`/`RadioIndicator` → `components/settings/SettingsChoices.tsx`.

## Design

- `router.tsx`: `/ketik` validates `sesi` + `tahap=telaah`; `/ketik/history`
  renders `routes/ketik/history.tsx`.
- `routes/ketik/index.tsx`: landing + chat view; the review stage is shown when
  `sesi` is in the URL. Chat stays in memory (it cannot survive a reload).
- New: `components/KetikReviewStage.tsx`, `components/KetikStageNav.tsx`,
  `components/KetikStageDemo.tsx` + `.css`, `components/KetikLandingOverview.tsx`,
  `hooks/useKetikReviewStatus.ts`, `utils/landingSummary.ts`, `utils/transcript.ts`
  (CSV export moved out of `ChatInterface`), `utils/reviewDisplay.ts`.
- `UsagePopover` moves to `components/simulation/UsagePopover.tsx` with a module
  prop; PDKT keeps its labels.
- Removed after E2E covers them: `SessionReviewModal`, `HistoryModal`,
  `KetikMotionFrame`, `ModuleWorkspaceIntro`, ChatInterface review mode, and the
  superseded unit tests (`ketik-landing`, `ketik-review-progress`,
  `ketik-motion-frame`) plus their `scripts/test-core.json` entries.
- No backend, schema, or permission change.

### UX constraints (ui-ux-pro-max)

- Surfaces: `/ketik` landing, chat room (full screen), Telaah stage (full
  screen, `sesi` in URL), `/ketik/history`.
- Hierarchy: one primary action per surface (Mulai simulasi / Kirim / Latihan
  lagi); final score before aspects; aspects before findings.
- Mobile first: Telaah stacks result above transcript under 1024px; landing
  sections wrap with `flex-wrap`; history hides participant/date columns on
  phones and repeats them under the title.
- States: landing sections each have loading / empty / error + "Coba lagi";
  Telaah has not-reviewed / reviewing / failed / no-access / ready; history has
  loading / empty / no-match / error.
- Tokens only (`bg-surface-elevated`, `text-fg2`, `text-module-ketik`,
  `chart-*`); no side-stripe borders, no uppercase tracked labels, no icon
  cards, controls ≥44px, text ≥12px, reduced motion shows the final frame.
- Non-goals: permissions, backend.

## Tasklist

- [x] RED: rewrite `apps/web/e2e/ketik-flow.spec.ts` for the new landing, Telaah
      stage (completed / pending / failed), chat room, and Riwayat page; update
      `usage.spec.ts` for the KETIK popover. Run and confirm failures.
- [x] GREEN: router, landing, overview, demo, review stage + hook, chat header
      and end confirmation, history page, shared popover.
- [x] Remove superseded components/tests and manifest entries.
- [x] `docs/design.md` KETIK section; `docs/modules.md` route note.
- [x] Reviews: impeccable audit, thermo-nuclear.
- [x] Gates: focused E2E, web typecheck, `pnpm lint`, `pnpm build`,
      `git diff --check`, `graphify update .`.
- [x] Settings RED: `KETIK Pengaturan (hermetic)` in `ketik-flow.spec.ts`.
- [x] Settings GREEN: modal, scenarios/consumers/template/system/identity tabs,
      draft dirty tracking, shared switch and choice row.
- [x] Settings E2E run (RED on HEAD files, GREEN), PDKT regression, visual
      check, gates.

## Telaah annotations (added 2026-10-15)

### Requirement

Fajar: Telaah must show (1) the core of the case, (2) which consumer
questions were answered, and (3) which agent sentences were assessed and what
sentence the agent could have used instead.

Acceptance:

- A new review stores `caseCore`, up to 5 `consumerPoints` (consumer quote,
  summary, status Terjawab/Sebagian/Belum terjawab, reason, the agent message
  that answers it), and up to 8 `agentNotes` (agent quote, aspect, Sudah
  tepat/Perlu diperbaiki, note, better sentence).
- The backend keeps only annotations whose quote is really in a message from
  the right sender. A wrong `messageId` is repaired by searching for the quote,
  and anything else is dropped. Strings pass `sanitizeAiResponse`.
- The Telaah stage shows "Inti kasus", a "Pertanyaan konsumen" tab (the
  default when points exist), and a "Kalimat agen" tab. Quotes are marked in
  the transcript, and every item jumps to its message.
- Old reviews (no fields) say "Belum tersedia" and keep "Perbaiki dulu" as
  the default tab. Completed sessions cannot be re-reviewed (unchanged).

### Design

- Contract: optional `caseCore`, `consumerPoints`, `agentNotes` on
  `KetikEducation` (`packages/types/src/ketik.ts`). Storage is the existing
  `ketik_session_reviews.education` JSONB, so there is no migration.
  `getReviewDetail` already passes `education` through.
- AI: `KETIK_REVIEW_RESPONSE_SCHEMA` and the system instruction ask for the
  three fields. `services/ketik/review-annotations.ts` normalizes them against
  `ketik_history.messages`. Scores and the rest of the review are unchanged.
- UI: `KetikReviewStage` adds the case core, two tabs, inline transcript marks
  (consumer status via line style + tint + letter, agent notes via number),
  and jump buttons. Typo marks still render inside annotated spans.
- Tests: E2E `KETIK Telaah` (annotated and legacy review mocks). Approved
  exception: extra cases in `apps/api/src/__tests__/ketik-review-edukatif.test.ts`
  for backend normalization, run as a single file.

### Tasklist

- [x] RED: E2E annotated + legacy Telaah tests; run and confirm failures.
- [x] RED: unit cases for normalization (quote not in message, wrong sender,
      repaired id, invalid answer reference, limits, invalid enum, sanitize).
- [x] GREEN: types, prompt/schema, normalizer, processor wiring.
- [x] GREEN: Telaah UI (`KetikReviewAnnotations.tsx`, `utils/quoteMarks.tsx`),
      tab list `relative` so the active tab is not scrolled out of view.
- [x] thermo-nuclear review, gates, `docs/design.md` note.

## Telaah ulang (added 2026-10-15)

### Requirement

Fajar: add a "Telaah ulang" button so a completed review can be run again (for
example, to give old reviews the new annotations).

- Only roles with `ketik.review` see the button; it sits next to the final
  score and asks for confirmation (`ConfirmDialog`) before calling the AI.
- If the rerun fails, the previous result stays and the stage says so
  ("Telaah ulang belum berhasil. Hasil sebelumnya tetap ditampilkan.").
  Raw error codes are not shown.
- Legacy reviews' "Belum tersedia" copy points to Telaah ulang for those roles.

### Design

- `POST /ketik/review` takes optional `rerun: true`. Only for a session whose
  `review_status` is `completed`: `reopenKetikReviewForRerun` reopens the job
  with a conditional update (`status = completed` → `queued`,
  `attempt_count = 0`) and sets history to `pending`; a concurrent rerun gets
  `processing`. The existing claim/process path runs unchanged; the processor
  already replaces the review row only after the AI succeeds.
- On failure (processor result or thrown error),
  `restoreKetikReviewAfterFailedRerun` restores job/history to `completed`
  when the old review row still exists and the response carries
  `previousKept: true`. Same rate limit and `logAiUsage` path as a first review.
- Web: `ketikApi.startReview(id, { rerun })`, `useKetikReviewStatus().rerun`
  and `rerunFailed`. No schema or migration change.

### Tasklist

- [x] RED: E2E rerun success (cancel sends nothing; body `{sessionId, rerun}`;
      new annotations replace old), rerun failure keeps old result, agent sees
      no button. Two failed before implementation.
- [x] GREEN: route flag + lifecycle helpers, client, hook, button, dialog,
      notice, legacy copy.
- [x] Gates: `ketik-flow.spec.ts`, typecheck, lint, build, `git diff --check`.

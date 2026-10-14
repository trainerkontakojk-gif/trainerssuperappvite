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

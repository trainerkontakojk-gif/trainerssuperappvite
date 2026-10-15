# Telefun redesign: Telaah stage, softphone call screen, data landing, Riwayat page

Lane D (significant UI redesign). Source: artifact "Redesign Modul Telefun"
(claude.ai/artifact/2REVtvK5xmbf4KiS2G1JXU, 2026-10-15), drift-checked against
`apps/web/src/routes/telefun` on `main` @ 309facd.

Frontend only (`apps/web`). No backend, schema, permission, or Gemini Live audio
path change.

## Requirement

Follow the PDKT/KETIK pattern: one flow, data on the landing, a Telaah you can
listen back to.

1. **Telaah is a stage, not a popup.** After a call ends the session is saved and
   the user lands on `/telefun?sesi=<id>&tahap=telaah`. Left: recording player
   with a timeline that marks only real data (play position, hold intervals from
   `sessionMetrics.hold`, trainer notes), then the timestamped transcript. A
   transcript line plays the recording from its `startMs`. Filler words are
   marked inside agent lines only when the text is really there
   (`fillerWords.examples`). Right: voice score first (0–10, one decimal,
   "7,6 / 10"), six aspects as one bar list with their raw numbers (kata/menit,
   jumlah kata pengisi, nada dominan, hold), then tabs _Perbaiki dulu_, _Sudah
   baik_, _Catatan trainer_ (existing `ReplayAnnotator`), _Profil_ (existing
   radar). A finding names the transcript time it refers to.
2. **Honest analysis status.** Before a score exists the right panel follows
   `scoringStatus`: menunggu / sedang dianalisis (Periksa status), gagal (Analisis
   ulang, plus "dicoba lagi otomatis" when retryable), belum dianalisis (Mulai
   analisis), rekaman tidak tersimpan (no fake upload button). No percentages.
   The transcript and recording stay usable meanwhile.
3. **One place to listen back.** `ReviewModal` and `/telefun/replay/$id` are
   replaced by the Telaah stage; the old replay URL redirects to it. The
   random waveform is gone.
4. **Softphone call screen.** Compact header (small avatar, name, phone · city,
   participant, call length as a small elapsed clock — never a countdown). One
   neutral status line (Memanggil, Menghubungkan, Konsumen berbicara, Giliran
   Anda, Ditahan, Menyimpan rekaman…), a thin mic level bar with "Suara Anda
   tidak terdeteksi" after a few silent seconds, a hold band under the header
   (same `HoldStatusDisplay` limits). Controls Tahan/Lanjutkan, Bisukan,
   Akhiri. "Akhiri" stays red and opens an app confirmation "Akhiri
   panggilan?". Audio, recording, hold, time-cue, and cleanup logic unchanged.
5. **Mic check before calling.** The participant dialog gets a microphone row
   with a live level meter; "Mulai panggilan" stays disabled until the mic is
   allowed. A denied mic shows how to allow it and "Coba lagi".
6. **Data landing.** Hero + one primary "Mulai simulasi", a quiet menu row
   (Riwayat, Pemakaian AI popover, Pengaturan), a pausable call → telaah demo
   (reduced motion shows the final frame). Below: progress (calls this month,
   average of the last 5 scored, being analyzed), _Perlu tindak lanjut_ (failed
   analysis, recording not saved), _Fokus berikutnya_ (lowest aspect average),
   _Hasil telaah terbaru_. No invented numbers; empty/error states.
7. **Riwayat page.** `/telefun/history`: table with status filters, search, CSV,
   per row Buka + menu (Unduh rekaman, Hapus), Hapus semua; all deletes use
   `ConfirmDialog` (no `window.confirm`).
8. **Settings like KETIK.** "Pengaturan Telefun" + "Berlaku untuk panggilan yang
   Anda mulai berikutnya."; categories Skenario (aktif/total), Karakter
   konsumen, Identitas konsumen, Sesi & AI; scenario rows with a switch,
   search, "Ikuti skrip"/"Bebas"; footer "Belum disimpan", Pulihkan bawaan
   (draft only), Tutup/Simpan; no `window.confirm`/`alert`.

Decisions taken from the artifact's recommendations: score stays 0–10 with one
decimal; Akhiri asks for confirmation; call length stays visible (elapsed
only); content assessment (did the agent answer) is a separate backend PR.

## Design

- `router.tsx`: `/telefun` validates `sesi` + `tahap=telaah`; `/telefun/history`
  renders `routes/telefun/history.tsx`; `/telefun/replay/$id` redirects to
  `/telefun?sesi=$id&tahap=telaah`.
- `hooks/useTelefunHistory.ts`: loads DB sessions + valid local history (merge
  rules unchanged from `index.tsx`), exposes upsert/remove/clear and load state.
  Used by the landing and the history page.
- `routes/telefun/index.tsx`: view = call | telaah | home. After
  `onRecordingReady` the saved (or unsynced fallback) record is upserted and the
  page navigates to the Telaah stage. Scoring still runs in the background;
  the session reconciler keeps updating the record.
- New: `components/TelefunReviewStage.tsx`, `components/TelefunCallPlayer.tsx`,
  `components/TelefunReviewStatus.tsx`, `components/TelefunStageNav.tsx`,
  `components/TelefunStageDemo.tsx` + `.css`,
  `components/TelefunLandingOverview.tsx`, `components/MicCheck.tsx`,
  `hooks/useTelefunRecordingUrl.ts`, `utils/reviewDisplay.ts`,
  `utils/landingSummary.ts`, `utils/fillerMarks.tsx`, `utils/historyCsv.ts`.
- `SimulationSubjectPicker` gains optional `children` (extra rows) and
  `confirmDisabled`/`confirmLabel`; KETIK/PDKT callers unchanged.
- `UsagePopover` gains a `telefun` module copy.
- Removed: `ReviewModal`, `HistoryModal`, `replay.tsx`, `TelefunMotionFrame`,
  `VoiceEvaluationDashboard`, `VoiceAssessmentSection`,
  `MicrophoneActivityWaveform`, `UsageModal` (Telefun was the last user), and
  the superseded unit tests (`telefun-motion-frame`,
  `telefun-review-recording-source`, `telefun-start-call-single-flight`,
  `usage-modal-breakdown`, the waveform block of `telefun-microphone-activity`)
  plus their `scripts/test-core.json` entries, after the E2E covers them.
- Monitoring keeps `VoiceMetricCards`, `HoldAssessmentCard`,
  `CommunicationProfileZoomModal`, `VoiceRadarChart`, `TelefunTranscript`.

### UX constraints (ui-ux-pro-max)

- Surfaces: `/telefun` landing, call screen (full screen), Telaah stage (full
  screen, `sesi` in URL), `/telefun/history`, settings dialog.
- Hierarchy: one primary action per surface (Mulai simulasi / Mulai panggilan /
  Latihan lagi); score before aspects; aspects before findings.
- Mobile first: call controls at the bottom within thumb reach; Telaah stacks
  result above player + transcript under 1024px; history hides participant,
  date, duration on phones and repeats them under the title.
- States: landing sections loading / empty / error + "Coba lagi"; Telaah
  recording loading / unavailable / error + retry and the five analysis states;
  history loading / empty / no-match / error; mic check asking / ready /
  denied / unsupported.
- Tokens only (`bg-surface-elevated`, `text-fg2`, `text-module-telefun`,
  `chart-*`); no side-stripe borders, no uppercase tracked labels, no icon
  cards, no `rounded-[2.5rem]`, controls ≥44px, text ≥12px, reduced motion shows
  the final frame, status never by color alone.
- Non-goals: backend, scoring prompt, permissions, Gemini Live transport.

## Tasklist

- [x] RED: `apps/web/e2e/telefun-flow.spec.ts` (landing, Telaah ready/pending/
      failed/unsynced, replay redirect, call with mocked Gemini Live socket and
      fake mic → confirm → Telaah, session-create failure, one session per
      double click, settings) and `telefun-history.spec.ts` rewritten for the
      Riwayat page; Telefun popover in `usage.spec.ts`. Run; confirm failures.
- [x] GREEN: router, history hook, landing + overview + demo, Telaah stage +
      player + status, call screen, mic check, history page, popover, settings.
- [x] Remove superseded components/tests and manifest entries.
- [x] Docs: `docs/design.md` Telefun section, `docs/modules.md`,
      `docs/telefun.md`, `docs/auth-rbac.md` replay route.
- [x] Reviews: impeccable audit, thermo-nuclear.
- [x] Gates: focused E2E, web typecheck, `pnpm lint`, `pnpm build`,
      `git diff --check`, `graphify update .`.

### Verification (2026-10-15)

- RED on `main` @ 309facd: 26 failed, 2 passed (pre-existing guards).
- GREEN: `playwright test e2e/telefun-flow.spec.ts e2e/telefun-call.spec.ts e2e/telefun-history.spec.ts e2e/usage.spec.ts` → 29 passed.
- Regression: design-token-contrast, authenticated-shell, main-landmark, ketik-flow, pdkt-flow, monitoring, landing-split-flap → 165 passed.
- `pnpm typecheck`, `pnpm lint` (0 errors), `pnpm build`, `git diff --check`, `graphify update .` → exit 0.
- Not run (needs Fajar's approval for unit tests): updated `telefun-phone-interface-end-call`, `telefun-phone-interface-openai-webrtc`, `telefun-scenario-description-limit`, `telefun-microphone-activity`.
- Also fixed: `Layout.tsx` redirected to `/telefun` on first access grant, dropping Telefun deep links.

## Anotasi isi dan Telaah ulang (added 2026-10-15)

Lane C (backend + API contract + UI). Fajar asked for the KETIK Telaah
annotations (`10a9711`) and Telaah ulang (`309facd`) in Telefun.

### Requirement

1. **Anotasi isi.** The AI scoring call also reads the stored two-way
   transcript (`telefun_history.messages`) and returns: case core (1–2
   sentences), up to 5 consumer questions with Terjawab/Sebagian/Belum terjawab
   and the agent line that answered, and up to 8 assessed agent lines with a
   better sentence for "Perlu diperbaiki". Only quotes really present in a line
   of the right speaker are kept. The Telaah stage shows "Inti kasus" above
   the tabs, tabs "Pertanyaan konsumen" (default when there are points) and
   "Kalimat agen", quote marks in the transcript (filler marks stay inside),
   and buttons that jump to the line's time. Older results show "Belum
   tersedia" and point to Telaah ulang; a call without a transcript says so.
2. **Telaah ulang.** A scored session can be analysed again from the Telaah
   stage: outline button next to the score, always behind `ConfirmDialog`.
   While it runs the current result stays visible with a status line. If it
   fails the previous result is kept and a `role="alert"` notice says so,
   without raw codes.

### Design

- Types: `telefunContentReviewSchema` (`caseCore`, `consumerPoints`
  {startMs, quote, summary, status, reason, answerStartMs, answerQuote},
  `agentNotes` {startMs, quote, verdict, note, example}) as optional
  `contentReview` inside the voice assessment JSONB. `undefined` = legacy
  result, `null` = no transcript to read. No migration.
- API `lib/telefun-content-review.ts`: prompt section with numbered lines,
  extra AI response properties (the shared voice JSON schema used by the
  retired OpenAI path is not changed), and `normalizeTelefunContentReview`
  (line + speaker check, quote search fallback, length limits,
  `sanitizeAiResponse`). `analyzeVoiceQuality` reads `messages`, adds the
  section, and takes `{ fresh: true }` to skip the cached result.
- API `POST /telefun/score/:id/rerun` in `routes/telefun/rerun.ts` (owner only, `aiRateLimitMiddleware`):
  conditional update `scoring_status completed → processing` with a fresh
  claim token (busy → 409 `SCORING_IN_PROGRESS`), fresh analysis, then the
  fenced `complete_telefun_scoring` RPC. On failure the token-fenced row is
  put back to `completed`; the old score/assessment were never cleared
  (502 `RERUN_FAILED`, `details.previousKept`). If the restore itself fails,
  the stale-claim worker later completes the row from the cached old result.
- Web: shared quote-mark helpers move to `components/simulation/quoteMarks.tsx`
  (KETIK keeps its behavior); `TelefunContentReview.tsx` renders the tabs'
  items; the result panel moves to `TelefunReviewResult.tsx` (keeps both
  files under ~1,000 lines); the stage gets the dialog and rerun state.

### Tasklist

- [x] RED: `telefun-flow.spec.ts` — annotated result (inti kasus, default tab,
      status by line style + text, jump to line, marks in transcript with
      filler marks kept), legacy "Belum tersedia", rerun success (cancel sends
      nothing; new result replaces old), rerun failure keeps old result.
- [x] GREEN: types, API helper + analysis + route, web.
- [x] Docs: `docs/design.md`, `docs/telefun.md`, `docs/auth-rbac.md`.
- [x] Gates: focused E2E (telefun-flow, ketik-flow for the shared helper),
      typecheck web/api/telefun, lint, build, `git diff --check`.
- [x] Approved by Fajar (2026-10-15): one API unit test,
      `apps/api/src/__tests__/telefun-content-review-rerun.test.ts` (not in
      test-core/test-fast), for what hermetic E2E cannot reach: quote
      validation (fabricated quote, wrong speaker, wrong line repaired, invalid
      answer → null, example only for fix, 5/8 limits, malformed response) and
      the rerun route (fresh analysis + same claim token on success, restore +
      502 previousKept on failure or throw, 409 for non-completed, 403, 404).
      15 passed; a mutation of the restore filter and of the speaker check
      made 3 tests fail.
- [x] Real-AI check: not run by the agent. Local `.env` points at the
      production Supabase project and no local Supabase was running, so a real
      scoring call would have read and written production. Fajar chose
      (2026-10-15) to check it after deploy: open an older Telefun
      session in Telaah, press Telaah ulang, and review "Pertanyaan konsumen"
      and "Kalimat agen".

## Feedback after the real-AI check (2026-10-15)

Fajar ran Telaah ulang after deploy: it works, but (1) it takes long with no
sign of progress or how long to wait, (2) "Pertanyaan konsumen" and "Kalimat
agen" stayed empty, (3) asked for advice on the radar chart, (4) "filler"
reads better than "kata pengisi".

### Design

1. Rerun no longer awaits the coaching summary (a second Gemini call with its
   own 3-minute limit); it runs after the response. The stage shows a wait
   panel with an elapsed clock (mm.ss), an indeterminate bar (static under
   reduced motion), "Biasanya 1–2 menit, paling lama sekitar 3 menit", and a
   "lebih lama dari biasanya" line after 3 minutes. No percentage. Same panel
   for a manual "Mulai analisis"/"Analisis ulang".
2. Annotation fields become `required` in the AI schema when a two-way
   transcript exists, and the prompt marks them mandatory. Quote matching
   ignores case, spacing, and punctuation, and stores the transcript's exact
   substring so the web mark always lands. The API logs counts per category
   (AI vs kept), no text, to diagnose an empty result.
3. Radar: advice only, no change in this pass.
4. Label "Filler" instead of "Kata pengisi" in Telefun UI copy.

### Tasklist

- [x] RED: E2E rerun wait panel (elapsed clock, hint, no %), label "Filler";
      approved API test file extended for punctuation-tolerant matching and
      exact-substring quotes, required schema fields, rerun not awaiting the
      coaching summary.
- [x] GREEN, docs, gates, commit. RED: 3 E2E + 3 API cases failed first;
      GREEN: API test 19/19, E2E (telefun-flow, -call, -history, monitoring,
      ketik-flow) 71/71.

## Radar → "Target vs hasil" (2026-10-15)

Fajar chose option A in both places (Telaah "Profil" tab and the Monitoring
Telefun panel). The radar used English labels, a 0–100 scale next to 0–10
scores, mixed reading rules (filler inverted), and repeated the aspect list.

### Design

- `TelefunTargetList` (from `TelefunCommunicationProfile`): one row per metric
  with the Indonesian label, value in the user's unit, target, status word
  (Baik/Cukup/Kurang, from `metric.status`, not color alone), and an
  `aria-hidden` strip with the target band and a marker:
  kecepatan bicara in kata/menit on 80–200 with band 130–150; filler as a
  count on 0–15 with band 0–3; intonasi/artikulasi/nada on 0–10 with band
  target ± 1,0 (the same rule as `getMetricStatus`). No scoring change.
- Telaah: "Profil" tab = summary + list. Monitoring: the radar button and
  zoom modal are replaced by the list; "Metrik Suara" cards stay.
- Remove `VoiceRadarChart`, `VoiceRadarChartInner`,
  `CommunicationProfileZoomModal`, the radar/zoom parts of
  `telefun-communication-profile.test.tsx` (keep its `VoiceMetricCards`
  cases) and the radar mocks in two monitoring unit tests — only after the
  E2E below passes.

### Tasklist

- [x] RED: telefun-flow "Profil" tab and monitoring Telefun detail show
      "Target vs hasil" with real units and no radar (2 failed first).
- [x] GREEN, removals, docs (`design.md`, `modules.md`,
      `TELEFUN_ASSESSMENT_CONTRACT.md`), gates, commit. The edited unit
      tests were not run (no approval asked for this change); web typecheck
      and lint cover their imports.

## Spider diagram, clickable markers, line onsets, waveform (2026-10-15)

Fajar's feedback: (1) prefers a spider diagram for Profil, (2) annotation
markers cannot be clicked to find their point, (3) clicking a time often lands
at the end of the line instead of its start, (4) wants the recording drawn as
a waveform instead of a long bar.

### Design

- `TelefunProfileRadar` replaces `TelefunTargetList` (Telaah + Monitoring):
  custom SVG, axes = `metric.score` 0–10, Indonesian labels with the score,
  green "sudah baik" zone at 7,0+, dot colors match the aspect bars.
- Quote mark labels in the transcript become buttons ("Lihat pertanyaan
  konsumen A", "Lihat kalimat agen 2") that open the tab and highlight the item
  (`data-highlighted`). Trainer-note numbers on the timeline become buttons
  that seek to the note and highlight it; the note time in the list plays from
  there.
- Cause of (3): `TranscriptCollector` stamps a line when its transcription
  arrives (after the speaker talks) relative to the WebSocket connection, which
  opens shortly after recording starts. Fix (browser only, works for old sessions):
  `useRecordingAnalysis` decodes the full and `agent_only` recordings to a 20 ms
  loudness envelope; `speechOnsets` takes agent speech from the agent track and
  consumer speech from the full track while the agent is silent, and gives each
  line the first unused span of its speaker that starts at most 20 s before /
  1 s after the stamped time (−200 ms pre-roll). No span → stamped time. Shown
  and played times both use the onset.
- The same envelope draws the waveform (`waveformBars`); flat bars while
  loading or when decoding fails.

### Tasklist

- [x] RED: 4 E2E (spider in Telaah and Monitoring, clickable markers, onset +
      waveform) failed first. E2E recording route now answers `Range` (206),
      like storage, so the player can seek after the audio loads.
- [x] GREEN, docs, gates, commit.

## Follow-up 2026-10-15 (malam): onset per giliran, data penelepon, spider polos

Fajar's feedback after deploy: (1) clicking an annotation/line time still
lands in the middle or end of the speech, (2) the consumer name and phone on
the call screen are hard to see and should differ from KETIK, (3) the spider's
green zone makes the boundaries unclear.

- Cause of (1): spans were merged only across pauses < 500 ms, so an AI
  consumer turn with a sentence pause became several spans. A line took one
  span, and its leftover spans were then taken by the next line of that speaker,
  so the next line played from the middle of the previous turn (E2E reproduced
  this exactly: expected 00.19, got 00.04). Fix: `speechOnsets` groups spans
  into speaker turns (all spans of one speaker until the other speaks), each
  line takes the latest turn of its speaker that starts before stamp + 2,5 s
  (WS clock starts after recording), and a follow-up line of the same speaker
  takes the next part inside that turn. No fitting turn → stamped time.
- (2) Thin header ("Panggilan masuk", participant, duration); caller data in
  the centre: initials, name as an h2, phone (mono, ≥20px) and city in a `dl`.
- (3) No green zone, single-colour dots, ring labels 2–10 on the bisector
  between the first two axes; caption "Skala 0–10 · makin ke luar makin baik".

- [x] RED: onset test (00.24 → expected 00.19, got 00.04), call-screen caller
      group, spider ring labels without zone; all three failed first.
- [x] GREEN, docs, gates, commit.

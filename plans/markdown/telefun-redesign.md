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

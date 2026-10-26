# Telefun

> **Runtime status:** Telefun is Gemini Live only. The default selectable model
> is `gemini-3.8-live`; `gemini-3.1-flash-live-preview` and
> `gemini-3.0-flash-live-preview` remain available as explicit choices.
> GPT/OpenAI Realtime is permanently retired for Telefun and no configuration,
> cohort, cached browser bundle, or request can start it.

Telefun is a voice-simulation module for `admin` and `trainer`. It uses a React
browser client, the Hono API for settings/history/recordings, and the Telefun
WebSocket service for Gemini Live.

## Active runtime

```text
Browser LiveSession
  → authenticated WebSocket /ws
  → GeminiLiveAdapter
  → Gemini Live

Browser settings/history/recordings
  → API /api/v1/telefun
  → Supabase (owner/RLS-bound reads and writes)
```

- `LiveSession`, `PhoneInterface`, and `createTelefunTransport()` use Gemini
  only. A persisted OpenAI model or transport is normalized to the default
  Gemini model before a new browser session starts.
- The active protocol barrel exports only Gemini/common protocol helpers. The
  retired WebRTC capability compatibility value is static and unavailable; the
  browser does not fetch it during startup.
- `GET /api/v1/ai/models?module=telefun` returns the three active Gemini Live
  models, with `gemini-3.8-live` first as the default. Historical GPT realtime
  IDs are not selectable or valid for a new configure frame.
- Empty/new settings and unknown persisted selections fall back to
  `gemini-3.8-live`; an explicitly persisted 3.1 or 3.0 selection is retained.
- `telefun_session_configure` accepts only a Gemini Live model, Gemini voice,
  and its canonical sample rate. Historical GPT input is rejected before an
  adapter is constructed.
- Settings and session writes reject historical GPT realtime IDs and
  `openai-audio`/`openai-webrtc` transports with
  `400 TELEFUN_OPENAI_DISABLED`. Reads normalize a persisted retired selection
  to Gemini without writing the row back.

## Voice catalog

Telefun exposes the 30 official Gemini Live/TTS voice names through the shared
voice registry. The approved gender mapping used by the identity picker is:

- **Female:** `Zephyr`, `Kore`, `Leda`, `Aoede`, `Callirrhoe`, `Autonoe`,
  `Despina`, `Erinome`, `Laomedeia`, `Achernar`, `Gacrux`, `Pulcherrima`,
  `Vindemiatrix`, `Sulafat`
- **Male:** `Puck`, `Charon`, `Fenrir`, `Orus`, `Enceladus`, `Iapetus`,
  `Umbriel`, `Algieba`, `Algenib`, `Rasalgethi`, `Schedar`, `Alnilam`,
  `Achird`, `Zubenelgenubi`, `Sadachbia`, `Sadaltager`

`Kore` remains the default voice. The gender labels are the approved
application mapping; Google documents the voice names and characteristics but
does not publish a first-party gender field for the full catalog.

## Ekspresi konsumen

Prompt tipe `marah` menagih respons dengan nada kesal setelah jawaban agen yang
singkat, tanpa pilihan menunggu pasif. Pengingat singkat di akhir prompt menjaga
peran konsumen dan penurunan emosi bertahap, melarang fakta baru serta makian/SARA/
ancaman fisik, dan menyatakan bahwa hold, isyarat waktu, serta penutupan aplikasi
harus didahulukan di atas pengingat tersebut.
Tipe lain, katalog/pilihan suara, model, dan transport tidak berubah. E2E hermetic
memverifikasi isi konfigurasi yang terkirim serta lifecycle lokal; bukan bukti
bahwa nada suara model sungguhan sudah lebih ekspresif. Evaluasi audio langsung
memerlukan panggilan provider terpisah yang diotorisasi.

## Session flow

1. The browser creates or resumes an owned Telefun session through the API.
2. `LiveSession` obtains microphone access, sends first-message authentication,
   then sends Gemini configuration and setup.
3. Audio, transcript collection, hold/mute, recording, and Gemini usage remain
   on the existing Gemini path.
4. A normal end drains the Gemini session, persists the recording/history, and
   queues Gemini voice scoring when appropriate.

Historical raw model and transport fields remain visible in history. Settings
normalization never rewrites historical history rows.

## Mikrofon panggilan

- Dialog **Siapa yang berlatih?** mengecek mikrofon secara lokal. Setelah izin
  diberikan, pilihan **Mikrofon** muncul bila ada beberapa input; satu input
  tetap ditampilkan sebagai nama perangkat dan meter suara. Daftar diperbarui
  saat headset dipasang/dilepas.
- Pilihan diingat per browser (`localStorage`, bukan pengaturan server). Bila
  perangkat tersimpan sudah tidak ada, dialog mengecek default browser dan
  menampilkan nama perangkat aktual. Penyimpanan yang diblokir tidak menghalangi
  cek mikrofon atau panggilan.
- Panggilan meminta `deviceId` track yang sudah dicek dengan constraint `exact`;
  meter selama panggilan mengamati stream sesi yang sama. Tanpa id yang tersedia,
  jalur lama memakai default browser.
- Headset yang hilang setelah cek membuat panggilan gagal, bukan beralih diam-diam
  ke mikrofon laptop. Pesan meminta pengguna memeriksa headset atau memilih
  mikrofon lain; kembali ke Telefun untuk membuka cek mikrofon lagi.

## Audio graph (Plan v2 phase 1)

- The browser keeps a dedicated 16 kHz input `AudioContext` for microphone
  processing and the existing Gemini `audio/pcm;rate=16000` input contract.
  Agent-only capture remains sourced from that input graph.
- Playback uses a second `AudioContext` with no requested sample rate, so the
  browser/device chooses its native output rate. Incoming 24 kHz PCM buffers
  retain their source rate and are scheduled on the output context's clock. The
  original microphone stream is mixed into the full-call recording there; the
  mic is not connected to the speaker, and nodes never cross contexts.
- Both recordings retain the existing WebM/Opus 32 kbps setting. Recorder errors
  are observed for the recorder lifetime, not only during shutdown. Disconnect
  waits for both recorder `stop` events (including final `dataavailable` chunks)
  within the existing bounded end-call budget. A failed track is marked failed
  and is not uploaded as complete; its valid sibling recording is preserved.
  End, unmount and partial-startup failure share a small audio disposal owner
  outside React. It stops microphone tracks before awaiting context close,
  joins pending close promises, and retries rejected closes at most three times
  per context (100/200 ms backoff). The caller's deadline does not abandon
  disposal. New call graphs/mics wait up to 10 seconds for confirmed release,
  then report the existing cleanup-pending error. Exhausted closes retain the
  owner and block new calls for that page lifetime; reload is required if the
  browser cannot release them. Finalization/upload remains owned by the
  existing exactly-once recording callback. Upload/save can complete while
  release is pending; navigation to Telaah waits for release and is suppressed
  when the originating phone has unmounted.
- A browser that exposes an output rate below 24 kHz continues the call; this is
  a capability limitation, not a fidelity guarantee or a reason to force another
  rate. Actual rates are logged locally. If autoplay resume is blocked, the
  existing **Aktifkan audio** retry remains the user recovery path.
- Synthetic, hermetic Chromium E2E covers 16 kHz provider MIME/pitch, 24 kHz
  playback scheduling, decoded full-call versus agent-only uploads, recorder
  finalization, server interruption/queue cancellation, hold/mute, a bounded
  stalled-Worklet fallback, blocked-playback retry, partial startup cleanup and
  a mocked 22.05 kHz native output. It makes no Gemini provider call. The frozen
  direct 32 kbps codec control measured a 10 kHz RMS of `0.09886`; the old 16
  kHz graph control measured no 10 kHz component and a strong 6 kHz alias. A
  separate synthetic output-context tap measured 10 kHz RMS `0.10695` and 6 kHz
  alias RMS `0.000168` at 48 kHz in one run, passing the graph-path threshold.
- **The uploaded recording is a separate, unresolved fidelity gate.** In that
  same run, the 32 kbps full-call WebM decoded to 48 kHz but measured 10 kHz RMS
  `0.00814` (retention `0.082` versus the frozen direct-codec control). Five
  captures measured retention `0.082`, `0.100`, `0.406`, `0.676` and `0.691`; two
  met the pre-RED `0.5` criterion and three did not. The 6 kHz recording alias
  remained low. This is an inconsistent/unaccepted full-call recording result,
  not a graph pass: the recording threshold and both 32 kbps settings have not
  been changed. The implementation does not claim that the uploaded full-call
  recording reliably preserves the 10 kHz acceptance target. These synthetic
  Chromium results do not establish performance on Safari, iPhone, Android or
  physical audio devices.

## Scoring runtime

Post-session voice scoring memakai queue durable di Supabase dan kini diproses oleh
**embedded worker dalam `apps/api`**, bukan process Railway terpisah sebagai
arsitektur utama. API tetap menerima request sementara loop worker melakukan
polling setiap 30 detik dengan batch default 5; retry/backoff dan status scoring
historis tidak berubah.

- API worker aktif bila `TELEFUN_SCORING_WORKER_ENABLED="true"`.
- `TELEFUN_SCORING_WORKER_INTERVAL_MS` default deployment: `30000`.
- `TELEFUN_SCORING_WORKER_BATCH_SIZE` default deployment: `5`.
- `TELEFUN_SCORING_WORKER_CLAIM_TIMEOUT_SECONDS` default: `300` detik; nilai
  eksplisit harus integer `>=300` di setiap helper/runtime boundary.
- Setiap claim menyimpan hash token + owner. Completion/failure/reschedule
  ditolak bila token tidak cocok, sehingga stale worker tidak dapat menimpa
  claim baru atau menyelesaikan job dua kali.
- `analyzeVoiceQuality()` hanya membaca audio, memanggil Gemini, dan
  mengembalikan assessment. Persistensi hasil dilakukan oleh service scoring
  melalui RPC completion yang token-fenced.
- `SIGTERM`/`SIGINT` menghentikan admission, menunggu claim yang sedang settle,
  dan mencoba melepaskan claim aktif secara token-fenced setelah abort atau
  deadline. Penantian claim dan RPC release masing-masing dibatasi satu lease;
  `shutdown_recovery_deferred` atau `claim_release_deferred` dicatat saat batas
  tercapai dan lease database menjadi recovery backstop tanpa retry kedua.
  Embedded mode tidak membuka health server kedua. Startup dan transisi error /
  recovery hanya mencatat field bounded (interval, batch, lease, kelas error).
- Bila transkrip dua arah (`telefun_history.messages`) memuat konsumen dan
  agen, panggilan scoring yang sama juga meminta anotasi isi. Backend
  (`lib/telefun-content-review.ts`) hanya menyimpan kutipan yang ada di baris
  pembicara yang tepat dan menaruhnya di `voice_assessment.contentReview`
  (`undefined` = hasil lama, `null` = tidak ada transkrip). Skor tidak
  dipengaruhi. Field anotasi `required` di skema respons (Gemini melewati
  properti opsional); kutipan dicocokkan tanpa peduli huruf besar, spasi, dan
  tanda baca, lalu disimpan persis seperti potongan transkrip. Log
  `[Telefun ContentReview]` mencatat jumlah dari AI/tersimpan, tanpa teks.
- **Telaah ulang** `POST /v1/telefun/score/:id/rerun` (pemilik sesi,
  `aiRateLimitMiddleware`): `completed` → `processing` bersyarat dengan klaim
  bertoken baru (sedang berjalan → 409 `SCORING_IN_PROGRESS`), analisis baru
  tanpa cache, lalu RPC completion yang sama. Bila gagal, baris yang masih
  dipegang token itu dikembalikan ke `completed` dengan hasil lama (502
  `RERUN_FAILED`, `details.previousKept`). Bila pemulihan pun gagal, worker
  mengambil klaim basi setelah lease dan menyelesaikannya dari hasil lama yang
  tersimpan.
  Ringkasan coaching (panggilan AI kedua) berjalan setelah respons, tidak
  ditunggu.
- `GET /api/health` hanya membuktikan liveness API. Kesehatan polling worker
  perlu dibuktikan lewat log runtime bounded dan queue readback.

Service Railway `@trainers/scoring-worker` masih disimpan sebagai fallback rollout,
bukan target arsitektur final. Service tersebut baru boleh di-scale-to-zero
setelah API embedded worker dan migration fencing terbukti drain queue, retry,
dan tidak menghasilkan duplicate claim/completion. Tidak ada queue, assessment,
usage log, recording, atau history yang dihapus.

## Capture readiness and scoring safety

A Gemini voice assessment requires both owned recordings: the full-call capture
and the agent-only capture. If either recorder fails, the attempt is marked
failed and does not enter or continue scoring. The browser still uploads and
keeps any valid sibling track. A failed attempt is finalized before retry, and a
new attempt waits until the old audio contexts, recorders and microphone tracks
are confirmed released.

The API enforces this policy at enqueue/finalization, worker claim, direct or
manual scoring, rerun and result completion. Failed capture state fences late
`recording-ready` callbacks and token-fenced results from in-flight claims;
existing completed assessments remain readable and are not erased. Score and
feedback edits outside the canonical scoring service are rejected. The additive
migration `20261026150000_telefun_failed_capture_scoring_policy.sql` updates the
SQL readiness, claim, enqueue, recording-transition and completion guards; its
rollback is `supabase/rollbacks/rollback_20261026150000_telefun_failed_capture_scoring_policy.sql`.

The local real-backend E2E exercises Hono, PostgREST/RPC, and the scoring worker
against disposable loopback fixtures. Recording downloads use an in-memory
Storage fixture because the local Storage gateway was unavailable; the provider
is intercepted fail-closed, and no provider request leaves the test. Migration
and rollback rehearsal ran only against the verified local Postgres container;
no remote database was changed.

## Historical OpenAI Realtime compatibility

Historical `gpt-realtime-2.1`, `gpt-realtime-2.1-mini`, `openai-audio`, and
`openai-webrtc` values are data-only compatibility metadata. They remain
readable for authorized history, transcript, recording, feedback, usage, and
pricing views. They are not an admission path.

### Owner-bound WebRTC cleanup

The only retained Telefun OpenAI provider operation is cleanup for an
already-owned historical WebRTC call:

| Method                 | Path                                                       | Behavior                                                                |
| ---------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| `POST`                 | `/telefun/realtime/openai/webrtc/sessions/:sessionId/call` | Always `404`; no auth, body parse, provider, SDP, media, or start work. |
| `OPTIONS` for `POST`   | same                                                       | Always `404`.                                                           |
| `OPTIONS` for `DELETE` | same                                                       | Exact-origin cleanup CORS only.                                         |
| `DELETE`               | same                                                       | Authenticated owner-bound cleanup only.                                 |

`DELETE` requires an exact allowed origin, bearer token, active
admin/trainer profile, ownership, historical `openai-webrtc` transport, and a
recognized historical realtime model. It never accepts a Gemini row as cleanup.

For a bound attempt, the encrypted provider-call reference is read only by the
server-side durable-attempt boundary. The cleanup manager receives a strict
server-only decrypt callback, validates the resulting call ID against its stored
hash, and can issue only the documented hangup request. It cannot create a call,
construct SDP, open a sideband, send media, score audio, or emit new usage.

- A missing or invalid cleanup key/reference/call ID leaves the attempt
  retryable and returns the established safe `503` finalization response.
- A no-attempt terminalization may complete locally. An orphan with no encrypted
  reference is terminalized locally only when a server-side lookup proves that
  no provider call was bound; otherwise it remains retryable.
- Successful durable cleanup is `204`; lifecycle conflict is `409`; foreign,
  absent, or nonhistorical rows are hidden as `404`.

A deprecated cached-module shell may fail closed before any media or provider
work. It is not wired into a new Telefun flow; the only functional browser
compatibility request is an owner-bound `DELETE`.

### Historical scoring and pricing

- A valid cached historical voice assessment is returned unchanged and makes no
  provider or usage call.
- A terminal uncached historical OpenAI realtime row is permanently failed with
  `410 TELEFUN_OPENAI_SCORING_DISABLED`; it is not retried, requeued, sent to
  Gemini, or logged as new usage.
- An active/pending historical WebRTC lifecycle row remains cleanup-owned and
  is not scored.
- Retirement detection uses both stored model and transport so transport-only
  historical rows receive the same treatment.
- Existing `ai_usage_logs` and realtime price snapshots remain immutable and
  readable. Historical realtime pricing is display-only/read-only.

## API and data access

The API routes retain existing owner/auth/RLS and error behavior for:

- session and history reads;
- signed recording access and recording reconciliation;
- feedback projection from an existing canonical voice assessment;
- monitoring usage/history reads; and
- historical pricing display.

No historical attempt, recording, transcript, usage row, assessment, or pricing
snapshot is deleted, rewritten, or backfilled because the realtime path is
retired.

## Environment

### Telefun service

| Variable                           | Meaning                                                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY`                   | Required Gemini Live credential.                                                                                     |
| `OPENAI_API_KEY`                   | Optional, server-only historical hangup credential; never enables Telefun OpenAI Realtime.                           |
| `TELEFUN_OPENAI_WEBRTC_ORPHAN_KEY` | Optional server-only key for encrypted historical cleanup references. Missing/invalid values fail cleanup retryably. |
| `ALLOWED_ORIGINS`                  | Exact production origins; applies to the cleanup `DELETE` CORS boundary.                                             |
| `TELEFUN_INTERNAL_TOKEN`           | Independent internal scoring-worker health credential; it does not enable OpenAI scoring.                            |

All `TELEFUN_OPENAI*` enablement, cohort, allowlist, and model-rollout inputs
are retired no-ops. They must not be used in deployment instructions or as a
future feature flag.

### Direct OpenAI text is separate

`OPENAI_API_KEY` in `apps/api` remains required for existing direct OpenAI text
operations such as KETIK, PDKT, and QA. Those models and their pricing/usage
paths are outside Telefun retirement. Telefun never exposes this key to the
browser.

## Verification

Run fake/unit checks only; do not call a provider, perform paid/manual smoke,
run remote cleanup, migrate data, or deploy as evidence for this change.

```bash
pnpm --filter @trainers/telefun exec vitest run \
  src/realtime-webrtc/call-manager.test.ts \
  src/realtime-webrtc/http-broker.test.ts \
  src/realtime-webrtc/orphan-cleanup.test.ts \
  src/realtime-webrtc/contracts.test.ts

pnpm --filter @trainers/api exec vitest run \
  src/__tests__/telefun-routes.test.ts \
  src/__tests__/telefun-scoring-routing.test.ts \
  src/__tests__/telefun-scoring-service.test.ts

pnpm --filter @trainers/web exec vitest run \
  src/__tests__/telefun-live-session-auth.test.ts \
  src/__tests__/telefun-transport.test.ts \
  src/__tests__/telefun-web-rtc-capability.test.ts
```

## Archived pre-retirement material

The Phase 1–7 OpenAI WebRTC/sideband/provider-start implementation notes remain
in `docs/rebuild-logs/` and the historical ADR/audit files as evidence only.
They do **not** describe a supported runtime, deployment configuration, scoring
flow, browser transport, or provider test plan. This document supersedes their
active-operation guidance.

## Simulation subject attribution

- `POST /telefun/sessions` menerima `simulationSubject` opsional (`self` | `participant` + UUID); omit → `self`. Response/list/detail memproyeksikan `simulationSubject` camelCase via `projectTelefunHistoryRow` (server wins).
- Kolom `simulation_subject_*` nullable di `telefun_history` (FK `SET NULL`, CHECK eksplisit, trigger immutable + validasi snapshot vs role). `apps/telefun/src/db.ts:createSession` menerima subject opsional (default self).
- Frontend simpan selection + snapshot di active-session config; fallback creation kirim selection (fresh lookup waktu fallback); record lokal tanpa konfirmasi bertanda `unsynced`, tidak diklaim authoritative.

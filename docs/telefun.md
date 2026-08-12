# Telefun — Dokumentasi Modul Lengkap

> **TELEFUN** = **Tele**phone **Fun**
> Modul simulasi panggilan suara untuk melatih agen menangani telepon.
> Mendukung baseline **Gemini Live API** (default) dan jalur **OpenAI Realtime WebSocket** yang ada. Jalur **OpenAI WebRTC** terintegrasi secara capability-gated ke **PhoneInterface** dan tetap default-off; production hanya dapat dibuka untuk UUID exact allowlist (`gpt-realtime-2.1`; voice server-owned: `cedar` untuk male, `marin` untuk female/default); **LiveSession** tetap baseline untuk **Gemini/openai-audio**. Phase 4 menyediakan lifecycle/recording/scoring durable, sedangkan Phase 5 menambahkan distributed lease/quota, rate limit, orphan/network recovery, security boundary, dan observability. Gate P5 tetap partial sampai deployment/load, external security review, dan real-browser/network evidence benar-benar dijalankan.

Modul Telefun terdiri dari **3 layer** yang bekerja bersama:

1. **Frontend (React)** — UI untuk settings, panggilan, review, history
2. **Backend API (Hono)** — REST API untuk CRUD session, settings, recordings
3. **Proxy Server (WebSocket)** — Bridge antara frontend dan provider live API (Gemini Live / OpenAI Realtime) melalui **provider adapter pattern**

---

## 📋 Daftar Isi

1. [Arsitektur](#️-arsitektur)
2. [Struktur File](#-struktur-file)
   - [Frontend (apps/web)](#-frontend-appsweb)
   - [Backend API (apps/api)](#-backend-api-appsapi)
   - [Proxy Server (apps/telefun)](#-proxy-server-appstelefun)
3. [Behavior Modul](#-behavior-modul)
4. [Petunjuk Penggunaan](#-petunjuk-penggunaan)
5. [Prompt Perilaku Konsumen](#-prompt-perilaku-konsumen)
6. [API Endpoints](#-api-endpoints)
7. [Alur Data Lengkap](#-alur-data-lengkap)
8. [Testing](#-testing)
9. [Environment Variables](#-environment-variables)
10. [Catatan Penting](#-catatan-penting)

---

## 🏗️ Arsitektur

```
┌─────────────────────────────────────────────────────────────────────┐
│  FRONTEND (apps/web)                                                │
│  ┌──────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────────┐ │
│  │ Settings  │  │ Phone        │  │ Review/    │  │ History      │ │
│  │ Modal     │  │ Interface    │  │ Assessment │  │ Modal        │ │
│  └──────────┘  └──────┬───────┘  └────────────┘  └──────────────┘ │
│                        │                                            │
│              ┌─────────▼─────────┐                                  │
|              │  geminiService.ts   │  WebSocket client                │
|              │  + promptBuilder    │  (multi-provider protocol)      │
│              └─────────┬─────────┘                                  │
└────────────────────────┼────────────────────────────────────────────┘
                         │
              ┌──────────┼──────────┐
              │          │          │
         REST API    REST API   WebSocket
         (settings)  (sessions)  (live audio)
              │          │          │
              ▼          ▼          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  BACKEND API (apps/api)                    PROXY (apps/telefun)     │
│  ┌──────────────────┐   ┌──────────┐   ┌─────────────────────────┐ │
│  │ telefun.ts        │   │ Scoring  │   │ server.ts               │ │
│  │ sessions.ts       │   │ Worker   │   │   ─ WebSocket bridge    │ │
│  │ settings.ts       │   │          │   │   ─ reconnect logic     │ │
│  │ recordings.ts     │   │ Analysis │   │   ─ drain coordinator   │ │
│  │ annotations.ts    │   │ (AI)     │   │   ─ transcript          │ │
│  │ remux-recording.ts│   └──────────┘   │   ─ usage tracking      │ │
│  └────────┬─────────┘                   │   ─ provider adapter *  │ │
│           │                             └────────────┬────────────┘ │
└───────────┼──────────────────────────────────────────┼──────────────┘
│                                                      │
│                ┌─────────────────────────┐            │
│                │  Provider Adapter       │            │
│                │  ├─ GeminiLiveAdapter   │◄───────────┤
│                │  └─ OpenAIRealtimeAdapter           │
│                └────────────┬────────────┘            │
│                             │                         │
│                             ▼                         │
│                ┌──────────────────────┐               │
│                │  Gemini Live API     │  (WebSocket)  │
│                │  BidiGenerateContent │               │
│                └──────────────────────┘               │
│                             │                         │
│                             ▼                         │
│                ┌──────────────────────┐               │
│                │  OpenAI Realtime API │  (WebSocket)  │
│                │  gpt-realtime-2.1    │               │
│                │  gpt-realtime-2.1-mini               │
│                └──────────────────────┘               │
```

---

### Phase 3 OpenAI WebRTC integration (default off)

```text
Browser WebRTC media ──> OpenAI Realtime
Browser SDP offer/answer ──> Telefun broker (POST/DELETE raw application/sdp)
Telefun broker ──> OpenAI /v1/realtime/calls (multipart sdp + session)
Telefun broker ──> sideband wss://api.openai.com/v1/realtime?call_id=...
```

- Canonical model: `gpt-realtime-2.1`
- Canonical server-owned voice: `cedar` untuk consumer `male`; `marin` untuk `female`, null, atau blank
- Broker/session authority: active admin/trainer profile + owned pre-created `telefun_history` session only
- Baseline Gemini Live dan OpenAI WebSocket tetap unchanged
- No production UI cutover; Phase 3 memakai adapter WebRTC capability-gated di PhoneInterface, sementara LiveSession tetap baseline Gemini/openai-audio

### Phase 2 shared OpenAI observer (internal extraction)

- `openai-realtime-event-observer.ts` menjadi sumber kebenaran event OpenAI-only untuk jalur OpenAI Realtime WS dan WebRTC sideband.
- `openai-realtime-tool-coordinator.ts` menjaga eksekusi tool tetap di jalur WS; sideband hanya observasi/control server-side.
- Dedupe mengikuti scope aktif per item/response/call dengan kapasitas bounded; `sideband-client.ts` menolak frame terlalu besar lewat `SIDEBAND_MAX_FRAME_BYTES` sebelum parsing.
- Tidak ada UI cutover, default transport change, atau route change; `openai-webrtc` sekarang berjalan melalui PhoneInterface yang capability-gated, sementara LiveSession tetap baseline Gemini/openai-audio.

### Phase 4 durable lifecycle (implementation reality; rollout tetap off)

Phase 4 menambahkan lifecycle durable untuk jalur WebRTC tanpa mengubah Gemini atau OpenAI WebSocket legacy. Attempt memakai state `claimed → brokered → sideband_connected → ending → ended`; transcript checkpoint memiliki dedupe key dan sequence; usage memakai request ID stabil dan tidak mensintesis token/cost ketika metadata tidak lengkap.

Untuk end normal maupun failed, manager menjalankan barrier yang sama:

```text
beginFinalization
  → provider hangup saat admission sideband masih open
  → sealAdmission (synchronous)
  → bounded drain (default 5 detik)
  → close sideband
  → flush + checkpoint transcript
  → persist usage atau audit incomplete
  → finalizeAttempt / terminalisasi durable
```

Frame yang masuk sebelum seal tetap dapat diproses. Timeout/failure pada hangup, drain, checkpoint, usage, atau terminal RPC mempertahankan attempt pada state retryable dan tidak boleh menghasilkan sukses palsu. `DELETE /telefun/realtime/openai/webrtc/sessions/:sessionId/call` mengembalikan `204` hanya setelah kontrak terminal durable (atau terminalisasi no-attempt yang idempotent) terbukti; kegagalan durable yang dapat dicoba ulang mengembalikan `503`, sehingga browser mempertahankan owner dan dapat mengulang request dengan key yang sama. Konflik mengembalikan `409`; detail provider/database tidak dikirim ke client.

Graceful shutdown menolak WebRTC start baru, mengambil snapshot binding yang sedang berjalan, dan memberi setiap binding paling banyak dua percobaan finalisasi bounded dengan finalization key yang sama. HTTP close dan manager drain harus sama-sama selesai sebelum `process.exit(0)`; penolakan manager, kegagalan HTTP close, atau deadline terbatas berakhir pada `process.exit(1)`. Default manager: sideband drain 5 detik, provider hangup 15 detik, persistence 10 detik, dan shutdown 30 detik; timeout tetap fail-closed.

#### Recording readiness dan scoring

- Remux memproses semua sibling lebih dahulu. Untuk WebRTC, `mark_telefun_recording_ready` dipanggil **sekali** dengan seluruh output seekable yang berhasil, bukan sekali per file.
- Output diklasifikasikan sebagai `created`, `preexisting`, `unknown`, atau `none`; readiness sebagai `persisted`, `confirmed-unpersisted`, atau `ambiguous`. Jika RPC error/empty, route membaca kembali `id`, `user_id`, `status`, `telefun_transport`, kedua path recording, status/error recording, dan field scoring sebelum membersihkan objek.
- Hanya output `created + confirmed-unpersisted` yang boleh dihapus. Output `preexisting`, `unknown`, atau `ambiguous` dipertahankan. Raw original dihapus hanya setelah field DB yang tepat terbukti menunjuk ke path seekable. Hasil yang tidak dapat direkonsiliasi mengembalikan `503 RECORDING_RECONCILIATION_AMBIGUOUS`; state yang diketahui belum tersimpan mengembalikan `503 RECORDING_STATE_UNAVAILABLE`.
- Completion scoring mengunci row `telefun_history` dengan `FOR UPDATE`. Capture gagal pada WebRTC mengubah `recording_status` menjadi `failed`, membersihkan claim/retry/readiness, dan bila scoring sedang `processing` mengubahnya menjadi `failed`. Completion yang kalah race membaca row terkunci dan mengembalikan `false`; API/worker mengklasifikasikannya sebagai `SCORING_NOT_READY` tanpa menimpa failed-capture latch atau melakukan re-enqueue.

#### Reconciliation recording di browser

Queue browser memakai key `telefun_recording_reconciliation:v1` dan hanya menyimpan path Storage deterministic serta metadata bounded. Queue bersifat owner-scoped oleh UUID user aktif, maksimal **32** entry, TTL **7 hari** (`604800000` ms), dedupe satu entry per `telefun-recording:<userId>:<sessionId>`, dan tidak pernah menyimpan blob, access token, prompt, SDP, provider ID, object URL, atau raw exception.

Dua fase queue adalah `recording_transition_pending` (ditulis sebelum request transition pertama) dan `remux_pending` (setelah response transition valid `200`). Drain hanya menjalankan entry user yang sedang login, satu drain per halaman, dipicu oleh enqueue, load/auth readiness, `online`, halaman visible, dan timer due. Retry otomatis dibatasi **8** percobaan dengan delay `1s, 2s, 5s, 10s, 30s, 60s, 300s, 900s`; setelah percobaan ke-8 entry menjadi exhausted dan tetap disimpan sampai sukses, penghapusan non-retryable yang eksplisit, atau TTL. Queue tidak menghapus objek Storage dan tidak menggantikan server-side orphan recovery Phase 5; sifatnya per-device dan reload-safe.

#### Ownership cleanup WebRTC

Setup WebRTC mendaftarkan in-memory cleanup owner sebelum transport dibuat. Owner hanya memanggil DELETE session-bound `?outcome=failed`; hanya status `204` yang mengonfirmasi cleanup. Jika request gagal, component tetap mounted, guard end dibuka kembali, dan tombol existing **“Coba lagi mengakhiri panggilan”** melakukan satu retry bounded per klik tanpa navigasi sebelum konfirmasi.

Object URL full-call memiliki satu owner halaman (`retainedObjectUrlRef`). Session hanya boleh mengembalikan `retainObjectUrl: true` jika callback sudah mentransfer URL non-null ke owner tersebut; owner revoke satu kali saat review ditutup, record dihapus/diganti, unmount, atau abandoned flow. URL tidak masuk ke queue durable.

Recording capture/reconciliation dan scoring readiness tersebut adalah behavior aktual pada source saat ini. Fake/static Phase 4 verification lulus dan hosted inspection membuktikan migration/security boundary terpasang; standalone rollback Phase 4, paid provider, deployment, dan real-browser runtime belum dibuktikan.

### Phase 5 distributed hardening (implementation reality; Gate P5 partial)

- Lease dan session cap lintas replica memakai RPC atomic dengan TTL/heartbeat. Kehilangan lease sekarang memicu finalisasi `network_lost` dan provider hangup segera; release bertoken tetap dicoba setelah finalisasi agar lease terminal tidak menunggu orphan sweep.
- Rate limit session create/write dan broker start memakai window database per user/session/provider dan fail-closed ketika RPC unavailable.
- Worker orphan meng-claim lease expired, mendekripsi opaque provider reference server-only, menutup provider/sideband secara bounded, lalu menulis outcome `orphaned`; cleanup yang belum lengkap kembali retryable.
- Browser mengklasifikasikan network/ICE/data-channel failure sebagai `network_lost` dan device track end sebagai `device_unplugged`. UI tidak melakukan silent recreate; recovery membutuhkan session boundary baru dan discontinuity yang eksplisit.
- Production origin harus exact HTTPS, provider URL fixed server-side, request/response body dan timeout bounded, serta CSP/Permissions Policy dibatasi. `TELEFUN_OPENAI_WEBRTC_ORPHAN_KEY` minimal 32 karakter dan tidak boleh menjadi `VITE_*`.
- Metrics yang diizinkan hanya cost reconciliation, sideband disconnect, duplicate write, missing usage, orphan, dan session cap. User dikorelasikan dengan SHA-256 `user_id_hash`, bukan UUID mentah; missing usage tetap audit state, bukan zero sintetis.
- `/health` tetap non-billable dan tidak claim lease, consume quota, membuka provider/sideband, atau menulis usage.

Implementasi ini tetap default-off. Hosted production database migration/RLS/grants dan canonical Phase 5 rollback/reapply sudah dibuktikan pada 2026-08-10 setelah stale OpenAI WebRTC state direkonsiliasi; baseline Gemini sebelum/sesudah identik dan provider call nol. Gate P5 keseluruhan tetap partial karena Railway restart/deployment, load lintas replica, real-browser/device/network matrix, external security review, dan paid provider call belum dibuktikan.

## 📁 Struktur File

### 🖥️ Frontend (apps/web)

**Halaman utama:** `apps/web/src/routes/telefun/`

```
routes/telefun/
├── index.tsx                    # Entry page — landing, call, settings, history
├── replay.tsx                   # Halaman replay/review sesi
├── telefunSettings.ts           # Tipe & default settings (scenarios, consumer types, identity)
├── telefunApi.ts                # API calls ke backend (settings, sessions, history)
├── telefunVoiceRegistry.ts      # Mapping voice Gemini Live + GPT Realtime per gender
├── recordingPath.ts             # Helpers recording path
├── sessionFinalizer.ts          # Finalisasi session dari sisi client
├── types.ts                     # Tipe CallRecord dll
│
├── services/
│   ├── geminiService.ts         # WebSocket client ke proxy + setup message
│   ├── promptBuilder.ts         # ★ Build system instruction prompt untuk Gemini
│   ├── liveProtocol.ts          # Format setup message Gemini Live JSON
│   ├── telefun-recording-remux-service.ts  # Client-side recording remux (dipanggil sessionFinalizer)
│   ├── telefun-recording-reconciliation.ts # Queue controller/triggers for path-only retries
│   ├── telefun-recording-reconciliation-queue.ts # Queue schema, validation, storage, retry helpers
│   ├── simulationChallenges.ts              # Registry ID, label, dan instruksi prompt
│   ├── reviewTypes.ts                       # Tipe aktif voice dashboard dan replay
│   └── openaiWebRtc/                        # Adapter WebRTC capability-gated Phase 3 (default-off)
│       ├── brokerApi.ts                     # SDP broker call/delete ke Telefun
│       ├── cleanup.ts                       # Cleanup peer, data channel, audio
│       ├── contracts.ts                     # Contract browser POC + timeout
│       ├── events.ts                        # Parser data-channel event
│       └── openaiWebRtcSession.ts           # Orkestrasi WebRTC adapter capability-gated
│
├── hooks/
│   └── useTelefunHoldClock.ts   # Hook timer untuk hold
│
├── components/
│   ├── PhoneInterface.tsx       # ★ UI utama panggilan (dial, mute, hold, transcript)
│   ├── SettingsModal.tsx        # ★ Modal settings (scenarios, consumer, identity, system)
│   ├── HistoryModal.tsx         # Riwayat panggilan
│   ├── ReviewModal.tsx          # Review detail sesi + voice assessment
│   ├── TelefunTranscript.tsx    # Transcript chat display
│   ├── VoiceAssessmentSection.tsx  # Visual assessment suara
│   ├── VoiceEvaluationDashboard.tsx # Dashboard evaluasi
│   ├── VoiceRadarChart.tsx / VoiceRadarChartInner.tsx  # Radar chart
│   ├── VoiceMetricCards.tsx     # Metric cards
│   ├── HoldStatusDisplay.tsx    # Hold status indicator
│   ├── HoldAssessmentCard.tsx   # Hold assessment card
│   ├── DurationSelector.tsx     # Pemilih durasi panggilan
│   ├── MicrophoneActivityWaveform.tsx  # Waveform mic
│   ├── MaintenanceModal.tsx     # Modal akses terbatas
│   ├── CommunicationProfileZoomModal.tsx # Zoom profil komunikasi
│   ├── ReplayAnnotator.tsx      # Annotator replay
│   ├── reviewModalLoadState.ts   # Load state review
│   ├── telefunTranscriptFormatters.ts  # Formatter transcript
│   ├── duration-validation.ts    # Validasi durasi
│   └── settings/
│       ├── TelefunScenariosTab.tsx    # ★ CRUD skenario
│       ├── TelefunConsumersTab.tsx     # CRUD tipe konsumen
│       ├── TelefunIdentityTab.tsx      # Settings identitas
│       ├── TelefunSystemTab.tsx        # Settings sistem (model, dsb)
│       ├── useTelefunSettingsDraft.ts  # Draft state management
│       └── telefunDraftNormalizers.ts  # Normalizer data draft
```

### 🔧 Backend API (apps/api)

```
apps/api/src/
├── routes/
│   ├── telefun.ts                    # Route utama — mount sub-routes + requireRole
│   └── telefun/
│       ├── sessions.ts               # CRUD session + history
│       ├── settings.ts               # GET/PUT settings (user_settings.telefun)
│       ├── recordings.ts             # Recording access & signed URLs
│       ├── annotations.ts            # Annotations (RPC-based)
│       └── remux-recording.ts        # Remux recording (ffmpeg)
│
├── lib/
│   ├── telefun-analysis.ts           # ★ Voice quality assessment (AI) + coaching summary
│   ├── telefun-openai-assessment.ts  # Internal client untuk assessment OpenAI
│   ├── telefun-hold-assessment.ts    # Hold behavior assessment
│   ├── telefun-communication-profile.ts # Communication profile builder
│   ├── telefun-scoring-errors.ts     # Error types scoring
│   └── telefun-ffmpeg.ts             # FFmpeg wrapper
│
├── services/
│   └── telefun-scoring-service.ts    # Scoring worker logic
│
├── workers/
│   └── telefun-scoring-worker.ts     # Background worker untuk scoring
│
└── __tests__/
    ├── telefun-routes.test.ts
    ├── telefun-assessment-boundary.test.ts
    ├── telefun-scoring-service.test.ts
    ├── telefun-scoring-worker-integration.test.ts
    ├── telefun-hold-assessment.test.ts
    ├── telefun-analysis-hold.test.ts
    ├── telefun-communication-profile.test.ts
    ├── telefun-recording-access.test.ts
    ├── telefun-schema-contract.test.ts
    ├── telefun-session-transcript-route.test.ts
    ├── telefun-monitoring-review-transcript.test.ts
    ├── telefun-annotations-rpc-contract.test.ts
    ├── telefun-scoring-errors.test.ts
    ├── telefun-scoring-retry-migration.test.ts
    ├── telefun-scoring-repair-migration.test.ts
    ├── telefun-scoring-route-ownership.test.ts
    ├── telefun-scoring-concurrent-retry.test.ts
    ├── telefun-scoring-lifecycle-schema.test.ts
    ├── telefun-remux-route.test.ts
    └── telefun-scoring-retry-migration.test.ts
```

### 🌐 Proxy Server (apps/telefun)

```
apps/telefun/
├── src/
│   ├── server.ts              # ★ Entrypoint — HTTP + WebSocket server
│   ├── server-protocol.ts     # Protocol detection & message helpers
│   ├── server-close.ts        # Close-code sanitizer
│   ├── session-drain.ts       # Legacy WebSocket graceful drain coordinator
│   ├── shutdown-coordinator.ts # Bounded HTTP/manager shutdown seam
│   ├── turn-taking.ts         # Turn state machine
│   ├── transcript.ts          # Real-time transcript collector
│   ├── usage.ts               # Token usage tracking & billing (dual-provider)
│   ├── db.ts                  # Supabase DB queries (session CRUD)
│   ├── internal-scoring-http.ts # Endpoint assessment internal terautentikasi
│   ├── internal-scoring-auth.ts # Timing-safe bearer-token validation
│   ├── scoring-audio.ts       # Agent-only recording + FFmpeg PCM24k
│   ├── openai-voice-assessment.ts # Isolated GPT Realtime evaluator
│   ├── auth.ts                # JWT token verification
│   ├── env.ts                 # Environment validation (Zod) — Gemini + OpenAI key
│   └── providers/             # ★ Provider adapter + OpenAI observer/tool coordination
│       ├── ProviderAdapter.ts     # Interface
│       ├── openai-realtime-event-observer.ts # Shared OpenAI-only observer
│       ├── openai-realtime-tool-coordinator.ts # WS-only tool execution/follow-up
│       ├── GeminiLiveAdapter.ts   # Gemini Live implementation
│       └── OpenAIRealtimeAdapter.ts # gpt-realtime-2.1 / mini implementation
├── realtime-webrtc/          # Broker + durable lifecycle WebRTC, default-off
│   ├── broker-auth.ts        # Profile/session gate admin/trainer + owned active session
│   ├── call-manager.ts       # Durable lifecycle facade and provider binding
│   ├── call-manager-types.ts # Public manager contracts + binding state factory
│   ├── call-manager-finalization-barrier.ts # Provider hangup → sideband seal/drain/close
│   ├── call-manager-legacy-finalizer.ts # Legacy callback finalization and usage persistence
│   ├── call-manager-shutdown.ts # Bounded shutdown retries and failure aggregation
│   ├── call-manager-utils.ts  # Shared bounded timeout/duration helpers
│   ├── durable-db.ts         # Attempt/transcript/usage/finalization/Phase 5 RPC boundary
│   ├── distributed-lease.ts  # Atomic lease heartbeat/loss/release coordinator
│   ├── orphan-cleanup.ts     # Restart-safe orphan claim/provider cleanup worker
│   ├── observability.ts      # Bounded metric/redaction + hashed user correlation
│   ├── provider-reference.ts # AES-GCM opaque provider reference
│   ├── contracts.ts          # Canonical POC session/model/voice contract
│   ├── http-broker.ts        # POST/DELETE application/sdp endpoint
│   ├── openai-calls-client.ts # Multipart /v1/realtime/calls + Location/call_id parsing
│   ├── sideband-client.ts    # OpenAI sideband control socket + frame cap
│   └── sideband-event-observer.ts # Observation-only transcript/usage observer with scoped dedupe
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 🎯 Behavior Modul

### Alur Penggunaan

```
1. BUKA halaman Telefun → pilih scenario + consumer type + model/provider di settings
        │
2. TEKAN tombol "Mulai Panggilan"
        │
3. SISTEM:
   a. Kirim POST /api/v1/telefun/sessions → buat record di telefun_history
   b. Connect WebSocket ke proxy (apps/telefun) dengan JWT token
   c. Kirim configure message (model ID, transport, voice, instructions)
   d. Proxy pilih provider adapter sesuai transport:
      - Gemini: setup Gemini Live → tunggu setupComplete
      - OpenAI: session.update → tunggu session.created
        │
4. MULAI PERCAKAPAN:
   a. User bicara → microphone → audio → WebSocket → proxy → provider API
   b. Provider merespons → audio → proxy → WebSocket → speaker user
   c. Real-time transcript muncul di UI
   d. Hold/mute bisa digunakan kapan saja
        │
5. AKHIRI PANGGILAN:
   a. User klik "Tutup" → kirim session_end_request
   b. Proxy tunggu AI selesai bicara (drain: 2s quiet atau 10s hard limit)
   c. Session difinalisasi → transcript disimpan → usage dicatat
   d. Frontend kembali ke home setelah penyimpanan rekaman/remux selesai; scoring tidak memblokir navigasi dan memperbarui riwayat saat hasil tersedia
        │
6. SCORING (background dari perspektif UI):
   a. Setelah home tampil, frontend memicu endpoint scoring yang melakukan atomic claim
   b. Worker menangani job queued/retry yang belum diklaim jalur frontend
   c. Analisis voice quality (AI) + hitung hold assessment
   d. Simpan score, feedback, voice assessment
        │
7. REVIEW:
   Buka history → lihat transcript, score, voice radar, komunikasi profil
```

### Role Access

| Role        | Akses Telefun                                                          |
| ----------- | ---------------------------------------------------------------------- |
| **Admin**   | ✅ Full — settings, call, history, review, monitoring                  |
| **Trainer** | ✅ Full — settings, call, history, review, monitoring                  |
| **QA**      | ❌ Diblokir — backend `requireRole("admin","trainer")` + frontend gate |
| **Leader**  | ❌ Diblokir — maintenance modal "Akses Terbatas"                       |
| **Agent**   | ❌ Diblokir — maintenance modal "Akses Terbatas"                       |

Catatan Phase 3–5: browser adapter `openaiWebRtc/` terintegrasi lewat `PhoneInterface` sebagai jalur capability-gated default-off; production hanya dapat dibuka untuk UUID exact allowlist. `LiveSession` tetap baseline Gemini/openai-audio. Lifecycle/recording/scoring Phase 4 dan distributed hardening Phase 5 sudah ada di source. Hosted database subgate—including reconciliation serta transactional rollback/reapply—sudah PASS tanpa perubahan baseline Gemini, tetapi Gate P5 keseluruhan masih partial dan tidak mengubah default provider. Barge-in parity serta bukti deployment/load/real-browser tetap lanjutan.

### Session States

```
pending → active → completed
                → failed
```

| Status      | Arti                          |
| ----------- | ----------------------------- |
| `pending`   | Session dibuat, belum dimulai |
| `active`    | Panggilan sedang berlangsung  |
| `completed` | Panggilan selesai normal      |
| `failed`    | Error — panggilan gagal       |

### Scoring Lifecycle

```
Session selesai (completed)
        │
        ▼
enqueue_telefun_scoring() → job status: queued
        │
        ▼
claim_telefun_scoring() → job status: processing
        │
        ▼
analyzeVoiceQuality() [AI]
  ├─ Speaking rate (WPM)
  ├─ Intonation
  ├─ Articulation
  ├─ Filler words
  ├─ Emotional tone
  └─ Overall score
        │
        ▼
evaluateTelefunHoldAssessment() [deterministic]
  ├─ Hold duration
  ├─ Hold intervals
  └─ Exceeded count
        │
        ▼
Patch telefun_history → score, feedback, voice_assessment
```

### Hold Behavior

| Aspek           | Detail                                                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hold pertama    | Maksimal **1 menit**                                                                                                                                        |
| Hold berikutnya | Maksimal **3 menit**                                                                                                                                        |
| Countdown       | UI tampilkan + peringatan 10 detik terakhir                                                                                                                 |
| Overtime        | Tampilkan `+MM:SS` setelah batas                                                                                                                            |
| Penilaian       | **Deterministik** (bukan AI): Baik (score **10**, semua ≤ batas) atau Kurang (score **4**, ada yang melebihi). Final score: `(aiScore × 5 + holdScore) / 6` |
| Saat hold       | Mikrofon user dimute **+ audio AI diblokir** (`suppressGeminiAudio: true`)                                                                                  |

### Prompt-first conversation challenges

Tempo `realistic` dan `training_fast` tetap menjadi kontrol terpisah. Tantangan percakapan bersifat opsional dan dipilih dari registry `simulationChallenges.ts` dengan batas maksimal tiga pilihan. Daftar yang dipilih dimasukkan ke system prompt Gemini Live; model hanya menggunakannya saat konteks mendukung, paling banyak satu perilaku per giliran, tanpa memaksa seluruh tantangan.

Tanpa challenge `interruption`, konsumen AI wajib menunggu agen selesai berbicara atau memberi jeda yang jelas. Izin untuk menyela secara sopan hanya ditambahkan ke prompt ketika challenge tersebut dipilih.

Tidak ada lagi orchestrator atau engine realistic-mode di browser. Playback hanya dihentikan oleh event native `serverContent.interrupted`, tombol hold, atau lifecycle transport. VAD lokal tetap dipakai untuk volume, speech segments, dan pengiriman audio, tetapi tidak membatalkan playback atau mengirim prompt interupsi.

### Auto Hangup

Durasi panggilan dibatasi sesuai `maxCallDuration` oleh timer aplikasi. Timer memicu cue bertahap via `getTimeCueInstruction()` di `promptBuilder.ts`; model tidak menerima durasi total dan tidak menghitung sisa waktu sendiri.

| Sisa Waktu | Aksi AI (konsumen)           |
| ---------- | ---------------------------- |
| 2 menit    | Mulai arah ke penutup        |
| 1 menit    | Persiapan penutupan          |
| 30 detik   | Mulai tutup percakapan       |
| 20 detik   | HARUS tutup telepon sekarang |

Semua cue diawali marker `[TELEFUN_CONTROL:TIME_CUE]` yang sudah dikontrakkan di system prompt awal. Gemini menerima marker lewat `realtimeInput.text`, sedangkan OpenAI menerima conversation item `role: "system"` lalu `response.create`. Marker bukan ucapan agen dan tidak boleh disebutkan oleh konsumen AI.

---

## 📝 Petunjuk Penggunaan

### Sebelum Panggilan — Atur Settings

1. **Buka halaman Telefun** → klik ikon ⚙️ Settings
2. **Tab "Masalah"** (Scenarios):
   - Pilih skenario yang ada, atau tambah baru
   - Isi **judul** (misal: "Kartu ATM Tertelan")
   - Isi **instruksi** — panduan perilaku konsumen
   - Opsional: **skrip** — dialog atau poin alur percakapan
3. **Tab "Konsumen"** (Consumer Types):
   - Pilih tipe konsumen: Marah, Gaptek, Sedih (pasrah default-nya Hard), atau Netral
   - Tiap tipe punya emosi dan cara bicara berbeda
4. **Tab "Identitas"**:
   - Atur nama, gender, kota, no HP konsumen
   - Gemini Live dan GPT Realtime memfilter pilihan suara berdasarkan gender persona
   - Saat gender **Acak**, picker suara dinonaktifkan dan runtime memilih voice dari kelompok gender final
   - Gender voice GPT Realtime adalah metadata internal Telefun; OpenAI hanya menetapkan voice ID resmi
   - Voice `alloy` tetap diterima untuk kompatibilitas setting lama, tetapi dinormalisasi ke voice gender-aware saat sesi baru dibuat
5. **Tab "Sistem"**:
   - Pilih model (default: `gemini-3.1-flash-live-preview`)
   - Atur durasi maksimal panggilan
   - Mode: **Realistis** (natural) atau **Latihan Cepat** (lebih efisien)
   - Pilih maksimal 3 **Tantangan Percakapan (Opsional)** bila ingin latihan dengan variasi konteks

### Saat Panggilan

| Tombol            | Fungsi                          |
| ----------------- | ------------------------------- |
| 🎙️ **Mute**       | Matikan mikrofon                |
| ⏸️ **Hold**       | Tahan panggilan (dengan timer)  |
| 📝 **Transcript** | Lihat teks percakapan real-time |
| ⏹️ **Tutup**      | Akhiri panggilan                |

### Setelah Panggilan

1. **Kembali ke home** — Pengguna tidak perlu menunggu scoring untuk melanjutkan workflow.
2. **Loading** — Scoring berjalan di background (beberapa detik) dan hasilnya menyegarkan record sesi.
3. **Review** — Buka history, klik sesi untuk lihat:
   - Transcript lengkap
   - Voice assessment (radar chart)
   - Score & feedback
   - Hold assessment
   - Communication profile
   - Rekaman audio

### Settings Lanjutan

- **Default scenarios** bisa diubah permanen via UI (tersimpan di Supabase per user)
- **Consumer types** (emosi) juga bisa ditambah/edit di settings; entry legacy `pasrah` otomatis dinormalisasi ke `Hard` tanpa menghapus `name`/`gender`/`description` yang sudah dikustom
- **Tantangan percakapan** tersimpan sebagai daftar ID baru; settings legacy tetap dibaca in-memory agar kompatibel

---

## 🎭 Prompt Perilaku Konsumen

> Prompt konsumen hidup di **frontend** (`apps/web/`). Prompt awal dikirim sebagai `setup.systemInstruction` ke Gemini Live atau `session.update.instructions` ke OpenAI Realtime. Runtime time cue menggunakan jalur kontrol provider-aware yang dijelaskan di bagian Auto Hangup.

### File Utama

| File                          | Lokasi                                             | Fungsi                                                 |
| ----------------------------- | -------------------------------------------------- | ------------------------------------------------------ |
| **`promptBuilder.ts`**        | `apps/web/src/routes/telefun/services/`            | **Otak prompt** — membangun system instruction         |
| **`liveSession.ts`**          | `apps/web/src/routes/telefun/services/`            | Membangun setup provider dan mengirim runtime time cue |
| **`simulationChallenges.ts`** | `apps/web/src/routes/telefun/services/`            | Source of truth challenge dan kebijakan interruption   |
| **`telefunSettings.ts`**      | `apps/web/src/routes/telefun/`                     | Tipe data scenario, consumer type, identity            |
| **`TelefunScenariosTab.tsx`** | `apps/web/src/routes/telefun/components/settings/` | UI editor skenario                                     |

### Komponen Prompt

```
buildTelefunLiveSystemInstruction({
  identity,           → nama, gender, kota, no HP
  scenario,           → judul masalah + instruksi + skrip opsional
  consumerType,       → ID stabil + deskripsi lengkap persona
  responsePacingMode, → "realistic" | "training_fast"
  simulationChallengeTypes → maksimal tiga tantangan opsional
})
```

### Cara Mengubah

#### A. Via UI (Tanpa Coding)

1. Buka halaman **Settings Telefun** → tab **"Masalah"**
2. **Tambah/Edit skenario**:
   - `title` → Juduk masalah (misal: "Kartu ATM Tertelan")
   - `instruction` → 1-2 paragaf deskripsi masalah & perilaku konsumen
   - `script` (opsional) → Skrip percakapan detail (dialog / poin alur)
3. **Simpan** — skenario tersimpan di Supabase per user

#### B. Via Kode

**Edit `promptBuilder.ts`** — bagian yang bisa diubah:

| Fungsi / Variable                                  | Konten                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------ |
| `getEmotionInstruction()`                          | Mapping `consumerType.id` → guidance emosi + deskripsi lengkap           |
| `pacingInstruction` (variable)                     | Tempo bicara: `realistic` vs `training_fast`                             |
| `characterGenderInstruction` (variable)            | Konsistensi identitas gender; voice teknis diatur runtime                |
| `silentInstruction` (variable)                     | Cara relatif menangani agen diam tanpa menghitung detik                  |
| `simulationChallengeTypes`                         | Tantangan kontekstual dan interruption policy dari registry prompt-first |
| `scriptInstruction` (variable)                     | Hierarki fakta wajib, respons natural, dan urutan fleksibel              |
| `buildTelefunLiveSystemInstruction()` return value | **Prompt utama** untuk Gemini dan OpenAI                                 |
| `getTimeCueInstruction()`                          | Teks kontrol runtime dengan marker `TELEFUN_CONTROL:TIME_CUE`            |

**Tips:**

- Ingin konsumen lebih ngotot? → Edit fungsi `getEmotionInstruction()` di `promptBuilder.ts`
- Ingin tempo bicara berbeda? → Edit variable `pacingInstruction`
- Ingin konsumen pakai logat? → Tambahkan di `instruction` field scenario

`settings.systemInstruction` bukan lagi field aktif. Skenario dan builder di atas adalah source of truth; parser/save frontend membuang key legacy tersebut.

---

## 🔌 API Endpoints

### Backend API (apps/api) — prefix: `/api/v1/telefun`

Semua route membutuhkan role `admin` atau `trainer`.

| Method   | Endpoint                       | Deskripsi                                                        |
| -------- | ------------------------------ | ---------------------------------------------------------------- |
| `GET`    | `/sessions`                    | Ambil daftar session (admin/trainer: semua, lain: milik sendiri) |
| `POST`   | `/sessions`                    | Buat session baru                                                |
| `PATCH`  | `/sessions/:id`                | Update session (status, transcript, metrics, score)              |
| `GET`    | `/history/:id`                 | Detail session (dengan ownership check)                          |
| `DELETE` | `/history/:id`                 | Hapus session + file storage                                     |
| `DELETE` | `/history`                     | Hapus semua session user                                         |
| `GET`    | `/settings`                    | Ambil settings Telefun user                                      |
| `PUT`    | `/settings`                    | Simpan settings Telefun user                                     |
| `GET`    | `/recordings`                  | Daftar recording                                                 |
| `GET`    | `/recordings/:sessionId`       | Signed URL untuk akses recording                                 |
| `POST`   | `/recordings/:sessionId/remux` | Remux recording (ffmpeg)                                         |
| `POST`   | `/annotations`                 | Simpan annotasi                                                  |

### Proxy Server (apps/telefun)

| Endpoint                    | Type      | Deskripsi                                            |
| --------------------------- | --------- | ---------------------------------------------------- |
| `/health`                   | HTTP      | Health check (uptime, timestamp)                     |
| `/internal/telefun/scoring` | HTTP      | Assessment OpenAI internal; bearer token, tanpa CORS |
| `/` atau `/ws`              | WebSocket | Koneksi real-time dengan Gemini                      |

#### OpenAI WebRTC integration (Phase 3–6 + provider-free Phase 7 Full candidate, default off)

| Method   | Endpoint                                                   | Deskripsi                                                |
| -------- | ---------------------------------------------------------- | -------------------------------------------------------- |
| `POST`   | `/telefun/realtime/openai/webrtc/sessions/:sessionId/call` | Raw `application/sdp`; body hanya SDP offer browser      |
| `DELETE` | `/telefun/realtime/openai/webrtc/sessions/:sessionId/call` | Idempotent hangup; `?outcome=failed` untuk cleanup gagal |

Catatan kontrak:

- `sessionId` wajib dari path UUID; broker menolak session foreign, terminal, pending, mismatch, atau auto-create fallback.
- Caller harus admin/trainer dengan profile ternormalisasi `active`, `is_deleted != true`, dan session owned/`active` yang sudah pre-created.
- Untuk `openai-webrtc`, API hanya membuat history setelah menerima `live_prompt_instructions` nonblank dari finalized simulation context. Snapshot itu dibangun oleh builder prompt yang sama dengan Gemini, memuat identity/verification facts, scenario/script data boundary, selected consumer name/description/difficulty/behavior, dan role rules; prompt kosong atau malformed ditolak sebelum provider call, tanpa generic identity/persona fallback.
- Broker membangun session JSON server-side dengan model `gpt-realtime-2.1`, voice `cedar` untuk consumer `male` atau `marin` untuk `female`/missing, `server_vad`, dan audio 24 kHz; browser tidak mengirim model, voice, instructions, atau session JSON. `interrupt_response=false` mempertahankan authority server config sambil membiarkan browser membatalkan hanya output yang benar-benar terdengar.
- `Location` dari upstream diparse menjadi `call_id` opaque; sideband `wss://api.openai.com/v1/realtime?call_id=...` adalah authority untuk transcript/usage/control server-side.
- Cleanup upstream memakai official OpenAI POST hangup; browser tetap hanya melihat DELETE broker yang idempotent.
- Transcript/usage failure diaudit; usage yang tidak lengkap tidak disintesis.
- Cleanup idempotent: browser close, DELETE berulang, atau `?outcome=failed` tidak menggandakan finalization. `204` berarti lifecycle durable sudah terminal; kegagalan persistence/barrier yang retryable menjadi `503` dan owner tetap dipertahankan.
- Phase 7 Full candidate memisahkan response generation dari `output_audio_buffer.started`/`stopped` dan state HTML media. Barge-in hanya menargetkan response/item audible yang sudah mempunyai kemajuan playback; blocked autoplay, pause/stall/end, serta interval hold/muted-output tidak dihitung ke `audio_end_ms`.
- Interruption memakai scoped `response.cancel(response_id)` hanya ketika response masih in progress, lalu WebRTC `output_audio_buffer.clear`, dan exact `conversation.item.truncate(item_id, content_index=0, audio_end_ms)`. Command dideduplikasi; error balapan yang berkorelasi melalui `event_id` tidak mengakhiri call, sedangkan provider error lain tetap fail-closed.
- Server-VAD speech/hold/interruption metrics ditutup secara deterministik saat finalization. Mute mikrofon tetap berbeda dari hold: hold menonaktifkan input dan menyupresi output tanpa merusak peer/recording graph; unhold mencoba playback lagi.
- Time cue memakai kontrak existing `[TELEFUN_CONTROL:TIME_CUE]` sebagai system item. `response.create` dikirim segera saat idle dengan marker internal berbatas di `response.metadata`; hanya `response.created` dengan marker yang sama lalu terminal response yang melepaskan acknowledgement manual. `response.created` dengan `metadata` absent/null diklasifikasikan sebagai server-VAD; metadata dengan shape lain atau marker mismatch menjadi unknown dan fail-closed. Create yang bertabrakan dengan response aktif, turn server-VAD yang belum menghasilkan `response.created`, atau create manual yang belum diakui ditunda; pending create terakhir dicoalesce sambil mempertahankan `event_id` pilihannya sampai lifecycle terminal idle. Barrier manual dan server-VAD tetap independen agar terminal response yang tidak berkorelasi tidak dapat memicu create baru. Kontrak ini mencegah provider error `conversation_already_has_active_response` yang ditemukan saat time cue 20 detik bertabrakan dengan response otomatis. Browser tetap tidak memperoleh `session.update` atau authority model/voice/instructions.
- MediaRecorder mencoba MIME yang benar-benar didukung (WebM/Opus, WebM, MP4) sebelum constructor tanpa options. Blob memakai MIME recorder/variant yang benar-benar dipilih, bukan label WebM hardcoded.
- Semua bukti Phase 7 pada candidate ini provider-free/unit/fake-browser dan lokal. Candidate belum dibuktikan di physical browser/device atau production Vercel, belum live/deployed dari change set ini, dan tidak menyelesaikan parity lintas browser. Mini, fallback policy, serta keputusan deprecation OpenAI WebSocket tetap deferred; Gemini dan legacy OpenAI WebSocket tidak berubah.

#### WebSocket Protocol (Client → Proxy → Gemini)

**Setup:**

```json
{
  "setup": {
    "model": "models/gemini-3.1-flash-live-preview",
    "systemInstruction": { "parts": [{ "text": "system prompt..." }] },
    "voiceConfig": { "prebuiltVoiceConfig": { "voiceName": "Aoede" } }
  }
}
```

**Audio input:**

```json
{
  "realtimeInput": {
    "mediaChunks": [
      { "data": "base64audio...", "mimeType": "audio/pcm;rate=16000" }
    ]
  }
}
```

**Session end:**

```json
{ "type": "session_end_request", "reason": "user" }
```

---

## 🔁 Alur Data Lengkap

### Transcript Flow

```
Gemini (audio chunks)
  → proxy server-protocol.ts (extractGeminiTranscriptionChunks)
  → proxy transcript.ts (append → commitTurn)
  → proxy server.ts (finalizeSessionOnce → updateSession ke DB)
  → Frontend review (parseTelefunTranscript → display)
```

### Usage/Billing Flow

```
Gemini (usageMetadata)
  → proxy usage.ts (observeLiveUsageMetadata → accumulate)
  → turnComplete/interrupted (commitPendingLiveUsageTurn)
  → proxy server.ts (flushLiveUsage)
  → insert ke ai_usage_logs (dengan cost calculation + modality breakdown)
```

### Scoring Flow

```
Session completed
  → enqueue_telefun_scoring (DB RPC)
  → telefun-scoring-worker.ts (claim job)
  → telefun-scoring-service.ts (process)
    → telefun-analysis.ts (provider-matched routing)
        • Gemini live model  → telefun-analysis.ts (Gemini 3.5 Flash voice assessment)
        • OpenAI live model  → telefun-openai-assessment.ts (HTTP → Telefun internal endpoint)
            → Telefun service: internal-scoring-http.ts (auth via TELEFUN_INTERNAL_TOKEN)
                → scoring-audio.ts (load ONLY claimed agent recording + FFmpeg 24 kHz PCM16)
                → openai-voice-assessment.ts (isolated GPT Realtime, model-exact evaluator)
                → usage.ts (log telefun/voice_assessment dengan exact model + modality usage)
                → return untrusted assessment JSON ke API
    → telefun-hold-assessment.ts (deterministic hold score)
  → API validates canonical schema lalu patch telefun_history (score + voice_assessment)
```

OpenAI assessment bersifat fail-closed: kegagalan endpoint, Realtime, validasi,
atau usage logging tidak pernah fallback diam-diam ke Gemini. API tetap menjadi
pemilik queue dan satu-satunya layer yang menyimpan hasil assessment final.

---

## 🧪 Testing

### Frontend

```bash
pnpm --filter @trainers/web test -- src/routes/telefun/
pnpm --filter @trainers/web test:fast
```

### Backend API

```bash
pnpm --filter @trainers/api test -- telefun
```

### Proxy Server

```bash
pnpm --filter @trainers/telefun test
pnpm --filter @trainers/telefun test:core
```

### Phase 3 OpenAI WebRTC Verification (fake upstream/browser only)

```bash
pnpm --filter @trainers/telefun test -- realtime-webrtc
pnpm --filter @trainers/web test -- telefun-openai-webrtc telefun-live-session-auth telefun-live-session-openai telefun-live-session-drain telefun-live-session-playback telefun-openai-live-protocol
```

- Suite di atas memakai fake upstream dan fake browser harness; tidak ada paid/manual OpenAI call.
- `LiveSession` tetap baseline WebSocket untuk Gemini/openai-audio; `openai-webrtc` berjalan melalui adapter capability-gated di PhoneInterface dan diuji lewat fake-boundary coverage.

### Phase 2 OpenAI Realtime Shared Observer Verification

```bash
pnpm --dir apps/telefun exec vitest run src/providers/openai-realtime-event-observer.test.ts src/providers/openai-realtime-tool-coordinator.test.ts src/providers/OpenAIRealtimeAdapter.test.ts src/realtime-webrtc/sideband-event-observer.test.ts src/realtime-webrtc/sideband-client.test.ts src/realtime-webrtc/call-manager.test.ts src/server-openai-wiring.test.ts src/providers/GeminiLiveAdapter.test.ts src/transcript.test.ts src/session-drain.test.ts src/__tests__/usage-modality.test.ts src/server-protocol.test.ts
pnpm --dir apps/telefun exec vitest run src/realtime-webrtc/http-broker.test.ts src/realtime-webrtc/openai-calls-client.test.ts src/realtime-webrtc/broker-auth.test.ts src/realtime-webrtc/contracts.test.ts src/realtime-webrtc/sideband-client.test.ts src/realtime-webrtc/sideband-event-observer.test.ts src/realtime-webrtc/call-manager.test.ts src/db-webrtc.test.ts
pnpm --dir apps/web exec vitest run src/__tests__/telefun-openai-webrtc-client.test.ts src/__tests__/telefun-live-session-auth.test.ts src/__tests__/telefun-live-session-openai.test.ts src/__tests__/telefun-live-session-drain.test.ts src/__tests__/telefun-live-session-playback.test.ts src/__tests__/telefun-openai-live-protocol.test.ts
pnpm test:core
```

- Suite ini memverifikasi shared observer parity, WS-only tool coordination, sideband observation-only behavior, bounded diagnostics/frame max, dan browser non-authority.
- `LiveSession` tetap baseline WebSocket; tidak ada paid/manual OpenAI call.

### Phase 4 evidence boundary

Bukti implementasi Phase 4 berupa fake-upstream/fake-browser tests, static migration-contract tests, typecheck, lint, build, dan diff hygiene dicatat pada [`rebuild-logs/phase-telefun-openai-webrtc-durable-lifecycle.md`](rebuild-logs/phase-telefun-openai-webrtc-durable-lifecycle.md). Verifikasi final setelah direct fix, independent audit, dan F6 RED→GREEN lulus untuk scope tersebut. Tidak ada paid/provider call, remote migration, local Postgres execution, deployment, atau browser visual/audio check yang diklaim.

### Phase 5 evidence boundary

Bukti distributed hardening dan batas verifikasinya dicatat pada [`rebuild-logs/phase-telefun-openai-webrtc-production-hardening.md`](rebuild-logs/phase-telefun-openai-webrtc-production-hardening.md). Hosted migration/RLS/grants dan rollback drill sekarang PASS; Gate P5 tetap partial karena Railway restart/deployment smoke, load lintas replica, external security review, serta real-browser/device/network matrix belum tersedia.

### Test Files Penting

| Layer   | File                                  | Coverage                            |
| ------- | ------------------------------------- | ----------------------------------- |
| Proxy   | `server-protocol.test.ts`             | Protocol detection, message parsing |
| Proxy   | `server-close.test.ts`                | Close-code mapping                  |
| Proxy   | `transcript.test.ts`                  | Transcript collection, dedup        |
| Proxy   | `session-drain.test.ts`               | Drain lifecycle                     |
| Proxy   | `usage-modality.test.ts`              | Usage tracking & billing            |
| Backend | `telefun-routes.test.ts`              | Session CRUD, access control        |
| Backend | `telefun-assessment-boundary.test.ts` | Boundary assessment                 |
| Backend | `telefun-scoring-service.test.ts`     | Scoring lifecycle                   |
| Backend | `telefun-hold-assessment.test.ts`     | Hold scoring                        |
| Backend | `telefun-analysis-hold.test.ts`       | Hold analysis integration           |
| Backend | `telefun-schema-contract.test.ts`     | DB schema contract                  |
| Backend | `telefun-recording-access.test.ts`    | Recording permission                |

---

## 🛠️ Environment Variables

### Proxy (apps/telefun) — dari `.env.local` root

| Variable                                           | Required                   | Default         | Deskripsi                                                                                                |
| -------------------------------------------------- | -------------------------- | --------------- | -------------------------------------------------------------------------------------------------------- |
| `PORT`                                             | ❌                         | `3002`          | Port server                                                                                              |
| `SUPABASE_URL`                                     | ✅                         | —               | Supabase URL                                                                                             |
| `SUPABASE_ANON_KEY`                                | ✅                         | —               | Anon key (auth)                                                                                          |
| `SUPABASE_SERVICE_ROLE_KEY`                        | ✅                         | —               | Service role (DB)                                                                                        |
| `GEMINI_API_KEY`                                   | ✅                         | —               | Gemini Live API key                                                                                      |
| `OPENAI_API_KEY`                                   | Jika OpenAI realtime aktif | —               | Khusus service Telefun untuk OpenAI Realtime; tidak pernah ke Frontend                                   |
| `TELEFUN_OPENAI_ENABLED`                           | ❌                         | `false`         | Kill switch OpenAI realtime                                                                              |
| `TELEFUN_OPENAI_WEBRTC_POC_ENABLED`                | ❌                         | `false`         | Phase 3 capability-gated broker/adapter + Phase 4 durable lifecycle; POST tetap off sampai gate terpisah |
| `TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS`           | ❌                         | kosong          | CSV UUID exact; harus sama dengan API; production tetap exact-cohort; kosong = deny-all                  |
| `TELEFUN_OPENAI_WEBRTC_PROVIDER_TIMEOUT_MS`        | ❌                         | `15000`         | Timeout upstream `POST /v1/realtime/calls`                                                               |
| `TELEFUN_OPENAI_WEBRTC_SIDEBAND_TIMEOUT_MS`        | ❌                         | `10000`         | Timeout koneksi sideband `wss://api.openai.com/v1/realtime?call_id=...`                                  |
| `TELEFUN_OPENAI_WEBRTC_ORPHAN_KEY`                 | Jika WebRTC aktif          | —               | Secret server-only minimal 32 karakter untuk opaque provider reference                                   |
| `TELEFUN_OPENAI_WEBRTC_LEASE_TTL_MS`               | ❌                         | `30000`         | TTL distributed lease                                                                                    |
| `TELEFUN_OPENAI_WEBRTC_LEASE_HEARTBEAT_MS`         | ❌                         | `10000`         | Heartbeat lease; harus lebih kecil dari TTL                                                              |
| `TELEFUN_OPENAI_WEBRTC_MAX_USER_SESSIONS`          | ❌                         | `1`             | Atomic active-session cap per user                                                                       |
| `TELEFUN_OPENAI_WEBRTC_MAX_PROVIDER_SESSIONS`      | ❌                         | `100`           | Atomic active-session cap provider                                                                       |
| `TELEFUN_OPENAI_WEBRTC_RATE_LIMIT_PER_MINUTE`      | ❌                         | `10`            | Distributed rate limit window                                                                            |
| `TELEFUN_OPENAI_WEBRTC_ORPHAN_CLEANUP_INTERVAL_MS` | ❌                         | `30000`         | Interval orphan cleanup                                                                                  |
| `TELEFUN_INTERNAL_TOKEN`                           | Jika OpenAI aktif          | —               | Shared server-only token; nilai sama dengan API                                                          |
| `ALLOWED_ORIGINS`                                  | ❌                         | exact allowlist | Exact origin list; wildcard ditolak oleh broker POC                                                      |
| `NODE_ENV`                                         | ❌                         | `"development"` | Mode                                                                                                     |

Untuk broker Phase 3, `ALLOWED_ORIGINS` harus berisi origin web yang persis sama; `*` tidak diterima.

Rollout WebRTC fail-closed: `TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS` hanya menerima CSV UUID yang valid dan harus identik di API serta Telefun. Development, staging, dan production memerlukan flag aktif **dan** UUID user yang exact-match; flag off atau cohort kosong berarti deny-all. Pengguna di luar cohort tetap memakai baseline Gemini dan tidak melihat capability WebRTC. Flag off menolak POST dan tidak membuka provider, tetapi authenticated DELETE yang session-bound tetap diizinkan sebagai exception cleanup untuk menandai session pre-created sebagai `failed`. DELETE bukan jalur start. Test otomatis dan smoke deployment tidak melakukan paid/provider call; live acceptance memakai bounded operator gate.

### Frontend — dari `VITE_*` env (via `.env.local` root)

| Variable                 | Required | Deskripsi                                                                                                |
| ------------------------ | -------- | -------------------------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`      | ✅       | Supabase URL                                                                                             |
| `VITE_SUPABASE_ANON_KEY` | ✅       | Supabase anon key                                                                                        |
| `VITE_TELEFUN_WS_URL`    | ✅       | WebSocket URL proxy (biasanya `ws://localhost:3002`) — dipakai di `liveProtocol.ts` & `geminiService.ts` |

### Backend API — server-only

| Variable                 | Required                    | Deskripsi                                        |
| ------------------------ | --------------------------- | ------------------------------------------------ |
| `OPENAI_API_KEY`         | Wajib untuk text generation | Key server-only API untuk direct text generation |
| `TELEFUN_INTERNAL_URL`   | Jika OpenAI aktif           | Origin privat service Telefun; hanya di API      |
| `TELEFUN_INTERNAL_TOKEN` | Jika OpenAI aktif           | Shared token yang sama dengan service Telefun    |

`OPENAI_API_KEY` bersifat server-only. API memakai key-nya sendiri untuk
text generation direct, sedangkan Telefun memakai `OPENAI_API_KEY` terpisah
hanya saat OpenAI Realtime diaktifkan. Frontend tidak pernah menerima key ini.
Endpoint `POST /internal/telefun/scoring` tidak menyediakan CORS dan hanya
menerima request server-to-server terautentikasi.

---

## ⚠️ Catatan Penting

1. **3 layer terpisah** — Frontend, Backend API, dan Proxy server berjalan independen. Pastikan semuanya running untuk simulasi penuh.
2. **Run perintah:**
   - `pnpm dev` — menjalankan web + api + telefun bersama
   - `pnpm --filter @trainers/telefun dev` — proxy saja
3. **Role access** — Hanya admin/trainer yang bisa mengakses Telefun. Leader/Agent diblokir.
4. **Prompt tidak di proxy** — Prompt konsumen ada di frontend (`promptBuilder.ts`), bukan di proxy server.
5. **Scoring async** — Setelah panggilan selesai, scoring berjalan di background worker. Bisa butuh beberapa detik.
6. **Reconnect** — Proxy otomatis reconnect ke Gemini sampai 3 kali jika koneksi putus.
7. **Hold deterministic** — Penilaian hold bukan pakai AI, tapi aturan tetap (timer-based).
8. **Final cost** — `max(perTokenCost, perMinuteCost)` — tidak double charge.
9. **Recording** — File rekaman di Supabase Storage bucket `telefun-recordings`, diakses via signed URL sementara.
10. **Model default** — `gemini-3.1-flash-live-preview`. Bisa diganti di settings ke model Gemini Live lain.

---

## 📄 Dokumen Terkait

| Dokumen                                                                                                                                | Isi                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [`TELEFUN_ASSESSMENT_CONTRACT.md`](TELEFUN_ASSESSMENT_CONTRACT.md)                                                                     | Kontrak penilaian suara: skala, target sistem, status, radar, staleness |
| [`AGENT_WORKFLOW.md`](AGENT_WORKFLOW.md)                                                                                               | Workflow pengembangan untuk AI agent                                    |
| [`architecture.md`](architecture.md)                                                                                                   | Arsitektur monorepo dan modul                                           |
| [`deployment.md`](deployment.md)                                                                                                       | Konfigurasi deployment Railway                                          |
| [`telefun-openai-webrtc-technical-audit.md`](telefun-openai-webrtc-technical-audit.md)                                                 | Audit teknis Phase 1 OpenAI WebRTC POC                                  |
| [`adr/telefun-realtime-provider-adapters.md`](adr/telefun-realtime-provider-adapters.md)                                               | ADR baseline provider adapter Telefun                                   |
| [`adr/telefun-openai-webrtc-poc.md`](adr/telefun-openai-webrtc-poc.md)                                                                 | ADR Phase 1 OpenAI WebRTC POC                                           |
| [`rebuild-logs/phase-telefun-openai-webrtc-poc.md`](rebuild-logs/phase-telefun-openai-webrtc-poc.md)                                   | Catatan implementasi POC Phase 1                                        |
| [`rebuild-logs/phase-telefun-openai-webrtc-shared-observer.md`](rebuild-logs/phase-telefun-openai-webrtc-shared-observer.md)           | Catatan sinkronisasi Phase 2 shared observer                            |
| [`rebuild-logs/phase-telefun-openai-webrtc-durable-lifecycle.md`](rebuild-logs/phase-telefun-openai-webrtc-durable-lifecycle.md)       | Catatan Phase 4 durable lifecycle dan evidence boundary                 |
| [`rebuild-logs/phase-telefun-openai-webrtc-production-hardening.md`](rebuild-logs/phase-telefun-openai-webrtc-production-hardening.md) | Catatan Phase 5 distributed hardening dan evidence boundary             |

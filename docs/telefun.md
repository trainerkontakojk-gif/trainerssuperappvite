# Telefun — Dokumentasi Modul Lengkap

> **TELEFUN** = **Tele**phone **Fun**
> Modul simulasi panggilan suara untuk melatih agen menangani telepon menggunakan **Gemini Live API**.

Modul Telefun terdiri dari **3 layer** yang bekerja bersama:

1. **Frontend (React)** — UI untuk settings, panggilan, review, history
2. **Backend API (Hono)** — REST API untuk CRUD session, settings, recordings
3. **Proxy Server (WebSocket)** — Bridge antara frontend dan Gemini Live API

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
│              │  geminiService.ts  │  WebSocket client                │
│              │  + promptBuilder   │  (Gemini Live JSON protocol)    │
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
│  └────────┬─────────┘                   └────────────┬────────────┘ │
└───────────┼──────────────────────────────────────────┼──────────────┘
            │                                          │
            ▼                                          ▼
    ┌───────────────┐                     ┌─────────────────────┐
    │   Supabase     │                     │  Gemini Live API    │
    │  (database +   │                     │  BidiGenerateContent│
    │   storage)     │                     │  (WebSocket)        │
    └───────────────┘                     └─────────────────────┘
```

---

## 📁 Struktur File

### 🖥️ Frontend (apps/web)

**Halaman utama:** `apps/web/src/routes/telefun/`

```
routes/telefun/
├── index.tsx                    # Entry page — landing, call, settings, history
├── replay.tsx                   # Halaman replay/review sesi
├── telefunSettings.ts           # Tipe & default settings (scenarios, consumer types, identity)
├── telefunApi.ts                # API calls ke backend (settings, sessions, history)
├── telefunVoiceRegistry.ts      # Mapping voice Gemini Live
├── recordingPath.ts             # Helpers recording path
├── sessionFinalizer.ts          # Finalisasi session dari sisi client
├── types.ts                     # Tipe CallRecord dll
│
├── services/
│   ├── geminiService.ts         # WebSocket client ke proxy + setup message
│   ├── promptBuilder.ts         # ★ Build system instruction prompt untuk Gemini
│   ├── liveProtocol.ts          # Format setup message Gemini Live JSON
│   ├── telefun-recording-remux-service.ts  # Client-side recording remux (dipanggil sessionFinalizer)
│   └── realisticMode/
│       ├── RealisticModeOrchestrator.ts      # Orchestrator — koordinasi semua engine
│       ├── backchannelController.ts          # Backchannel (gumaman) controller
│       ├── disruptionScenarioEngine.ts       # Simulasi gangguan teknis
│       ├── fallbackResponseManager.ts        # Response fallback jika AI macet
│       ├── holdStateManager.ts               # Hold consent + rude hold detection
│       ├── personaStateMachine.ts            # State machine persona — intensity berubah
│       ├── prolongedSilenceHandler.ts        # Penanganan agen diam terlalu lama
│       ├── shortResponseClassifier.ts        # Klasifikasi respons singkat agen
│       ├── turnTakingEngine.ts               # Mesin turn-taking
│       └── types.ts                          # Tipe shared
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
│   ├── server-protocol.ts     # Protocol detection & Gemini message helpers
│   ├── server-close.ts        # Close-code sanitizer
│   ├── session-drain.ts       # Graceful drain coordinator
│   ├── turn-taking.ts         # Turn state machine
│   ├── transcript.ts          # Real-time transcript collector
│   ├── usage.ts               # Token usage tracking & billing
│   ├── db.ts                  # Supabase DB queries (session CRUD)
│   ├── auth.ts                # JWT token verification
│   └── env.ts                 # Environment validation (Zod)
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 🎯 Behavior Modul

### Alur Penggunaan

```
1. BUKA halaman Telefun → pilih scenario + consumer type di settings
        │
2. TEKAN tombol "Mulai Panggilan"
        │
3. SISTEM:
   a. Kirim POST /api/v1/telefun/sessions → buat record di telefun_history
   b. Connect WebSocket ke proxy (apps/telefun) dengan JWT token
   c. Kirim setup message (system instruction prompt → Gemini)
   d. Tunggu setupComplete dari Gemini
        │
4. MULAI PERCAKAPAN:
   a. User bicara → microphone → audio → WebSocket → proxy → Gemini
   b. Gemini merespons → audio → proxy → WebSocket → speaker user
   c. Real-time transcript muncul di UI
   d. Hold/mute bisa digunakan kapan saja
        │
5. AKHIRI PANGGILAN:
   a. User klik "Tutup" → kirim session_end_request
   b. Proxy tunggu AI selesai bicara (drain: 2s quiet atau 10s hard limit)
   c. Session difinalisasi → transcript disimpan → usage dicatat
        │
6. SCORING (background):
   a. Worker ambil session → analisis voice quality (AI)
   b. Hitung hold assessment
   c. Simpan score, feedback, voice assessment
        │
7. REVIEW:
   Buka history → lihat transcript, score, voice radar, komunikasi profil
```

### Role Access

| Role | Akses Telefun |
|------|--------------|
| **Admin** | ✅ Full — settings, call, history, review, monitoring |
| **Trainer** | ✅ Full — settings, call, history, review, monitoring |
| **QA** | ❌ Diblokir — backend `requireRole("admin","trainer")` + frontend gate |
| **Leader** | ❌ Diblokir — maintenance modal "Akses Terbatas" |
| **Agent** | ❌ Diblokir — maintenance modal "Akses Terbatas" |

### Session States

```
pending → active → completed
                → failed
```

| Status | Arti |
|--------|------|
| `pending` | Session dibuat, belum dimulai |
| `active` | Panggilan sedang berlangsung |
| `completed` | Panggilan selesai normal |
| `failed` | Error — panggilan gagal |

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

| Aspek | Detail |
|-------|--------|
| Hold pertama | Maksimal **1 menit** |
| Hold berikutnya | Maksimal **3 menit** |
| Countdown | UI tampilkan + peringatan 10 detik terakhir |
| Overtime | Tampilkan `+MM:SS` setelah batas |
| Penilaian | **Deterministik** (bukan AI): Baik (score **10**, semua ≤ batas) atau Kurang (score **4**, ada yang melebihi). Final score: `(aiScore × 5 + holdScore) / 6` |
| Saat hold | Mikrofon user dimute **+ audio AI diblokir** (`suppressGeminiAudio: true`) |

### Realistic Mode

Mode Realistic mengaktifkan **8 engine** yang dikoordinasi oleh `RealisticModeOrchestrator`:

| Engine (file) | Fungsi |
|---------------|--------|
| `turnTakingEngine.ts` | Mesin turn-taking — sinyal konteks, interupsi |
| `fallbackResponseManager.ts` | Response fallback jika AI tidak merespons |
| `prolongedSilenceHandler.ts` | Penanganan agen diam terlalu lama |
| `personaStateMachine.ts` | State machine persona — intensity berubah selama panggilan |
| `holdStateManager.ts` | **Hold consent + rude hold detection** (`CONSENT_REQUEST_TTL_MS = 15000`) |
| `backchannelController.ts` | Gumaman natural ("hmm", "oh") saat agen bicara |
| `disruptionScenarioEngine.ts` | Simulasi gangguan teknis (suara putus, delay) |
| `shortResponseClassifier.ts` | Klasifikasi respons singkat agen (acknowledgement, instruction, question, greeting, closing) |

**Rude Hold Detection:** Via `validateHoldConsent()` — melacak apakah agen minta izin sebelum hold (`lastHoldRequestAt`) dan konsumen merespons (`lastConsumerResponseAt`). Jika tidak ada consent dalam 15 detik → `isRudeHold: true`.

File-file ini ada di `apps/web/src/routes/telefun/services/realisticMode/` — total **10 file** (8 engine + orchestrator + types).

### Auto Hangup

Durasi panggilan dibatasi sesuai `maxCallDuration`. AI mendapat reminder bertahap via fungsi `getTimeCueInstruction()` di `promptBuilder.ts`:

| Sisa Waktu | Aksi AI (konsumen) |
|------------|-------------------|
| 2 menit | Mulai arah ke penutup |
| 1 menit | Persiapan penutupan |
| 30 detik | Mulai tutup percakapan |
| 20 detik | HARUS tutup telepon sekarang |

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
   - Pilih tipe konsumen: Marah, Gaptek, Sedih, atau Netral
   - Tiap tipe punya emosi dan cara bicara berbeda
4. **Tab "Identitas"**:
   - Atur nama, gender, kota, no HP konsumen
5. **Tab "Sistem"**:
   - Pilih model (default: `gemini-3.1-flash-live-preview`)
   - Atur durasi maksimal panggilan
   - Mode: **Realistis** (natural) atau **Latihan Cepat** (lebih efisien)
   - Aktifkan **Realistic Mode** untuk simulasi lebih hidup

### Saat Panggilan

| Tombol | Fungsi |
|--------|--------|
| 🎙️ **Mute** | Matikan mikrofon |
| ⏸️ **Hold** | Tahan panggilan (dengan timer) |
| 📝 **Transcript** | Lihat teks percakapan real-time |
| ⏹️ **Tutup** | Akhiri panggilan |

### Setelah Panggilan

1. **Loading** — Scoring berjalan di background (beberapa detik)
2. **Review** — Buka history, klik sesi untuk lihat:
   - Transcript lengkap
   - Voice assessment (radar chart)
   - Score & feedback
   - Hold assessment
   - Communication profile
   - Rekaman audio

### Settings Lanjutan

- **Default scenarios** bisa diubah permanen via UI (tersimpan di Supabase per user)
- **Consumer types** (emosi) juga bisa ditambah/edit di settings
- **Mode realistis** bisa di-toggle, termasuk jenis gangguan yang disimulasikan

---

## 🎭 Prompt Perilaku Konsumen

> Prompt konsumen hidup di **frontend** (`apps/web/`), dikirim sebagai `setup.systemInstruction` ke Gemini Live API.

### File Utama

| File | Lokasi | Fungsi |
|------|--------|--------|
| **`promptBuilder.ts`** | `apps/web/src/routes/telefun/services/` | **Otak prompt** — membangun system instruction |
| **`geminiService.ts`** | `apps/web/src/routes/telefun/services/` | Kirim setup message ke proxy |
| **`telefunSettings.ts`** | `apps/web/src/routes/telefun/` | Tipe data scenario, consumer type, identity |
| **`TelefunScenariosTab.tsx`** | `apps/web/src/routes/telefun/components/settings/` | UI editor skenario |

### Komponen Prompt

```
buildTelefunLiveSystemInstruction({
  identity,           → nama, gender, kota, no HP
  scenario,           → judul masalah + instruksi + skrip opsional
  consumerType,       → tipe konsumen (mementukan emosi)
  responsePacingMode, → "realistic" | "training_fast"
  maxCallDuration     → durasi maksimal
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

| Fungsi / Variable | Konten |
|-------------------|--------|
| `getEmotionInstruction()` | Mapping nama tipe konsumen → instruksi emosi |
| `pacingInstruction` (variable) | Tempo bicara: `realistic` vs `training_fast` |
| `genderInnerText` (variable) | Instruksi gender suara konsumen |
| `silentInstruction` (variable) | Cara menangani agen diam (realistic mode only) |
| `scriptInstruction` (variable) | Cara menggunakan skrip percakapan (opsional) |
| `buildTelefunLiveSystemInstruction()` return value | **Prompt utama** — seluruh `systemInstruction` yang dikirim ke Gemini |

**Tips:**
- Ingin konsumen lebih ngotot? → Edit fungsi `getEmotionInstruction()` di `promptBuilder.ts`
- Ingin tempo bicara berbeda? → Edit variable `pacingInstruction`
- Ingin konsumen pakai logat? → Tambahkan di `instruction` field scenario

---

## 🔌 API Endpoints

### Backend API (apps/api) — prefix: `/api/v1/telefun`

Semua route membutuhkan role `admin` atau `trainer`.

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/sessions` | Ambil daftar session (admin/trainer: semua, lain: milik sendiri) |
| `POST` | `/sessions` | Buat session baru |
| `PATCH` | `/sessions/:id` | Update session (status, transcript, metrics, score) |
| `GET` | `/history/:id` | Detail session (dengan ownership check) |
| `DELETE` | `/history/:id` | Hapus session + file storage |
| `DELETE` | `/history` | Hapus semua session user |
| `GET` | `/settings` | Ambil settings Telefun user |
| `PUT` | `/settings` | Simpan settings Telefun user |
| `GET` | `/recordings` | Daftar recording |
| `GET` | `/recordings/:sessionId` | Signed URL untuk akses recording |
| `POST` | `/recordings/:sessionId/remux` | Remux recording (ffmpeg) |
| `POST` | `/annotations` | Simpan annotasi |

### Proxy Server (apps/telefun)

| Endpoint | Type | Deskripsi |
|----------|------|-----------|
| `/health` | HTTP | Health check (uptime, timestamp) |
| `/` atau `/ws` | WebSocket | Koneksi real-time dengan Gemini |

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
    "mediaChunks": [{ "data": "base64audio...", "mimeType": "audio/pcm;rate=16000" }]
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
    → telefun-analysis.ts (AI voice assessment via Gemini)
    → telefun-hold-assessment.ts (deterministic hold score)
  → Patch telefun_history (score + feedback + voice_assessment)
```

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

### Test Files Penting

| Layer | File | Coverage |
|-------|------|----------|
| Proxy | `server-protocol.test.ts` | Protocol detection, message parsing |
| Proxy | `server-close.test.ts` | Close-code mapping |
| Proxy | `transcript.test.ts` | Transcript collection, dedup |
| Proxy | `session-drain.test.ts` | Drain lifecycle |
| Proxy | `usage-modality.test.ts` | Usage tracking & billing |
| Backend | `telefun-routes.test.ts` | Session CRUD, access control |
| Backend | `telefun-assessment-boundary.test.ts` | Boundary assessment |
| Backend | `telefun-scoring-service.test.ts` | Scoring lifecycle |
| Backend | `telefun-hold-assessment.test.ts` | Hold scoring |
| Backend | `telefun-analysis-hold.test.ts` | Hold analysis integration |
| Backend | `telefun-schema-contract.test.ts` | DB schema contract |
| Backend | `telefun-recording-access.test.ts` | Recording permission |

---

## 🛠️ Environment Variables

### Proxy (apps/telefun) — dari `.env.local` root

| Variable | Required | Default | Deskripsi |
|----------|----------|---------|-----------|
| `PORT` | ❌ | `3002` | Port server |
| `SUPABASE_URL` | ✅ | — | Supabase URL |
| `SUPABASE_ANON_KEY` | ✅ | — | Anon key (auth) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | — | Service role (DB) |
| `GEMINI_API_KEY` | ✅ | — | Gemini Live API key |
| `ALLOWED_ORIGINS` | ❌ | `"*"` | CORS origins |
| `NODE_ENV` | ❌ | `"development"` | Mode |

### Frontend — dari `VITE_*` env (via `.env.local` root)

| Variable | Required | Deskripsi |
|----------|----------|-----------|
| `VITE_SUPABASE_URL` | ✅ | Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Supabase anon key |
| `VITE_TELEFUN_WS_URL` | ✅ | WebSocket URL proxy (biasanya `ws://localhost:3002`) — dipakai di `liveProtocol.ts` & `geminiService.ts` |

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

# Telefun — Dokumentasi Modul Lengkap

> **TELEFUN** = **Tele**phone **Fun**
> Modul simulasi panggilan suara untuk melatih agen menangani telepon.
> Mendukung **dua provider realtime**: **Gemini Live API** (default) dan **OpenAI Realtime API** (`gpt-realtime-2.1`, `gpt-realtime-2.1-mini`).

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
│   ├── simulationChallenges.ts              # Registry ID, label, dan instruksi prompt
│   └── reviewTypes.ts                       # Tipe aktif voice dashboard dan replay
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
│   ├── session-drain.ts       # Graceful drain coordinator
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
│   └── providers/             # ★ Provider adapter pattern
│       ├── ProviderAdapter.ts     # Interface
│       ├── GeminiLiveAdapter.ts   # Gemini Live implementation
│       └── OpenAIRealtimeAdapter.ts # gpt-realtime-2.1 / mini implementation
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

| Role        | Akses Telefun                                                          |
| ----------- | ---------------------------------------------------------------------- |
| **Admin**   | ✅ Full — settings, call, history, review, monitoring                  |
| **Trainer** | ✅ Full — settings, call, history, review, monitoring                  |
| **QA**      | ❌ Diblokir — backend `requireRole("admin","trainer")` + frontend gate |
| **Leader**  | ❌ Diblokir — maintenance modal "Akses Terbatas"                       |
| **Agent**   | ❌ Diblokir — maintenance modal "Akses Terbatas"                       |

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
   - Pilih tipe konsumen: Marah, Gaptek, Sedih, atau Netral
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

| Endpoint       | Type      | Deskripsi                        |
| -------------- | --------- | -------------------------------- |
| `/health`      | HTTP      | Health check (uptime, timestamp) |
| `/internal/telefun/scoring` | HTTP | Assessment OpenAI internal; bearer token, tanpa CORS |
| `/` atau `/ws` | WebSocket | Koneksi real-time dengan Gemini  |

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

| Variable                    | Required          | Default         | Deskripsi                                       |
| --------------------------- | ----------------- | --------------- | ----------------------------------------------- |
| `PORT`                      | ❌                | `3002`          | Port server                                     |
| `SUPABASE_URL`              | ✅                | —               | Supabase URL                                    |
| `SUPABASE_ANON_KEY`         | ✅                | —               | Anon key (auth)                                 |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅                | —               | Service role (DB)                               |
| `GEMINI_API_KEY`            | ✅                | —               | Gemini Live API key                             |
| `OPENAI_API_KEY`            | Jika OpenAI aktif | —               | Hanya di service Telefun                        |
| `TELEFUN_OPENAI_ENABLED`    | ❌                | `false`         | Kill switch OpenAI                              |
| `TELEFUN_INTERNAL_TOKEN`    | Jika OpenAI aktif | —               | Shared server-only token; nilai sama dengan API |
| `ALLOWED_ORIGINS`           | ❌                | `"*"`           | CORS origins                                    |
| `NODE_ENV`                  | ❌                | `"development"` | Mode                                            |

### Frontend — dari `VITE_*` env (via `.env.local` root)

| Variable                 | Required | Deskripsi                                                                                                |
| ------------------------ | -------- | -------------------------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`      | ✅       | Supabase URL                                                                                             |
| `VITE_SUPABASE_ANON_KEY` | ✅       | Supabase anon key                                                                                        |
| `VITE_TELEFUN_WS_URL`    | ✅       | WebSocket URL proxy (biasanya `ws://localhost:3002`) — dipakai di `liveProtocol.ts` & `geminiService.ts` |

### Backend API — server-only

| Variable                 | Required          | Deskripsi                                     |
| ------------------------ | ----------------- | --------------------------------------------- |
| `TELEFUN_INTERNAL_URL`   | Jika OpenAI aktif | Origin privat service Telefun; hanya di API   |
| `TELEFUN_INTERNAL_TOKEN` | Jika OpenAI aktif | Shared token yang sama dengan service Telefun |

`OPENAI_API_KEY` tidak boleh dipasang pada API atau Frontend. Endpoint
`POST /internal/telefun/scoring` tidak menyediakan CORS dan hanya menerima
request server-to-server terautentikasi.

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

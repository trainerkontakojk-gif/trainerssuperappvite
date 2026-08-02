# Audit Teknis Migrasi Telefun OpenAI Realtime dari WebSocket ke WebRTC

**Status:** Audit read-only selesai  
**Tanggal audit:** 28 Juli 2026  
**Ruang lingkup:** Telefun frontend, API, proxy realtime, Railway, Supabase, recording, transcript, evaluasi, dan usage logging  
**Keputusan:** WebRTC dapat diimplementasikan, tetapi membutuhkan refactor besar pada jalur OpenAI. Jalur Gemini dapat dipertahankan melalui WebSocket lama.

## Ringkasan Eksekutif

Repository sudah memiliki fondasi yang kuat untuk Telefun:

- microphone capture melalui `getUserMedia()`;
- Web Audio, AudioWorklet, PCM processing, playback, dan recording;
- OpenAI Realtime dan Gemini Live melalui WebSocket Railway;
- autentikasi Supabase dan session ownership;
- transcript collector;
- usage dan cost logging;
- recording di Supabase Storage;
- scoring, coaching summary, dan history;
- provider adapter untuk Gemini dan OpenAI.

Namun, implementasi saat ini belum memiliki komponen WebRTC:

```text
RTCPeerConnection      belum ada
RTCDataChannel         belum ada
SDP offer/answer       belum ada
pc.ontrack             belum ada
ICE/connection state   belum ada
ephemeral/session API  belum ada
```

Migrasi tidak cukup dilakukan dengan membuat ephemeral token. Saat ini Railway melihat seluruh event OpenAI karena audio dan event melewati WebSocket proxy. Browser-direct WebRTC akan melewati jalur transcript, usage, tool calling, drain, dan finalisasi tersebut.

Arsitektur yang disarankan adalah:

```text
Browser --WebRTC media--> OpenAI Realtime
    |                           |
    |                           | session yang sama
    v                           v
Railway --sideband WebSocket--> OpenAI Realtime
    |
    +--> transcript, usage, tools, finalisasi, Supabase
```

Migrasi harus dibuat **additive dan khusus OpenAI**. Gemini tetap memakai WebSocket lama sebagai baseline produksi dan fallback yang stabil.

---

## 1. Kesimpulan

**WebRTC dapat diimplementasikan, tetapi membutuhkan refactor besar.**

Alasan berdasarkan repository:

1. Frontend sudah mendukung microphone, audio graph, playback, recording, mute, hold, dan cleanup, tetapi seluruh lifecycle OpenAI masih WebSocket-centric.
2. Railway sudah memiliki OpenAI adapter, transcript, usage, tools, dan session finalization, tetapi belum memiliki SDP broker, ephemeral-token endpoint, atau sideband connection.
3. Transcript dan usage saat ini bergantung pada Railway menerima event OpenAI melalui WebSocket.
4. Tidak ada distributed session quota atau concurrency lease untuk melindungi endpoint pembuatan session berbayar.
5. Recording full-call sekarang dibuat dengan menghubungkan PCM AI ke Web Audio destination. Remote track WebRTC harus dimasukkan kembali ke audio graph agar suara AI tetap terekam.
6. Barge-in sekarang bergantung pada queue `AudioBufferSourceNode`; mekanismenya tidak dapat dipindahkan ke remote WebRTC track tanpa redesign.

### Dampak terhadap Gemini

Migrasi dapat dibatasi hanya untuk OpenAI jika dibuat sebagai transport baru:

```text
Gemini model
  -> LiveSession WebSocket lama
  -> Railway Telefun
  -> Gemini Live API

OpenAI model
  -> OpenAIWebRtcSession baru
  -> OpenAI Realtime WebRTC
  -> Railway sideband untuk control/event plane
```

Syaratnya:

- jangan mengganti `LiveSession` lama secara langsung;
- pertahankan `GeminiLiveAdapter.ts` dan protocol Gemini;
- tambahkan transport eksplisit seperti `openai-webrtc`;
- default dan feature flag tetap Gemini/WebSocket;
- jangan melakukan fallback provider di tengah panggilan;
- jalankan regression test dan smoke test Gemini sebelum mengaktifkan OpenAI WebRTC.

---

## 2. Arsitektur Telefun Saat Ini

### Diagram

```text
Browser / apps/web
  |
  +-- POST /api/v1/telefun/sessions
  |     `-- telefun_history: status=active
  |
  +-- getUserMedia()
  +-- AudioContext + AudioWorklet
  +-- PCM16 16/24 kHz
  +-- MediaRecorder
  |     +-- full call
  |     `-- agent only
  |
  `-- WebSocket + Supabase JWT
          |
          v
Railway / apps/telefun
  +-- verifyToken()
  +-- ownership/session creation
  +-- model, voice, dan PCM validation
  +-- TranscriptCollector
  +-- usage accumulator
  +-- drain/finalization
  +-- tool dispatcher
  `-- provider adapter
          +-- GeminiLiveAdapter -> Gemini Live WebSocket
          `-- OpenAIRealtimeAdapter -> OpenAI Realtime WebSocket
                                             |
Browser playback <- JSON/base64 PCM <--------'

Call end:
Browser
  -> session_end_request
  -> Railway drain
  -> telefun_history.messages + duration + status
  -> ai_usage_logs
  -> browser upload recording ke Supabase Storage
  -> API scoring worker
  -> voice_assessment + score + coaching summary
```

### Alur audio pengguna ke model

`apps/web/src/routes/telefun/services/liveSession.ts` membuka microphone, audio context, dan WebSocket:

```ts
this.stream = await navigator.mediaDevices.getUserMedia({ audio: ... });
this.audioContext = new AudioContextCtor(...);
this.ws = new WebSocket(wsUrl.toString());
```

`handleInputAudioFrame()` mengubah Float32 menjadi PCM16. Untuk OpenAI, frame dibungkus oleh `buildOpenAiInputAudioAppend()` lalu dikirim sebagai base64 JSON:

```text
Browser WebSocket
  -> Railway WebSocket
  -> OpenAI Realtime WebSocket
```

Gemini memakai jalur serupa dengan sample rate dan protocol Gemini.

### Alur audio AI ke browser

`OpenAIRealtimeAdapter` meneruskan `response.output_audio.delta`. Frontend kemudian:

1. decode base64;
2. membuat `AudioBuffer`;
3. membuat `AudioBufferSourceNode`;
4. menjadwalkan playback melalui `nextStartTime`;
5. menghubungkan audio ke speaker dan recording destination.

Bukti utama berada di:

- `apps/web/src/routes/telefun/services/liveSession.ts`;
- `apps/web/src/routes/telefun/services/liveProtocol/openai.ts`;
- `apps/telefun/src/providers/OpenAIRealtimeAdapter.ts`.

### Peran frontend

Frontend bertanggung jawab atas:

- pemilihan skenario, persona, model, voice, dan durasi;
- pembuatan prompt melalui `promptBuilder.ts`;
- microphone capture dan PCM conversion;
- playback audio AI;
- timer, mute, hold, end call, dan time cues;
- full-call dan agent-only recording;
- upload recording;
- pemicu scoring dan tampilan history/review.

### Peran Railway

`apps/telefun/src/server.ts` bertanggung jawab atas:

- WebSocket browser ingress;
- Supabase JWT verification;
- session creation atau ownership check;
- provider routing;
- upstream WebSocket;
- transcript collection;
- usage collection;
- tool dispatch;
- drain dan finalisasi session.

`apps/api` bertanggung jawab atas:

- session CRUD;
- settings;
- recording path, signed URL, dan remux;
- scoring lifecycle;
- coaching summary;
- history dan annotations.

### API key OpenAI

`apps/telefun/src/env-schema.ts` mendefinisikan:

- `OPENAI_API_KEY`;
- `TELEFUN_OPENAI_ENABLED`;
- `TELEFUN_INTERNAL_TOKEN`.

`OPENAI_API_KEY` dipakai server-side oleh `OpenAIRealtimeAdapter`. Tidak ditemukan `VITE_OPENAI_API_KEY` atau pengiriman standard OpenAI API key ke browser.

API service juga memiliki key OpenAI terpisah untuk text generation. Dokumentasi deployment menyarankan secret terpisah antarservice.

### Session creation dan termination

Session normal dibuat oleh frontend melalui:

- `apps/web/src/routes/telefun/index.tsx`;
- `POST /api/v1/telefun/sessions`;
- `apps/api/src/routes/telefun/sessions.ts`.

Record awal berstatus `active` dan menyimpan scenario, consumer, model, transport, pacing, dan configured duration.

Jika pembuatan session API gagal, frontend tetap dapat membuka WebSocket tanpa `sessionId`; `TelefunAuthGate` kemudian dapat membuat session fallback melalui `apps/telefun/src/db.ts:createSession()`.

Saat call berakhir:

- browser mengirim `session_end_request`;
- `DrainCoordinator` menunggu quiet/turn boundary;
- `finalizeSessionOnce()` menyimpan transcript, duration, dan status;
- frontend menyimpan metrics dan recording paths;
- scoring berjalan sesudah recording tersedia.

### Penyimpanan hasil

| Data | Penyimpanan |
|---|---|
| Session metadata dan history | `telefun_history` |
| Transcript | `telefun_history.messages` |
| Duration, status, model, transport | `telefun_history` |
| Recording | bucket `telefun-recordings` |
| Metrics, hold, interruption | `session_metrics` |
| Voice evaluation | `voice_assessment` |
| Score | `score` |
| Coaching | `telefun_coaching_summary` |
| Usage dan cost | `ai_usage_logs` |
| Replay annotations | `telefun_replay_annotations` |

---

## 3. Arsitektur WebRTC yang Disarankan

### Pilihan utama: unified SDP dengan Railway sideband

```text
Browser Telefun
  +-- login Supabase
  +-- RTCPeerConnection
  +-- microphone track
  +-- remote audio track
  +-- RTCDataChannel
  `-- POST SDP offer + session metadata ke Railway
          |
          v
Railway Telefun broker
  +-- validasi JWT, profile, dan role
  +-- cek quota, concurrency, dan duration
  +-- buat/claim telefun_history
  +-- build prompt/model/voice server-side
  +-- POST /v1/realtime/calls dengan OPENAI_API_KEY
  +-- terima SDP answer + Location/call_id
  +-- simpan binding call_id <-> telefun session
  `-- buka sideband WebSocket
          |
          +-- transcript
          +-- usage
          +-- tools
          +-- instructions
          +-- end/cleanup
          `-- logging
          |
          `-- kirim SDP answer ke browser

Browser RTCPeerConnection == audio == OpenAI Realtime

Railway sideband
  `-- Supabase
       +-- telefun_history
       +-- ai_usage_logs
       +-- recordings
       +-- scoring lifecycle
       `-- coaching/history
```

OpenAI mendokumentasikan server-side sideband untuk WebRTC melalui `call_id`:

```text
wss://api.openai.com/v1/realtime?call_id=rtc_xxxxx
```

Sideband memungkinkan Railway memonitor session yang sama, memperbarui instructions, menerima transcript/usage events, dan menangani tool calls tanpa merutekan media melalui Railway.

### Unified SDP dibanding ephemeral token

OpenAI mendukung dua pola:

1. unified endpoint `/v1/realtime/calls`;
2. ephemeral token melalui `/v1/realtime/client_secrets`.

Unified SDP lebih sesuai untuk repository ini karena:

- standard OpenAI key tetap di Railway;
- browser tidak menerima provider credential;
- Railway berada di jalur session initialization;
- Railway dapat mengambil `Location/call_id` untuk sideband;
- tidak memerlukan token issuance ledger dan anti-replay boundary tambahan.

Ephemeral token masih mungkin digunakan, tetapi memerlukan expiry, quota, issuance tracking, session binding, dan penanganan replay yang lebih ketat.

---

## 4. Temuan Berdasarkan File

| File/path | Fungsi saat ini | Dampak migrasi WebRTC | Perubahan diperlukan | Tingkat |
|---|---|---|---|---|
| `apps/web/src/routes/telefun/services/liveSession.ts` | Lifecycle WS, PCM, playback, recording | Sangat terikat WebSocket | Pisahkan lifecycle dari transport; tambah WebRTC client | Besar |
| `apps/web/src/routes/telefun/components/PhoneInterface.tsx` | Timer, mute, hold, end call | Dapat digunakan ulang | Gunakan interface transport netral | Menengah |
| `apps/web/src/routes/telefun/components/useMicrophoneActivity.ts` | Membuka mic kedua untuk waveform | Duplikasi capture | Gunakan stream WebRTC yang sama | Menengah |
| `apps/web/src/routes/telefun/services/liveProtocol/openai.ts` | Event OpenAI WS, cancel, truncate | Event parser reusable; audio framing tidak | Gunakan parser untuk DataChannel; hapus audio append pada WebRTC | Menengah |
| `apps/web/src/routes/telefun/services/promptBuilder.ts` | Prompt scenario/persona/time cue | Reusable | Validasi authoritative config di server | Kecil |
| `apps/web/src/routes/telefun/sessionFinalizer.ts` | Upload, patch, remux, scoring | Reusable sebagian | Sinkronkan dengan server finalization | Menengah |
| `apps/web/src/routes/telefun/telefunApi.ts` | Session, settings, history | Reusable | Tambah broker/finalize contract | Menengah |
| `apps/telefun/src/server.ts` | Authenticated WS proxy | Belum menangani SDP/WebRTC | Tambah broker dan sideband lifecycle | Besar |
| `apps/telefun/src/providers/OpenAIRealtimeAdapter.ts` | OpenAI WS, transcript, usage, tools | Event logic berguna; socket path berubah | Ekstrak observer untuk sideband | Besar |
| `apps/telefun/src/transcript.ts` | Transcript per speaker/turn | Sangat reusable | Hubungkan ke sideband | Kecil |
| `apps/telefun/src/usage.ts` | Usage dedupe, pricing, logging | Reusable jika sideband menerima `response.done` | Durable finalization/incomplete usage | Menengah |
| `apps/telefun/src/tools/RealtimeToolDispatcher.ts` | Tool allowlist dan dedupe | Reusable server-side | Hubungkan ke sideband; registry produksi masih kosong | Menengah |
| `apps/telefun/src/server-auth.ts` | JWT dan ownership | Tidak memeriksa profile status/role | Harden broker auth atau gunakan API auth | Besar/security |
| `apps/api/src/routes/telefun/sessions.ts` | CRUD/model/duration validation | Reusable | Atomic session lease dan call binding | Menengah |
| `apps/api/src/routes/telefun/recordings.ts` | Recording path, scoring, signed URL | Reusable | Pastikan remote WebRTC audio ikut direkam | Menengah |
| `apps/api/src/lib/telefun-analysis.ts` | Voice evaluation | Reusable | Tetap memerlukan agent-only recording | Kecil |
| `packages/types/src/ai-models.ts` | Registry model dan transport | `openai-audio` saat ini menunjuk jalur WS | Tambah transport eksplisit `openai-webrtc` | Menengah |
| `supabase/migrations/003_telefun_core.sql` dan extensions | History, transcript, metrics | Fondasi tersedia | Tambah lease/call ID/idempotency bila diperlukan | Menengah |
| `apps/web/public/serve.json` | CSP dan Permissions Policy | Tidak memblokir mic/WebRTC secara jelas | Uji endpoint OpenAI dan SDP di production | Kecil |
| `docs/adr/telefun-realtime-provider-adapters.md` | Memilih WS proxy untuk fase sebelumnya | Keputusan arsitektur berubah | Buat ADR baru atau superseding ADR | Kecil |

### Inventaris file terkait

#### Frontend

- `apps/web/src/routes/telefun/index.tsx`
- `apps/web/src/routes/telefun/components/PhoneInterface.tsx`
- `apps/web/src/routes/telefun/components/useMicrophoneActivity.ts`
- `apps/web/src/routes/telefun/components/TelefunTranscript.tsx`
- `apps/web/src/routes/telefun/services/liveSession.ts`
- `apps/web/src/routes/telefun/services/liveSessionDrain.ts`
- `apps/web/src/routes/telefun/services/liveProtocol/**`
- `apps/web/src/routes/telefun/services/promptBuilder.ts`
- `apps/web/src/routes/telefun/sessionFinalizer.ts`
- `apps/web/src/routes/telefun/telefunApi.ts`
- `apps/web/src/routes/telefun/telefunSettings.ts`
- `apps/web/src/routes/telefun/telefunVoiceRegistry.ts`
- `apps/web/public/audio-input-processor.js`
- `apps/web/public/serve.json`

#### Telefun Railway service

- `apps/telefun/src/server.ts`
- `apps/telefun/src/server-auth.ts`
- `apps/telefun/src/server-configuration.ts`
- `apps/telefun/src/server-protocol.ts`
- `apps/telefun/src/session-drain.ts`
- `apps/telefun/src/transcript.ts`
- `apps/telefun/src/usage.ts`
- `apps/telefun/src/db.ts`
- `apps/telefun/src/auth.ts`
- `apps/telefun/src/env-schema.ts`
- `apps/telefun/src/providers/RealtimeProviderAdapter.ts`
- `apps/telefun/src/providers/GeminiLiveAdapter.ts`
- `apps/telefun/src/providers/OpenAIRealtimeAdapter.ts`
- `apps/telefun/src/providers/provider-router.ts`
- `apps/telefun/src/tools/RealtimeToolDispatcher.ts`
- `apps/telefun/src/internal-scoring-http.ts`
- `apps/telefun/src/openai-voice-assessment.ts`
- `apps/telefun/src/scoring-audio.ts`

#### API dan persistence

- `apps/api/src/app.ts`
- `apps/api/src/middleware/auth.ts`
- `apps/api/src/middleware/role.ts`
- `apps/api/src/middleware/rateLimit.ts`
- `apps/api/src/routes/telefun.ts`
- `apps/api/src/routes/telefun/sessions.ts`
- `apps/api/src/routes/telefun/recordings.ts`
- `apps/api/src/routes/telefun/remux-recording.ts`
- `apps/api/src/lib/telefun-analysis.ts`
- `apps/api/src/lib/telefun-openai-assessment.ts`
- `apps/api/src/services/telefun-scoring-service.ts`
- `apps/api/src/workers/telefun-scoring-worker.ts`
- `packages/types/src/telefun.ts`
- `packages/types/src/telefun-transcript.ts`
- `packages/types/src/telefun-assessment.ts`
- `packages/types/src/ai-models.ts`
- `supabase/migrations/003_telefun_core.sql`
- seluruh migration lanjutan Telefun, scoring, recording, dan modality pricing.

---

## 5. Komponen yang Sudah Siap

Komponen berikut dapat digunakan kembali tanpa perubahan arsitektur besar:

- scenario, consumer persona, identity, dan voice registry;
- `promptBuilder.ts`;
- timer dan time cues;
- UI mute, hold, dan end-call;
- Supabase authentication;
- `telefun_history`;
- transcript schema dan `TranscriptCollector`;
- scoring lifecycle dan retry queue;
- voice assessment;
- deterministic hold assessment;
- recording storage, signed URL, dan FFmpeg remux;
- usage/cost parser dan pricing migration;
- history/review UI;
- model, voice, dan duration allowlist;
- tool dispatcher architecture.

Frontend juga sudah memiliki secure microphone access, audio graph, track cleanup, recording, interruption state, dan end-call idempotency.

---

## 6. Komponen yang Harus Diubah

### Harus diganti untuk OpenAI WebRTC

- `new WebSocket()` sebagai browser transport OpenAI;
- PCM16/base64 audio append;
- manual PCM playback sebagai satu-satunya audio output OpenAI;
- WS-specific auth/configure/drain di `LiveSession`.

### Harus dipindahkan atau diekstrak

- event normalization dari `OpenAIRealtimeAdapter`;
- transcript, usage, tool, dan response lifecycle menjadi observer bersama;
- lifecycle frontend menjadi interface transport-netral, misalnya:

```text
connect()
mute()
hold()
sendControlEvent()
disconnect()
onStateChange()
onTranscript()
```

### Logic yang berpotensi terduplikasi

- `session.update`;
- response cancel/truncate;
- transcript dedupe;
- usage dedupe;
- tool response dispatch;
- session-end/failure status;
- model/voice validation;
- prompt building.

WebSocket dan WebRTC tidak boleh masing-masing memiliki implementasi persistence independen tanpa idempotency contract.

---

## 7. Perubahan Backend Railway

### Endpoint SDP/session

Endpoint konseptual:

```text
POST /telefun/realtime/calls
Content-Type: application/sdp
Authorization: Bearer <Supabase JWT>
```

Metadata tervalidasi mencakup:

- Telefun session ID;
- model ID;
- voice;
- scenario/persona reference;
- configured duration.

Tanggung jawab endpoint:

1. validasi JWT;
2. validasi profile aktif dan role admin/trainer;
3. validasi ownership session;
4. batasi satu active call per session/user;
5. validasi model, voice, dan duration dari registry;
6. build authoritative OpenAI session config;
7. kirim SDP dan config ke `/v1/realtime/calls`;
8. ambil `Location/call_id`;
9. simpan binding dan buka sideband;
10. kembalikan SDP answer.

### Lifecycle tambahan

- explicit end endpoint atau sideband close command;
- heartbeat/lease refresh;
- orphan cleanup worker;
- idempotent transcript/usage finalizer;
- status terminal yang membedakan completed, failed, network-lost, dan orphaned.

### Kekurangan backend saat ini

- tidak ada endpoint SDP atau ephemeral token;
- tidak ada concurrency lease;
- API rate limit hanya in-memory dan IP-based;
- rate limit tidak terdistribusi antar Railway replica;
- Telefun WS auth hanya memverifikasi Supabase user dan ownership;
- default Telefun `ALLOWED_ORIGINS` masih `*`.

Temuan security penting: ketika frontend gagal membuat session API, ia dapat membuka WS tanpa `sessionId`. Proxy kemudian membuat session baru bagi Supabase user valid tanpa melewati `requireRole("admin", "trainer")` atau profile-status validation dari Hono API. Broker WebRTC harus menggunakan boundary auth yang lebih ketat.

---

## 8. Perubahan Frontend

Client baru minimal membutuhkan:

```text
OpenAIWebRtcSession
  +-- RTCPeerConnection
  +-- getUserMedia
  +-- addTrack(micTrack)
  +-- pc.ontrack -> remote MediaStream
  +-- RTCDataChannel("oai-events")
  +-- createOffer()
  +-- setLocalDescription()
  +-- POST SDP ke Railway
  +-- setRemoteDescription(answer)
  +-- connectionstatechange
  `-- deterministic cleanup
```

### Audio track

- microphone track ditambahkan langsung ke peer connection;
- mute menggunakan `track.enabled = false`;
- hold perlu disable mic, menghentikan/mute remote playback, dan mengirim cancel jika AI harus berhenti.

### Remote playback dan recording

`pc.ontrack` mengisi `audio.srcObject`.

Agar full-call recording tetap berfungsi, remote stream harus dimasukkan ke Web Audio graph dan `MediaStreamDestination`. Jika audio hanya diputar melalui `<audio>`, recording lama tidak otomatis merekam suara AI.

### DataChannel

Harus menangani:

- `session.created` dan `session.updated`;
- speech start/stop;
- transcript delta/done;
- response lifecycle;
- error;
- rate limits;
- function-call events.

Tool execution harus tetap server-side melalui sideband.

### Connection recovery

State machine yang diperlukan:

```text
new -> connecting -> connected
                 -> disconnected (grace period)
                 -> failed
                 -> close/recreate session
```

Pergantian jaringan tidak boleh dianggap resumable tanpa bukti. Recovery paling aman adalah session baru dengan discontinuity yang dicatat eksplisit.

### Barge-in

Implementasi sekarang bergantung pada:

- `speech_started`;
- `response.cancel`;
- `AudioBufferSourceNode.stop()`;
- `conversation.item.truncate` berdasarkan audio yang dimainkan.

Pada WebRTC, audio dimainkan sebagai remote track. Perhitungan audio yang benar-benar didengar dan transcript truncation harus didesain ulang.

---

## 9. Risiko dan Blocker

### Blocker kritis

1. Belum ada WebRTC/SDP/DataChannel implementation.
2. Belum ada broker session atau ephemeral endpoint.
3. Browser-direct akan melewati transcript, usage, tools, dan finalization Railway.
4. Belum ada sideband integration.
5. Belum ada distributed session quota/concurrency lease.

### Risiko tinggi

- Telefun WS auth tidak memeriksa role/profile status.
- Transcript hilang jika event hanya terlihat oleh browser.
- Usage/cost hilang jika Railway tidak menerima `response.done`.
- Full recording kehilangan audio AI.
- Tool calls berpindah ke browser atau tidak berjalan.
- Provider disconnect dapat tercatat sebagai completed pada lifecycle sekarang.
- Missing OpenAI usage dapat selesai tanpa row audit.
- Wildcard origin tidak layak untuk broker berbayar.

### Risiko menengah

- OpenAI transcript event diparse frontend tetapi belum dihubungkan ke live transcript state.
- Mic dibuka dua kali oleh `LiveSession` dan `useMicrophoneActivity`.
- DataChannel dan React state dapat tidak sinkron.
- Remote AI audio dapat tetap hidup setelah UI ditutup.
- Barge-in dapat membuat transcript berbeda dari audio yang didengar.
- Network handoff dapat membuat discontinuity.
- Safari memiliki variasi autoplay, MediaRecorder, dan audio routing.
- WS dan WebRTC dapat double-write ke session yang sama.

### Risiko rendah

- Vite bukan blocker.
- CSP saat ini mengizinkan `https:` dan `wss:` untuk koneksi.
- Permissions Policy mengizinkan microphone untuk same origin.
- Railway TLS/HTTPS secara konsep kompatibel, tetapi konfigurasi dashboard/proxy aktual tidak tersimpan di repository dan perlu diverifikasi terpisah.

---

## 10. Rencana Migrasi

### Tahap 1 — Proof of concept

- OpenAI-only;
- satu model dan satu voice;
- browser WebRTC audio dua arah;
- unified SDP endpoint;
- Railway menangkap `call_id` dan membuka sideband;
- tidak mengubah Gemini atau WebSocket produksi;
- buktikan cleanup peer, track, DataChannel, dan sideband.

### Tahap 2 — Integrasi UI

- ekstrak interface transport;
- tambah `openai-webrtc`;
- hubungkan timer, mute, hold, status, dan error UI;
- gunakan satu microphone stream untuk call dan waveform.

### Tahap 3 — Transcript dan logging

- sideband menjadi authoritative event owner;
- tambah idempotency per response/item/session;
- persist transcript secara incremental atau melalui durable outbox;
- bedakan completed, failed, network-lost, dan orphaned.

### Tahap 4 — Recording dan evaluasi

- campurkan local dan remote WebRTC track untuk full recording;
- pertahankan agent-only recording;
- jalankan remux dan provider-matched scoring;
- pastikan scoring tidak dimulai sebelum upload selesai.

### Tahap 5 — Fallback

- feature flag per user/session;
- OpenAI WebRTC preferred untuk pilot;
- OpenAI WebSocket fallback hanya sebelum call aktif;
- Gemini WebSocket tetap baseline rollback.

### Tahap 6 — Production hardening

- distributed quota dan leases;
- orphan cleanup;
- browser matrix;
- network switching;
- concurrent-user load;
- observability dan cost reconciliation.

---

## 11. Strategi Fallback

WebSocket lama dapat dan sebaiknya dipertahankan:

```text
Gemini        -> WebSocket lama
OpenAI pilot  -> WebRTC + sideband
OpenAI backup -> WebSocket lama
```

Aturan fallback:

- transport dipilih sebelum provider session dibuka;
- tidak ada mid-call fallback;
- jika WebRTC gagal sebelum connected, batalkan attempt lalu buat session WS baru;
- gunakan attempt/session ID berbeda agar transcript dan usage tidak double-write;
- rollback operasional melalui feature flag.

---

## 12. Pengujian yang Diperlukan

### Browser dan media

- microphone permission allow, deny, dan revoke;
- tidak ada microphone;
- device dicabut saat call;
- suara pengguna masuk ke OpenAI;
- suara AI keluar;
- echo cancellation dan headphone/speaker;
- mute menghentikan track;
- hold menghentikan mic dan audio AI;
- end call menghentikan tracks, receiver, element, peer, dan DataChannel;
- AI tidak berbicara setelah kembali ke home.

### Barge-in

- user memotong AI;
- AI berhenti segera;
- cancel hanya sekali;
- transcript sesuai audio yang didengar;
- repeated/rapid interruption.

### Session dan security

- API key tidak terlihat di bundle, Network response, localStorage, atau console;
- unauthorized role ditolak;
- inactive/deleted profile ditolak;
- session user lain ditolak;
- session/token tidak dapat digunakan ulang;
- concurrent-session limit;
- duration hard limit;
- distributed rate limit;
- unknown origin ditolak.

### Persistence

- transcript lengkap tersimpan;
- partial transcript tersimpan setelah disconnect;
- usage dan cost tepat sekali;
- missing usage menghasilkan status audit;
- full dan agent-only recording valid;
- scoring, retry, coaching, dan history tetap berfungsi.

### Recovery dan load

- Wi-Fi ke mobile network;
- temporary disconnect;
- Railway restart;
- sideband restart;
- browser tab close/crash;
- orphan cleanup;
- multiple concurrent users;
- Chrome, Edge, dan Safari desktop/mobile.

### Regression Gemini

- Gemini session creation;
- Gemini setup complete;
- microphone PCM 16 kHz;
- Gemini playback;
- transcript dan usage;
- reconnect/session resumption;
- hold, mute, time cue, dan end-call;
- recording, scoring, dan history;
- production smoke sebelum OpenAI WebRTC flag diaktifkan.

---

## 13. Estimasi Kompleksitas

| Area | Estimasi |
|---|---|
| File produk terdampak | sekitar 18–30 |
| File test/docs tambahan | sekitar 15–25 |
| Tingkat perubahan frontend | Besar |
| Tingkat perubahan backend Telefun | Besar |
| Tingkat perubahan API/database | Menengah–besar |
| Risiko existing Telefun jika direct replacement | Tinggi |
| Risiko dengan rollout bertahap | Menengah |
| Bagian tersulit | Sideband authority, idempotency, barge-in, mixed recording |
| Strategi paling aman | Migrasi bertahap dan additive |

### Knowledge, Attitude, dan Skill

Repository Telefun saat ini tidak memiliki scoring Knowledge, Attitude, dan Skill sebagai kontrak eksplisit. Assessment yang ditemukan menilai:

1. speaking rate;
2. intonation;
3. articulation;
4. filler words;
5. emotional tone;
6. hold management.

Karena itu, mempertahankan K/A/S bukan sekadar masalah transport WebRTC. Jika K/A/S memang requirement produk, kontrak scoring dan persistence-nya perlu ditentukan sebagai pekerjaan terpisah.

---

## 14. Rekomendasi Akhir

**Layak diterapkan, tetapi hanya melalui migrasi bertahap.**

Arsitektur paling realistis:

```text
OpenAI WebRTC untuk media browser
+
Railway sideband WebSocket untuk control/event plane
+
Supabase untuk session, transcript, usage, recording, dan scoring
+
WebSocket lama sebagai fallback
+
Gemini tetap menggunakan jalur WebSocket yang ada
```

Jangan memulai dari endpoint ephemeral token saja. Pendekatan itu dapat menghasilkan demo audio yang bekerja, tetapi berisiko kehilangan transcript, usage, tools, recording, dan session finalization.

Langkah pertama yang direkomendasikan adalah proof of concept terisolasi untuk satu model OpenAI melalui unified `/v1/realtime/calls`. POC harus membuktikan empat hal sebelum integrasi UI produksi:

1. audio dua arah;
2. transcript tersimpan melalui Railway sideband;
3. usage tersimpan tepat sekali;
4. end-call menutup browser peer dan Railway sideband tanpa orphan session.

Gemini harus tetap menjadi baseline produksi selama rollout dan diverifikasi melalui regression suite serta manual production smoke.

---

## Referensi Repository Utama

- `docs/telefun.md`
- `docs/deployment.md`
- `docs/architecture.md`
- `docs/adr/telefun-realtime-provider-adapters.md`
- `docs/TELEFUN_ASSESSMENT_CONTRACT.md`
- `apps/web/src/routes/telefun/**`
- `apps/telefun/src/**`
- `apps/api/src/routes/telefun/**`
- `apps/api/src/lib/telefun-*.ts`
- `apps/api/src/services/telefun-scoring-service.ts`
- `packages/types/src/telefun*.ts`
- `packages/types/src/ai-models.ts`
- `supabase/migrations/*telefun*`
- `supabase/migrations/*ai_usage*`

## Referensi Eksternal Pendukung

- OpenAI Realtime WebRTC: `https://developers.openai.com/api/docs/guides/realtime-webrtc`
- OpenAI Realtime server-side controls: `https://developers.openai.com/api/docs/guides/realtime-server-controls`
- OpenAI Realtime client secrets: `https://developers.openai.com/api/docs/api-reference/realtime-sessions`

Referensi eksternal digunakan untuk memverifikasi kontrak WebRTC, SDP, client secret, dan sideband. Kesimpulan readiness tetap didasarkan pada implementasi aktual di repository.

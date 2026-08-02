# Rencana Migrasi Telefun OpenAI Realtime ke WebRTC

- **Status:** Rencana implementasi bertahap; belum merupakan persetujuan rollout produksi
- **Pemilik perubahan:** `apps/telefun` sebagai broker/lifecycle server, `apps/web` sebagai client, `apps/api` sebagai pemilik session CRUD, `packages/types` sebagai kontrak bersama
- **Prinsip utama:** additive, OpenAI-only untuk pilot, Gemini dan seluruh WebSocket tetap baseline, server tetap menjadi trust boundary
- **Kontrak provider:** unified WebRTC SDP broker + sideband WebSocket; standard OpenAI API key hanya di service Telefun

---

## Requirement

### Tujuan

Migrasikan **jalur OpenAI Realtime** dari browser/Telefun WebSocket media ke WebRTC secara bertahap, tanpa mengganti jalur Gemini Live WebSocket dan tanpa memperbesar blast radius Telefun produksi. Jalur targetnya adalah:

```text
Browser --WebRTC media/audio--> OpenAI Realtime
   |                                  |
   | authenticated SDP offer          | session yang sama
   v                                  v
Telefun broker --server-side sideband WebSocket--> OpenAI Realtime
   |
   +--> transcript, usage, end, cleanup, dan Supabase lifecycle
```

Rencana ini harus menghasilkan implementasi yang dapat diuji tanpa koneksi provider berbayar, kemudian menyediakan gate terpisah untuk smoke test berbayar yang hanya boleh dijalankan setelah otorisasi manual eksplisit.

### Non-goals

- Tidak mengganti Gemini Live WebSocket, `GeminiLiveAdapter`, atau protocol Gemini.
- Tidak mengganti OpenAI WebSocket lama pada fase POC.
- Tidak memindahkan `OPENAI_API_KEY`, Bearer header, atau credential provider ke browser.
- Tidak memakai ephemeral client secret pada fase ini; unified `/v1/realtime/calls` adalah kontrak awal.
- Tidak melakukan migration database, distributed quota, concurrency lease lintas replica, produksi UI cutover, recording parity, atau barge-in parity pada Phase 1.
- Tidak menjanjikan reconnect/resume WebRTC; recovery yang belum terbukti harus diperlakukan sebagai discontinuity.
- Tidak mengaktifkan fallback provider di tengah panggilan.
- Tidak mengklaim manual/paid smoke test, visual check, atau akses OpenAI nyata telah dijalankan.
- Tidak menyelesaikan kontrak scoring Knowledge/Attitude/Skill; itu pekerjaan produk terpisah.

### Acceptance criteria global

- [ ] Pemilihan transport eksplisit dan additive: `gemini-live`, OpenAI WebSocket lama (`openai-audio`), dan transport baru `openai-webrtc` tidak saling menyamarkan.
- [ ] Default dan feature flag OpenAI WebRTC tetap **off**; sesi Gemini dan WebSocket yang ada lulus regression test tanpa perubahan behavior.
- [ ] Browser tidak pernah menerima standard OpenAI key, Authorization header provider, sideband URL, atau prompt/config canonical yang bersifat server-only.
- [ ] Broker menolak request tanpa JWT valid, profile ternormalisasi aktif, role admin/trainer, session yang dimiliki user, atau session yang bukan `active`/pre-created.
- [ ] Browser POST raw SDP dengan `Content-Type: application/sdp` ke endpoint yang session-bound melalui `:sessionId`; `sessionId` tidak dibaca dari body.
- [ ] Body inbound hanya raw SDP; body tidak boleh memuat config atau session JSON.
- [ ] Konfigurasi model, voice, instructions, audio format, VAD, dan batas sesi untuk POC dibangun server-side dari registry/konstanta kanonik; browser hanya menyampaikan SDP offer melalui body raw.
- [ ] Broker mengirim multipart FormData ke `https://api.openai.com/v1/realtime/calls` dengan field `sdp` dan `session`; field `session` yang dikirim ke OpenAI bukan salinan prompt/config browser.
- [ ] Header `Location` provider diparse, `call_id` divalidasi sebagai opaque identifier yang bounded, lalu di-bind secara ketat ke `(userId, telefunSessionId, attemptId)`.
- [ ] Sideband hanya dapat dibuka untuk binding yang valid dan hanya observasi/control server-side yang dibenarkan.
- [ ] Transcript dan usage dari sideband memiliki dedupe key dan finalizer idempotent; satu event provider tidak boleh menjadi dua row/utterance/cost.
- [ ] End-call eksplisit melalui idempotent `DELETE /telefun/realtime/openai/webrtc/sessions/:sessionId/call`: retry end, disconnect browser, close sideband, dan finalize session tidak menggandakan finalization atau usage log.
- [ ] Browser WebRTC client/harness membersihkan `RTCPeerConnection`, `RTCDataChannel`, local tracks, remote stream/audio element, timers, dan listeners pada success, failure, timeout, dan duplicate end.
- [ ] Semua acceptance Phase 1 dibuktikan oleh fake-upstream automated tests dan fake browser WebRTC tests; fake `RTCPeerConnection` hanya membuktikan offer/answer, media-track/data-channel wiring, dan cleanup, bukan audio provider nyata.
- [ ] Bukti audio provider WebRTC bidirectional yang nyata tetap menjadi gate paid/manual terpisah dengan otorisasi eksplisit; tidak dijalankan atau diklaim sebagai completion Phase 1.

### Acceptance criteria khusus Phase 1 — bounded isolated POC

Phase 1 hanya boleh membuktikan satu kombinasi kanonik, misalnya:

| Item | Nilai POC yang dibatasi |
|---|---|
| Provider | OpenAI Realtime saja |
| Model | `gpt-realtime-2.1` (satu model; dapat diganti hanya melalui approval/registry) |
| Voice | `marin` (satu voice; tidak dipilih browser) |
| Transport | `openai-webrtc` baru; OpenAI WebSocket `openai-audio` tidak disentuh |
| SDP broker | POST raw `application/sdp` ke endpoint HTTP session-bound terpisah di service Telefun |
| Upstream setup | `POST https://api.openai.com/v1/realtime/calls`, multipart `sdp` + `session` |
| Event/control server | sideband `wss://api.openai.com/v1/realtime?call_id=<call_id>` |
| Session | satu session `telefun_history` yang sudah dibuat oleh API, milik user, status `active` |
| Client | browser WebRTC client/harness terisolasi, bukan production `LiveSession` cutover |
| Flag | `TELEFUN_OPENAI_WEBRTC_POC=false` dan flag web yang sepadan |
| Test upstream | HTTP/fake WebSocket; tidak ada koneksi OpenAI nyata |

Checklist Phase 1:

- [ ] JWT diverifikasi di broker menggunakan boundary auth yang memeriksa profile dengan status ternormalisasi `active`, `is_deleted != true`, dan role `admin`/`trainer` sesuai route aktual.
- [ ] Session harus ada sebelum broker dipanggil; tidak ada auto-create fallback seperti behavior `TelefunAuthGate` saat `sessionId` kosong.
- [ ] Session harus owned oleh authenticated user, `status = active`, dan cocok dengan model/transport POC; session foreign, terminal, pending, atau mismatch ditolak.
- [ ] Endpoint inbound hanya menerima body raw SDP dengan `Content-Type: application/sdp`; multipart/FormData, JSON, field `session`, dan config dari browser ditolak fail-closed. `sessionId` hanya berasal dari path `:sessionId` dan tetap diverifikasi terhadap ownership/state server.
- [ ] Server membangun session JSON kanonik dengan model, voice, instructions, audio input/output, dan VAD POC.
- [ ] Fake upstream mengembalikan SDP answer dan `Location` valid; broker mengembalikan SDP answer ke browser tanpa secret/call credential.
- [ ] `Location` malformed, host/path salah, call ID kosong/terlalu panjang/berkarakter ilegal, atau call ID yang tidak sama dengan binding ditolak dan sideband tidak dibuka.
- [ ] Fake sideband mengirim transcript delta/done, `response.done` usage, duplicate event, malformed event, dan close; observer menyimpan/meringkas tepat sekali.
- [ ] End eksplisit dan cleanup sideband/provider/session aman jika dipanggil dua kali, jika browser close sebelum ACK, jika sideband close lebih dulu, dan jika finalization gagal sementara.
- [ ] Browser harness membuktikan offer/answer, mic track, remote track/data channel, error/timeout, dan cleanup tanpa `OPENAI_API_KEY` dalam bundle/network payload/console.
- [ ] Gemini WebSocket tests dan existing OpenAI WebSocket tests tetap hijau.

### Edge cases wajib

| Area | Kasus | Perilaku yang direncanakan |
|---|---|---|
| Auth | JWT invalid/expired, profile hilang, pending/rejected/deleted, role bukan admin/trainer | `401/403` aman; tidak memanggil OpenAI |
| Ownership | session user lain, session ID random, session tidak ada | `403/404` generik; tidak membuka sideband |
| State | session `pending`, `completed`, `failed`, duplicate active attempt | tolak; satu active POC binding per session |
| Input | SDP kosong/bukan SDP, content type selain `application/sdp` (termasuk multipart/FormData atau JSON), body terlalu besar | `400`; tidak meneruskan data browser ke provider |
| CORS/header | preflight atau Origin tidak diizinkan, method/header tidak di-allowlist | `4xx`/preflight reject; tidak membuka provider call |
| Provider | upstream 4xx/5xx, timeout, answer bukan SDP, Location hilang/malformed | session attempt gagal, cleanup best-effort, no secret leak |
| Binding | call ID duplicate, call ID dari binding lain, sideband event tanpa binding | drop/fail-closed dan diagnostic bounded |
| Sideband | reconnect/duplicate event/out-of-order/unknown event | dedupe by stable ID; unknown tidak ditulis/panic |
| End | DELETE session-bound dua kali, browser crash, sideband close, provider close | finalizer sekali; status terminal jujur; retry usage terjadwal |
| Browser | mic deny/device unplug, ICE failure, data channel close, page unmount | error terukur dan semua resource dibersihkan |
| Security | prompt injection atau config override via browser body/path, Origin tidak diizinkan, error provider berisi secret | canonical config tetap server-built; ownership/path dan origin/auth reject; redact logs |
| Cost | usage tidak ada/tidak lengkap/breakdown tidak priceable | jangan mensintesis token/cost; audit warning dan retry/reconciliation |

### Constraint teknis dan operasional

- Service runtime adalah Node/TypeScript pada `apps/telefun`; dependency yang ada (`ws`, `zod`, Supabase client) diprioritaskan. Jangan menambah library WebRTC server karena broker hanya HTTP + sideband.
- Frontend adalah Vite/React; browser native `RTCPeerConnection`, `RTCDataChannel`, `MediaStream`, dan `HTMLAudioElement` digunakan.
- Model/transport canonical berada di `packages/types/src/ai-models.ts`. Transport baru harus ditambahkan eksplisit, bukan mengubah arti `openai-audio`.
- Prompt/config Telefun aktual masih dibangun di frontend (`promptBuilder.ts`). Untuk POC, konfigurasi authoritative harus dipindahkan/didefinisikan server-side dalam modul POC dan tidak menerima prompt browser; pemindahan prompt produk penuh dijadwalkan fase lanjutan.
- `apps/telefun/src/server.ts` dan `OpenAIRealtimeAdapter.ts` sudah besar; endpoint broker, lifecycle, dan observer harus diekstrak ke modul kecil.
- Tidak boleh menjadikan `/health` sebagai probe provider berbayar. Fake-upstream adalah satu-satunya verifikasi otomatis Phase 1.
- Database migration dan distributed coordination tidak boleh disamarkan sebagai POC production readiness.

### Asumsi, konflik, dan keputusan resolusi

| Temuan | Keputusan untuk rencana |
|---|---|
| `docs/auth-rbac.md` memiliki prose yang stale tentang akses Telefun agent, sedangkan `apps/api/src/routes/telefun.ts` memakai `requireRole("admin", "trainer")` | Implementation reality menjadi source of truth: broker POC mengikuti admin/trainer dan profile aktif. Docs auth-rbac perlu disinkronkan pada fase dokumentasi, bukan diubah dalam task planning ini. |
| `TelefunAuthGate` dapat membuat session baru jika auth tanpa `sessionId` | WebRTC broker tidak memakai fallback auto-create. `sessionId` wajib berasal dari path endpoint, lalu session wajib pre-created, active, owned, dan di-claim secara eksplisit. |
| ADR lama memilih satu authenticated WS proxy dan menolak browser-direct WebRTC | ADR tersebut adalah baseline historis. ADR superseding hanya dibuat setelah Phase 1 gate; Gemini/WS decision tetap berlaku. |
| `telefun-audio` adalah transport OpenAI WebSocket saat ini | Jangan rename/overwrite. Tambahkan `openai-webrtc` dan migrasikan selection hanya pada fase UI/rollout yang disetujui. |
| Official contract sudah diverifikasi melalui Context7 pada `developers_openai_api` | Gunakan multipart upstream Telefun -> OpenAI dengan field `sdp` + JSON `session`, response `Location`/`call_id`, dan sideband `wss://api.openai.com/v1/realtime?call_id=...`; browser -> Telefun tetap raw `application/sdp` session-bound, bukan multipart atau JSON; jangan mengubahnya menjadi ephemeral token tanpa keputusan baru. |
| Tidak ada otorisasi paid/manual external call | Semua test provider di Phase 1 fake. Bukti audio bidirectional provider nyata adalah gate paid/manual terpisah yang harus memperoleh otorisasi dan tidak boleh diklaim sebagai Phase 1 completion. |

### Referensi source of truth

- [Audit teknis](../../docs/telefun-openai-webrtc-technical-audit.md)
- [Modul Telefun](../../docs/telefun.md)
- [Deployment/Railway](../../docs/deployment.md)
- [System architecture](../../docs/architecture.md)
- [ADR provider adapters](../../docs/adr/telefun-realtime-provider-adapters.md)
- [Auth/RBAC](../../docs/auth-rbac.md), dengan konflik aktual route dicatat di atas
- [Model/transport registry](../../packages/types/src/ai-models.ts)
- [Telefun proxy entrypoint](../../apps/telefun/src/server.ts)
- [Telefun auth](../../apps/telefun/src/server-auth.ts)
- [Telefun persistence helper](../../apps/telefun/src/db.ts)
- [OpenAI WebSocket adapter](../../apps/telefun/src/providers/OpenAIRealtimeAdapter.ts)
- [Browser session lifecycle](../../apps/web/src/routes/telefun/services/liveSession.ts)
- Test existing: `apps/telefun/src/providers/OpenAIRealtimeAdapter.test.ts`, `server-auth.test.ts`, `server-openai-wiring.test.ts`, `server-configuration.test.ts`, `server-protocol.test.ts`, `session-drain.test.ts`, `transcript.test.ts`, `__tests__/usage-modality.test.ts`, serta test Web `telefun-live-session-*.test.ts`, `telefun-openai-live-protocol.test.ts`, `telefun-live-session-playback.test.ts`, dan test API Telefun.
- Kontrak eksternal resmi yang sudah diverifikasi: `developers.openai.com` unified Realtime WebRTC, server controls, dan Realtime call contract.

---

## Design

### Keputusan arsitektur

1. **Control plane dan media plane dipisah.** Browser mengirim media langsung ke OpenAI melalui WebRTC. Telefun menerima SDP offer untuk brokerage, lalu membuka sideband ke call yang sama untuk transcript, usage, tools/control masa depan, finalization, dan audit.
2. **Server-owned configuration.** Browser mengirim raw SDP ke path session-bound; `sessionId` hanya merupakan path parameter yang diverifikasi server. Server mengambil row session dan membangun config POC.
   Tidak ada browser-supplied model, voice, system prompt, VAD, tool definition, session JSON, atau provider URL yang diteruskan.
3. **Dedicated transport.** `openai-webrtc` adalah transport baru. Existing Gemini WebSocket dan OpenAI WebSocket adapter tidak menjadi implementation detail tersembunyi dari client baru.
4. **Shared lifecycle, provider-specific adapters.** Transcript/usage/event observer diekstrak agar sideband dan OpenAI WebSocket dapat memakai contract yang sama, tetapi media/SDP/sideband tetap provider-specific.
5. **Fail closed.** Request invalid tidak membuat upstream call, tidak membuat session otomatis, tidak mengirim data mentah ke browser, dan tidak menyimpan token/cost rekaan.
6. **No mid-call provider fallback.** Jika WebRTC gagal sebelum connected, fallback hanya boleh dilakukan oleh fase rollout yang sudah mendefinisikan attempt/session boundary baru; Phase 1 hanya mengakhiri attempt secara jujur.

### Data flow Phase 1

```text
1. API route (admin/trainer + auth) membuat telefun_history status=active.
2. Browser harness mendapatkan Supabase access token dan sessionId dari session pre-created.
3. Browser membuat RTCPeerConnection dan local SDP offer.
4. Browser POST raw SDP ke
      /telefun/realtime/openai/webrtc/sessions/:sessionId/call
      Content-Type: application/sdp
      Authorization: Bearer <Supabase JWT>
      Origin: exact allowed web origin
      Body: <browser SDP offer saja>
5. Telefun broker:
      a. parse raw SDP size/content/origin/path
      b. verify JWT + profile status ternormalisasi active, not deleted + role admin/trainer
      c. load owned active session dari :sessionId; reject auto-create/foreign/terminal
      d. verify POC model/transport dan one-attempt binding
      e. build canonical session JSON server-side
      f. POST multipart { sdp, session } to OpenAI /v1/realtime/calls
      g. parse SDP answer + trusted Location/call_id
      h. bind (attemptId, userId, sessionId, callId)
      i. open sideband using callId; attach observer
      j. return only SDP answer to browser
6. Browser sets remote description, sends mic track, receives remote track,
   attaches remote audio and opens/observes data channel.
7. Sideband observer receives provider events:
      transcript -> TranscriptCollector/POC sink (dedupe)
      response.done -> OpenAI usage accumulator (dedupe)
      errors/state -> bounded diagnostics + lifecycle state
8. Browser sends idempotent DELETE ke endpoint session-bound yang sama untuk end;
   broker ends provider/sideband once, flushes transcript/usage, updates owned
   session once, dan cleans binding.
```

### Endpoint and payload contract

Endpoint konseptual Phase 1 (nama final harus konsisten di test dan docs):

```text
POST /telefun/realtime/openai/webrtc/sessions/:sessionId/call
Authorization: Bearer <Supabase access token>
Origin: <allowlisted web origin>
Content-Type: application/sdp

Body:
  <raw SDP offer saja>

Response sukses:
  201/200
  Content-Type: application/sdp
  Body: <OpenAI SDP answer>

DELETE /telefun/realtime/openai/webrtc/sessions/:sessionId/call
Authorization: Bearer <Supabase access token>
Origin: <allowlisted web origin>
Body: kosong
Response: idempotent 200/204 untuk end yang sudah/baru dilakukan
```

`sessionId` berasal dari path, bukan dari body, multipart field, atau config browser; broker tetap memuat dan memverifikasi session ownership/state di server. Inbound browser hanya raw SDP. Multipart/FormData dengan field `sdp` dan JSON `session` hanya dipakai Telefun -> OpenAI. Client payload tidak boleh memuat model, voice, instructions, audio/VAD config, session JSON, provider URL, API key, atau Authorization provider. Request tidak boleh mengembalikan `call_id` jika tidak dibutuhkan client; bila telemetry client membutuhkan correlation, gunakan opaque attempt ID yang tidak dapat dipakai untuk sideband.

Karena `application/sdp` dan `Authorization` adalah request headers non-simple, endpoint harus menangani preflight `OPTIONS` tanpa membuka provider call. CORS memakai exact allowed origins dan hanya mengizinkan `POST`, idempotent `DELETE`, serta `OPTIONS` dengan request headers `Authorization` dan `Content-Type`; jangan expose `Location` provider atau credential. `DELETE` tidak menerima body. Origin, method, path `sessionId`, content type, dan body size divalidasi sebelum auth/provider work; flag off tetap menolak seluruh endpoint.

Broker membangun request upstream sebagai berikut:

```ts
const upstreamSession = {
  type: "realtime",
  model: POC_MODEL_ID,                 // server-owned, registry-validated
  instructions: POC_SERVER_INSTRUCTIONS,
  output_modalities: ["audio"],
  audio: {
    input: {
      format: { type: "audio/pcm", rate: 24_000 },
      transcription: { model: "gpt-4o-mini-transcribe" },
      turn_detection: {
        type: "server_vad",
        create_response: true,
        interrupt_response: true,
      },
    },
    output: {
      format: { type: "audio/pcm", rate: 24_000 },
      voice: POC_VOICE,
    },
  },
};

const form = new FormData();
form.set("sdp", browserOfferSdp);
form.set("session", JSON.stringify(upstreamSession));
await fetch("https://api.openai.com/v1/realtime/calls", {
  method: "POST",
  headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
  body: form,
});
```

> Implementasi harus mengikuti response headers/body aktual dari contract resmi saat coding. Jangan mengarang `call_id` dari SDP atau menerima arbitrary `Location` tanpa validasi origin/path/ID.

### Component tree dan module boundaries

```text
apps/telefun/src/
├── server.ts                         # route registration + existing WS only
├── realtime-webrtc/
│   ├── http-broker.ts                # HTTP/CORS/raw SDP body/auth orchestration
│   ├── broker-auth.ts                # JWT + profile role/status + session ownership
│   ├── openai-calls-client.ts        # unified calls fetch, FormData, answer/Location
│   ├── call-binding.ts               # attempt/session/user/call_id binding + state
│   ├── sideband-client.ts            # sideband WS connection and close lifecycle
│   ├── sideband-event-observer.ts    # transcript/usage/error dedupe only
│   ├── lifecycle.ts                  # idempotent end/finalize/cleanup state machine
│   ├── contracts.ts                  # Zod/types, POC flag and bounded constants
│   └── fake-upstream.ts               # test-only HTTP/WS doubles, never production
├── providers/
│   ├── OpenAIRealtimeAdapter.ts      # existing WS adapter; preserve behavior
│   └── ...
└── server.ts

apps/web/src/routes/telefun/
├── services/
│   ├── liveSession.ts                 # existing WS lifecycle; no Phase 1 replacement
│   └── openaiWebRtc/
│       ├── OpenAIWebRtcSession.ts     # isolated client/harness lifecycle
│       ├── brokerApi.ts               # raw application/sdp POST + session-bound DELETE only
│       ├── media.ts                   # mic/remote audio/recording hooks later
│       └── cleanup.ts                  # deterministic resource cleanup
└── __tests__/
    ├── telefun-openai-webrtc-client.test.ts
    └── telefun-openai-webrtc-cleanup.test.ts
```

`server.ts` hanya mendaftarkan route HTTP dan menyambungkan dependency; jangan menambahkan multipart parsing, provider fetch, sideband event switch, transcript merge, dan finalizer baru ke file itu. `OpenAIRealtimeAdapter.ts` tetap menjadi WebSocket adapter; event normalization bersama diekstrak perlahan dengan test parity, bukan copy-paste 1.156-line file.

### Interface target

```ts
type OpenAiWebRtcCallRequest = {
  sessionId: string; // path parameter; server re-checks ownership/state
  offerSdp: string; // raw application/sdp request body
};

type CanonicalPocSessionConfig = {
  modelId: "gpt-realtime-2.1";
  voice: "marin";
  instructions: string; // dibangun server, bukan browser
  inputSampleRateHz: 24_000;
  outputSampleRateHz: 24_000;
};

type CallBinding = {
  attemptId: string;
  userId: string;
  sessionId: string;
  callId: string;
  state: "brokered" | "sideband_connected" | "ending" | "ended";
};

interface OpenAiCallsClient {
  createCall(input: {
    offerSdp: string;
    session: CanonicalPocSessionConfig;
  }): Promise<{ answerSdp: string; callId: string }>;
}

interface OpenAiWebRtcBrokerApi {
  createCall(sessionId: string, offerSdp: string): Promise<{ answerSdp: string }>;
  endCall(sessionId: string): Promise<void>; // idempotent DELETE
}

interface SidebandEventObserver {
  observe(event: unknown, binding: CallBinding): void;
  flush(): Promise<{ transcript: unknown[]; usage: unknown | null }>;
}

interface WebRtcLifecycle {
  end(reason: "user" | "timeout" | "cleanup" | "provider_error"): Promise<void>;
  cleanup(): Promise<void>;
}
```

Interface final harus memakai shared transcript/usage types yang ada (`TranscriptCollector`, `OpenAIUsageAccumulator`) atau extracted contracts yang diuji parity. `unknown` di atas adalah batas konseptual; production implementation wajib parse schema sebelum persistence.

### Auth dan ownership boundary

- Gunakan verifier Supabase server-side yang sudah ada, tetapi tambahkan dependency untuk membaca profile fields minimum: `id`, normalized `role`, `status`, `is_deleted`.
- Validasi profile dengan status ternormalisasi kanonik `active` dan `is_deleted !== true`; role hanya `admin` atau `trainer` pada broker POC. Nilai legacy `approved` hanya dinormalisasi oleh boundary auth menjadi `active`, bukan status yang diminta broker.
- Ambil `sessionId` dari path endpoint, lalu load `telefun_history` memakai admin client hanya setelah JWT valid, dengan filter `id = sessionId` dan `user_id = userId`; jangan hanya percaya path browser tanpa ownership/state check.
- Wajib `status = active`, model/transport sesuai POC, dan belum ada binding aktif untuk attempt yang sama. Jangan memanggil `createSession()` dari broker.
- Error publik harus generik; detail DB/provider hanya ada di bounded structured logs.

### Event authority dan exactly-once

Sideband adalah owner event server untuk jalur WebRTC. Browser DataChannel boleh menerima event UI pada fase integrasi, tetapi tidak boleh menjadi sumber persistence atau usage billing.

| Event | Owner | Dedupe key | Aksi Phase 1 |
|---|---|---|---|
| input transcript completed | sideband observer | `(binding, item_id)` | append speaker `agent` |
| output transcript delta/done | sideband observer | `event_id`/`(item_id, done)` | append/merge speaker `consumer` |
| `response.done` usage | usage observer | `(binding, response.id)` | observe sekali; no synthetic tokens |
| provider error/close | lifecycle | `(binding, terminal event)` | status failed/cleanup once |
| end request | lifecycle | `attemptId` | idempotent transition `ending -> ended` |
| final session write | finalizer | `(sessionId, attemptId)` | one terminal update; retry safe |

Jika database belum memiliki unique/idempotency column, Phase 1 boleh memakai binding registry single-process yang jelas diberi label POC-only dan request ID deterministik; sebelum production pilot, durable idempotency/lease migration wajib lulus gate.

### Browser WebRTC client/harness

Client Phase 1 tidak menggantikan `LiveSession`. Minimal lifecycle:

```text
idle
  -> acquiring_media
  -> creating_offer
  -> brokering_sdp
  -> connecting
  -> connected
  -> ending
  -> ended
```

Aturan resource:

- `getUserMedia()` dipanggil sekali; track yang sama dipakai untuk `addTrack()`.
- `RTCPeerConnection` memakai `ontrack`, `onconnectionstatechange`, `oniceconnectionstatechange`, `ondatachannel`/outbound data channel sesuai contract.
- Remote stream dipasang pada audio element dengan `srcObject`; recording mixing tidak dijadikan acceptance Phase 1.
- `track.enabled = false` hanya dicatat sebagai capability client; mute/hold production tetap fase berikutnya.
- Cleanup selalu idempotent: remove listeners, close data channel, stop sender/receiver/local/remote tracks, clear audio `srcObject`, close peer, revoke object URL, clear timers.
- Tidak boleh ada `new WebSocket()` ke provider dari browser dan tidak boleh ada provider key di Vite env.

### Observability dan data minimization

Structured logs/metrics minimal:

- `attempt_id`, `session_id`, `user_id_hash`, `transport`, `model_id`, `state`, latency bucket; jangan log email, prompt, SDP penuh, bearer, API key, atau raw audio.
- Counter: broker accepted/rejected by safe reason, upstream call result, Location parse result, sideband connected/closed, duplicate transcript/usage, finalizer retry, orphan candidate.
- Timer: SDP broker latency, sideband attach latency, time-to-connected, end-to-finalized.
- Usage: response count, missing usage count, unpriceable breakdown count, persisted/not-persisted; tidak menyamakan missing usage dengan zero usage.
- Correlation: `attempt_id` internal; `call_id` hanya disimpan/ditampilkan dalam bentuk hash atau metadata bounded bila tidak wajib untuk support.
- `/health` dan readiness tetap non-billable; jangan membuka SDP call atau sideband.

### Security design

- `OPENAI_API_KEY` hanya dibaca di Telefun server runtime dan hanya dipakai oleh `openai-calls-client`/sideband auth.
- Broker exact-origin allowlist; production tidak boleh memakai `ALLOWED_ORIGINS=*` untuk endpoint berbayar.
- Batasi raw SDP body; wajib `Content-Type: application/sdp`; reject multipart/FormData, JSON, body kosong, unknown content type, dan payload yang terlalu besar. `instructions`/session JSON hanya ada pada request server-built ke provider.
- Redact provider error message, Authorization, SDP, prompt, user ID, dan credential dari log/client response.
- JWT, profile, ownership, active state, feature flag, dan model/voice allowlist diverifikasi sebelum biaya provider dibuat.
- POC single-process dan tanpa distributed quota **bukan** production security/cost readiness; endpoint harus tetap inaccessible ketika flag off.
- Tool calling tidak diaktifkan pada POC; jika diaktifkan kemudian, hanya sideband/server allowlist yang boleh mengeksekusi tool.

---

## Tasklist

### Urutan dan phase gates

```text
Gate 0: contract + test design disetujui
   ↓
Phase 1: isolated OpenAI WebRTC POC, fake upstream only
   ↓ Gate P1: all automated acceptance + Gemini/WS regression green
Phase 2: extract shared lifecycle/event observer, no cutover
   ↓ Gate P2: parity tests, feature flags off, no giant-file regression
Phase 3: browser transport adapter and non-production harness integration
   ↓ Gate P3: browser matrix/local fake E2E, no production default
Phase 4: durable transcript/usage/finalization + recording design
   ↓ Gate P4: migration, exactly-once, recording/scoring acceptance
Phase 5: security/cost hardening, distributed lease/quota, recovery
   ↓ Gate P5: load/browser/network/observability and manual approval checklist
Phase 6: authorized pilot and staged production rollout
   ↓ Gate P6: rollback drill, Gemini regression, reconciliation
Phase 7: parity completion and deprecation decision (optional)
```

Setiap gate memerlukan checklist lulus, diff review, `git diff --check`, thermo-nuclear quality review untuk code implementation, dan bukti command yang benar-benar dijalankan. Tidak ada gate yang dianggap lulus hanya berdasarkan plan.

### Phase 0 — Contract, inventory, dan test harness design

**Tujuan:** mengunci boundary sebelum menyentuh product behavior.

**Files to inspect/prepare pada implementasi berikutnya:**

- `packages/types/src/ai-models.ts`, `packages/types/src/telefun.ts`
- `apps/telefun/src/server.ts`, `server-auth.ts`, `db.ts`, `env-schema.ts`, `server-protocol.ts`
- `apps/telefun/src/usage.ts`, `transcript.ts`, `session-drain.ts`
- `apps/telefun/src/providers/OpenAIRealtimeAdapter.ts` dan `RealtimeProviderAdapter.ts`
- `apps/web/src/routes/telefun/services/liveSession.ts`, `liveProtocol/**`, `sessionFinalizer.ts`
- `apps/api/src/routes/telefun.ts`, `routes/telefun/sessions.ts`, `middleware/role.ts`
- Test existing dari Requirement/source references.

**Tasks:**

- [ ] Tulis contract test cases untuk session-bound POST raw `application/sdp`, idempotent DELETE, CORS/preflight headers, `Location/call_id`, auth/ownership, sideband dedupe, end idempotency, dan browser cleanup.
- [ ] Putuskan nama transport dan flag tanpa mengubah default registry.
- [ ] Putuskan satu model/voice POC dari registry; jika `marin` tidak menjadi voice canonical saat coding, gunakan satu voice OpenAI registry yang sudah diuji dan ubah hanya contract/test secara atomik.
- [ ] Tetapkan fake upstream API surface dan event fixtures; fixture tidak boleh berisi credential nyata.
- [ ] Catat baseline test Gemini/OpenAI WebSocket sebelum implementasi.

**Gate 0:** tidak ada ambiguity tentang source of truth, payload, role, session precondition, atau paid-test policy.

### Phase 1 — Bounded OpenAI-only unified WebRTC POC

**Tujuan:** membuktikan keamanan/auth brokerage, offer/answer dan media-track/data-channel wiring WebRTC pada harness fake, sideband observation, call binding, exactly-once end/cleanup, tanpa production cutover atau provider-audio claim.

#### Backend tasks

- [ ] Tambahkan `openai-webrtc` contract/POC flag secara additive; default `false` dan readiness tidak melakukan upstream call.
- [ ] Ekstrak `http-broker.ts`, `broker-auth.ts`, `openai-calls-client.ts`, `call-binding.ts`, `sideband-client.ts`, `sideband-event-observer.ts`, `lifecycle.ts`, dan `contracts.ts`; `server.ts` hanya wiring.
- [ ] Register authenticated `POST /telefun/realtime/openai/webrtc/sessions/:sessionId/call` untuk raw `application/sdp` dan idempotent `DELETE` pada path yang sama; kedua method wajib melalui flag, CORS, auth, ownership, dan lifecycle gate.
- [ ] Implementasikan parser raw SDP yang bounded untuk body `application/sdp`; validasi content type, size, dan `:sessionId`, serta tolak multipart/FormData/JSON inbound.
- [ ] Implementasikan auth/profile/role/ownership gate; session harus pre-created, `active`, owned, dan POC-compatible.
- [ ] Implementasikan server-owned `CanonicalPocSessionConfig`; jangan memakai `instructions`, `model`, `voice`, atau provider URL dari browser.
- [ ] Implementasikan `OpenAiCallsClient` dengan `FormData`, `sdp`, JSON `session`, server-only Authorization, timeout, safe errors, dan SDP answer validation.
- [ ] Parse/validate `Location` dari host/path provider yang diizinkan; extract bounded `call_id`; bind exact call ID ke attempt/user/session.
- [ ] Implementasikan sideband attach hanya setelah binding tersimpan; sideband tidak boleh menerima call ID dari browser.
- [ ] Implementasikan observer event minimal untuk transcript dan `response.done` usage dengan dedupe dan bounded raw metadata.
- [ ] Implementasikan lifecycle `brokered -> sideband_connected -> ending -> ended`, explicit end, provider/sideband close, cleanup, dan finalization idempotent.
- [ ] Tambahkan test-only fake HTTP upstream dan fake sideband WebSocket; jangan import fake ke production runtime.
- [ ] Pastikan existing OpenAI WebSocket adapter tidak dipakai oleh endpoint POC dan tidak berubah behavior.

#### Browser harness tasks

- [ ] Buat client/harness terisolasi yang membuat offer, mengirim raw SDP ke URL session-bound, menerapkan answer, dan mengelola native WebRTC events; `brokerApi` hanya memiliki POST raw SDP dan DELETE session-bound, tanpa session/config JSON.
- [ ] Gunakan fake `RTCPeerConnection`, `MediaStream`, tracks, `RTCDataChannel`, audio element, dan timers dalam unit tests.
- [ ] Pastikan client hanya menerima SDP answer/opaque status; tidak menerima provider Authorization/API key/sideband URL.
- [ ] Uji cleanup pada success, broker reject, upstream reject, ICE failure, data channel close, timeout, unmount, dan duplicate end.
- [ ] Jangan menghubungkan harness ke production `LiveSession`, settings UI, recording, scoring, hold, barge-in, atau fallback.

#### Phase 1 TDD matrix

| RED test lebih dulu | GREEN implementation minimum |
|---|---|
| broker menolak flag off dan invalid auth | gate sebelum provider client |
| profile pending/deleted/role salah | `broker-auth` profile contract |
| foreign/non-active/missing session | owned pre-created session loader |
| browser prompt/model/voice override | strict inbound schema + canonical builder |
| browser endpoint menerima raw SDP dan provider upstream menerima sdp/session | raw `application/sdp` broker parser + `openai-calls-client` FormData |
| session-bound DELETE dan CORS preflight | route/lifecycle idempotency + exact-origin header tests |
| malformed Location/call ID | parser + binding validation |
| duplicate/mismatched call binding | `call-binding` state machine |
| duplicate transcript/response.done | sideband observer + existing accumulators |
| end dua kali/close race | lifecycle idempotency |
| fake RTCPeerConnection offer/answer, media-track wiring, dan cleanup | browser harness cleanup; tidak membuktikan audio provider nyata |
| secret appears in serialized payload/log | redaction/negative assertions |
| Gemini/WS baseline regression | untouched existing path + suite |

#### Phase 1 verification commands

```bash
# POC backend tests (nama file final mengikuti implementation)
pnpm --filter @trainers/telefun test -- realtime-webrtc
pnpm --filter @trainers/telefun test -- server-auth server-configuration server-protocol

# Existing OpenAI/Gemini/usage regression
pnpm --filter @trainers/telefun test -- OpenAIRealtimeAdapter provider-router transcript usage

# Browser harness and existing live-session regression
pnpm --filter @trainers/web test -- telefun-openai-webrtc telefun-live-session-openai telefun-live-session-auth telefun-live-session-drain telefun-live-session-playback telefun-openai-live-protocol

# Type/lint/build focused
pnpm --filter @trainers/telefun lint
pnpm --filter @trainers/telefun build
pnpm --filter @trainers/web build
```

**Gate P1 — wajib semua:**

- [ ] Semua automated fake-upstream tests lulus.
- [ ] Auth, normalized-active admin/trainer profile, ownership, pre-created session, canonical config, call ID binding, sideband transcript/usage exactly-once, end idempotency, dan browser cleanup masing-masing punya assertion eksplisit.
- [ ] Fake `RTCPeerConnection` hanya membuktikan offer/answer, media-track/data-channel wiring, dan cleanup; tidak dianggap bukti audio bidirectional dari provider nyata.
- [ ] POST raw `application/sdp`, path session binding, rejection atas inbound multipart/JSON/session field, idempotent DELETE, dan CORS/preflight memiliki assertion eksplisit.
- [ ] Tidak ada paid/manual external call yang diklaim atau dijalankan; bukti audio provider nyata tetap gate terpisah yang membutuhkan otorisasi eksplisit.
- [ ] Gemini dan existing OpenAI WebSocket test tetap hijau.
- [ ] Flag off tetap default; `/health` tidak membuka provider.
- [ ] Review memastikan tidak ada pertumbuhan besar `server.ts`/`OpenAIRealtimeAdapter.ts`.

### Phase 2 — Shared lifecycle/event extraction dan parity

**Tujuan:** mengurangi duplikasi dan menyiapkan integrasi tanpa mengganti transport.

**Files affected:**

- `apps/telefun/src/providers/OpenAIRealtimeAdapter.ts` → adapter tipis yang memakai parser/observer bersama secara bertahap.
- `apps/telefun/src/providers/RealtimeProviderAdapter.ts` → capability contract bila diperlukan.
- `apps/telefun/src/transcript.ts`, `usage.ts`, `session-drain.ts` → shared contracts, bukan provider-specific copy.
- `apps/telefun/src/realtime-webrtc/*` → sideband implementation production-shaped.
- `apps/telefun/src/server.ts` → wiring only.
- Existing adapter/protocol tests plus new parity tests.

**Tasks:**

- [ ] Ekstrak event normalization untuk transcript/usage/terminal state dengan input provider-specific yang tetap terisolasi.
- [ ] Pertahankan dedupe semantics OpenAI WebSocket: response ID, transcription item ID, output transcript delta/done, tool call ID.
- [ ] Tambahkan sideband observer contract yang sama-sama dapat mengirim event ke lifecycle, bukan ke browser authority.
- [ ] Bandingkan snapshot transcript/usage/final status fake WS vs fake sideband untuk fixture yang ekuivalen.
- [ ] Tambahkan guards agar browser event/DataChannel tidak bisa melakukan persistence ganda.
- [ ] Pertahankan `GeminiLiveAdapter`, Gemini reconnect/resumption, PCM 16 kHz, drain, hold, recording, dan scoring tanpa behavior change.

**Gate P2:** parity test lulus, file besar tidak membesar materially, flag off, no production route selection.

### Phase 3 — Browser transport adapter dan integration harness non-produksi

**Tujuan:** menghubungkan lifecycle UI secara additive setelah POC server aman.

**Files affected:**

- `apps/web/src/routes/telefun/services/openaiWebRtc/OpenAIWebRtcSession.ts`
- `apps/web/src/routes/telefun/services/openaiWebRtc/brokerApi.ts`, media/cleanup helpers
- `apps/web/src/routes/telefun/services/liveSession.ts` hanya pada interface extraction/transport selection yang backward-compatible
- `apps/web/src/routes/telefun/components/PhoneInterface.tsx`
- `apps/web/src/routes/telefun/components/useMicrophoneActivity.ts`
- `apps/web/src/routes/telefun/telefunApi.ts`, types/settings/voice registry
- `packages/types/src/ai-models.ts`, `telefun.ts`
- `apps/web/src/__tests__/telefun-live-session-*.test.ts*` dan new WebRTC tests.

**Tasks:**

- [ ] Tambahkan `openai-webrtc` ke shared transport type/registry tanpa mengubah `openai-audio`.
- [ ] Pisahkan interface lifecycle (`connect`, `setMute`, `setHold`, `sendControlEvent`, `end`, cleanup, callbacks) dari WebSocket implementation.
- [ ] Buat transport adapter baru; pilih sebelum provider session dibuka dan jangan mid-call fallback.
- [ ] Reuse satu microphone stream untuk WebRTC track dan waveform; hilangkan kebutuhan membuka mic kedua.
- [ ] Tangani remote `ontrack`, data channel control/events, connection state, autoplay/user gesture, dan bounded timeout.
- [ ] Feature flag per user/session tetap off by default; harness hanya dapat diakses pada development/staging allowlist.
- [ ] Tetap gunakan Gemini WebSocket sebagai default dan rollback path.

**Gate P3:** fake browser E2E lulus Chrome/Firefox/Safari test doubles untuk offer/answer, media-track wiring, dan cleanup; ini bukan bukti audio provider nyata. Manual/paid provider smoke tetap gate terpisah, production default tetap false.

### Phase 4 — Durable transcript, usage, lifecycle, recording, dan evaluasi

**Tujuan:** menyamakan kualitas persistence dengan jalur lama sebelum pilot.

**Files affected:**

- `apps/telefun/src/realtime-webrtc/lifecycle.ts`, observer, `db.ts`, `usage.ts`, `transcript.ts`
- `apps/api/src/routes/telefun/sessions.ts`, `apps/api/src/routes/telefun/recordings.ts`, scoring service/worker
- `packages/types/src/telefun.ts`, transcript/assessment types
- Supabase migration baru yang additive dan test schema contract
- `apps/web/src/routes/telefun/sessionFinalizer.ts`, recording/remux services
- Existing API/schema/scoring/recording tests.

**Tasks:**

- [ ] Tambahkan durable binding/attempt/idempotency fields hanya setelah schema design dan migration review: provider call ID hash/reference, transport attempt, terminal state, finalization key, lease metadata.
- [ ] Tambahkan unique/conditional constraints atau RPC atomic claim yang menjamin satu active attempt dan satu finalization per `(session, attempt)`.
- [ ] Persist transcript incremental atau outbox yang retry-safe; handle partial transcript on disconnect.
- [ ] Persist OpenAI `response.done` usage exactly once; missing/unpriceable usage menjadi audit state, bukan zero/synthetic cost.
- [ ] Reconcile sideband event owner dengan `ai_usage_logs` request ID dan existing `flushOpenAIRealtimeUsage()` semantics.
- [ ] Redesign recording: mix local mic + remote WebRTC track ke `MediaStreamDestination`; pertahankan agent-only path.
- [ ] Pastikan `sessionFinalizer` tidak menandai completed sebelum server lifecycle/recording contract konsisten; scoring hanya setelah agent recording tersedia.
- [ ] Verifikasi remote audio masuk full-call recording, remux, signed URL, scoring provider match, history/review.
- [ ] Jangan mengubah K/A/S scoring contract tanpa requirement terpisah.

**Gate P4:** migration/schema/API tests, exactly-once/retry tests, full/agent recording tests, scoring/history tests, dan rollback migration plan disetujui.

### Phase 5 — Production hardening: security, quota, recovery, observability

**Tujuan:** mengatasi blocker audit yang sengaja ditunda dari POC.

**Files affected:**

- `apps/telefun/src/realtime-webrtc/*`, `server-auth.ts`, `env-schema.ts`, `health.ts`, `server.ts`
- `apps/api/src/middleware/rateLimit.ts`, Telefun sessions route/service, migrations/RPC
- `apps/web/public/serve.json`, `vercel.json`, deployment docs/config as authorized
- load/browser/network/observability tests and scripts.

**Tasks:**

- [x] Ganti single-process POC binding dengan distributed session quota/concurrency lease yang atomic dan expiry-safe (RPC/migration additive; evidence lokal memakai fake store dan static contract).
- [x] Tambahkan per-user/session/provider rate limit yang tidak bergantung pada memory satu replica (RPC database; WebRTC fail-closed bila RPC unavailable).
- [x] Tambahkan orphan cleanup worker untuk binding/session sideband/provider close; bedakan `completed`, `failed`, `network_lost`, `orphaned`.
- [x] Implementasikan browser/network recovery policy; bila recreate, buat attempt ID/session boundary baru dan catat discontinuity (tidak ada silent recreate).
- [x] Lock production origins; review CSP/Permissions Policy, HTTPS/WSS, CORS preflight, body limits, timeout, and SSRF-safe fixed upstream URL.
- [ ] Tambahkan metrics/alerts cost reconciliation, sideband disconnect, duplicate writes, missing usage, orphan, and session cap. Metric sink/persistence dan hashed-user correlation sudah ada; deployment alert rules masih pending Gate P5.
- [ ] Uji concurrency, Railway restart, sideband failure, tab crash, device unplug, Wi-Fi/mobile switch, and browser matrix. Fake-upstream/fake-browser/unit/static coverage sudah ada; Railway, load lintas replica, dan real-browser/device/network evidence masih pending Gate P5.
- [x] Pertahankan `GET /health` non-billable dan readiness safe.

**Gate P5:** **PARTIAL / BELUM LULUS** — distributed/fake recovery tests dan no-secret scan lulus; security review eksternal, load test/real browser matrix, Railway deployment smoke, migration/RLS execution, dan rollback drill masih tersisa. Root `pnpm lint` juga masih terblokir error pre-existing di luar scope Phase 5.

### Phase 6 — Authorized pilot dan rollout bertahap

**Tujuan:** mengaktifkan OpenAI WebRTC hanya pada cohort terkontrol setelah seluruh gate teknis.

**Preconditions:**

- [ ] Approval eksplisit untuk paid/manual smoke dan pilot cohort.
- [ ] `OPENAI_API_KEY` terpisah di Telefun Railway; flag false selama deploy/migration.
- [ ] Gemini baseline smoke dan WebSocket regression lulus.
- [ ] Fake-upstream CI lulus pada commit yang akan dideploy.
- [ ] Quota/lease/observability/rollback ready.

**Rollout sequence:**

1. Deploy additive code dengan `TELEFUN_OPENAI_WEBRTC_POC=false`/production flag false.
2. Jalankan health/readiness dan automated fake suite; tidak membuka call provider.
3. Jika disetujui, lakukan satu paid/manual smoke terpisah dengan akun admin/trainer, satu model/voice, durasi minimum, dan budget limit untuk membuktikan audio provider bidirectional nyata serta lifecycle. Hasil harus dilaporkan eksplisit; routine CI tidak boleh berubah menjadi paid call.
4. Aktifkan per-user/session allowlist kecil; monitor connection, transcript, usage, finalization, recording, cost, dan orphan metrics.
5. Perluas cohort hanya jika error budget dan reconciliation memenuhi gate; Gemini tetap default dan OpenAI WS fallback hanya sebelum call aktif bila contract sudah lulus.
6. Jangan fallback provider di tengah panggilan; session/attempt baru wajib dibuat untuk transport baru.

### Phase 7 — Parity, barge-in, dan keputusan deprecation (opsional)

**Tujuan:** menyelesaikan area yang secara eksplisit bukan Phase 1.

- [ ] Redesign barge-in berdasarkan remote track playback yang benar-benar terdengar, bukan asumsi `AudioBufferSourceNode` PCM queue.
- [ ] Validasi `response.cancel`, `conversation.item.truncate`, server VAD, transcript truncation, and rapid interruptions pada WebRTC.
- [ ] Buktikan hold/mute/time cue semantics, remote playback suppression, and metrics parity.
- [ ] Buktikan recording parity lintas browser/device, including autoplay and MediaRecorder variants.
- [ ] Putuskan apakah OpenAI WebSocket lama tetap fallback permanen atau boleh dideprecate; Gemini WebSocket tidak ikut keputusan ini.
- [ ] Update ADR superseding dan migration/deprecation notice hanya setelah evidence produksi tersedia.

### Verification ladder dan command matrix

Command berikut adalah rencana verifikasi; exit code hanya boleh dilaporkan setelah benar-benar dijalankan:

```bash
# Hygiene / scope
 git status --short
 git diff --check
 git diff -- .gitignore plan/markdown/telefun-openai-webrtc-migration.md

# Focused tests per phase
pnpm --filter @trainers/telefun test -- realtime-webrtc
pnpm --filter @trainers/telefun test -- OpenAIRealtimeAdapter server-auth server-configuration server-protocol session-drain transcript usage
pnpm --filter @trainers/web test -- telefun-openai-webrtc telefun-live-session-auth telefun-live-session-openai telefun-live-session-drain telefun-live-session-playback telefun-openai-live-protocol
pnpm --filter @trainers/api test -- telefun-routes telefun-schema-contract telefun-session-transcript-route telefun-live-model-registry

# Relevant package gates
pnpm --filter @trainers/telefun lint
pnpm --filter @trainers/telefun build
pnpm --filter @trainers/web build
pnpm lint
pnpm build
pnpm test:core

# Non-billable deployment/readiness checks (URLs supplied only in authorized env)
node scripts/deployment/railway-web-healthcheck-smoke.mjs
node scripts/deployment/telefun-railway-smoke.mjs
```

TDD execution order setiap behavior/security/API/schema change:

1. **RED:** tambahkan satu test focused untuk rejection/behavior/cleanup; jalankan command focused dan catat failure yang expected.
2. **GREEN:** implementasi minimum pada module boundary yang tepat; jalankan test yang sama sampai lulus.
3. **REFACTOR:** ekstrak duplikasi/event observer hanya saat green; ulangi focused test.
4. Jalankan regression Telefun, API, Web, lint, typecheck/build sesuai scope.
5. Jalankan thermo-nuclear code quality review setelah implementasi (dan setelah UI audit pada fase UI), perbaiki temuan material, lalu ulangi check terkait.
6. Re-read diff, verifikasi hanya file task yang dimaksud, dan jangan claim paid/manual smoke bila tidak dijalankan.

### Estimates, dependencies, dan sequencing

| Phase | Estimasi engineering | Dependency utama | Risiko/exit condition |
|---|---:|---|---|
| 0 | 0.5–1 hari | contract review, fixture design | stop jika auth/payload/role belum jelas |
| 1 | 2–4 hari | native browser mocks, fake HTTP/WS | stop jika exactly-once/call binding tidak terbukti |
| 2 | 2–4 hari | Phase 1 green, adapter parity | rollback extraction jika Gemini/WS regression |
| 3 | 3–6 hari | POC + shared lifecycle | flag tetap off jika browser cleanup/state belum stabil |
| 4 | 4–8 hari | schema/migration review, recording design | tidak pilot jika usage/recording/scoring belum durable |
| 5 | 4–8 hari | distributed DB/RPC, load environment | tidak paid pilot jika quota/orphan/security gap |
| 6 | 1–3 hari per gate/cohort | explicit approval, budget, secrets | immediate flag off/rollback pada anomaly |
| 7 | 3–7 hari | real evidence, browser matrix | optional; tidak memblokir POC demo |

Estimasi tidak termasuk review/approval eksternal, paid provider budget, perubahan kontrak scoring, atau deployment dashboard manual.

### Risk register

| Risiko | Dampak | Mitigasi | Owner/gate |
|---|---|---|---|
| Browser-direct melewati media proxy sehingga event hilang | transcript/usage/finalization kosong | sideband authoritative + fake event tests + durable outbox | P1/P4 |
| Broker menerima prompt/config browser | prompt injection, config tampering, cost abuse | minimal session reference + canonical server builder | P1 |
| Role/profile boundary stale | user unauthorized membuat call berbayar | normalized profile status `active`, not deleted, admin/trainer; actual Hono route source | P1 |
| `call_id` salah/tertaut ke session lain | sideband data leak/control salah | trusted Location parse + exact binding + duplicate reject | P1 |
| Event duplicate/out-of-order | double transcript/usage | stable dedupe keys, idempotent finalizer, unique DB contract | P1/P4 |
| Usage missing/unpriceable | billing audit tidak akurat | fail closed, warning/retry/reconciliation; no synthetic zero | P1/P4 |
| Session orphan/replica race | biaya dan active session bocor | POC explicitly non-prod; distributed lease/cleanup Phase 5 | P5 |
| `server.ts`/adapter giant file growth | maintainability/regression | module extraction + file-size/diff review | P1/P2 |
| Remote track tidak masuk recording | loss of review evidence | explicit audio graph/mixed recording design Phase 4 | P4 |
| Barge-in semantics berubah | transcript/audio mismatch | defer parity, measured playback/truncate redesign Phase 7 | P7 |
| Network/ICE disconnect | call status tidak jujur | state machine, discontinuity, orphan cleanup | P3/P5 |
| Wildcard origin/secret log | security exposure | exact origins, redaction tests, deployment review | P1/P5 |
| Provider contract drift | POC false positive | fixture contract tests + official docs re-check at implementation | P0/P1 |
| Paid smoke tidak diotorisasi | biaya/operational violation | separate explicit gate; fake-only default | all phases |

### Rollout, fallback, migration, dan rollback

#### Fallback operasional

```text
Gemini                 -> existing Gemini WebSocket (default baseline)
OpenAI WebSocket lama  -> existing `openai-audio` (unchanged backup before active call)
OpenAI WebRTC baru     -> allowlisted cohort only
```

- Transport dipilih sebelum provider session dibuat.
- Tidak ada mid-call fallback. Jika broker/ICE gagal sebelum connected dan fase rollout sudah mengizinkan fallback, batalkan attempt lalu buat session/attempt WS baru dengan boundary dan telemetry berbeda.
- Gemini tidak pernah dipindahkan ke OpenAI secara otomatis.
- `TELEFUN_OPENAI_WEBRTC_ENABLED=false` adalah kill switch untuk sesi baru; existing active calls mengikuti cleanup policy yang sudah didesain.

#### Migration plan

- **Phase 1–3:** additive code/flags; tidak ada migration wajib. Binding single-process hanya POC-only dan tidak boleh dianggap distributed safety.
- **Phase 4:** additive migration untuk attempt/binding/idempotency/lease fields atau RPC; backward-compatible reads/writes; update schema contract tests; backfill tidak diperlukan untuk history lama kecuali disetujui.
- **Phase 5:** enable atomic lease/quota/orphan cleanup setelah migration terverifikasi di staging; tidak mengubah rows history lama secara destruktif.
- **Phase 6:** rollout flag/config saja; tidak menghapus OpenAI WebSocket/Gemini path.
- **Phase 7:** deprecation hanya setelah retention, reconciliation, and rollback window disepakati.

#### Rollback

1. Set WebRTC flag false dan redeploy/restart Telefun; verifikasi health tidak membuka provider.
2. Hentikan cohort/allowlist WebRTC dan arahkan sesi baru ke baseline Gemini atau OpenAI WebSocket sesuai policy; jangan memindahkan active call.
3. Jika schema additive bermasalah, disable reads/writes fitur baru melalui compatibility gate; jangan drop column/migration secara manual.
4. Jalankan orphan cleanup/reconciliation untuk attempt yang `brokered`, `sideband_connected`, atau `ending` tanpa terminal outcome.
5. Verifikasi Gemini session creation/setup/playback/transcript/usage/end, history, recording, dan scoring.
6. Simpan evidence/log bounded dan buka incident review sebelum re-enable.

### Documentation dan Wiki sync

Setelah behavior/architecture berubah pada fase implementasi:

- [ ] Update `docs/telefun.md` dengan diagram dual transport, endpoint broker, sideband authority, state/error model, dan test policy.
- [ ] Buat ADR superseding `docs/adr/telefun-openai-webrtc.md` (atau nama yang disetujui) yang menjelaskan unified SDP + sideband dan tetapnya Gemini WS baseline.
- [ ] Update `docs/deployment.md` dengan env/flag, secret separation, origin allowlist, non-billable health, dan paid smoke gate.
- [ ] Update `docs/auth-rbac.md` untuk menghapus prose stale dan menyatakan actual Telefun API/broker role admin/trainer; jangan menyimpulkan akses agent dari frontend saja.
- [ ] Update `docs/architecture.md` dan kontrak shared types bila transport/data flow publik berubah.
- [ ] Update test/runbook docs dengan fake-upstream command dan explicit manual paid gate.
- [ ] Sync Wiki hanya jika Wiki merangkum endpoint, deployment, auth/RBAC, public contract, atau navigasi yang berubah; docs kanonik tetap source of truth.
- [ ] Jangan menaruh secret, SDP, token, prompt produksi, atau call ID mentah di docs/log/fixture.

### Definition of Done untuk keseluruhan migrasi

- [ ] P1–P5 gates lulus dan evidence command/exit code tersedia.
- [ ] Automated fake-upstream suite berjalan di CI tanpa paid provider call.
- [ ] Auth, ownership, canonical config, call binding, sideband transcript/usage exactly-once, end/cleanup idempotency terbukti.
- [ ] Gemini dan existing WebSocket behavior tetap lulus regression.
- [ ] Distributed quota/lease, orphan cleanup, durable idempotency, recording parity, barge-in parity, browser/network matrix, dan observability selesai pada fase masing-masing.
- [ ] Paid/manual smoke hanya dilaporkan jika authorization dan command benar-benar dijalankan.
- [ ] Rollback flag/route dan rollback migration telah diuji.
- [ ] Docs dan Wiki yang terdampak telah disinkronkan.

# System Architecture

Dokumen ini menjelaskan arsitektur teknis, tumpukan teknologi, dan struktur direktori proyek Trainers SuperApp (Monorepo Rebuild).

## Tech Stack

Aplikasi ini dibangun menggunakan arsitektur monorepo modern dengan pemisahan frontend dan backend yang jelas:

- **Monorepo Tool**: [Turborepo](https://turbo.build/) + [pnpm](https://pnpm.io/)
- **Frontend**: [Vite](https://vitejs.dev/) + [React 19](https://react.dev/) + [TanStack Router v1](https://tanstack.com/router)
- **Backend**: [Hono](https://hono.dev/) (Node.js API server)
- **Bahasa**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Backend as a Service**: [Supabase](https://supabase.com/) (Auth, PostgreSQL, RLS, Storage)
- **Animasi**: [Framer Motion / Motion](https://www.framer.com/motion/)
- **Visualisasi Data**: [Recharts](https://recharts.org/)
- **Ikon**: [Lucide React](https://lucide.dev/)
- **API Type Safety**: Hono RPC (`hc<AppType>`) untuk full type-safety antara frontend dan backend
- **Validasi**: [Zod](https://zod.dev/) (shared schemas di `packages/types`)

## High-Level Architecture

Production host ownership is split: `apps/web` is canonical on Vercel, while
`apps/api` and `apps/telefun` remain canonical Railway services. Railway Web is
an allowed normal STAGING target; only a Railway Web PRODUCTION deployment is
auxiliary/noncanonical and cannot by itself prove the Vercel Web release state.

```mermaid
graph TD
    User((User)) -->|Browser| ViteApp[Vite React SPA]
    ViteApp -->|"Hono RPC (fetch)"| HonoAPI[Hono API Server]
    HonoAPI -->|SQL / Auth| Supabase[(Supabase / PostgreSQL)]
    ViteApp -->|Client SDK / Realtime| Supabase
    ViteApp -->|WebSocket Voice| TelefunProxy[Telefun Node Proxy]
    TelefunProxy -->|Provider Adapter| RealtimeProvider[Realtime Provider]
    RealtimeProvider -->|Gemini Live| GeminiLive[Gemini Live API]
    RealtimeProvider -->|OpenAI Realtime| OpenAIRealtime[OpenAI Realtime API]
    HonoAPI -->|AI Analysis| AIProviders[Gemini / OpenAI]
```

### Penjelasan Alur:

1. **Frontend (`apps/web`)**: Vite + React SPA dengan TanStack Router. Semua route di-lazy load via `React.lazy()`.
2. **Backend (`apps/api`)**: Hono API server dengan route handlers di `src/routes/`. Business logic di `src/services/`.
3. **Hono RPC**: Frontend mengonsumsi API via `hc<AppType>` dari Hono RPC — full type-safety tanpa perlu definisi API terpisah.
4. **Supabase**: Menangani autentikasi user, penyimpanan data persisten, RLS, dan media Storage.
5. **RLS (Row Level Security)**: Memastikan keamanan data di tingkat database berdasarkan role user (Admin, Trainer, Leader, Agent).
6. **Telefun Proxy (`apps/telefun`)**: Service Node terpisah untuk memvalidasi token Supabase lalu meneruskan audio ke provider live API (Gemini Live atau OpenAI Realtime) melalui **provider adapter pattern**; Phase 2 mengekstrak shared OpenAI-only observer dan WS-only tool coordinator, lalu Phase 3 mengintegrasikan transport WebRTC secara capability-gated ke `PhoneInterface` tanpa mengubah default transport.
7. **AI Providers**: Modul simulasi dan laporan memakai provider abstraction server-side di backend (Hono) yang aktifnya hanya Gemini dan OpenAI direct. Semua AI calls dicatat ke `ai_usage_logs`.
8. **Shared Types (`packages/types`)**: Zod schemas dan TypeScript interfaces yang dipakai bersama oleh frontend dan backend.

### Telefun realtime split (Phase 3 integration + Phase 4 durability, default off)

- **Baseline produksi tetap unchanged**: `LiveSession`/`GeminiLiveAdapter` dan jalur OpenAI WebSocket legacy tetap menjadi baseline UI; `openai-audio` tidak disamarkan sebagai WebRTC.
- **Phase 3 capability-gated integration**: `apps/web/src/routes/telefun/services/openaiWebRtc/` menyediakan transport yang dipilih oleh `PhoneInterface` hanya ketika capability gate, feature flag, dan allowlist mengizinkan. Transport dibangun sebelum ringtone agar end/unmount memiliki cleanup session-bound; `connect()` dan media/provider work baru dimulai setelah ringtone, tanpa mid-call fallback.
- **Single-flight session creation**: landing Telefun memakai synchronous in-flight guard yang mencakup capability check dan `POST /telefun/sessions`; klik Start yang overlap dikoaleskan sebelum session creation sehingga satu aksi UI tidak meninggalkan duplicate active placeholder.
- **Phase 2 internal extraction**: shared OpenAI-only event observer dipakai oleh WS adapter dan sideband observer; tool execution tetap WS-only lewat `openai-realtime-tool-coordinator.ts`, sideband bersifat observation-only dengan bounded diagnostics/frame cap.
- **Data/control flow POC**: browser WebRTC media → OpenAI; browser SDP offer/answer → Telefun broker; Telefun → `POST https://api.openai.com/v1/realtime/calls` multipart `sdp` + `session`; Telefun → sideband `wss://api.openai.com/v1/realtime?call_id=...`.
- **Prompt/context authority**: the finalized Telefun context builder is shared by Gemini and the WebRTC UI path; the API persists its WebRTC prompt snapshot before broker start, and the Telefun broker validates required canonical sections before constructing the server-owned provider session. Missing/malformed snapshots fail closed instead of falling back to another identity or persona.
- **Guardrail rollout**: `TELEFUN_OPENAI_WEBRTC_POC_ENABLED=false` by default, allowlist kosong berarti deny-all, dan integrasi tetap non-production sampai gate terpisah disetujui. API dan Telefun harus memakai flag/UUID cohort yang sama; POST tetap kill-switched, sedangkan authenticated owner-bound DELETE cleanup tetap diizinkan saat flag start false. Tidak ada paid/manual smoke yang diklaim dari automated verification.

### Telefun Phase 4 durable lifecycle boundary

Jalur WebRTC memisahkan media browser dari control/persistence plane, tetapi server tetap menjadi pemilik lifecycle:

```text
Browser DELETE (session-bound)
  → Telefun HTTP broker
  → WebRtcCallManager.beginFinalization
  → provider hangup saat sideband admission open
  → seal admission → bounded drain → close sideband
  → transcript flush/checkpoint → usage persist/audit
  → durable terminal RPC
  → HTTP 204 atau retryable 503
```

`204` hanya berarti attempt/history sudah terminal secara durable (atau cleanup no-attempt sudah membuktikan state terminal). Timeout atau kegagalan persistence mempertahankan binding/attempt retryable dan menghasilkan `503`; conflict tetap `409`. Sideband menjadi owner event server: transcript memakai checkpoint sequence/dedupe key, usage memakai request ID stabil, dan metadata yang hilang/unpriceable dicatat sebagai audit incomplete, bukan token/cost sintetis.

Graceful shutdown menghentikan penerimaan start WebRTC baru, menunggu manager drain dan HTTP server close secara bersamaan, serta hanya keluar `0` jika keduanya berhasil dalam deadline. Failure/rejection/deadline keluar `1`. Ini tidak mengubah `LiveSession`, `GeminiLiveAdapter`, atau legacy OpenAI WebSocket.

Recording dan evaluasi mempunyai boundary durable terpisah:

- Browser menyimpan queue `telefun_recording_reconciliation:v1` yang path-only, owner-scoped, dua fase (`recording_transition_pending` dan `remux_pending`), maksimal 32 entry, TTL 7 hari, dan maksimal 8 retry bounded. Blob, token, SDP, provider ID, dan object URL tidak disimpan.
- API remux memproses semua sibling sebelum satu panggilan atomic `mark_telefun_recording_ready` untuk output seekable yang berhasil. Read-back ambiguous diperlakukan konservatif; hanya output yang dibuat invocation ini dan terbukti belum dipersist yang boleh dibersihkan.
- Scoring WebRTC memakai row lock pada completion dan exact owned `agent_only.seekable.webm` gate. Failed capture menginvalidasi row `processing` secara atomic; completion yang kalah race mengembalikan false/not-ready dan tidak di-requeue.

Implementasi ini memperbaiki lifecycle Phase 4 pada source saat ini; scoped fake/static verification lulus, tetapi bukan bukti migration remote, provider/paid smoke, deployment, atau real-browser runtime.

### Telefun Phase 5 production-hardening boundary

Phase 5 menambahkan additive distributed control-plane state untuk jalur OpenAI WebRTC:

- `telefun_realtime_leases` menjadi authority quota/concurrency lintas replica. Claim, renew, release, expiry cleanup, dan provider/user cap dijalankan melalui RPC atomic; binding in-memory hanya cache untuk routing provider. Kehilangan lease memicu provider hangup/finalisasi `network_lost`, lalu release bertoken tetap dicoba agar row terminal tidak menunggu orphan sweep.
- Renewal coordinator mengklasifikasikan kehilangan authority secara bounded sebagai `local_expiry`, `rpc_error`, `invalid_response`, closed RPC reason, atau `renewal_rejected`; raw exception/reason tidak diteruskan. Migration `20260811044655` mengualifikasi `lease.expires_at`, mengambil row lock, dan memisahkan `lease_not_found`/`owner_mismatch`/`inactive`/`expired`/`invalid_ttl`. Database production canonical sudah memuat dan memverifikasi function repair ini; candidate aplikasi dengan reason taxonomy baru masih memerlukan staging deploy.
- `telefun_realtime_rate_limits` memakai scope user/session/provider dan window atomic di database. Kegagalan RPC limiter bersifat fail-closed untuk jalur WebRTC.
- Orphan cleanup worker meng-claim lease stale setelah restart, menutup provider reference dan sideband secara bounded, lalu menulis outcome `orphaned`. Outcome lifecycle yang didukung adalah `completed`, `failed`, `network_lost`, dan `orphaned`.
- Recovery browser/network tidak melakukan silent recreate. Recreate yang disetujui harus menghasilkan attempt/session boundary baru dan `discontinuity` yang dapat direkonsiliasi; kegagalan network dikirim sebagai `network_lost`.
- Provider call ID disimpan sebagai encrypted opaque reference server-side. Browser hanya menerima session/attempt boundary dan pesan aman; OpenAI key, provider secret, sideband URL, canonical config, SDP diagnostics, dan raw provider error tidak pernah diteruskan ke browser/log.
- Metric names dibatasi untuk cost reconciliation, sideband disconnect, duplicate write, missing usage, orphan, dan session cap. UUID user diubah menjadi SHA-256 `user_id_hash` sebelum persistence; missing/unpriceable usage tetap audit state, bukan biaya sintetis.

Jalur OpenAI WebRTC tetap default-off dan belum mempunyai production application deployment. `GET /health` hanya membaca liveness dan readiness non-sensitive; ia tidak claim lease, consume quota, membuka provider, atau menulis billing/usage. Deployment mengharuskan exact HTTPS `ALLOWED_ORIGINS`, WSS untuk browser transport, fixed upstream OpenAI URL di server, bounded request body/timeout, preflight allowlist, dan CSP/Permissions Policy yang diselaraskan dengan deployment domain yang disetujui. Hosted production database sudah memuat migration Phase 5; pada 2026-08-10 canonical rollback/reapply dibuktikan atomically setelah stale WebRTC state direkonsiliasi. RLS/grant dan row preservation lulus, baseline Gemini tidak berubah, dan operasi database ini tidak mengaktifkan rollout atau memanggil provider.

### Telefun Phase 7 Full provider-free browser boundary

Phase 7 candidate menambahkan controller browser khusus untuk lifecycle output
OpenAI WebRTC. Controller membedakan response yang masih dibuat provider, output
buffer yang sedang dimainkan, dan elapsed media yang benar-benar maju. Server
tetap memiliki canonical session configuration (`server_vad` dengan
`interrupt_response=false`); browser tidak mengirim `session.update`.

Pada speech start, hanya response/item audible yang ditargetkan. Response yang
masih in progress menerima scoped `response.cancel`, output WebRTC di-clear, dan
assistant item di-truncate dengan elapsed played media. Event stale/duplicate dan
rapid repeats dideduplikasi; autoplay block, pause/stall/end, serta hold tidak
menambah elapsed. DataChannel browser tetap bukan persistence authority:
transcript/usage/finalization server-side tetap dimiliki sideband dan lifecycle
Phase 4–6.

Metrics server-VAD, hold, dan interruption ditutup pada finalization. Canonical
session mempertahankan `server_vad`, tetapi menetapkan `create_response=false`
dan `interrupt_response=false`: provider hanya memotong serta meng-commit audio,
sedangkan browser menjadi satu-satunya owner `response.create`. Speech start
menahan generation sampai event `input_audio_buffer.committed` dengan `item_id`
unik; commit itu kemudian meminta tepat satu response ber-marker internal bounded
di `response.metadata`.

Time cue tetap membuat system control item lebih dahulu. Jika cue berimpit dengan
turn VAD, response aktif, atau create yang belum diakui, event create lengkap
ditunda dan pending terakhir dicoalesce sambil mempertahankan `event_id`. Commit
VAD melepas barrier input dan memakai pending cue yang sama, sehingga satu
response melihat seluruh item conversation yang sudah committed. Semua
`response.created` ber-ID tetap dianggap aktif oleh interruption controller;
metadata absent/null, shape lain, atau marker mismatch adalah origin unknown dan
tidak pernah mengaku sebagai create Telefun. Hanya marker exact diikuti terminal
response yang sama yang melepaskan acknowledgement create. Shutdown membuang
seluruh pending/barrier secara sinkron. Kontrak single-owner ini menghilangkan
dual authority yang menghasilkan `conversation_already_has_active_response` pada
dua acceptance production sebelumnya. Recording memilih variant MediaRecorder
yang didukung dan mempertahankan MIME output aktual.

Repair single-owner baru memiliki bukti unit/fake-browser provider-free; live
production PASS setelah repair belum diklaim. Physical browser/device lintas
browser, Mini, dan keputusan deprecation OpenAI WebSocket tetap di luar evidence
candidate ini. Gemini dan legacy OpenAI WebSocket tidak diubah.

## Directory Structure

Struktur folder monorepo:

```text
├── apps/
│   ├── web/                    # Frontend Vite + React + TanStack Router
│   │   ├── src/
│   │   │   ├── routes/         # Page components per module (37 routes, all React.lazy())
│   │   │   ├── components/     # Shared UI components (Layout, Sidebar, dll)
│   │   │   ├── hooks/          # Custom React hooks
│   │   │   ├── lib/            # Utilities, API client (Hono RPC), config
│   │   │   └── router.tsx      # Centralized TanStack Router v1 route definitions
│   │   ├── index.html          # Entry point dengan resource hints
│   │   └── vite.config.ts      # Vite config dengan code splitting
│   ├── api/                    # Backend Hono API server
│   │   ├── src/
│   │   │   ├── routes/         # Hono route handlers — decomposed per module:
│   │   │   │   ├── sidak.ts    #   barrel (import + route registration 5 sub-modules)
│   │   │   │   ├── sidak/      #   sub-modules: core, dashboard, temuan, rule-versions, reports
│   │   │   │   ├── telefun.ts  #   barrel (import + route registration 4 sub-modules)
│   │   │   │   ├── telefun/    #   sub-modules: sessions, recordings, settings, annotations
│   │   │   │   ├── ketik.ts    #   KETIK endpoints
│   │   │   │   ├── pdkt.ts     #   barrel (re-export from ./pdkt/index)
│   │   │   │   ├── pdkt/       #   sub-modules: index, simulation, mailbox, history, settings, route-utils
│   │   │   │   ├── ai.ts       #   AI monitoring endpoints
│   │   │   │   ├── profiler.ts #   Profiler endpoints
│   │   │   │   └── admin.ts    #   Admin endpoints
│   │   │   ├── services/       # Business logic — decomposed per module:
│   │   │   │   ├── sidak-service.ts   # barrel (14+ sub-modules: shared-constants, access-scope,
│   │   │   │   │                   #   period-indicator, temuan-service, agent-directory,
│   │   │   │   │                   #   rule-versions, service-trends, dashboard-*, report-*,
│   │   │   │   │                   #   dashboard-forecast)
│   │   │   │   ├── sidak/            #   SIDAK sub-modules
│   │   │   │   ├── sidak-ranking-service.ts  #   Ranking extraction
│   │   │   │   ├── ketik-service.ts
│   │   │   │   ├── pdkt-service.ts  #   barrel (re-export 5 sub-modules + ai-json)
│   │   │   │   ├── pdkt/            #   PDKT sub-modules: catalog, session, evaluation,
│   │   │   │   │                   #   mailbox, shared-utils, image-generation, mailbox-session
│   │   │   │   ├── profiler-service.ts
│   │   │   │   ├── admin-service.ts
│   │   │   │   ├── monitoring-history-service.ts
│   │   │   │   └── activity-log-service.ts
│   │   │   ├── lib/            # AI models, scoring, usage logging, Supabase clients,
│   │   │   │                   #   math-utils, telefun-communication-profile, report builders
│   │   │   ├── middleware/      # auth, role, rate-limit middleware
│   │   │   └── index.ts        # Hono app entry point + AppType export
│   │   └── vitest.config.ts    # API test config
│   └── telefun/                # WebSocket proxy server untuk Gemini Live + additive OpenAI POC + shared OpenAI observer/tool coordination
│       ├── src/                # Server, auth, usage, env handling
│       └── src/realtime-webrtc/ # Additive broker + durable attempt/transcript/sideband lifecycle modules
├── packages/
│   └── types/                  # Shared Zod schemas & TypeScript interfaces
│       └── src/                # 8 domain files + barrel index.ts (common, sidak, ketik, pdkt, telefun, ai, profiler, admin)
├── reference-repo/             # Sumber referensi logic dari codebase lama (Next.js)
│   ├── app/                    # Next.js App Router (referensi saja)
│   └── docs/                   # Dokumentasi legacy (referensi)
├── supabase/
│   └── migrations/             # DB schemas (000 profiles, 001 SIDAK, 002 KETIK/PDKT/AI, 003 Telefun, 004 Admin, 005 carbon copy, 006 user settings, 007 report archives, 008 profile admin policies, 009 storage RLS, 010 activity_logs index)
├── docs/                       # Dokumentasi teknis sistem
│   ├── rebuild-logs/           # Per-phase completion logs (phase-1 onward, including current profiler fixes)
│   └── superpowers/            # Plans dan specs dari superpowers skills
├── opencode.json               # Project-level opencode config dengan context7 MCP
├── AGENTS.md                   # Panduan development untuk AI agents
└── package.json                # Root package.json (pnpm workspace + Turborepo)
```

## Data Flow Pattern

Proyek ini mengutamakan pola **Centralized Service Layer** di backend:

- Logic database tidak diletakkan langsung di dalam komponen UI frontend.
- Semua query kompleks berada di `apps/api/src/services/` (contoh: `sidak-service.ts` — barrel dari 13 sub-modules, `profiler-service.ts`).
- Route handlers didekomposisi per modul: sub-modul di `apps/api/src/routes/sidak/` (5 file), `apps/api/src/routes/telefun/` (4 file), dan `apps/api/src/routes/pdkt/` (6 file), dengan barrel file `sidak.ts`/`telefun.ts`/`pdkt.ts` sebagai entry point.
- Frontend mengonsumsi API via Hono RPC client (`hc<AppType>`) untuk full type-safety.
- Hybrid Client Pattern untuk Supabase:
  - Default: Gunakan User JWT untuk menghormati RLS.
  - Admin Client (Service Role): Hanya di backend untuk AI logging, background jobs, dan heavy reports.
- Monitoring lintas akun dan usage billing menggunakan server-side access via admin client, bukan direct browser read terhadap tabel sensitif.
- History simulasi KETIK/PDKT menggunakan tabel modul masing-masing sebagai sumber utama.
- Module settings (KETIK, PDKT, Telefun) disimpan namespaced di `user_settings.settings.<module>` agar tidak saling timpa. Setiap modul wajib membaca existing settings sebelum menulis.
- **SIDAK Dashboard Performance**: Endpoint dashboard utama menghitung ringkasan secara real-time dari data temuan mentah via scoring engine aplikasi. Materialized view (`mv_qa_period_summary`) dan tabel cache/summary (`qa_dashboard_period_summary`) dipelihara terpisah untuk kompatibilitas database, workflows backfill, dan offline analytics, namun tidak digunakan pada read-path dashboard utama.
- **SIDAK Dashboard Forecast**: Prediksi dashboard menggunakan batch forecast persistence dengan SHA-256 fingerprinting. 3-state lifecycle (`missing`/`fresh`/`stale`) dengan visual attention effects. Angka menggunakan regresi linear deterministik, narasi menggunakan Gemini 3.1 Flash Lite. Snapshot disimpan di tabel `sidak_dashboard_forecast_snapshots` dengan akses terbatas ke `service_role` saja. `cacheOnly` lookup di mount page — Gemini hanya dipanggil saat user klik "Perbarui Prediksi".
- **Soft-delete Exclusion**: Semua query SIDAK (dashboard, agents, data reports) otomatis mengecualikan peserta yang terhubung ke profile soft-deleted/inactive, dengan opsi `show_archived=true` untuk override.

## AI Integration Pattern

- Integrasi AI dipusatkan di backend service wrapper (`apps/api/src/lib/gemini.ts`, `apps/api/src/lib/openai.ts`).
- Pemilihan model dan provider mengikuti canonical mapping di `apps/api/src/lib/ai-models.ts`. Newly added text model IDs: `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gpt-5.6-luna`, `gpt-5.4-mini`; existing direct Gemini choices remain supported. Telefun's realtime registry remains separate. Legacy OpenRouter/DeepSeek selections dinormalisasi ke model direct yang setara.
- Semua AI calls wajib dicatat (logged) dari backend ke tabel `ai_usage_logs` via `logAiUsage()`.
- `logAiUsage()` sekarang menerima parameter `status` (`'success'` | `'failed'` | `'timeout'`) dan `errorMessage`. Jika gagal/timeout, token di-set ke 0 dan error message dicatat.
- `resolveModelProvider()` mencari provider via `MODEL_REGISTRY` lookup. Provider aktif hanya `gemini` dan `openai`.
- OpenAI direct memakai Responses API wrapper (`POST /v1/responses`) dengan `instructions`, `input`, `text.format`, dan usage token counters.
- Gemini tetap memakai retry/fallback jika `developer instruction not enabled`.
- KETIK review mencoba Gemini terlebih dahulu, lalu fallback langsung ke OpenAI bila Gemini gagal atau key tidak tersedia.
- PDKT image generation hanya memakai jalur Gemini-native; tidak ada fallback OpenRouter/DeepSeek untuk lampiran gambar.
- KETIK memisahkan prompt policy dari orkestrasi provider: `prompt-policy.ts` menyerialisasi scenario/history sebagai escaped JSON data blocks, sedangkan `review-policy.ts` mendefinisikan prompt dan normalisasi lima dimensi review. Field konfigurasi atau chat tidak boleh diinterpolasi sebagai instruksi mentah.
- KETIK review baru menggunakan lima dimensi (`empathy`, `probing`, `resolution`, `typo`, `compliance`). `resolution_score` nullable menjaga backward compatibility; consumer wajib memperlakukan nilai null/absen sebagai review lama, bukan skor 0.
- Caller modul tidak boleh mengasumsikan bentuk response SDK/provider selalu stabil; ekstraksi `text` harus defensif.
- Usage AI dicatat server-side setelah request final (sukses maupun gagal). Setiap `request_id` unik — retry/fallback internal tidak menghasilkan row tambahan. Response tanpa metadata token tidak boleh menghasilkan usage log palsu.

## Environment & Runtime

### Frontend (`apps/web`) — prefix `VITE_`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_TELEFUN_WS_URL`

### Backend (`apps/api`) — variabel langsung:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `GEMINI_API_KEY`
- `OPENAI_API_KEY` (wajib untuk text generation direct via Responses API)

### Telefun Server (`apps/telefun`) — variabel langsung:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `OPENAI_API_KEY` (khusus Telefun Realtime; diset terpisah dari API service)
- `TELEFUN_OPENAI_ENABLED` (opsional — feature flag untuk mengaktifkan model GPT Realtime)
- `TELEFUN_OPENAI_WEBRTC_POC_ENABLED` (default `false`; Phase 3 capability-gated integration and Phase 4 durable lifecycle remain off for new starts; POST kill switch)
- `TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS` (CSV UUID exact, sama di API dan Telefun; development/staging only; kosong = deny-all; cleanup DELETE exception)
- `TELEFUN_OPENAI_WEBRTC_PROVIDER_TIMEOUT_MS` (default `15000`; upstream provider timeout and manager hangup bound)
- `TELEFUN_OPENAI_WEBRTC_SIDEBAND_TIMEOUT_MS` (default `10000`; sideband connect timeout; finalization drain uses bounded manager default)
- `TELEFUN_OPENAI_WEBRTC_ORPHAN_KEY` (server-only encryption key; wajib jika POC aktif; tidak pernah dibundle ke Web)
- `TELEFUN_OPENAI_WEBRTC_LEASE_TTL_MS`, `TELEFUN_OPENAI_WEBRTC_LEASE_HEARTBEAT_MS` (distributed lease expiry/renewal bounds)
- `TELEFUN_OPENAI_WEBRTC_MAX_USER_SESSIONS`, `TELEFUN_OPENAI_WEBRTC_MAX_PROVIDER_SESSIONS` (atomic per-user/provider caps)
- `TELEFUN_OPENAI_WEBRTC_RATE_LIMIT_PER_MINUTE` (distributed WebRTC session/write limit)
- `TELEFUN_OPENAI_WEBRTC_ORPHAN_CLEANUP_INTERVAL_MS` (bounded stale-lease cleanup interval)
- `ALLOWED_ORIGINS` (exact HTTPS allowlist in production; wildcard tidak diterima oleh broker POC; required for WebRTC endpoint)

### MCP / Tools:

- `CONTEXT7_API_KEY` — disimpan di `.env.local` untuk context7 MCP server.

File `.env` dan `.env.local` di root diabaikan oleh git, tapi isinya harus disinkronkan ke masing-masing apps jika diperlukan.

## Commands & Verification

```bash
# Install dependencies
pnpm install

# Development (menjalankan web, api, dan telefun secara paralel)
pnpm dev

# Build production
pnpm build

# Lint seluruh workspace
pnpm lint

# Test seluruh workspace (1056+ API + 500+ web tests)
pnpm test

# Test API only
pnpm --filter @trainers/api test

# Test Web only
pnpm --filter @trainers/web test

# Format code
pnpm format

# Telefun standalone
pnpm --filter @trainers/telefun dev
```

Catatan:

- Build tidak menerapkan migration Supabase. SQL di `supabase/migrations/` tetap harus dipush atau dieksekusi ke target Supabase.
- Artifact backup berada di `local-backups/` dan tidak boleh masuk git.

## Security Model

Keamanan aplikasi dijaga di beberapa sisi:

1. **Frontend Route Guards**: TanStack Router dengan lazy loading dan auth checks di komponen Layout.
2. **Backend Middleware**: Hono middleware chain — `authMiddleware` (JWT validation, global via app.ts) + `requireRole()` (per-route) applied to 48+ endpoints across Profiler, PDKT, AI monitoring, KETIK, SIDAK, and Admin. Duplicate authMiddleware removed from all 7 sub-routers.
3. **Database RLS**: Filter data di tingkat PostgreSQL sehingga user hanya bisa melihat/mengubah data sesuai hak akses mereka. Semua 32 tabel RLS-enabled. Policy gaps closed: write_trainer for dashboard summary tables, admin profiles policies (migration 008).
4. **Admin Server Boundary**: Service role hanya dipakai di backend (Hono) untuk operasi yang membutuhkan akses lintas akun.
5. **Hono RPC Type Safety**: `hc<AppType>` memastikan frontend tidak bisa mengirim payload yang tidak sesuai dengan validasi Zod di backend.

## Performance Guardrails (FCP/LCP)

- Code splitting & lazy loading sudah diterapkan — semua 37 route di `router.tsx` menggunakan `React.lazy()`.
- Library berat (Recharts >300 kB, ExcelJS/xlsx >400 kB) di-import secara dinamis di komponen yang membutuhkan.
- Resource hints (`modulepreload`, `preconnect`, `dns-prefetch`) ditambahkan di `index.html`.
- Chunk >200 kB yang bukan vendor stabil dipertimbangkan untuk split lanjutan via `manualChunks`.
- Jangan tambah library baru tanpa cek bundle impact-nya.

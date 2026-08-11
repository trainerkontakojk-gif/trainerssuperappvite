# Deployment Guide

## Architecture Overview

```
                    ┌──────────────────┐
                    │   Supabase        │
                    │  (DB + Auth)      │
                    └────────┬─────────┘
                             │
           ┌──────────────────┼──────────────────┐
           │                  │                  │
    ┌──────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐
    │  apps/web   │   │  apps/api   │   │ apps/telefun │
    │  Vite SPA   │──▶│  Hono HTTP  │   │ WS Server    │
    │  (Vercel)   │   │  (Railway)  │   │ (Railway)    │
    │ canonical   │   │             │   │              │
    └─────────────┘   └─────────────┘   └─────────────┘
```

**Canonical production ownership:** Web (`apps/web`) di Vercel; API dan Telefun di Railway.
Railway Web dapat menjadi target staging normal. Hanya Railway Web PRODUCTION
yang bersifat noncanonical/auxiliary dan bukan authority untuk status production
Web; Vercel adalah Web PRODUCTION kanonik.

## Service Overview

| Service        | Port    | Stack                  | Deploy Target (Primary) | Deploy Target (Alt)                             |
| -------------- | ------- | ---------------------- | ----------------------- | ----------------------------------------------- |
| `apps/web`     | n/a     | Vite static SPA        | **Vercel**              | Railway staging; Railway PRODUCTION (auxiliary) |
| `apps/api`     | `$PORT` | Hono (Node.js HTTP)    | Railway                 | —                                               |
| `apps/telefun` | `$PORT` | WebSocket (persistent) | Railway                 | —                                               |

## Prerequisites

- Node.js >= 22
- pnpm >= 9
- Supabase project (with all migrations applied)

## Railway Service Settings (per service)

API dan Telefun dideploy sebagai service Railway kanonik. Web staging Railway
adalah target normal; catatan auxiliary di bawah hanya berlaku untuk Railway Web
PRODUCTION. **Jangan gunakan `pnpm start` default root untuk production** — script
root sekarang mengunci ke web saja.

| Setting          | Web                  | API                  | Telefun                  |
| ---------------- | -------------------- | -------------------- | ------------------------ |
| Root Directory   | repo root            | repo root            | repo root                |
| Build Command    | `pnpm run build:web` | `pnpm run build:api` | `pnpm run build:telefun` |
| Start Command    | `pnpm run start:web` | `pnpm run start:api` | `pnpm run start:telefun` |
| Healthcheck Path | `/`                  | `/api/health`        | `/health`                |

## Railway Environment Variables

### Web Service

**Wajib di-set SEBELUM build** karena Vite embed `VITE_*` di compile time (`import.meta.env.VITE_*` diganti string literal).

| Variable                 | Value                                     | Notes                                                       |
| ------------------------ | ----------------------------------------- | ----------------------------------------------------------- |
| `VITE_SUPABASE_URL`      | `https://<project>.supabase.co`           | Supabase project URL                                        |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...`                                  | Supabase anon key                                           |
| `VITE_API_URL`           | `https://<api-url>.up.railway.app/api/v1` | **Harus suffix `/api/v1`** — lihat catatan penting di bawah |
| `VITE_TELEFUN_WS_URL`    | `wss://<telefun-url>.up.railway.app`      | WebSocket secure untuk production                           |

### API Service

| Variable                                      | Value                               | Notes                                                                                    |
| --------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------- |
| `PORT`                                        | `$PORT`                             | Railway auto-inject                                                                      |
| `NODE_ENV`                                    | `production`                        | **Wajib** — tanpa ini, CORS fallback ke `localhost:3000` dan `ALLOWED_ORIGINS` diabaikan |
| `VITE_SUPABASE_URL`                           | `https://<project>.supabase.co`     | Supabase project URL                                                                     |
| `SUPABASE_SERVICE_ROLE_KEY`                   | `eyJ...`                            | Service role key                                                                         |
| `GEMINI_API_KEY`                              | `AI...`                             | Google Gemini API key                                                                    |
| `OPENAI_API_KEY`                              | `sk-...`                            | OpenAI API key untuk text generation direct via Responses API                            |
| `TELEFUN_INTERNAL_URL`                        | `http://<telefun-private-url>:3002` | Origin privat Telefun untuk assessment OpenAI; hanya di API                              |
| `TELEFUN_INTERNAL_TOKEN`                      | `<random>`                          | Shared server-only secret; nilai sama dengan Telefun                                     |
| `ALLOWED_ORIGINS`                             | `https://<web-url>.up.railway.app`  | Wajib — tanpa ini, CORS origin array kosong → semua request diblokir                     |
| `TELEFUN_OPENAI_WEBRTC_POC_ENABLED`           | `false`                             | Kill switch API untuk POST WebRTC; default deny                                          |
| `TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS`      | `UUID,UUID`                         | Exact UUID CSV cohort; harus sama persis dengan Telefun, development/staging saja        |
| `TELEFUN_OPENAI_WEBRTC_RATE_LIMIT_PER_MINUTE` | `10`                                | Distributed session/write limit; RPC failure fail-closed untuk WebRTC                    |

### Telefun Service

`OPENAI_API_KEY` dipakai per service: API service untuk text generation direct, Telefun service untuk realtime jika `TELEFUN_OPENAI_ENABLED=true`. Pastikan secret-nya terpisah antar service. Default flag Telefun tetap `false`, sehingga rollout awal tetap Gemini-only.

| Variable                                           | Value                           | Notes                                                                                                                         |
| -------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                                             | `$PORT`                         | Railway auto-inject                                                                                                           |
| `NODE_ENV`                                         | `production`                    |                                                                                                                               |
| `SUPABASE_URL`                                     | `https://<project>.supabase.co` | Supabase project URL                                                                                                          |
| `SUPABASE_ANON_KEY`                                | `eyJ...`                        | Supabase anon key                                                                                                             |
| `SUPABASE_SERVICE_ROLE_KEY`                        | `eyJ...`                        | Service role key                                                                                                              |
| `GEMINI_API_KEY`                                   | `AI...`                         | Google Gemini API key                                                                                                         |
| `OPENAI_API_KEY`                                   | `sk-...`                        | Realtime-only; set terpisah dari API service bila `TELEFUN_OPENAI_ENABLED=true` atau `TELEFUN_OPENAI_WEBRTC_POC_ENABLED=true` |
| `TELEFUN_OPENAI_ENABLED`                           | `false`                         | Kill switch; default/off mempertahankan Gemini-only                                                                           |
| `TELEFUN_OPENAI_WEBRTC_POC_ENABLED`                | `false`                         | Phase 1 broker/harness; tetap off sampai approval gate terpisah                                                               |
| `TELEFUN_OPENAI_WEBRTC_PROVIDER_TIMEOUT_MS`        | `15000`                         | Timeout upstream `POST /v1/realtime/calls`                                                                                    |
| `TELEFUN_OPENAI_WEBRTC_SIDEBAND_TIMEOUT_MS`        | `10000`                         | Timeout sideband `wss://api.openai.com/v1/realtime?call_id=...`                                                               |
| `TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS`           | `UUID,UUID`                     | Exact UUID CSV; harus sama persis dengan API, development/staging saja, kosong = deny-all                                     |
| `TELEFUN_INTERNAL_TOKEN`                           | `<random>`                      | Shared server-only secret (API + Telefun); bukan `VITE_`, bukan di Vercel/Web                                                 |
| `TELEFUN_OPENAI_WEBRTC_ORPHAN_KEY`                 | `<random min 32 chars>`         | Server-only AES key untuk opaque provider reference; wajib saat POC aktif                                                     |
| `TELEFUN_OPENAI_WEBRTC_LEASE_TTL_MS`               | `30000`                         | Distributed lease TTL; bounded expiry-safe session cap                                                                        |
| `TELEFUN_OPENAI_WEBRTC_LEASE_HEARTBEAT_MS`         | `10000`                         | Lease renewal heartbeat; harus lebih kecil dari TTL                                                                           |
| `TELEFUN_OPENAI_WEBRTC_MAX_USER_SESSIONS`          | `1`                             | Atomic active session cap per user                                                                                            |
| `TELEFUN_OPENAI_WEBRTC_MAX_PROVIDER_SESSIONS`      | `100`                           | Atomic active session cap per provider                                                                                        |
| `TELEFUN_OPENAI_WEBRTC_RATE_LIMIT_PER_MINUTE`      | `10`                            | Distributed per-user/session/provider request window                                                                          |
| `TELEFUN_OPENAI_WEBRTC_ORPHAN_CLEANUP_INTERVAL_MS` | `30000`                         | Bounded stale lease cleanup interval                                                                                          |
| `ALLOWED_ORIGINS`                                  | exact HTTPS allowlist           | Exact origin list; wildcard dan HTTP selalu ditolak di production/broker POC                                                  |

Aturan secret/config:

- `OPENAI_API_KEY` wajib ada di API service untuk text generation direct. Jika Telefun OpenAI diaktifkan, set `OPENAI_API_KEY` terpisah di service Telefun; jangan share secret antar service. `OPENAI_API_KEY` tidak boleh memakai prefix `VITE_` dan tidak boleh berada di Vercel.
- `TELEFUN_INTERNAL_URL` **hanya** di service API; mengarah ke private URL Railway service Telefun (bukan public Web). `TELEFUN_INTERNAL_TOKEN` adalah shared server-only secret yang nilainya SAMA persis di API dan Telefun; token ini tidak boleh berawalan `VITE_` dan tidak boleh di-deploy ke Vercel/Web.
- `TELEFUN_OPENAI_ENABLED=false` menolak **sesi OpenAI baru** tanpa menghapus history/model pricing. Panggilan aktif tidak dipindahkan ke Gemini di tengah sesi.
- `TELEFUN_OPENAI_WEBRTC_POC_ENABLED=false` atau cohort kosong menolak POST WebRTC dan tidak membuka provider. Authenticated, owner-bound DELETE cleanup tetap diizinkan untuk menandai pre-created session sebagai failed; DELETE exception ini bukan jalur start.
- `TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS` harus berupa CSV UUID yang valid dan nilainya sama di API serta Telefun. Runtime rollout hanya development/staging; production default deny-all. Automated checks memakai fake upstream; tidak ada paid/provider smoke dalam routine deployment.
- Jika flag `true` tetapi key tidak ada/invalid, readiness OpenAI harus `not_ready` dan configure OpenAI ditolak dengan error aman. Service tetap dapat hidup untuk Gemini bila konfigurasi Gemini valid.
- Mengubah Railway env memerlukan redeploy/restart service Telefun; jangan menganggap flag berubah in-process sebelum runtime mendukung reload.

### Phase 5 WebRTC hardening dan recovery

- `TELEFUN_OPENAI_WEBRTC_ORPHAN_KEY`, `OPENAI_API_KEY`, `TELEFUN_INTERNAL_TOKEN`, dan Supabase service-role key hanya berada di API/Telefun server. Orphan key wajib minimal 32 karakter. Jangan menambahkan variabel tersebut sebagai `VITE_*` atau ke Vercel Web.
- Lease, rate limit, orphan claim, metric write, dan finalization memakai migration/RPC additive Phase 5. Jangan mengganti RPC dengan `Map` lokal atau menganggap binding satu replica sebagai quota authority.
- Production `ALLOWED_ORIGINS` harus berupa daftar origin HTTPS exact yang benar-benar dipakai Web; tidak boleh `*`, wildcard host, atau URL dengan credential. Browser memakai HTTPS/WSS. CSP dan Permissions Policy di `apps/web/public/serve.json` serta `vercel.json` harus tetap sinkron dengan deployment classes yang disetujui.
- Broker hanya menghubungi fixed upstream OpenAI server-side, menerima preflight terbatas, membatasi SDP/body dan timeout, serta tidak meneruskan provider error/URL/secret ke browser. Healthcheck tidak membuka upstream dan tidak menulis usage/cost.
- Sideband/provider orphan setelah restart di-claim worker dengan outcome `orphaned`. Lease loss saat process masih hidup memicu provider hangup dan finalisasi `network_lost`; release bertoken tetap dicoba setelah cleanup. Network failure di browser juga dikirim sebagai `network_lost`; recreate tidak boleh silent dan harus memakai attempt/session boundary baru plus discontinuity record.
- Metrics bounded untuk cost reconciliation, sideband disconnect, duplicate write, missing usage, orphan, dan session cap. User disimpan sebagai SHA-256 `user_id_hash`, bukan UUID mentah. Missing atau unpriceable usage tetap audit state dan perlu alert/reconciliation, bukan biaya nol sintetis.

Migration Phase 5 wajib dijalankan additive di staging lebih dahulu dan rollback drill harus dilakukan pada database disposable. Run repository ini hanya membuktikan kontrak fake/unit/static; tidak mengklaim Railway restart, hosted schema, atau paid-provider smoke.

### Catatan FFmpeg (Telefun Recording Remux)

**FFmpeg wajib tersedia di container deployment Railway** untuk meremux recording audio Telefun agar seekable (play/pause/seek). Set env var berikut di **Telefun service** Railway:

| Variable                       | Value    | Notes                                                          |
| ------------------------------ | -------- | -------------------------------------------------------------- |
| `RAILPACK_DEPLOY_APT_PACKAGES` | `ffmpeg` | Menginstal FFmpeg di container build-time via Nixpacks apt-get |

Setelah remux berhasil, player menggunakan signed URL persisten; jika gagal, blob URL asli digunakan sebagai fallback. Lihat `docs/telefun.md` untuk detail implementasi remux.

### Catatan Penting: VITE_API_URL

**VITE_API_URL harus suffix `/api/v1`**, bukan hanya domain API. Alasan:

- API routes di-prefix `basePath("/api")` + route `/v1/sidak/...`
- Frontend menggunakan pattern: `fetch(ApiBase + "/sidak/dashboard/...")` = `VITE_API_URL + "/sidak/dashboard/..."`
- Jika `VITE_API_URL = https://api.up.railway.app` saja → request ke `https://api.up.railway.app/sidak/...` → **404** (tanpa prefix `/api/v1`)
- Jika `VITE_API_URL = https://api.up.railway.app/api/v1` → request ke `https://api.up.railway.app/api/v1/sidak/...` → **OK**

## Root Package Scripts

| Script          | Command                                           | Purpose                          |
| --------------- | ------------------------------------------------- | -------------------------------- |
| `start`         | `pnpm run start:web`                              | Default Railway start (web only) |
| `start:web`     | `pnpm --filter @trainers/web start`               | Web production via `serve`       |
| `build:web`     | `pnpm turbo run build --filter @trainers/web`     | Build web (TSC + Vite)           |
| `start:api`     | `pnpm --filter @trainers/api start`               | API production via `tsx`         |
| `build:api`     | `pnpm turbo run build --filter @trainers/api`     | Build API (TSC)                  |
| `start:telefun` | `pnpm --filter @trainers/telefun start`           | Telefun production via `node`    |
| `build:telefun` | `pnpm turbo run build --filter @trainers/telefun` | Build Telefun (TSC)              |
| `start:all`     | `turbo run start`                                 | Local multi-service (not deploy) |

## Healthcheck Smoke Test

```bash
node scripts/deployment/railway-web-healthcheck-smoke.mjs
```

Ekspektasi: `PASS: / returned HTTP 200 on PORT=9876`. Smoke ini juga memvalidasi security headers dasar dari static web server.

### Telefun liveness dan provider readiness

`GET /health` memisahkan:

- **Liveness:** proses/event loop HTTP hidup. Tidak membuka koneksi Gemini/OpenAI.
- **Readiness:** status konfigurasi non-sensitive per provider (enabled/disabled/configured) dan kemampuan menerima provider yang dipilih. Readiness tidak mengembalikan secret, suffix key, token, prompt, atau URL bercredential.

Endpoint ini tidak membuka upstream dan tidak membuktikan quota/model access vendor. `GET` dan preflight `OPTIONS` mengikuti `ALLOWED_ORIGINS`: wildcard mengembalikan `Access-Control-Allow-Origin: *`, sedangkan allowlist hanya merefleksikan origin ter-normalisasi yang diizinkan serta `Vary: Origin`. Credentials tidak diaktifkan. Web menurunkan URL health dari origin `VITE_TELEFUN_WS_URL`, menghapus path/query/hash/credential, dan menganggap timeout, network error, non-2xx, atau payload malformed sebagai OpenAI unavailable.

Routine Railway healthcheck, CI, dan smoke test **tidak boleh membuka sesi provider berbayar** dan tetap non-billable. Koneksi upstream hanya dibuka setelah WebSocket user terautentikasi dan `telefun_session_configure` tervalidasi; broker POC memakai exact `ALLOWED_ORIGINS`, bukan wildcard. Paid/manual provider smoke dijalankan terpisah dengan otorisasi eksplisit.

## Web Security Headers

- Railway Web (staging atau auxiliary PRODUCTION) memakai `apps/web/public/serve.json`. File ini disalin Vite ke `apps/web/dist/serve.json`, lalu dibaca oleh `serve dist` saat `pnpm run start:web`.
- Vercel Web memakai `headers` di root `vercel.json`.
- Header yang dijaga: `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Referrer-Policy`, dan `Permissions-Policy`.

### Telefun Production Smoke Test

```bash
WEB_URL=https://<canonical-vercel-domain> API_URL=https://<api-domain>.up.railway.app/api/v1 TELEFUN_WS_URL=wss://<telefun-domain>.up.railway.app node scripts/deployment/telefun-railway-smoke.mjs
```

Ekspektasi: `web, api, and telefun health return HTTP 200` and `All health checks passed!`.

### Telefun Production WebSocket Manual Smoke (Gemini baseline only)

1. Vercel Web production env before build:
   - `VITE_TELEFUN_WS_URL=wss://<telefun-service>.up.railway.app`
   - `VITE_API_URL=https://<api-service>.up.railway.app/api/v1`
2. Telefun service env:
   - `ALLOWED_ORIGINS=https://<canonical-vercel-domain>`
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`
   - Keep `TELEFUN_OPENAI_ENABLED=false` and `TELEFUN_OPENAI_WEBRTC_POC_ENABLED=false`; any OpenAI smoke needs a separate approval gate and isolated environment.
3. Redeploy Vercel Web after changing any `VITE_*` value.
4. Login, open `/telefun`, start call, allow mic, speak one sentence, wait for AI response, end call.
5. Verify no close code `4001` (Unauthorized/Token invalid), `4003` (Forbidden Origin), `1006` (Connection drop), or `1011` (Gemini API error) in browser UI.
6. Verify session appears in history and review opens.

Baseline manual smoke di atas tetap menguji Gemini. OpenAI WebRTC POC tidak diaktifkan di sini; jika ada gate terpisah, jalankan sebagai paid/manual smoke yang eksplisit dan terisolasi.

## Development (Local)

### Env Bootstrap (API)

API (`apps/api`) me-load `.env.local` dari **repo root** menggunakan path absolut yang diresolve dari lokasi modul (`import.meta.url`), bukan dari `process.cwd()`. Ini mencegah load dari lokasi yang salah (sebelumnya: `../../.env.local` yang dari cwd resolve ke `/Users/<user>/.env.local`).

```ts
// apps/api/src/lib/env.ts
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");
const envFile = path.join(repoRoot, ".env.local");
process.loadEnvFile(envFile);
```

Import order di `apps/api/src/index.ts`: `env` di-import SEBELUM `app`, sehingga Supabase client (`supabase.ts`) yang dibuat di top-level sudah dapat env yang sudah tervalidasi.

Supabase client (`apps/api/src/lib/supabase.ts`) menggunakan nilai dari modul `env`, **bukan** langsung dari `process.env` dengan fallback string kosong. Jika env hilang, API akan exit dengan kode 1 dan pesan error yang jelas.

### Root `.env.local`

```env
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# AI
GEMINI_API_KEY=your_gemini_key
OPENAI_API_KEY=your_api_openai_key

# Telefun
VITE_TELEFUN_WS_URL=ws://localhost:3002
# Set a separate OPENAI_API_KEY in the Telefun service if TELEFUN_OPENAI_ENABLED=true or TELEFUN_OPENAI_WEBRTC_POC_ENABLED=true
TELEFUN_OPENAI_ENABLED=false
TELEFUN_OPENAI_WEBRTC_POC_ENABLED=false
TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS=
TELEFUN_OPENAI_WEBRTC_PROVIDER_TIMEOUT_MS=15000
TELEFUN_OPENAI_WEBRTC_SIDEBAND_TIMEOUT_MS=10000
TELEFUN_OPENAI_WEBRTC_ORPHAN_KEY=
TELEFUN_OPENAI_WEBRTC_LEASE_TTL_MS=30000
TELEFUN_OPENAI_WEBRTC_LEASE_HEARTBEAT_MS=10000
TELEFUN_OPENAI_WEBRTC_MAX_USER_SESSIONS=1
TELEFUN_OPENAI_WEBRTC_MAX_PROVIDER_SESSIONS=100
TELEFUN_OPENAI_WEBRTC_RATE_LIMIT_PER_MINUTE=10
TELEFUN_OPENAI_WEBRTC_ORPHAN_CLEANUP_INTERVAL_MS=30000
TELEFUN_INTERNAL_TOKEN=replace_with_random_internal_token

# API
VITE_API_URL=http://localhost:3001/api/v1
TELEFUN_INTERNAL_URL=http://localhost:3002
PORT=3001

# MCP
CONTEXT7_API_KEY=your_context7_key
```

### Commands

```bash
pnpm install
pnpm dev          # Semua 3 service paralel
pnpm build        # Build semua
pnpm test         # Vitest
```

### Localhost Debug Checklist (KETIK AI Review)

Jika "Mulai Analisis" KETIK gagal di localhost dengan status `failed`:

```bash
# 1. Pastikan API membaca .env.local dari repo root
pnpm --filter @trainers/api dev
# Harus muncul: [API] Supabase client initialized for project <ref>

# 2. Cek health endpoint
curl http://localhost:3001/api/health
# Ekspektasi: {"status":"ok"}

# 3. Cek log API saat review dijalankan
# Ekspektasi log sequence:
# [KETIK Review] session=<id> status=<...> action=<claim|retry|...>
# [KETIK Review] session=<id> action=process result=<completed|failed> [error=...]

# 4. Jika error "AI response JSON tidak valid atau format tidak sesuai."
#  -> Provider mengembalikan format bukan plain JSON
#  -> Parser extractJsonObjectText() di ketik-service.ts handle fenced JSON
#  -> Cek raw aiResponse.text untuk diagnosis lebih lanjut

# 5. Jika error "AI tidak tersedia dari provider manapun."
#  -> Cek GEMINI_API_KEY dan OPENAI_API_KEY di service API
#  -> Verifikasi dengan curl ke endpoint AI provider

# 6. Jika review stuck "processing" lebih dari 5 menit
#  -> Polling akan auto-mark failed (lease timeout + 30s grace)
#  -> Klik "Jalankan Ulang Analisis" untuk retry
```

### Test Commands (KETIK Specific)

### Test Commands (KETIK Specific)

```bash
pnpm --filter @trainers/api test -- ketik                     # Semua KETIK tests (service + route + worker + parser)
pnpm --filter @trainers/api test -- ketik-review-route        # Route E2E (Hono app.request)
pnpm --filter @trainers/api test -- ketik-review-ai-parser    # JSON extraction helper
pnpm --filter @trainers/api test -- api-env-bootstrap         # Env load path + supabase client
pnpm --filter @trainers/web test -- ketik                     # KETIK landing page
```

## Supabase Migrations

```bash
supabase migration up
```

1. `000_profiles_core.sql` — profiles table + auto-create trigger
2. `001_sidak_core.sql` — SIDAK tables
3. `002_ketik_pdkt_core.sql` — KETIK/PDKT + AI usage logging + pricing
4. `003_telefun_core.sql` — Telefun history
5. `004_admin_core.sql` — Admin panel tables
6. `20260525000400_telefun_history_add_feedback.sql` — Add feedback column to telefun_history for API patch compatibility

## Troubleshooting

### Web Service OOM / Exit 137

Jika log Railway Web PRODUCTION auxiliary menampilkan `@trainers/web dev`, `> vite`, atau `Exit status 137`, service masih menjalankan start command development (`vite`). Periksa auxiliary service settings (tabel di atas) — override manual Start Command ke `pnpm run start:web`.

Repo memiliki guard (`scripts/deployment/guard-no-railway-dev.mjs`) yang memblokir `pnpm --filter @trainers/web dev` jika env Railway terdeteksi.

### CORS "Missing Allow Origin"

1. **Pastikan `NODE_ENV=production`** di-set di API Railway service. Tanpa ini, CORS cuma allow `localhost:3000`.
2. **Pastikan `ALLOWED_ORIGINS`** di-set di API Railway service (nilai utama: exact canonical Vercel Web URL; tambah auxiliary origin hanya bila dipakai).
3. **Redeploy API** setelah mengubah env vars.

### API Returns 404

Request dari browser menuju domain API tanpa prefix `/api/v1`. Pastikan `VITE_API_URL` pada Vercel Web kanonik (atau Railway Web staging / Railway Web PRODUCTION auxiliary) suffix-nya `/api/v1`. Contoh: `https://api-xxx.up.railway.app/api/v1`.

### Telefun WebSocket Tidak Connect

1. Cek URL WebSocket: `wss://<telefun-url>.up.railway.app` (bukan `ws://`).
2. Cek `ALLOWED_ORIGINS` di Telefun service mencakup Web URL.
3. Cek Telefun service status di Railway dashboard — harus Active.

## Vercel Deployment

Web (`apps/web`) dideploy ke Vercel sebagai static SPA kanonik untuk
PRODUCTION. API dan Telefun tetap service Railway; Vercel tidak menggantikan
kedua backend tersebut. Railway Web staging tetap didukung sebagai target
staging normal; hanya Railway Web PRODUCTION yang noncanonical/auxiliary.

### Deployment Policy

| Environment            | Purpose                | Auth / API / Telefun |
| ---------------------- | ---------------------- | -------------------- |
| Vercel production      | Canonical frontend     | Supported            |
| Railway Web staging    | Normal staging target  | Supported            |
| Railway Web PRODUCTION | Auxiliary/noncanonical | Supported            |
| Vercel preview         | Build + visual preview | **Not guaranteed**   |

Preview deployment hanya untuk visual/build smoke. Auth, API, dan Telefun tidak didukung di preview karena Railway origin check menggunakan exact string matching (tidak support wildcard Vercel preview URL).

### Vercel Configuration

Ringkasan `vercel.json` di root repository:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "pnpm -w run build:web",
  "outputDirectory": "apps/web/dist",
  "installCommand": "CI=true pnpm install",
  "framework": null,
  "headers": [
    {
      "source": "/(.*)",
      "headers": [{ "key": "...", "value": "..." }]
    }
  ],
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

- `framework: null` mencegah Vercel auto-detect framework lain yang bisa override build settings.
- `rewrites` diperlukan untuk SPA client-side routing (TanStack Router). Tanpa ini, refresh di `/sidak/dashboard` akan return 404.
- `headers` menjaga baseline browser hardening untuk Web static assets.

### OAuth Callback Route

Aplikasi memiliki route `/auth/callback` yang didaftarkan di TanStack Router untuk menangani redirect Google OAuth. Route ini memproses session, me-resolve profile, dan redirect ke `/dashboard` (active) atau `/waiting-approval` (pending/inactive). File terkait:

- `apps/web/src/routes/auth-callback.tsx` — komponen callback
- `apps/web/src/routes/auth-callback-contract.ts` — pure routing contract + error messages
- `apps/web/src/components/AuthModal.tsx` — redirect Google OAuth ke `/auth/callback`
- `apps/web/src/store/authInit.ts` — `/auth/callback` di daftar public routes (tidak di-redirect saat sign out)
- `apps/web/src/components/Layout.tsx` — `/auth/callback` di-render tanpa sidebar
- `apps/web/src/__tests__/auth-callback-contract.test.ts` — regression tests untuk routing contract

### Vercel Environment Variables

**Hanya `VITE_*` vars yang dibutuhkan.** API-only vars (`GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, dll) jangan diset di Vercel — cukup di Railway.

#### Production

| Variable                 | Value                                             | Notes                                 |
| ------------------------ | ------------------------------------------------- | ------------------------------------- |
| `VITE_SUPABASE_URL`      | `https://<project>.supabase.co`                   | Sama dengan Railway                   |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...`                                          | Sama dengan Railway                   |
| `VITE_API_URL`           | `https://<railway-api-url>.up.railway.app/api/v1` | **Harus suffix `/api/v1`**            |
| `VITE_TELEFUN_WS_URL`    | `wss://<railway-telefun-url>.up.railway.app`      | WSS, bukan WS                         |
| `VITE_APP_URL`           | `https://<canonical-vercel-domain>`               | Untuk OAuth redirect + reset password |

#### Preview (opsional)

Untuk build-only preview, set public backend variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`, `VITE_TELEFUN_WS_URL`) di Preview scope. `VITE_APP_URL` tetap production URL — OAuth/reset flows tetap kembali ke production. **Jangan claim authenticated preview support.**

### Vercel Build Settings

| Setting           | Value                                              |
| ----------------- | -------------------------------------------------- |
| Framework Preset  | Other (`framework: null` di `vercel.json`)         |
| Root Directory    | `./`                                               |
| Build Command     | `pnpm -w run build:web` (dari `vercel.json`)       |
| Output Directory  | `apps/web/dist` (dari `vercel.json`)               |
| Node.js Version   | **22.x** (set eksplisit — jangan andalkan default) |
| Production Branch | `main`                                             |

### Railway Origin Updates untuk Vercel

Saat Vercel production sudah siap, update Railway origin lists:

#### Railway API

```text
ALLOWED_ORIGINS=https://<railway-web>.up.railway.app,https://<canonical-vercel-domain>
NODE_ENV=production
```

`NODE_ENV=production` wajib — tanpa ini, CORS fallback ke `localhost:3000`.

#### Railway Telefun

```text
ALLOWED_ORIGINS=https://<railway-web>.up.railway.app,https://<canonical-vercel-domain>
```

Jangan gunakan `ALLOWED_ORIGINS=*`. Redeploy kedua service setelah update.

### Supabase Auth URLs untuk Vercel

Tambahkan exact production paths di Supabase Dashboard → Authentication → URL Configuration:

```text
Site URL:
https://<canonical-vercel-domain>

Additional Redirect URLs:
https://<railway-web>.up.railway.app/**  # only if auxiliary Web is retained
https://<canonical-vercel-domain>/
https://<canonical-vercel-domain>/auth/callback
https://<canonical-vercel-domain>/reset-password
```

### CORS Preflight Verification

Sebelum menganggap Vercel production siap, verifikasi CORS preflight dari Vercel domain:

```bash
curl -i -X OPTIONS \
  'https://<railway-api>.up.railway.app/api/v1/me' \
  -H 'Origin: https://<canonical-vercel-domain>' \
  -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: authorization,content-type'
```

Expected response headers:

```text
Access-Control-Allow-Origin: https://<canonical-vercel-domain>
Access-Control-Allow-Credentials: true
```

### turbo.json Env Passthrough

Untuk memastikan `VITE_*` vars tersedia saat build di Vercel, task `build` di `turbo.json` sudah mendeklarasikan `env`:

```json
{
  "tasks": {
    "build": {
      "env": [
        "VITE_SUPABASE_URL",
        "VITE_SUPABASE_ANON_KEY",
        "VITE_API_URL",
        "VITE_TELEFUN_WS_URL",
        "VITE_APP_URL"
      ]
    }
  }
}
```

Ini tidak memengaruhi Railway — jika vars tidak diset, turbo treat sebagai empty string tanpa error.

### Catatan

- `VITE_API_URL` di Vercel harus menunjuk ke Railway API, bukan Vercel. **Suffix `/api/v1` wajib.**
- Setiap ganti `VITE_*` di Vercel Dashboard, **wajib redeploy** (Vite inline nilai saat build time, tidak runtime).
- Hapus API-only vars (`GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`) dari Vercel env.
- Vercel adalah frontend production kanonik. Jika Railway API atau Telefun down, Vercel Web juga tidak berfungsi.
- Custom domain direkomendasikan untuk production yang stabil.

## Deployment Checklist

### Railway (Canonical API/Telefun; Normal Web STAGING; Auxiliary Web PRODUCTION)

- [ ] Apply all Supabase migrations
- [ ] Deploy API dan Telefun sebagai service Railway kanonik; Railway Web staging adalah target normal, sedangkan Railway Web PRODUCTION hanya bila auxiliary host memang diperlukan
- [ ] Set Railway custom build/start commands per service (lihat tabel Railway Service Settings)
- [ ] Set Railway env vars per service (lihat tabel Railway Environment Variables)
- [ ] Verifikasi koneksi: `VITE_API_URL` suffix `/api/v1`, `NODE_ENV=production`, `ALLOWED_ORIGINS` di-set
- [ ] Jika Railway Web PRODUCTION auxiliary dipertahankan, run `node scripts/deployment/railway-web-healthcheck-smoke.mjs`
- [ ] Jika Railway Web PRODUCTION auxiliary dipertahankan, pastikan header `serve dist` lulus
- [ ] Verify API health: `GET https://<api-url>.up.railway.app/api/health`
- [ ] Verify WebSocket: `wss://<telefun-url>.up.railway.app`
- [ ] Pastikan `TELEFUN_OPENAI_ENABLED=false` untuk rollout awal; jika diaktifkan, set `OPENAI_API_KEY` terpisah di Telefun service (API service tetap memerlukan key sendiri)
- [ ] Verify liveness/readiness tanpa membuka koneksi provider berbayar
- [ ] Set up monitoring / alerting

### Vercel (Canonical Web)

- [ ] Import repo ke Vercel, framework preset **Other** (`framework: null` di `vercel.json`)
- [ ] Set Node.js Version ke **22.x** eksplisit di Project Settings
- [ ] Set 5 `VITE_*` env vars di Vercel Dashboard Production scope
- [ ] Audit tidak ada secret server-side (`GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`)
- [ ] Verifikasi `VITE_API_URL` suffix `/api/v1`
- [ ] Deploy production dan verifikasi build log: Node 22.x, pnpm 11.x, `apps/web/dist` produced
- [ ] Verifikasi SPA deep link: `curl -I https://<vercel>/dashboard` → HTTP 200 (bukan 404)
- [ ] Verifikasi CORS preflight: `curl -X OPTIONS` ke Railway API dengan Origin Vercel → header CORS muncul
- [ ] Update Railway API `ALLOWED_ORIGINS` tambah Vercel production domain, redeploy
- [ ] Update Railway Telefun `ALLOWED_ORIGINS` tambah Vercel production domain, redeploy
- [ ] Update Supabase Redirect URLs tambah Vercel domain + `/auth/callback` + `/reset-password`
- [ ] Verifikasi password login dari Vercel → dashboard muncul, API call berfungsi
- [ ] Verifikasi Google OAuth dari Vercel → redirect ke `/auth/callback` → masuk ke `/dashboard`
- [ ] Verifikasi password reset dari Vercel → link kembali ke Vercel `/reset-password`
- [ ] Verifikasi WebSocket Telefun dari Vercel → tidak ada close code `4003`
- [ ] Jika Railway Web PRODUCTION auxiliary dipertahankan, verifikasi secara terpisah tanpa menganggapnya canonical

### Rollback Vercel

1. Roll back deployment/alias Vercel ke release Web terakhir yang diketahui baik; jangan memindahkan canonical host secara diam-diam.
2. Pertahankan exact Vercel production origin di Railway API/Telefun selama domain canonical tetap sama.
3. Jika incident owner secara eksplisit mengaktifkan Railway Web PRODUCTION auxiliary sebagai fallback sementara, verifikasi origin dan Supabase redirect exact sebelum traffic dialihkan.
4. Setelah Vercel canonical pulih, kembalikan routing sementara dan verifikasi auth, API, serta Telefun dari domain Vercel.

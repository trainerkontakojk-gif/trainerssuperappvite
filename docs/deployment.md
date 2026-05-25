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
   │  (Railway)  │   │  (Railway)  │   │ (Railway)    │
   └─────────────┘   └─────────────┘   └─────────────┘
```

Semua 3 service dideploy di Railway sebagai service terpisah dari monorepo yang sama.

## Service Overview

| Service        | Port      | Stack                   | Deploy Target |
| -------------- | --------- | ----------------------- | ------------- |
| `apps/web`     | `$PORT`   | Vite SPA → `serve dist` | Railway       |
| `apps/api`     | `$PORT`   | Hono (Node.js HTTP)     | Railway       |
| `apps/telefun` | `$PORT`   | WebSocket (persistent)  | Railway       |

## Prerequisites

- Node.js >= 22
- pnpm >= 9
- Supabase project (with all migrations applied)

## Railway Service Settings (per service)

Setiap service dideploy sebagai Railway service terpisah dengan konfigurasi build/start command eksplisit. **Jangan gunakan `pnpm start` default root untuk production** — script root sekarang mengunci ke web saja.

| Setting          | Web                     | API                      | Telefun                  |
| ---------------- | ----------------------- | ------------------------ | ------------------------ |
| Root Directory   | repo root               | repo root                | repo root                |
| Build Command    | `pnpm run build:web`    | `pnpm run build:api`     | `pnpm run build:telefun` |
| Start Command    | `pnpm run start:web`    | `pnpm run start:api`     | `pnpm run start:telefun` |
| Healthcheck Path | `/`                     | `/api/health`            | `/health`                |

## Railway Environment Variables

### Web Service

**Wajib di-set SEBELUM build** karena Vite embed `VITE_*` di compile time (`import.meta.env.VITE_*` diganti string literal).

| Variable | Value | Notes |
|----------|-------|-------|
| `VITE_SUPABASE_URL` | `https://<project>.supabase.co` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...` | Supabase anon key |
| `VITE_API_URL` | `https://<api-url>.up.railway.app/api/v1` | **Harus suffix `/api/v1`** — lihat catatan penting di bawah |
| `VITE_TELEFUN_WS_URL` | `wss://<telefun-url>.up.railway.app` | WebSocket secure untuk production |

### API Service

| Variable | Value | Notes |
|----------|-------|-------|
| `PORT` | `$PORT` | Railway auto-inject |
| `NODE_ENV` | `production` | **Wajib** — tanpa ini, CORS fallback ke `localhost:3000` dan `ALLOWED_ORIGINS` diabaikan |
| `VITE_SUPABASE_URL` | `https://<project>.supabase.co` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | Service role key |
| `GEMINI_API_KEY` | `AI...` | Google Gemini API key |
| `OPENROUTER_API_KEY` | `sk-or...` | OpenRouter API key |
| `ALLOWED_ORIGINS` | `https://<web-url>.up.railway.app` | Wajib — tanpa ini, CORS origin array kosong → semua request diblokir |

### Telefun Service

| Variable | Value | Notes |
|----------|-------|-------|
| `PORT` | `$PORT` | Railway auto-inject |
| `NODE_ENV` | `production` | |
| `SUPABASE_URL` | `https://<project>.supabase.co` | Supabase project URL |
| `SUPABASE_ANON_KEY` | `eyJ...` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | Service role key |
| `GEMINI_API_KEY` | `AI...` | Google Gemini API key |
| `ALLOWED_ORIGINS` | `https://<web-url>.up.railway.app` | Atau `*` untuk allow all |

### Catatan Penting: VITE_API_URL

**VITE_API_URL harus suffix `/api/v1`**, bukan hanya domain API. Alasan:

- API routes di-prefix `basePath("/api")` + route `/v1/sidak/...`
- Frontend menggunakan pattern: `fetch(ApiBase + "/sidak/dashboard/...")` = `VITE_API_URL + "/sidak/dashboard/..."`
- Jika `VITE_API_URL = https://api.up.railway.app` saja → request ke `https://api.up.railway.app/sidak/...` → **404** (tanpa prefix `/api/v1`)
- Jika `VITE_API_URL = https://api.up.railway.app/api/v1` → request ke `https://api.up.railway.app/api/v1/sidak/...` → **OK**

## Root Package Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `start` | `pnpm run start:web` | Default Railway start (web only) |
| `start:web` | `pnpm --filter @trainers/web start` | Web production via `serve` |
| `build:web` | `pnpm turbo run build --filter @trainers/web` | Build web (TSC + Vite) |
| `start:api` | `pnpm --filter @trainers/api start` | API production via `tsx` |
| `build:api` | `pnpm turbo run build --filter @trainers/api` | Build API (TSC) |
| `start:telefun` | `pnpm --filter @trainers/telefun start` | Telefun production via `node` |
| `build:telefun` | `pnpm turbo run build --filter @trainers/telefun` | Build Telefun (TSC) |
| `start:all` | `turbo run start` | Local multi-service (not deploy) |

## Healthcheck Smoke Test

```bash
node scripts/deployment/railway-web-healthcheck-smoke.mjs
```

Ekspektasi: `PASS: / returned HTTP 200 on PORT=9876`.

### Telefun Production Smoke Test

```bash
WEB_URL=https://<web-domain>.up.railway.app API_URL=https://<api-domain>.up.railway.app/api/v1 TELEFUN_WS_URL=wss://<telefun-domain>.up.railway.app node scripts/deployment/telefun-railway-smoke.mjs
```

Ekspektasi: `web, api, and telefun health return HTTP 200` and `All health checks passed!`.

### Telefun Production WebSocket Manual Smoke

1. Web service env before build:
   - `VITE_TELEFUN_WS_URL=wss://<telefun-service>.up.railway.app`
   - `VITE_API_URL=https://<api-service>.up.railway.app/api/v1`
2. Telefun service env:
   - `ALLOWED_ORIGINS=https://<web-service>.up.railway.app`
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`
3. Redeploy Web after changing any `VITE_*` value.
4. Login, open `/telefun`, start call, allow mic, speak one sentence, wait for AI response, end call.
5. Verify no close code `4001` (Unauthorized/Token invalid), `4003` (Forbidden Origin), `1006` (Connection drop), or `1011` (Gemini API error) in browser UI.
6. Verify session appears in history and review opens.

## Development (Local)

### Root `.env.local`

```env
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# AI
GEMINI_API_KEY=your_gemini_key
OPENROUTER_API_KEY=your_openrouter_key

# Telefun
VITE_TELEFUN_WS_URL=ws://localhost:3002

# API
VITE_API_URL=http://localhost:3001/api/v1
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

Jika log Railway menampilkan `@trainers/web dev`, `> vite`, atau `Exit status 137`, service masih menjalankan start command development (`vite`). Periksa Railway Web service settings (tabel di atas) — override manual Start Command ke `pnpm run start:web`.

Repo memiliki guard (`scripts/deployment/guard-no-railway-dev.mjs`) yang memblokir `pnpm --filter @trainers/web dev` jika env Railway terdeteksi.

### CORS "Missing Allow Origin"

1. **Pastikan `NODE_ENV=production`** di-set di API Railway service. Tanpa ini, CORS cuma allow `localhost:3000`.
2. **Pastikan `ALLOWED_ORIGINS`** di-set di API Railway service (nilai: URL Web service).
3. **Redeploy API** setelah mengubah env vars.

### API Returns 404

Request dari browser menuju domain API tanpa prefix `/api/v1`. Pastikan `VITE_API_URL` di Web Railway service suffix-nya `/api/v1`. Contoh: `https://api-xxx.up.railway.app/api/v1`.

### Telefun WebSocket Tidak Connect

1. Cek URL WebSocket: `wss://<telefun-url>.up.railway.app` (bukan `ws://`).
2. Cek `ALLOWED_ORIGINS` di Telefun service mencakup Web URL.
3. Cek Telefun service status di Railway dashboard — harus Active.

## Deployment Checklist

- [ ] Apply all Supabase migrations
- [ ] Deploy 3 Railway service dari repo yang sama (Web, API, Telefun)
- [ ] Set Railway custom build/start commands per service (lihat tabel Railway Service Settings)
- [ ] Set Railway env vars per service (lihat tabel Railway Environment Variables)
- [ ] Verifikasi koneksi: `VITE_API_URL` suffix `/api/v1`, `NODE_ENV=production`, `ALLOWED_ORIGINS` di-set
- [ ] Run smoke test: `node scripts/deployment/railway-web-healthcheck-smoke.mjs`
- [ ] Verify API health: `GET https://<api-url>.up.railway.app/api/health`
- [ ] Verify WebSocket: `wss://<telefun-url>.up.railway.app`
- [ ] Set up monitoring / alerting

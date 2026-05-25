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
   │ (Vercel/CF) │   │ (Railway)   │   │ (Railway)    │
   └─────────────┘   └─────────────┘   └─────────────┘
```

## Service Overview

| Service        | Port | Stack                   | Deploy Target             |
| -------------- | ---- | ----------------------- | ------------------------- |
| `apps/web`     | 3000 | Vite SPA (static files) | Vercel / Cloudflare Pages |
| `apps/api`     | 3001 | Hono (Node.js HTTP)     | Railway / Fly.io / VPS    |
| `apps/telefun` | 3002 | WebSocket (persistent)  | Railway / Fly.io / VPS    |

## Prerequisites

- Node.js >= 18
- pnpm >= 9
- Supabase project (with all migrations applied)

## Environment Variables

### Root `.env.local` (development)

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
VITE_API_URL=http://localhost:3001
PORT=3001

# MCP
CONTEXT7_API_KEY=your_context7_key
```

### Production Env Vars (per service)

**apps/api:**

- `PORT` — HTTP port (default 3001)
- `VITE_SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key (DO NOT expose to frontend)
- `GEMINI_API_KEY` — Google Gemini API key
- `OPENROUTER_API_KEY` — OpenRouter API key
- `ALLOWED_ORIGINS` — Comma-separated CORS origins (e.g. `https://app.example.com`)
- `NODE_ENV` — `production`

**apps/web (build-time):**

- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anon key
- `VITE_TELEFUN_WS_URL` — WebSocket URL (e.g. `wss://telefun.example.com`)
- `VITE_API_URL` — API base URL (e.g. `https://api.example.com`)

**apps/telefun:**

- `PORT` — WS port (default 3002)
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_ANON_KEY` — Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key
- `GEMINI_API_KEY` — Google Gemini API key
- `ALLOWED_ORIGINS` — Comma-separated allowed origins (or `*`)
- `NODE_ENV` — `production`

## Supabase Migrations

Apply migrations in order:

```bash
supabase migration up
```

Migration files:

1. `000_profiles_core.sql` — profiles table + auto-create trigger
2. `001_sidak_core.sql` — SIDAK tables (periods, indicators, temuan, agents, etc.)
3. `002_ketik_pdkt_core.sql` — KETIK/PDKT tables + AI usage logging + pricing
4. `003_telefun_core.sql` — Telefun history table
5. `004_admin_core.sql` — Admin panel tables (access_groups, access_group_items, leader_access_requests, activity_logs)

## Build & Run

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run in development (all 3 services)
pnpm dev
```

### Production (Docker)

Each service has its own start command:

```bash
# API
cd apps/api && node dist/index.js

# Web (static files served by CDN)
cd apps/web && npx serve dist

# Telefun
cd apps/telefun && node dist/server.js
```

## Railway Settings

Setiap service dideploy sebagai Railway service terpisah dengan konfigurasi build/start command eksplisit. **Jangan gunakan `pnpm start` default root untuk production** — script root sekarang mengunci ke web saja.

| Service        | Build Command                    | Start Command                   | Healthcheck Path  |
| -------------- | -------------------------------- | ------------------------------- | ----------------- |
| Web            | `pnpm run build:web`             | `pnpm run start:web`            | `/`               |
| API            | `pnpm run build:api`             | `pnpm run start:api`            | `/api/health`     |
| Telefun        | `pnpm run build:telefun`         | `pnpm run start:telefun`        | `/health`         |

### Root Package Scripts (Production-Ready)

| Script          | Command                                              | Purpose                                |
| --------------- | ---------------------------------------------------- | -------------------------------------- |
| `start`         | `pnpm run start:web`                                 | Default Railway start (web only)       |
| `start:web`     | `pnpm --filter @trainers/web start`                  | Web production via `serve`             |
| `build:web`     | `pnpm turbo run build --filter @trainers/web`        | Build web (TSC + Vite)                 |
| `start:api`     | `pnpm --filter @trainers/api start`                  | API production via `tsx`               |
| `build:api`     | `pnpm turbo run build --filter @trainers/api`        | Build API (TSC)                        |
| `start:telefun` | `pnpm --filter @trainers/telefun start`              | Telefun production via `node`          |
| `build:telefun` | `pnpm turbo run build --filter @trainers/telefun`    | Build Telefun (TSC)                    |
| `start:all`     | `turbo run start`                                    | Local manual multi-service (not deploy) |

### Healthcheck Smoke Test

Verifikasi web healthcheck sebelum deployment:

```bash
node scripts/deployment/railway-web-healthcheck-smoke.mjs
```

Ekspektasi: `PASS: / returned HTTP 200 on PORT=9876`.

### Troubleshooting: Web Service OOM / Exit 137

Jika log Railway menampilkan `@trainers/web dev`, `> vite`, atau `Exit status 137`, service masih menjalankan start command development (`vite`) yang memicu Vite optimizer dependency pre-bundling dan menyebabkan container OOM. Perbaiki konfigurasi Railway Web service:

| Setting          | Value                          |
| ---------------- | ------------------------------ |
| Root Directory   | repo root (`.` / kosong, bukan `apps/web`) |
| Build Command    | `pnpm run build:web`           |
| Start Command    | `pnpm run start:web`           |
| Healthcheck Path | `/`                            |

Setelah mengubah service settings, trigger **"Deploy Latest Commit"** (bukan redeploy image lama). Log deploy yang benar harus menampilkan:

```text
> @trainers/web@0.0.0 start /app/apps/web
> serve dist -s -l tcp://0.0.0.0:${PORT:-3005}
```

Log deploy **tidak boleh** mengandung:

```text
@trainers/web@0.0.0 dev
> vite
[vite] (client) [optimizer] bundling dependencies...
```

Repo ini juga memiliki guard (`scripts/deployment/guard-no-railway-dev.mjs`) yang memblokir `pnpm --filter @trainers/web dev` jika env Railway terdeteksi, memberikan pesan eksplisit.

## Deployment Checklist

- [ ] Apply all Supabase migrations
- [ ] Build all packages (`pnpm build`)
- [ ] Set production env vars for each service
- [ ] Set Railway custom build/start commands per service (lihat tabel Railway Settings di atas)
- [ ] Run smoke test: `node scripts/deployment/railway-web-healthcheck-smoke.mjs`
- [ ] Verify API health: `GET /api/health`
- [ ] Verify WebSocket: wss://telefun.example.com
- [ ] Configure CORS in production
- [ ] Set up monitoring / alerting
- [ ] Enable rate limiting (already configured in dev)

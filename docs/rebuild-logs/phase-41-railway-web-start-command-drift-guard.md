# Phase 41: Railway Web Start Command Drift Guard

**Date**: 2026-05-25  
**Status**: DONE

## Problem

Setelah fix OOM (Phase 39) dan healthcheck hardening (Phase 40), Railway Web service masih menjalankan `@trainers/web dev` / `vite` di production. Ini bukan bug kode — **Railway dashboard service settings** belum di-override dan Railway auto-detect project Vite dengan menjalankan `vite`.

Akibat: Vite optimizer OOM (`Exit status 137`), container mati.

## Symptoms in Railway Logs

```
> @trainers/web@0.0.0 dev /app/apps/web
> vite
VITE v8.0.13 ready
Local: http://localhost:3005/
[vite] (client) [optimizer] bundling dependencies...
Killed
ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL @trainers/web@0.0.0 dev: `vite`
Exit status 137
```

## Solution

### Code Changes

| File | Change |
|------|--------|
| `scripts/deployment/guard-no-railway-dev.mjs` | **New** — deteksi env Railway (`RAILWAY_ENVIRONMENT`, `RAILWAY_PROJECT_ID`, `RAILWAY_SERVICE_ID`, `RAILWAY_DEPLOYMENT_ID`), jika ada → exit 1 dengan pesan eksplisit |
| `apps/web/package.json` | Prefix `"dev": "node ../../scripts/deployment/guard-no-railway-dev.mjs && vite"` |
| `apps/web/src/__tests__/railway-dev-guard.test.ts` | **New** — 5-case regression test untuk guard (no env, DEPLOYMENT_ID, ENVIRONMENT, SERVICE_ID, PROJECT_ID) |

### Operational Changes (Railway Dashboard)

Railway Web service settings harus di-override manual:

| Setting | Value |
|---------|-------|
| Root Directory | repo root |
| Build Command | `pnpm run build:web` |
| Start Command | `pnpm run start:web` |
| Healthcheck Path | `/` |

Setelah settings diubah, trigger **"Deploy Latest Commit"** (bukan redeploy image lama).

### Cross-Service Connectivity Fix (CORS + URL)

Setelah Web, API, dan Telefun berhasil deploy sebagai 3 Railway service terpisah, connectivity antar service butuh konfigurasi berikut:

#### API Service env vars

| Variable | Value | Notes |
|----------|-------|-------|
| `NODE_ENV` | `production` | **Wajib** — tanpa ini, CORS fallback ke `localhost:3000` dan `ALLOWED_ORIGINS` diabaikan |
| `ALLOWED_ORIGINS` | `https://<web-url>.up.railway.app` | Wajib di-set di service API, bukan Web |

#### Web Service env vars

| Variable | Value | Notes |
|----------|-------|-------|
| `VITE_API_URL` | `https://<api-url>.up.railway.app/api/v1` | **Harus dengan suffix `/api/v1`** — karena API routes di-prefix `/api` (basePath) + `/v1/sidak/...` (route). Tanpa `/api/v1`, request jadi `https://api-xxx.up.railway.app/sidak/...` → 404 |
| `VITE_TELEFUN_WS_URL` | `wss://<telefun-url>.up.railway.app` | WebSocket secure (wss://) untuk production |

> `VITE_*` env vars di-embed oleh Vite saat build time. Pastikan di-set di Railway Web service env vars, **lalu redeploy Web**.

## Verification

- Guard blocks `RAILWAY_DEPLOYMENT_ID=test` → exit 1, message correct
- Guard allows local dev (no Railway env) → exit 0
- Regression test `railway-dev-guard.test.ts`: 5/5 passed
- Smoke test: `PASS: / returned HTTP 200 on PORT=9876`
- API healthcheck: `GET https://api-xxx.up.railway.app/api/health` → `{"status":"ok"}`
- Cross-origin requests: no more CORS errors

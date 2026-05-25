# Phase 40: Railway Healthcheck Hardening

**Date**: 2026-05-25  
**Status**: DONE

## Problem

Root `pnpm start` = `turbo run start` menjalankan `api`, `telefun`, dan `web` sekaligus. Dalam konteks Railway single-service deployment, ketiganya berebut satu `$PORT` dengan healthcheck path berbeda → healthcheck gagal.

## Solution

Mengunci root `start` ke web-only dengan service-specific scripts, plus smoke test untuk verifikasi.

## Changes

| File | Change |
|------|--------|
| `package.json` (root) | 7 script baru — `start` default dikunci ke `pnpm run start:web`, `start:web`, `start:api`, `start:telefun`, `build:web`, `build:api`, `build:telefun`, `start:all` |
| `scripts/deployment/railway-web-healthcheck-smoke.mjs` | **New** — spawn web di test `PORT`, poll `/`, assert HTTP 200, graceful shutdown |
| `docs/deployment.md` | Railway Settings table (build/start command + healthcheck path per service), root scripts table, smoke test section |
| `plan/markdown/railway-healthcheck-fix.md` | Implementation plan |

## Railway Service Settings (per service)

| Service | Build Command | Start Command | Healthcheck |
|---------|---------------|---------------|-------------|
| Web | `pnpm run build:web` | `pnpm run start:web` | `/` |
| API | `pnpm run build:api` | `pnpm run start:api` | `/api/health` |
| Telefun | `pnpm run build:telefun` | `pnpm run start:telefun` | `/health` |

## Verification

- `vitest` `vite.config.test.ts`: 1 passed
- Root `pnpm start` → hanya `@trainers/web start` (tidak lagi menjalankan api/telefun)
- `turbo run start` (via `start:all`) → tetap menjalankan semua 3 service
- Smoke test: `PASS: / returned HTTP 200 on PORT=9876`
- Context7-verified against Railway monorepo + healthcheck docs

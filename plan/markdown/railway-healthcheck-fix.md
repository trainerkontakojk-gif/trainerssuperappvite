# Railway Healthcheck Fix

## 1. Requirement

### Goal
Hardening kontrak deployment Railway agar setiap service (web, api, telefun) memiliki build/start command yang terisolasi, menghindari race condition multi-service berebut `$PORT` ketika root `start` dijalankan oleh Railway.

### Acceptance Criteria
- `pnpm start` dari root hanya menjalankan web service (`pnpm run start:web`).
- Root menyediakan script terpisah: `start:web`, `start:api`, `start:telefun`, `build:web`, `build:api`, `build:telefun`, `start:all`.
- Railway web service: build = `pnpm run build:web`, start = `pnpm run start:web`, healthcheck = `/` -> `HTTP 200`.
- Smoke script `scripts/deployment/railway-web-healthcheck-smoke.mjs` lulus (start web di test `PORT`, poll `/`, assert `200`).
- `turbo run start --dry=json` dari root tidak lagi mengeksekusi semua production service.

### Edge Cases
- Jika `$PORT` tidak di-set di environment, web fallback ke `3005` (sesuai script `serve` di `apps/web/package.json`).
- Smoke script menangani graceful shutdown (SIGTERM + SIGKILL fallback).

### Technical Constraints
- Tidak ada perubahan API schema, database migration, atau user-facing behavior.
- `apps/web/package.json` tetap menggunakan `serve dist -s -l tcp://0.0.0.0:${PORT:-3005}` sebagai production start.
- Tidak ada perubahan pada Turbo pipeline (`turbo.json`).

## 2. Design

### Architecture Decision
Root `start` script dikunci ke `start:web` sebagai single-service default untuk Railway. Setiap service memiliki script prefiks `start:<service>` dan `build:<service>` agar Railway custom start command bisa dipanggil langsung tanpa turbo orchestration (avoiding multi-service collision).

### Data Flow
```
Railway Config (per service)
  ├─ Web:    build → pnpm run build:web   → pnpm --filter @trainers/web start
  │          start → pnpm run start:web    → serve dist -l tcp://0.0.0.0:$PORT
  │          healthcheck → GET / → 200
  ├─ API:    build → pnpm run build:api    → pnpm --filter @trainers/api build
  │          start → pnpm run start:api    → tsx src/index.ts
  │          healthcheck → GET /api/health
  └─ Telefun: build → pnpm run build:telefun → pnpm --filter @trainers/telefun build
             start → pnpm run start:telefun  → node dist/server.js
             healthcheck → GET /health
```

### Interface Changes
- `package.json` (root): 7 script baru, `start` diubah default.
- `scripts/deployment/railway-web-healthcheck-smoke.mjs`: script baru.
- `docs/deployment.md`: tambah section Railway Settings.

## 3. Tasklist

| # | Task | File(s) | Status |
|---|------|---------|--------|
| 1 | Tambah script `start:web`, `start:api`, `start:telefun`, `build:web`, `build:api`, `build:telefun`, `start:all` di root `package.json`. Ubah `start` ke `pnpm run start:web`. | `package.json` | ✓ |
| 2 | Buat `scripts/deployment/railway-web-healthcheck-smoke.mjs` | `scripts/deployment/railway-web-healthcheck-smoke.mjs` | ✓ |
| 3 | Update `docs/deployment.md` dengan tabel Railway settings per-service | `docs/deployment.md` | ✓ |
| 4 | Verifikasi `pnpm turbo run start --dry=json` dari root tidak lagi menjalankan semua service | — | ✓ |
| 5 | Smoke test: `node scripts/deployment/railway-web-healthcheck-smoke.mjs` | — | ✓ |

### Test Strategy
- `vitest run` (existing): `apps/web/vite.config.test.ts` — verify Vite preview port config.
- `turbo run start --dry=json`: verify root start now only runs web.
- Smoke script: verify `/` returns `HTTP 200` on test `PORT`.

### Risk Register
| Risk | Impact | Mitigation |
|------|--------|------------|
| Railway service konfigurasi lama masih menggunakan `pnpm start` tanpa custom command | Healthcheck gagal — root menjalankan multi-service di satu `$PORT` | Update Railway service settings manual di dashboard sesuai docs deployment.md |

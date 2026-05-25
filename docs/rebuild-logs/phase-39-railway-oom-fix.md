# Phase 39: Railway Deployment OOM Fix

**Date**: 2026-05-25  
**Status**: DONE

## Problem

Railway container crash loop — `Exit status 137` (OOM/SIGKILL). Vite dev server (`pnpm dev` → `vite`) was running in production. During dependency pre-bundling (optimizer), the container exceeded memory limit and got killed by the OOM killer.

Heavy dependencies causing the OOM during optimization:
- `exceljs` (~400 kB)
- `xlsx` (~400 kB)
- `recharts` (~300 kB)
- `pptxgenjs` (~400 kB)
- `html2canvas`, `jspdf`

## Solution

Replaced `vite` (dev server) with `vite preview` (production static file server) in Railway production.

## Changes

| File | Change |
|------|--------|
| `apps/web/vite.config.ts` | Shared `appPort = Number(process.env.PORT) \|\| 3005` for dev server and `vite preview`; preview binds `0.0.0.0`, uses `strictPort`, and respects Railway `PORT` |
| `apps/web/package.json` | Added `"start": "vite preview --host 0.0.0.0"` for production |
| `package.json` | Added `"start": "turbo run start"` root script |
| `turbo.json` | Added `"start"` task with `dependsOn: ["^build"]`, `cache: false`, `persistent: true` |
| `railway.toml` | **New** — explicit build (`pnpm build`) + start (`pnpm start`) commands, healthcheck at `/` |
| `.node-version` | **New** — pins Node.js to v22 (Vite 8.0.13 requires >=22, Nixpacks defaulted to 18)

## Root Cause

1. **OOM Kill**: Vite dev server performs dependency pre-bundling/optimization on startup. With 10+ heavy libraries, this consumes 500+ MB of memory, exceeding Railway's container limits.
2. **Node.js Version Mismatch**: No `.node-version` was pinned in the repo. Nixpacks defaulted to Node.js 18.20.5, which is incompatible with Vite 8.0.13 (requires >=22). This caused a `ReferenceError: CustomEvent is not defined` crash on startup.

`vite preview` serves pre-built static assets without any optimization step, reducing memory usage to <100 MB.

## Verification

- Local dev (`pnpm dev`) unaffected — still uses `vite` dev server
- `railway.toml` tells Railway to build first, then serve with `vite preview`
- `--host 0.0.0.0` ensures the server listens on all interfaces (required for Railway)
- `preview.port` uses Railway's dynamic `PORT`; `server.port` alone is not enough because production runs `vite preview`

## Follow-up Healthcheck Fix

After the OOM fix, Railway could still stall at `Starting Healthcheck` with `service unavailable` because `vite preview` defaulted to port `4173` while Railway healthchecked the dynamic `$PORT`.

The fix is to configure Vite's `preview` block explicitly:

```ts
preview: {
  host: "0.0.0.0",
  port: appPort,
  strictPort: true,
}
```

Local reproduction before the fix:

- `PORT=4567 pnpm --filter @trainers/web start` opened `http://localhost:4173/`
- `curl http://127.0.0.1:4567/` failed to connect
- `curl http://127.0.0.1:4173/` returned `200`

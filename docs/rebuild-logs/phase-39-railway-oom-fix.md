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
| `apps/web/vite.config.ts` | `port: Number(process.env.PORT) \|\| 3005` — respect Railway `PORT` env |
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
- `PORT` env support ensures compatibility with Railway's dynamic port assignment

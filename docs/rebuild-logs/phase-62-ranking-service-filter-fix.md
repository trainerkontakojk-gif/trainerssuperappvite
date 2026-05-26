# Phase 62 — SIDAK Ranking Service Filter Fix

**Date**: 2026-05-27
**Status**: DONE
**Category**: Bug Fix

## Bug

Dropdown filter Layanan pada halaman **Ranking Agen** (`/sidak/ranking`) dan **Dashboard QA** (`/sidak/dashboard`) hanya menampilkan **"Call"** meskipun database memiliki data temuan untuk layanan lain (Chat, Email, CSO, Pencatatan, BKO, SLIK).

## Root Cause

`availableServices` diderivasi dari `dashboardData.serviceData` yang sudah ter-filter oleh `service_type` aktif (default `"call"`). Akibatnya `availableServices` = `["call"]`.

## Fix

| File | Change |
|------|--------|
| `apps/api/src/services/sidak-service.ts` | Tambah `distinctQuery` paralel (SELECT `service_type` tanpa filter `service_type`) + pre-resolve folder names + ganti `availableServices` dari distinct results intersect `allowedSvcs` |
| `apps/api/src/routes/sidak.ts` | Sederhanakan `/ranking` endpoint: langsung pakai `dashboardData.availableServices` + intersect leader scope. Hapus unused import `VALID_SERVICE_TYPES` |
| `apps/api/src/__tests__/sidak-service-dashboard.test.ts` | 4 regression tests: multi-service distinct, leader scope intersection, empty results, leader scope |

## Architecture

```
getDashboardData()
├── Parallel Query 1: Main temuan query (filtered by service_type) → scoring data
└── Parallel Query 2: SELECT service_type (NO service_type filter) → availableServices
    └── Intersect with allowedSvcs (leader scope)
    └── Filter by VALID_SERVICE_TYPES (known service types only)
```

## Test Results

- **API**: 411 passed, 4 skipped, 0 failures (+4 new regression tests)
- **Web**: 385 passed, 2 timeout (pre-existing)
- **Lint**: 0 errors in changed files

## Zero Frontend Changes

Frontend ranking page (`ranking.tsx`) already handles `availableServices` normalization. No code changes needed.

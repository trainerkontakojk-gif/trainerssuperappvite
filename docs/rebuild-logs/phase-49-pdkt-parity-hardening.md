# Phase 49: PDKT Legacy Parity Hardening

## Summary

Menjalankan plan `pdkt-legacy-parity-growth-no-layout-change.md` untuk harden modul PDKT
tanpa mengubah layout simulasi/email. 10 work items dieksekusi: 6 phase plan + 4 parity gap.

## Key Changes

### 1. Settings Contract Fix (`GET /pdkt/settings`)
- **Backend**: `/pdkt/settings` response berubah dari `{ success, settings }` → `{ success, data }`
  agar match dengan `fetchApi` utility yang selalu extract `json.data`
- **Frontend**: Consumer di `simulation.tsx` dan `index.tsx` di-update baca settings langsung
  tanpa wrapper `res.settings`
- **Impact**: Settings persisted tidak lagi hilang saat reload karena contract mismatch
- **Files**: `apps/api/src/routes/pdkt.ts`, `apps/web/src/routes/pdkt/simulation.tsx`,
  `apps/web/src/routes/pdkt/index.tsx`, test mocks di-update

### 2. Access Alignment
- **Route guard**: PDKT routes (`/pdkt`, `/pdkt/simulation`) berubah dari `requireAuth()` →
  `requireRole(["trainer", "qa", "admin"])`, konsisten dengan endpoint AI
  (`/generate-template`, `/evaluate`)
- **Module config**: `app-config.ts` PDKT entry ditambahkan `allowedRoles: ["trainer", "qa", "admin"]`,
  menyembunyikan PDKT dari sidebar non-privileged roles
- **Files**: `apps/web/src/router.tsx`, `apps/web/src/lib/app-config.ts`

### 3. History Replay (Non-Mailbox Session)
- History session yang sudah tidak punya mailbox item aktif tetap bisa di-replay
- Synthetic `PdktMailboxItem` dibuat dari data `SessionHistory` (inbound email, thread, evaluation)
- Replay mode hanya read-only — reply composer tidak ditampilkan
- **Files**: `apps/web/src/routes/pdkt/simulation.tsx`, `apps/web/src/routes/pdkt/index.tsx`

### 4. Mailbox Idempotency
- `handleStartNew` kini mengirim `client_request_id` (UUID) saat create mailbox batch
- Mencegah duplicate submit saat double-click
- **Files**: `apps/web/src/routes/pdkt/simulation.tsx`

### 5. Usage Delta Retry
- `computeUsageDelta` di `simulation.tsx` dan `index.tsx` kini retry hingga 2x (2s delay)
  saat delta masih nol, menunggu backend usage table sync setelah async eval selesai
- Remaining attempts auto-decrement hingga 0
- **Files**: `apps/web/src/routes/pdkt/simulation.tsx`, `apps/web/src/routes/pdkt/index.tsx`

### 6. Error Message Hardening
- Helper `pdktErrorMessage(err)` di backend route menerjemahkan error DB mentah ke pesan
  manusiawi: duplicate key, foreign key, JWT expired, permission denied
- Semua catch block di route PDKT diganti dari raw `error?.message` ke `pdktErrorMessage(error)`
- **Files**: `apps/api/src/routes/pdkt.ts`

### 7. DUMMY_PROFILES + Cities Parity
- Backend `DUMMY_PROFILES` diperluas dari 5 → 20 entri (match reference-repo)
- `generateRandomIdentity()` kini merandom kota dari 25 `DUMMY_CITIES` (sebelumnya hardcoded "Jakarta")
- Frontend `pdktSettings.ts` juga diperbarui dengan 20 profiles
- **Files**: `apps/api/src/services/pdkt-service.ts`, `apps/web/src/routes/pdkt/pdktSettings.ts`

### 8. Coercion Robustness
- Frontend ditambahkan `coerceWritingStyleMode()` dan `coerceConsumerNameMentionPattern()`
  untuk validasi ketat (whitelist-based, fallback ke default)
- `coercePdktModelId` sudah existing, dipertahankan
- **Files**: `apps/web/src/routes/pdkt/pdktSettings.ts`

### 9. Legacy Script Migration
- Backend `readPdktSettings()` kini menjalankan `migratePdktSettings()`:
  - Migrasi field `script` legacy → `sampleEmailTemplate.body`
  - Auto-set `alwaysUseSampleEmail = false` pada hasil migrasi
- **Files**: `apps/api/src/lib/pdkt-settings.ts`

### 10. Test Uplift
- Placeholder test `pdkt-mailbox.test.ts` diganti 7 tests real:
  - Default model, model coercion, writing style coercion
  - Consumer name mention coercion, random pattern resolution
  - Session config generation dengan model coercion
- Test mocks di-update untuk match contract baru

## Test Results

```
API:  2 files | 14 tests passed
Web:  4 files | 27 tests passed
Total: 41 tests passed
```

## Files Affected

| Area | File | Change |
|------|------|--------|
| API Route | `apps/api/src/routes/pdkt.ts` | Contract fix + error hardening |
| API Service | `apps/api/src/services/pdkt-service.ts` | DUMMY_PROFILES + cities parity |
| API Lib | `apps/api/src/lib/pdkt-settings.ts` | Legacy script migration |
| Web Router | `apps/web/src/router.tsx` | Role guard tighten |
| Web Config | `apps/web/src/lib/app-config.ts` | PDKT allowedRoles |
| Web Settings | `apps/web/src/routes/pdkt/pdktSettings.ts` | Coercion + profiles/cities |
| Web Landing | `apps/web/src/routes/pdkt/index.tsx` | Settings contract + delta retry |
| Web Simulation | `apps/web/src/routes/pdkt/simulation.tsx` | Contract + replay + idempotency + retry |
| Test (API) | `apps/api/src/__tests__/pdkt*.test.ts` | Implied by contract/settings |
| Test (Web) | `apps/web/src/__tests__/pdkt*.test.*` | Mock update + placeholder replacement |

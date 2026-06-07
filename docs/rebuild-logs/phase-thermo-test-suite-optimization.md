# Test Suite Optimization & 4-Tier Strategy

**Date:** June 7, 2026  
**Phase:** 187  
**Duration:** ~45 min implementation

## Problem

Pre-push test suite was taking ~4 minutes (231s total):
- API tests: 64s (639 tests)
- Web tests: 167s (623 tests)

This made the pre-push workflow painful and discouraged frequent pushes.

## Root Cause Analysis

1. **Low-value tests** — 23 tests that provided no real confidence:
   - Import verification tests (`expect(mod.default).toBeDefined()`)
   - Hardcoded CSS class string assertions
   - Built-in browser API tests (`URLSearchParams`, `Array.some()`)

2. **No test tiering** — All tests ran together, including slow component rendering tests that require jsdom environment.

3. **jsdom overhead** — Component tests have 234s cumulative environment setup time.

4. **No build dependency removal** — `test:fast` was waiting for `build` to complete first.

## Solution

### 1. Removed Low-Value Tests (23 tests removed)

**`sidak-input-legacy-refresh.test.tsx`:**
- Removed 4 "contract" tests that only checked `mod.default` is defined
- Removed 2 "Button component contract" tests that only verified imports work
- Kept: `resolveServiceTypeFromTeam`, `calculateQAScoreFromTemuan`, `hasBadFindings` logic tests

**`sidak-input-parity.test.tsx`:**
- Removed all hardcoded HTML/CSS string assertion tests (17 tests)
- Kept: `normalizeAgentsResponse` function tests, `scoreColor/scoreBg/scoreLabel` utility tests

### 2. Implemented 4-Tier Testing Strategy

| Tier | Command | Duration | Coverage | Use Case |
|------|---------|----------|----------|----------|
| **Targeted** | `pnpm test:targeted` | 10-30s | Changed files only (`vitest --changed`) | Development, quick check |
| **Core** | `pnpm test:core` | 30-60s | 175 critical contract tests | Pre-push |
| **Fast** | `pnpm test:fast` | 1-2min | 983 unit tests (no .tsx) | Pre-merge |
| **Full** | `pnpm test` / `test:full` | ~5min | 1,239 all tests (incl. jsdom) | CI, release |

**Core tests include:**
- Authentication, authorization, and RLS
- API route/service contracts (SIDAK, KETIK, PDKT, Telefun)
- SIDAK scoring and period/version resolution
- Telefun session finalizer and assessment boundary
- Migration/security contracts

**Fast tests exclude:**
- `.test.tsx` files (React component rendering)
- React hook tests (`useApi`, `useQueryParams`, `authInit`, `auth-login-flow`)

### 3. Configuration

**New files:**
- `apps/web/vitest.config.fast.ts` — Node environment, excludes React tests
- `apps/web/src/__tests__/setup-fast.ts` — Minimal setup without DOM globals

**Updated files:**
- `apps/web/package.json` — Added 4 test scripts
- `apps/api/package.json` — Added 4 test scripts
- `apps/telefun/package.json` — Added 4 test scripts
- `package.json` (root) — Added 4 test scripts
- `turbo.json` — Added 4 test tasks with appropriate dependencies

### 4. Risk-Based Testing Policy

Added to AGENTS.md:

**Wajib test baru:**
- Perubahan behavior atau business logic
- Bug fix (tulis regression test)
- Perubahan security/permission
- Perubahan database schema/migration
- Perubahan API contract

**Tidak wajib test baru:**
- Refactor tanpa perubahan behavior (jalankan test terkait)
- UI kosmetik/styling
- Dokumentasi
- Konfigurasi sederhana

## Results

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Targeted test time | N/A | **10-30s** | New tier |
| Core test time | N/A | **36s** | New tier |
| Fast test time | N/A | **56s** | New tier |
| Full test time | 231s | 203s | 12% faster |
| Web test count | 623 | 600 | -23 low-value tests |
| API test count | 639 | 639 | Unchanged |

## Development Workflow (Updated)

```bash
# Quick check saat development
pnpm test:targeted  # 10-30s

# Sebelum commit
pnpm test:core      # 30-60s

# Sebelum push
pnpm test:fast      # 1-2min

# Sebelum merge/release
pnpm test:full      # ~5min
```

## Pre-Push Checklist (Updated)

```bash
pnpm lint
pnpm build
pnpm test:core  # 30-60s, critical contracts
```

## Files Modified

- `apps/web/src/__tests__/sidak-input-legacy-refresh.test.tsx` — Removed 6 low-value tests
- `apps/web/src/__tests__/sidak-input-parity.test.tsx` — Removed 17 hardcoded string tests
- `apps/web/vitest.config.fast.ts` — NEW: Fast test config (node env, no React)
- `apps/web/src/__tests__/setup-fast.ts` — NEW: Minimal setup for fast tests
- `apps/web/package.json` — Added 4 test scripts (targeted, core, fast, full)
- `apps/api/package.json` — Added 4 test scripts (targeted, core, fast, full)
- `apps/telefun/package.json` — Added 4 test scripts (targeted, core, fast, full)
- `package.json` — Added 4 test scripts (targeted, core, fast, full)
- `turbo.json` — Added 4 test tasks with appropriate dependencies
- `AGENTS.md` — Updated Commands section with 4-tier strategy + risk-based policy

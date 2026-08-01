# Test Suite Hygiene — Fix Suite Merah, Bersihkan Parity/Legacy, Konsolidasi Fragmentasi

**Date:** July 30, 2026
**Phase:** 210
**Duration:** ~1 session

## Problem

1. **Suite test sedang MERAH** — `test:fast` API 2 failure + Web 12 failure, dan `test:full` web menyisakan 6 failure tambahan yang tidak terdeteksi gate.
2. **Bloat test transisi** — 14 file test bernama `*-parity`/`*-legacy` yang sebagian besar adalah artefak verifikasi migrasi satu kali (fase 26–90) dan tidak pernah dibersihkan setelah migrasi landing.
3. **Fragmentasi mikro** — banyak file test 1–3 test per file (mis. `sidak-dashboard-trends`, `sidak-dashboard-type-boundary`, `sidak-dashboard-forecast-migration`) dan grup migration-contract yang terpecah per migration.
4. **Gate `test:core` web tidak benar-benar menegakkan daftarnya** — config `vitest.config.fast.ts` (include hanya `*.test.ts`) membuat 4 file `.tsx` di `scripts/test-core.json` diam-diam di-skip: hanya 56 dari 137 test yang jalan.

## Root Cause Analysis

| Failure | Root cause |
| --- | --- |
| API `ketik-input-validation-route` (1) | Assertion stale: route sudah meneruskan `expectedVersion` (optimistic concurrency via header `x-settings-version`) sejak lama, test belum di-update; tidak ada test untuk path conflict → 409 |
| API `sidak-dashboard-pagination` (1) | Assertion stale vs commit `34fff97` yang **sengaja** melepas folder filter dari query distinct services (dropdown selalu menampilkan semua service type) |
| Web `exportAgentReport` ×8 | Test memakai `DOMParser` tetapi dijalankan di env `node` (fast config) |
| Web `telefun-provider-readiness` ×4 | Source memakai `window.setTimeout` tanpa guard → gagal di env non-browser |
| Web full `access-approval-*` ×5 | UI redesign (phase 197 & commit `14ef10a`) mengubah placeholder search, menghapus counter "N permintaan", tombol "Tolak KTP"→"Tolak", dan detail pane butuh seleksi leader |
| Web full `sidak-agent-detail-temuan` ×1 | UI redesign mengganti label badge "KRITIS/SESUAI" menjadi score + label "Poin" + kategori |

## Solution

### 1. Fix failure (RED → GREEN)

- **API `ketik-input-validation-route.test.ts`** — update assertion ke kontrak baru + 2 test baru: `x-settings-version` diteruskan, dan `SETTINGS_CONFLICT` → 409.
- **API `sidak-dashboard-pagination.test.ts`** — test di-update ke keputusan desain `34fff97`: folder filter membatasi data dashboard (totalDefects) tetapi tidak membatasi `availableServices`.
- **Web `exportAgentReport.test.ts`** — pragma `// @vitest-environment jsdom` (test memang butuh DOM parsing).
- **Web `telefunProviderReadiness.ts`** — `window.setTimeout`/`clearTimeout` → `globalThis.*` (browser + node).
- **Web full (pre-existing)** — `access-approval-grouped-leader-cards`, `access-approval-module-information`, `sidak-agent-detail-temuan-parity` disinkronkan ke UI saat ini.

### 2. Bersihkan test parity/legacy transisi

**Dihapus (3):**
- `database-parity-post-sync.test.ts` — verifikasi sync May 2026 satu kali; script tidak lagi dipakai.
- `dashboard-post-login-parity.test.tsx` — menguji *re-implementasi lokal* `formatTimeAgo` di dalam file test, bukan kode app.
- `sidak-input-parity.test.tsx` — duplikat `normalizeAgentsResponse` dari `sidak-input-agents-shape.test.ts`; 4 test warna (`scoreColor`/`scoreBg`/`scoreLabel`) dipindah ke `sidak-scoring-core.test.tsx`.

**Di-rename ke nama kontrak (9):** `top-tickets-legacy-parity`→`sidak-scoring-session`, `sidak-input-legacy-refresh`→`sidak-scoring-core`, `access-groups-parity`→`access-groups`, `sidak-dashboard-parity`→`sidak-dashboard`, `sidak-settings-parity`→`sidak-settings`, `monitoring-unauthorized-parity`→`monitoring-unauthorized`, `sidak-ranking-fatal-parity`→`sidak-ranking-fatal-badge`, `sidak-versioning-parity`→`sidak-versioning`, `sidak-dashboard-critical-parity`→`sidak-dashboard-has-critical`.

### 3. Konsolidasi fragmentasi (11 file → 3)

- `telefun-scoring-migration-contracts.test.ts` (34 test) — merge `lifecycle-schema` + `repair-migration` + `retry-migration`.
- `sidak-migration-contracts.test.ts` (8 test) — merge `profiler-lookup-indexes` + `slik-subparameters` + `dashboard-forecast`.
- `sidak-dashboard-utils.test.ts` (2 test) — merge `dashboard-trends` + `dashboard-type-boundary`.

Web `telefun-live-session-*` **tidak di-merge**: tiap file punya harness mock sendiri (`FakeWebSocket`, `createMockConfig`) yang konflik — solusi lanjutan adalah shared helper di `src/__tests__/helpers/`.

### 4. Perbaikan gate `test:core` web

`scripts/test-core.json` web `config` diubah dari `vitest.config.fast.ts` → `null` (config default jsdom) sehingga **semua 8 file** di daftar benar-benar tereksekusi (137 test, sebelumnya hanya 56).

### 5. Aturan permanen

- `AGENTS.md` §6 **Test Hygiene**: parity/legacy wajib dihapus/rename saat migrasi landing; perluas `describe` yang ada daripada file baru per bug; file `.tsx` di `test-core.json` wajib benar-benar tereksekusi.
- `docs/README.md`: catatan hygiene + perilaku gate core.

## Result

| Gate | Sebelum | Sesudah |
| --- | --- | --- |
| API `test:fast` | 2 failed | 1251 passed, 1 skipped |
| Web `test:fast` | 12 failed | 603 passed |
| Web `test:full` | 6 failed | 1151 passed (141/141 files) |
| `test:core` (turbo) | 4 tasks (web hanya 56 test) | 4/4 sukses (web 137 test) |
| tsc api + web | — | 0 error |
| eslint file terdampak | — | 0 error |

Jumlah file test: 313 → **289** (−24). Total test case: ~2.660.

## Files

- Fix: `apps/web/src/routes/telefun/services/telefunProviderReadiness.ts`
- Config: `scripts/test-core.json`
- Docs: `AGENTS.md`, `docs/README.md`, `docs/PHASE_PROGRESS.md`, `docs/rebuild-logs/phase-210-test-suite-hygiene.md`
- Tests: 22 file diubah, 11 dihapus, 9 rename, 3 baru (detail di git diff)

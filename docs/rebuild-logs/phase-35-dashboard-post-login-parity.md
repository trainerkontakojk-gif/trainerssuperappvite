# Phase 35: Dashboard Post-Login Legacy Parity

> **Status:** DONE
> **Tanggal:** 2026-05-24
> **Plan:** `plan/markdown/dashboard-post-login-legacy-parity-reaudit.md`

## Ringkasan

Memperbaiki 4 gap kritis pada halaman dashboard setelah login untuk mencapai full parity dengan legacy Next.js:

1. **Auth-aware data fetching** — semua request API dashboard kini menyertakan `Authorization: Bearer <token>` via shared helper `getApi`/`deleteApi`.
2. **Recent activity parity** — card "Aktivitas Terakhir" menampilkan 5 item (sebelumnya 6).
3. **Analytics lazy loading** — panel analytics + Recharts (300+ kB) dipisah ke chunk terpisah via `React.lazy()`, dengan skeleton pulse selama loading.
4. **Shortcut path konsisten** — monitoring shortcut tetap `/monitoring` dengan kompatibilitas redirect `/dashboard/monitoring` yang sudah ada.

## Perubahan File

| File | Action | Deskripsi |
|------|--------|-----------|
| `apps/web/src/routes/dashboard.tsx` | Modified | Replace raw `fetch()` dengan `getApi`/`deleteApi`, hapus Recharts static import, ekstrak analytics ke lazy component, recent activity `slice(0,6)` → `slice(0,5)`, hapus derivation logic (`activeTrend`, `qaTrendPoints`, `trendDelta`, dll) |
| `apps/web/src/routes/dashboard/DashboardTrendPanel.tsx` | Added | Lazy-loaded analytics panel dengan internal Recharts import, derivation logic, chart + performance summary JSX |
| `apps/web/src/__tests__/useApi.test.ts` | Modified | Tambah 2 test: `sends Authorization Bearer header when token exists`, `does not send Authorization header when no token exists` |
| `apps/web/src/__tests__/dashboard-post-login-parity.test.tsx` | Added | 5 test: recent activity count (5 items), fewer-than-5, empty array, formatTimeAgo, normalizeActionText |
| `AGENTS.md` | Modified | Tambah phase 35 + file references |
| `plan/markdown/dashboard-post-login-legacy-parity-reaudit.md` | Modified | Mark status EXECUTED |

## Acceptance Criteria Status

| ID | Kriteria | Status |
|----|----------|--------|
| AC-01 | Semua request dashboard ke endpoint protected menggunakan auth token | **PASS** — `getApi`/`deleteApi` selalu menyertakan Bearer token |
| AC-02 | Aktivitas Terakhir menampilkan 5 item | **PASS** — `slice(0, 5)` |
| AC-03 | Shortcut monitoring konsisten | **PASS** — tetap `/monitoring` + redirect kompatibilitas |
| AC-04 | Lazy loading analytics dengan skeleton | **PASS** — `React.lazy()` + `Suspense` + 2 kolom skeleton pulse |
| AC-05 | Header/topbar dashboard tetap konsisten | **PASS** — tidak ada perubahan |
| AC-06 | Redirect kompatibilitas tidak regresi | **PASS** — tidak ada perubahan di router |
| AC-07 | Regression test minimal | **PASS** — 5 test baru + 2 auth header test |
| AC-08 | Dokumentasi parity update | **PASS** — rebuild log ini |

## Verification

| Command | Result |
|---------|--------|
| `pnpm --filter @trainers/web lint` | 0 errors, 143 warnings (all pre-existing) |
| `pnpm --filter @trainers/web test` | 117/119 passed (2 pre-existing: access-groups timeout + monitoring flaky) |
| `pnpm --filter @trainers/web build` | Passed, dashboard chunk 14.3 kB, analytics panel 10.3 kB, Recharts lazy-loaded |
| `pnpm --filter @trainers/api lint` | 0 errors, 11 warnings |

## Bundle Impact

| Chunk | Size | Catatan |
|-------|------|---------|
| `dashboard-DdvC956M.js` | 14.3 kB | Main dashboard (no Recharts) |
| `DashboardTrendPanel-CjiDHjEs.js` | 10.3 kB | Lazy analytics panel |
| `CategoricalChart-h_h4lNfK.js` | 251.55 kB | Recharts — lazy via DashboardTrendPanel |
| `CartesianChart-Dxceka-J.js` | 70.45 kB | Recharts — lazy via DashboardTrendPanel |

**Sebelum:** Recharts 300+ kB included di main bundle dashboard.
**Sesudah:** Main dashboard 14.3 kB, Recharts hanya dimuat saat analytics panel renders.

## Edge Cases Covered

- Token hilang/expired: `fetchApi` throws, `DashboardTrendPanel` gagal render gracefully
- Role `leader`: analytics tetap tampil (`showAnalytics = isManager || isLeader`)
- Data kosong: UI empty state tetap muncul di chart
- API failures: individual fetch errors tidak menghentikan render dashboard lainnya (graceful degradation via `catch` per-call di `initDashboard`)

## Keputusan Teknis

1. **Shared `getApi`/`deleteApi` dipilih** daripada raw fetch dengan inline token — mengikuti pattern codebase yang sudah ada, mengurangi duplikasi.
2. **`selectedService` state dipindah ke `DashboardTrendPanel`** — internal state yang hanya relevan untuk panel, tidak perlu expose ke parent.
3. **Skeleton animation `animate-pulse`** — setara dengan legacy `DashboardTrendClientLoader`.
4. **TrendData interface tetap di parent** — meskipun duplikat dengan panel, tetap diperlukan untuk type safety di state.

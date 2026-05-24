# Dashboard Post-Login Legacy Parity Reaudit Plan

> **Status:** EXECUTED
> **Tanggal audit:** 2026-05-24

## Requirement

### Tujuan

Memastikan halaman **dashboard setelah login** di `apps/web` memiliki parity fungsi dan komponen dengan legacy (`reference-repo`), dengan fokus pada:

1. Parity fungsional (data trend, activity logs, role-gated sections)
2. Parity komponen utama (hero, pintasan, analytics, recent activities)
3. Parity perilaku akses/routing kompatibilitas legacy
4. Kepatuhan performa FCP/LCP (AGENTS Golden Rule #1)

### Audit Snapshot (2026-05-24)

| Area | Legacy (`reference-repo`) | Current (`apps/web`) | Status |
| --- | --- | --- | --- |
| Data fetch auth dashboard | Server-side auth context (`requirePageAccess`) + service calls terautentikasi | `fetch("/api/v1/..." )` langsung tanpa `Authorization` bearer di dashboard page | **Belum parity (critical)** |
| Recent activity pada dashboard home | `getRecentActivities(5)` | fetch `/admin/activity-logs` lalu `slice(0, 6)` | **Belum parity (behavior drift)** |
| Monitoring shortcut path | `/dashboard/monitoring` | `/monitoring` (tersedia redirect kompatibilitas di router) | **Partial parity** |
| Trend analytics loading strategy | split client chunk via `DashboardTrendClientLoader` (dynamic loading shell) | analytics inline di route dashboard utama | **Belum parity (perf drift)** |
| Sticky header + avatar + theme toggle | ada di dashboard wrapper | ada di `Layout` global (tetap tampil di `/dashboard`) | **Sudah parity** |
| Shortcut/link SIDAK lama (`/qa-analyzer/*`) | native legacy path | path baru `/sidak/*`, disertai redirect `/qa-analyzer/$ -> /sidak/$` | **Sudah parity via compatibility** |

### Bukti Audit (Code References)

- Current dashboard fetch tanpa bearer: `apps/web/src/routes/dashboard.tsx` line 203, 210, 219, 247, 298, 303
- Current dashboard recent logs menampilkan 6 item: `apps/web/src/routes/dashboard.tsx` line 1034
- Current dashboard chart color hardcoded primary: `apps/web/src/routes/dashboard.tsx` line 488
- Legacy dashboard fetch recent 5 item: `reference-repo/app/(main)/dashboard/page.tsx` line 32
- Legacy dynamic split trend analytics: `reference-repo/app/(main)/dashboard/page.tsx` line 251
- Legacy monitoring shortcut path: `reference-repo/app/(main)/dashboard/page.tsx` line 70
- Legacy compatibility redirect sudah ada di Vite router: `apps/web/src/router.tsx` line 365

### Acceptance Criteria

| ID | Kriteria |
| --- | --- |
| AC-01 | Semua request dashboard home ke endpoint protected (`/sidak/dashboard/*`, `/admin/activity-logs`) menggunakan auth token yang valid (Bearer). |
| AC-02 | Behavior `Aktivitas Terakhir` di dashboard home sama dengan legacy: menampilkan 5 item terbaru. |
| AC-03 | Shortcut monitoring konsisten terhadap policy parity yang dipilih (tetap kompatibel legacy URL tanpa memutus route baru). |
| AC-04 | Strategi loading analytics mempertahankan parity UX legacy sekaligus menjaga FCP/LCP (split chunk/skeleton). |
| AC-05 | Header/topbar dashboard setelah login tetap konsisten (eyebrow, title, theme toggle, avatar). |
| AC-06 | Redirect kompatibilitas legacy (`/qa-analyzer/*`, `/dashboard/monitoring`) tidak regresi. |
| AC-07 | Ditambahkan regression test minimal untuk auth fetch + rendered card count + compatibility route behavior. |
| AC-08 | Dokumentasi parity/audit log diperbarui sebelum commit. |

### Edge Cases

1. Token hilang/expired: dashboard harus fail-safe (error state manusiawi, tidak crash).
2. Role `leader`: analytics tampil, namun activity logs section tetap tersembunyi.
3. Data kosong trend/log: UI empty state tetap muncul dan tidak men-trigger error runtime.
4. Legacy URL diakses langsung (`/dashboard/monitoring`, `/qa-analyzer/input`): tetap diarahkan benar.

### Constraint Teknis

1. Arsitektur backend-first: frontend tidak bypass security backend.
2. Tidak menambah library baru tanpa kebutuhan jelas (jaga bundle/perf).
3. Semua perubahan harus minim patch, tidak overwrite file besar tanpa alasan.
4. Dokumentasi wajib update sebelum commit (AGENTS Golden Rule #2).

### Spec References

- `apps/web/src/routes/dashboard.tsx`
- `apps/web/src/components/Layout.tsx`
- `apps/web/src/router.tsx`
- `apps/web/src/hooks/useApi.ts`
- `apps/api/src/middleware/auth.ts`
- `reference-repo/app/(main)/dashboard/page.tsx`
- `reference-repo/app/(main)/dashboard/DashboardClientComponents.tsx`
- `reference-repo/app/(main)/dashboard/DashboardTrendClientLoader.tsx`

---

## Design

### Keputusan Parity

1. **Security parity didahulukan**: seluruh fetch protected di dashboard home akan dialihkan ke helper yang selalu menyertakan bearer token (reuse `fetchApi`/wrapper sejenis).
2. **Behavior parity disesuaikan legacy**: recent activity di card dashboard home dibatasi 5 item.
3. **Routing parity model kompatibilitas**: path baru tetap dipakai (`/monitoring`, `/sidak/*`) namun shortcut/redirect diselaraskan agar pengalaman legacy tidak pecah.
4. **Perf parity**: analytics panel dipisah lazy shell agar tidak memperberat initial dashboard render.

### Arsitektur Perubahan

```text
DashboardHome (apps/web/src/routes/dashboard.tsx)
  -> authorized client fetch helper (Bearer)
  -> /api/v1/sidak/dashboard/available-years
  -> /api/v1/sidak/dashboard/trend
  -> /api/v1/admin/activity-logs

UI parity layer
  -> recent logs cap = 5
  -> monitoring shortcut policy align
  -> optional extracted lazy analytics panel + skeleton

Compatibility layer
  -> router redirects tetap aktif
  -> verifikasi /qa-analyzer/* dan /dashboard/monitoring
```

### Interface Changes (Planned)

1. **Frontend helper usage**
   - Gunakan helper fetch yang sudah menambahkan header bearer (`useApi`/`fetchApi`) untuk request dashboard.
2. **Dashboard state behavior**
   - Batasi rendered recent activity menjadi 5.
3. **Analytics rendering**
   - Ekstraksi analytics ke lazy-loaded client chunk (setara konsep `DashboardTrendClientLoader`).
4. **Shortcut consistency**
   - Putuskan satu policy final: mempertahankan `/monitoring` + redirect atau kembali menunjuk `/dashboard/monitoring` pada shortcut.

### Dampak ke Modul Lain

1. `Layout` tidak perlu perubahan besar bila header parity tetap valid.
2. `router` hanya diubah jika policy shortcut/redirect perlu penyesuaian tambahan.
3. API backend tidak wajib diubah bila fix cukup di frontend auth header.

---

## Tasklist

### Ringkasan Task

| Task | Fokus | Estimasi |
| --- | --- | --- |
| T1 | Lock parity policy + baseline testcase | 0.5 hari |
| T2 | Fix auth-aware data fetching dashboard | 0.5 hari |
| T3 | Samakan behavior komponen dashboard home | 0.5 hari |
| T4 | Perf parity untuk analytics loading | 0.5 hari |
| T5 | Tambah regression tests + verification | 0.75 hari |
| T6 | Update docs & rebuild log | 0.25 hari |

### T1 - Lock Policy & Baseline

- **Files affected**
  - Modify: `plan/markdown/dashboard-post-login-legacy-parity-reaudit.md`
  - Read-only: `reference-repo/app/(main)/dashboard/*`, `apps/web/src/routes/dashboard.tsx`
- **Steps**
  - [ ] Finalisasi keputusan path shortcut monitoring (`/monitoring` vs `/dashboard/monitoring` di UI link).
  - [ ] Bekukan checklist AC-01..AC-08 sebagai Definition of Done.
  - [ ] Tetapkan scope: dashboard home pasca-login + compatibility redirects.
- **Output**
  - [ ] Baseline parity matrix disetujui.

### T2 - Fix Auth-Aware Fetch (Critical)

- **Files affected**
  - Modify: `apps/web/src/routes/dashboard.tsx`
  - Reuse: `apps/web/src/hooks/useApi.ts` (atau helper sepadan)
- **Steps**
  - [ ] Ganti semua `fetch("/api/v1/..." )` protected di dashboard ke helper yang menyertakan bearer token.
  - [ ] Pastikan error handling tetap manusiawi saat token invalid/expired.
  - [ ] Pastikan delete activity juga memakai request auth-aware.
- **Test strategy**
  - [ ] Tambah test unit/mock untuk memastikan request dashboard menyertakan Authorization header.

### T3 - Component Behavior Parity

- **Files affected**
  - Modify: `apps/web/src/routes/dashboard.tsx`
- **Steps**
  - [ ] Ubah `formattedLogs.slice(0, 6)` menjadi parity target legacy (5 item).
  - [ ] Selaraskan policy shortcut monitoring sesuai keputusan T1.
  - [ ] Verifikasi mapping role section (`showAnalytics`, `isManager`) tetap sama dengan legacy.
- **Test strategy**
  - [ ] Test render count activity card = 5 saat data > 5.

### T4 - Analytics Loading Perf Parity

- **Files affected**
  - Modify: `apps/web/src/routes/dashboard.tsx`
  - Add (opsional): `apps/web/src/routes/dashboard/components/DashboardTrendClientLoader.tsx`
  - Add (opsional): `apps/web/src/routes/dashboard/components/DashboardTrendPanel.tsx`
- **Steps**
  - [ ] Ekstrak analytics section agar bisa lazy-loaded dengan skeleton shell.
  - [ ] Pastikan perilaku filter tahun/range/service tidak berubah.
  - [ ] Validasi tidak ada regresi visual besar.
- **Test strategy**
  - [ ] Snapshot/behavior test untuk skeleton + panel render role-based.

### T5 - Verification & Regression

- **Files affected**
  - Add/Modify: `apps/web/src/__tests__/dashboard-post-login-parity.test.tsx` (new)
  - Add/Modify: test helper/mocks terkait auth fetch
- **Steps**
  - [ ] Tambah test parity minimum: auth header, activity count, role-gated sections.
  - [ ] Tambah test compatibility route redirect (`/dashboard/monitoring`, `/qa-analyzer/*`) jika belum ada.
  - [ ] Jalankan lint/test/build untuk web workspace.
- **Validation commands**
  - [ ] `pnpm --filter @trainers/web test`
  - [ ] `pnpm --filter @trainers/web lint`
  - [ ] `pnpm --filter @trainers/web build`

### T6 - Documentation Update

- **Files affected**
  - Modify: `docs/rebuild-logs/phase-<next>-dashboard-post-login-parity.md` (new)
  - Modify: `docs/checklist-audit-trainers-superapp.md` (jika checklist berubah)
  - Modify: `docs/modules.md` (jika behavior route/path diperbarui)
- **Steps**
  - [ ] Dokumentasikan gap, keputusan, implementasi, hasil test.
  - [ ] Catat keputusan compatibility route final.

### Dependency

1. T2 wajib selesai sebelum T5 (tanpa auth fix test parity akan gagal/semu).
2. T1 policy shortcut harus diputuskan sebelum T3.
3. T4 bisa paralel parsial setelah T2 stabil.

### Risk Register

| Risk | Dampak | Mitigasi |
| --- | --- | --- |
| Refactor fetch memicu regresi state loading/error | Dashboard blank/UX regress | Uji per-step + test mock API failure |
| Lazy split analytics merusak interaksi filter | QA trend panel tidak responsif | Ekstrak komponen dengan props kontrak ketat + regression test |
| Perubahan shortcut membingungkan user | Navigasi tidak konsisten | Tegaskan policy di docs + pertahankan redirect compatibility |
| Test baru flaky karena async fetch | CI noise | Gunakan mock fetch deterministik + waitFor stabil |

### Rollback Plan

1. Revert perubahan `dashboard.tsx` ke commit sebelumnya jika auth refactor menyebabkan outage.
2. Jika lazy split analytics bermasalah, fallback ke render inline sambil mempertahankan auth fix.
3. Pertahankan redirect legacy di `router.tsx` agar jalur lama tetap aman selama rollback.

### Definition of Done

- [ ] AC-01..AC-08 terpenuhi.
- [ ] Web test/lint/build lolos.
- [ ] Verifikasi manual dashboard login (trainer + leader + admin) lolos.
- [ ] Dokumentasi parity/rebuild log sudah ter-update.

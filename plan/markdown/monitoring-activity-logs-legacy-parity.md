# Monitoring & Activity Logs Legacy Parity Plan

> **Status: EXECUTED** (2026-05-24)  
> All 6 tasks completed. See `docs/rebuild-logs/phase-33-monitoring-activity-logs-legacy-parity.md`

## Requirement

### Tujuan

Memastikan fitur **Monitoring** dan **Activity Logs** di monorepo Vite memiliki fungsi yang setara dengan `reference-repo` (legacy), khususnya untuk:

1. Scope akses role (trainer/leader/admin/agent)
2. Parity data dan UX utama
3. Ketepatan boundary waktu bulanan (WIB/`Asia/Jakarta`)
4. Cakupan event audit trail lintas modul

### Audit Snapshot (2026-05-24)

| Area | Legacy (`reference-repo`) | Current (`apps/*`) | Status |
| --- | --- | --- | --- |
| Monitoring role guard | `trainer/leader/admin` bisa akses monitoring, pricing edit hanya `trainer/admin` | Route `/monitoring` tidak pakai `beforeLoad` role guard; API aggregation hanya `admin/trainer`; sidebar menampilkan monitoring untuk `leader` | **Belum parity** |
| Monitoring tab structure | 3 tab: `Riwayat Simulasi`, `Penggunaan Token`, `Harga & Kurs` | Hanya 2 tab: `Penggunaan Token`, `Harga & Kurs` | **Belum parity** |
| Monitoring history lintas modul | Ada unified history (`ketik_history`, `pdkt_history`, `telefun_history`, `results.telefun`) + modal detail | Belum ada equivalent unified history di halaman monitoring | **Belum parity** |
| Usage boundary bulanan | WIB month boundary | Aggregation pakai UTC boundary langsung | **Belum parity** |
| Usage filter/module breakdown | Ada filter module + breakdown per model/per user | UI belum expose filter module + breakdown table | **Belum parity** |
| Activity logs page capability | Search/filter/delete + feed terbaru 500 row | Search/filter/pagination/csv/delete + feed 500 row | **Sudah/lebih baik** |
| Activity logs ingestion coverage | Banyak mutasi modul (SIDAK/Profiler/User mgmt, dll) menulis ke `activity_logs` | Logging dominan di admin user mgmt + `upload_sidak_batch`; mutasi profiler/sidak lain belum konsisten | **Partial parity** |
| Docs parity | Dokumentasi menjelaskan monitoring 3 tab + leader read-only | Implementasi runtime belum sesuai narasi docs | **Belum parity** |

### Acceptance Criteria

| ID | Kriteria |
| --- | --- |
| AC-01 | Route `/monitoring` hanya bisa diakses role `trainer`, `leader`, `admin`; `agent` ditolak fail-closed. |
| AC-02 | `leader` dapat melihat monitoring history + usage lintas akun tanpa akses editor pricing/kurs. |
| AC-03 | Monitoring memiliki 3 tab legacy parity: `Riwayat Simulasi`, `Penggunaan Token`, `Harga & Kurs`. |
| AC-04 | Aggregation bulanan menggunakan WIB boundary (`Asia/Jakarta`) untuk query lintas akun. |
| AC-05 | Tab usage mendukung filter `bulan`, `tahun`, `module`, search akun, dan breakdown per model. |
| AC-06 | Tab riwayat menampilkan history lintas modul (`ketik`, `pdkt`, `telefun`) dengan detail view. |
| AC-07 | Activity logs tetap trainer/admin only, tetap memiliki search/filter/export/delete/pagination. |
| AC-08 | Mutasi penting di SIDAK + Profiler + Admin tercatat konsisten ke `activity_logs` dengan action/module/type yang terstandar. |
| AC-09 | Test coverage backend+frontend ditambah untuk role matrix, WIB boundary, parity tabs, dan logging coverage. |
| AC-10 | Dokumen `docs/MONITORING_TOKEN_USAGE_BILLING.md`, `docs/modules.md`, `docs/auth-rbac.md`, dan rebuild log sinkron dengan implementasi aktual. |

### Edge Cases

1. `leader` membuka `/monitoring`: request pricing/billing tidak boleh ditembak dari client.
2. Perpindahan bulan WIB vs UTC (akhir bulan jam 17:00 UTC): agregasi harus tetap akurat di WIB.
3. User terfilter hilang dari dataset usage: breakdown selection harus auto-reset (`Semua Pengguna`).
4. Riwayat telefun duplikat (`telefun_history` vs `results`): perlu dedup signature stabil.
5. Jika profile lookup gagal, fallback label user harus aman (`Unknown`/email prefix) tanpa crash UI.

### Constraint Teknis

1. Ikuti arsitektur backend-first monorepo (`apps/api` sebagai source of truth data lintas akun).
2. Hono route harus tetap memakai `requireRole` sesuai matrix akses.
3. Jangan query data sensitif langsung dari frontend.
4. Hindari regresi performa: hindari static import berat dan jaga query bounded (`limit` + filter).
5. Semua perubahan behavior wajib update docs sebelum commit.

### Spec References

- `apps/web/src/router.tsx`
- `apps/web/src/routes/monitoring.tsx`
- `apps/web/src/routes/dashboard/activities.tsx`
- `apps/api/src/routes/ai.ts`
- `apps/api/src/routes/admin.ts`
- `apps/api/src/services/admin-service.ts`
- `apps/api/src/services/sidak-service.ts`
- `apps/api/src/services/profiler-service.ts`
- `reference-repo/app/(main)/dashboard/monitoring/*`
- `reference-repo/app/(main)/dashboard/activities/*`
- `docs/MONITORING_TOKEN_USAGE_BILLING.md`
- `docs/modules.md`
- `docs/auth-rbac.md`

---

## Design

### Arsitektur Solusi

1. **Monitoring parity dipulihkan di satu surface `/monitoring`** dengan 3 tab:
   - `Riwayat Simulasi` (read-only `trainer/leader/admin`)
   - `Penggunaan Token` (read-only `trainer/leader/admin`)
   - `Harga & Kurs` (edit `trainer/admin` only)
2. **API layer dipisah jelas**:
   - Endpoint history monitoring untuk unified data lintas modul
   - Endpoint usage aggregation WIB + filter module
   - Endpoint pricing/billing tetap edit-gated
3. **Activity logging distandardisasi** lewat helper backend bersama agar mutasi penting di SIDAK/Profiler/Admin konsisten menulis audit trail.

### Data Flow (Target)

```text
Web /monitoring
  -> GET /api/v1/ai/monitoring/history        (trainer/leader/admin)
  -> GET /api/v1/ai/monitoring/aggregation    (trainer/leader/admin, WIB boundary)
  -> GET /api/v1/ai/monitoring/pricing        (trainer/admin only)
  -> GET /api/v1/ai/monitoring/billing        (trainer/admin only)
  -> PUT/POST pricing & billing               (trainer/admin only)

Mutasi modul (SIDAK/Profiler/Admin)
  -> call shared logActivity(...)
  -> insert row ke activity_logs (action/module/type/user metadata)
  -> tampil di /dashboard/activities
```

### Component/Route Tree Changes

1. `apps/web/src/router.tsx`
   - tambah `beforeLoad: requireRole(["trainer", "leader", "admin"])` pada `/monitoring`.
2. `apps/web/src/routes/monitoring.tsx`
   - ubah state tab menjadi 3 tab (`history|usage|pricing`).
   - tambah UI history table + modal detail.
   - tambah filter module + breakdown per model.
   - gate tab pricing berdasarkan role profile.
3. `apps/web/src/components/Layout.tsx`
   - pastikan visibilitas menu monitoring selaras dengan runtime behavior.

### API/Service Interface Changes

1. `apps/api/src/routes/ai.ts`
   - `GET /monitoring/aggregation`: role jadi `admin|trainer|leader`, WIB boundary.
   - tambah `GET /monitoring/history` untuk unified history monitoring.
   - pastikan endpoint pricing/billing tidak diakses oleh `leader`.
2. Tambah util boundary waktu WIB (mis. `apps/api/src/lib/timezone.ts`) agar reusable dan tidak duplikasi.
3. Tambah shared logger service (mis. `apps/api/src/services/activity-log-service.ts`) dan pakai lintas service.

### Activity Logging Coverage Matrix (Target Minimum)

| Domain | Event minimum yang wajib tercatat |
| --- | --- |
| Admin | status role delete reset password access-approval mutasi |
| SIDAK | create/delete period, create/delete indicator, create/update/delete temuan, publish/supersede rule version, report archive mutate |
| Profiler | create/rename/delete folder, create/update/delete peserta, copy/move/reorder peserta, create/delete team |

### Keputusan Teknis

1. **Fail-closed authz**: role mismatch harus ditolak di route guard dan API.
2. **WIB sebagai source of truth** untuk monthly monitoring.
3. **No schema change by default** (gunakan tabel existing), kecuali ditemukan kebutuhan metadata tambahan audit.
4. **Progressive enhancement**: pertahankan kelebihan saat ini (pagination + CSV di activity logs) selama tidak merusak parity.

---

## Tasklist

### Ringkasan Eksekusi

| Task | Fokus | Output |
| --- | --- | --- |
| T1 | Spec lock + parity checklist | Checklist parity final dan fixture test disepakati |
| T2 | API monitoring parity | Endpoint monitoring setara legacy (role + WIB + history) |
| T3 | Web monitoring parity | UI 3 tab + filter module + breakdown + role gate pricing |
| T4 | Activity logging parity | Cakupan logging mutasi SIDAK/Profiler/Admin ditingkatkan |
| T5 | Test & verification | Regression tests + lint/build/test pass |
| T6 | Docs update | Dokumen sinkron dengan runtime |

### T1 - Spec Lock & Baseline Freeze

- **Files affected**
  - Modify: `plan/markdown/monitoring-activity-logs-legacy-parity.md` (file ini)
  - Read-only reference: `reference-repo/app/(main)/dashboard/monitoring/*`, `reference-repo/app/(main)/dashboard/activities/*`
- **Steps**
  - [ ] Finalisasi parity checklist AC-01..AC-10 sebagai Definition of Done.
  - [ ] Buat daftar test-case role matrix (`trainer|leader|admin|agent`).
  - [ ] Bekukan baseline mismatch (route guard, WIB, 3-tab, logging coverage) sebelum coding.
- **Validation**
  - [ ] Checklist parity disetujui user sebelum implementasi.

### T2 - API Monitoring Parity

- **Files affected**
  - Modify: `apps/api/src/routes/ai.ts`
  - Add: `apps/api/src/lib/timezone.ts` (atau util sejenis)
  - Add: `apps/api/src/services/monitoring-history-service.ts` (opsional, jika ekstraksi logic diperlukan)
  - Test: `apps/api/src/__tests__/ai-monitoring-parity.test.ts` (new)
- **Steps**
  - [ ] Refactor boundary waktu aggregation ke WIB util.
  - [ ] Ubah role gate aggregation agar `leader` bisa read.
  - [ ] Tambah endpoint history monitoring unified lintas modul.
  - [ ] Pastikan pricing/billing tetap write-gated untuk `trainer/admin`.
  - [ ] Tambah test API untuk role matrix + WIB boundary + response shape.
- **Validation commands**
  - [ ] `pnpm --filter @trainers/api test`
  - [ ] `pnpm --filter @trainers/api lint` (atau root lint jika filter tidak tersedia)

### T3 - Web Monitoring Parity

- **Files affected**
  - Modify: `apps/web/src/router.tsx`
  - Modify: `apps/web/src/routes/monitoring.tsx`
  - Modify: `apps/web/src/components/Layout.tsx` (jika perlu align visibilitas nav)
  - Test: `apps/web/src/__tests__/monitoring-legacy-parity.test.tsx` (new)
- **Steps**
  - [ ] Tambah role guard `/monitoring` (`trainer|leader|admin`).
  - [ ] Implement tab `Riwayat Simulasi` setara legacy (table + detail modal).
  - [ ] Tambah filter module di usage tab.
  - [ ] Tambah breakdown table per model.
  - [ ] Sembunyikan tab pricing untuk `leader`.
  - [ ] Pastikan `leader` tidak trigger fetch pricing/billing.
  - [ ] Tambah test render tab-by-role dan fetch behavior.
- **Validation commands**
  - [ ] `pnpm --filter @trainers/web test`
  - [ ] `pnpm --filter @trainers/web lint`

### T4 - Activity Logging Coverage Parity

- **Files affected**
  - Add/Modify: `apps/api/src/services/activity-log-service.ts` (shared helper)
  - Modify: `apps/api/src/services/admin-service.ts`
  - Modify: `apps/api/src/services/sidak-service.ts`
  - Modify: `apps/api/src/services/profiler-service.ts`
  - Test: `apps/api/src/__tests__/activity-logging-parity.test.ts` (new)
- **Steps**
  - [ ] Standarisasi helper logging (action/module/type/user context).
  - [ ] Instrument mutasi penting SIDAK & Profiler yang saat ini belum log.
  - [ ] Pertahankan event yang sudah ada (`upload_sidak_batch`, user mgmt actions).
  - [ ] Tambah test untuk memastikan event utama masuk `activity_logs`.
- **Validation commands**
  - [ ] `pnpm --filter @trainers/api test`

### T5 - End-to-End Verification

- **Files affected**
  - Test files dari T2-T4
- **Steps**
  - [ ] Jalankan suite test API + web.
  - [ ] Jalankan lint root.
  - [ ] Jalankan build root untuk cek type/runtime integration.
  - [ ] Jalankan `git diff --check` untuk whitespace hygiene.
- **Validation commands**
  - [ ] `pnpm test`
  - [ ] `pnpm lint`
  - [ ] `pnpm build`
  - [ ] `git diff --check`

### T6 - Dokumentasi & Rebuild Log

- **Files affected**
  - Modify: `docs/MONITORING_TOKEN_USAGE_BILLING.md`
  - Modify: `docs/modules.md`
  - Modify: `docs/auth-rbac.md`
  - Add: `docs/rebuild-logs/phase-33-monitoring-activity-logs-legacy-parity.md` (atau phase berikutnya sesuai urutan aktif)
- **Steps**
  - [ ] Sinkronkan narasi route (`/monitoring`), tab behavior, role matrix, dan WIB boundary.
  - [ ] Tambahkan catatan parity dan bukti test.
  - [ ] Pastikan dokumen ramah pembaca non-teknis.

### Timeline Estimasi

| Batch | Estimasi |
| --- | --- |
| T1 | 0.5 hari |
| T2 | 1 hari |
| T3 | 1 - 1.5 hari |
| T4 | 1 - 1.5 hari |
| T5 | 0.5 hari |
| T6 | 0.5 hari |
| **Total** | **4.5 - 5.5 hari kerja** |

### Dependencies

1. Baseline parity checklist disetujui.
2. Tidak ada perubahan schema blocking di Supabase untuk `activity_logs` dan `ai_usage_logs`.
3. Test environment memiliki seed minimum untuk ketik/pdkt/telefun history.

### Risk Register

| Risk | Dampak | Mitigasi |
| --- | --- | --- |
| Query history lintas modul berat | Latensi monitoring naik | Gunakan limit + ordering + cache ringan + pagination bila diperlukan |
| Role mismatch antar UI/API | Leader melihat error 403 di UI | Terapkan contract test role matrix backend dan UI tab gating |
| Boundary WIB salah implementasi | Rekap bulanan tidak akurat | Tambah unit test boundary end-of-month WIB vs UTC |
| Logging noise berlebihan | Activity logs sulit dibaca | Standarisasi action/type + naming convention |
| Docs kembali drift | Operasional bingung | Wajib update docs dalam PR yang sama + checklist release |

### Rollback Plan

1. Revert endpoint baru monitoring history dan kembalikan UI monitoring ke state stabil terakhir.
2. Jika logging baru menimbulkan noise/error, rollback ke helper logging lama untuk service terdampak.
3. Revert docs ke versi sebelum parity rollout jika implementasi dibatalkan.
4. Pastikan rollback tidak menghapus data historis `activity_logs` yang sudah terlanjur tertulis.


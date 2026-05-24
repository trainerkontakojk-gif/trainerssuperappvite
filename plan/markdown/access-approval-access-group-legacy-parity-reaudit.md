# Access Approval & Access Group Legacy Parity Re-Audit

> **Status: EXECUTED** (2026-05-24) — Commit `d4643c6`  
> All 6 steps completed. See `docs/rebuild-logs/phase-33-access-approval-group-parity-hardening.md`

## Requirement

### Audit Snapshot (2026-05-24)

Status saat ini: **partial** (belum 100% sama legacy secara fungsi + hardening contract).

| Area | Kondisi Saat Ini (Vite) | Referensi Legacy | Gap Utama |
| --- | --- | --- | --- |
| Access Groups - guided builder | Sudah ada flow Team / Service / Specific Agent + mapping ke `tim` / `service_type` / `peserta_id`. | `reference-repo/app/(main)/dashboard/access-groups/AccessGroupsClient.tsx` | Kontrak legacy mewajibkan pilih Team dulu sebelum pilih Name; implementasi saat ini masih mengizinkan lintas-team langsung (opsi `Semua Team`). |
| Access Approval - approve/reject/revoke/reassign | Pending/approved tab, assign group, approve/reject/revoke/reassign sudah berjalan. | `reference-repo/app/(main)/dashboard/access-approval/AccessApprovalClient.tsx` + `reference-repo/app/actions/leader-access.ts` | Hardening parity belum penuh di backend reassign (missing re-check status tepat sebelum mutasi links). |
| Reassign rollback safety | Sudah simpan link lama, delete, insert baru, rollback saat insert gagal. | `reference-repo/app/actions/leader-access.ts` | Legacy juga punya re-verification status `approved` tepat sebelum delete; belum ada di service Vite. |
| Regression coverage | Belum ada test spesifik parity contract untuk access group/approval di `apps/web` dan `apps/api`. | `reference-repo/tests/access-control/*` | Blind spot untuk mencegah drift parity berikutnya. |

### Goal

1. Menutup gap parity tersisa agar fungsi `dashboard/access-groups` dan `dashboard/access-approval` setara dengan legacy.
2. Menjaga prinsip fail-closed untuk seluruh flow approve/reassign.
3. Menambah regression tests agar parity tidak regress pada perubahan berikutnya.

### Acceptance Criteria

| ID | Criteria | Expected Outcome |
| --- | --- | --- |
| AC-01 | Guided builder Name flow | Saat pilih mode Name/Specific Agent, user wajib pilih Team dulu sebelum agent dropdown aktif. |
| AC-02 | Reassign hardening parity | Reassign melakukan re-verifikasi request tetap `approved` sebelum delete old links. |
| AC-03 | Reassign audit update safety | Update audit (`reviewed_by`) tidak menulis row non-approved (fail-closed condition). |
| AC-04 | API contract parity | Error message dan validasi approve/reassign tetap selaras dengan behavior legacy. |
| AC-05 | Regression tests | Ada test API + web contract untuk access group builder dan access approval hardening path. |

### Edge Cases

- Request berubah status dari `approved` ke `revoked` di tengah flow reassign.
- Access group nonaktif ikut terkirim saat approve/reassign.
- Approver mencoba approve/reassign request miliknya sendiri.
- Mode Specific Agent dipilih tanpa Team.

### Technical Constraints

- Tetap backend-first (`apps/api` sebagai sumber otoritas mutasi).
- Tidak menambah dependency baru.
- Tetap gunakan Hono + Zod validation yang sudah ada.
- Tidak mengubah schema DB pada fase ini (code-level hardening + tests only).

### Context7 References (Required by AGENTS)

Target referensi saat eksekusi implementasi:

1. `/supabase/supabase` - best practice transaction-like mutation, defensive update flow, dan auth/admin constraints.
2. `/websites/hono_dev` - route guard + validator composition pada grouped admin routes.

Catatan: pada sesi audit ini tool `context7` belum tersedia di tool surface Codex, jadi implementasi nanti wajib re-run lookup Context7 sebelum coding.

## Design

### Arsitektur yang Disentuh

```text
apps/web/src/routes/dashboard/access-groups.tsx
apps/web/src/routes/dashboard/access-approval.tsx
        -> calls
apps/api/src/routes/admin.ts
        -> calls
apps/api/src/services/admin-service.ts
        -> Supabase tables:
           leader_access_requests
           leader_access_request_groups
           access_groups
           access_group_items
```

### Perubahan Desain

| Surface | Design Change |
| --- | --- |
| `access-groups.tsx` | Ubah flow mode `peserta_id`: dropdown agent disabled sampai Team dipilih; hapus path lintas-team langsung saat mode ini aktif. |
| `admin-service.ts` reassign flow | Tambah re-check `status=approved` sesaat sebelum delete links; jika gagal, abort mutasi. |
| `admin-service.ts` audit update | Batasi update `reviewed_by` dengan guard status approved agar tidak menulis row stale. |
| Test API | Tambah test untuk reassign re-check status + rollback insert failure + self-reassign guard. |
| Test Web | Tambah contract test untuk mode Specific Agent yang mewajibkan team selection dulu. |

### Verifikasi Strategy

- API: `pnpm --filter @trainers/api test -- admin-service`
- Web: `pnpm --filter @trainers/web test -- access-groups access-approval`
- Full guard: `pnpm test`, `pnpm build`, `git diff --check`

## Tasklist

### Implementation Steps

| Step | Task | Files Affected | Output |
| --- | --- | --- | --- |
| 1 | Hardening reassign parity (`recheck approved` + guarded audit update) | `apps/api/src/services/admin-service.ts` | Flow reassign fail-closed setara legacy contract. |
| 2 | Pastikan route/admin tetap tipis (tanpa logic baru di route layer) | `apps/api/src/routes/admin.ts` (jika perlu minor alignment) | Service-centric mutation tetap terjaga. |
| 3 | Lock guided builder Name flow agar wajib pilih Team dulu | `apps/web/src/routes/dashboard/access-groups.tsx` | UI contract parity dengan legacy scope-builder tests. |
| 4 | Tambah test API parity hardening | `apps/api/src/__tests__/admin-service.test.ts` (atau file test baru) | Bukti otomatis untuk rollback/recheck/self-guard path. |
| 5 | Tambah test Web contract parity | `apps/web/src/__tests__/...` (access-groups/access-approval contract) | Bukti UI contract tidak drift. |
| 6 | Re-run lint/test/build + update rebuild log | `docs/rebuild-logs/phase-31-dashboard-user-management-legacy-parity.md` atau log fase baru | Audit trail parity closure. |

### Timeline Estimasi

- Step 1-3: 0.5 hari
- Step 4-5: 0.5 hari
- Step 6: 0.25 hari

Total: 1.25 hari kerja.

### Dependency

- Data fixture test untuk `leader_access_requests` + `leader_access_request_groups`.
- Konfirmasi final behavior yang diinginkan untuk agent selection lintas team (default: ikuti strict legacy).

### Risk Register

| Risk | Dampak | Mitigasi |
| --- | --- | --- |
| Reassign hardening terlalu ketat | Admin gagal save saat race condition tinggi | Return error manusiawi + user retry path. |
| Builder strict team-first dianggap menambah friction | UX berubah dibanding perilaku sekarang | Komunikasikan sebagai parity requirement + tambahkan helper copy di UI. |
| Test mock Supabase tidak cukup realistis | False positive test | Pisahkan unit test branch per query chain penting (recheck/delete/insert). |

### Rollback Plan

1. Jika Step 1 menimbulkan regresi mutasi, rollback hanya block recheck baru dan pertahankan rollback-insert lama.
2. Jika Step 3 ditolak stakeholder, flag toggle behavior team-first via small UI gate sambil diskusi parity final.
3. Simpan semua perubahan dalam commit terpisah per surface (API vs Web vs tests) agar rollback granular.


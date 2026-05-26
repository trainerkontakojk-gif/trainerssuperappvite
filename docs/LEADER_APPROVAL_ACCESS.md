# Leader Approval-Based Data Access

## Overview

Role `leader` sekarang menggunakan approval-based access untuk modul KTP (`/profiler`) dan SIDAK (`/sidak`). Admin dan trainer tetap memiliki akses penuh. Leader wajib mendapatkan approval per module sebelum dapat melihat data, dan semua query difilter berdasarkan access group yang disetujui.

Prinsip: **fail closed** — scope kosong, status tidak jelas, atau filter gagal menghasilkan data kosong/blocked, bukan fallback semua data.

## Architecture

### Database Tables

| Table                          | Purpose                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| `access_groups`                | Definisi access group (nama, deskripsi, scope_type, is_active)                        |
| `access_group_items`           | Item scope individual (field_name: `peserta_id`, `batch_name`, `tim`, `service_type`) |
| `leader_access_requests`       | Request approval per leader per module                                                |
| `leader_access_request_groups` | Join table: satu approved request bisa memiliki >1 access group                       |

### Scope Semantics (V1)

Access group items adalah **union rules** — peserta masuk scope jika memenuhi minimal satu item field:

- `peserta_id`: match by UUID
- `batch_name`: match by batch/folder name
- `tim`: match by team name
- `service_type`: match by service type (HANYA untuk SIDAK; KTP mengabaikan field ini)

### Access Group Builder UI

Halaman `/dashboard/access-groups` memakai guided scope builder agar Admin/Trainer tidak perlu mengetik `field_name` dan `field_value` manual.

Builder menyediakan 3 jalur:

| Mode       | UI Flow                                                   | Stored Item                                                    |
| ---------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| By Team    | Pilih team dari data `profiler_peserta.tim` yang tersedia | `field_name = tim`, `field_value = selected team`              |
| By Service | Pilih service dari daftar SIDAK valid                     | `field_name = service_type`, `field_value = selected service`  |
| By Name    | Pilih Team dulu, lalu pilih Name/agent dari team tersebut | `field_name = peserta_id`, `field_value = selected peserta id` |

### Modules

| Module ID | Label               | KTP-Relevant Fields         | SIDAK-Relevant Fields   |
| --------- | ------------------- | --------------------------- | ----------------------- |
| `ktp`     | KTP / Profiler      | peserta_id, batch_name, tim | —                       |
| `sidak`   | SIDAK / QA Analyzer | peserta_id, batch_name, tim | + service_type          |
| `all`     | Semua Modul         | Same as module-specific     | Same as module-specific |

### Access Status Flow

```
Leader opens KTP/SIDAK page
  |
  +-- No request exists --> status: "none" --> show "Ajukan Akses" button
  |
  +-- Request pending --> status: "pending" --> show "Menunggu Approval"
  |
  +-- Request rejected --> status: "rejected" --> show "Ditolak"
  |
  +-- Request revoked --> status: "revoked" --> show "Dicabut" with "Ajukan Akses Lagi"
  |
  +-- Request approved --> resolve scope filter --> query data with scope
       |
       +-- Scope empty (no active items) --> data kosong
       +-- Scope has items --> filter data by union of all items
```

### Admin/Trainer Approval Flow

1. Admin/trainer navigates to `/dashboard/access-approval`
2. See pending requests tab: leader name, module, date, select access groups, approve/reject
3. See approved tab: leader name, module, access groups, date, reassign access groups, revoke button
4. Approve requires selecting minimal 1 active access group
5. Reassign allows changing access groups for already-approved requests without revoking
6. Manage access groups at `/dashboard/access-groups`

### RLS Policies

- `leader_access_requests`: Leader only sees and inserts own pending requests; Admin/trainer can manage all
- `access_groups` / `access_group_items`: Admin/trainer only (leader cannot see these pages or data)

### Backend Scope Enforcers

| Function | File | Module | Used In |
|----------|------|--------|---------|
| `getAccessibleAgentIds(userId, role)` | `apps/api/src/services/sidak-service.ts:27` | SIDAK | All SIDAK read routes |
| `getAccessiblePesertaIds(userId, role)` | `apps/api/src/services/profiler-service.ts:12` | KTP | All Profiler read routes |

Both functions follow the same logic:
1. Admin/Trainer → returns `null` (no filter, full access)
2. Agent → returns own peserta ID or empty
3. Leader → delegates to `getApprovedRequestIds(userId, module)` from shared helper, then resolves scope from approved `leader_access_request_groups` + `access_group_items`; returns `string[]` or `[]` (fail-closed)
4. Other roles → returns `[]` (deny)

### Shared Helper: Approal Resolution

**File:** `apps/api/src/services/leader-access-service.ts`

Centralized logic for resolving effective approval status and approved request IDs:

| Function | Purpose |
|----------|---------|
| `fetchLeaderModuleRequests(userId, module)` | Queries rows for target module + `"all"`, ordered by `updated_at DESC, created_at DESC` |
| `resolveEffectiveModuleStatus(rows, module)` | Pure function: returns effective status given all rows |
| `resolveEffectiveModuleCreatedAt(rows, module, status)` | Returns `created_at` of the effective status row |
| `getApprovedRequestIds(userId, module)` | Returns all approved request IDs for scope resolution (module + `"all"`) |

**Precedence rules** (highest to lowest):
1. `approved` (any row for target module or `"all"`)
2. `pending` (any row for target module or `"all"`)
3. Most recent terminal status (`revoked` / `rejected`) for target module or `"all"`
4. `none` (no relevant rows)

This ensures historical override works correctly: `revoked → approved` returns `approved`, and `module = "all"` covers both `ktp` and `sidak`.

**KTP-specific**: `service_type` items are silently ignored in scope resolution (KTP has no service type column).

### API: Access Status Endpoint

`GET /v1/me/access-status` — Returns per-module access status for the current user.

```json
{
  "success": true,
  "data": {
    "ktp": { "status": "approved", "module": "ktp", "created_at": "2025-01-01" },
    "sidak": { "status": "none", "module": "sidak", "created_at": null }
  }
}
```

Status values: `none`, `pending`, `approved`, `rejected`, `revoked`.

Module `all` in `leader_access_requests` counts as approved for both `ktp` and `sidak`.

### Frontend: LeaderAccessGate Component

`apps/web/src/components/LeaderAccessGate.tsx` wraps module landing pages:

- Admin/Trainer/Agent → renders children immediately
- Leader with `approved` → renders children
- Leader with other status → shows status card with submit button
- Loading → spinner

Used in `apps/web/src/routes/profiler/index.tsx` and `apps/web/src/routes/sidak/index.tsx`.

### Frontend: Route Guard (Subroute Protection)

The `requireLeaderModuleApproval` guard in `apps/web/src/router.tsx:441` protects SIDAK and KTP subroutes from deep-link bypass. It wraps `requireRole` logic with an additional access-status check for leaders:

- Admin/Trainer → passes immediately (no approval check)
- Leader with `approved` access status for the target module → passes
- Leader with non-approved status → redirected to the module landing page (`/sidak` or `/profiler`)

**Protected subroutes:**

| Module | Routes |
|--------|--------|
| SIDAK | `/sidak/dashboard`, `/sidak/ranking`, `/sidak/agents`, `/sidak/agents/$id` |
| KTP | `/profiler/table`, `/profiler/slides`, `/profiler/analytics`, `/profiler/export`, `/profiler/add`, `/profiler/import`, `/profiler/teams` |

**Landing pages** (`/sidak`, `/profiler`) are intentionally NOT guarded — they serve as the UX surface where leaders see their access status and CTA buttons.

### Frontend: Access Status Refetch

`useAccessStatus()` in `apps/web/src/hooks/useAccessStatus.ts` refetches on:
1. Mount (initial load)
2. After submitting a request
3. `window.focus` event
4. `document.visibilitychange` → `visible`

This ensures cross-session approval changes are reflected without requiring a full page reload.

Leader submits request via Supabase client RLS INSERT into `leader_access_requests` — no backend API endpoint needed (RLS enforces validation).

### Security: Fail-Closed

- Leader dengan scope kosong → data kosong (tidak fallback ke semua data)
- Leader dengan status tidak approved → blocked (tidak bisa fetch data modul)
- Access group nonaktif → tidak dihitung dalam scope
- Module "unknown" → scope kosong
- Role tidak dikenal → default deny

### Manual QA Checklist

1. Leader with no request opens KTP and SIDAK → sees access request status page, no data.
2. Leader submits request → duplicate pending request is not created.
3. Pending Leader opens KTP/SIDAK → sees "Menunggu Approval", no data.
4. Admin/trainer approves with one active access group → Leader sees only participants/agents in that group.
5. Admin/trainer attempts to approve with inactive/invalid group → request is rejected.
6. Admin/trainer attempts to approve own request → request is rejected.
7. Leader opens out-of-scope KTP/SIDAK detail → data is not returned.
8. Admin/trainer revokes access → Leader returns to blocked status.
9. Admin/trainer opens KTP/SIDAK → full data remains visible.
10. Leader approved for only one module → the other module remains blocked.
11. Admin/trainer reassigns access groups on approved request → Leader scope updates immediately.
12. Leader with historical revoked row + newer approved row → status shows approved (precedence override).
13. Leader with `module = "all"` approval → has access to both KTP and SIDAK, scope resolver works for both.
14. Leader non-approved deep-links to `/sidak/dashboard` or `/profiler/table` → redirected to landing page.
15. Leader re-opens blocked tab → status refetches and reflects latest approval/revoke.

### Regression Commands

```bash
pnpm lint
pnpm test
pnpm --filter @trainers/api test
git diff --check
```

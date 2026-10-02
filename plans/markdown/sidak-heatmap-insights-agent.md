# Heatmap SIDAK — Satuan per-Tiket, Insight, dan Heatmap per-Agent

- **Status:** Fase 1, 2, 2b, 3, 4, 5, 6 diimplementasikan (2026-10-02). Bukti: `sidak-temuan-dates-api.spec.ts` "Heatmap agregasi" **45 hijau** (per-tiket, `agent_id`, scoping leader, validasi, paging, RLS JWT), `sidak-heatmap.spec.ts` **17 hijau** (insight, toggle satuan, leader UI), `sidak-agent-heatmap.spec.ts` **3 hijau** (tab agent), regresi detail agent **15 hijau**, integrasi heatmap **5 hijau**, typecheck web/api/types **0 error**. RED terbukti untuk Fase 2 (4 gagal bermakna) dan Fase 4/2b (UI). Belum commit/push — menunggu semua fase selesai sesuai permintaan.
- **Tanggal:** 2026-10-02.
- **Risk lane:** Lane D — mengubah kontrak API publik (`GET /api/v1/sidak/heatmap`) dan access control.
- **Keputusan pengguna (2026-10-02):** (1) lanjut satuan per-tiket meski requirement lama mengunci per-parameter; (2) heatmap per-agent lewat API (Opsi B); (3) insight lebih lengkap; (4) **leader diizinkan, ter-scope ke tim-nya**.
- **Baseline:** `498ffa6`.
- **Prasyarat:** Docker/OrbStack + Supabase lokal disposable hidup. Terbukti hidup saat implementasi.

## Requirement

### Keputusan baru yang mengesampingkan sebagian requirement lama

Requirement lama (lihat `sidak-heatmap.md`) berbunyi *"Satu tiket dengan tiga parameter = tiga temuan"* dan *"jangan deduplikasi nomor tiket"*. Pengguna secara eksplisit menyetujui perubahan berikut:

| Aspek | Ketentuan baru |
| --- | --- |
| Satuan hitung | Ada pilihan **Parameter** (perilaku lama, 1 baris countable = 1 temuan) dan **Tiket** (distinct `no_tiket` per hari). Default tetap **Parameter** agar perilaku lama tidak berubah tanpa niat. |
| Tiket tanpa nomor | `no_tiket IS NULL` tetap dihitung **per baris** (tidak bisa dikelompokkan), dan itu didokumentasikan. |
| Tiket lintas hari | Tiket yang barisnya jatuh di dua tanggal dihitung **sekali di tiap tanggal** — tanggal tidak boleh digabung. |
| Heatmap per-agent | `GET /api/v1/sidak/heatmap` menerima `agent_id`, dan halaman `/sidak/agents/$id` menampilkan heatmap agent tersebut. |
| Akses leader | Heatmap dibuka untuk **leader**, tetapi **ter-scope ke tim-nya sendiri** (lihat Design): leader hanya melihat agent yang ada di `getLeaderScopeSnapshot(userId, "sidak").pesertaIds`, dan `service_type` dibatasi `allowedServices` bila `serviceTypeLocked`. |
| Insight | Halaman heatmap (dan heatmap agent) menampilkan ringkasan insight yang lebih lengkap, dihitung dari `days`. |

### Yang TIDAK berubah

- Access control: admin dan trainer melihat seluruh data; **leader melihat hanya agent dalam scope-nya**. Ini bukan pembukaan penuh untuk leader. Route `/sidak/agents/$id` (leader boleh) tetap memerlukan scoping yang sama.
- Scoring, ranking, periode audit, ekspor CSV/Markdown, dan format template import tidak berubah.
- Tidak ada backfill tanggal, tidak ada default hari ini, tidak ada `created_at` sebagai tanggal bisnis.
- `isCountableFinding()` dan pengecualian phantom tetap satu-satunya predikat hitung.
- Query tetap memakai JWT user (RLS `read_admin_trainer`), tanpa fallback service-role.

### Definisi insight (dihitung dari `days`, tanpa API baru)

Semua bersifat **volume**, bukan rate/defect-rate (tidak ada denominator jumlah layanan):

1. Total temuan tahun terpilih.
2. Tanggal dengan temuan terbanyak (tanggal + jumlah).
3. Tanggal **aktif** dengan temuan paling sedikit (di antara `count > 0`; bukan hari kosong).
4. Jumlah hari aktif vs hari tanpa temuan.
5. Rata-rata temuan per hari aktif (satu desimal) dan per hari kalender.
6. Hari-dalam-minggu dengan total temuan terbanyak (Senin–Minggu).
7. Bulan dengan volume tertinggi.
8. Rentang tanggal aktif (paling awal s/d paling akhir).
9. Tanggal belum diisi (sudah ada; scope all-periods, mengikuti layanan + satuan).

## Design

### Kontrak API

```text
GET /api/v1/sidak/heatmap?mode=agent|qa&year=2026&service_type=call
    &count_by=parameter|tiket&agent_id=<uuid>
```

```ts
export const sidakHeatmapCountBySchema = z.enum(["parameter", "tiket"]);
export type SidakHeatmapCountBy = z.infer<typeof sidakHeatmapCountBySchema>;

export const sidakHeatmapQuerySchema = z.object({
  mode: sidakHeatmapModeSchema,
  year: z.coerce.number().int().min(2000).max(2100),
  service_type: serviceTypeSchema.optional(),
  count_by: sidakHeatmapCountBySchema.default("parameter"),
  agent_id: z.string().uuid().optional(),
});

export interface SidakHeatmapResponse {
  // ...field lama tetap...
  countBy: SidakHeatmapCountBy;   // BARU
  agentId: string | null;         // BARU
}
```

- `agent_id` memvalidasi uuid dan hanya menambah `.eq("peserta_id", agent_id)`; tidak ada kolom bebas.
- `count_by` di-allowlist; nama kolom/agregasi tidak pernah datang dari input.
- `missingDateFindingsAllPeriods` mengikuti `count_by` dan `agent_id` yang sama.

### Akses + scoping per role

`requireRole("admin", "trainer", "leader")`; role dibaca dari `c.get("profile")`.

```text
accessibleAgentIds = getAccessibleAgentIds(user.id, role)
  admin/trainer -> null            (semua agent)
  leader        -> string[]        (pesertaIds dari getLeaderScopeSnapshot(userId, "sidak"))
```

- **admin/trainer** (`null`): jalur lama — `createUserClient(token)` + RLS `read_admin_trainer`.
- **leader** (`string[]`): RLS menolak leader, jadi query memakai `supabaseAdmin` (pola yang sama dengan `getAgentDetail` / `getAccessibleSidakFilters`) **plus filter `peserta_id IN accessibleAgentIds`** di service. Bila `accessibleAgentIds` kosong → respons nol yang sah (bukan error).
- `agent_id` dari leader di luar `accessibleAgentIds` → **403 FORBIDDEN**; admin/trainer bebas.
- `service_type`: leader mengikuti `getAccessibleSidakFilters().allowedServices`; bila `serviceTypeLocked` dan `service_type` yang diminta tidak termasuk → **403**; bila `service_type` tidak dikirim → query dibatasi `IN allowedServices`.
- **Jangan** memakai service-role untuk admin/trainer, dan **jangan** memberi leader akses penuh. Scoping app-side wajib; jangan pernah bergantung pada RLS untuk leader karena policy-nya tidak mengizinkan.
- Untuk menjaga RLS admin/trainer tetap berarti, `getSidakHeatmap` menerima `supabase` (client) + `scope: { agentIds: string[] | null; serviceTypes: string[] | null }`; route yang menentukan client mana yang dipakai.

### Semantik hitung

- **parameter** (default): `days[date] += 1` untuk setiap baris countable non-phantom.
- **tiket**: `Map<date, Set<no_tiket>>` untuk baris dengan `no_tiket` tidak kosong, plus counter terpisah untuk `no_tiket IS NULL`; `days[date] = set.size + nullCount`.
- `missingDateFindingsAllPeriods` memakai agregasi yang sama atas baris bertanggal-null, seluruh periode.
- Paging `fetchAllPages` + `order("id")` tetap; kegagalan halaman apa pun = error, bukan nol/partial.

### Web

- **Halaman utama** (`/sidak/heatmap`): tambah kontrol **Satuan: Parameter | Tiket** (mengirim `count_by`), dan komponen `SidakHeatmapInsights` di bawah kartu ringkasan. Guard generasi (stale response) berlaku untuk `count_by` juga.
- **Modul insight baru** `apps/web/src/components/sidak/heatmap-insights.ts`: fungsi murni `buildHeatmapInsights(days)` → `HeatmapInsights`. Dipakai bersama halaman utama dan heatmap agent (satu sumber kebenaran).
- **Komponen** `apps/web/src/components/sidak/SidakHeatmapInsights.tsx`: menampilkan 9 poin di atas; teks, bukan hanya warna; light/dark; aksesibel.
- **Detail agent** (`/sidak/agents/$id`): tambah tab **Heatmap** yang hanya dirender untuk `role === "trainer" || role === "admin"`. `SidakAgentDetailTabs` menerima daftar tab yang sudah difilter (bukan hardcode `SIDAK_AGENT_DETAIL_TABS`). Hook baru `useAgentHeatmap` memanggil endpoint yang sama dengan `agent_id`, `year = selectedYear`, `service_type = selectedService`, `count_by` (toggle lokal). Pakai ulang `SidakHeatmapCalendar` + `SidakHeatmapInsights`.
- Typed lewat `sidakClient`/facade lokal yang sudah ada di `heatmap.tsx`; tidak ada query data langsung dari frontend.

## Tasklist

### Fase 0 — Prasyarat (STOP gate)

**Dependensi:** tidak ada. **BLOCKER saat plan ditulis:** Docker/OrbStack mati, `127.0.0.1:54321` tidak menjawab.

1. Pengguna menyalakan Docker/OrbStack; jalankan Supabase lokal + fixture `scratch/sidak-local-db/` sampai PostgREST 200.
2. Pastikan `apps/api/.env.integration` ada dan menunjuk loopback (guard fail-closed sudah ada).
3. `git status --short` bersih; lindungi dirty work.

**STOP:** jika stack lokal tidak bisa dihidupkan, jangan lanjut ke fase API. Jangan menjalankan E2E API terhadap remote/production.

### Fase 1 — Kontrak types

**Dependensi:** Fase 0.

1. Tambah `sidakHeatmapCountBySchema`, `count_by`, `agent_id` pada `sidakHeatmapQuerySchema`.
2. Tambah `countBy` + `agentId` pada `SidakHeatmapResponse`.
3. E2E kontrak (bagian shared-schema) RED dulu.

**Gate:** `pnpm --filter @trainers/types typecheck` dan `git diff --check` exit 0.

### Fase 2 — Service + route API (per-tiket + agent_id)

**Dependensi:** Fase 1.

1. E2E RED di `apps/web/e2e/sidak-temuan-dates-api.spec.ts` (bagian "Heatmap agregasi"): per-tiket (satu tiket 3 parameter = 1; dua tiket = 2; `no_tiket` null per baris), `agent_id` (agent lain dikecualikan), missing-date per-tiket, serta validasi `count_by`/`agent_id` invalid.
2. Implementasi `getSidakHeatmap` menerima `countBy` + `agentId` + `scope`; agregasi sesuai Design.
3. Route `heatmap.ts` meneruskan param baru; tetap `requireRole("admin","trainer")` **pada fase ini** (leader menyusul di Fase 2b).

**Gate:** `pnpm --filter @trainers/web test:e2e -- sidak-temuan-dates-api.spec.ts` hijau; `pnpm --filter @trainers/api typecheck` exit 0.

### Fase 2b — Akses leader ter-scope

**Dependensi:** Fase 2.

1. E2E RED (butuh DB): leader hanya melihat temuan `pesertaIds`-nya; `agent_id` agent di luar scope → 403; leader tanpa `agent_id` = agregat tim; leader tanpa scope = nol (bukan error); leader + `service_type` terkunci di luar `allowedServices` → 403; **admin/trainer tetap melihat semua**; agent tetap 403.
2. Route: `requireRole("admin","trainer","leader")`; pilih client (`createUserClient` untuk admin/trainer, `supabaseAdmin` untuk leader) + `scope` dari `getAccessibleAgentIds` / `getAccessibleSidakFilters`.
3. Frontend: guard halaman heatmap → `requireLeaderModuleApproval(["trainer","admin","leader"], "sidak", "/sidak")`; `nav-config` heatmap mengizinkan leader.

**Gate:** E2E API hijau + `pnpm --filter @trainers/web typecheck` exit 0.

### Fase 3 — Insight (murni UI)

**Dependensi:** tidak bergantung Fase 2 (dari `days`).

1. Modul `heatmap-insights.ts` + komponen `SidakHeatmapInsights.tsx`.
2. E2E UI mock (`sidak-heatmap.spec.ts`): insight muncul dari data mock, termasuk tanggal tertinggi/terendah aktif, hari-dalam-minggu, bulan, rata-rata, rentang, hari aktif.
3. Integrasi ke halaman utama.

**Gate:** `pnpm --filter @trainers/web test:e2e -- sidak-heatmap.spec.ts` dan `pnpm --filter @trainers/web typecheck` exit 0.

### Fase 4 — Toggle satuan di halaman utama

**Dependensi:** Fase 2 (param) + Fase 3.

1. E2E UI mock RED: klik "Tiket" mengirim `count_by=tiket`; label satuan aktif jelas.
2. Implementasi toggle + guard generasi.

**Gate:** `pnpm --filter @trainers/web test:e2e -- sidak-heatmap.spec.ts` hijau.

### Fase 5 — Heatmap di detail agent

**Dependensi:** Fase 2 + 3.

1. E2E RED: tab Heatmap tampil untuk admin/trainer/leader (leader hanya untuk agent dalam scope; agent di luar scope → pesan 403 yang manusiawi), request membawa `agent_id` + `year` + `service_type`, kalender + insight tampil.
2. Hook `useAgentHeatmap`, tab baru, filter daftar tab per role, panel reuse kalender + insight.

**Gate:** spec baru `apps/web/e2e/sidak-agent-heatmap.spec.ts` hijau; `pnpm --filter @trainers/web typecheck` exit 0.

### Fase 6 — Integrasi + dokumentasi

**Dependensi:** semua fase.

1. Integrasi nyata: seed per-tiket + per-agent lewat DB lokal, buktikan hitungan dan filter `agent_id` end-to-end (router Hono asli, JWT user).
2. Perbarui `docs/modules.md`, `docs/database.md` (semantik satuan), `docs/auth-rbac.md` (leader tetap tanpa akses heatmap), `plans/markdown/sidak-heatmap.md` (pointer perubahan kontrak).
3. Regresi: `sidak-heatmap-integration.spec.ts`, `sidak-heatmap-browser-integration.spec.ts`, `sidak-temuan-dates-api.spec.ts`.

**Gate akhir:** `pnpm typecheck` · `pnpm lint` · `git diff --check` exit 0; seluruh spec fitur hijau.

## STOP Conditions

- STACK LOKAL mati → STOP sebelum fase API; jangan klaim E2E API.
- Perubahan role/akses di luar admin/trainer/leader-scoped di atas → STOP, butuh persetujuan terpisah.
- Leader mendapatkan data di luar `pesertaIds`/`allowedServices`-nya → STOP dan perbaiki sebelum lanjut; ini kebocoran lintas tim.
- Kegagalan query yang berubah jadi nol/partial success → dilarang.
- Non-E2E test sebagai pengganti E2E → butuh persetujuan Fajar.

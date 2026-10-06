# Penyatuan kontrol akses role & scope (admin / trainer / leader / agent)

Status: SELESAI LOKAL — Fase 0–7 selesai; 74 E2E backend + 11 browser, root typecheck/lint/build hijau. Migrasi lokal diterapkan; remote hanya diaudit read-only. Admission WebSocket legacy dipertahankan.
Lane: **D** (auth, permission, RLS, kontrak API lintas modul). Workflow: `trainers-superapp-tdd`, E2E-first, `thermo-nuclear` setelah implementasi tiap fase.
Disusun: 2026-10-06 dari pembacaan kode di `main` @ `d5a72b1`. Semua referensi `file:line` wajib di-drift-check ulang sebelum dipakai.

---

## Requirement

### Keputusan pemilik produk (Fajar, 2026-10-06)

1. Role aplikasi **hanya empat**: `admin`, `trainer`, `leader`, `agent`.
2. `qa` **bukan** role tersendiri; secara konsep disetarakan dengan `leader`.
3. `tl`, `spv`, `om` **bukan** role auth. (Catatan: `tl`/`spv`/`qa` juga muncul sebagai _jabatan peserta_ atau nama kolom — itu domain data, bukan role, dan **tidak boleh** disentuh. Lihat §Design "Bukan role".)

### Masalah yang diselesaikan

Otorisasi tersebar di tiga lapisan yang ditulis manual dan bisa saling berbeda:

| #   | Temuan                                                                                                                                                                                                   | Bukti (drift-check ulang)                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1  | 132 pemanggilan `requireRole(...)` dengan daftar role literal di 18 file route; `requireRole(...roles: string[])` tidak bertipe sehingga typo/role fiktif lolos compiler.                                | `apps/api/src/middleware/role.ts`; `grep -rn "requireRole(" apps/api/src/routes`                                                                                                                                                                                                                                                                                                                                   |
| F2  | Role fiktif `tl`/`spv`/`om` diizinkan di route.                                                                                                                                                          | `routes/ketik.ts:34`, `routes/pdkt/{history,settings,mailbox,simulation}.ts`                                                                                                                                                                                                                                                                                                                                       |
| F3  | `qa` masih diberi hak manajer (lebih tinggi dari leader) di beberapa tempat, padahal DB constraint awal tidak mengenal `qa`.                                                                             | `routes/ketik.ts:329,517`, `routes/ai.ts:68`, `routes/telefun/sessions.ts:291,720,777`, `routes/telefun/annotations.ts:64,142,211,323`, `routes/telefun/recordings.ts:988`, `services/sidak/shared-constants.ts:5` (`REPORT_ADMIN_ROLES`), `apps/web/src/routes/ketik/index.tsx:44`, `apps/web/src/hooks/useProfilerAccess.ts:3`, RLS `supabase/migrations/20260523000000_telefun_parity_extensions.sql:31,95,125` |
| F4  | Tipe role berbeda dari DB: tipe = `admin\|trainer\|leader\|agent\|qa`; DB CHECK = `admin\|trainer\|leader\|agent\|user`.                                                                                 | `packages/types/src/common.ts:12`, `packages/types/src/admin.ts:7`, `supabase/migrations/000_profiles_core.sql:9`                                                                                                                                                                                                                                                                                                  |
| F5  | Cek role inline tanpa middleware (`["admin","trainer","qa"].includes(profile?.role)`).                                                                                                                   | `routes/telefun/*.ts`, `routes/ai.ts:49`                                                                                                                                                                                                                                                                                                                                                                           |
| F6  | Konstanta role diduplikasi.                                                                                                                                                                              | `services/sidak/shared-constants.ts:3-4` vs `services/profiler-service.ts:15`                                                                                                                                                                                                                                                                                                                                      |
| F7  | Normalisasi role tidak konsisten: frontend menormalkan `trainers→trainer`, `agents→agent`; backend `requireRole` membandingkan string mentah.                                                            | `apps/web/src/routes/dashboard/users.tsx:31`, `apps/telefun/src/realtime-webrtc/broker-auth.ts:144`, `apps/api/src/middleware/role.ts:6`                                                                                                                                                                                                                                                                           |
| F8  | Frontend punya salinan daftar role sendiri.                                                                                                                                                              | `apps/web/src/router.tsx` (`requireRole([...])`, `requireLeaderModuleApproval`), `components/layout/nav-config.ts` (`allowedRoles`), `hooks/useProfilerAccess.ts`, `routes/ketik/index.tsx:44`, `routes/dashboard/users.tsx:25` (`ROLE_OPTIONS`)                                                                                                                                                                   |
| F9  | Scope data (siapa boleh melihat agent mana) hanya terpusat untuk SIDAK & Profiler; modul lain punya logika sendiri. Scope agent memakai `profiler_peserta.trainer_id = userId` (nama kolom menyesatkan). | `services/sidak/access-scope.ts:162-178`, `services/leader-access-service.ts:112`, `services/profiler-service.ts:44`                                                                                                                                                                                                                                                                                               |
| F10 | Pola fail-open laten: array scope kosong = "tanpa filter". Saat ini aman karena tiap caller menjaga sendiri, tapi caller baru yang lupa akan membocorkan seluruh data ke leader ber-scope kosong.        | `services/sidak/heatmap-service.ts:98` (dijaga di `:268`), `services/sidak/access-scope.ts:279` (dijaga di `routes/sidak/core.ts:220`)                                                                                                                                                                                                                                                                             |
| F11 | Scope leader ditegakkan di aplikasi memakai service-role, bukan RLS (diakui eksplisit di dokumen).                                                                                                       | `routes/sidak/heatmap.ts:21-23`, `docs/auth-rbac.md` (catatan SIDAK Heatmap)                                                                                                                                                                                                                                                                                                                                       |
| F12 | `docs/auth-rbac.md` tabel "Role enforcement coverage" sudah basi (menyebut qa/tl/spv/om).                                                                                                                | `docs/auth-rbac.md` §2                                                                                                                                                                                                                                                                                                                                                                                             |

### Acceptance criteria

- AC1 — Satu sumber kebenaran role: `Role = "admin" | "trainer" | "leader" | "agent"` di `packages/types`; tidak ada literal `"qa"`, `"tl"`, `"spv"`, `"om"` sebagai **role auth** di `apps/api/src`, `apps/web/src`, `apps/telefun/src`, `packages/types/src`.
- AC2 — Semua gate backend memakai `requireCapability(<key>)` bertipe; `requireRole` dihapus atau menjadi wrapper internal yang tidak diekspor ke route. Tidak ada cek role inline di route.
- AC3 — Frontend (router guard, nav, hook akses, tombol aksi) membaca katalog capability yang **sama** dengan backend; tidak ada daftar role literal di komponen/route web.
- AC4 — Normalisasi role dilakukan sekali (`normalizeRole`) di `packages/types`, dipakai `authMiddleware`, web auth store, dan broker Telefun. Nilai tak dikenal → fail closed (bukan default `agent`/`trainer`).
- AC5 — Satu resolver scope `resolveDataScope(actor, module)` mengembalikan union eksplisit (`all | self | team | none`); helper penerap scope menjamin `none` dan `team` ber-ID kosong menghasilkan nol baris **di satu tempat**.
- AC6 — Matriks akses (role × endpoint × scope) terdokumentasi di `docs/auth-rbac.md` dan dibuktikan oleh E2E API tabel-driven yang hijau.
- AC7 — **Tidak ada perubahan hak akses efektif bagi pengguna nyata** kecuali yang tercantum di §Keputusan terbuka dan sudah disetujui Fajar. Refactor ini bersifat behavior-preserving untuk admin/trainer/leader/agent.
- AC8 — Migrasi DB (CHECK constraint, RLS) hanya dieksekusi lokal/disposable; penerapan remote hanya dengan otorisasi eksplisit Fajar.

### Non-goals

- Tidak mengubah alur approval leader (`leader_access_requests`, access groups) atau UI `LeaderAccessGate`, selain membuatnya membaca capability.
- Tidak mengubah jabatan peserta, mode heatmap `qa`, kolom WFM `tl`, atau daftar `EXCLUDED_JABATAN`.
- Tidak menambah role baru.

### STOP conditions (berhenti dan tanya Fajar)

- S1 — Fase 0 menemukan baris `profiles.role` di luar `admin|trainer|leader|agent` (mis. `qa`, `user`, `trainers`, `agents`) di DB mana pun yang dicek.
- S2 — Sebuah capability tidak bisa dipetakan tanpa mengubah hak efektif role nyata (di luar D1–D4).
- S3 — E2E tidak dapat membuktikan suatu invarian dan butuh unit/integration test — ikuti aturan AGENTS.md (minta izin dulu).
- S4 — Diperlukan akses/migrasi ke DB remote atau produksi.
- S5 — Graphify/impact menunjukkan route lain (mis. `apps/telefun`) memakai role dengan cara yang tidak tercakup plan ini.

### Keputusan terbuka (wajib dijawab sebelum Fase 2)

| ID  | Pertanyaan                                                                                                                                                                       | Default yang diusulkan (fail-closed, behavior-preserving)                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Hak yang dulu diberikan ke `qa` (KETIK review & worker, `ai.ts:68`, Telefun `isManager`, `REPORT_ADMIN_ROLES`): apakah `leader` ikut mewarisinya karena "qa disetarakan leader"? | **Tidak.** Hapus `qa` saja; leader tetap seperti sekarang. Memberi leader hak manajer adalah perluasan akses dan butuh keputusan terpisah per capability. |
| D2  | Nilai `user` di CHECK constraint `profiles.role` (default kolom).                                                                                                                | Ganti default ke `agent` dan hapus `user` dari CHECK **hanya jika** S1 bersih. Sesuai `docs/auth-rbac.md` (auto-provision = `agent`, status `pending`).   |
| D3  | Normalisasi alias `trainers`/`agents`/`leaders`.                                                                                                                                 | Pertahankan alias di `normalizeRole` sampai Fase 0 membuktikan tidak ada data alias; lalu bersihkan data via migrasi dan hapus alias.                     |
| D4  | Endpoint `pdkt/*` dan `ketik.ts:34` yang hari ini membuka `leader` + `agent`: scope data leader di modul ini = milik sendiri saja, atau tim?                                     | Pertahankan perilaku hari ini persis (Fase 0 harus mencatat perilakunya). Perluasan ke scope tim = plan terpisah.                                         |

---

## Design

### Bukan role — jangan diubah

Literal berikut adalah **data domain**, bukan role auth. Executor wajib mengecualikannya dari pencarian/penggantian:

- `apps/api/src/lib/scoring.ts:274,280` dan `services/sidak/shared-constants.ts:7-19` (`EXCLUDED_JABATAN`) — jabatan peserta.
- `packages/types/src/profiler.ts:79,83` — enum jabatan peserta.
- `apps/api/src/services/sidak/wfm-schedule.ts:27,40,740` — kolom WFM `tl`.
- `packages/types/src/sidak.ts:31` (`sidakHeatmapModeSchema` `"qa"`) dan `apps/web/src/routes/sidak/heatmap.tsx:120` — mode tanggal sampel.

### Lapisan 1 — Role & capability (packages/types)

File baru `packages/types/src/access.ts` (diekspor dari index):

```ts
export const ROLES = ["admin", "trainer", "leader", "agent"] as const;
export type Role = (typeof ROLES)[number];

/** Satu-satunya tempat normalisasi. Nilai tak dikenal → null (fail closed). */
export function normalizeRole(raw: string | null | undefined): Role | null;

export const CAPABILITIES = {
  // diisi dari matriks Fase 0 — contoh bentuk:
  "profiler.read": ["admin", "trainer", "leader"],
  "profiler.write": ["admin", "trainer"],
  "sidak.read": ["admin", "trainer", "leader"],
  "sidak.write": ["admin", "trainer"],
  "sidak.schedule.read": ["admin", "trainer"],
  "ketik.use": ["admin", "trainer", "leader", "agent"],
  "ketik.review": ["admin", "trainer"],
  "ketik.templates.shared.write": ["admin"],
  "pdkt.use": ["admin", "trainer", "leader", "agent"],
  "telefun.use": ["admin", "trainer"],
  "telefun.manage": ["admin", "trainer"],
  "monitoring.read": ["admin", "trainer", "leader"],
  "monitoring.pricing.write": ["admin", "trainer"],
  "admin.users": ["admin", "trainer"],
  "admin.accessGroups": ["admin", "trainer"],
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof CAPABILITIES;
export function can(role: Role | null, cap: Capability): boolean;
/** Modul yang butuh approval leader (ktp/sidak) — dipakai backend & LeaderAccessGate. */
export const LEADER_APPROVAL_MODULE: Partial<
  Record<Capability, "ktp" | "sidak">
>;
```

Aturan desain:

- Key capability = **aksi pada resource**, bukan nama role. Granularitas cukup untuk membedakan read/write/manage; jangan satu capability per endpoint.
- Katalog final **wajib** diturunkan dari matriks Fase 0, bukan dari contoh di atas. Contoh di atas hanya bentuk.
- `can()` murni (tanpa I/O) supaya dipakai sama di backend dan web.

### Lapisan 2 — Gate backend (apps/api)

- `authMiddleware` (`apps/api/src/middleware/auth.ts`) menyimpan `profile.role` yang sudah dinormalisasi; role tak dikenal → `403 FORBIDDEN` dengan pesan manusiawi (tidak membocorkan nilai mentah).
- `middleware/role.ts` → `requireCapability(cap: Capability)`. Respons 403 sama persis dengan sekarang (`code: "FORBIDDEN"`, pesan Indonesia) agar kontrak klien tidak berubah.
- Cek inline (`isManager`, `ai.ts:49`) diganti `can(actor.role, "<cap>")` dengan helper `getActor(c)` bertipe.
- `TRAINER_ROLES`/`LEADER_ROLES`/`REPORT_ADMIN_ROLES` dihapus; pemakainya pindah ke `can()` atau ke resolver scope (Lapisan 3).

### Lapisan 3 — Scope data (apps/api/src/services/access/)

Pindahkan `services/sidak/access-scope.ts` (bagian scope, bukan helper folder) dan `services/leader-access-service.ts#getLeaderScopeSnapshot` ke modul `services/access/`:

```ts
export type DataScope =
  | { kind: "all" }                                   // admin, trainer
  | { kind: "self"; pesertaId: string }               // agent dengan peserta tertaut
  | { kind: "team"; pesertaIds: string[]; services: ServiceType[] } // leader approved
  | { kind: "none"; reason: "unlinked" | "not_approved" | "empty_scope" };

export async function resolveDataScope(actor: Actor, module: "sidak" | "ktp" | ...): Promise<DataScope>;

/** Satu-satunya penerap scope ke query Supabase. none / team-kosong → query yang pasti 0 baris. */
export function applyPesertaScope<Q>(query: Q, scope: DataScope, column = "peserta_id"): Q;
export function isPesertaInScope(scope: DataScope, pesertaId: string): boolean;
```

Aturan:

- `team` dengan `pesertaIds.length === 0` dinormalisasi menjadi `none` di dalam resolver, sehingga tidak ada caller yang bisa salah membaca array kosong.
- Error RPC scope → lempar error yang dipetakan ke `503 SCOPE_UNAVAILABLE` (meniru `simulation-access.ts:80`), **tidak pernah** fallback ke `all`.
- `applyScope` di `heatmap-service.ts:90` dan filter di `access-scope.ts:279` diganti `applyPesertaScope`.
- Lookup agent `profiler_peserta.trainer_id = userId` dibungkus satu fungsi `getLinkedPesertaId(userId)` dengan komentar bahwa `trainer_id` = akun yang tertaut ke peserta. Rename kolom **di luar scope** plan ini.
- `SidakFilterScope` (folder/service yang diizinkan) tetap ada sebagai turunan dari `DataScope` untuk kebutuhan UI filter SIDAK.

### Lapisan 4 — Frontend (apps/web)

- `router.tsx`: `requireRole([...])` → `requireCapability("<cap>")`; `requireLeaderModuleApproval(roles, module, path)` → `requireCapability(cap)` yang membaca `LEADER_APPROVAL_MODULE[cap]` untuk menentukan perlu approval atau tidak.
- `nav-config.ts`: `allowedRoles` → `capability`.
- `useProfilerAccess.ts`: `isReadOnly = !can(role, "profiler.write")`; hapus fallback `|| "trainer"` (fail closed → anggap read-only).
- `routes/ketik/index.tsx:44`: `canStartReview = can(role, "ketik.review")`.
- `routes/dashboard/users.tsx`: `ROLE_OPTIONS`/`normalizeRoleValue` memakai `ROLES` + `normalizeRole` dari `packages/types`.
- Frontend tetap hanya UX; otorisasi sesungguhnya di backend (AGENTS.md).

### Lapisan 5 — Database (fase terakhir, butuh otorisasi)

- Migrasi lokal: CHECK `profiles.role IN ('admin','trainer','leader','agent')`, default `'agent'` (D2), hanya setelah S1 bersih.
- Migrasi lokal: ganti `role IN ('admin','trainer','qa')` di policy Telefun (`20260523000000_telefun_parity_extensions.sql`) menjadi `('admin','trainer')` lewat migrasi baru (jangan edit migrasi lama).
- **Opsional/terpisah:** fungsi `security definer` `can_access_peserta(p_peserta_id uuid)` berbasis `auth.uid()` + `get_leader_scope_snapshot`, agar route leader bisa memakai JWT user alih-alih service-role (menutup F11). Ini perubahan RLS besar → ajukan sebagai plan lanjutan, bukan bagian eksekusi wajib.

### Strategi E2E

Pola yang sudah ada dan wajib diikuti:

- **Gate role/capability:** `apps/web/e2e/sidak-jadwal-shifting-api.spec.ts` — router Hono **asli** dengan identitas disuntik middleware test. Spec baru `apps/web/e2e/access-matrix-api.spec.ts`, tabel-driven dari matriks Fase 0: untuk tiap (endpoint, role) yang ditolak → `403` + `error.code === "FORBIDDEN"`; untuk yang diizinkan → `error.code !== "FORBIDDEN"` (endpoint boleh gagal karena DB tidak tersedia, tapi tidak boleh ditolak gate). Target Supabase di spec ini harus loopback tak-terjangkau atau stub lokal agar fail-fast; tidak boleh ada egress non-loopback.
- **Scope data:** `apps/web/e2e/helpers/sidakRealBackend.ts` — Hono asli + Supabase **lokal** disposable + JWT nyata. Spec `apps/web/e2e/access-scope-api.spec.ts`: leader ber-scope kosong → 0 baris (bukan semua data) di heatmap, agents-by-folder, dashboard, temuan; leader ber-scope tim → hanya peserta tim; agent → hanya diri sendiri; RPC scope gagal → `503 SCOPE_UNAVAILABLE`.
- **Frontend guard:** perluas `authenticated-shell.spec.ts`/`sidebar-nav-state.spec.ts` dengan `mockAuth.ts` untuk tiap role: menu yang tampil & redirect route terlarang sesuai matriks.
- RED-first: tiap fase menulis/menyesuaikan spec dulu, jalankan, catat hasil RED (atau "sudah hijau = karakterisasi" bila fasenya behavior-preserving), baru implementasi.
- Jangan menambah unit test; jangan menyentuh `scripts/test-core.json` / `scripts/test-fast.json`.

---

## Tasklist

### Fase 0 — Inventaris & matriks (tanpa perubahan kode produk)

- [x] 0.1 Drift-check semua referensi di tabel F1–F12 terhadap `HEAD`; catat yang bergeser.
- [x] 0.2 Graphify dicoba lalu fallback AST/`rg` (lihat log): `graphify` query untuk `requireRole`, `TRAINER_ROLES`, `LEADER_ROLES`, `REPORT_ADMIN_ROLES`, `getAccessibleAgentIds`, `getAccessibleSidakFilters`, `getLeaderScopeSnapshot`, `isManager` → daftar caller lengkap.
- [x] 0.3 Susun matriks di `docs/auth-rbac.md` (ganti tabel basi §2): kolom `method path | capability usulan | admin | trainer | leader | agent | scope (all/self/team/none) | approval leader? | file:line`. Semua 132 gate + cek inline + guard web.
- [x] 0.4 Untuk tiap endpoint yang dulu menyebut `qa`/`tl`/`spv`/`om`, tulis hak efektif **setelah** penghapusan; tandai yang terdampak D1/D4.
- [x] 0.5 Minta Fajar menjalankan (atau mengizinkan) query read-only `select role, count(*) from profiles group by role;` di DB lokal dan remote. Hasil ≠ empat role → **S1**.
- [x] 0.6 Serahkan matriks + jawaban D1–D4 ke Fajar. **Jangan lanjut Fase 1 tanpa persetujuan.**

### Fase 1 — Spec E2E karakterisasi (RED/karakterisasi)

- [x] 1.1 Buat `apps/web/e2e/access-matrix-api.spec.ts` dari matriks Fase 0 (pola `sidak-jadwal-shifting-api.spec.ts`). Jalankan terhadap kode **sekarang**; baris yang sengaja berubah (penghapusan qa/tl/spv/om) harus RED, sisanya hijau.
- [x] 1.2 Buat `apps/web/e2e/access-scope-api.spec.ts` (pola `sidakRealBackend.ts`), termasuk kasus leader scope kosong dan RPC gagal.
- [x] 1.3 Tambah kasus per-role di spec shell/nav web.
- [x] 1.4 Catat perintah & hasil persis di bagian "Log eksekusi" plan ini.

### Fase 2 — Katalog role & capability

- [x] 2.1 `packages/types/src/access.ts` (`ROLES`, `Role`, `normalizeRole`, `CAPABILITIES`, `can`, `LEADER_APPROVAL_MODULE`); ekspor dari index; build `packages/types`.
- [x] 2.2 `UserProfile.role` (`common.ts:12`) dan `admin.ts:7` → `Role`.
- [x] 2.3 Typecheck api/web/telefun; perbaiki error tipe yang muncul tanpa mengubah perilaku.

### Fase 3 — Backend gate

- [x] 3.1 `authMiddleware` memakai `normalizeRole`; role tak dikenal → 403.
- [x] 3.2 `requireCapability` menggantikan `requireRole`; migrasi per file route (satu commit logis per modul: admin, profiler, sidak/_, ketik, pdkt/_, telefun\*, ai).
- [x] 3.3 Ganti semua cek inline (`isManager`, `ai.ts:49`) dengan `can()`.
- [x] 3.4 Hapus `TRAINER_ROLES`/`LEADER_ROLES`/`REPORT_ADMIN_ROLES` dan duplikat di `profiler-service.ts:15`.
- [x] 3.5 Broker Telefun (`apps/telefun/src/realtime-webrtc/broker-auth.ts:144`) memakai `normalizeRole`.
- [x] 3.6 `access-matrix-api.spec.ts` hijau penuh.

### Fase 4 — Resolver scope

- [x] 4.1 Buat `apps/api/src/services/access/` (`DataScope`, `resolveDataScope`, `applyPesertaScope`, `isPesertaInScope`, `getLinkedPesertaId`).
- [x] 4.2 Migrasikan SIDAK (dashboard, heatmap, reports, temuan, forecast, core, simulations, `simulation-access.ts`) dan Profiler (`profiler-service.ts:44`).
- [x] 4.3 Hapus pola "array kosong = tanpa filter" (`heatmap-service.ts:98`, `access-scope.ts:279`).
- [x] 4.4 Ketik/PDKT/Telefun: hanya bungkus logika kepemilikan yang ada ke `DataScope` sesuai D4; **tanpa** memperluas akses.
- [x] 4.5 `access-scope-api.spec.ts` hijau.

### Fase 5 — Frontend

- [x] 5.1 Router guard, `nav-config.ts`, `MobileTabBar.tsx`, `useProfilerAccess.ts`, `ketik/index.tsx`, `dashboard/users.tsx` memakai `can()`/`ROLES`/`normalizeRole`.
- [x] 5.2 Hapus semua daftar role literal di `apps/web/src` (verifikasi dengan grep AC1, kecualikan daftar "Bukan role").
- [x] 5.3 Spec web per-role hijau.

### Fase 6 — Database (lokal dulu; remote hanya dengan otorisasi)

- [x] 6.1 Migrasi baru: CHECK role empat nilai + default `agent` (bergantung D2 & S1).
- [x] 6.2 Migrasi baru: buang `qa` dari policy Telefun.
- [x] 6.3 Jalankan pada Supabase lokal; E2E scope + matriks tetap hijau.
- [x] 6.4 Usulkan plan lanjutan RLS `can_access_peserta` (F11) — dokumen saja.

### Fase 7 — Dokumentasi & gate akhir

- [x] 7.1 Perbarui `docs/auth-rbac.md` (matriks final, hapus qa/tl/spv/om, jelaskan capability & DataScope) dan `docs/LEADER_APPROVAL_ACCESS.md` bila menyebut role lama.
- [x] 7.2 `thermo-nuclear` review atas seluruh diff.
- [x] 7.3 Verifikasi:
  ```bash
  pnpm --dir apps/api exec tsc --noEmit -p tsconfig.json
  pnpm --dir apps/telefun exec tsc --noEmit -p tsconfig.json
  pnpm --filter @trainers/web exec tsc --noEmit
  pnpm --filter @trainers/web test:e2e -- access-matrix-api.spec.ts access-scope-api.spec.ts authenticated-shell.spec.ts sidebar-nav-state.spec.ts sidak-jadwal-shifting-api.spec.ts
  pnpm --dir apps/api build
  pnpm --dir apps/telefun build
  graphify update .
  git diff --check
  ```
- [x] 7.4 Grep AC1 (harus kosong, di luar daftar "Bukan role"):
  ```bash
  grep -rnE "['\"](qa|tl|spv|om)['\"]" apps/api/src apps/web/src apps/telefun/src packages/types/src \
    --include='*.ts' --include='*.tsx' | grep -vE "__tests__|\.test\."
  grep -rn "requireRole(" apps/api/src/routes apps/web/src
  ```
- [x] 7.5 Laporan akhir: perintah persis + exit status, file berubah, kegagalan pre-existing. Tanpa commit/push/deploy/migrasi remote kecuali diizinkan eksplisit.

---

## Checklist audit untuk Codex (sebelum eksekusi)

- [ ] Setiap baris F1–F12 masih akurat di `HEAD`?
- [ ] Ada lokasi otorisasi yang tidak tercantum (mis. `apps/telefun` di luar broker, Edge Function, RPC lain dengan cek role)?
- [ ] Ada literal di daftar "Bukan role" yang sebenarnya role auth, atau sebaliknya?
- [ ] Contoh `CAPABILITIES` bertentangan dengan perilaku live? (Wajib diganti matriks Fase 0, tapi tandai perbedaannya.)
- [ ] Strategi E2E bisa dijalankan tanpa target non-lokal? Sebutkan blocker konkret bila tidak.
- [ ] Urutan fase aman: tidak ada fase yang membuat gate lebih longgar sementara?

## Log eksekusi

### 2026-10-06 — Fase 0, audit pada HEAD `9ad7eea`

Lane keseluruhan D; batch ini hanya dokumen/inventaris, tanpa perubahan runtime. Working tree awal hanya `?? plans/markdown/access-control-unification.md`; isi plan milik pengguna dipertahankan dan log ditambahkan. Skill repo `.claude/skills/trainers-superapp-tdd/SKILL.md` dan `.claude/skills/graphify/SKILL.md` dibaca bersama workflow kanonis. Tidak memakai Superpowers atau subagent.

#### Drift F1–F12

| Temuan | Hasil audit source saat ini                                                                                                                                                                                                                                                                                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1     | Valid: AST 132 calls pada 18 file, termasuk satu parent middleware Telefun. Tipe `roles: string[]` masih di `middleware/role.ts:3`. Ada 162 endpoint modul (auth-only termasuk), bukan 132 endpoint; tiga akun tambahan di `app.ts`.                                                                                                                                                       |
| F2     | Valid: KETIK generate `routes/ketik.ts:34`; PDKT history/settings/mailbox/simulation literal tl/spv/om masih ada.                                                                                                                                                                                                                                                                          |
| F3     | Valid dengan catatan: qa di KETIK review `:329`/worker `:517`, AI generate `ai.ts:68`, Telefun sessions `:291/:720/:777`, annotations `:64/:142/:211/:323`, recordings `:988`, shared constants `:5`, web KETIK `:44`, hook `:3`, RLS `:31/:95/:125`. Telefun inline qa tidak efektif di facade produksi yang hanya admin/trainer. REPORT_ADMIN_ROLES qa juga terhalang role gate archive. |
| F4     | Valid: common.ts:12 dan admin.ts:7 menyertakan qa; migration 000_profiles_core.sql:9 CHECK menyertakan user dan default user. Ini bukti migration source, belum snapshot DB hidup.                                                                                                                                                                                                         |
| F5     | Valid; tambahan recordings.ts:406 punya cek admin/trainer lintas akun. AI signing helper ai.ts:48–49 bukan sekadar gate generate.                                                                                                                                                                                                                                                          |
| F6     | Valid; duplikat Profiler berada :14–15, bukan TRAINER :15. Ada tambahan MAILBOX_MANAGER_ROLES di pdkt/mailbox-service.ts:17 dan manager pada simulation-subject-service.ts:40.                                                                                                                                                                                                             |
| F7     | Valid; alias frontend ada di lib/app-config.ts:126+, users.tsx:31; broker helper :144. auth middleware masih menyimpan role mentah. authStore.ts:16 juga menyimpan profil mentah.                                                                                                                                                                                                          |
| F8     | Valid dan lebih luas: app-config.ts, Layout.tsx, Sidebar/MobileDrawer, dashboard/SIDAK cards, PDKT/Telefun picker, MaintenanceModal dan monitoring UI perlu dicakup AC3/5.2.                                                                                                                                                                                                               |
| F9     | Valid; linked peserta SIDAK di access-scope.ts:152–155 (referensi :162–178 sekarang leader), Profiler :34–37. Snapshot RPC helper leader-access-service.ts:112 masih ada.                                                                                                                                                                                                                  |
| F10    | Valid laten: heatmap-service.ts:98 dijaga entrypoint :268; access-scope.ts:279 dijaga allowedFolders di core.ts:220. Tidak membuktikan kebocoran runtime; helper baru wajib fail closed.                                                                                                                                                                                                   |
| F11    | Valid source: heatmap.ts:21–23 dan :109 memakai service-role khusus leader; admin/trainer user JWT. Tidak diperbaiki lewat perubahan RLS di batch audit.                                                                                                                                                                                                                                   |
| F12    | Valid: tabel docs lama menambah qa/tl/spv/om dan jumlah endpoint basi. Diganti matriks source 165 endpoint dan 48 deklarasi web, bukan klaim implementasi sudah selesai.                                                                                                                                                                                                                   |

#### Graphify dan caller

- `graphify query 'requireRole' --budget 1200` exit 0: 296 node, output terpotong dan bukan daftar caller tepat.
- Retry `graphify explain 'apps/api/src/middleware/role.ts'` exit 0: `No node matching ... found.` Graphify tidak memadai untuk inventaris lengkap; fallback AST TypeScript, `rg`, import dan source langsung. Tidak mengklaim graph lengkap/terkini dan tidak menjalankan update untuk batch dokumen.
- Inventaris caller delapan simbol dimuat di bawah. Baris import/re-export dicatat agar facade dan service caller tidak hilang. Caller produk yang terkait middleware termasuk 18 file route pada matriks kanonis.

#### Inventaris caller source

**`requireRole`**

- `apps/api/src/middleware/role.ts:3`
- `apps/api/src/routes/admin.ts:6,31,48,79,108,128,145,169,189,207,231,247,263,278,295,318,341,364,392,414,429`
- `apps/api/src/routes/ai.ts:16,68,204,227,290,359,497,616,651,676`
- `apps/api/src/routes/ketik.ts:14,34,124,329,517`
- `apps/api/src/routes/pdkt/history.ts:7,16,50,109,202,224`
- `apps/api/src/routes/pdkt/mailbox.ts:11,42,62,91,164,185,211,273`
- `apps/api/src/routes/pdkt/settings.ts:3,14,44`
- `apps/api/src/routes/pdkt/simulation.ts:14,37,46,54,65,108,204`
- `apps/api/src/routes/profiler.ts:4,20,26,50,74,82,110,133,156,191,202,234,248,259,268,303,319,383,405,426,464,494,534,562,601,607,636`
- `apps/api/src/routes/sidak/core.ts:4,24,31,66,92,148,156,197,211`
- `apps/api/src/routes/sidak/dashboard.ts:5,29,54,118,173,218,255,338,364,417,426,464`
- `apps/api/src/routes/sidak/forecast.ts:4,22`
- `apps/api/src/routes/sidak/heatmap.ts:3,30`
- `apps/api/src/routes/sidak/jadwal-shifting.ts:5,105,112,137`
- `apps/api/src/routes/sidak/reports.ts:4,18,64,104,167,219,268,315,329,357,376`
- `apps/api/src/routes/sidak/rule-versions.ts:4,15,37,64,120,167,199,252,303,323,382,410`
- `apps/api/src/routes/sidak/simulations.ts:4,69,137`
- `apps/api/src/routes/sidak/temuan.ts:4,17,44,79,111,140,160`
- `apps/api/src/routes/telefun.ts:3,15`
- `apps/web/src/components/layout/nav-config.ts:41`
- `apps/web/src/router.tsx:80,87,94,101,129,198,227,245,252,325,326,355,362,369,399,406,413,419,509`

**`TRAINER_ROLES`**

- `apps/api/src/services/profiler-service.ts:14,32`
- `apps/api/src/services/sidak/access-scope.ts:4,150,173`
- `apps/api/src/services/sidak/shared-constants.ts:3`
- `apps/api/src/services/sidak/simulation-access.ts:6,63,72,91`

**`LEADER_ROLES`**

- `apps/api/src/services/profiler-service.ts:15,43`
- `apps/api/src/services/sidak/access-scope.ts:4,161,175`
- `apps/api/src/services/sidak/shared-constants.ts:4`

**`REPORT_ADMIN_ROLES`**

- `apps/api/src/services/sidak/report-archives.ts:2,4`
- `apps/api/src/services/sidak/shared-constants.ts:5`

**`getAccessibleAgentIds`**

- `apps/api/src/routes/sidak/dashboard.ts:37,73,133,191,288,343,373,475`
- `apps/api/src/routes/sidak/forecast.ts:49`
- `apps/api/src/routes/sidak/reports.ts:43,81,243`
- `apps/api/src/routes/sidak/temuan.ts:26`
- `apps/api/src/services/sidak/access-scope.ts:146`

**`getAccessibleSidakFilters`**

- `apps/api/src/routes/sidak/core.ts:18`
- `apps/api/src/routes/sidak/dashboard.ts:23`
- `apps/api/src/routes/sidak/forecast.ts:17`
- `apps/api/src/routes/sidak/heatmap.ts:5,21,76`
- `apps/api/src/services/sidak/access-scope.ts:169`
- `apps/api/src/services/sidak/simulation-access.ts:5,109`

**`getLeaderScopeSnapshot`**

- `apps/api/src/services/leader-access-service.ts:112`
- `apps/api/src/services/profiler-service.ts:4,44`
- `apps/api/src/services/sidak/access-scope.ts:3,162,176`

**`isManager`**

- `apps/api/src/routes/telefun/annotations.ts:64,65,142,143,211,212,323,324`
- `apps/api/src/routes/telefun/recordings.ts:988,989`
- `apps/api/src/routes/telefun/sessions.ts:291,298,720,721,777,778`
- `apps/web/src/routes/dashboard.tsx:130,133,183,286,294,302,405,555`
- `apps/web/src/routes/sidak/index.tsx:73,75`

#### Batas desain / keputusan wajib

1. **S5 terpicu source**: `apps/telefun/src/db.ts:88` memiliki gate atribusi peserta di luar broker. Lebih penting, WebSocket legacy `server-auth.ts:64–73` menerima JWT valid dan memakai createSession(self) atau getOwnedSessionId; keduanya tidak memiliki gate admin/trainer menyeluruh. Menerapkan telefun.use di sini akan mengubah hak efektif. Audit statis, belum PoC runtime. Minta keputusan: perluas plan untuk penutupan jalur legacy via E2E, atau pertahankan admission yang ada sebagai capability terpisah.
2. **S2 / representasi scope belum konsisten**: self-peserta tidak merepresentasikan own-user KETIK/PDKT/Telefun; shared mailbox, RLS fallback evaluasi, global metadata SIDAK dan own report archives harus dipertahankan. Usulan: pisahkan participant DataScope dari AccountScope/ownership dan kontrak shared-mailbox/RLS yang sudah ada; jangan terapkan peserta filter ke seluruh resource.
3. Capability contoh tidak cukup behavior-preserving: dashboard SIDAK dan archives menerima agent; PDKT template/evaluate tidak; route web reports menolak leader tetapi backend menerima; profiler/add/import/teams route menerima approved leader tetapi write API menolak; Telefun landing auth-only. Matriks docs memisahkan kapabilitas permukaan itu.
4. `LEADER_APPROVAL_MODULE` tidak boleh langsung memperketat semua read API metadata yang sekarang hanya role gate; pisahkan landing/view/participant read/config read dan catat enforcement per endpoint.
5. Unknown role fail-closed harus meliputi pengguna target (users.tsx:31 default agent) dan pemanggil; pilihan role trainer tidak boleh menjadi ROLES penuh karena trainer dilarang promosi/admin target.
6. Urutan fase 2 perlu menjaga kompatibilitas web hingga Fase 5: guard build checks bisa gagal saat union qa dihapus. Jangan melonggarkan backend untuk membuat compile lolos; migrasikan consumer yang terpengaruh secara atomik atau sesuaikan urutan batch setelah matriks disetujui.

#### Keputusan D1–D4 yang diajukan

| ID  | Rekomendasi hasil source audit                                                                                                                                                   | Status                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| D1  | Hapus qa tanpa menambah hak manager ke leader.                                                                                                                                   | Belum dijawab Fajar                                       |
| D2  | Default agent dan CHECK empat role hanya setelah DB lokal/remote terbukti bersih.                                                                                                | Disetujui bersyarat DB bersih; distribusi belum diketahui |
| D3  | Pertahankan alias yang sudah digunakan pada boundary sampai distribusi DB diverifikasi; unknown tetap null. Jangan mengasumsikan alias leaders sudah diterima source hari ini.   | Belum dijawab Fajar                                       |
| D4  | Pertahankan self-user KETIK/PDKT, shared mailbox JWT/RLS, manager-or-creator delete, fallback shared history, dan participant selection admin/trainer. Tidak menambah scope tim. | Belum dijawab Fajar                                       |

#### Prasyarat DB / E2E

- `apps/api/.env.integration` ada; SUPABASE_URL dan SUPABASE_DB_URL diperiksa hanya klasifikasi host dan keduanya loopback. Kredensial tidak dicetak. Tidak ada query DB, migrasi, atau akses remote pada audit ini.
- `apps/web/playwright.config.ts` memakai webServer root `pnpm dev` (turbo). Jangan menjalankan begitu saja: root dev dapat meluncurkan API/Telefun dengan environment lain. Fase 1 harus memakai konfigurasi Playwright lokal yang membatasi server web, seluruh provider/WFM/DB loopback, dan fail-closed egress guard sebelum dynamic import router. Gate-only spec tidak boleh memakai body valid yang memicu AI/worker/mutasi; assertion non-FORBIDDEN bukan bukti correctness scope/auth/status.
- `sidakRealBackend.ts` memakai real JWT dan DB lokal tetapi identitas middleware disuntik; untuk AC4 perlu tambahan E2E melalui authMiddleware asli supaya unknown role tidak sekadar diuji via gate injeksi.
- Tidak ada supabase/config.toml dan supabase/functions pada checkout ini; tidak mengklaim pemeriksaan Edge Functions atau status stack DB lokal. Perlu pemeriksaan kesiapan lokal setelah izin query read-only.
- Fase 0.5 masih pending: mohon hasil atau otorisasi query `select role, count(*) from profiles group by role;` untuk DB lokal dan DB remote yang ditunjuk. Jika ada qa/user/alias/nilai lain, S1 berlaku; jangan migrasi otomatis.
- Fase 0.6: matriks dan rekomendasi diserahkan lewat docs dan log ini; persetujuan belum diperoleh. Fase 1–7 belum dijalankan. Tidak ada RED/GREEN, unit/E2E, typecheck, build, commit/push/deploy atau migrasi yang diklaim.

#### Perintah evidence

- `git status --short` exit 0 (baseline hanya plan untracked); `git rev-parse --short HEAD` exit 0 → `9ad7eea`.
- `graphify --help`, `graphify query 'requireRole' --budget 1200`, `graphify explain 'apps/api/src/middleware/role.ts'` exit 0; batas hasil dicatat di atas.
- `node` heredoc memakai TypeScript AST lokal: inventaris calls/endpoint dan createRoute, exit 0 → 132 calls/18 file, 162 endpoint modul, 48 route web. JSON scratch di `/tmp/access-control-inventory.json` dan `/tmp/access-control-web-inventory.json`, bukan product/test files.
- `rg` source/import/caller dan pembacaan file audit dilakukan; missing optional path (config Supabase, functions, beberapa nama file tebakan) dicatat sebagai tidak tersedia, bukan gate verification produk.
- `pnpm exec prettier --write docs/auth-rbac.md plans/markdown/access-control-unification.md` exit 0. `git diff --check` exit 0 pada batch awal. Pemeriksaan akhir format dan struktur matriks dicatat di bawah.

#### Keputusan Fajar dan pemeriksaan prasyarat (2026-10-06)

- Matriks dan rekomendasi D1–D4 disetujui; pemisahan scope peserta dari ownership akun/shared disetujui sesuai pertanyaan. Tidak meminta persetujuan yang sama lagi.
- Query DB lokal read-only diizinkan. Remote **tidak** diizinkan untuk diakses oleh agent; Fajar akan memberikan hasil remote.
- S5: **pertahankan admission WebSocket legacy saat ini**; tidak menambahkan gate admin/trainer menyeluruh. Normalisasi/katalog harus tetap membedakan participant selection admin/trainer dari self/owned admission legacy. Koreksi catatan keputusan di atas: S2/S5 sudah diputuskan, bukan lagi menunggu izin.
- Pemeriksaan lokal memakai `node` heredoc + `pg.Client`, target hanya dari `apps/api/.env.integration`, hostname loopback diwajibkan, `connectionTimeoutMillis: 5000`, query dirancang dalam `BEGIN READ ONLY` / `ROLLBACK` dengan SQL persis `select role, count(*) from profiles group by role;`. Exit 1: **LOCAL_ROLE_QUERY_FAILED ECONNREFUSED**. Koneksi tidak terbentuk sehingga SQL belum dieksekusi dan tidak ada distribusi role lokal yang bisa disimpulkan.
- `docker context show` exit 0 → `orbstack`; `docker info --format '{{.ServerVersion}}'` exit 1: daemon tidak tersedia pada socket OrbStack. CLI Docker dan Supabase ada. `scripts/integration/supabase-bootstrap.sh` diperiksa: script melakukan reset DB lokal, jadi tidak dijalankan dengan izin yang hanya read-only. `supabase/config.toml` juga belum tersedia.
- Skill `supabase:supabase` dibaca sebelum pemeriksaan kesiapan lanjutan; tidak melakukan schema change/remote query/migrasi atau reset.
- Struktur dokumen dicek ulang lewat Python (scratch JSON AST di /tmp): **exit 0**, 132 gates/18 file, 165 endpoint API unik cocok source, kolom role/source citations valid, 48 deklarasi web cocok source. Dua percobaan checker sebelumnya exit 1 karena menghitung ulang tabel dampak penghapusan (187 vs 165) dan pencocokan literal tidak menerima padding tabel Prettier (`/`). Checker dibatasi ke matriks dan membaca whitespace tabel; tidak mengubah gate produk untuk meluluskan pemeriksaan.
- `pnpm exec prettier --check docs/auth-rbac.md plans/markdown/access-control-unification.md` dan `git diff --check` sebelumnya exit 0; pemeriksaan final diulang setelah log keputusan ini ditulis.
- Fase 0.5 masih terbuka: DB lokal belum siap dan hasil remote belum diterima. Fase 1–7 belum dimulai; RED/GREEN/E2E/typecheck/build belum dijalankan. S1 **belum dapat dinilai**, bukan diasumsikan bersih. Lanjut setelah local stack siap tanpa reset yang tidak diizinkan dan Fajar mengirim distribusi remote.

- Gate akhir batch dokumentasi: `pnpm exec prettier --write docs/auth-rbac.md plans/markdown/access-control-unification.md` exit 0; `pnpm exec prettier --check docs/auth-rbac.md plans/markdown/access-control-unification.md` exit 0; `git diff --check` exit 0. Working tree akhir hanya docs/auth-rbac.md modified dan plan milik pengguna untracked yang sudah diberi audit/log.

#### Pemeriksaan remote mandiri (2026-10-06, instruksi lanjutan Fajar)

- Fajar meminta agent memeriksa sendiri. Instruksi lanjutan dipakai sebagai otorisasi query remote read-only; keputusan sebelumnya untuk tidak mengakses remote digantikan khusus untuk pemeriksaan ini. Tidak ada otorisasi mutasi/migrasi/deploy remote.
- `supabase_list_projects({})` berhasil (`isError: false`). Satu project aktif `ruosnjmtywcrghjgqugz`, cocok dengan `supabase/.temp/project-ref` dan host URL Supabase pada .env/.env.local; hanya hostname dibaca/dicetak, tanpa secret.
- `supabase_execute_sql` pada project tersebut berhasil (`isError: false`), SQL persis:

  ```sql
  BEGIN READ ONLY;
  SELECT role, count(*) FROM public.profiles GROUP BY role ORDER BY role;
  COMMIT;
  ```

| Role    | Jumlah |
| ------- | ------ |
| admin   | 3      |
| agent   | 14     |
| leader  | 2      |
| trainer | 3      |

- Total 22 profil, tanpa role di luar empat nilai. **S1 remote bersih** pada snapshot ini. Bukti tidak menggantikan pemeriksaan DB lokal/E2E disposable dan tidak mengizinkan migrasi remote.
- Fase 0.5 tinggal pemeriksaan lokal; tidak lagi menunggu Fajar menyediakan hasil remote. Stack lokal sebelumnya `ECONNREFUSED` dan daemon OrbStack tidak tersedia. Fase 1–7 tetap belum diimplementasikan.

### 2026-10-06 — Implementasi lokal setelah OrbStack siap (Lane D)

- Pemeriksaan loopback `BEGIN READ ONLY; SELECT role,count(*) FROM public.profiles GROUP BY role; COMMIT;` menunjukkan leader 5 dan trainer 5; remote sebelumnya admin 3, trainer 3, leader 2, agent 14. S1 bersih. Tidak reset DB atau memigrasikan remote.
- D3 diselesaikan sesuai rekomendasi awal: audit tidak menemukan alias; `normalizeRole` menerima empat canonical role (trim/lowercase), alias trainers/agents dihapus dan nilai lain null.
- Katalog capability berasal dari matriks source yang disetujui, bukan contoh plan. Seluruh requireRole backend/frontend dimigrasikan; role lama tidak diterima pada boundary. Role domain (jabatan, mode heatmap, kolom TL, speaker) dipertahankan.
- `DataScope` menyatukan all/self/team/none peserta. `AccountScope` adalah pemisahan yang disetujui Fajar untuk ownership akun; shared mailbox PDKT dan admission WebSocket legacy tetap mengikuti kontrak semula. Adapter signature layanan lama memakai null=all dan []=none, dengan aplikasi filter terpusat.
- Scope lookup/RPC gagal -> 503 SCOPE_UNAVAILABLE. Folder agents/heatmap/temuan/dashboard tidak pernah memperlakukan scope kosong sebagai tanpa filter.
- Migrasi `20261006120000_unify_application_access_roles.sql` dijalankan melalui `pg.Client` pinned loopback dalam BEGIN/COMMIT (bukan remote, tidak melakukan repair migration history). Metadata constraint/default dan tiga policy Telefun diverifikasi. RED tambahan menemukan trigger handle_new_user masih menulis user; migrasi diperbaiki agar signup memakai default agent/pending lalu diterapkan ulang lokal.
- Dua file unit legacy hanya disesuaikan untuk kompatibilitas compile (QA type fixture menjadi leader; caller guard memakai capability). Tidak menambah atau menjalankan suite non-E2E, tidak menghapus suite inventory.

#### Bukti RED dan karakterisasi

| Perintah                                                                                                                                                    | Hasil                                                                                                 | Log lokal                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `pnpm --dir apps/web exec playwright test --config playwright.access-api.config.ts --project access-matrix` sebelum produk diubah                           | exit 1: 4 role canonical hijau; qa/tl/spv/om 4 RED (expected 403, received 400)                       | `/tmp/access-matrix-red.log`                                                |
| `pnpm --dir apps/web exec playwright test --config playwright.access-api.config.ts --project access-scope` sebelum resolver/boundary                        | RED: RPC failure mendapat 500, unknown role mendapat 200; koreksi fixture list agents terpisah        | `/tmp/access-scope-red.log`                                                 |
| `pnpm --dir apps/web exec playwright test --config playwright.access-web.config.ts` karakterisasi                                                           | exit 0, 9 passed                                                                                      | `/tmp/access-web-characterization.log`                                      |
| `pnpm --dir apps/web exec playwright test --config playwright.access-api.config.ts --project access-scope --grep 'profile role constraint'` sebelum migrasi | exit 1: role user diterima (expected 23514, received undefined)                                       | `/tmp/access-db-red.log`                                                    |
| `pnpm --dir apps/web exec playwright test --config playwright.access-api.config.ts` sesudah migrasi pertama                                                 | exit 1: 64 passed; signup trigger user bertentangan dengan CHECK baru; 6 scope cases belum dijalankan | `/tmp/access-api-final.log`                                                 |
| `pnpm --dir apps/web exec playwright test --config playwright.access-api.config.ts` setelah perbaikan trigger                                               | exit 0: 72 passed (8 matrix, 56 schedule, 8 scope/auth/signup); matriks menguji 162 endpoint x 4 role | `/tmp/access-api-verified.log`, `apps/web/test-results/access-all-api.json` |

#### Review maintainability dan keputusan library

- Review `thermo-nuclear-code-quality-review` meliputi seluruh owned diff: katalog authorization terpusat; scope account/peserta dipisahkan; type snapshot dipindahkan ke pemilik resolver agar tidak melingkar; cabang empty-team yang sudah diwakili none dibuang; fixture locked matrix menjadi 265 baris. Tidak ada file runtime baru >1000 baris atau layer AI/frontend business logic baru. Tidak ada blocker struktural tersisa.
- Browser E2E tambahan awal memakai path yang tidak terdaftar (/profiler/view dan /sidak/view); fixture diperbaiki ke /profiler/table dan /sidak/dashboard. Run berikutnya mengungkap swallowed redirect: properti isRedirect lama bukan API versi terpasang. Context7 `/tanstack/router` dan source installed router-core mengonfirmasi `isRedirect(error)` + rethrow. Perbaikan tetap deny pada kegagalan fetch/approval; hanya redirect yang disengaja diteruskan.
- Grep AC1: tidak ada requireRole call atau daftar role auth qa/tl/spv/om di runtime; sisa literal hanya mode heatmap, jabatan peserta/scoring dan kolom jadwal WFM (daftar Bukan role). `git diff --check` exit 0 pada pemeriksaan sementara.
- Usulan RLS can_access_peserta ditulis di docs/auth-rbac.md; tidak membuat policy peserta baru.

#### E2E browser final

`pnpm --dir apps/web exec playwright test --config playwright.access-web.config.ts` -> exit 0, **11 passed**, tanpa skipped/flaky (log `/tmp/access-web-approved.log`, artifact `apps/web/test-results/access-web.json`). Role navigation empat akun, deep-link management agent, pending approval KTP/SIDAK leader dan tiga state sidebar terverifikasi. Report API/browser dan outputDir dipisahkan agar run browser tidak menghapus artifact API. Seluruh request API/auth browser dilayani fixture allowlist, egress tak dikenal ditolak; ini bukti UI/guard, bukan mutasi remote.

#### Penyelesaian gate dan artifact

- Setelah lint menemukan dua no-unsafe-finally di fixture DB, cleanup error dikumpulkan dan diperiksa setelah finally agar tidak menimpa failure awal. E2E scope diulang: `pnpm --dir apps/web exec playwright test --config playwright.access-api.config.ts --project access-scope` -> exit 0, 8 passed (`/tmp/access-scope-approved.log`, `apps/web/test-results/access-api.json`). Artifact full 72 sebelumnya disimpan sebagai `apps/web/test-results/access-all-api.json`.
- `pnpm build` run pertama -> exit 0, 3 successful tasks (`/tmp/access-build-final.log`). Emit API/Telefun dan bundle web berhasil. Vite melaporkan plugin Tailwind transform skip; build tetap sukses. Gate diulang pada final integrated batch (`/tmp/access-build-approved.log`) sebelum pelaporan final.
- Run typecheck awal digantikan run final; run lama dihentikan saat tahap web E2E masih berjalan (Turborepo shutdown, bukan PASS penuh), tiga workspace sebelumnya sudah berhasil. Gunakan hanya hasil `pnpm typecheck` final dari `/tmp/access-typecheck-approved.log`.
- `graphify update .` mengestrak 1479/1479 file lalu lama pada analisis cluster. Proses dihentikan (exit 143) dan update graf AST/node/relasi final dijalankan dengan opsi resmi `graphify update . --no-cluster` (`/tmp/access-graphify-approved.log`). Tidak menjalankan semantic/LLM extraction; report cluster/visualisasi lama tidak dianggap bukti terbaru.
- Grep AC1 dan union role runtime diperiksa lagi: seluruh role auth berasal dari Role/catalog, termasuk Variables admin; tidak ada caller requireRole/konstanta daftar lama. Hanya literal domain dari daftar Bukan role yang tersisa.

#### Regresi final lengkap

- `pnpm --dir apps/web exec playwright test --config playwright.access-api.config.ts` -> exit 0, **74 passed**: 8 matrix, 56 schedule, 10 scope/auth/signup (`/tmp/access-api-complete.log`, `apps/web/test-results/access-api.json`). Dengan 11 browser, total **85 kasus unik** lulus. Dua kasus scope terakhir membuktikan admin/trainer all dan agent unlinked none.
- `pnpm lint` final -> exit 0, **4 successful tasks**, 0 errors (`/tmp/access-lint-complete.log`). Warning: 8 API dan 103 web; tidak menjalankan suite unit. `pnpm exec eslint apps/web/e2e/access-scope-api.spec.ts apps/web/src/__tests__/route-guards.test.ts apps/api/src/routes/admin.ts` -> exit 0 (`/tmp/access-scoped-lint.log`).
- `pnpm build` final -> exit 0, **3 successful tasks** (`/tmp/access-build-approved.log`), mencakup API, Telefun dan web production bundle.
- Root typecheck sebelumnya gagal hanya pada E2E matrix: Hono request bertipe Response | Promise<Response> tidak selalu mempunyai catch; tuple roles heterogen membuat includes hanya menerima intersection admin. Fixture diperbaiki memakai Promise.resolve dan some equality tanpa mengubah expectation. Root typecheck diulang (`/tmp/access-typecheck-complete.log`).

#### Gate penutup (selesai)

| Perintah                                                                            | Exit | Bukti                                                                                          |
| ----------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                                                                    | 0    | 4 successful tasks; termasuk web tsc + tsconfig.e2e.json. `/tmp/access-typecheck-complete.log` |
| `pnpm lint`                                                                         | 0    | 4 successful tasks; 0 errors, 8 API + 103 web warnings. `/tmp/access-lint-complete.log`        |
| `pnpm build`                                                                        | 0    | 3 successful tasks (API/Telefun/web). `/tmp/access-build-approved.log`                         |
| `pnpm --dir apps/web exec playwright test --config playwright.access-api.config.ts` | 0    | 74 passed; `/tmp/access-api-complete.log`, `apps/web/test-results/access-api.json`             |
| `pnpm --dir apps/web exec playwright test --config playwright.access-web.config.ts` | 0    | 11 passed; `/tmp/access-web-approved.log`, `apps/web/test-results/access-web.json`             |
| `graphify update . --no-cluster`                                                    | 0    | 1479 AST files, 14296 nodes/48458 edges; graf diperbarui. `/tmp/access-graphify-approved.log`  |
| `git diff --check`                                                                  | 0    | Diff bersih dari whitespace errors                                                             |

Manifest Graphify AST dibandingkan dengan MD5 seluruh owned TS/TSX: daftar stale kosong. Cache lokal tidak distage; cluster/HTML report lama tidak diklaim terbaru. Audit read-only DB lokal setelah cleanup kembali leader 5/trainer 5; fixture akun/participant/indikator milik E2E sudah dibersihkan. CHECK/default/policy metadata sesuai migrasi.

Tidak ada kegagalan gate akhir tersisa. Unit suites tidak dijalankan; dua file legacy hanya mendapat penyesuaian compatibility fixture/import. Tidak commit/push/deploy/migrasi remote. Perubahan meliputi shared catalog/types, gate API+broker, resolver/services scope, guard/nav/control web, Playwright/config, migrasi baru dan canonical docs. Tree awal berisi plan untracked milik Fajar; plan itu dipertahankan dan diisi log pelaksanaan.

### 2026-10-06 — Preflight remote setelah instruksi HOLD

- Fajar melarang apply remote dan meminta definisi asli signup, nama tiga policy Telefun, serta privilege ALTER POLICY storage. Semua pemeriksaan melalui Supabase execute_sql berhasil (`isError: false`), read-only; tidak ada apply/DDL/perubahan privilege.
- `pg_get_functiondef('public.handle_new_user'::regproc)` membuktikan fungsi remote masih insert role literal user dan status pending, tanpa logika tambahan dalam fungsi tersebut. Audit 22 profil canonical tidak membuktikan fungsi berbeda.
- Policy storage `Users read own telefun recordings` ada. Dua tabel public ada dan RLS aktif, tetapi policy `Users can view their own coaching summaries` dan `Users can view their own replay annotations` tidak ada; pg_policies tidak memuat policy apa pun untuk kedua tabel tersebut.
- Koneksi postgres bukan superuser dan bukan member/owner-role storage.objects (owner supabase_storage_admin; pg_has_role USAGE/MEMBER false). BYPASSRLS tidak memberi izin ALTER POLICY. Owner tabel public ialah postgres. Privilege runner apply lain belum dibuktikan.
- **Migrasi remote HOLD dan belum siap apply.** Perlu adaptasi terhadap policy remote yang hilang, parity pada DB disposable, verifikasi privilege runner, dan otorisasi apply terpisah. Definisi fungsi, snapshot policy/privilege, dan query reproduksi dicatat pada [preflight canonical](../../docs/auth-rbac.md#preflight-migrasi-remote--hold-2026-10-06). Tidak mengubah body migrasi atau menjalankan ulang gate produk untuk batch dokumentasi ini.

### 2026-10-06 — Penyesuaian migrasi setelah preflight (Claude Code)

- `apps/api/src/services/sidak-ranking-service.ts`: filter `accessibleIds.length > 0` diganti `applyPesertaScope(..., pesertaScopeFromIds(accessibleIds))` (sisa pola F10). `tsc` API exit 0, eslint file exit 0, access API E2E 74 passed.
- Fajar menyetujui penghapusan tiga `ALTER POLICY` Telefun dari `20261006120000_unify_application_access_roles.sql`; alasan dan urutan apply dicatat di `docs/auth-rbac.md` (Resolusi preflight). Migrasi diterapkan ulang ke DB lokal loopback via `psql -1 -v ON_ERROR_STOP=1` (exit 0; CHECK empat role dan default `agent` terverifikasi), lalu `playwright test --config playwright.access-api.config.ts` exit 0, 74 passed.
- Apply remote tetap menunggu otorisasi terpisah. Tidak ada DDL remote.

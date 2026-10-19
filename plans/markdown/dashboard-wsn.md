# Dashboard What / So what / Now what — spec untuk agen coding

Status: **tahap 1 selesai** (`40629898`), **tahap 2 selesai** (`cbceff0b`), dan **tahap 3 diimplementasikan serta diverifikasi**. Tahap 4 tetap opsional. Dibuat 2026-10-19 dari audit dan mockup "Audit Dashboard Wawasan" (sumber HTML: `/mnt/project-files/telaah-dashboard-wsn/index.html`, artifact `https://claude.ai/artifact/HVnhfxddJVuwzKdvFV9xUD`). Pemilik produk: Fajar.

> Mockup belum disetujui eksplisit oleh Fajar saat spec ini ditulis. Fajar meminta spec ini untuk dikerjakan agen lain, jadi kerjakan sesuai spec; bila Fajar mengubah sesuatu di mockup, ikuti perubahan itu.

## 0. Wajib dibaca sebelum mulai

1. `AGENTS.md` (aturan repo; menang atas spec ini bila bertentangan) dan `docs/AGENT_WORKFLOW.md` §3–§5.
2. Lane: tahap 1 dan 2 = **Lane C/D** (kontrak API SIDAK, cakupan data leader). Tahap 3 = Lane C. Muat skill/aturan `trainers-superapp-tdd`: E2E Playwright **RED dulu**, lalu GREEN.
3. Aturan yang paling sering dilanggar:
   - Setiap commit menambah satu baris `- type(scope): ringkasan` di bawah `## <tanggal hari ini>` di `CHANGELOG.md`, di commit yang sama (dicek `.githooks/pre-commit` dan CI).
   - Jangan menambah atau menjalankan unit test (Vitest). Bukti perilaku = Playwright E2E. Jangan menambah apa pun ke `scripts/test-core.json` / `scripts/test-fast.json`.
   - E2E hanya ke target lokal/disposable. Jangan pernah ke produksi. Tidak ada migrasi database di spec ini; bila Anda merasa butuh migrasi, berhenti dan tanya Fajar.
   - Tidak ada panggilan AI baru. Semua kalimat dibuat dengan aturan tetap (deterministik).
   - Pesan ke pengguna berbahasa Indonesia yang ramah; jangan tampilkan error database mentah.
4. **Aturan cakupan (keamanan):** leader hanya melihat agen dari tim yang disetujui. Semua data baru di spec ini harus dihitung dari data yang **sudah** dibatasi oleh `getAccessibleAgentIds` / `getAccessibleSidakFilters` / `resolveSidakFilterScope` di route yang sama. Jangan membuat query baru yang melewati batas ini. Nama agen hanya boleh keluar untuk agen dalam cakupan pemanggil.

## 1. Masalah yang diselesaikan (ringkas)

Setiap kartu data seharusnya menjawab: **What** (angka), **So what** (artinya: dibanding target/bulan lalu), **Now what** (langkah yang bisa diklik, sudah terfilter). Audit menemukan:

| #   | Temuan                                                                                   | Bukti di kode                                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Now what hampir tidak ada di dashboard; saran coaching hanya ada per agent               | `apps/web/src/components/sidak/AgentCoachingBrief.tsx`, `apps/api/src/services/sidak/agent-root-causes.ts`                                                              |
| T2  | Jumlah temuan mentah dibaca sebagai baik/buruk tanpa memperhitungkan jumlah agen diaudit | `apps/web/src/routes/dashboard/home/TrendCard.tsx` (`Delta`)                                                                                                            |
| T3  | Kartu "Pola temuan mingguan" SIDAK mengabaikan filter tim dan rentang bulan              | `apps/web/src/components/sidak/SidakDashboardHeatmap.tsx` hanya mengirim `year` + `serviceType`; `apps/api/src/routes/sidak/heatmap.ts` tidak punya parameter tim/bulan |
| T4  | Rata-rata skor tidak dibandingkan dengan target 95                                       | `SIDAK_QA_TARGET` di `apps/web/src/utils/sidakScoreStatus.ts`                                                                                                           |
| T5  | Tautan tidak membawa filter                                                              | `AttentionList.tsx` → `/sidak/agents`; `ServiceBreakdown.tsx` → `/sidak`                                                                                                |
| T6  | Grafik tren tidak menyorot parameter yang paling naik                                    | `apps/web/src/routes/sidak/dashboard.tsx`                                                                                                                               |

Di luar cakupan: laporan dampak pelatihan (EFEK, sudah ada di TNA), Beranda agent (tahap 4 opsional, jangan dikerjakan kecuali Fajar meminta), perubahan skema database, AI.

## 2. Peta kode yang relevan

| Bagian                                         | File                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route dashboard SIDAK (scope sudah diterapkan) | `apps/api/src/routes/sidak/dashboard.ts` → `GET /dashboard`, `GET /dashboard/trend`                                                                                                                                                                                                                                                    |
| Data dashboard SIDAK                           | `apps/api/src/services/sidak/dashboard-data.ts` (`getDashboardData`), `dashboard-trends.ts` (`buildDashboardTrends`: `paramTrend`, `sparklines`, `periodMetrics`), `dashboard-types.ts` (`DashboardTemuanRow`)                                                                                                                         |
| Pola penyebab + saran                          | `apps/api/src/services/sidak/agent-root-causes.ts` (`deriveAgentRootCauses`, fallback cluster `lainnya`)                                                                                                                                                                                                                               |
| Heatmap                                        | `apps/api/src/routes/sidak/heatmap.ts`, `apps/api/src/services/sidak/heatmap-service.ts` (`getSidakHeatmap`, `fetchCountableRows`, `fetchMissingDateRows`, `HeatmapScope`), skema query `sidakHeatmapQuerySchema` (cari dengan `rg sidakHeatmapQuerySchema`), klien web `apps/web/src/lib/sidak-heatmap-client.ts`                     |
| Filter tim → nama batch                        | `apps/api/src/services/sidak/access-scope.ts` (`resolveFolderFiltersByIds` → `filterNames` = nilai `profiler_peserta.batch_name`)                                                                                                                                                                                                      |
| Beranda "Perlu tindakan"                       | `apps/api/src/services/home/attention.ts`, kontrak `packages/types/src/home.ts`, UI `apps/web/src/routes/dashboard/home/AttentionList.tsx`                                                                                                                                                                                             |
| Tren Beranda                                   | `GET /dashboard/trend` → `apps/api/src/services/sidak/service-trends.ts` (`getServiceTrendForDashboardByRange`, **sudah** mengembalikan `periodStats[]` dengan `auditedAgents` dan `serviceStats` per periode), UI `TrendCard.tsx`, `ServiceBreakdown.tsx`, `useDashboardTrend.ts`                                                     |
| Halaman SIDAK                                  | `apps/web/src/routes/sidak/dashboard.tsx`, `apps/web/src/components/sidak/{KpiCard,SidakConditionSummary,SidakParameterRanking,SidakDashboardHeatmap,TopAgentsTable,SidakDashboardPanel}.tsx`                                                                                                                                          |
| Daftar agen SIDAK                              | `apps/web/src/routes/sidak/agents.tsx` (filter status lokal), `apps/web/src/utils/sidakAgentList.ts` (`AgentStatusFilter`, `isBelowTarget`), route di `apps/web/src/router.tsx` (`sidakAgentsRoute`, `validateSidakScopeSearch` di `apps/web/src/hooks/useSidakScope.ts`)                                                              |
| Tipe bersama                                   | `packages/types/src/sidak.ts` (`DashboardData`), `packages/types/src/home.ts`                                                                                                                                                                                                                                                          |
| Contoh E2E                                     | hermetic browser: `apps/web/e2e/home-staff.spec.ts`, `apps/web/e2e/sidak-scope.spec.ts`, helper `apps/web/e2e/helpers/hermeticShell.ts`, `sidakHomeFixture.ts`; backend nyata + Supabase lokal: `apps/web/e2e/sidak-dashboard-kpi-api.spec.ts`, `home-attention-api.spec.ts` (proyek terdaftar di `apps/web/playwright.api.config.ts`) |

## 3. Kontrak bersama (dibuat di tahap 2, dipakai tahap 3)

Tambahkan ke `packages/types/src/sidak.ts`:

```ts
export type DashboardInsightTone = "good" | "bad" | "neutral";

export interface DashboardInsightAgent {
  agentId: string;
  nama: string;
  tim: string | null;
  count: number; // temuan parameter fokus di periode terbaru
}

export interface DashboardInsights {
  /** Label periode terbaru dan pembandingnya, mis. "Okt 26" vs "Sep 26". null bila < 2 periode. */
  latestLabel: string | null;
  previousLabel: string | null;
  /** Apa yang terjadi. */
  what: {
    text: string;
    tone: DashboardInsightTone;
    findingsChangePct: number | null; // (latest-prev)/prev*100, 1 desimal; null bila prev = 0 atau tidak ada
    perAuditedLatest: number | null; // temuan per agen diaudit periode terbaru, 1 desimal
    perAuditedPrevious: number | null;
  };
  /** Artinya. */
  soWhat: {
    text: string;
    tone: DashboardInsightTone;
    scoreGapToTarget: number | null; // 95 - avgAgentScore periode terbaru, 1 desimal; null bila >= 95 atau tidak ada data
    belowTargetCount: number | null; // totalAudited - compliance periode terbaru
  };
  /** Parameter penyumbang kenaikan terbesar (null bila tidak memenuhi ambang). */
  focusParameter: {
    name: string;
    category: "critical" | "non_critical" | string;
    latestCount: number;
    change: number; // selisih absolut vs periode sebelumnya
    recommendation: string; // dari agent-root-causes
    agents: DashboardInsightAgent[]; // maks 10, urut count desc lalu nama
  } | null;
  /** Lakukan ini. */
  nowWhat: {
    text: string;
    action: "coach_focus_agents" | "open_ranking" | "none";
  };
  /** Perubahan per parameter (periode terbaru vs sebelumnya), untuk kartu Parameter teratas. */
  parameterChanges: Array<{
    name: string;
    latestCount: number;
    change: number | null;
  }>;
}
```

Lalu `DashboardData` mendapat field baru `insights: DashboardInsights | null` (null bila tidak ada data). Perbarui `emptyDashboardResponse` di server agar mengisi `insights: null`.

## 4. Aturan kalimat (wajib persis, deterministik)

Fungsi murni `buildDashboardInsights(input)` di file baru `apps/api/src/services/sidak/dashboard-insights.ts`. Tanpa I/O, tanpa `Date.now()`. Input: `periodMetrics` (urut lama → baru, dari `buildDashboardTrends`), `paramTrend`, `paretoData`, peta agen per parameter untuk periode terbaru, baris temuan parameter fokus di periode terbaru, `indicators`, `periodById`.

Definisi: `L` = periode terakhir di `periodMetrics`, `P` = periode sebelumnya. Target = 95 (pakai konstanta server yang sudah ada, `complianceThreshold` di `dashboard-data.ts`; pindahkan ke konstanta bersama bila perlu, jangan menulis 95 di dua tempat baru).

| Bagian                                             | Aturan                                                                                                                                                                                                                                     | Teks (contoh persis)                                                                                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| what, < 2 periode                                  | `latestLabel`/`previousLabel` null                                                                                                                                                                                                         | `"Belum ada periode pembanding untuk filter ini."`, tone neutral                                                                                   |
| what, P.total = 0                                  | `findingsChangePct` null                                                                                                                                                                                                                   | `"{L.total} temuan di {L.label}; {P.label} tanpa temuan, jadi persentase tidak dihitung."` neutral                                                 |
| what, \|perubahan\| < 5%                           |                                                                                                                                                                                                                                            | `"Temuan {L.label} relatif tetap ({+x,x}%) dibanding {P.label}."` neutral                                                                          |
| what, naik ≥ 5% dan per-agen-diaudit juga naik     |                                                                                                                                                                                                                                            | `"Temuan {L.label} naik {x,x}% dan temuan per agen diaudit juga naik ({a} → {b}). Kenaikan ini nyata."` bad                                        |
| what, naik ≥ 5% tapi per-agen-diaudit tidak naik   |                                                                                                                                                                                                                                            | `"Temuan {L.label} naik {x,x}%, tetapi temuan per agen diaudit tidak naik ({a} → {b}). Kenaikan ikut jumlah audit, belum tentu memburuk."` neutral |
| what, turun ≥ 5% dan per-agen-diaudit juga turun   |                                                                                                                                                                                                                                            | `"Temuan {L.label} turun {x,x}% dan temuan per agen diaudit juga turun ({a} → {b})."` good                                                         |
| what, turun ≥ 5% tapi per-agen-diaudit tidak turun |                                                                                                                                                                                                                                            | `"Temuan {L.label} turun {x,x}%, tetapi temuan per agen diaudit tidak turun ({a} → {b}). Penurunan ikut jumlah audit."` neutral                    |
| soWhat, skor L < 95                                |                                                                                                                                                                                                                                            | `"Rata-rata skor {L.label} {s}%, {gap} poin di bawah target 95; {n} agen belum mencapai 95."` bad                                                  |
| soWhat, skor L ≥ 95                                |                                                                                                                                                                                                                                            | `"Rata-rata skor {L.label} {s}%, sudah mencapai target 95; {n} agen belum mencapai 95."` good bila n = 0, selain itu neutral                       |
| soWhat + fokus                                     | bila `focusParameter` ada, tambahkan kalimat                                                                                                                                                                                               | `" {nama} menyumbang kenaikan terbesar (+{change})."` + `" Termasuk kritikal."` bila category critical                                             |
| focusParameter                                     | dataset non-total di `paramTrend` dengan `data[L]-data[P]` terbesar, **minimal +5**; seri dipecah dengan nama (`localeCompare("id")`)                                                                                                      | null bila tidak ada yang ≥ +5                                                                                                                      |
| recommendation                                     | jalankan `deriveAgentRootCauses({ temuan: baris temuan countable parameter fokus di periode L, indicators, periodById, maxResults: 1 })`; ambil `recommendation` cluster teratas. Bila hasil kosong, pakai teks fallback cluster `lainnya` |                                                                                                                                                    |
| agents                                             | dari loop agen di `getDashboardData`, hitung temuan countable per agen untuk parameter fokus **di periode L saja**; maks 10                                                                                                                |                                                                                                                                                    |
| nowWhat, ada fokus + agents                        | `action: "coach_focus_agents"`                                                                                                                                                                                                             | `"Coaching {k} agen dengan temuan {nama} terbanyak."`                                                                                              |
| nowWhat, tanpa fokus, ada agen bertemuan           | `action: "open_ranking"`                                                                                                                                                                                                                   | `"Tidak ada parameter yang naik berarti. Mulai dari agen dengan temuan terbanyak."`                                                                |
| nowWhat, tidak ada data                            | `action: "none"`                                                                                                                                                                                                                           | `"Belum ada tindakan yang disarankan untuk filter ini."`                                                                                           |

Format angka: desimal koma Indonesia (`new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 })`), tanda `+`/`−` eksplisit untuk perubahan. Per agen diaudit = `total / totalAudited` (null bila `totalAudited` = 0).

`parameterChanges`: untuk setiap dataset non-total, `latestCount = data[L]`, `change = data[L]-data[P]` (null bila < 2 periode).

Catatan pencocokan nama: `paramTrend` memakai `formatQAIndicatorName(indicator)` dari `indicator_id`, sedangkan Pareto/loop agen memakai `findIndicatorForRow` (konteks scoring). Pakai **nama dari `paramTrend`** sebagai kunci, cocokkan ke peta agen dengan nama yang sama; bila tidak ketemu, `agents: []` dan `nowWhat` jatuh ke `open_ranking`. Jangan menebak.

## Requirement — eksekusi tahap 1

Implementasikan hanya §5: heatmap dashboard mengikuti tim dan rentang bulan tanpa memperluas akses leader, dan KPI memiliki pembanding target/rate. Tahap 2–4 tidak termasuk. Lane D (kontrak API dan scope).

## Design — eksekusi tahap 1

Gunakan validator bersama, resolver folder yang ada, irisan ID peserta dengan scope leader, dan rentang tanggal layanan di service heatmap. Pertahankan hitungan tanpa tanggal lintas periode, default setahun, serta halaman heatmap/agen. Gunakan pola komponen dan warna semantik yang sudah ada; badge tanpa data/denominator nol tidak boleh mengarang angka.

## Tasklist — eksekusi tahap 1

- [x] E2E backend lokal dan browser hermetic ditulis dan terbukti RED.
- [x] Implementasi filter API/klien/komponen dan badge KPI.
- [x] E2E fitur GREEN, audit scope/visual, typecheck, lint, build, diff check (pengecualian regresi DB lokal lama dicatat di bawah).
- [x] Dokumentasikan kontrak dan bukti; tambah CHANGELOG.

### Bukti eksekusi tahap 1 — 2026-10-19

- RED API: `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --project=sidak-heatmap-filter-real-backend --workers=1 --trace on` → exit 1, tiga tes gagal sesuai kontrak: total tim 4 bukan 2, irisan leader 2 bukan 0, rentang terbalik 200 bukan 400. Tes error resolver tambahan juga RED (200 bukan 500), lalu helper folder diperbaiki agar melempar error.
- RED browser: `pnpm --dir apps/web exec playwright test e2e/sidak-dashboard-insights.spec.ts --grep 'filter tim/bulan heatmap' --workers=1 --trace on` → exit 1 karena request belum membawa `folder_ids`.
- GREEN API: perintah API di atas → exit 0, **4 passed**. Mencakup satu/multi-folder, UUID tak dikenal, batas akhir Februari tahun kabisat, hitungan tanpa tanggal, irisan leader, penolakan agen luar scope, validasi, dan error database ramah.
- GREEN browser final: `pnpm --dir apps/web exec playwright test e2e/sidak-dashboard-insights.spec.ts e2e/sidak-scope.spec.ts --workers=1 --trace on` → exit 0, **19 passed**. Run sebelumnya 18 passed/1 failed karena selector geometri masih mencari teks lama `Tahun penuh`; selector diperbarui tanpa melonggarkan batas geometri.
- Regresi backend tambahan: `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --project=sidak-heatmap-filter-real-backend --project=sidak-dashboard-kpi-real-backend --workers=1 --trace on` → exit 1, **8 passed, 1 failed**. Kegagalan hanya tes indeks lama: DB lokal tidak punya `idx_qa_temuan_tahun_id`; migrasi `supabase/migrations/20261017160000_qa_temuan_tahun_id_index.sql` sudah ada di HEAD sebelum perubahan ini. Empat tes perilaku KPI lama lulus. Tidak menerapkan migrasi atau mengubah tes indeks untuk menyembunyikan kegagalan ini.
- Regresi backend ulang setelah `supabase migration up --local` (12 migrasi tertunda di DB lokal, termasuk `20261017160000_qa_temuan_tahun_id_index.sql`): perintah yang sama → exit 0, **9 passed**, termasuk tes indeks tahun.
- `pnpm typecheck --concurrency=1` → exit 0 (4 workspace, termasuk tipe E2E).
- `pnpm lint --concurrency=1` → exit 0 (74 warning pada file lama di luar diff, tanpa error).
- `pnpm build --concurrency=1` → exit 0 (3 task).
- `git diff --check` → exit 0.
- Artefak repeatable: trace browser/API dan screenshot `kpi-{390,1280}-{light,dark}.png` di `apps/web/test-results/` (ignored, jangan commit karena trace dapat memuat auth lokal). Fixture API unik per run dan dibersihkan oleh `afterAll`.

### Review tahap 1

- Impeccable: **PASS** untuk permukaan yang berubah. Detector `impeccable detect --json` atas tiga file UI menghasilkan `[]`; E2E memeriksa kontras teks KPI ≥4,5:1 dan tanpa overflow pada 390/1280px, terang/gelap. Screenshot mobile terang dan desktop gelap dibaca langsung. Tidak ada kontrol interaktif baru; warna badge selalu disertai teks bermakna.
- Thermo-nuclear / review keamanan dalam sesi (bukan reviewer independen): **PASS** untuk diff. Validasi → resolver folder → irisan scope → query temuan/tanpa tanggal ditelusuri; JWT/RLS admin/trainer, batas layanan/agen leader, race guard heatmap, dan default halaman/agent tetap dipertahankan. Pengecualian kesiapan integrasi: indeks DB lokal lama di atas belum tersedia.
- Suite browser yang sudah >1.000 baris dipertahankan sebagai pemilik fixture/tes Dashboard yang ada; tambahan hanya dua tes kontrak, bukan suite duplikat. Tidak ada unit test baru/dijalankan, dependency baru, AI, perubahan skema, deploy, commit, atau push.
- Graphify query `getSidakHeatmap` dipakai untuk callers; `GRAPHIFY_MAX_WORKERS=1 graphify update .` selesai sekali (exit 0), cache tidak dilacak Git. Context7 `/supabase/supabase-js` mengonfirmasi range inklusif, order stabil, dan pemeriksaan error.
- File audit egress untracked milik pengguna tetap tidak disentuh. Tahap 2–4 belum diimplementasikan.

## 5. Tahap 1 — perbaiki angka yang tidak cocok (1 PR)

**Tujuan:** T3 dan T4.

### 5.1 Heatmap ikut filter tim dan bulan (backend)

- `sidakHeatmapQuerySchema`: tambah `folder_ids` opsional (string dipisah koma, tiap item UUID), `start_month` dan `end_month` opsional (int 1–12, `start_month <= end_month`, keduanya atau tidak sama sekali; selain itu 400 `VALIDATION_ERROR`).
- Route `GET /sidak/heatmap`: bila `folder_ids` ada, resolve dengan `resolveFolderFiltersByIds(folderIds)` → `filterNames`. Ambil id peserta yang `batch_name` ∈ `filterNames` (pola yang sama dengan `access-scope.ts` baris yang memakai `.in("batch_name", folderNames)`), lalu **irisan** dengan `scope.agentIds` bila leader (`filterScope` tidak null). Irisan kosong → respons kosong yang sah (sudah ditangani `getSidakHeatmap` bila `agentIds` = `[]`).
- `getSidakHeatmap` dan `fetchCountableRows`: tambah `startMonth`/`endMonth`; rentang tanggal menjadi `${year}-${MM(start)}-01` sampai hari terakhir `end` (pakai `new Date(Date.UTC(year, end, 0))`). Default tetap seluruh tahun. `fetchMissingDateRows` **tidak** diubah (memang "sejak dulu"), tetapi ikut irisan agen dari filter tim.
- Respons boleh menambah `startMonth`, `endMonth` di objek yang sudah ada bila tipenya mengizinkan; jangan mengganti nama field yang ada.
- Catatan untuk UI: heatmap memakai **tanggal layanan**, sedangkan kartu lain memakai **bulan periode QA**. Deskripsi kartu harus menyebut "per tanggal layanan" (sudah ada).

### 5.2 Heatmap ikut filter (web)

- `lib/sidak-heatmap-client.ts`: tambah `folderIds?: string[]`, `startMonth?`, `endMonth?` → query `folder_ids`, `start_month`, `end_month`.
- `SidakDashboardHeatmap.tsx`: prop baru `folderId: string | null`, `startMonth: number | null`, `endMonth: number | null`; kirim ke klien; deskripsi kartu menjadi `{layanan} · {tim atau "Semua tim"} · {Bln–Bln} {tahun} · per tanggal layanan`. Teks "temuan sepanjang {tahun}" menjadi "temuan pada rentang ini".
- `routes/sidak/dashboard.tsx`: teruskan `selectedFolder` (null bila `SIDAK_ALL_TEAMS`), `startMonth`, `endMonth`.
- Halaman `/sidak/heatmap` dan tab heatmap agent **tidak** berubah perilakunya (parameter baru opsional).

### 5.3 Pembanding target di KPI SIDAK

- `KpiCard.tsx`: prop opsional `badge?: { text: string; tone: "good" | "bad" | "warn" }` ditampilkan sebagai pil kecil di bawah delta (warna: good emerald-700, bad rose-700, warn amber-700, versi `dark:` seperti delta yang ada).
- `routes/sidak/dashboard.tsx` `KPI_CARDS`:
  - "Rata-rata Skor": bila `summary.avgAgentScore < 95` → badge bad `"{gap} di bawah target 95"`, selain itu good `"Mencapai target 95"`.
  - Kepatuhan: badge bad `"{n} agen belum ≥ 95"` dengan `n` dari `sparklines.compliance` titik terakhir (`totalAudited - count`); sembunyikan bila tidak ada titik.
  - "Total Temuan QA per Parameter": badge warn/good `"{x} per agen diaudit · naik|turun|tetap"` dari dua titik terakhir `periodMetrics` (`total/totalAudited`); sembunyikan bila < 2 periode.
  - Ganti `desc` "Kualitas performa rata-rata" menjadi `"Target 95"`.

### 5.4 E2E tahap 1 (tulis dulu, jalankan sampai merah, lalu implementasi)

- Backend nyata: tambah kasus ke `apps/web/e2e/sidak-dashboard-kpi-api.spec.ts` **atau** buat `sidak-heatmap-filter-api.spec.ts` (daftarkan proyek baru di `playwright.api.config.ts`). Fixture: 2 folder/tim, temuan dengan tanggal layanan di dua bulan berbeda. Buktikan: (a) `folder_ids` hanya menghitung tim itu; (b) `start_month/end_month` memotong tanggal; (c) leader dengan scope tim A yang meminta `folder_ids` tim B mendapat total 0; (d) `start_month > end_month` → 400.
- Hermetic browser: di spec SIDAK dashboard yang ada (cari dengan `rg "sidak/dashboard" apps/web/e2e`) atau spec baru, mock `/sidak/dashboard` dan `/sidak/heatmap`; buktikan request heatmap membawa `folder_ids`, `start_month`, `end_month` saat filter dipilih, dan pil "di bawah target 95" tampil dengan angka yang benar.

**Selesai bila:** semua E2E di atas hijau, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `git diff --check` bersih, CHANGELOG diisi.

## Requirement — eksekusi tahap 2

Lane D: tambah kontrak `insights` dari baris dashboard yang sudah dibatasi scope, tanpa query data atau panggilan AI baru. Tahap 3–4 tidak termasuk.

## Design — eksekusi tahap 2

Fungsi murni menghasilkan kalimat Indonesia deterministik, fokus kenaikan minimal +5, dan maksimal 10 agen terbaru. Gunakan target server bersama, registry saran coaching yang ada, dan nama parameter tren sebagai kunci. UI Operate mempertahankan token/komponen Dashboard: Kesimpulan → KPI → ringkasan lama; tiga kolom desktop/satu kolom mobile, disclosure native yang bisa dipakai keyboard, tautan TNA tersaring capability. Tanpa insight tidak mengarang ringkasan; tanpa pembanding/penyebut tampilkan keterbatasan data. Fokus tren hanya berlaku saat state seri belum diubah pengguna.

## Tasklist — eksekusi tahap 2

- [x] E2E API nyata dan browser hermetic RED.
- [x] Kontrak bersama dan komputasi insight scoped tanpa I/O baru.
- [x] Brief, disclosure agen bersama, perubahan parameter, dan fokus grafik.
- [x] E2E GREEN, review keamanan/Impeccable/thermo-nuclear, typecheck/lint/build.
- [x] Dokumentasi, CHANGELOG, bukti dan cleanup proses lokal.

### Bukti eksekusi tahap 2 — 2026-10-19

- RED API: `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --project=sidak-dashboard-brief-real-backend --workers=1 --trace on` → exit 1, tiga tes gagal karena `insights` belum tersedia. Fixture memakai tahun 2095, folder unik, JWT trainer/leader, backend dan PostgREST/RLS lokal nyata.
- RED browser: `pnpm --dir apps/web exec playwright test e2e/sidak-dashboard-brief.spec.ts --workers=1 --trace on` → exit 1 karena Kesimpulan belum tersedia. Fixture leader awalnya belum memasang approval SIDAK; setelah fixture diperbaiki, run `--grep 'leader has'` tetap RED pada Kesimpulan yang belum ada, bukan pada gate akses.
- Dua regresi tambahan dibuktikan RED lalu diperbaiki: `Sembunyikan Semua` sempat menyalakan kembali fokus; fokus di peringkat 14 sempat hilang karena batas 12 baris view-model chart lama. Pemilik daftar tetap membatasi tampilan ke delapan baris, termasuk fokus, tanpa mengubah helper Pareto untuk pemanggil lain.
- GREEN API final: `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --project=sidak-dashboard-brief-real-backend --project=sidak-heatmap-filter-real-backend --project=sidak-dashboard-kpi-real-backend --workers=1 --trace on` → exit 0, **13 passed**. Empat tes insight mencakup fokus +6, saran registry, periode terbaru, urutan/maksimal 10 agen, irisan leader, audit bertambah dua kali lipat, satu periode, kosong, stabil, turun nyata/ikut volume, baseline nol, dan tanpa temuan. Sembilan regresi tahap 1 (termasuk indeks) lulus.
- GREEN browser final: `pnpm --dir apps/web exec playwright test e2e/sidak-dashboard-brief.spec.ts e2e/sidak-dashboard-insights.spec.ts e2e/sidak-scope.spec.ts --workers=1 --trace on` → exit 0, **21 passed**. Mencakup keyboard disclosure, href detail/ranking/TNA, capability leader, insight null, parameter fokus di luar batas chart lama, saran otomatis terlihat, seri Total + fokus, dan kontrol chip lama.
- `pnpm typecheck --concurrency=1` → exit 0 (empat workspace, termasuk tipe E2E). Fixture legacy `sidak-ranking-route.test.ts` hanya ditambah `insights: null` di empat return value agar kontrak wajib tetap terkompilasi; tidak menambah atau menjalankan unit test.
- `pnpm lint --concurrency=1` → exit 0 (74 warning lama di luar perubahan, tanpa error).
- `pnpm build --concurrency=1` → exit 0 (tiga task).
- `git diff --check` dan pemeriksaan Prettier terscope → exit 0. File legacy yang hanya mendapat pembaruan fixture/konstanta tidak direformat massal.
- Artefak browser repeatable: trace dan `brief-{390,1280}-{light,dark}.png` di `apps/web/test-results/` (ignored, jangan commit auth lokal). Log API final sesi ini ada di `/tmp/dashboard-wsn2-api-final.log`; perintah API di atas menghasilkan ulang trace saat dijalankan.
- Supabase dijalankan dengan `supabase start -x logflare,vector`; env integration/guard membatasi request ke loopback. Tidak ada migrasi baru/diterapkan pada tahap 2, tidak ada akses remote/provider. Fixture dibersihkan oleh `afterAll`; `supabase stop` selesai setelah tes API. Tidak ada dev server/worker tambahan tersisa.

### Review tahap 2

- Impeccable **PASS**: detector atas Brief, disclosure, ParameterRanking, dan route menghasilkan `[]`. E2E memeriksa kontras teks Brief ≥4,5:1 dan tanpa overflow pada 390/1280px, terang/gelap; screenshot mobile terang dan desktop gelap dibaca langsung. Native `details/summary` menjaga state dan keyboard tanpa custom focus manager. Tidak ada redesign/token/dependency baru.
- Thermo-nuclear dan review scope dalam sesi **PASS** (bukan reviewer independen): data baru berasal dari `countableFindingRows` yang sudah terfilter; pengelompokan hanya periode terbaru, memakai kunci nama indikator yang sama dengan tren; tidak ada query baru atau I/O dalam builder. Target server dan saran fallback registry dipakai ulang; metadata kosong tidak ditebak; label pembanding, penyebut nol, urutan/cap, state chip, dan capability TNA diperiksa. Dua temuan UI di atas sudah diperbaiki dan E2E final hijau.
- Graphify query `buildDashboardTrends` membantu penelusuran; `GRAPHIFY_MAX_WORKERS=1 graphify update .` selesai sekali (exit 0). Context7 tidak diperlukan: perubahan memakai API internal/pola library yang sudah ada, tanpa dependency atau integrasi eksternal baru.
- Beranda, status agen, migrasi, AI, dan tahap 3–4 tidak diubah. File audit egress untracked pengguna tetap tidak disentuh. Commit tahap 2 diminta Fajar; push/deploy tidak termasuk.

## 6. Tahap 2 — Kesimpulan SIDAK (1 PR)

**Tujuan:** T1, T6.

### 6.1 Server

1. `dashboard-types.ts`: tambah `ketidaksesuaian?: string | null; sebaiknya?: string | null;` ke `DashboardTemuanRow` (kolomnya sudah di-select di `DASHBOARD_TEMUAN_COLUMNS`).
2. `dashboard-data.ts` di loop agen: bangun `Map<paramName, Map<agentId, { nama, tim, count }>>` dan `Map<paramName, DashboardTemuanRow[]>` **hanya untuk `period_id` = periode terbaru** (`trends.periodMetrics.at(-1)?.periodId`). Karena `trends` dihitung setelah loop, tentukan id periode terbaru lebih dulu dari `periods` yang terfilter, atau jalankan pengelompokan kecil setelah `buildDashboardTrends` dengan menyaring `rows` per `period_id`. Pilih cara kedua bila lebih sederhana; jangan query ulang database.
3. Panggil `buildDashboardInsights(...)` dan kembalikan `insights` di respons. Biaya tambahan harus O(baris periode terbaru); tidak ada query baru.
4. `periodById` untuk `deriveAgentRootCauses`: `new Map(periods.map(p => [p.id, p]))`.

### 6.2 Web

1. Komponen baru `apps/web/src/components/sidak/SidakDashboardBrief.tsx`: kartu tiga kolom (satu kolom di layar sempit) berlabel **"Apa yang terjadi" / "Artinya" / "Lakukan ini"**, ditempatkan di `routes/sidak/dashboard.tsx` **di atas** strip KPI, dengan judul `sr-only` "Kesimpulan". Kolom ketiga:
   - `coach_focus_agents`: tombol utama `"Lihat {k} agen"` yang membuka daftar (disclosure atau popover yang bisa diakses keyboard) berisi nama + tim + jumlah temuan, tiap baris tautan ke `/sidak/agents/$id`. Tombol kedua `"Buka TNA"` → `/tna` hanya bila `isCapabilityAllowed(role, "tna.read")`.
   - `open_ranking`: tombol `"Lihat ranking"` → URL ranking yang sama dengan `TopAgentsTable`.
   - `none`: hanya teks.
   - Tone: bad = teks rose, good = emerald, neutral = foreground. Jangan memakai warna sebagai satu-satunya penanda (teks sudah menjelaskan).
2. `SidakParameterRanking.tsx`: terima `insights`. Untuk tiap baris, tampilkan perubahan dari `parameterChanges` (`+n vs {previousLabel}` merah, `−n` hijau, `tetap` abu). Baris yang sama dengan `focusParameter` dibuka otomatis menampilkan `recommendation` dan tombol `"Lihat {k} agen"` (daftar yang sama seperti Brief; buat satu komponen kecil `FocusAgentsDisclosure` dan pakai di dua tempat). Kalimat penutup Pareto yang ada tetap; tambahkan `" {nama} naik paling tajam, jadi prioritas pertama."` bila ada fokus.
3. Grafik tren di `routes/sidak/dashboard.tsx`: saat data pertama kali dimuat (dan `hiddenParams` masih null), seri default yang aktif = Total + `focusParameter` (bila ada), bukan dua parameter pertama. Tambah pil di header panel `"{nama} +{change}"` dan satu kalimat di bawah grafik `"Kenaikan {latestLabel} terutama dari {nama} (+{change})."`. Perilaku chip lain tidak berubah.
4. Jangan mengubah `SidakConditionSummary` selain bila perlu menghindari kalimat ganda; Brief berada di atasnya dan ringkasan tetap.

### 6.3 E2E tahap 2

- Backend nyata (`sidak-dashboard-kpi-api.spec.ts` atau spec baru `sidak-dashboard-insights-api.spec.ts`): fixture dua periode, parameter X naik +6 dan agen diaudit tetap. Buktikan `insights.what.tone = "bad"`, teks berisi "Kenaikan ini nyata", `focusParameter.name = X`, `agents` urut dan maks 10, `recommendation` tidak kosong, dan leader hanya melihat agen timnya di `agents`. Kasus kedua: agen diaudit naik dua kali lipat → teks "Kenaikan ikut jumlah audit". Kasus ketiga: satu periode → teks "Belum ada periode pembanding".
- Hermetic browser: mock respons dengan `insights`; buktikan tiga kolom tampil, tombol "Lihat N agen" membuka daftar dan tautan ke detail agent, baris parameter fokus menampilkan saran, grafik default menyalakan parameter fokus.

## Requirement — eksekusi tahap 3

Telaah dan selesaikan perubahan fase 3 yang sudah ada di working tree, sesuai izin Fajar. Lane D karena kontrak `/home/attention` menambah nama agen scoped; perilaku Beranda/filter tetap §7. Tidak mengubah AI, skema, scope backend tren, atau tahap 4. Audit egress untracked tidak termasuk.

## Design — eksekusi tahap 3

Pertahankan implementasi yang benar: worstAgents dari direktori scoped, status awal URL yang divalidasi, periode-statistik dari endpoint yang ada, dan kalimat deterministik di web. Lengkapi tautan penyebab ke **bulan periode terakhir yang ditampilkan**, delta volume netral (warna baik/buruk hanya untuk laju per agen), layanan turun ke nol tetap tampil, dan bukti batas tiga agen dengan fixture ≥4 agen berisiko. Gunakan layout/token Beranda yang ada; tidak menambah dependency atau query baru. Native link/select tetap keyboard-accessible dan teks menjelaskan arah tanpa bergantung pada warna.

## Tasklist — eksekusi tahap 3

- [x] Capture dirty scope dan telaah perubahan yang sudah ada; proses startup sebelumnya sudah selesai, tidak ada worker/dev server aktif.
- [x] Tulis/jalankan E2E RED untuk kekurangan, tanpa mengklaim RED implementasi awal yang dikerjakan sesi lain.
- [x] Perbaiki hanya kekurangan dalam §7, pertahankan pekerjaan yang benar.
- [x] E2E browser/API lokal GREEN, review keamanan/Impeccable/thermo-nuclear, root typecheck/lint/build dan diff check.
- [x] Dokumentasi, CHANGELOG, bukti perintah, cleanup proses lokal.

### Hasil telaah dan bukti tahap 3 — 2026-10-19

- Perubahan awal yang benar dipertahankan: worstAgents dari direktori yang sudah scoped, salinan helper kalimat deterministik di web (tanpa import server), statistik per agen dari `periodStats`, CTA/status `below`, dan isi kartu layanan dari periode terakhir. Tidak membatalkan atau menulis ulang pekerjaan sesi sebelumnya.
- RED: `pnpm --dir apps/web exec playwright test e2e/home-staff.spec.ts --grep 'default YTD|kalimat apa|yang naik paling|menjadi nol' --workers=1 --trace on` → exit 1, empat tes gagal. Tiga bukti perilaku: tautan masih `dari=1&sampai=10` bukan bulan 9; warna delta layanan sama dengan teks netral karena tertimpa CSS; layanan turun ke nol hilang (0 baris, diharapkan 2). Tes default YTD tertahan oleh locator substring `Agen diaudit` yang juga cocok dengan stat baru `Per agen diaudit`; locator diperketat menjadi exact. Delta volume mentah diubah netral dan dibuktikan GREEN, tanpa mengklaim RED assertion itu sempat tercapai pada run awal.
- Perbaikan tautan mengenali kedua ejaan Agustus (`Agt` pada API, `Agu` pada UI); bila label periode tidak dikenali, CTA penyebab tidak menebak bulan. Bar layanan nol tidak membagi dengan maksimum nol.
- Regresi browser berikutnya menemukan nilai status tak dikenal tetap muncul karena hasil validasi digabung dengan query mentah. Validator mengembalikan `status: undefined` secara eksplisit; `pnpm --dir apps/web exec playwright test e2e/sidak-agents-list.spec.ts --grep 'status=below' --workers=1 --trace on` → exit 0. Nilai valid, fallback status, dan pelestarian layanan/tahun/rentang diuji.
- GREEN browser final: `pnpm --dir apps/web exec playwright test e2e/home-staff.spec.ts e2e/sidak-agents-list.spec.ts e2e/sidak-scope.spec.ts --workers=1 --trace on` → exit 0, **25 passed**. Termasuk worst-agent copy/href, laju per layanan, kalimat naik/turun/volume/stabil/baseline nol/satu periode/penyebut nol, tujuan bulan terakhir, porsi/delta layanan, warna computed, layanan turun 100%, scope/status URL, dan state kosong/error/partial yang sudah ada. Locator aktivitas `Rina Kusuma` juga diperketat menjadi exact karena nama kini muncul di dua section.
- GREEN API: `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --project=home-attention-real-backend --workers=1 --trace on` → exit 0, **6 passed**. Fixture diperkuat menjadi lima agen berskor berbeda: empat dalam scope leader dan satu di luar. Batas maksimal tiga, urutan skor/nama, eksklusi agen luar, tanpa token, role agent, leader belum disetujui, dan kegagalan sebagian dibuktikan lewat JWT/Hono/PostgREST lokal nyata. Tidak mengklaim RED backend sebelum implementasi awal dari sesi lain.
- `pnpm typecheck --concurrency=1` → exit 0 (empat workspace, termasuk tipe E2E).
- `pnpm lint --concurrency=1` → exit 0 (74 warning lama, tanpa error).
- `pnpm build --concurrency=1` → exit 0 (tiga task).
- `git diff --check` → exit 0. Prettier file TS/CSS yang berubah → exit 0 dengan pengecualian router: pemeriksaan penuh `router.tsx` memberi warning; `git show HEAD:apps/web/src/router.tsx` dibandingkan dengan hasil Prettier membuktikan baseline juga tidak clean. Tidak mereformat router massal untuk perubahan empat baris.
- Artefak browser repeatable ada di `apps/web/test-results/` (ignored): trace, `trend-{390,1280}-{light,dark}.png`, `services-{390,1280}-{light,dark}.png`, dan `attention-mobile.png`. Log API sesi ini ada di `/tmp/dashboard-wsn3-api.log`; perintah API di atas menghasilkan ulang trace. Jangan commit trace karena berisi auth lokal.

### Review tahap 3

- Impeccable **PASS**: detector atas AttentionList, TrendCard, ServiceBreakdown, halaman Agen, dan CSS menghasilkan `[]`. E2E kontras teks ≥4,5:1 dan tanpa overflow di 390/1280px, terang/gelap; screenshot layanan mobile terang, desktop gelap, dan perhatian mobile dibaca langsung. Tidak ada redesign atau kontrol custom baru.
- Thermo-nuclear dan review keamanan dalam sesi **PASS** (bukan reviewer independen): worstAgents tidak membuat query baru dan tidak mengambil nama di luar direktori scoped; tren backend/scope tidak diubah; state/error lama dipertahankan; perbandingan tidak membagi nol atau menyimpulkan kualitas dari jumlah mentah. Seluruh temuan di atas sudah diperbaiki dengan bukti E2E.
- Context7 `/tanstack/router` ditelusuri untuk perilaku search/undefined; bukti runtime invalid-status RED → GREEN menjadi penentu. Graphify query `getHomeAttention` dipakai saat discovery; `GRAPHIFY_MAX_WORKERS=1 graphify update .` → exit 0, satu update cache lokal.
- Supabase startup sebelumnya meninggalkan container berhenti tanpa proses CLI aktif. `supabase stop` lalu `supabase start -x logflare,vector` memulihkan stack **lokal**; setelah E2E, `supabase stop` selesai. Tidak ada migrasi/remote/provider/AI baru, unit test, atau dependency baru. Commit tahap 3 diminta Fajar pada 2026-10-20; push/deploy tidak termasuk. Audit egress untracked tetap di luar scope.

## 7. Tahap 3 — Beranda (1 PR)

**Tujuan:** T2, T5 di Beranda staff.

1. **Perlu tindakan** (`services/home/attention.ts`): pada item `agents_below_target` tambahkan `worstAgents?: { agentId: string; nama: string; score: number }[]` (maks 3, skor terendah dulu) dari `getAgentDirectorySummary` yang sudah dipanggil (agen `atRisk`). Perbarui `HomeAttentionItem` di `packages/types/src/home.ts`. UI `AttentionList.tsx`: baris kedua `"Terjauh: Rina (81,4), Dimas (84,0), Sari (85,2) dan {n-3} lainnya"`; tombol menjadi `"Lihat {n} agen"` dengan href `/sidak/agents?status=below`.
   - Perubahan "+4 dari bulan lalu" di mockup **tidak** dikerjakan di tahap ini (butuh hitungan direktori bulan sebelumnya; bukan data yang sudah ada).
2. **Daftar agen** (`routes/sidak/agents.tsx`, `router.tsx`, `utils/sidakAgentList.ts`): route `/sidak/agents` menerima search param `status` dengan nilai `AgentStatusFilter` plus nilai baru `"below"` (= `isBelowTarget`). Tambahkan opsi `{ value: "below", label: "Di bawah target 95" }`. Validator search harus mempertahankan param scope yang ada (`validateSidakScopeSearch`) dan menolak nilai status lain (abaikan, jangan error). State awal filter status membaca param ini.
3. **Tren temuan QA** (`TrendCard.tsx`, `useDashboardTrend.ts`): tambahkan `periodStats` ke tipe `TrendData` (sudah dikirim API). Tambah stat `"Per agen diaudit"` = total periode terakhir / `auditedAgents` periode terakhir (untuk layanan terpilih pakai `serviceStats[svc]`), dengan arah naik/turun vs periode sebelumnya. Tambah satu kalimat di bawah grafik dengan aturan yang sama seperti bagian `what` di §4 (salin aturan ke helper web kecil `homeTrendSentence()` di folder `dashboard/home/`; jangan import kode server). Tambah tautan `"Lihat penyebab di SIDAK"` → `/sidak?layanan={svc}&tahun={year}&dari={m}&sampai={m}` (param scope SIDAK yang divalidasi `validateSidakScopeSearch`; untuk "Semua layanan" jangan kirim `layanan`).
4. **Temuan per layanan** (`ServiceBreakdown.tsx`): judul tetap; isi menjadi **periode terakhir** pada rentang, dengan persentase porsi dan perubahan vs periode sebelumnya (`+18%` merah, `−6%` hijau, `tetap`). Kalimat `"{Layanan} naik paling tajam."` bila ada yang naik ≥ 5%. Tautan menjadi `"Buka SIDAK untuk {Layanan}"` → `/sidak?layanan={svc}` untuk layanan yang paling naik, atau `/sidak` bila tidak ada.
5. **Cakupan:** `GET /dashboard/trend` sudah memakai `getAccessibleAgentIds`; jangan ubah. `worstAgents` hanya dari direktori yang sudah terbatas scope.

### 7.1 E2E tahap 3

- Backend nyata `home-attention-api.spec.ts`: `worstAgents` maks 3, urut skor naik, leader hanya melihat agen timnya.
- Hermetic `home-staff.spec.ts`: kalimat tren, stat per agen diaudit, porsi dan perubahan per layanan, href tautan membawa filter; `/sidak/agents?status=below` membuka daftar dengan filter "Di bawah target 95" aktif.

## 8. Perintah verifikasi (tiap tahap)

```bash
pnpm install --frozen-lockfile
# Supabase lokal untuk spec backend nyata (lihat docs/e2e-testing.md)
pnpm --filter @trainers/web test:e2e -- e2e/<spec-hermetic>.spec.ts
pnpm --filter @trainers/web exec playwright test -c playwright.api.config.ts --project=<nama-proyek>
pnpm typecheck
pnpm lint
pnpm build
git diff --check
```

- Hanya satu run Playwright dalam satu waktu.
- Di container tanpa unduhan browser, Chromium ada di `/opt/pw-browsers/chromium`; bila perlu, buat config sementara dengan `launchOptions.executablePath` lalu **hapus sebelum commit**.
- Laporkan perintah dan hasil persisnya di PR. Jangan klaim cek yang tidak dijalankan.

## 9. Aturan PR

- Satu PR per tahap, berurutan (tahap 2 bergantung pada tipe tahap 1 hanya lewat file yang sama; rebase/merge `main` sebelum push karena `CHANGELOG.md` sering bentrok).
- Judul contoh: `fix(sidak): make the weekly pattern follow the team and month filters`, `feat(sidak): add the dashboard summary with focus parameter and coaching agents`, `feat(home): add comparisons and filtered links to the staff home`.
- Isi PR: Before/After dalam bahasa sederhana, lalu How singkat, lalu bukti perintah.
- Merge ke `main` boleh setelah CI hijau (izin tetap dari Fajar). Deploy produksi **tidak** termasuk.

## 10. Jebakan yang sudah diketahui

- `getDashboardData` memakai service-role (`supabaseAdmin`) dengan scope aplikasi; semua data baru harus berasal dari `rows` yang sudah difilter, bukan query baru.
- `periodMetrics` hanya berisi periode di rentang filter; "periode terakhir" berarti terakhir di rentang, bukan bulan kalender sekarang.
- Ringkasan "Kepatuhan" untuk rentang multi-bulan adalah rata-rata per bulan; pil "agen belum ≥ 95" harus memakai periode **terakhir**, dan labelnya menyebut periode itu bila rentang > 1 bulan (mis. `"23 agen belum ≥ 95 di Okt"`).
- `deriveAgentRootCauses` mencocokkan kata kunci; parameter tanpa kecocokan jatuh ke cluster `lainnya` dengan saran umum. Itu perilaku yang benar, jangan diganti dengan teks karangan.
- Heatmap: jangan mengubah `fetchMissingDateRows` menjadi berbatas tanggal.
- Jangan memakai `localStorage` untuk state filter baru; filter SIDAK ada di URL (`useSidakScope`).

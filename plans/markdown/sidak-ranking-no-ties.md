# SIDAK — peringkat tanpa berbagi posisi (spec untuk agen coding)

Status: **implementasi dan verifikasi selesai** (2026-10-20); urutan backend diperiksa lewat kode dan mock respons sesuai fallback task 4, bukan E2E backend nyata. Dibuat 2026-10-20 atas permintaan Fajar: "untuk ranking di sidak aku tidak ingin ada berbagi peringkat lagi". Pemilik produk: Fajar.

## 0. Wajib dibaca sebelum mulai

1. `AGENTS.md` (menang atas spec ini bila bertentangan) dan `docs/AGENT_WORKFLOW.md` §3–§5.
2. Lane: **C** (perilaku lintas `apps/api` + `apps/web` + `packages/types`, tanpa migrasi). Muat skill `trainers-superapp-tdd` sebelum mengedit: E2E Playwright **RED dulu**, lalu GREEN.
3. Aturan yang paling sering dilanggar:
   - Setiap commit menambah satu baris `- type(scope): ringkasan` di bawah `## 2026-10-20` (atau tanggal hari itu) di `CHANGELOG.md`, di commit yang sama.
   - Jangan menambah atau menjalankan unit test (Vitest). `apps/api/src/__tests__/sidak-ranking-route.test.ts` dan `sidak-ranking-service.test.ts` adalah inventaris lama: jangan dijalankan; bila asersinya jadi usang, tanya Fajar dulu sebelum mengubah atau menghapusnya.
   - Jalankan E2E fokus dari `apps/web`: `pnpm exec playwright test <spec> -g "<judul>"`. Satu run Playwright dalam satu waktu. Hanya target lokal.
   - Tidak ada migrasi, tidak ada query baru. Semua angka pemecah seri sudah ada di `TopAgentData` hasil `getDashboardData`, yang sudah dibatasi cakupan leader.
4. Jalankan `graphify` query untuk `buildBusinessRankMap`, `computeRanks`, `tiedNames`, `tiedAgents` sebelum mengedit (Lane C).

## 1. Requirement

Setiap agen mendapat nomor peringkat unik (1, 2, 3, … tanpa lompatan) di semua tampilan peringkat SIDAK. Teks "Berbagi peringkat …" hilang dari seluruh UI, laporan HTML, dan dokumentasi.

Tempat peringkat muncul hari ini:

| Tempat                                            | Arah                                                 | Kode sekarang                                                                                                                                                          |
| ------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Halaman `/sidak/ranking` (prioritas coaching)     | 1 = temuan **terbanyak**                             | `apps/web/src/utils/sidakRanking.ts` (`computeRanks`, `tiedNames`), `apps/web/src/routes/sidak/ranking.tsx` (`formatTieLabel`)                                         |
| `rankChange` di respons `/sidak/ranking`          | sama dengan di atas                                  | `apps/api/src/services/sidak-ranking-service.ts` (`buildBusinessRankMap`) — duplikat logika frontend                                                                   |
| Quickview detail agen (Tim Gabungan / Tim Leader) | 1 = temuan **paling sedikit** (`least_findings_ytd`) | `apps/api/src/services/sidak/agent-quickview.ts` (`getRankForFolder`), `apps/web/src/components/sidak/AgentPerformanceQuickview.tsx` (`buildTieText`, `TieDisclosure`) |
| Laporan agen HTML yang diunduh                    | sama dengan quickview                                | `apps/web/src/utils/agentReportHtml.ts` (`rankItem`)                                                                                                                   |

## 2. Design

### 2.1 Urutan pemecah seri (keputusan produk)

**Ranking prioritas** (`/sidak/ranking`, 1 = paling perlu perhatian):

1. `defects` terbanyak
2. `criticalFindings` terbanyak (anggap `undefined` = 0)
3. `score` terendah
4. `nama` A→Z (`Intl.Collator("id", { sensitivity: "base", numeric: true })`)
5. `agentId` A→Z (penjamin terakhir agar dua agen bernama sama tetap stabil)

**Ranking quickview** (`least_findings_ytd`, 1 = paling baik) adalah cermin langsung:

1. `defects` paling sedikit
2. `criticalFindings` paling sedikit
3. `score` tertinggi
4. `nama` A→Z
5. `agentId` A→Z

Nama di urutan 4 sengaja hanya dipakai bila semua angka kinerja sama persis; itu satu-satunya kriteria yang tidak bermakna kinerja, dan tooltip/catatan basis harus mengatakannya terus terang.

### 2.2 Satu sumber kebenaran di backend

- Tambah modul murni `apps/api/src/services/sidak/agent-rank-order.ts` dengan dua pembanding (`comparePriority`, `compareLeastFindings`) dan `assignRanks(agents, compare): Map<agentId, number>` yang memberi nomor `index + 1` setelah sort. Tidak ada logika "nilai sama = peringkat sama".
- `TopAgentData` di `packages/types/src/sidak.ts` mendapat `rank?: number` (peringkat prioritas). `getRankingData` mengisi `rank` untuk setiap baris; `withRankChange` memakai `assignRanks(…, comparePriority)` untuk periode kini dan pembanding, menggantikan `buildBusinessRankMap`. Jalur tanpa pembanding juga harus mengisi `rank`.
- `getRankForFolder` memakai `assignRanks(dashboard.topAgents, compareLeastFindings)` dan berhenti mengisi `tiedAgents`. Hapus `tiedAgents` dan `TiedPeerInfo` dari `SidakAgentRankQuickview` bila tidak ada pemakai lain (cek dengan graphify/grep); jika masih dipakai di luar SIDAK, berhenti dan tanya Fajar.

### 2.3 Frontend

- `ranking.tsx` membaca `agent.rank` dari respons; hapus `computeRanks`, `tiedNames`, `formatTieLabel`, dan prop `tiedNames` di `renderRow`. Peringkat tidak berubah saat tabel diurutkan per kolom (perilaku ini tetap).
- `downloadRankingXlsx` memakai `agent.rank` (hapus parameter `ranks`).
- `AgentPerformanceQuickview.tsx`: hapus `buildTieText`, `TieDisclosure`, dan rendering tie. Perbarui `RANKING_BASIS_NOTE` menjadi: `Semakin tinggi peringkat, semakin sedikit temuan YTD. Bila jumlah temuan sama, yang lebih sedikit temuan kritikal lalu skor QA lebih tinggi berada di atas.`
- `agentReportHtml.ts`: hapus blok `<details class="disclosure quickview-ties">` dan CSS-nya bila tidak terpakai lagi.
- Halaman `/sidak/ranking` mendapat catatan basis yang sama gayanya: `Urutan: temuan terbanyak, lalu temuan kritikal terbanyak, lalu skor QA terendah.` (letakkan di dekat judul tabel, teks ≥ 12px, tanpa uppercase).

### 2.4 Dokumentasi

- `docs/SIDAK_LOGIC_AND_SCORING.md`: ganti bagian "Berbagi peringkat" (baris sekitar 201 dan tabel sekitar 516–518) dan microcopy basis (sekitar 474) dengan urutan pemecah seri di §2.1.

## 3. Tasklist

1. **RED — ranking page.** Di `apps/web/e2e/sidak-ranking.spec.ts`, ganti test "jumlah temuan sama berbagi peringkat…" dengan test baru yang memakai mock berisi kolom `rank` dari backend dan baris seri berlapis:
   - A: 10 temuan, 2 kritikal, skor 90 → 1
   - B: 10 temuan, 1 kritikal, skor 80 → 2
   - C: 10 temuan, 1 kritikal, skor 85 → 3
   - D: 3 temuan → 4
     Asersi: nomor 1–4 unik, tidak ada teks `Berbagi peringkat` di tabel, nomor tidak berubah setelah klik sort "Rata-rata Skor QA", dan catatan urutan tampil. Jalankan, pastikan merah karena alasan yang benar.
2. **RED — quickview.** Di `apps/web/e2e/sidak-agent-detail-states.spec.ts`, ubah test yang sekarang mengharapkan `Berbagi peringkat 1 dengan Tania…` (sekitar baris 280–320) agar mengharapkan peringkat unik dan tidak ada teks `Berbagi peringkat`, plus microcopy basis baru. Jalankan, merah.
3. **RED — laporan unduhan.** Di `apps/web/e2e/sidak-agent-report-download.spec.ts` (sekitar baris 3241) balik asersi menjadi `not.toContain("Berbagi peringkat")`. Jalankan, merah.
4. **RED — backend nyata.** Bila sudah ada spec E2E yang memanggil `/api/v1/sidak/ranking` dan `/sidak/agents/:id/quickview` ke backend lokal tanpa mock (cari dengan grep), tambahkan satu kasus seri; bila belum ada, catat di laporan akhir bahwa urutan backend hanya dibuktikan lewat mock respons + kode, dan tanya Fajar apakah perlu spec backend nyata.
5. **GREEN — backend.** Buat `agent-rank-order.ts`, isi `rank` di `getRankingData`, ganti `buildBusinessRankMap`, ubah `getRankForFolder`, perbarui tipe di `packages/types`.
6. **GREEN — frontend.** Kerjakan §2.3. Jalankan ketiga spec di atas sampai hijau.
7. **Docs.** Kerjakan §2.4.
8. **Gerbang.** `pnpm --filter @trainers/types build` (bila ada), typecheck `apps/api` dan `apps/web`, lint file yang disentuh, `git diff --check`, lalu `graphify update .`. Jalankan review `thermo-nuclear` (wajib Lane C) dan perbaiki temuannya.
9. **Commit + push ke `main`** dengan entri CHANGELOG, mis. `- fix(sidak): give every agent a unique rank using critical findings, QA score, then name as tie-breakers`.

## 4. Selesai berarti

- Tidak ada string `Berbagi peringkat` tersisa di `apps/`, `packages/`, `docs/SIDAK_LOGIC_AND_SCORING.md` (kecuali log historis di `docs/rebuild-logs/`).
- `/sidak/ranking`, quickview, dan laporan HTML menampilkan nomor unik sesuai §2.1.
- `rankChange` dihitung dari urutan yang sama dengan nomor yang tampil.
- Laporan akhir mencantumkan perintah persis dan hasil setiap spec E2E yang dijalankan.

## 5. Laporan eksekusi — 2026-10-20

### Lingkup dan batas bukti

Lane C, dikerjakan langsung tanpa delegasi. Seluruh RED di bawah dijalankan sebelum perubahan runtime GREEN. Tidak ada unit test ditambahkan atau dijalankan. Fajar memberi izin lanjutan untuk memperbarui asersi unit lama di `apps/api/src/__tests__/sidak-agent-quickview.test.ts` setelah penghapusan kontrak peer menyebabkan typecheck gagal; jumlah kasus tidak ditambah. Dua unit ranking yang disebut di bagian 0 tidak diubah atau dijalankan.

Backend memiliki satu sumber urutan (`agent-rank-order.ts`); prioritas dan quickview saling mencerminkan angka kinerja, tetapi nama dan ID tetap A–Z. Jalur tanpa pembanding tetap mengisi `rank`, sedangkan `rankChange` hanya bermakna saat ada pembanding. UI dan Excel membaca rank backend; laporan HTML tidak lagi merender peer seri. Fixture JSON respons lama sengaja dipertahankan hanya dalam kasus regresi untuk membuktikan metadata ekstra diabaikan.

**Batas task 4:** pencarian `sidak/ranking`, `/ranking?`, dan `quickview` pada `apps/web/e2e` tidak menemukan spec backend nyata untuk kedua endpoint ranking/quickview. Ada test quickview pada `tna-efek-report-api.spec.ts`, tetapi kontraknya daftar training EFEK, bukan urutan peringkat. Sesuai fallback plan, urutan backend/rankChange dibuktikan melalui penelusuran kode + respons mock browser, bukan integrasi backend/database nyata. Pertanyaan kepada Fajar apakah perlu spec backend lokal nyata tambahan sudah disampaikan; izin memperbarui unit lama tidak dianggap izin tambahan tersebut.

Semua browser run menggunakan konfigurasi Playwright repo: Vite `http://localhost:3005`, satu worker, `reuseExistingServer: false`, Supabase/API proxy/Telefun loopback port 9, dan harness fail-closed. Tidak ada target produksi, provider nyata, migrasi, atau query produk baru.

### Perintah dan hasil E2E

Semua perintah berikut dijalankan dari `apps/web`. Log diarahkan ke `/tmp/sidak-ranking-evidence/`; trace/screenshot disalin ke subdirektori artefak di sana agar tidak terhapus run berikutnya. Tidak ada artefak auth lokal yang di-commit.

| Tahap                        | Perintah persis                                                                                                                                                                                  | Hasil                                                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RED ranking                  | `pnpm exec playwright test e2e/sidak-ranking.spec.ts -g "peringkat backend unik dan tetap setelah diurutkan per skor" --trace on`                                                                | Exit 1, 1 gagal: B diharapkan posisi 2, diterima 1. Log `red-ranking.log`.                                                                                                                |
| RED quickview                | `pnpm exec playwright test e2e/sidak-agent-detail-states.spec.ts -g "peringkat unik" --trace on`                                                                                                 | Exit 1, 2 gagal: label seri masih muncul. Log `red-quickview.log`.                                                                                                                        |
| RED laporan                  | `pnpm exec playwright test e2e/sidak-agent-report-download.spec.ts -g "Data BERBAHAYA" --trace on`                                                                                               | Exit 1, 1 gagal: HTML masih memuat label seri. Log `red-report.log`.                                                                                                                      |
| GREEN ranking percobaan awal | `pnpm exec playwright test e2e/sidak-ranking.spec.ts --trace on`                                                                                                                                 | Tool timeout 120 detik; log mencatat 5 kasus gagal karena JSX sibling tanpa wrapper. Bukan RED kontrak. JSX diperbaiki, Vite milik run dihentikan, lalu diulang. Log `green-ranking.log`. |
| GREEN ranking ulang          | `pnpm exec playwright test e2e/sidak-ranking.spec.ts --trace on`                                                                                                                                 | Exit 0, 12 lulus. Log `green-ranking-retry.log`.                                                                                                                                          |
| GREEN quickview              | `pnpm exec playwright test e2e/sidak-agent-detail-states.spec.ts --trace on`                                                                                                                     | Exit 0, 20 lulus. Log `green-quickview.log`.                                                                                                                                              |
| GREEN laporan                | `pnpm exec playwright test e2e/sidak-agent-report-download.spec.ts --trace on`                                                                                                                   | Exit 0, 25 lulus. Log `green-report.log`.                                                                                                                                                 |
| Verifikasi akhir             | `pnpm exec playwright test e2e/sidak-ranking.spec.ts e2e/sidak-agent-detail-states.spec.ts e2e/sidak-agent-report-download.spec.ts e2e/sidak-agent-detail-layout.spec.ts --workers=1 --trace on` | Exit 0, 68 lulus: ranking 12, states/quickview 20, report-download 25, layout 11. Log `final-e2e.log`, trace di `final-e2e-artifacts/`.                                                   |

### Gerbang compile, lint, build, dan graph

Perintah dari root kecuali dinyatakan lain:

- `pnpm --dir apps/api typecheck`: awalnya exit 1 (8 diagnostik akses `tiedAgents`/implicit-any di unit quickview lama); setelah persetujuan Fajar dan penyesuaian asersi, exit 0. Tidak ada eksekusi test runner unit.
- `pnpm --dir apps/web typecheck`: awalnya exit 1 (4 properti `tiedAgents` pada fixture bertipe kontrak baru); setelah fixture biasa dibersihkan dan JSON legacy dipisahkan dari tipe produk, exit 0.
- `@trainers/types` tidak memiliki script `build`; tidak mengarang atau menambah script. Penggantinya untuk validasi compile: `pnpm --filter @trainers/types typecheck` → exit 0.
- `pnpm exec turbo run typecheck --concurrency=1 --cache=local:rw --cache-workers=1` → exit 0, 4/4 workspace sukses, tanpa emit.
- Lint scoped: `pnpm exec eslint apps/api/src/__tests__/sidak-agent-quickview.test.ts apps/api/src/services/sidak-ranking-service.ts apps/api/src/services/sidak/agent-quickview.ts apps/api/src/services/sidak/agent-rank-order.ts apps/web/e2e/helpers/sidakAgentReportFixture.ts apps/web/e2e/sidak-agent-detail-layout.spec.ts apps/web/e2e/sidak-agent-detail-states.spec.ts apps/web/e2e/sidak-agent-report-download.spec.ts apps/web/e2e/sidak-ranking.spec.ts apps/web/src/components/sidak/AgentPerformanceQuickview.tsx apps/web/src/routes/sidak/ranking.tsx apps/web/src/utils/agentReportHtml.ts apps/web/src/utils/agentReportHtmlStyles.ts apps/web/src/utils/sidakRanking.ts packages/types/src/sidak.ts` → exit 0, tanpa diagnostik.
- `pnpm exec turbo run lint --concurrency=1 --cache=local:rw --cache-workers=1` → exit 0, 4/4 workspace sukses; web memuat 66 warning pada file yang tidak disentuh, 0 error.
- `pnpm exec turbo run build --concurrency=1 --cache=local:rw --cache-workers=1` → exit 0, 3/3 task build sukses. Cache remote dimatikan; tidak ada deployment.
- Sebelum edit, `graphify query "buildBusinessRankMap" --budget 500`, `graphify query "computeRanks" --budget 500`, `graphify query "tiedNames" --budget 500`, dan `graphify query "tiedAgents" --budget 500` dijalankan serial, exit 0. Hasil terakhir mengarah ke dokumentasi; pemakai sebenarnya diverifikasi dengan `rg`. Tidak ada pemakai `TiedPeerInfo` di luar SIDAK.
- Setelah batch kode akhir, `GRAPHIFY_MAX_WORKERS=1 graphify update .` → exit 0; 17.549 node, 33.816 edge. HTML graph dilewati oleh tool karena melebihi batas 5.000 node. Cache `graphify-out/` tidak di-commit.
- `git diff --check` → exit 0.
- `rg -n 'Berbagi peringkat' apps packages docs/SIDAK_LOGIC_AND_SCORING.md` → exit 1, **tidak ada kecocokan** (hasil yang diharapkan). Asersi negatif E2E memakai regex whitespace, bukan literal terlarang.
- `rg -n 'buildBusinessRankMap|computeRanks|tiedNames|TiedPeerInfo|tiedAgents' apps/api/src/services apps/web/src packages/types/src` → tidak ada kecocokan. Metadata peer hanya tersisa pada fixture legacy dan asersi ketiadaannya.

### Review thermo-nuclear

**Verdict: PASS**, dengan batas bukti backend nyata di atas. Skill tersedia dan dipakai untuk self-review; bukan CLI, subagen, atau review independen.

- Diff lengkap diperiksa, termasuk helper baru, tipe, kedua service, render UI, ekspor Excel/HTML, CSS, fixture, E2E, dan asersi unit yang disetujui.
- Comparator ditelusuri: temuan → kritikal (`undefined` = 0) → skor → collator nama Indonesia → ID deterministik. `assignRanks` menyalin array, memberi `index + 1`, tanpa perubahan input.
- `rankChange` memakai comparator prioritas yang sama untuk kedua periode; jalur tanpa pembanding dan quickview agen di luar cohort tetap ditangani eksplisit.
- Tidak ada perubahan authorization/RLS, mutasi persisten, provider, query, atau dependensi. Cakupan leader tetap mengikuti dashboard.
- Render peer/disclosure/CSS mati dihapus, bukan ditambal. Frontend tidak menghitung ulang rank. Nilai rank yang tidak tersedia ditampilkan kosong/netral, bukan diisi nomor buatan.
- Temuan sementara pada typecheck dan JSX sudah diperbaiki, lalu verifikasi akhir di atas lulus. Tidak ada temuan material P0–P2 tersisa dalam lingkup plan.
- File fixture/report E2E besar sudah ada sebelum pekerjaan ini; hanya blok kontrak terkait yang disentuh, tidak dibuat abstraksi atau salinan baru dan tidak dilakukan reformat massal.

Commit/push mengikuti task 9, dengan entri CHANGELOG pada tanggal eksekusi. Tidak ada deploy produksi.

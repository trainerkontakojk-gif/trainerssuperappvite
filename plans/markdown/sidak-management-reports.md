# SIDAK — Laporan Manajemen

## Requirement

Tambahkan lapisan laporan manajemen pada `/sidak/reports-data` di atas daftar temuan yang sudah ada. Pengguna dapat memilih preset Bulanan, Kuartal (Q1–Q4), Semester, Tahunan, YTD, atau rentang kustom; preset hanya mengisi filter `Tahun`, `Dari bulan`, dan `Ke bulan` yang sama. Hasil dapat diunduh sebagai workbook Excel multi-sheet dan PDF ringkasan eksekutif.

Excel memuat delapan sheet berikut, dalam urutan tetap:

1. **Ringkasan** — per layanan dan bulan: agen diaudit, sesi diaudit, temuan countable, tiket bertemuan, rata-rata skor agen, compliance, zero-error, dan delta terhadap periode sebelumnya. Sertakan subtotal kuartal yang beririsan dengan rentang dan total rentang.
2. **Rekap Tim** — per `tim` × layanan × bulan dengan metrik yang sama seperti Ringkasan (agen diaudit, sesi, temuan, tiket bertemuan, rata-rata skor agen, compliance, zero-error, delta), subtotal kuartal, total rentang, dan baris rincian per `batch_name` di bawah setiap tim. Tim diambil dari `profiler_peserta.tim` dan `batch_name` saat laporan ditarik (belum ada histori tim).
3. **Rekap Leader** — satu blok per leader dengan akses SIDAK berstatus approved saat laporan ditarik: nama leader, jumlah agen dalam scope, layanan dalam scope, lalu per layanan × bulan metrik yang sama seperti Ringkasan, subtotal kuartal, dan total rentang. Satu agen bisa masuk ke lebih dari satu leader, jadi baris antar-leader tidak dijumlahkan menjadi total.
4. **Rekap Agen** — satu baris per agen+layanan agar skor layanan berbeda tidak tercampur: nama, tim, batch, layanan, sesi, temuan, skor Januari–Desember, subtotal Q1–Q4, skor rentang/tahun, jumlah bulan dengan skor ≥95 (`x/N`), peringkat, dan tren.
5. **Pareto** — matriks parameter × bulan dengan kategori critical/non-critical, hitungan per bulan, total, kontribusi persen, kontribusi kumulatif, dan jumlah agen terdampak.
6. **Critical** — daftar temuan riil yang kategorinya critical menurut rule version periode terkait, dilengkapi kolom Bulan.
7. **Tindak Lanjut** — agen ber-skor rentang <95, turun pada dua bulan kalender berurutan yang sama-sama diaudit, atau mengalami parameter countable yang sama pada ≥2 bulan. Sertakan tiga parameter terburuk dan jumlah bulan berulang.
8. **Detail Temuan** — baris actionable yang sama dengan Workspace Data saat ini. Pertahankan header ekspor `Seharusnya` demi kompatibilitas.

Baris metadata pada awal setiap sheet menyatakan mode, service, agent (mode individu), parameter (dengan keterangan bahwa filter ini hanya berlaku untuk Detail Temuan), `showArchived`, tahun, rentang bulan, service allowlist efektif, dan `data ditarik pada <timestamp>` Asia/Jakarta. Bulan tanpa audit harus kosong/`–`, bukan 0 atau 100, dan tidak masuk denominator rata-rata. Skor multi-bulan agen mengikuti dashboard: rata-rata skor agen per periode yang diaudit. Compliance tahunan/kuartalan utama memakai skor rata-rata periode ≥95; tampilkan juga `x/N bulan ≥95`. Delta untuk metrik hitungan adalah persentase relatif, untuk metrik persen/skor adalah poin persentase, mengikuti aturan Delta KPI dashboard. Bila denominator pembanding nol/tidak tersedia, delta ditampilkan `–`.

PDF tidak berisi raw detail. Isinya KPI terhadap periode pembanding, tren enam bulan, top-10 parameter, dan daftar tindak lanjut. PDF juga memuat perbandingan antar tim dan antar leader. PDF kuartalan/tahunan menambahkan tren bulanan, perbandingan layanan, dan parameter yang membaik/memburuk. Nama agen boleh tampil di PDF (keputusan Fajar 2026-11-24).

Populasi harus konsisten dengan sumber angka dashboard: bagian Ringkasan/Rekap/Cakupan (bila fase 3) memakai audit presence termasuk sesi phantom-only; bagian Pareto/Critical/Tindak Lanjut memakai hanya temuan riil countable. Detail tetap mengikuti aturan Workspace Data: buang phantom dan hanya tampilkan baris dengan Temuan serta Rekomendasi terisi. Jangan membuat scoring di frontend, SQL, atau materialized cache.

Batas akses sama dengan dashboard dan laporan data: autentikasi/capability, leader hanya tim yang diizinkan, `allowedServiceTypes`, peserta SIDAK yang dikecualikan, soft-delete dan `showArchived` sesuai kebijakan yang sudah ada. Gunakan Hono RPC typed (`hc<AppType>`) serta `fetchApi`/klien SIDAK saat ini, dan shared response types di `packages/types`. Error ke pengguna harus ramah. Tidak ada migrasi, snapshot periode, atau penguncian angka pada v1. Proses generate/download baru di UI memakai satu status union eksplisit melalui `useReducer`.

## Design

### Sumber data dan agregasi

- Tambahkan endpoint management report di `apps/api/src/routes/sidak/reports.ts`, di bawah capability `sidak.reports.generate` seperti `POST /reports/data`. Validasi filter dan periode di server; jangan mengandalkan filter UI sebagai batas keamanan.
- Service baru mengambil data dalam scope yang telah diselesaikan server, memakai jalur temuan/dashboard yang sama, lalu mengagregasi tabel laporan. Pertahankan satu sumber per-request agar seluruh sheet dan PDF memakai snapshot respons yang sama. Detail actionable dapat memakai `getDataReportRows()` dengan filter yang sama; jangan mengganti normalisasi header/kolom detail yang sudah ada.
- Konsolidasikan bagian inti agregasi periode agar report memakai fungsi/aturan dashboard yang sudah ada (`getScoreRows`, `isCountableFinding`, `countFindingTickets`, `loadPeriodScoringContext`, `normalizePeriodScoringRows`, `calculateQAScoreFromTemuan`, grouping audit/session dan threshold `SIDAK_COMPLIANCE_TARGET`). Hindari menyalin rumus scoring ke service baru. Skor dan kategori setiap bulan harus diselesaikan memakai konteks rule version untuk service+periode itu. Sertakan metadata versi per service-bulan dan flag bila lebih dari satu versi berlaku di rentang.
- Ambil data pembanding berupa **rentang sebelumnya dengan panjang yang sama** (per layanan dan scope yang sama) hanya untuk delta: Bulanan → bulan sebelumnya, Kuartal → kuartal sebelumnya, Semester → semester sebelumnya, Tahunan/YTD → rentang bulan yang sama di tahun sebelumnya, rentang kustom → N bulan tepat sebelum awal rentang (boleh menyeberang tahun). Delta baris bulanan di dalam rentang tetap dibanding bulan sebelumnya. Data pembanding tidak menambah baris rentang, Pareto, atau total Excel. Jika salah satu bulan pembanding tidak memiliki periode/audit, delta `–`, bukan hitungan parsial. Kuartal/Semester yang mencakup bulan berjalan hanya memasukkan bulan sampai bulan berjalan dengan label `berjalan — data sementara`; subtotalnya tetap dibandingkan dengan kuartal sebelumnya penuh.
- Tabel periodik memuat bulan kalender yang diminta walaupun belum ada audit. Baris tanpa audit diproyeksikan kosong. Total rentang dan subtotal kuartal Ringkasan/Rekap Tim memakai bobot audit-periode Dashboard: `avgAgentScore = Σ(avgAgentScore × totalAudited) / Σ(totalAudited)`, `complianceRate = Σ(compliance) / Σ(totalAudited) × 100`, dan `zeroErrorRate = Σ(round(zero / 100 × totalAudited)) / Σ(totalAudited) × 100`. Persen/skor dibulatkan dua desimal; hitungan compliance tiap periode membandingkan skor agen yang belum dibulatkan dengan ambang `≥95`. `agentsAudited` pada agregat tetap jumlah agen unik, sama dengan dashboard `totalAgents`. Rekap Agen tetap memakai mean skor periodik per agen dan menampilkan `x/N bulan ≥95`; jangan memakai aturan skor agen unik untuk total tim/rentang.
- Ringkasan menghasilkan baris bulan, subtotal per kuartal yang bersinggungan dengan rentang, dan total rentang. Temuan dan tiket dihitung per bulan lalu dijumlahkan; nomor tiket yang sama pada bulan berbeda tetap satu hitungan per periode sesuai `countFindingTickets()`.
- Pareto memakai temuan countable saja; kategori diambil dari konteks historis periode, agen terdampak dihitung unik dalam rentang, dan ranking parameter deterministik (jumlah desc lalu nama). Critical memakai baris countable non-phantom yang kategorinya critical pada rule periodik. Tindak Lanjut dibatasi ke agen dengan temuan countable untuk kriteria temuan; nilai skor untuk kriteria <95 tetap diambil dari agregasi audit dashboard. Tiga parameter terburuk diurutkan dari hitungan temuan desc, kategori critical lebih dulu pada seri, lalu nama.
- Rekap Tim memakai agregasi yang sama dengan Ringkasan, hanya dikelompokkan per `tim` (lalu `batch_name`) dan layanan; rata-rata skor tim = rata-rata skor agen yang diaudit di tim itu pada periode tersebut. Tim hanya mencakup agen dalam scope pemanggil, jadi leader hanya melihat tim/batch dari access group yang disetujui. Rollup per _leader_ tidak dibuat di v1 karena leader tidak dipetakan ke satu tim (akses lewat access group many-to-many; lihat `docs/LEADER_APPROVAL_ACCESS.md`).
- Rekap Leader: untuk setiap leader dengan permintaan akses modul `sidak` yang approved dan masih berlaku saat laporan ditarik, ambil scope lewat `getLeaderScopeSnapshot(leaderId, "sidak")` (`apps/api/src/services/access/leader-scope.ts`, yang juga dipakai `resolveDataScope`), lalu iris dengan scope pemanggil dan `allowedServiceTypes` leader itu. Agregasi memakai baris temuan yang sudah diambil sekali untuk request, difilter di memori per himpunan `peserta_id`; jangan fetch ulang per leader. Visibilitas: admin/trainer melihat semua leader; leader hanya melihat blok miliknya sendiri; role lain tidak mendapat sheet ini. Leader yang scope-nya kosong ditampilkan dengan keterangan `scope kosong`, bukan disembunyikan. Scope adalah snapshot saat laporan ditarik (belum ada histori access group), sama seperti tim. Tidak ada perubahan skema.
- Skor pada Rekap Agen dan peringkat dihitung per agen+layanan. Catatan parity: `getDashboardData` mengelompokkan per agen (`groupTemuanByAgent`) dan memberi skor setiap periode memakai `service_type` baris pertama periode itu. Jadi parity skor per agen dengan dashboard hanya dijamin untuk filter satu layanan. Untuk "Semua Layanan", E2E parity membandingkan total/rata-rata per layanan. Agen yang diaudit di lebih dari satu layanan dalam satu periode dicatat sebagai temuan legacy dashboard; jangan ditiru diam-diam dan jangan mengubah dashboard tanpa keputusan Fajar. Periode yang tidak diaudit tetap kosong. Untuk mencegah skor historis tercampur antar versi, expose perubahan versi sebagai catatan/flag, bukan menghitung ulang seluruh histori memakai rule terbaru.

### Periode dan presentasi

- Preset merupakan kontrol kenyamanan, bukan kontrak API baru: Bulanan mengisi bulan terpilih: semua bulan yang sudah lewat dan bulan berjalan boleh ditarik, bulan mendatang tidak dapat dipilih, default bulan berjalan, dan bulan berjalan diberi label `berjalan — data sementara` di UI, Excel, dan PDF (berlaku juga untuk Kuartal/Semester/Tahunan/YTD yang mencakup bulan berjalan); Kuartal memilih 3 bulan Q1–Q4; Semester memilih 6 bulan; Tahunan memilih Jan–Des; YTD memilih Jan sampai bulan berjalan hanya jika tahun yang dipilih adalah tahun berjalan; rentang kustom mempertahankan bulan saat ini. Semua preset memakai state filter tahun/bulan yang sudah ada.
- Bulan dan label laporan memakai locale Indonesia. Sheet Excel memberi header kolom stabil, tipe angka numerik untuk angka/persen, lebar kolom yang wajar, dan metadata filter/timestamp sebelum tabel. Download dibuat dengan ExcelJS yang sudah dipakai aplikasi; jangan menambah dependency.
- PDF memakai `jspdf` dan pola layout/text dari generator laporan agen (`agentReportPdf*.ts`); impor dinamis agar tidak membebani halaman sebelum diminta. PDF mencantumkan filter dan waktu tarik data. Nama agen boleh tampil (daftar tindak lanjut dan peringkat), tetapi teks temuan/rekomendasi/tiket mentah tetap tidak masuk PDF.
- Tambahkan status lifecycle UI terpusat: `idle`, `loading`, `ready`, `exportingExcel`, `exportingPdf`, `error`. Perubahan filter membatalkan/menyingkirkan hasil request lama agar report lama tidak terlihat sebagai hasil filter baru. Pertahankan pencarian, paginasi, dan Excel detail Workspace Data yang sudah berjalan.

### Invarian dan interpretasi

- Hitungan audit/session mencakup phantom clean session; hitungan temuan/tiket/Pareto/Critical tidak. `isCountableFinding()` adalah definisi temuan countable, bukan syarat Workspace Data: Detail Temuan tetap mensyaratkan Temuan+Rekomendasi non-kosong.
- Tren penurunan dua bulan hanya terbentuk dari bulan kalender berturut-turut yang sama-sama memiliki audit; bulan kosong memutus urutan. Pengulangan parameter berarti parameter countable yang sama ditemukan di sedikitnya dua bulan berbeda.
- Flag versi rule berubah jika versi yang dipakai pada service-bulan dalam rentang tidak tunggal. Jangan menganggap label/nama kategori parameter saja cukup untuk menyamakan identitas; gunakan identitas indikator snapshot dan nama display dari scoring context.
- Jangan mengubah skema database untuk v1. Snapshot periode immutable bukan source of truth yang ada saat ini.

## Tasklist

### Lane, workflow, dan urutan rilis

Fitur yang direncanakan adalah **Lane D**: endpoint/report contract baru dan pengolahan lintas UI, API, shared types, serta akses SIDAK. Implementasi bukan Lane A walaupun dokumen ini sendiri hanya perubahan rencana. Sebelum edit kode, executor harus:

1. Baca `AGENTS.md`, `docs/AGENT_WORKFLOW.md`, dokumen SIDAK, dan skill `trainers-superapp-tdd`; klasifikasikan ulang bila discovery mengubah scope. Buat/konfirmasi rencana ini sebelum implementasi.
2. Jalankan Graphify query sempit untuk `getDashboardData`, `getDataReportRows`, `sidakReports`, dan caller RPC laporan. Jika hasil tidak relevan/stale, ulangi sekali dengan simbol/path spesifik, lalu gunakan `rg`, imports, tests, schema, dan manifests; catat fallback.
3. Muat `trainers-superapp-tdd` sebelum E2E-first RED/GREEN. Karena ditambah UI ekspor, ikuti `ui-ux-pro-max` sebelum desain implementasi dan `impeccable` sebelum gate akhir untuk layout/responsif/aksesibilitas yang berubah. Wajib `thermo-nuclear` sesudah implementasi Lane D dan sebelum final checks.
4. Context7 tidak diperlukan untuk penggunaan ExcelJS/jsPDF/Hono yang sudah ada dan pola yang tervalidasi dalam repo. Bila implementasi memerlukan API eksternal baru, versi/deprecation tidak jelas, atau API library berubah, resolve library ID dan dokumentasi versi tepat melalui Context7 sebelum memakai API tersebut; catat hasil ringkas.
5. Jalankan semua test serial dengan target lokal/disposable saja, Playwright `retries: 0`, dan output workbook yang benar-benar diunduh. Tidak ada unit test. Bila ada kontrak yang E2E tidak dapat membuktikan secara andal, berhenti dan ajukan ke Fajar sebelum tes non-E2E; nyatakan kontrak, batas E2E, dan alternatif terkecil.
6. Fase 1 backend harus dirilis/tersedia sebelum web memakai endpoint baru. Push ke `main` memicu deploy API production; jangan melakukan deploy/push produksi tanpa otorisasi eksplisit saat eksekusi. Koordinasikan agar web tidak dirilis sebelum endpoint API aktif, atau gunakan satu rilis tersinkron yang menjamin urutan deployment.
7. Setiap commit implementasi menyertakan satu entri `CHANGELOG.md` di bawah tanggal commit dan trailer `Verified:` yang hanya menyebut check yang benar-benar lulus. Tidak ada commit/push dalam tugas penyusunan rencana ini.

### Fase 1 — Endpoint, Excel, preset: Ringkasan, Rekap Tim, Rekap Agen, Pareto, Detail Temuan

**File yang direncanakan**

- Buat `apps/api/src/services/sidak/management-report.ts` untuk validasi domain/agregasi report dan bentuk response.
- Ubah `apps/api/src/services/sidak-service.ts` untuk export service baru.
- Ubah `apps/api/src/routes/sidak/reports.ts` untuk route typed, validator, `sidak.reports.generate`, scope IDs, allowed services/folders, `showArchived`, dan error response aman. Router barrel sudah mendaftarkan `sidakReports`; konfirmasi tetap tidak perlu perubahan tambahan.
- Ubah `packages/types/src/sidak.ts` (barrel `packages/types/src/index.ts` sudah re-export SIDAK) untuk filter, metadata, monthly/service/agent/Pareto/detail types dan response contract.
- Ubah `apps/web/src/routes/sidak/reports-data.tsx` untuk preset, panggilan typed endpoint, status reducer, dan tombol ekspor; pertahankan filter dan tabel existing.
- Buat `apps/web/src/routes/sidak/management-report-excel.ts` untuk sheet Fase 1 (Ringkasan, Rekap Tim, Rekap Agen, Pareto, Detail Temuan — lima sheet, sudah dalam urutan final) dan metadata masing-masing sheet memakai ExcelJS yang ada. Ubah `apps/web/src/lib/excel-utils.ts` hanya bila diperlukan untuk helper download multi-sheet yang dapat dipakai ulang; jangan mengubah `writeFlatExcel` atau workbook lama.
- Bila refactor diperlukan agar scoring dashboard/report berbagi satu sumber, ubah hanya `apps/api/src/services/sidak/dashboard-data.ts` dan/atau buat helper agregasi periode yang dipakai keduanya; pertahankan response dashboard yang ada dan tambahkan E2E parity.
- Buat `apps/web/e2e/sidak-management-reports-api.spec.ts` dan daftarkan project backend lokal di `apps/web/playwright.api.config.ts` bila tidak dapat memakai project konfigurasi yang sudah ada. Buat `apps/web/e2e/sidak-management-reports.spec.ts` untuk alur browser hermetic.

**Urutan kerja dan bukti**

1. Tulis RED E2E backend dan browser terlebih dahulu. API spec memakai real Hono + JWT + Supabase disposable loopback dengan fixture tahun/folder unik; browser spec menguji endpoint baru yang dimock fail-closed. Jangan import API secara statis sebelum env loopback dipin; ikuti `sidakRealBackend`/`loadApiModules()`.
2. API E2E membuktikan: pemetaan preset/rentang dan validasi; service dan agent scope (termasuk leader serta `allowedServiceTypes`); soft-delete/excluded peserta dan showArchived sesuai akses; audit phantom ikut agen/sesi namun tidak menambah finding/ticket; bulan kosong blank; skor per-agent/per-month cocok dengan `GET /sidak/dashboard` untuk filter identik; compliance/zero error dan delta memakai denominator/units yang benar; penemuan kategori/version mengikuti rule version per bulan; flag bila versi berubah; angka Rekap Tim per tim/batch konsisten dengan total Ringkasan untuk scope yang sama dan leader hanya menerima tim dalam scope-nya; parameter Pareto counts dan detail actionable mengikuti kriteria masing-masing; API failure tidak berubah menjadi report kosong/sukses.
3. Browser E2E membuktikan preset hanya mengubah Tahun/Dari/Ke bulan, filter berubah menghilangkan hasil basi, status async tidak tumpang-tindih, dan unduhan `.xlsx` riil berisi lima sheet Fase 1 berurutan (Ringkasan, Rekap Tim, Rekap Agen, Pareto, Detail Temuan). Baca file dengan helper ExcelJS yang sudah ada; assert metadata filter/timestamp, kolom, angka parity dashboard, bulan kosong, subtotal, Rekap Tim per tim/batch, Pareto, serta baris `Detail Temuan` dengan header `Seharusnya`; pastikan phantom dan temuan tanpa rekomendasi tidak muncul di sheet detail.
4. Implementasikan backend + shared contract, lalu GREEN API parity. Implementasikan workbook/preset dan GREEN browser. Tidak mengubah scoring dashboard hanya demi mencocokkan hasil report; bila hasil berbeda, telusuri dan gunakan jalur scoring bersama.
5. **Kriteria penerimaan:** endpoint typed dan scoped; angka bulanan, rentang, compliance, zero-error, serta average sesuai dashboard; semua bulan tanpa audit kosong dan dikecualikan dari average; kolom/urutan lima sheet Fase 1 stabil; metadata hadir di masing-masing sheet; konten detail kompatibel; tidak ada unit test/migrasi/dependency baru.

### Fase 2 — Rekap Leader, Critical, Tindak Lanjut, dan PDF

**Status: Selesai (2026-11-25).** E2E API dan browser membuktikan scope leader, kategori critical historis, tindak lanjut, urutan delapan sheet, dan isi/privasi PDF.

**Catatan model akses:** `leader_access_requests` saat ini tidak memiliki kolom expiry; implementasi memakai status `approved` dari `getLeaderScopeSnapshot` sebagai akses yang masih berlaku dan menguji status pending/revoked. Bila expiry dibutuhkan, perlu keputusan dan perubahan skema terpisah.

Fase 2 menyisipkan sheet **Rekap Leader** (setelah Rekap Tim) serta **Critical** dan **Tindak Lanjut** (di antara Pareto dan Detail Temuan) sehingga workbook final berisi delapan sheet sesuai urutan di Requirement; E2E Fase 1 yang memeriksa urutan sheet diperbarui di fase ini sebagai bagian dari perubahan kontrak.

**File yang direncanakan**

- Ubah `apps/api/src/services/sidak/management-report.ts` untuk Rekap Leader, Critical, dan Tindak Lanjut; bila type response berkembang, ubah `packages/types/src/sidak.ts`.
- Buat `apps/web/src/utils/sidakManagementReportPdf.ts` dengan PDF executive summary yang memakai pola layout dari `apps/web/src/utils/agentReportPdfLayout.ts`, `agentReportPdfText.ts`, dan generator PDF agen; tidak memodifikasi PDF agen existing kecuali diperlukan untuk helper yang benar-benar reusable.
- Ubah `apps/web/src/routes/sidak/reports-data.tsx` dan `apps/web/src/routes/sidak/management-report-excel.ts` untuk menyajikan/ekspor sheet fase 2 dan aksi PDF.
- Ubah `apps/web/e2e/sidak-management-reports-api.spec.ts` dan `apps/web/e2e/sidak-management-reports.spec.ts` (atau file PDF terpisah bila spec mendekati batas ~1.000 baris) untuk kontrak fase ini.

**Urutan kerja dan bukti**

1. Tambah assertion RED pada E2E yang sama/baru: Rekap Leader — agen per leader sama dengan `resolveDataScope` untuk leader tersebut, leader yang revoked/expired/pending tidak muncul, agen yang ada di dua leader muncul di keduanya tanpa total gabungan, admin/trainer melihat semua leader, pemanggil leader hanya menerima bloknya sendiri (tidak ada nama atau angka leader lain di response), dan `allowedServiceTypes` leader membatasi layanannya; Critical memakai kategori rule version historis dan hanya countable real rows; Tindak Lanjut mencakup tiga jalur, bulan kosong memutus penurunan berurutan, repeat parameter mensyaratkan bulan berbeda, daftar parameter top-3 deterministik dan nama tetap scoped.
2. Browser E2E mengunduh PDF sesungguhnya dan memeriksa bahwa teks memuat KPI vs pembanding, tren 6 bulan, top-10 parameter, perbandingan tim, tindak lanjut dengan nama agen, filter/timestamp; kuartal/tahun juga memuat tren bulanan, perbandingan layanan, serta parameter improving/worsening. Pastikan PDF tidak memuat tiket/temuan/rekomendasi raw dari detail.
3. **Kriteria penerimaan:** Rekap Leader tidak pernah membocorkan scope leader lain ke pemanggil leader dan angkanya konsisten dengan scope `resolveDataScope`; semua pemicu tindak lanjut menghasilkan agent scoped yang tepat tanpa duplikasi; Critical tidak menampilkan phantom/non-countable; PDF valid, tidak memuat raw detail, memiliki bagian wajib dan format periode yang dipilih; seluruh unduhan gagal secara jelas tanpa file parsial.

### Fase 3 — Cakupan Audit (opsional)

**File yang direncanakan**

- Ubah `apps/api/src/services/sidak/management-report.ts` dan `packages/types/src/sidak.ts` untuk audit versus populasi agen aktif, sesi per agen versus target 5, serta agen tidak diaudit.
- Ubah `apps/web/src/routes/sidak/management-report-excel.ts` untuk bagian Cakupan Audit (lokasi sheet/penambahan sheet harus dikonfirmasi sebelum kontrak urutan sheet digeser) dan/atau `reports-data.tsx` untuk ringkasan yang sesuai.
- Tambah/ubah `apps/web/e2e/sidak-management-reports-api.spec.ts` dan `apps/web/e2e/sidak-management-reports.spec.ts`.

**Urutan kerja dan bukti**

1. Sebelum coding, sepakati definisi agen aktif, target lima sesi, dan aturan siapa yang masuk denominator. E2E API dengan real backend/Supabase lokal membuktikan audited vs active, jumlah sesi per agen, target, dan tidak-diaudit; scope leader, archived/deleted/excluded harus tetap aman. Browser E2E membaca workbook unduhan untuk membuktikan hasil dan metadata.
2. **Kriteria penerimaan:** coverage tidak mengubah angka fase 1; agen yang tidak diaudit tidak diberi skor 0/100; target ditampilkan dengan label yang disetujui; angka populasi tidak melampaui akses pemanggil.

### Gate akhir implementasi Lane D

Setelah fase yang dikerjakan selesai dan E2E target aman, jalankan serial: E2E backend lokal dan browser terkait; `pnpm typecheck`; `pnpm lint`; `pnpm build`; `git diff --check`; review `thermo-nuclear`; Graphify update satu kali setelah batch perubahan kode final. UI yang berubah melewati pemeriksaan `impeccable` dan pemeriksaan keyboard/responsif. Periksa diff, tidak ada migrasi/dependency/file tak terkait. Catat perintah dan hasil aktual; setiap commit punya CHANGELOG + `Verified:`. API endpoint harus tersedia sebelum halaman web yang memanggilnya dirilis.

## Open Questions

**Keputusan Fajar (2026-11-24)**

- Audiens: laporan harus memuat daftar per agen (Rekap Agen dan Tindak Lanjut bagian inti, bukan hanya ringkasan).
- Periode: semua preset yang dijelaskan wajib (Bulanan, Kuartal, Semester, Tahunan, YTD, rentang kustom). Bulan yang sudah lewat dan bulan berjalan boleh ditarik; bulan berjalan diberi label data sementara.
- Target compliance: 95 tetap berlaku untuk semua layanan; tidak ada target per layanan di v1.
- Rollup per tim: perlu → sheet **Rekap Tim** (Fase 1) dan perbandingan tim di PDF. Agen yang pindah tim memakai tim saat laporan ditarik.
- Rollup per leader: perlu → sheet **Rekap Leader** (Fase 2) berbasis scope access group leader yang approved saat laporan ditarik.
- Nama agen boleh tampil di PDF.
- Peringkat: skor periode tertinggi lebih dulu, tie-break temuan lebih sedikit, lalu nama.
- Tren turun: dua penurunan skor berturut-turut pada bulan kalender yang berdekatan dan sama-sama diaudit, tanpa ambang minimum.
- Tiga parameter terburuk: jumlah temuan countable terbanyak, lalu kategori critical lebih dulu, lalu nama.
- Agen yang diaudit di dua layanan pada satu bulan tampil dua baris (agen+layanan). Parity dengan Dashboard diuji per filter satu layanan.
- (2026-11-27) Fase 3 Cakupan Audit: target 5 sesi per agen per bulan berlaku sama untuk semua layanan untuk saat ini. Target ini adalah ukuran cakupan audit, terpisah dari sampling 5 sesi terburuk + padding 100 pada skor agen, dan tidak mengubah skor.

**Masih terbuka**

1. Satuan "sesi diaudit": konfirmasi sama dengan grouping dashboard per agen+periode+tiket/fallback. Untuk Cakupan Audit Fase 3: definisi peserta aktif dan apakah target 5 sesi berlaku sama pada semua layanan. Diputuskan sebelum Fase 3.
2. Jika E2E tidak dapat membuktikan kontrak tertentu, catat dengan kalimat **“needs Fajar approval for non-E2E test”** disertai kontrak tepat dan alternatif sekecil mungkin sebelum menambahkan/menjalankan tes non-E2E. Saat ini belum ada kontrak yang diketahui tidak dapat dibuktikan melalui E2E backend/browser.

## Risks

- v1 memanggil getDashboardData per layanan×periode serta untuk setiap subtotal/total rentang agar angka agregat memakai summary Dashboard yang persis; pembacaan periode menggunakan cache baris per tahun dan konkurensi 4. Ukur biaya panggilan agregat pada rentang banyak layanan sebagai tindak lanjut performa.
- **Kebocoran scope leader lain**: Rekap Leader menghitung scope pengguna lain di backend. Hanya admin/trainer yang menerima blok semua leader; pemanggil leader hanya menerima bloknya sendiri. Ini dijaga di server dan dibuktikan di E2E API, bukan disembunyikan di UI.
- **Kebocoran scope**: report menggabungkan beberapa layanan dan sumber. Semua fetch harus menerima agent scope, service allowlist, filter folder bila dipakai, soft-delete/exclusion, serta showArchived yang benar; jangan ambil data peserta di frontend atau jalur service-role tanpa filter.
- **Perbedaan scoring**: mengulang rumus secara terpisah berisiko membuat report berbeda dari dashboard, terutama sesi phantom, padding lima sesi, rule version per periode, SLIK weighted, pemetaan indikator snapshot, dan bulan tanpa data. Gunakan helper dashboard yang sama dan E2E parity per service/periode.
- **Ukuran workbook/PDF**: rentang satu tahun dan banyak temuan dapat membuat response besar atau UI lama menunggu. Ukur fixture realistis; jangan menambahkan cache/materialized summary sebagai sumber truth atau membatasi diam-diam. Jika perlu batas/streaming, sepakati sebagai kontrak terpisah.
- **Aturan trend/rank ambigu**: definisi ranking, penurunan berurutan, dan parameter “terburuk” perlu keputusan Fajar; asumsi sementara di Design harus diubah sebelum implementasi bila tidak disetujui.
- **Nama/privasi**: nama pada PDF dan daftar tindak lanjut adalah data personal; role/scope serta audience distribution perlu ditegaskan.
- **Release mismatch**: push API ke `main` dapat auto-deploy production. Web tidak boleh dirilis ketika endpoint belum tersedia; release/deploy membutuhkan otorisasi sesuai guardrail repo.
- **Snapshot/angka historis**: v1 tidak membekukan angka bulanan. Perubahan data atau rule version dapat mengubah hasil historis; tandai perubahan versi. Period lock/snapshot immutable dapat memerlukan schema change dan pembahasan produk di fase berikutnya, bukan bagian implementasi v1.
- **Dokumentasi vs kode (sudah diperbaiki 2026-11-24)**: `docs/SIDAK_LOGIC_AND_SCORING.md` dulu menyebut `001_sidak.sql` dan `packages/types/src/index.ts` sebagai sumber; sekarang menunjuk `001_sidak_core.sql` (plus migration bertanggal) dan `packages/types/src/sidak.ts`. Executor tetap memakai schema/migration live sebagai bukti implementasi.

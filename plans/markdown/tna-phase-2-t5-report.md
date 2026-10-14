# TNA Fase 2 — T5: Antarmuka evaluasi

## Status

**Implementasi UI dan gate produk selesai lokal; belum commit. Gate Graphify belum selesai.** Fajar perlu memeriksa diff sebelum checkpoint T5. T6 belum dimulai dan belum siap dijalankan: selain checkpoint, akses Docker/Supabase lokal harus dipulihkan. Tidak ada commit, stage, push, PR, deploy, migrasi/reset DB, akses produksi, AI, dependency atau unit test baru.

- Branch: `feat/tna-phase-2`.
- HEAD tetap `b85023063fec676c8c055acb0eb38848867fc6da` (checkpoint T4/T4b).
- Lane D, rencana disetujui: `plans/markdown/tna-phase-2.md`, D14/T5.
- Mulai pencatatan sesi: 2026-10-13T13:42:03Z.
- Implementasi langsung di sesi ini, tanpa worker/delegasi. **Review independen T6 harus dilakukan sesi baru yang tidak menulis T1–T5**, bukan menganggap self-review ini independen.

## Scope dan keputusan UI/UX

- `/tna`: bagian **Perlu dievaluasi**, dari `GET /tna/plans?due=1`, sebelum kebutuhan/rencana terbaru. Daftar tidak dihitung memakai jam browser; `evaluation_due` dan filter due dari server (WIB).
- Detail aktif: jadwal sebelum jatuh tempo; dialog mulai dengan default periode dari server; periode kosong tidak menawarkan aksi yang bisa berhasil.
- Detail evaluasi: pemilih/ganti periode, populasi, baseline beku yang sudah ada, target dan status tiap target, verdict dari server, kohort baseline/evaluasi, delta dan efek bersih dari server, banner drift, per-peserta, narasi server, kesimpulan dan tindak lanjut dengan konfirmasi.
- Pilihan periode yang belum disimpan mengunci penyelesaian; periode no_audit juga mengunci penyelesaian. Error 422/503 mempertahankan isian dan tidak menampilkan status selesai palsu. Konflik 409 mengunci semua aksi sampai muat ulang.
- Pembatalan aktif/evaluasi meminta alasan 10–1.000 karakter. Draft tetap memakai kontrak tanpa alasan wajib. Alasan tersimpan tampil bila diberikan respons server.
- Detail selesai: mode baca, hasil/narasi beku dari respons API; tindak lanjut lanjutan membuka parameter pada periode evaluasi, membawa `previous_plan` dan meneruskannya sebagai `previous_plan_id` pada validasi kebutuhan baru. Konteks layanan/indikator/compare dibaca dari kebutuhan via API, tidak dikarang dari URL rencana.
- Mobile satu kolom dan baris peserta menjadi kartu; desktop memakai tabel semantik. Sort nama/temuan hanya mengurutkan presentasi. Perhitungan angka, kohort, verdict, narasi dan validasi link atomik tetap backend.
- Pola visual TNA dipertahankan: Surface/Field/State/Metrics/MutationState, Dialog/Button/Textarea, token foreground/border/background, radius restrained; kontrol utama ≥44px.
- Native select mengikuti pola TNA yang sudah ada, bukan menambah framework/pola baru. Tidak ada token atau kapabilitas baru.
- Dokumentasi kanonik Fase 2 secara menyeluruh tetap scope T6. T5 memperbarui status rencana dan laporan ini saja.

## Files T5

| File                                              | Perubahan                                                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/routes/tna/Evaluation.tsx` (baru)   | UI evaluasi terpisah dari editor draft, start/change/complete RPC, tampilan hasil/kohort/tabel/narasi, link tindak lanjut |
| `apps/web/src/routes/tna/plan.tsx`                | Integrasi evaluasi, alasan cancel, konflik bersama, scroll error mutasi ke viewport                                       |
| `apps/web/src/routes/tna/index.tsx`               | Daftar perlu dievaluasi + loading/error/retry/empty                                                                       |
| `apps/web/src/routes/tna/parameter.tsx`           | Konteks validasi lanjutan + kirim previous_plan_id                                                                        |
| `apps/web/src/router.tsx`                         | Query previous_plan opsional; route guard tidak berubah                                                                   |
| `apps/web/e2e/helpers/tnaHarness.ts`              | UUID periode dan builder respons evaluasi typed                                                                           |
| `apps/web/e2e/tna-evaluation-flow.spec.ts` (baru) | 14 kontrak browser hermetic                                                                                               |
| `apps/web/e2e/tna-flow.spec.ts`                   | Alasan cancel aktif; screenshot regresi ke testInfo.outputPath agar tidak menimpa bukti Fase 1                            |
| `plans/markdown/tna-phase-2.md`                   | Status T5 dan kendala sebelum checkpoint/T6                                                                               |
| `plans/markdown/tna-phase-2-t5-report.md` (baru)  | Bukti, audit, batas verifikasi dan handoff                                                                                |

Screenshot baru: `plans/markdown/tna-phase-2-t5-{desktop,mobile}-{evaluasi,peserta,selesai}.png` (enam file). Screenshot adalah fixture hermetic, **bukan data produksi atau bukti integrasi DB**. App memakai scroll container internal: capture diarahkan ke section yang bersangkutan, bukan mengandalkan fullPage yang semula menghasilkan bagian kosong.

## RED → GREEN

1. Spec flow desktop ditulis sebelum UI. RED: region **Perlu dievaluasi** belum ada, timeout klik link. GREEN fokus: 1/1 alur lengkap hingga kebutuhan lanjutan, dengan assertion body mutasi tanpa angka/snapshot/verdict.
2. Audit menemukan error mutasi di luar viewport setelah dialog ditutup. Tambahkan assertion `toBeInViewport()` pada respons 422; RED viewport ratio 0. Tambahkan scroll panel error di `plan.tsx`; GREEN 1/1. Gate akhir juga memeriksa viewport pada 409/422/503.
3. Self-review menemukan pemilih periode berubah tetapi belum disimpan masih membolehkan menyelesaikan periode lama. RED: tombol Selesaikan masih enabled. GREEN: tombol hanya aktif bila periode pilihan sama dengan periode tersimpan; pesan meminta Ganti periode. Fokus 1/1.
4. Regresi browser pertama 19 passed / 2 failed: kedua route unauthorized sudah ditolak benar, tetapi test salah menunggu `/me/access-status` pada halaman itu. Fixture diperbaiki: tunggu auth mock benar-benar terjadi, assert tidak ada request TNA dan guard hermetic. Tidak mengubah guard akses produk.
5. Typecheck pertama exit 1: `previous_plan` terinfer wajib sehingga link parameter lama tidak memenuhi tipe. Perbaikan membuat query opsional tanpa mengubah link lama atau kontrak API.
6. Refactor sambil green: tabel semantik + map nama peserta (menghindari find berulang saat sort), fixture metrik dibuat konsisten untuk screenshot, flow ganti periode benar-benar memuat periode no_audit lalu kembali ke periode audited. Gate akhir 23/23.

### Coverage akhir

14 evaluasi: flow desktop/mobile (termasuk ganti ke no_audit dan kembali), not-due/opsi kosong, complete 409/422/503, cancel aktif/evaluasi, daftar gagal→retry→kosong, no_audit/pembanding kecil, pilihan periode belum disimpan, loading detail, leader/agent ditolak. Ditambah 9 kontrak Fase 1 pada `tna-flow.spec.ts`.

Setiap spec memakai preflight loopback dev-server dan guard fail-closed `hermeticShell`; endpoint yang dipakai tercatat, request tak dikenal diblokir. Config `playwright.config.ts` hanya memulai Vite web, env layanan `127.0.0.1:9`, `reuseExistingServer: false`; satu worker dan retries 0. Tidak memakai API nyata, database, provider atau jaringan produksi. Tes browser tidak menggantikan gate API/DB T6.

## Perintah, hasil dan log

Semua log di `/tmp/tna-phase-2-t5/` adalah bukti lokal sesi ini (bukan file yang akan di-commit). Pipeline memakai `set -o pipefail` untuk mempertahankan kegagalan perintah.

| Urutan | Perintah                                                                                                                                                                                                                        | Exit / hasil                                                                              | Log                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------- |
| 1      | `graphify explain TnaPlanDetail`                                                                                                                                                                                                | 0, menunjuk read-service/plan/harness/spec API                                            | output tool discovery      |
| 2      | `pnpm --dir apps/web exec playwright test --config=playwright.config.ts tna-evaluation-flow.spec.ts --grep 'evaluasi 1440:' --workers=1 --retries=0`                                                                            | 1, RED region belum ada                                                                   | `red.log`                  |
| 3      | Perintah fokus yang sama                                                                                                                                                                                                        | 0, 1 passed                                                                               | `green-focused.log`        |
| 4      | `pnpm --dir apps/web exec playwright test --config=playwright.config.ts tna-flow.spec.ts tna-evaluation-flow.spec.ts --workers=1 --retries=0`                                                                                   | 1, 19 passed / 2 assertion fixture failed                                                 | `browser-first.log`        |
| 5      | Perintah kedua spec yang sama                                                                                                                                                                                                   | 0, 22 passed                                                                              | `browser-green.log`        |
| 6      | `pnpm typecheck --concurrency=1`                                                                                                                                                                                                | 1, previous_plan wajib                                                                    | `typecheck-first.log`      |
| 7      | Fokus spec evaluasi dengan `--grep 'complete 422:' --workers=1 --retries=0`                                                                                                                                                     | 1, RED error di luar viewport                                                             | `red-error-viewport.log`   |
| 8      | Perintah fokus 422 yang sama                                                                                                                                                                                                    | 0, 1 passed                                                                               | `green-error-viewport.log` |
| 9      | `/Users/nadindyta/.pi/agent/skills/impeccable/scripts/impeccable detect --json apps/web/src/routes/tna/Evaluation.tsx apps/web/src/routes/tna/plan.tsx apps/web/src/routes/tna/index.tsx apps/web/src/routes/tna/parameter.tsx` | 0, `[]`                                                                                   | `impeccable.json`          |
| 10     | Perintah kedua spec browser yang sama                                                                                                                                                                                           | 0, 22 passed                                                                              | `browser-final.log`        |
| 11     | Fokus spec evaluasi dengan `--grep 'periode belum disimpan' --workers=1 --retries=0`                                                                                                                                            | 1, RED tombol masih enabled                                                               | `red-unsaved-period.log`   |
| 12     | Perintah fokus periode yang sama                                                                                                                                                                                                | 0, 1 passed                                                                               | `green-unsaved-period.log` |
| 13     | Perintah kedua spec browser yang sama, sesudah semua perbaikan                                                                                                                                                                  | **0, 23 passed**                                                                          | `browser-gate.log`         |
| 14     | `pnpm typecheck --concurrency=1`                                                                                                                                                                                                | **0, 4 successful** (3 cache hit, web dieksekusi)                                         | `typecheck.log`            |
| 15     | `pnpm lint --concurrency=1`                                                                                                                                                                                                     | **0**, API 8 + web 90 warning; 0 error, tidak ada warning pada file UI evaluasi baru      | `lint.log`                 |
| 16     | `pnpm build --concurrency=1`                                                                                                                                                                                                    | **0, 3 successful** (API/Telefun cache hit, web dieksekusi)                               | `build.log`                |
| 17     | `graphify update .`                                                                                                                                                                                                             | **timeout tool 180 detik**, exit numerik proses tidak tersedia; tidak boleh diklaim lulus | `graphify.log`             |

Prettier dijalankan pada dua file TS/TSX baru dan enam file existing yang terbukti Prettier-clean di HEAD (perbandingan `git show HEAD:<file>` dengan hasil prettier); tidak memformat dokumen rencana legacy secara wholesale. Pemeriksaan format/diff terakhir dicatat pada bagian penutupan.

API TNA 55 tes, checker rollback, replay DB dan log signal 11 **tidak dijalankan pada T5**: SQL/backend tidak berubah; full gate itu tetap scope T6. Tidak menjalankan unit suite atau suite lintas modul.

## Audit Impeccable

**Verdict: PASS untuk surface T5 dan batas bukti yang disebut di bawah.** Detector exit 0, `[]`; source + screenshot light desktop 1440×900/mobile 390×900 diperiksa. Setelah capture awal menunjukkan keterbatasan fullPage pada internal scroll, capture diperbaiki menjadi per-section. Tidak ada klaim pemeriksaan perangkat fisik, screen reader, dark-mode runtime, seluruh WCAG atau audit performa numerik.

| Dimensi                 | Skor penilaian source/visual (bukan sertifikasi) | Bukti / batas                                                                                                            |
| ----------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Aksesibilitas           | 3/4                                              | Label field, dialog primitives, table header/scope, pesan error; screen reader/contrast audit menyeluruh belum dilakukan |
| Performa                | 3/4                                              | Tidak ada aset/dependency baru, lookup nama map; tanpa profiling runtime                                                 |
| Theming                 | 3/4                                              | Token existing tanpa hardcode warna; visual runtime light saja                                                           |
| Responsif               | 3/4                                              | 1440/390 tanpa overflow; picker 44px diukur; tanpa perangkat fisik/text scaling                                          |
| Integritas implementasi | 4/4                                              | Typed API, narasi/verdict server, data unavailable bukan nol, kontrol sesuai tugas                                       |
| Total                   | **16/20**                                        | Good dalam cakupan bukti T5                                                                                              |

Temuan P2 diperbaiki: error mutasi tidak masuk viewport (`plan.tsx:61–66`, RED/GREEN 422); desktop peserta semula grid tanpa semantik tabel (sekarang `Evaluation.tsx:270+`, source/table screenshot). Capture internal-scroll diperbaiki pada spec, bukan dengan mengubah layout aplikasi. Tidak ada P1/P2 UI terbuka pada surface yang diperiksa.

## Thermo-nuclear self-review T5 (bukan review independen T6)

**Verdict: PASS untuk kode T5.** Diff tracked serta file baru dibaca; hanya UI/harness/browser/status/report/screenshot yang disentuh. Tidak mengubah SQL, RPC server, shared API types, `metrics.ts`, SIDAK, RLS atau kapabilitas.

| Severity | Lokasi                                   | Skenario                                                                                                  | Keputusan / bukti                                                                             |
| -------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| P2       | `plan.tsx:61–66`                         | Dialog complete gagal tetapi alert ada di atas posisi scroll sehingga pengguna tidak mengetahui kegagalan | Diperbaiki; RED→GREEN `toBeInViewport`, gate 409/422/503                                      |
| P2       | `Evaluation.tsx:73–78`, pesan di `:386+` | Pilihan periode baru belum disimpan; complete sebelumnya bisa memproses periode lama                      | Diperbaiki; RED enabled→GREEN disabled; gate akhir                                            |
| P2       | `router.tsx:591–593`                     | Query lanjutan wajib memutus tipe consumer link parameter lama                                            | Diperbaiki menjadi opsional; root typecheck 0                                                 |
| P3       | `Evaluation.tsx`                         | Komponen sekitar 540 baris karena seluruh surface evaluasi; bisa dipisah tampilan/aksi bila tumbuh        | Ditunda: satu surface kohesif, editor draft tetap terpisah; tidak mendekati batas 1.000 baris |

Mutasi hanya membawa metadata/expected revision. Verdict, angka, snapshot, narasi dan previous-plan validation berasal dari backend T1–T4. Konflik memakai mutation hook yang sama dengan cancel. Tidak ada fixture DB yang perlu cleanup pada browser hermetic. Komponen memakai API read JWT existing; tidak ada service-role frontend.

## Kesehatan lokal, kendala dan cleanup

- Proses Vite/Playwright milik run T5 selesai bersama runner. Pada inspeksi akhir ditemukan proses lain dari `.claude/worktrees/pdkt-usage-popover` memakai port 3005; **bukan proses milik T5 dan tidak dihentikan**. Serialisasi diverifikasi untuk perintah sesi ini, bukan diklaim sebagai lock lintas sesi.
- Graphify update hanya dicoba sekali, tidak mencapai bukti completion. Log menunjukkan AST default memakai **4 workers**, tidak sesuai target serial mesin. Penelusuran CLI lokal menemukan `GRAPHIFY_MAX_WORKERS`; retry selanjutnya harus memakai `GRAPHIFY_MAX_WORKERS=1`, setelah runner sesi lain selesai. Tidak melakukan retry otomatis atau extract/LLM.
- Tidak ada proses Graphify tertinggal pada `ps` setelah timeout. `graphify-out/` tetap gitignored dan tidak ada di status/diff tracked.
- Probe read-only `docker ps --format '{{.Names}} {{.Status}}'` gagal: socket `/Users/nadindyta/.orbstack/run/docker.sock` tidak tersedia. Stack Supabase/migrasi lokal **belum bisa diverifikasi**. Tidak memulai/reset Docker atau database sebagai efek samping T5. Kondisi ini harus dipulihkan sebelum T6/API gate.
- `.claude/launch.json`, `.impeccable/`, `mockups/`, `plans/markdown/shell-beranda-redesign.md`, `supabase/.branches/` tetap tidak disentuh dan tidak di-stage.
- Impeccable context melaporkan schema PRODUCT.md legacy; tidak memperbaiki drift konteks sebagai efek samping tugas UI.

## Penutupan dan handoff

Pemeriksaan akhir: `pnpm exec prettier --check` pada delapan file TS/TSX T5 dan laporan baru exit 0; `git diff --check` exit 0; pemeriksaan trailing whitespace/newline pada tiga file teks baru exit 0. `git diff --cached --stat` kosong; HEAD tidak berubah. Tidak ada perubahan tracked di luar tujuh path existing T5, ditambah file baru yang terdaftar di atas.

Gate produk sudah lulus; kendala Graphify dan Docker tetap terbuka dan bukan alasan mengklaim seluruh prasyarat T6 selesai. Setelah Fajar memeriksa diff: selesaikan gate Graphify secara serial dan pastikan Supabase lokal/migrasi tersedia, lalu checkpoint T5 hanya dibuat dengan otorisasi Fajar. T6 dijalankan oleh sesi independen sesudahnya.

T6 masih harus menyinkronkan docs, review `main...HEAD` sebelum laporan T1–T5, menjalankan gate API/DB/browser/root, dan menulis draft PR. Migrasi produksi belum dijalankan; riwayat migrasi remote belum sinkron; catatan akses read-only T3 yang diwajibkan Fajar tetap harus dimasukkan ke risiko rilis T6. Tidak ada tindakan remote pada T5.

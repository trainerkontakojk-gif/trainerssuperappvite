# PDF Hasil Telaah per Sesi — KETIK, Telefun, PDKT

**Lane:** C (frontend saja, multi-file, tiga modul; tidak ada perubahan API, schema, RLS, atau izin).
**Status:** Fase 0–3 selesai. Revisi 2026-10-31 (lihat "Revisi: percakapan dengan AI") menggantikan lampiran transkrip polos dan menambah PDKT; menunggu Fajar memeriksa ketiga sampel.
**Dibuat:** 2026-10-30, dari keputusan Fajar di sesi yang sama.

## Requirement

Trainer ingin membagikan hasil telaah satu sesi latihan kepada peserta dalam bentuk **PDF**. Saat ini ketiga modul hanya punya unduhan data mentah (CSV/TXT/WebM); hanya SIDAK yang punya laporan PDF.

Keputusan Fajar (2026-10-30), jangan dinegosiasi ulang:

1. **Unit laporan: per sesi.** Satu tombol "Unduh PDF" di halaman Telaah satu sesi. Bukan rekap per peserta.
2. **Transkrip/percakapan lengkap ikut sebagai lampiran** di bagian akhir PDF; hasil telaah di depan.
3. **Catatan trainer Telefun ikut dicetak.**
4. **Urutan: KETIK dulu sebagai pola**, Fajar memeriksa hasilnya, baru Telefun lalu PDKT.

### Kriteria penerimaan (berlaku per modul)

- Tombol **Unduh PDF** muncul di header Telaah, di samping tombol unduh yang sudah ada, dengan target sentuh ≥ 44px (ikuti kelas tombol tetangganya). Di layar sempit label boleh `sr-only` seperti tombol "Unduh transkrip".
- Tombol **nonaktif** (atau tidak tampil) selama telaah belum selesai (`pending`/`processing`/`failed`, atau hasil telaah belum termuat). PDF tidak pernah dibuat dari telaah setengah jadi.
- PDF adalah **unduhan langsung** (Blob `application/pdf`, magic `%PDF-`, tanpa BOM), bukan `window.print()`, bukan screenshot/raster. A4 portrait, teks asli yang bisa diseleksi.
- Isi PDF **sama dengan yang tampil di layar Telaah** — tidak ada skor, label, atau kesimpulan yang dihitung ulang atau dikarang. Bila suatu bagian kosong di layar, PDF menulis kalimat kosong yang jujur (salin dari copy UI, mis. "Tidak ada salah ketik yang ditemukan.").
- Header tiap halaman: kiri nama laporan (mis. "Hasil Telaah KETIK"), kanan identitas singkat (peserta • tanggal sesi). Footer "Halaman x dari y" (sudah disediakan `PdfDocument.finalize()`).
- Metadata dokumen (`setProperties`): title, subject, author = nama modul, creator = "Trainers SuperApp - Hasil Telaah <Modul>".
- Nama file deterministik: `ketik_telaah_<sessionId>.pdf`, `telefun_telaah_<recordId>.pdf`, `pdkt_telaah_<sessionId>.pdf` (sejajar dengan pola nama file transkrip yang ada).
- Karakter tanpa glyph di font standar (emoji, dll.) tercetak sebagai penanda `[U+XXXX]` lewat `pdfSafeText` — konvensi yang sudah disetujui untuk PDF SIDAK. Baris baru di pesan dipertahankan.
- Kegagalan impor `jspdf` atau pembuatan PDF → toast error manusiawi (`notify.error`, mis. "PDF belum bisa dibuat. Coba lagi."), **tidak ada file yang terunduh**, tombol kembali aktif. Tidak ada fallback lain.
- `jspdf` diimpor dinamis saat tombol diklik (bundle halaman Telaah tidak membesar). Konfigurasi Vite memisahkan preload helper dari chunk `vendor-export` agar helper yang dipakai halaman tidak menarik library ekspor sejak awal.
- Tidak ada perubahan backend, `packages/types`, migration, atau izin. Siapa pun yang sekarang bisa membuka halaman Telaah bisa mengunduh PDF-nya.

## Design

### Pakai ulang, jangan salin

Generator PDF SIDAK sudah terpecah jadi modul generik. Pakai langsung dari `apps/web/src/utils/`:

| Modul                     | Yang dipakai                                                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `agentReportPdfTheme.ts`  | konstanta halaman/margin, `FONT`, warna `INK*`, `TONE_*`, `mm`, `line`                                                                         |
| `agentReportPdfText.ts`   | `pdfSafeText`, `createMeasurer`, `wrapPdfText`                                                                                                 |
| `agentReportPdfLayout.ts` | `PdfDocument` (header kustom via konstruktor, `heading`, `paragraph`, `table`, `rule`, `ensureSpace`, `finalize`), `bullet`, `statRow`, `note` |

Contoh pemakaian lengkap: `generateAgentReportPdf()` di `apps/web/src/utils/agentReportPdf.ts:658`. **Jangan** mengganti nama atau memindahkan modul SIDAK di plan ini (churn tanpa manfaat). Bila sebuah primitive perlu perilaku baru, tambahkan secara aditif dan pastikan PDF SIDAK tidak berubah (lihat Verifikasi).

### Modul baru

- `apps/web/src/utils/sessionReviewPdf.ts` — bagian yang **pasti** dipakai ketiga modul, dan hanya itu:
  - `createSessionReviewPdf({ title, headerLeft, headerRight, metadata })` → impor dinamis `jspdf`, buat dokumen A4 mm, `setProperties`, kembalikan `PdfDocument` yang sudah `begin()`.
  - `drawIdentityBlock(pdf, rows: [label, value][])` — blok identitas (peserta, tanggal, skenario, dsb.).
  - `drawTranscriptAppendix(pdf, entries: { number, speaker, time, text }[])` — lampiran transkrip bernomor; nomor harus sama dengan nomor pesan yang dipakai kutipan di layar Telaah.
  - `downloadPdf(bytes: ArrayBuffer, filename)` — Blob `application/pdf`, tanpa BOM, revoke URL setelah klik.
  - Jangan menambah helper lain "untuk nanti"; Fase 2/3 menambah ke sini hanya bila benar-benar dipakai bersama.
- Fase 1: `apps/web/src/routes/ketik/utils/ketikReviewPdf.ts` — `generateKetikReviewPdf(input): Promise<ArrayBuffer>`.
- Fase 2: `apps/web/src/routes/telefun/utils/telefunReviewPdf.ts`.
- Fase 3: `apps/web/src/routes/pdkt/utils/pdktReviewPdf.ts`.

Generator menerima data yang **sudah ada di komponen Telaah** (tidak ada fetch baru). Label, verdict, dan urutan diambil dari helper yang dipakai UI agar layar dan PDF tidak bisa menyimpang:

### Fase 1 — KETIK

Sumber data: `KetikReviewStage` (`apps/web/src/routes/ketik/components/KetikReviewStage.tsx`) sudah memegang `session: KetikHistoryDetail`, `previousScore`, `review.review: KetikSessionReview`, `review.typos: KetikTypoFinding[]`, dan `numbers` (penomoran pesan dari `numberMessages`). Turunan yang dipakai UI ada di `ReviewResult` (`KetikReviewResult.tsx:44-110`): `fixes`/`good` dari `education.agentNotes`, `orderedPoints` dari `education.consumerPoints`, `nextSteps` (gabungan `coachingFocus` + `overallNextSteps`, unik), `guidance` dari `dimensionGuidance`.

**Langkah pertama Fase 1:** ekstrak turunan itu ke fungsi murni (mis. `buildKetikReviewView(session, review, typos)` di `apps/web/src/routes/ketik/utils/reviewView.ts`) yang dipakai **bersama** oleh `ReviewResult` dan generator PDF. Ini refactor tanpa perubahan perilaku UI; E2E Telaah KETIK yang ada harus tetap hijau.

Urutan isi PDF (ikuti urutan seksi layar Telaah):

1. **Identitas** — peserta (`formatSimulationSubjectLabel(session.simulationSubject)`, plus batch/tim bila subjek peserta), tanggal sesi (`formatKetikDate`), skenario (`scenarioTitle`), konsumen (`consumerName`), durasi bila ada, waktu PDF dibuat.
2. **Skor akhir** — `finalScore`, `scoreVerdict(score)`, perubahan vs sesi sebelumnya (kalimat sama dengan `scoreChange` di `KetikReviewResult.tsx:30`), lalu tabel skor per aspek dari `readAspectScores(session)` dengan penanda di bawah `KETIK_FIX_THRESHOLD`.
3. **Ringkasan** — `review.aiSummary`, dan `education.caseCore` bila ada.
4. **Perbaiki dulu** — tiap catatan `verdict: "fix"`: kutipan agen (dengan nomor pesan), catatan, dan "Sebaiknya:" `example`; lalu `review.weaknesses`.
5. **Pertanyaan konsumen** — `orderedPoints`: kutipan, ringkasan, status (label yang sama dengan UI), jawaban agen bila ada, alasan.
6. **Verifikasi data** — hanya bila `education.verification` ada; status per field seperti `KetikVerificationSummary`.
7. **Sudah baik** — catatan `verdict: "good"` + `review.strengths`.
8. **Ejaan** — dari `typosEnriched` bila ada, jika tidak dari `typos`: kata asli → koreksi, `typoSeverityLabel`.
9. **Alasan skor** — `dimensionGuidance` terurut `priorityRank`.
10. **Langkah berikutnya** — `nextSteps`.
11. **Lampiran: Transkrip** — halaman baru; semua pesan `normalizeMessagesForDisplay(session.messages)` bernomor (`numbers`), pengirim (Agen/Konsumen/Sistem — label dari `transcript.ts`), waktu, teks. Lampiran gambar dicetak sebagai teks `[Gambar: <alt>]`, tidak di-embed.

Telaah lama tanpa field anotasi (`consumerPoints`/`agentNotes` undefined) harus tetap menghasilkan PDF; seksi yang datanya tidak ada ditulis dengan copy kosong yang sama dengan UI (`NotAvailable`).

Tombol: di `KetikReviewStage.tsx` header, tepat setelah "Unduh transkrip" (`:193-201`), dengan state `downloadingPdf` untuk mencegah klik ganda.

### Fase 2 — Telefun (setelah Fajar menyetujui PDF KETIK)

Sumber: `TelefunReviewStage.tsx` + `TelefunReviewResult.tsx` (seksi Ringkasan, Alasan skor, Perbaiki dulu, Pertanyaan konsumen, Sudah baik, **Catatan trainer**, Skor suara), `TelefunScoreDetails.tsx`, `VoiceMetricCards.tsx`, transkrip dari `TelefunTranscript.tsx` / `telefunTranscriptFormatters.ts` (ikuti format `downloadTranscript` di `TelefunReviewStage.tsx:109`). Grafik radar (`TelefunProfileRadar`) dicetak sebagai **tabel** skor dimensi, bukan gambar. Rekaman audio tidak ikut; cukup tulis durasi panggilan. Terapkan langkah ekstraksi view-model yang sama seperti KETIK sebelum menulis generator.

### Fase 3 — PDKT (setelah Fase 2)

Sumber: `PdktReviewStage.tsx` (Email konsumen, Balasan Anda, Poin konsumen + status Terjawab/Sebagian/Belum terjawab, Catatan pada balasan, Catatan AI, Temuan lain, Waktu pengerjaan) dan `PdktScoreBreakdown.tsx` (Rincian skor). "Lampiran transkrip" untuk PDKT = email konsumen lengkap + balasan peserta lengkap. Lampiran email (gambar/berkas) dicetak sebagai daftar nama berkas, tidak di-embed. Atribusi balasan mengikuti keputusan 2026-10-22: nama yang dicetak adalah **pembalas** yang dipilih saat membalas, bukan snapshot pembuat.

### Di luar scope

Rekap multi-sesi per peserta, kirim PDF via email/WhatsApp, PDF di halaman Riwayat (daftar), PDF dari Monitoring, perubahan backend/API, font kustom, embed gambar.

## Tasklist

Skill & gate wajib (lihat `AGENTS.md`, `docs/AGENT_WORKFLOW.md`): muat `trainers-superapp-tdd` sebelum edit; query `graphify` untuk `KetikReviewStage`/`ReviewResult`/`PdfDocument` sebelum edit lintas-file; `thermo-nuclear` setelah implementasi; `impeccable` audit untuk tombol + tampilan PDF. **Satu run Playwright pada satu waktu**; jalankan spec terfokus dari `apps/web`: `pnpm exec playwright test <spec> -g "<judul>"` (jangan `test:e2e -- -g`). Tidak ada unit test baru tanpa izin Fajar.

### Fase 0 — Persiapan test

- [x] Pindahkan pembaca PDF dari `apps/web/e2e/sidak-agent-report-download.spec.ts` (`readPdfPages`, decoder CMap/WinAnsi, `readPdfInfo`, `recordDownloadBlobs`, `expectTextBasedPdf`, `expectPageFooters`, `printedReadBack`, `readPrintedMarkers`; ±baris 290–860) ke `apps/web/e2e/helpers/pdfReadback.ts`, ekspor apa adanya, dan impor balik di spec SIDAK. Tidak ada perubahan logika.
- [x] Jalankan `sidak-agent-report-download.spec.ts` sekali → harus tetap 25/25. Kalau tidak, STOP dan perbaiki pemindahan sebelum lanjut.

### Fase 1 — KETIK

- [x] **RED:** tulis `apps/web/e2e/ketik-review-pdf.spec.ts` memakai `openHermeticShell` + mock seperti `ketik-review-worker-browser.spec.ts` (sesi `completed` dengan `education` lengkap: 2 `agentNotes` fix + 1 good, 2 `consumerPoints` berbeda status, 1 typo, `verification`, pesan berisi emoji dan baris baru, cukup banyak pesan agar ≥ 2 halaman). Test minimal:
  1. Unduh PDF: nama file `ketik_telaah_<id>.pdf`, `%PDF-`, tanpa BOM, A4, metadata title/author, footer "Halaman x dari y" di tiap halaman.
  2. Isi: nama peserta, skor akhir + verdict, setiap judul seksi, kutipan + "Sebaiknya" dari catatan fix, status poin konsumen, typo, langkah berikutnya, teks pesan transkrip bernomor; emoji → `[U+XXXX]`; baris baru dipertahankan.
  3. Paritas layar: nilai skor dan label verdict di PDF sama dengan teks yang tampil di panel Telaah untuk fixture yang sama.
  4. Telaah lama tanpa `consumerPoints`/`agentNotes` → PDF tetap terunduh dengan copy kosong yang jujur.
  5. Telaah `pending`/`processing`/`failed` → tombol nonaktif/tidak ada.
  6. Kegagalan generator (blokir chunk `jspdf` lewat `page.route` atau paksa throw) → toast error, tidak ada event download, tombol aktif lagi.
     Jalankan → harus MERAH karena alasan yang benar (tombol belum ada).
- [x] Ekstrak view-model KETIK (`reviewView.ts`) dan pakai di `ReviewResult`; jalankan `ketik-review-worker-browser.spec.ts` dan `ketik-history-browser.spec.ts` → tetap hijau.
- [x] Tulis `apps/web/src/utils/sessionReviewPdf.ts` (empat fungsi di Design, tidak lebih).
- [x] Tulis `apps/web/src/routes/ketik/utils/ketikReviewPdf.ts` sesuai urutan isi.
- [x] Tambah tombol di `KetikReviewStage.tsx`.
- [x] **GREEN:** `ketik-review-pdf.spec.ts` hijau. Simpan satu PDF hasil fixture ke `plans/markdown/session-review-pdf-ketik-sample.pdf` sebagai artefak yang bisa diperiksa Fajar.
- [x] Refactor bila perlu; spec tetap hijau.
- [x] Gate: `thermo-nuclear`; `impeccable` audit (tombol + PDF); root typecheck, lint, build; `git diff --check`; `graphify update .` sekali setelah batch.
- [x] Verifikasi SIDAK tidak berubah: jalankan `sidak-agent-report-download.spec.ts` sekali lagi bila ada modul `agentReportPdf*` yang disentuh.
- [x] Entri `CHANGELOG.md` di bawah tanggal hari itu (`- feat(ketik): ...`), commit, push ke `main` (sudah diizinkan). Tidak deploy production.
- [x] Perbarui Status di plan ini + baris di `plans/README.md` dengan evidence (perintah persis + hasil).
- [x] **STOP.** Laporkan ke Fajar dengan lokasi sampel PDF. Fase 2 baru dimulai setelah Fajar menyetujui tampilan/isi.

### Fase 2 — Telefun

- [x] RED `apps/web/e2e/telefun-review-pdf.spec.ts` (fixture dari `e2e/helpers/telefunFixtures.ts`), kasus setara Fase 1 + **Catatan trainer tercetak** + skor dimensi sebagai tabel.
- [x] Ekstrak view-model Telefun; spec Telefun Telaah yang ada tetap hijau.
- [x] `telefunReviewPdf.ts` + tombol di `TelefunReviewStage.tsx`; GREEN; gate; changelog; commit/push; STOP untuk review.

### Fase 3 — PDKT

- [x] RED `apps/web/e2e/pdkt-review-pdf.spec.ts`, kasus setara + email konsumen & balasan lengkap + nama pembalas (bukan pembuat).
- [x] Ekstrak helper PDKT bersama (`pdktOtherFindings`, `PDKT_INCOMPLETE_REVIEW`); Telaah `pdkt-flow.spec.ts` dan `pdkt-replier-attribution.spec.ts` tetap hijau.
- [x] `pdktReviewPdf.ts` + `PdktReviewPdfButton` di judul `PdktReviewStage.tsx`; GREEN; gate; changelog; commit/push.
- [x] Suite E2E default penuh sekali di akhir (lihat Evidence 2026-10-31).

## Revisi: percakapan dengan AI (2026-10-31)

Fajar menilai hasil PDF sebelumnya kurang memuaskan: interaksi peserta dengan AI harus ikut, bukan hanya hasil telaah. Lampiran transkrip polos di akhir diganti dengan bagian utama **"Percakapan dengan AI"** di ketiga modul:

- Urutan: Identitas → Skor → Ringkasan → **Percakapan dengan AI** → rincian telaah. Percakapan mulai di halaman yang sama bila sisa halaman ≥ 70 mm.
- Gelembung chat (`drawConversation` di `sessionReviewPdf.ts`): konsumen AI di kiri (abu), agen di kanan (biru muda), lebar mengikuti isi, dipecah lintas halaman, paragraf dipertahankan. Label: `Pesan n · Konsumen AI · <nama> · jam` / `Pesan n · Agen · <peserta> · jam`.
- Temuan telaah dicetak tepat di bawah pesan yang dimaksud dengan titik warna: poin konsumen (huruf + status), catatan agen (nomor sama dengan seksi rincian), "Menjawab poin …", ejaan (KETIK), catatan trainer/AI di jam rekamannya dan hold (Telefun), catatan balasan dan daftar lampiran (PDKT). Penanda verifikasi data KETIK dan pesan sistem tercetak sebagai garis putus di antara pesan.
- Rincian telaah memakai blok temuan (`drawFinding`): judul tebal dengan penanda warna, kutipan menjorok; identitas menjadi kisi tiga kolom; judul seksi berjarak (`drawSection`).
- PDKT: email konsumen buatan AI (subjek + isi + lampiran sebagai daftar) dan balasan peserta utuh; atribusi pembalas sesuai keputusan 2026-10-22.

## STOP conditions

- Data yang tampil di layar Telaah ternyata tidak tersedia di komponen (butuh fetch/endpoint baru) → STOP, laporkan; jangan menambah API tanpa persetujuan (itu menaikkan lane).
- Memindahkan pembaca PDF membuat spec SIDAK merah dan penyebabnya bukan pemindahan → STOP.
- Butuh dependency baru (font, library PDF lain, `html2canvas`) → STOP; jangan tambahkan.
- Ada kebutuhan unit test → minta izin Fajar dulu dengan kontrak yang tidak bisa dibuktikan E2E.

## Evidence

- Fase 0: dari `apps/web`, `pnpm exec playwright test sidak-agent-report-download.spec.ts` — 25 passed (exit 0). Percobaan awal gagal memuat ekspor `recordDownloadBlobs`; ekspor diperbaiki sebelum run yang lulus.
- Fase 1 RED: dari `apps/web`, `pnpm exec playwright test ketik-review-pdf.spec.ts -g 'PDF sesi memuat'` — gagal karena tombol `Unduh PDF` belum ada.
- Fase 1: dari `apps/web`, `pnpm exec playwright test ketik-review-pdf.spec.ts` — 11 passed; `pnpm exec playwright test ketik-review-worker-browser.spec.ts ketik-history-browser.spec.ts` — 10 passed. Sampel: `plans/markdown/session-review-pdf-ketik-sample.pdf` (4 halaman A4, diperiksa visual). Run 11/11 terbaru juga memeriksa metadata lengkap, pesan sistem, nomor transkrip, penanda lampiran gambar, kegagalan impor jspdf yang diblokir langsung, tombol nonaktif saat telaah ulang sedang berjalan, header untuk nama peserta panjang, tombol nonaktif ketika telaah ulang gagal dan hasil sebelumnya tetap terlihat, serta transisi nonaktif ke aktif saat hasil selesai dimuat. Kasus status gagal mula-mula RED karena tombol masih aktif, kemudian GREEN. Kasus header mula-mula RED (koordinat teks -948,96 pt), lalu lulus setelah identitas header dipersingkat dengan mengukur lebar cetak; nama lengkap tetap di blok identitas.
- `pnpm --filter @trainers/web exec tsc --noEmit` dari root — lulus (exit 0) pada kode web saat ini. Ini tidak menggantikan gerbang root yang mencakup typecheck E2E.
- Root `pnpm typecheck` lulus 4/4, `pnpm lint` lulus 4/4 (warning tanpa error), dan `pnpm build` lulus 3/3 setelah perbaikan callback spec Telefun yang disetujui Fajar dan pemisahan chunk preload Vite. `git diff --check` lulus.

- Verifikasi sumber hambatan: SHA-256 spec Telefun di worktree sama persis dengan `git show HEAD:apps/web/e2e/telefun-agent-silence.spec.ts` (`6319e31c86834ffc051f0a7d183485ebefb2b4b9eacbb97b87afabbe16ac4ffb`); konfigurasi TypeScript dan lockfile tidak berubah.

- Setelah izin Fajar, callback spec Telefun diperbaiki dengan `receive.call(worklet.port, ...)`: dari `apps/web`, `pnpm exec playwright test telefun-agent-silence.spec.ts -g 'diam 5 detik memicu'` lulus 1/1. Resource gate sebelumnya merah (swap bebas 747MB < 768MB); Fajar secara eksplisit mengizinkan melanjutkan dengan gate diabaikan dan pemeriksaan dijalankan berurutan. Prettier seluruh spec Telefun juga gagal pada `HEAD` karena format lama; perubahan tetap dibatasi pada dua pemanggilan.

- Audit `thermo-nuclear`: review ukuran dan batas modul, reuse view-model serta label dan primitive SIDAK, pemisahan chunk dan alur status; tidak ada temuan struktural tersisa yang diidentifikasi. Audit `impeccable`: detector `impeccable detect --json apps/web/src/routes/ketik/components/KetikReviewStage.tsx` menghasilkan `[]`; screenshot 390/1280 dan keempat halaman sampel diperiksa, tombol minimal 44×44 px. Pemeriksaan PDF SIDAK tambahan: dari `apps/web`, `pnpm exec playwright test sidak-agent-report-download.spec.ts -g 'Menu Unduh Laporan menghasilkan PDF asli'` lulus 1/1. Analisis impor build menunjukkan chunk `vendor-export` tidak lagi menjadi dependensi statis halaman KETIK.

- `GRAPHIFY_MAX_WORKERS=1 graphify update .` — exit 0 setelah batch awal; dijalankan lagi setelah batch konfigurasi Vite, exit 0 tanpa perubahan topologi. `apps/web/vite.config.ts` memisahkan `vite/preload-helper.js` dari `vendor-export`; audit impor statis build KETIK tidak menemukan dependensi awal ke chunk ekspor.

- Fase 2: Fajar menyetujui sampel KETIK dan mengizinkan pemuatan catatan/rekomendasi menggunakan endpoint Telefun yang sudah ada saat tombol PDF diklik; unduhan dibatalkan jika pemuatan gagal. Dari `apps/web`, `pnpm exec playwright test telefun-review-pdf.spec.ts` lulus 9/9 dan `pnpm exec playwright test telefun-flow.spec.ts -g 'Telefun Telaah'` lulus 29/29. RED pertama gagal karena tombol belum ada; kasus score-only juga diuji RED lalu GREEN.
- Fase 2: `pnpm typecheck` 4/4, `pnpm lint` 4/4 (warning tanpa error), `pnpm build` 3/3; `impeccable detect --json apps/web/src/routes/telefun/components/TelefunReviewStage.tsx` menghasilkan `[]`. Screenshot 390/1280 dan PDF A4 tiga halaman diperiksa; audit `thermo-nuclear` memeriksa pemisahan view-model, akses catatan, status, dan pembatalan unduhan saat hasil berubah. Build Telefun tidak mengimpor chunk generator atau vendor-export secara statis. Sampel: `plans/markdown/session-review-pdf-telefun-sample.pdf`.
- Fase 2: `GRAPHIFY_MAX_WORKERS=1 graphify update .` lulus; `git diff --check` lulus.

- Revisi 2026-10-31 RED: `ketik-review-pdf.spec.ts -g 'PDF sesi memuat'` gagal karena "Percakapan dengan AI" belum tercetak; `pdkt-review-pdf.spec.ts` gagal karena tombol `Unduh PDF` belum ada (skor 85 sudah tampil).
- Revisi 2026-10-31 GREEN, dari `apps/web`: `pnpm exec playwright test ketik-review-pdf.spec.ts telefun-review-pdf.spec.ts pdkt-review-pdf.spec.ts --workers=1` — 24 passed; `pnpm exec playwright test pdkt-flow.spec.ts -g "Telaah|telaah" --workers=1` — 12 passed; `pnpm exec playwright test pdkt-flow.spec.ts telefun-flow.spec.ts -g "Telaah|telaah" --workers=1` — 40 passed + 1 gagal yang kemudian diperbaiki (cakupan cek target sentuh memakai `h2.parentElement`, kini `[data-review-scroll]`); `ketik-review-worker-browser.spec.ts ketik-history-browser.spec.ts pdkt-replier-attribution.spec.ts` (bersama spec PDF) — 34/35, satu gagal `failed async rerun keeps previous result…` karena butuh Supabase lokal (`ECONNREFUSED 127.0.0.1:54321`, Docker/OrbStack mati); file yang diuji test itu tidak berubah.
- Revisi 2026-10-31 gate: `pnpm typecheck` 4/4, `pnpm lint` 4/4 (0 error, warning lama), `pnpm build` 3/3; eslint file yang diubah bersih; `impeccable detect --json` untuk `PdktReviewStage.tsx`, `PdktReviewPdfButton.tsx`, `TelefunReviewStage.tsx` → `[]`; screenshot 390/1280 tombol PDKT diperiksa (≥ 44 px, tanpa geser horizontal); build: chunk `pdkt` hanya mengimpor `pdktReviewPdf` secara dinamis. Review `thermo-nuclear`: tombol PDKT dipisah ke komponen sendiri agar `PdktReviewStage.tsx` tidak melewati 1.000 baris (977), warna status poin disatukan (`POINT_STATUS_TONE`). Sampel baru: `plans/markdown/session-review-pdf-{ketik,telefun,pdkt}-sample.pdf`.
- Suite penuh 2026-10-31 (Supabase lokal aktif), dari `apps/web`: `pnpm exec playwright test` — 947 passed, 4 skipped, 7 failed (54,3 menit). `ketik-review-worker-browser.spec.ts` yang sebelumnya gagal karena Supabase mati kini 5/5. Tujuh kegagalan tidak terkait PDF: 5× `static-security.spec.ts` (header CSP/`x-robots-tag` dan status 404 milik server statis produksi, sementara target lokal adalah dev server Vite), `authenticated-shell.spec.ts:199` dan `usage.spec.ts:123` (mock `/home/agent-summary`, `/telefun/sessions?view=list`, `/telefun/sessions/month-count` belum ada). Kedua test mock juga gagal pada `1effe9ca` (kode sebelum revisi), jadi kegagalannya sudah ada sebelumnya.

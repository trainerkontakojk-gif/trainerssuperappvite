# PDKT Telaah — poin konsumen, temuan tanpa duplikasi, dan kalimat penghubung

Plan untuk dikerjakan Codex. Ikuti `AGENTS.md` dan `docs/AGENT_WORKFLOW.md`. Muat `trainers-superapp-tdd` sebelum mengedit apa pun.

- **Lane:** C. Ada perubahan perilaku lintas file (prompt AI, normalisasi backend, tipe bersama, UI Telaah). Field baru di `PdktEvaluationResult` bersifat **aditif dan opsional**. Tidak ada perubahan skema/migration, karena `pdkt_history.evaluation` sudah `jsonb`, dan tidak ada perubahan RLS. Kalau saat mengerjakan ternyata perlu migration, mengubah field yang sudah ada, atau menghapus field dari respons API, **STOP** dan minta klasifikasi ulang ke Lane D.
- **Worktree:** `../trainerssuperappvite-pdkt-telaah`, branch `feat/pdkt-telaah-consumer-points`, dibuat dari `main` @ `d0d29cf`.
- **Larangan:** jangan commit, push, deploy, atau mengubah sistem remote tanpa izin eksplisit Fajar. Jangan menjalankan Playwright paralel; satu run dalam satu waktu.

## Requirement

### Latar belakang

Telaah PDKT (`apps/web/src/routes/pdkt/components/PdktReviewStage.tsx`) saat ini:

- Hanya menandai kalimat di **balasan agent** (`annotations`). Prompt (`apps/api/src/services/pdkt/evaluation-service.ts`, bagian "ATURAN ANNOTATIONS") melarang AI mengutip email konsumen.
- Menampilkan "Temuan lain" dari `typos`, `clarityIssues`, dan `contentGaps`. Isinya sering sama dengan "Catatan pada balasan", karena prompt tidak melarang satu temuan ditulis di dua tempat.
- Tidak menilai apakah perpindahan antar topik terasa natural. Agent sering menempel beberapa standar jawaban baku (misalnya penagihan lalu restrukturisasi) tanpa kalimat pengantar, sehingga email terlihat seperti hasil salin-tempel.

### Keputusan Fajar (2026-10-14)

1. Agent tetap menulis bebas. Tidak ada blok standar terkunci dan tidak ada tombol sisipkan standar.
2. Standar jawaban (`expectedAnswer`) **tetap privat**. Tidak boleh tampil atau bocor ke peserta.
3. Untuk kalimat penghubung, cukup AI yang menilai bahwa perpindahan topik tidak natural seperti salin-tempel, lalu menyarankan kalimat atau kata pengantar sebelum masuk ke topik berikutnya. Tidak ada pustaka standar jawaban dan tidak ada pengecekan teks standar secara deterministik.

### Acceptance criteria

**F1 — Poin konsumen**

1. Telaah baru menyimpan `consumerPoints`: maksimal 5 poin utama atau concern dari email konsumen. Tiap poin berisi kutipan persis dari email konsumen, ringkasan singkat, dan status `answered` / `partial` / `unanswered`.
2. Di panel "Email konsumen" pada tahap Telaah, kutipan tiap poin ditandai dengan warna sesuai status dan label huruf A, B, C, … menurut urutan baca:
   - `answered` → hijau, teks "Terjawab"
   - `partial` → kuning/amber, teks "Sebagian"
   - `unanswered` → merah, teks "Belum terjawab"

   Status **selalu** ditulis sebagai teks, bukan hanya warna.

3. Di bawah email konsumen tampil daftar "Poin konsumen". Tiap baris berisi huruf, ringkasan, status, dan untuk `partial`/`unanswered` satu kalimat alasan. Huruf di email dan baris di daftar saling tertaut (klik → fokus), dengan pola yang sama seperti penanda di balasan (`jumpTo`, `aria-label`, target sentuh 44px).
4. Bila poin dijawab di balasan agent (`answered`/`partial` dan kutipan jawabannya ditemukan), balasan agent menampilkan label huruf kecil yang sama di akhir kalimat jawaban. Label itu tertaut ke poin konsumen. Label huruf **tidak** memberi warna latar baru; oranye tetap khusus untuk catatan perbaikan.
5. Kutipan yang tidak ditemukan di email konsumen tetap tampil di daftar tanpa penanda, dengan keterangan "Tidak ditandai di email", sama seperti pola catatan balasan yang tidak ditemukan.
6. Telaah lama tanpa `consumerPoints` tampil persis seperti sekarang: tanpa daftar poin, tanpa pemberitahuan baru, dan tanpa memicu telaah ulang.

**F2 — Temuan tanpa duplikasi**

7. Untuk telaah yang punya `annotations` (array), bagian "Temuan lain" **tidak** lagi menampilkan item `typos` dan `clarityIssues`. Temuan yang menunjuk kalimat sudah ada di "Catatan pada balasan".
8. "Temuan lain" hanya menampilkan `contentGaps` dengan label "Isi yang kurang", dan hanya untuk informasi wajib yang tidak berasal dari pertanyaan konsumen. Concern konsumen yang belum terjawab muncul sebagai poin konsumen `unanswered`, bukan di `contentGaps`. Bila kosong, bagian "Temuan lain" tidak dirender. "Catatan AI" (`feedback`) tetap seperti sekarang.
9. Telaah lama (tanpa `annotations`) tetap menampilkan "Temuan lain" lengkap seperti sekarang.
10. Array `typos`, `clarityIssues`, dan `contentGaps` **tetap diisi lengkap** di hasil evaluasi, karena Monitoring menghitung `typos_count`, `clarity_issues_count`, dan `content_gaps_count` dari array ini (`apps/api/src/services/monitoring-history-service.ts`). Yang berubah hanya tampilan Telaah peserta.

**F3 — Kalimat penghubung**

11. AI boleh membuat annotation `kind: "transition"` pada kalimat pertama sebuah topik yang muncul tiba-tiba (pindah topik tanpa pengantar). Dimensinya selalu `clarity`. `note` menjelaskan masalahnya, dan `example` berisi contoh kalimat atau frasa penghubung, misalnya: _"Selanjutnya, terkait permohonan keringanan yang Bapak sampaikan, …"_.
12. Di "Catatan pada balasan", catatan `transition` berlabel **"Kalimat penghubung"** (bukan "Kejelasan") dan menampilkan `example` sebagai "Contoh: …".
13. Contoh penghubung hanya berisi frasa pengantar ditambah nama atau ringkasan topik. Isinya tidak boleh mengutip atau memparafrasekan `expectedAnswer`.
14. AI tidak boleh mengkritik gaya bahasa paragraf yang isinya sesuai standar jawaban, karena paragraf itu baku. Yang dinilai hanya sambungannya.
15. Tidak ada aspek nilai baru. Alur yang tidak natural cukup menurunkan `clarityScore`. Bobot nilai tidak berubah.
16. `edu.suggestedRewrite` mempertahankan redaksi paragraf balasan agent yang isinya sudah sesuai standar jawaban. Rewrite hanya memperbaiki pembuka, kalimat penghubung, penutup, dan bagian yang memang salah.

**Umum**

17. Semua field baru melewati `redactExpectedAnswerFromValue` sebelum disimpan atau dikembalikan.
18. Semua test di `apps/web/e2e/pdkt-flow.spec.ts` tetap hijau, termasuk assertion "Temuan lain" yang sudah ada. Sesuaikan fixture atau assertion yang memang berubah karena F2, dan catat alasannya di laporan.

### Di luar scope

- Pustaka atau tabel standar jawaban, halaman admin, dan perubahan pada composer balasan.
- Panel Monitoring trainer (`apps/web/src/routes/monitoring/components/PdktEvaluationPanel.tsx`). Panel ini tetap memakai daftar lama. `monitoring-history-service.ts` cukup tidak membuang `consumerPoints` saat parsing (lihat Design §5); UI Monitoring menyusul di plan terpisah.
- Endpoint lama `POST` evaluate di `apps/api/src/routes/pdkt/mailbox.ts` (sekitar baris 270–295) yang hanya mengembalikan subset field. Biarkan apa adanya.
- Telaah ulang otomatis untuk telaah lama tanpa `consumerPoints`. `hasStoredReplyMarks` tidak diubah.

## Design

### 1. Tipe bersama — `packages/types/src/pdkt.ts`

Tambahkan di dekat `pdktReplyAnnotationSchema`:

```ts
export const PDKT_CONSUMER_POINT_LIMITS = { count: 5, quote: 300 } as const;
export const PDKT_CONSUMER_POINT_STATUSES = [
  "answered",
  "partial",
  "unanswered",
] as const;

export const pdktConsumerPointSchema = z
  .object({
    quote: z.string().min(1).max(PDKT_CONSUMER_POINT_LIMITS.quote), // dari email konsumen
    summary: z.string().min(1).max(PDKT_PROMPT_INPUT_LIMITS.issueText), // mis. "Minta restrukturisasi"
    status: z.enum(PDKT_CONSUMER_POINT_STATUSES),
    reason: z.string().max(PDKT_PROMPT_INPUT_LIMITS.issueText).nullable(), // wajib untuk partial/unanswered
    start: z.number().int().nonnegative().nullable(), // posisi di body email konsumen
    end: z.number().int().nonnegative().nullable(),
    replyQuote: z.string().max(PDKT_CONSUMER_POINT_LIMITS.quote).nullable(), // kalimat jawaban di balasan
    replyEnd: z.number().int().nonnegative().nullable(), // posisi label huruf di balasan
  })
  .strict();
export const pdktStoredConsumerPointsSchema = z
  .array(pdktConsumerPointSchema)
  .max(PDKT_CONSUMER_POINT_LIMITS.count);
```

- Huruf A/B/C **tidak** disimpan. Frontend menghitungnya dari urutan baca, sama seperti nomor catatan.
- `pdktReplyAnnotationSchema`: tambah `kind: z.enum(["transition"]).optional()` dan `example: z.string().max(PDKT_PROMPT_INPUT_LIMITS.issueText).optional()`. Skema ini `.strict()`, jadi field opsional baru tetap kompatibel dengan data lama.
- `PDKT_REPLY_ANNOTATION_LIMITS.count`: 8 → **12**. Karena F2 menyembunyikan `typos`/`clarityIssues` di Telaah, semua temuan ejaan/kejelasan yang menunjuk kalimat harus muat di annotations.
- `PdktEvaluationResult`: tambah `consumerPoints?: PdktConsumerPoint[]`.

### 2. Normalisasi backend — `apps/api/src/services/pdkt/`

- Pindahkan `locateQuote` dan `overlaps` dari `reply-annotations.ts` menjadi export, atau ke helper kecil di file yang sama. Pakai ulang untuk email konsumen; jangan menduplikasi logika.
- Tambah `readPdktConsumerPoints(value, inboundEmailBody, agentReplyBody)` di file baru `consumer-points.ts` (atau di `reply-annotations.ts` bila tetap kecil). Polanya sama dengan `readPdktReplyAnnotations`:
  - Item tidak valid dibuang tanpa menggagalkan penilaian. Item tidak valid berarti status di luar enum, `quote`/`summary` kosong, atau `reason` kosong untuk `partial`/`unanswered`.
  - `quote` dicari di `inboundEmailBody` → `start`/`end`; `null` bila tidak ketemu atau bertumpuk.
  - `replyQuote` hanya dipakai untuk `answered`/`partial` dan dicari di `agentReplyBody`. `replyEnd` = akhir kecocokan atau `null`. Untuk `unanswered`, `replyQuote` dan `replyEnd` dipaksa `null`.
  - Batasi ke `PDKT_CONSUMER_POINT_LIMITS.count`.
- `readPdktReplyAnnotations`: baca `kind` dan `example`. Bila `kind === "transition"`, paksa `dimension = "clarity"`. Buang `example` yang kosong atau terlalu panjang; `example` tanpa `kind` tetap boleh.
- `normalizePdktEvaluationResult` (fungsi di sekitar baris 355–420):
  - `consumerPoints` **opsional** di respons AI. Kalau tidak ada atau bukan array, simpan `[]`; jangan anggap respons tidak valid. Ini berbeda dari `annotations` yang wajib, supaya pembaruan prompt tidak menaikkan tingkat retry.
  - Kembalikan `consumerPoints` di kedua cabang return.
- Saat membangun `userFacingAssessment` (sekitar baris 787–803): masukkan `consumerPoints` agar ikut di-redact. Di `redactExpectedAnswerFromValue`, tambahkan `status` dan `kind` ke daftar key yang tidak di-redact, di samping `category` dan `dimension`.
- Pastikan `consumerPoints` ikut tersimpan ke `pdkt_history.evaluation` di `processPdktEvaluation` dan ikut dikembalikan. Telusuri jalur penyimpanan `annotations` yang sudah ada dan ikuti pola yang sama.

### 3. Prompt — `buildPdktEvaluationPrompt` di `evaluation-service.ts`

Tambahkan ke blok `OUTPUT JSON`:

```
"consumerPoints": [{ "quote": string, "summary": string, "status": "answered"|"partial"|"unanswered", "reason": string|null, "replyQuote": string|null }],
"annotations": [{ "quote": string, "dimension": string, "note": string, "kind"?: "transition", "example"?: string }]
```

Tambahkan blok aturan baru. Bahasa Indonesia, gaya sama dengan aturan yang sudah ada.

**ATURAN CONSUMER POINTS**

- Maksimal 5 permintaan, pertanyaan, atau keluhan utama konsumen, urut sesuai kemunculan di email.
- `quote` WAJIB disalin persis dari `inboundEmailBody`, maksimal satu kalimat. Jangan mengutip balasan agent.
- `summary` adalah ringkasan 2–6 kata.
- `status`: `answered` bila balasan menanggapi poin itu secara substantif; `partial` bila ditanggapi tetapi tidak tuntas; `unanswered` bila tidak ditanggapi.
- `reason` berisi satu kalimat untuk `partial`/`unanswered`, dan `null` untuk `answered`.
- `replyQuote` disalin persis dari `agentReplyBody`: kalimat yang menjawab poin itu, atau `null` bila `unanswered`.

**Aturan satu temuan, satu tempat** (ganti baris terakhir "ATURAN ANNOTATIONS")

- Setiap temuan ejaan atau kejelasan yang menunjuk kalimat tertentu WAJIB ada di `annotations`, dan tetap dicatat di `typos`/`clarityIssues` sebagai rekap.
- `contentGaps` hanya berisi informasi wajib yang terlewat dan tidak berasal dari pertanyaan konsumen, misalnya batas waktu tindak lanjut atau kanal resmi. Concern konsumen yang belum terjawab cukup ditulis di `consumerPoints`, tidak diulang di `contentGaps`.

**ATURAN KALIMAT PENGHUBUNG**

- Bila balasan pindah dari satu topik ke topik lain tanpa kalimat pengantar sehingga terasa seperti tempelan, buat annotation dengan `kind: "transition"` dan `dimension: "clarity"` pada kalimat pertama topik baru.
- `example` berisi satu frasa atau kalimat penghubung yang natural. Isinya hanya pengantar ditambah nama topik, tanpa mengutip atau memparafrasekan standar jawaban atau `expectedAnswer`.
- Jangan mengkritik redaksi paragraf yang isinya sesuai standar jawaban; standar itu baku. Nilai hanya sambungan antar topik, pembuka, dan penutup.
- Alur yang tidak natural menurunkan `clarityScore`; jangan menambah dimensi baru.

**Ubah aturan `suggestedRewrite`**

- Pertahankan redaksi paragraf agent yang isinya sudah sesuai standar jawaban.
- Perbaiki pembuka, kalimat penghubung antar topik, penutup, dan bagian yang memang salah.

Periksa `PDKT_APPLICATION_PROMPT_BUDGET`. Prompt bertambah panjang; pastikan `dataBudget` tidak menjadi negatif atau memotong email untuk ukuran email yang wajar. Bila budget tidak cukup, **STOP** dan laporkan angkanya.

### 4. UI Telaah — `PdktReviewStage.tsx`, `apps/web/src/lib/pdkt-reply-marks.tsx`

**Penempatan penanda email konsumen**

- Tambah `placeConsumerPoints(points, body, renderMark)` di `pdkt-reply-marks.tsx`, mengikuti pola `placeReplyAnnotations`:
  - Validasi rentang dengan `hasValidRange`. Jadikan fungsi itu generik untuk objek `{ quote, start, end }`.
  - Urutkan menurut posisi baca, beri huruf A, B, C, ….
  - Poin tanpa posisi valid tetap mendapat huruf, diletakkan di akhir, dan tidak ditandai.

**`ConsumerEmail`**

- Bila `result.consumerPoints` berisi item, render body dalam satu blok `whitespace-pre-wrap` seperti "Balasan Anda". Jangan pakai `EmailBody`, karena `EmailBody` memecah dan men-`trim` paragraf sehingga posisi karakter bergeser.
- Bila tidak ada poin, tetap pakai `EmailBody` seperti sekarang (AC6).
- Verifikasi bahwa `readInboundEmail(item).body` adalah string yang sama dengan `inboundEmailBody` yang dinilai backend. Telusuri dari `emails` yang dikirim ke evaluasi. Bila berbeda, **STOP** dan laporkan; jangan menambal dengan pencarian fuzzy di frontend.
- `<mark>` memakai warna status dan `<sup>` berisi huruf yang tertaut ke daftar.
  - Pakai token warna yang sudah ada di `docs/design.md` atau `apps/web/src/index.css`. Bila tidak ada token hijau/amber/merah yang sesuai, pakai pola `bg-*-500/15` + `decoration-*` yang sudah dipakai di file ini.
  - Kontras teks harus lolos di tema terang dan gelap.

**Daftar "Poin konsumen"**

- `Section pane title="Poin konsumen"` di bawah body email, masih di dalam panel konsumen yang sticky.
- Tiap item: huruf (tautan balik ke penanda), ringkasan (`strong`), lalu status sebagai teks, ditambah `reason` bila ada.

**Label huruf di balasan**

- Perluas `placeReplyAnnotations`, atau tambahkan parameter, agar menerima titik sisip `{ at: replyEnd, letter }`. Label kecil (`<sup>`/chip, tanpa latar baru) disisipkan di posisi itu.
- Jika titik sisip jatuh di dalam rentang annotation, geser ke akhir rentang annotation tersebut.
- Label tertaut ke item poin konsumen dengan `aria-label="Lihat poin konsumen A"`.

**`OtherFindings`**

- Bila `Array.isArray(result.annotations)`, hanya tampilkan `contentGaps` (label "Isi yang kurang").
- Bila tidak, tampilkan perilaku lama.
- "Catatan AI" tidak berubah.

**Catatan `transition`**

- Di daftar "Catatan pada balasan", label aspek menjadi "Kalimat penghubung" bila `note.kind === "transition"`.
- Bila ada `example`, tampilkan baris `Contoh: “…”` di bawah note.
- Terapkan hal yang sama di `PdktReplyAnnotationsCard` (`apps/web/src/components/PdktEducationSections.tsx`), karena komponen itu juga merender annotations.

**Aturan UI**

- Teks minimal 12px (lihat commit `ac150bf`) dan target sentuh 44px. Jangan memakai `role="alert"` untuk konten statis.

### 5. Monitoring parse — `apps/api/src/services/monitoring-history-service.ts`

Di sekitar baris 135–156, `annotations` di-parse dengan `pdktStoredReplyAnnotationsSchema`. Lakukan hal yang sama untuk `consumerPoints` dengan `pdktStoredConsumerPointsSchema`: sertakan bila valid, buang bila tidak. Ini juga menjaga riwayat Telaah peserta (`dari=riwayat`) tetap membawa `consumerPoints`. Telusuri apakah halaman riwayat PDKT memakai service ini atau jalur lain, lalu pastikan field itu sampai ke `PdktReviewStage`.

## Tasklist

Kerjakan berurutan. Setiap fase: RED → konfirmasi gagal karena alasan yang benar → GREEN minimal → REFACTOR saat hijau.

### Fase 0 — Persiapan

- [x] Muat `trainers-superapp-tdd`.
- [ ] Drift-check plan ini terhadap `main` terbaru: nomor baris, nama fungsi, dan bentuk `PdktEvaluationResult`.
- [ ] Graphify: query caller `readPdktReplyAnnotations`, `placeReplyAnnotations`, `PdktEvaluationResult`, dan `redactExpectedAnswerFromValue` sebelum mengedit. Jalankan `graphify update .` sekali setelah batch selesai.
- [ ] Siapkan dependency worktree (`pnpm install` atau yang setara sesuai `package.json` root) bila diperlukan untuk menjalankan E2E.

### Fase 1 — F2: Temuan tanpa duplikasi (UI + prompt)

- [x] **RED** — di `apps/web/e2e/pdkt-flow.spec.ts`, pada test Telaah yang sudah memakai `annotations` (sekitar baris 1700–1960):
  - Ubah assertion `Temuan lain` agar region **tidak** berisi "Ejaan:" / "transkasi" / "Kalimat pembuka terlalu panjang".
  - Region tetap berisi "Isi yang kurang:" dan "Belum menyebut kanal pengaduan resmi".
- [x] Tambah assertion untuk telaah lama tanpa `annotations` (fixture `EVALUATED_HISTORY`, test di sekitar baris 1982): "Temuan lain" tetap menampilkan Ejaan dan Kejelasan.
- [ ] Jalankan, lalu konfirmasi gagal pada assertion yang benar.
- [x] **GREEN** — ubah `OtherFindings`.
- [x] Perbarui prompt: aturan satu temuan satu tempat dan definisi `contentGaps`.

### Fase 2 — F3: Kalimat penghubung

- [x] **RED (E2E)** — tambah annotation `{ kind: "transition", dimension: "clarity", note, example, start, end }` ke fixture Telaah. Assert:
  - catatan berlabel "Kalimat penghubung" (bukan "Kejelasan");
  - catatan berisi `Contoh: “…”`;
  - penandanya ada di balasan.
- [x] **GREEN** — tipe (`kind`, `example`, limit 12), normalisasi `readPdktReplyAnnotations`, UI di `PdktReviewStage` dan `PdktReplyAnnotationsCard`.
- [x] Perbarui prompt: aturan kalimat penghubung dan aturan `suggestedRewrite`.

### Fase 3 — F1: Poin konsumen

- [x] **RED (E2E)** — fixture Telaah baru dengan `consumerPoints`. Contoh:
  - A `answered` dengan `replyEnd` valid;
  - B `unanswered` dengan `reason`;
  - C dengan `start: null`.

  Assert:
  - penanda di "Email konsumen" berjumlah 2 dengan huruf A, B;
  - teks status "Terjawab" dan "Belum terjawab" tampil;
  - daftar "Poin konsumen" punya 3 item; C berisi "Tidak ditandai di email";
  - tautan huruf ↔ daftar memindahkan fokus dua arah;
  - label "A" muncul di "Balasan Anda" dan tertaut ke poin A;
  - jumlah `mark` oranye di balasan tidak berubah;
  - kontras teks lolos di tema terang dan gelap (`findLowContrastText`), dan tidak ada overflow horizontal di 390px.

- [x] Tambah assertion bahwa telaah lama tanpa `consumerPoints` tidak menampilkan region "Poin konsumen", dan email konsumen tetap dirender seperti sebelumnya.
- [x] **GREEN** — tipe dan skema, `readPdktConsumerPoints`, normalisasi, redaksi, penyimpanan, parse Monitoring, prompt, `placeConsumerPoints`, dan UI.

### Fase 4 — Test non-E2E (STOP, minta izin dulu)

E2E Telaah memakai respons API yang di-mock, jadi **tidak membuktikan** hal-hal berikut:

- normalisasi backend `readPdktConsumerPoints`: kutipan ketemu atau tidak, tumpang tindih, status di luar enum, `reason` kosong untuk `partial`/`unanswered`, `replyQuote` dipaksa `null` untuk `unanswered`, dan batas 5 item;
- `kind: "transition"` memaksa `dimension = "clarity"`;
- `consumerPoints` yang tidak ada di respons AI tidak menggagalkan penilaian;
- `redactExpectedAnswerFromValue` me-redact `summary`/`reason`/`example` tetapi tidak `status`/`kind`.

Alternatif terkecil yang diusulkan: perluas `apps/api/src/__tests__/pdkt-reply-annotations.test.ts` yang sudah ada.

- [x] **Tanya Fajar dulu** sebelum menambah atau menjalankan test ini, sesuai `AGENTS.md`. Bila disetujui, daftar semua failure mode di atas sebelum menulis test.
- [x] Jangan menambahkan test ini ke `scripts/test-core.json` atau `scripts/test-fast.json`.

### Fase 5 — Verifikasi akhir

- [x] `pnpm --filter web exec playwright test e2e/pdkt-flow.spec.ts`: semua hijau, satu run saja.
- [x] Typecheck dan lint untuk workspace `web`, `api`, dan `types`. Gunakan script yang ada di `package.json` masing-masing; cek nama persisnya.
- [x] Review `thermo-nuclear`.
- [x] Audit `impeccable` pada tahap Telaah, karena ada elemen visual baru: warna status dan label huruf.
- [x] `git diff --check`.
- [x] Perbarui baris plan ini di `plans/README.md` → "Module behavior plans", lengkap dengan status dan bukti.
- [x] Laporan akhir berisi perintah persis, hasilnya, daftar file yang diubah, assertion E2E lama yang diubah beserta alasannya, dan hal yang **tidak** diverifikasi. Contoh hal yang tidak diverifikasi: kualitas keluaran AI sungguhan terhadap aturan prompt baru, karena E2E memakai mock.

## STOP conditions

- Body email konsumen di frontend berbeda dari `inboundEmailBody` yang dinilai backend (Design §4).
- Prompt melebihi `PDKT_APPLICATION_PROMPT_BUDGET` untuk email berukuran wajar.
- Ternyata perlu migration, perubahan RLS, atau perubahan yang tidak aditif pada respons API.
- Ada assertion E2E lama yang harus dihapus, bukan disesuaikan, di luar assertion "Temuan lain" pada F2.
- Butuh test non-E2E (Fase 4) dan belum ada izin Fajar.

## Laporan implementasi (2026-10-14)

Dikerjakan Codex (sampai kuota habis), lalu diselesaikan dan diverifikasi Claude Code di worktree ini. Belum di-commit.

### Perbaikan sesudah Codex

- Label huruf poin di dalam teks (email konsumen dan balasan) tidak lagi berupa kotak 44px inline yang merenggangkan baris. Label tetap kecil; area sentuh 44px lewat pseudo-elemen (`after:z-10`), huruf di `z-20`, nomor catatan balasan `relative z-20` agar tidak tertutup label tetangga. Assertion E2E diganti: tinggi label ≤ tinggi baris, tengah label mengenai dirinya, keempat sudut kotak 44px mengenai link (target bersebelahan boleh berbagi area, sesuai pengecualian jarak WCAG 2.5.8). Link di daftar "Poin konsumen" tetap kotak 44px.
- Huruf di daftar "Poin konsumen" diberi lingkaran 24px berwarna status.
- Validasi posisi label di balasan dipindah ke `consumerPointReplyEnd` di `src/lib/pdkt-reply-marks.tsx` (tidak menduplikasi `collapseSpaces`); `OtherFindings` disederhanakan.
- `text-[12px]` buatan Codex dikembalikan ke `text-xs` (`--text-xs` sudah 12px); hunk format-saja di file lama (`pdkt.ts`, `monitoring-history-service.ts`, `PdktEducationSections.tsx`, `docs/modules.md`, `evaluation-service.ts`) dikembalikan agar diff fokus.

### Bukti

| Perintah                                                                                                   | Hasil                                                                   |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `npx playwright test e2e/pdkt-flow.spec.ts` (apps/web)                                                     | 65 passed (4.4m)                                                        |
| RED label inline: `-g "tahap Telaah: skor, rincian"` sebelum perbaikan                                     | gagal: tinggi 44 > 24.5 (tinggi baris)                                  |
| `npx vitest run src/__tests__/pdkt-reply-annotations.test.ts` (apps/api, env dummy lokal; disetujui Fajar) | 19 passed                                                               |
| `tsc --noEmit` di `packages/types`, `apps/api`, `apps/web` (+ `tsconfig.e2e.json`)                         | lolos                                                                   |
| `eslint` pada file yang diubah                                                                             | lolos, 0 warning                                                        |
| `git diff --check`                                                                                         | bersih                                                                  |
| `graphify update .`                                                                                        | graph diperbarui                                                        |
| Budget prompt (`buildPdktEvaluationPrompt`, tsx)                                                           | overhead tetap 8.041 dari 199.488 karakter; email 5k+5k tidak terpotong |

### Catatan

- Satu run penuh sebelumnya gagal 1 test ("Riwayat membuka sesi yang ditelaah di tahap Telaah") karena polling `history/eval` tak dimock; lulus 4/4 saat diulang dan file terkait tidak diubah — flake yang sudah ada.
- Audit `impeccable` (2026-10-14): skor awal 17/20, detektor `impeccable detect` 0 temuan, tanpa P0/P1. Semua temuan diperbaiki:
  - P2: status poin tidak lagi hanya lewat warna. Garis bawah utuh/putus/titik untuk terjawab/sebagian/belum terjawab; label status di daftar memakai garis yang sama sebagai legenda; `aria-label` label huruf menyebut status ("Lihat poin konsumen A, terjawab").
  - P3: heading "Poin konsumen" menjadi `<h4>` lewat prop `level` pada `Section`.
  - P3: `amber-500` diganti token `chart-amber`.
  - P3: email bertanda dirender per paragraf seperti `EmailBody` (`placeConsumerPoints` kini mengembalikan `paragraphs`); kutipan yang melewati batas paragraf dipotong per paragraf dan label hanya di potongan terakhir.
  - Bukti: RED pada assertion heading `<h4>`; GREEN `npx playwright test e2e/pdkt-flow.spec.ts` 65 passed (4.4m); `tsc` web + e2e, eslint file berubah, `git diff --check` lulus; screenshot desktop tema terang diperiksa.
  - Sisa: kontras garis bawah hijau/amber di tema terang tetap di bawah 3:1 (2,54 dan 2,15), tetapi status kini juga dibedakan oleh gaya garis dan teks. Jalur kutipan lintas paragraf belum punya fixture E2E sendiri.
- Tidak diverifikasi: kualitas keluaran AI sungguhan terhadap aturan prompt baru (E2E memakai mock).
- Unit test diperluas Codex dengan izin Fajar; tidak ditambahkan ke `scripts/test-core.json`/`test-fast.json`.

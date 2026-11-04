# Akurasi transkrip agen Telefun

Status: **SELESAI IMPLEMENTASI DAN VERIFIKASI LOKAL** — E2E RED → GREEN, 42 E2E lulus, root typecheck/lint/build lulus. Commit/push merupakan langkah penutup sesi; tidak menjalankan deploy atau panggilan AI nyata. Dibuat 2026-11-04 dari telaah kode di `main` (`bd82b7c6`).

Keputusan Fajar saat implementasi (2026-11-04): total waktu bicara agen <5 detik ditolak dengan pesan ramah, tanpa WPM palsu atau perubahan skema. Jumlah tepat 6 kata pengisi masuk pita skor 4–6 (pita menjadi 3–6; >6 tetap 0–3). Lease/default minimum worker dinaikkan menjadi 600 detik agar mencakup dua timeout Gemini 180 detik beserta margin; override lama harus disesuaikan sebelum rollout. Fajar juga menyetujui perbaikan query worker agar kegagalan yang sudah mencapai 3 attempt tidak otomatis diambil lagi; retry manual tetap diizinkan.

## Requirement

Transkrip verbatim ucapan agen pada penilaian Telefun harus lebih akurat, dan angka yang diturunkan darinya harus dihitung dari transkrip itu, bukan ditebak model.

Model tetap `gemini-3.8-flash` (`TELEFUN_ASSESSMENT_MODEL`). Jangan ganti provider atau model, jangan tambah Chirp/Speech-to-Text (keputusan Fajar, 2026-11-04).

Kriteria penerimaan:

1. Transkrip agen dibuat oleh panggilan Gemini **terpisah** yang hanya bertugas mentranskripsi, sebelum panggilan penilaian.
2. Transkrip mempertahankan kata pengisi dan disfluensi persis seperti diucapkan ("eh", "hm", "anu", "gitu", "apa ya", pengulangan, kalimat terpotong). Tidak ada penormalan ejaan yang menghapus kata pengisi.
3. `speakingRate.wordsPerMinute`, `fillerWords.count`, dan `fillerWords.examples` dihitung oleh kode dari transkrip langkah 1, lalu menimpa nilai dari model.
4. Skor `speakingRate` dan `fillerWords` konsisten dengan angka terhitung: di-clamp ke pita rubrik yang sudah ada di prompt (lihat Design §4).
5. Panggilan penilaian menerima transkrip langkah 1 dan angka terhitung sebagai fakta, dan tidak lagi diminta menulis transkrip sendiri.
6. Kedua panggilan tercatat lewat `logAiUsage` (via `generateGeminiContent` + `usageContext` + `userId`). Panggilan baru memakai action `voice_transcription` dan terdaftar di `apps/api/src/lib/ai-usage-categories.ts` dengan kategori yang sama seperti `voice_assessment`.
7. Kontrak keluaran `voice_assessment` (bentuk JSON yang disimpan dan dibaca web/PDF/Monitoring) **tidak berubah**. Penilaian lama tersimpan tetap dibaca apa adanya; hanya penilaian baru atau "Telaah ulang" (`fresh`) yang memakai alur baru.
8. Kegagalan langkah transkripsi menggagalkan penilaian dengan error ramah (Bahasa Indonesia) dan masuk ke jalur retry antrean scoring yang sudah ada. **Jangan** jatuh balik ke alur lama satu-panggilan atau mengisi angka palsu.

Di luar cakupan: transkrip dua arah dari Gemini Live (`messages`), telaah isi (`contentReview`), ringkasan coaching, anotasi, UI, skema database, deploy.

## Design

Lane **D** saat eksekusi (semula C): orkestrasi AI, action usage baru, dan penyesuaian lease klaim yang disetujui Fajar; tanpa perubahan skema/RLS/API publik. Panduan lokal `trainers-superapp-tdd` dibaca sebelum mengedit; review langsung `thermo-nuclear` sebelum verifikasi akhir. Tidak ada delegasi.

### Temuan yang mendasari (kode saat ini)

- `analyzeVoiceQuality` di `apps/api/src/lib/telefun-analysis.ts` mengirim rekaman agen (`audio/webm`, base64) dalam **satu** panggilan yang sekaligus menilai 5 indikator dan menulis `transcript`.
- Di `TELEFUN_VOICE_ASSESSMENT_JSON_SCHEMA` (`packages/types/src/telefun-assessment.ts`), `transcript` adalah field **terakhir**, sesudah `wordsPerMinute` dan `fillerWords.count`. Model menulis angka sebelum transkrip, jadi angka itu tebakan walau prompt berkata "hitung dari transcript".
- Prompt meminta "verbatim 100%" sekaligus "gunakan ejaan Indonesia benar", yang mendorong model merapikan "gitu" → "begitu" dan membuang "eh/hm".
- Durasi bicara agen tidak diberikan ke model; WPM dihitung dari durasi yang ditebak.
- `generateGeminiContent` (`apps/api/src/lib/gemini.ts`) belum meneruskan opsi generation config selain schema/modality.

### 1. Langkah transkripsi (panggilan baru)

Helper baru, misalnya `transcribeTelefunAgentAudio({ base64Audio, scenarioTitle, userId, signal })`, di file baru `apps/api/src/lib/telefun-transcription.ts`.

- Model: `TELEFUN_ASSESSMENT_MODEL`. `usageContext: { module: "telefun", action: "voice_transcription" }`.
- Response schema JSON: `{ segments: [{ startSec: number, endSec: number, text: string }] }`, urut waktu. Transkrip penuh = gabungan `text` segmen.
- Prompt, Bahasa Indonesia, isinya hanya transkripsi:
  - Tulis persis yang diucapkan agen; pertahankan kata pengisi, pengulangan, kata terpotong; jangan merapikan tata bahasa atau ejaan informal.
  - Abaikan suara selain agen (rekaman ini jalur agen, tapi bisa ada bocoran suara konsumen).
  - Daftar istilah konteks untuk ejaan nama/istilah: OJK, 157, SLIK, pinjol, dsb. plus judul skenario. Ambil daftar istilah dari konstanta yang sudah ada bila ada; jika tidak, buat konstanta kecil di helper.
  - Bagian tak terdengar ditandai `[tidak jelas]`.
  - Jangan menambahkan ringkasan, penilaian, atau komentar.
- Generation config: cek via **Context7** (`@google/genai` + dokumentasi Gemini 3) apakah untuk keluarga Gemini 3 disarankan tetap memakai temperature bawaan dan mengatur `thinkingConfig.thinkingLevel`. **Jangan** turunkan temperature ke 0 bila dokumentasi menyarankan bawaan (Gemini 3 dikenal bisa looping pada temperature rendah). Bila perlu opsi baru, tambahkan parameter opsional `generationConfig`/`thinkingLevel` ke `generateGeminiContent` dan teruskan ke `config`; jangan ubah perilaku pemanggil lain.
- Validasi hasil: segmen kosong untuk audio > 5 detik, `endSec < startSec`, atau JSON tak valid → return `{ success: false, error: "Transkrip rekaman agen gagal dibuat." }`.

### 2. Metrik terhitung (kode murni)

Fungsi murni di helper yang sama, misalnya `computeTelefunSpeechMetrics(segments)`:

- `wordCount`: token kata dari transkrip; abaikan penanda `[tidak jelas]` dan tanda baca.
- `speakingSeconds`: jumlah `(endSec - startSec)` per segmen. WPM = `wordCount / (speakingSeconds / 60)`, dibulatkan ke integer. Bila `speakingSeconds` < 5, tolak penilaian dengan pesan ramah (keputusan Fajar saat eksekusi). Parser lama mewajibkan angka; jangan mengisi WPM palsu atau mengubah kontrak menjadi nullable.
- Kata pengisi: konstanta `TELEFUN_FILLER_PATTERNS` dengan batas kata dan pemanjangan huruf (`e+h`, `h+m+`, `e+m+`, `anu`, `gitu`, `apa ya`, `eee+`). `count` = total kecocokan, `examples` = kecocokan aktual unik dalam bentuk tertulisnya, maksimal 10.
- "gitu" bisa bukan pengisi; terima itu sebagai batas yang diketahui dan catat di `docs/telefun.md`. Jangan bangun klasifikasi berbasis AI untuk ini.

### 3. Panggilan penilaian (diubah)

- Tetap kirim audio (dibutuhkan untuk intonasi, artikulasi, nada emosional).
- Tambahkan ke prompt: transkrip langkah 1 dan angka terhitung (`wordsPerMinute`, `fillerCount`, `fillerExamples`, `speakingSeconds`) sebagai fakta yang **tidak boleh diubah**; feedback wajib mengutip angka itu.
- Hapus instruksi menulis transkrip dan instruksi menghitung WPM/filler dari prompt penilaian.
- Response schema: biarkan bentuk `TELEFUN_VOICE_ASSESSMENT_JSON_SCHEMA` apa adanya agar kontrak tidak berubah, tapi setelah parse timpa `transcript`, `speakingRate.wordsPerMinute`, `fillerWords.count`, `fillerWords.examples` dengan nilai langkah 1–2. Bila skema mewajibkan `transcript`, cukup minta model mengisi string kosong; jangan buat skema kedua kecuali parse menolak.

### 4. Clamp skor ke pita rubrik

Pita yang sudah ada di prompt:

- Kecepatan: 130–150 → 9–10; 120–129 atau 151–165 → 7–8; < 120 atau > 165 → 4–6 (sangat jauh di luar → 0–3 tetap boleh dari model).
- Kata pengisi: 0 → 9–10; 1–2 → 7–8; 3–6 → 4–6; > 6 → 0–3 (jumlah tepat 6 ditetapkan Fajar saat eksekusi).

Clamp skor model ke pita yang cocok dengan angka terhitung, lalu hitung ulang `overallScore` dengan cara yang sama seperti normalisasi yang sudah ada (cek `applyHoldAssessmentToOverallScore` dan parser; jangan duplikasi rumus).

### 5. Abort dan klaim

Pertahankan semua pemeriksaan `signal?.aborted` dan klaim scoring yang ada. Tambahkan pemeriksaan `signal?.aborted` tepat sebelum **setiap** panggilan provider (transkripsi dan penilaian). Pemeriksaan ulang klaim (`scoring_claim_token_hash`) tetap sebelum panggilan provider pertama dan diulang sebelum penilaian agar capture/klaim yang berubah selama transkripsi tidak memulai panggilan kedua. Lease bersama/default minimum worker 600 detik. Query worker menyaring baris failed yang mencapai `MAX_SCORING_ATTEMPTS` sebelum LIMIT; jalur scoring manual tetap tersedia (perluasan scope yang disetujui Fajar).

## Tasklist

- [x] Baca panduan lokal `trainers-superapp-tdd`; drift-check terhadap `main` (`fbb6f97f`), schema, parser, caller, dan tes.
- [x] Context7 + dokumentasi resmi + SDK terpasang: thinking/schema/timestamp; tanpa temperature, LOW untuk transkripsi.
- [x] RED sebelum implementasi lewat `telefun-scoring-api.spec.ts`: dua panggilan scoring berurutan, fakta transkrip/WPM/filler, clamp, kegagalan tanpa fallback, cache tanpa AI, dan usage kedua action.
- [x] Implementasi Design §1–§5 serta action `voice_transcription` di kategori review yang sama.
- [x] RED → GREEN tambahan: classifier retry, lease 600, capture race saat transkripsi, celah skor desimal, dan batas 3 retry otomatis; retry manual terbukti tetap tersedia.
- [x] GREEN scoring dan regresi serial queue/bahasa/PDF: **42 passed**, tanpa provider nyata.
- [x] Review langsung dengan panduan `thermo-nuclear`; semua temuan material diperbaiki dan diverifikasi.
- [x] Dokumentasi scoring, kontrak assessment, operasi lease/rollout, serta batas "gitu" diperbarui.
- [x] Gate akhir: API `tsc --noEmit`, root typecheck/lint/build serial, scoped Prettier (tanpa reformat legacy), `git diff --check`, dan satu `graphify update .`.
- [x] Siapkan entri `CHANGELOG.md` dan scope commit/push `main`; commit/push dilaksanakan sebagai langkah penutup setelah gate. Tanpa deploy.
- [ ] Opsional (belum diotorisasi): uji manual 3–5 rekaman dengan provider nyata. Tidak dijalankan; akurasi audio nyata belum diklaim.

## STOP conditions

- Parser `voice_assessment` atau konsumen web/PDF ternyata membutuhkan field baru untuk alur ini → berhenti dan tanya Fajar; kontrak tidak boleh berubah diam-diam.
- Dokumentasi Gemini menyatakan timestamp segmen audio tidak tersedia/tidak andal untuk `gemini-3.8-flash` → berhenti dan laporkan; jangan ganti ke durasi panggilan (`duration_seconds` mencakup bicara konsumen sehingga WPM jadi salah).
- Perlu tes non-E2E untuk membuktikan regex kata pengisi → tanya Fajar dulu sesuai `AGENTS.md`.

## Evidence

### Discovery dan keputusan

- Working tree awal bersih, branch `main` pada `fbb6f97f`. Model tetap `TELEFUN_ASSESSMENT_MODEL = gemini-3.8-flash`; schema publik tidak diubah.
- Panduan lokal TDD, Context7, Graphify, dan thermo-nuclear dibaca langsung (skill ini tidak diekspos sebagai tool skill pada host DSH). Graphify `explain "analyzeVoiceQuality"` berhasil menunjukkan caller route/service/worker.
- Context7: `resolve-library-id` → `/googleapis/js-genai`, kemudian `query-docs` untuk thinking/schema/timestamp. Manifest meminta `^2.29.0`, versi terpasang `2.30.0`; declaration lokal mendukung `ThinkingLevel` dan `responseSchema`.
- Referensi resmi dibaca lewat agent-reach/Jina: [audio understanding](https://ai.google.dev/gemini-api/docs/audio), [Gemini 3.8 thinking levels](https://aistudio.google.com/docs/whats-new-gemini-3.8), dan [perubahan parameter Gemini 3.6+](https://aistudio.google.com/docs/whats-new-gemini-3.6#api-changes-and-parameter-updates). Audio bersegmen/timestamp didokumentasikan untuk model ini; LOW didukung, MINIMAL tidak. Sampling parameters sudah deprecated/diabaikan: tidak menambahkan temperature. Tidak bermigrasi provider/API atau mengubah pemanggil lain.
- Fajar menyetujui empat keputusan lewat pertanyaan eksplisit: tolak bicara <5 detik; tepat 6 pengisi masuk 4–6; lease/default minimum worker 600 detik; dan perbaikan batas retry otomatis worker. Penyesuaian lease, classifier error, dan filter retry diperlukan untuk mempertahankan keamanan klaim serta biaya setelah alur menjadi dua panggilan.

### E2E RED → GREEN (semua target lokal/disposable)

Semua perintah Playwright dijalankan dari `apps/web`, satu worker, serial. Backend Hono/JWT/PostgREST/RPC/usage sungguhan untuk scoring dan antrean; transport Gemini di-stub fail-closed. Tidak ada panggilan Gemini nyata. Stack Supabase semula mati; OrbStack diaktifkan dan stack lokal dipulihkan dari volume yang sama dengan layanan minimum termasuk Storage, tanpa reset atau migrasi.

- RED utama (exit 1): `pnpm exec playwright test --config playwright.api.config.ts --project telefun-scoring-real-backend --workers=1 telefun-scoring-api.spec.ts -g "new scoring transcribes first" --trace on`. Kode lama hanya membuat dua request (assessment + coaching), bukan tiga (transcription + assessment + coaching). Trace disalin ke `apps/web/test-results/telefun-transcript-red/trace.zip` sebelum run berikutnya.
- RED retry worker: error transkripsi semula diklasifikasi permanen; test antrean nyata membuktikan tidak rescheduled. Kini pesan transkripsi kanonis dikenali sebagai transient, memakai batas attempt/backoff lama. Kegagalan manual memiliki retry date null (berarti due), bukan harus non-null; eligibility dibuktikan lewat query antrean produksi yang dibatasi ke fixture milik run.
- RED lease (exit 1): run `-g "new scoring transcribes first|malformed JSON" --output test-results/telefun-transcript-lease-red` menemukan RPC memakai 300 detik, tidak mencakup dua timeout 180 detik. Sesudah persetujuan Fajar, shared lease/default/minimum menjadi 600.
- RED capture race (exit 1): `pnpm exec playwright test --config playwright.api.config.ts --project telefun-scoring-queue-real-backend --workers=1 telefun-scoring-queue-api.spec.ts -g "capture failure fences an in-flight provider" --trace on --output test-results/telefun-transcript-claim-red` mendeteksi assessment masih dimulai setelah capture gagal saat transkripsi. Pemeriksaan admission yang sama kini dipakai sebelum kedua panggilan; assertion lama tetap 1 request saat race, tidak dilonggarkan menjadi 2.
- RED celah pita (exit 1): skor 3.5 pada WPM di luar rentang semula lolos di antara pita 0–3/4–6. Test melalui endpoint membuktikan kegagalan; normalisasi kini mempertahankan 0–3 atau clamp ke 4–6.
- GREEN scoring akhir (exit 0, **13 passed**): `pnpm exec playwright test --config playwright.api.config.ts --project telefun-scoring-real-backend --workers=1 telefun-scoring-api.spec.ts --trace on --output test-results/telefun-transcript-final`. Mencakup urutan, fakta tersimpan (114 WPM/10 filler dari 10 detik bicara, bukan durasi panggilan 300 detik), usage/action, cache tanpa AI, JSON/interval/segmen rusak, audio pendek, retry worker, semua batas pita + hold, fresh rerun, maksimum 10 contoh unik, skor model rendah, dan abort antara panggilan. Fixture menunggu write coaching sebelum cleanup agar pekerjaan async tidak lolos ke tes berikutnya.
- GREEN queue (exit 0, **17 passed**): `pnpm exec playwright test --config playwright.api.config.ts --project telefun-scoring-queue-real-backend --workers=1 telefun-scoring-queue-api.spec.ts --trace on --output test-results/telefun-transcript-queue`. Termasuk race/fencing dan byte-preservation Storage nyata. Fixture sukses diperbarui untuk dua panggilan serta skor terhitung 8.4; cache lama tidak diubah.
- GREEN bahasa (exit 0, **3 passed**): `pnpm exec playwright test --config playwright.api.config.ts --project telefun-language-evidence-stub --workers=1 telefun-language-evidence-api.spec.ts --trace on --output test-results/telefun-transcript-language`. Fixture lama belum memenuhi capture readiness/owned paths/token klaim yang sudah diwajibkan kode sebelum pekerjaan ini; fixture diselaraskan tanpa melonggarkan produk. Anotasi tetap memakai `messages`, tanpa panggilan AI tambahan tersendiri.
- GREEN PDF (exit 0, **9 passed**): `pnpm exec playwright test telefun-review-pdf.spec.ts --workers=1 --timeout 90000 --trace on --output test-results/telefun-transcript-pdf-final`. Run awal tanpa override timeout (exit 1) menghasilkan 8 passed dan 1 timeout 30 detik pada `boundingBox` tombol yang sudah visible saat cold start. Tidak ada kode UI/PDF atau assertion diubah; run ulang seluruh suite lolos, termasuk PDF terbaca, hasil lama, error unduhan, serta race Telaah ulang.

- RED retry cap (exit 1): `pnpm exec playwright test --config playwright.api.config.ts --project telefun-scoring-real-backend --workers=1 telefun-scoring-api.spec.ts -g "malformed JSON" --trace on --output test-results/telefun-transcript-retry-cap-red` membuktikan query lama masih mengembalikan fixture failed setelah attempt ketiga. Dengan persetujuan Fajar, query kini menyaring kegagalan yang mencapai `MAX_SCORING_ATTEMPTS` sebelum LIMIT, tanpa mengubah cabang retirement atau retry manual.
- GREEN integrasi API paling akhir (exit 0, **33 passed**, termasuk 13 scoring + 17 queue + 3 bahasa): `pnpm exec playwright test --config playwright.api.config.ts --project telefun-scoring-real-backend --project telefun-scoring-queue-real-backend --project telefun-language-evidence-stub --workers=1 --max-failures=1 --trace on --output test-results/telefun-transcript-final-api`. Kasus JSON rusak sekarang menuntaskan tiga attempt, membuktikan batch berikutnya tidak memulai AI, lalu membuktikan retry manual berhasil. Bersama PDF final: **42 E2E passed**.

### Review dan gate akhir

Review langsung mengikuti thermo-nuclear, bukan review independen. Verdict kode: **PASS** setelah perbaikan dan GREEN integrasi. Temuan material yang diperbaiki: retry pesan baru, lease dua panggilan, recheck capture/klaim setelah transkripsi, rebuild communication profile dari fakta akhir, celah skor desimal antarpita, dan kegagalan maksimum yang masih diambil ulang oleh worker. Tidak ada skema baru, dependency baru, perubahan UI, unit test baru, atau deploy.

Gate yang sudah dijalankan dari root:

- `pnpm --dir apps/api exec tsc --noEmit -p tsconfig.json` — exit 0.
- `pnpm exec turbo run typecheck --concurrency=1` — exit 0; run terakhir sesudah retry-cap fix: 4 workspace sukses, 2 cache hit. Web juga mengecek konfigurasi E2E.
- `pnpm exec turbo run lint --concurrency=1` — exit 0; 4 workspace sukses, 2 cache hit. Ada 76 warning pada file yang tidak diubah (8 API + 68 web), tanpa error atau warning pada file implementasi ini.
- `pnpm exec turbo run build --concurrency=1` — exit 0; 3 build sukses tanpa cache. Warning Vite terkait `__dirname` pada config yang tidak diubah; bukan kegagalan build.
- `pnpm exec prettier --check apps/api/src/lib/telefun-transcription.ts apps/api/src/lib/gemini.ts apps/api/src/lib/telefun-analysis.ts apps/api/src/services/telefun-scoring-service.ts apps/web/e2e/helpers/telefunScoringQueueFixtures.ts apps/web/e2e/telefun-language-evidence-api.spec.ts apps/web/e2e/telefun-scoring-api.spec.ts apps/web/e2e/telefun-scoring-queue-api.spec.ts docs/telefun.md plans/README.md plans/markdown/telefun-agent-transcript-accuracy.md CHANGELOG.md` — exit 0.
- `git diff --check` — exit 0.
- `graphify update .` — exit 0, dijalankan sekali setelah build: 18.647 nodes, 35.834 edges, 1.180 communities. HTML viz dilewati karena ukuran graph >5.000 node; JSON/report cache berhasil diperbarui. Cache tidak di-stage/commit.

Prettier: baseline diperiksa terhadap HEAD. Enam file legacy sudah tidak Prettier-clean sebelum perubahan (`ai-usage-categories.ts`, `telefun-scoring-errors.ts`, kedua file worker, kontrak assessment, dan dokumentasi deployment); gaya lama dipertahankan agar tidak terjadi reformat menyeluruh yang tidak terkait. File baru serta file yang sebelumnya bersih diformat dan lolos scoped check.

Cleanup: server web Playwright selesai/ditutup oleh runner; `supabase stop --project-id trainerssuperappvite` selesai exit 0 dan menyimpan data lokal ke volume. Hanya fixture UUID/user milik run yang dibersihkan oleh E2E, tanpa reset database atau perubahan remote.

Validasi manual pada 3–5 rekaman nyata **tidak dijalankan** (belum ada izin biaya API). Tes hermetic membuktikan kontrak/pipeline, bukan peningkatan akurasi fonetik atau presisi timestamp Gemini pada rekaman nyata.

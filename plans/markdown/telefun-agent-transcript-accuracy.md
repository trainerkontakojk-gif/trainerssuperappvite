# Akurasi transkrip agen Telefun

Status: **BELUM DIKERJAKAN** — siap diambil agent pelaksana. Dibuat 2026-11-04 dari telaah kode di `main` (`bd82b7c6`).

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

Lane **C**: perubahan perilaku orkestrasi AI di backend, satu modul (`apps/api/src/lib/telefun-analysis.ts` + helper baru), tanpa perubahan skema/RLS/API publik. Muat `trainers-superapp-tdd` sebelum mengedit; review `thermo-nuclear` sebelum verifikasi akhir.

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
- `speakingSeconds`: jumlah `(endSec - startSec)` per segmen. WPM = `wordCount / (speakingSeconds / 60)`, dibulatkan ke integer. Bila `speakingSeconds` < 5, WPM = `null`-setara: gunakan perilaku yang sudah ada untuk audio sangat pendek (cek parser; jangan buat cabang baru tanpa alasan) dan catat di feedback.
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
- Kata pengisi: 0 → 9–10; 1–2 → 7–8; 3–5 → 4–6; > 6 → 0–3.

Clamp skor model ke pita yang cocok dengan angka terhitung, lalu hitung ulang `overallScore` dengan cara yang sama seperti normalisasi yang sudah ada (cek `applyHoldAssessmentToOverallScore` dan parser; jangan duplikasi rumus).

### 5. Abort dan klaim

Pertahankan semua pemeriksaan `signal?.aborted` dan klaim scoring yang ada. Tambahkan pemeriksaan `signal?.aborted` tepat sebelum **setiap** panggilan provider (transkripsi dan penilaian). Pemeriksaan ulang klaim (`scoring_claim_token_hash`) tetap sebelum panggilan provider pertama.

## Tasklist

- [ ] Muat `trainers-superapp-tdd`; drift-check plan ini terhadap `main` (field schema, nama fungsi, baris yang dirujuk).
- [ ] Context7: pastikan rekomendasi generation config Gemini 3 (temperature, `thinkingLevel`) dan format `responseSchema` untuk `@google/genai` versi terpasang.
- [ ] RED: perluas `apps/web/e2e/telefun-scoring-api.spec.ts` (backend lokal nyata, Gemini di-stub lewat guard `fetch` yang sudah ada). Stub membedakan dua request Gemini dari isi prompt. Kasus:
  - penilaian baru memanggil Gemini **dua kali** berurutan: transkripsi dulu, lalu penilaian yang prompt-nya memuat transkrip langkah 1;
  - `wordsPerMinute`, `fillerWords.count/examples`, dan `transcript` tersimpan sama dengan hasil hitung dari segmen stub, walau stub penilaian mengembalikan angka berbeda;
  - skor kecepatan/pengisi di luar pita di-clamp;
  - transkripsi gagal (JSON rusak) → penilaian gagal dengan pesan ramah, tidak ada `voice_assessment` tersimpan, tidak ada panggilan penilaian;
  - penilaian lama tersimpan (cache) tetap dibaca tanpa panggilan AI;
  - dua baris usage tercatat dengan action `voice_transcription` dan `voice_assessment`.
    Jalankan dan buktikan RED sebelum implementasi. Pakai `pnpm exec playwright test <spec> -g "<nama>"` dari `apps/web`, satu run Playwright saja.
- [ ] Implementasi Design §1–§5. Daftarkan `voice_transcription` di `ai-usage-categories.ts`.
- [ ] GREEN untuk spec di atas, lalu regresi serial: `telefun-scoring-queue-api.spec.ts`, `telefun-language-evidence-api.spec.ts`, `telefun-review-pdf.spec.ts`.
- [ ] Review `thermo-nuclear`.
- [ ] Perbarui `docs/telefun.md` bagian "Scoring runtime": dua panggilan, metrik terhitung, clamp pita, batas "gitu".
- [ ] Gate: `pnpm --dir apps/api exec tsc --noEmit -p tsconfig.json`, `pnpm exec turbo run lint --concurrency=1`, `pnpm exec turbo run build --concurrency=1`, Prettier untuk file yang disentuh, `git diff --check`, lalu satu kali `graphify update .`.
- [ ] Entri `CHANGELOG.md`, commit, push ke `main`. Tanpa deploy.
- [ ] Opsional, hanya dengan izin eksplisit Fajar (biaya API nyata): jalankan alur baru pada 3–5 rekaman agen lokal dan bandingkan transkrip lama vs baru secara manual. Catat hasilnya di bagian Evidence.

## STOP conditions

- Parser `voice_assessment` atau konsumen web/PDF ternyata membutuhkan field baru untuk alur ini → berhenti dan tanya Fajar; kontrak tidak boleh berubah diam-diam.
- Dokumentasi Gemini menyatakan timestamp segmen audio tidak tersedia/tidak andal untuk `gemini-3.8-flash` → berhenti dan laporkan; jangan ganti ke durasi panggilan (`duration_seconds` mencakup bicara konsumen sehingga WPM jadi salah).
- Perlu tes non-E2E untuk membuktikan regex kata pengisi → tanya Fajar dulu sesuai `AGENTS.md`.

## Evidence

_(diisi agent pelaksana)_

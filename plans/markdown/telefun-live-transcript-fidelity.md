# Telefun — kesetiaan transkrip dua arah Gemini Live

Status: implementasi selesai 2026-11-25 (RED → GREEN terverifikasi lokal). Lane **C** (perilaku server Telefun lintas file di `apps/telefun`; tanpa skema, auth/RLS, kontrak API publik, atau perubahan billing AI).

## Requirement

Fajar melaporkan bahwa transkrip telaah Telefun (`telefun_history.messages`) tidak sesuai dengan suara rekaman, berisi bocoran prompt, dan memuat bahasa asing selain Bahasa Indonesia (dan istilah Inggris). Langkah 1–3 dari diagnosis disetujui:

1. **Penggabungan potongan.** Gemini Live mengirim `inputTranscription`/`outputTranscription` sebagai potongan inkremental. `TranscriptCollector.append` memakai heuristik kumulatif (gaya OpenAI) yang membuang potongan yang kebetulan sama dengan awal teks yang sudah ada (`"baik bu"` + `" b"` + `"aik"` → `"baik buaik"`), dan membuang ucapan berulang (`"Halo?"` + `" Halo?"`). Potongan Gemini harus disambung apa adanya.
2. **Petunjuk bahasa.** Setup Gemini mengirim `inputAudioTranscription: {}` dan `outputAudioTranscription: {}` (deteksi bahasa otomatis). Keduanya harus membawa `languageCodes: ["id-ID", "en-US"]` dan `customVocabulary` istilah layanan (OJK, SLIK, pinjol, 157, …).
3. **Kebocoran prompt.** Transkrip yang disimpan tidak boleh memuat marker `[TELEFUN_CONTROL:*]`, arahan panggung (`*menghela napas*`, `(terisak)`, `[menangis]`), atau tag non-ucapan ASR (`<noise>`). Setiap pembersihan dicatat sebagai diagnostik server (jenis dan jumlah, tanpa isi transkrip) supaya frekuensinya terukur.

Kriteria penerimaan (E2E):

- Server Telefun lokal yang sungguhan, dengan Gemini palsu di belakang proxy egress, mengirim setup yang memuat `languageCodes` dan `customVocabulary` di kedua konfigurasi transkripsi.
- Potongan inkremental Gemini tersimpan utuh di `messages` (tanpa kata hilang atau tergabung salah, ucapan berulang tetap ada).
- Marker kontrol, arahan panggung, dan `<noise>` tidak tersimpan; teks ucapan di sekitarnya tetap ada.

Di luar cakupan: transkripsi ulang pasca-panggilan dari rekaman (langkah 4), `speechConfig.languageCode` (dokumentasi Live API: model audio native tidak mendukungnya), prompt konsumen, UI telaah, data historis, jalur OpenAI WebRTC yang sudah pensiun.

## Design

- `apps/telefun/src/transcript.ts`: metode baru `appendDelta()` yang hanya menyambung potongan. `append()` lama (heuristik kumulatif) tetap untuk pengamat OpenAI historis, yang mengirim delta lalu teks final. Server menyambungkan callback Gemini ke `appendDelta`.
- Modul murni baru `apps/telefun/src/transcript-sanitizer.ts`: `sanitizeTranscriptText(text)` → `{ text, removed: { controlMarker, stageDirection, noiseTag } }`. Diterapkan saat giliran di-commit (teks utuh, bukan per potongan, karena arahan panggung bisa terbelah di antara potongan). `TranscriptCollector` menerima callback opsional `onSanitized(speaker, removed)`; server mencatatnya dengan `console.warn` tanpa isi teks.
- `apps/telefun/src/providers/GeminiLiveAdapter.ts`: konstanta `TELEFUN_TRANSCRIPTION_CONFIG` dipakai di `inputAudioTranscription` dan `outputAudioTranscription`.
- Bukti penerimaan field di Gemini sungguhan (2026-11-25, setup + satu giliran teks, tanpa audio): `gemini-3.8-live` dan `gemini-3.1-flash-live-preview` menerima `languageCodes` + `customVocabulary` (setup selesai, audio dan transkrip kembali). `gemini-3.0-flash-live-preview` ditolak `1008 not found` dengan atau tanpa field ini (masalah registry lama, dilaporkan terpisah).

## Tasklist

- [x] RED: `apps/web/e2e/telefun-live-transcript-fidelity-api.spec.ts` + project `telefun-live-transcript-fidelity-stub` di `playwright.api.config.ts`; jalankan dan pastikan gagal karena tiga alasan di atas.
- [x] GREEN: `appendDelta`, sanitizer + diagnostik, konfigurasi transkripsi.
- [x] REFACTOR sambil hijau; `thermo-nuclear`.
- [x] Gate: E2E terfokus, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `git diff --check`.
- [x] Dokumentasi `docs/telefun.md` (perilaku transkrip), `CHANGELOG.md`, commit + push ke `main`.

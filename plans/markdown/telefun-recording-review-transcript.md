# Telefun — teks agen di Telaah dari rekaman + "ee" dihitung filler

Status: selesai 2026-11-25. Lane **D** (kontrak `voice_assessment` di `packages/types`, dipakai API scoring, web Telefun, dan monitoring; tanpa migrasi, auth/RLS, atau status baru).

## Requirement

Fajar (2026-11-25, "oke opsi A"), setelah pemeriksaan 4 sesi produksi pasca-`950c31dd`:

1. Sisi agen di transkrip Telaah, dan transkrip yang dikirim ke telaah isi (content review), memakai transkripsi rekaman agen setelah panggilan, bukan Gemini Live. Live salah dengar istilah kunci (OJK→Gojek/JK, IASC→YSC/IASJ, nama konsumen) dan membuang filler; rekaman benar di semua sesi. Sisi konsumen tetap dari Live (rekaman agen tidak memuat suara konsumen).
2. Sesi lama tetap konsisten: kutipan dan nomor baris telaah isinya merujuk transkrip Live, jadi sesi tanpa transkrip gabungan tetap menampilkan Live.
3. "ee" tunggal dihitung filler di skor Filler Words. Pola sekarang (`e{3,}`) melewatkan "ee", yang sering ditulis model transkripsi, sehingga Filler Words terlalu tinggi.

Kriteria penerimaan (E2E `telefun-scoring-api.spec.ts`, backend nyata lokal, provider di-stub):

- Sesi dengan teks agen Live yang salah dengar dan segmen rekaman yang benar: baris bernomor di prompt penilaian memakai teks rekaman, giliran konsumen tetap; `voice_assessment.reviewTranscript` berisi giliran gabungan dengan `startMs` Live.
- Rekaman yang tidak cocok dengan Live (rasio kata cocok < 0,6): prompt memakai Live, `reviewTranscript: null`.
- "Ee" dan "ee" berdiri sendiri masuk `fillerWords.count` dan contoh.
- Riwayat Telefun (web) menampilkan `reviewTranscript` bila ada, Live bila tidak.

Di luar cakupan: mengubah sesi lama, menjalankan ulang scoring, mengubah transkrip konsumen, menyimpan segmen rekaman mentah.

## Design

- **Penggabungan** (`apps/api/src/lib/telefun-review-transcript.ts`): kata agen Live disejajarkan dengan kata rekaman (LCS), karena kedua transkrip tidak punya jam bersama (Live mulai dari collector server, rekaman agen dari pickup di browser). Tepi tiap giliran agen diambil dari deret ≥2 kata cocok berurutan (kata umum tunggal seperti "baik" bisa cocok di giliran tetangga); giliran satu kata memakai kecocokan tunggalnya. Potongan antar giliran memilih awal segmen atau akhir kalimat terdekat. Giliran agen tanpa kata cocok (teks salah bahasa atau di luar mic) dibuang; katanya masuk ke giliran sebelumnya. Hasil berupa union `merged | unmatched | too_long`; selain `merged`, Live dipakai (satu fallback terbatas yang eksplisit). Divalidasi offline pada 7 sesi produksi pra-perbaikan: semua `merged`, giliran salah bahasa 0796ed9b terganti teks yang benar.
- **Penyimpanan**: `voiceQualityAssessmentInputSchema.reviewTranscript` (`TelefunTranscriptEntry[] | null`, opsional; bentuk rusak = tidak ada). Ditulis dalam write yang sama dengan penilaian, jadi siap tepat saat scoring selesai. Tanpa kolom baru, tanpa migrasi, tanpa state machine baru. `undefined` = sesi lama, `null` = penggabungan gagal.
- **Scoring** (`telefun-analysis.ts`): `transcribeTelefunAgentAudio` juga mengembalikan segmen; transkrip gabungan menggantikan Live untuk `canReviewTelefunContent`, `buildTelefunContentReviewPrompt`, dan `normalizeTelefunContentReview`, supaya nomor baris dan kutipan cocok dengan yang ditampilkan. Prompt coaching tidak menerima `reviewTranscript` (duplikat teks, bukan data penilaian).
- **Tampilan**: helper bersama `resolveTelefunReviewTranscript(messages, voiceAssessment)` di `packages/types` mengembalikan `reviewTranscript` bila valid dan tidak kosong, selain itu `parseTelefunTranscript(messages)`. Dipakai `mapTelefunSessionRow` (web) dan `monitoring-review-service.ts`. `monitoring-history-service.ts` tidak diubah: transkrip di sana hanya fallback lama yang tidak tampil saat review tersedia. Web memperbarui `record.transcript` dari `assessment.reviewTranscript` tepat setelah scoring/analisis ulang (`scoredTelefunTranscript`), supaya Telaah tidak menampilkan Live dengan kutipan dari transkrip gabungan.
- **Filler**: `e{3,}` → `e{2,}` di `TELEFUN_FILLER_PATTERNS`; tool WER membaca pola dari sumber, jadi ikut otomatis.

## Tasklist

- [x] RED: tiga test baru di `apps/web/e2e/telefun-scoring-api.spec.ts`; jalankan dan pastikan gagal karena perilaku belum ada.
- [x] GREEN: field skema + helper, segmen dari transkripsi, penggabungan di scoring, pola filler, konsumen web/monitoring, prompt coaching.
- [x] Dokumentasi `docs/telefun.md` (sumber transkrip Telaah).
- [x] `thermo-nuclear`, gate (E2E terfokus, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `git diff --check`), `graphify update .`, CHANGELOG, commit + push.

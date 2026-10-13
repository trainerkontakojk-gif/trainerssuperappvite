# PDKT: tandai kalimat bermasalah di balasan agent

Lane: **D** (kontrak output penilaian AI di `packages/types`, prompt penilaian, UI Telaah).

## Requirement

Di tahap Telaah, peserta perlu melihat **kalimat mana** di balasannya yang bermasalah, dihubungkan ke
catatan bernomor (mockup "4. Tahap Telaah", komentar Fajar 13 Okt 2026). Kondisi live: penilaian hanya
mengirim daftar teks (`typos`, `clarityIssues`, `contentGaps`) tanpa posisi di balasan.

Acceptance:

- A1. Prompt penilaian meminta `annotations`: maksimal 8 temuan `{ quote, dimension, note }`, dengan
  `quote` kutipan persis dan pendek dari balasan agent.
- A2. Backend menormalkan `annotations`: membuang item yang tidak valid (dimensi tidak dikenal, teks
  kosong/terlalu panjang), menyanitasi `note`, lalu mencari `quote` di balasan agent. Bila ketemu (persis,
  atau dengan perbedaan spasi saja) backend menyimpan `start`/`end`; bila tidak ketemu atau bertumpuk
  dengan tanda sebelumnya, `start`/`end` = `null`. Annotation yang tidak valid tidak menggagalkan
  penilaian.
- A3. Hasil tersimpan di `pdkt_history.evaluation.annotations` (JSONB, tanpa migration); `note` ikut
  redaksi kunci jawaban seperti teks penilaian lain.
- A4. Panel Telaah web menampilkan balasan agent dengan tanda bernomor pada rentang yang ketemu, lalu
  daftar catatan bernomor. Catatan tanpa posisi tetap tampil di daftar tanpa tanda. Riwayat lama tanpa
  `annotations` tidak menampilkan kartu ini.

## Design

1. **Types**: `pdktReplyAnnotationSchema` (output AI) dan tipe `PdktReplyAnnotation` (`quote`,
   `dimension`, `note`, `start: number | null`, `end: number | null`);
   `PdktEvaluationResult.annotations?`.
2. **API** `evaluation-service.ts`: instruksi + format JSON di prompt; `readReplyAnnotations(raw,
agentReplyBody)` di normalizer; ikut `userFacingAssessment` (redaksi) dan `processPdktEvaluation`
   (simpan). Pencarian posisi dipisah ke `reply-annotations.ts` (fungsi murni).
3. **Web**: komponen `PdktReplyAnnotationsCard` dipakai `EmailDetailPane` setelah rincian skor.
4. **Docs**: `docs/modules.md` (Evaluasi Edukatif).

## Tes

- E2E hermetic `apps/web/e2e/pdkt-flow.spec.ts`: riwayat dengan satu annotation yang ketemu dan satu
  yang tidak; cek tanda bernomor pada kalimat dan dua catatan di daftar (A4).
- Pengecualian non-E2E disetujui Fajar (13 Okt 2026, "Boleh, unit test kecil"): normalisasi output AI
  tidak bisa dibuktikan E2E tanpa AI sungguhan. Mode gagal yang dicakup:
  1. kutipan persis → `start`/`end` tepat;
  2. kutipan dengan spasi/baris baru berbeda → tetap ketemu pada teks asli;
  3. kutipan tidak ada di balasan → `start`/`end` null, catatan tetap ada;
  4. kutipan bertumpuk dengan tanda sebelumnya → yang belakangan null;
  5. dimensi tidak dikenal / note kosong / item ke-9 dst. → dibuang, penilaian tetap sukses;
  6. note yang memuat kunci jawaban diredaksi; prompt memuat instruksi annotations.

## Tasklist

- [x] RED E2E hermetic + unit test; jalankan, pastikan gagal.
- [x] GREEN types, API, web.
- [x] Jalankan ulang spec, typecheck, lint, build.
- [x] Review `thermo-nuclear`, docs, `git diff --check`.

## Evidence (13 Okt 2026)

- RED: E2E "panel telaah menandai kalimat…" gagal (region "Catatan di balasan Anda" tidak ada);
  `pdkt-reply-annotations.test.ts` gagal (modul `reply-annotations` belum ada).
- GREEN: unit test 8/8 (env dummy, AI tiruan); `pdkt-flow.spec.ts` 12/12; typecheck api/web/types, lint,
  build lulus.
- Review: UI hanya menandai bila `body.slice(start, end)` sama dengan `quote` (spasi diringkas), supaya
  data lama atau body berbeda tidak memberi tanda salah tempat.
- Lanjutan (permintaan Fajar): panel review trainer di Monitoring menampilkan kartu yang sama ("Catatan di
  balasan agent"). Temuan saat RED: `normalizePdktEvaluation` memakai skema output AI yang strict, sehingga
  penilaian tersimpan yang memuat `annotations` terbaca `null` (Monitoring kehilangan seluruh penilaian).
  Diperbaiki dengan memvalidasi `annotations` terpisah (`pdktStoredReplyAnnotationsSchema`). Unit test 2
  kasus tambahan (RED → GREEN), E2E `monitoring.spec.ts` "detail review PDKT menandai kalimat…" (RED →
  GREEN).
- Kegagalan lama di luar cakupan: `monitoring.spec.ts` "sesi kedaluwarsa…" mencari judul "Lima modul. Satu
  pengalaman." yang sudah tidak ada di `apps/web/src`; dicatat sebagai tugas terpisah.

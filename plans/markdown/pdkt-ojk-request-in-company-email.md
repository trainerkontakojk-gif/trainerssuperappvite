# PDKT: arah balasan "tembusan, tapi minta bantuan OJK"

Lane: **D** (kontrak API/skema bersama `packages/types`, instruksi AI pembuatan email dan penilaian).

## Requirement

Ada tiga jenis email konsumen dalam simulasi PDKT (penjelasan Fajar, 13 Okt 2026):

| Arah                                 | Kepada / Tembusan                                                               | Jawaban yang benar                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Hanya tembusan                       | Perusahaan terlapor / OJK                                                       | Ucapan terima kasih dan arahan normatif                               |
| **Tembusan, tapi minta bantuan OJK** | Perusahaan terlapor / OJK, dan di tengah isi email konsumen meminta bantuan OJK | Ditanggapi sebagai pengaduan ke OJK, sesuai kasus dan standar jawaban |
| Langsung ke OJK                      | OJK / tidak ada                                                                 | Sesuai kasus dan standar jawaban                                      |

Jenis kedua adalah "jebakan" yang dinilai QA pada aspek Arah Penerima. Agent harus menyadarinya dari isi
email; tidak ada petunjuk di layar simulasi.

Kondisi live sebelum perubahan (diverifikasi di kode):

- `resolvePdktRecipientContext` menentukan `replyIntent` hanya dari `primaryRecipientType` (header).
- Prompt penilaian menyatakan penyebutan OJK boleh saat OJK hanya CC dan "jangan menebak intent dari body".
  Akibatnya email jenis kedua dinilai seperti tembusan biasa: jawaban substantif ke OJK dapat dihukum.
- Prompt pembuatan email untuk perusahaan tidak pernah menyelipkan permintaan bantuan ke OJK.

Acceptance:

- A1. Skenario dapat menyimpan arah jenis kedua: `primaryRecipientType: "reported_company"` +
  `ojkRequestInBody: true`. Pengaturan web menampilkan pilihan tiga arah dan payload simpan memuat field itu.
- A2. Sesi/email dari skenario itu memakai `recipientContext.replyIntent =
"reply_to_ojk_request_in_company_email"`; header tetap Kepada perusahaan, Tembusan OJK.
- A3. Instruksi pembuatan email meminta permintaan bantuan ke OJK yang eksplisit di paragraf tengah (bukan
  salam pembuka/penutup). Email AI tanpa permintaan itu ditolak validator dan dibuat ulang (retry yang sudah ada).
- A4. Instruksi penilaian memakai `replyIntent` sebagai patokan: untuk jenis kedua lawan bicara utama
  adalah OJK, jawaban hanya normatif/terima kasih dinilai salah arah. Petunjuk konflik deterministik
  menandai pembuka/penutup yang bergeser ke perusahaan.
- A5. `ojkRequestInBody` tidak ikut di proyeksi skenario untuk tampilan simulasi (sama seperti
  `expectedAnswer`).
- A6. Skenario dan sesi lama (tanpa field) berperilaku sama seperti sebelumnya.

## Design

1. **Types** (`packages/types/src/pdkt.ts`): `pdktReplyIntentSchema` (3 nilai) dipakai oleh
   `pdktPromptRecipientContextSchema`, `pdktSessionConfigSchema`, dan tipe `PdktReplyIntent`.
   `pdktScenarioSchema.ojkRequestInBody?: boolean`.
2. **API recipient** (`services/pdkt/recipient-targets.ts`): `resolvePdktRecipientContext` menerima
   `ojkRequestInBody`; nilai itu hanya berlaku bila primary efektif `reported_company`.
   `session-service.ts` meneruskan field skenario di kedua titik pembuatan context.
3. **Pembuatan email** (`services/pdkt-email-policy.ts`): `getRecipientDirectionInstruction` menambah
   instruksi permintaan bantuan OJK di paragraf tengah untuk intent baru; validator menambah pelanggaran
   bila tidak ada paragraf tengah yang memuat permintaan ke OJK. Template "tulis sendiri" tidak divalidasi
   ulang (isinya tanggung jawab trainer).
4. **Penilaian** (`evaluation-service.ts`, `evaluation-context.ts`): aturan arah memakai `replyIntent`;
   pihak yang diharapkan = perusahaan hanya untuk `reply_to_company_with_ojk_cc`, selain itu OJK.
5. **Proyeksi** (`scenario-projections.ts`): buang `ojkRequestInBody` bersama `expectedAnswer`.
6. **Web** (`ScenarioRecipientsField.tsx`, `pdktDraftNormalizers.ts`): select "Lawan Bicara Utama"
   diganti radio "Arah balasan" tiga pilihan; normalizer hanya menyimpan `ojkRequestInBody: true` untuk
   perusahaan.
7. **Docs**: `docs/modules.md` (kontrak arah balasan).

## Tes

- E2E hermetic `apps/web/e2e/pdkt-flow.spec.ts`: pilih arah jenis kedua di editor skenario, simpan, cek
  payload `PUT` settings (A1).
- Pengecualian non-E2E disetujui Fajar (13 Okt 2026, pilihan "Unit test kecil"): kontrak prompt AI tidak
  bisa dibuktikan E2E karena klien AI memakai endpoint tetap tanpa stub. Mode gagal yang dicakup:
  1. context: perusahaan + flag → intent baru, header tidak berubah;
  2. context: OJK + flag → `reply_to_ojk` (flag diabaikan); perusahaan tanpa alamat + flag → OJK;
  3. instruksi pembuatan email intent baru memuat permintaan OJK di paragraf tengah dan tetap
     menjaga salam perusahaan;
  4. validator: intent baru tanpa permintaan OJK di tengah → pelanggaran; dengan permintaan → lolos;
     permintaan di pembuka tetap pelanggaran pembuka;
  5. prompt penilaian intent baru memuat aturan bahwa OJK lawan bicara utama dan jawaban normatif saja
     salah arah;
  6. petunjuk konflik intent baru menandai pergeseran ke perusahaan, bukan ke OJK;
  7. proyeksi simulasi membuang `ojkRequestInBody`;
  8. (ditambah saat review) tip deterministik saat arah salah mengikuti `replyIntent`: untuk intent OJK tip
     tidak lagi menyuruh menyapa perusahaan; deteksi permintaan tidak tertipu alamat `konsumen@ojk.go.id`.

## Tasklist

- [x] RED E2E hermetic pengaturan + unit test kontrak prompt; jalankan, pastikan gagal.
- [x] GREEN types, API, web.
- [x] Jalankan ulang spec, typecheck api/web/types, lint, build.
- [x] Review `thermo-nuclear`, docs, `git diff --check`.

## Evidence (13 Okt 2026)

- RED: `pdkt-flow.spec.ts` "editor skenario menyimpan arah balasan…" gagal (radiogroup "Arah balasan" tidak
  ada); `pdkt-ojk-request-in-company-email.test.ts` 7 gagal / 1 lulus (kasus flag diabaikan untuk OJK sudah
  benar sebelumnya).
- GREEN: unit test 9/9 lulus (env dummy, tanpa AI); `pdkt-flow.spec.ts` 11/11 lulus;
  `pdkt-privacy-real-backend` 3/3 lulus.
- Temuan review: tip deterministik `buildConflictRecipientTip` sebelumnya selalu menyuruh menyapa
  perusahaan, juga untuk mode `reply_to_ojk`; sekarang mengikuti pihak yang diharapkan.
- Unit suite lama (`pdkt-evaluation-prompt`, `pdkt-email-policy`, dll.) tidak dijalankan sesuai aturan
  legacy inventory; perilaku default untuk intent lama tidak berubah.

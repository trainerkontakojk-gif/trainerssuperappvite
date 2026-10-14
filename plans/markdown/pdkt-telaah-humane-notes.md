# PDKT Telaah — poin konsumen kosong, langkah perbaikan tertaut, catatan yang manusiawi

Lanjutan dari [`pdkt-telaah-consumer-points.md`](pdkt-telaah-consumer-points.md). Lane C: perilaku backend evaluasi, prompt, dan UI Telaah. Tanpa perubahan skema database, RLS, atau kontrak route.

## Requirement

Temuan Fajar setelah rilis (2026-10-14), dan hasil auditnya:

1. **Email konsumen tidak ditandai pada telaah ulang.** Respons API berisi `consumerPoints: []`.
   - `consumerPoints` tidak wajib. Kalau AI tidak mengirimnya, telaah tetap tersimpan sukses tanpa coba ulang dan tanpa pemberitahuan.
   - Poin berstatus partial/unanswered tanpa `reason`, atau dengan kutipan lebih dari 300 karakter, dibuang tanpa jejak.
   - Telaah yang sudah punya `annotations` tidak bisa ditelaah ulang, sehingga semua telaah sebelum fitur ini tidak pernah mendapat poin konsumen.
2. **"Perbaiki ini dulu" tidak menunjuk kalimat.** `actionItems` tidak menyimpan kutipan, jadi agent harus menggulir ke bawah untuk mencari kalimat yang dimaksud.
3. **Catatan berupa komentar, bukan perbaikan.**
   - Aturan kalimat penghubung meminta `note` hanya "menjelaskan masalah sambungannya".
   - `example` opsional dan isinya dibatasi pada frasa pengantar.
4. **Istilah teknis bocor dan nada tidak manusiawi.**
   - Prompt memakai nama field mentah (`replyIntent`, `recipientContext`, …) tanpa larangan menuliskannya ke teks untuk agent.
   - Feedback buatan backend berisi "deterministic recipient conflict cap … metadata".

### Acceptance criteria

1. Jawaban AI dengan `consumerPoints` kosong atau tidak berbentuk array dicoba ulang (maksimal 3 panggilan).
   - Kalau semua percobaan kosong, telaah disimpan dengan `consumerPoints: []` dan peringatan di log.
   - UI menampilkan region "Telaah tanpa poin konsumen" dengan tombol "Telaah ulang".
2. Poin dengan `reason` kosong tetap disimpan dengan `reason: null`. Kutipan yang terlalu panjang dipotong ke 300 karakter dan disimpan tanpa tanda.
3. Telaah selesai yang tidak punya `annotations` atau tidak punya poin konsumen bisa ditelaah ulang. Klaim hanya berlaku bila `evaluation_completed_at` belum berubah sejak dibaca.
4. `actionItems[].quote` disimpan hanya bila kutipannya ada di balasan.
   - UI menampilkan "Di balasan Anda: “…”".
   - Bila kalimatnya bertanda, ada tautan "Lihat kalimat ini di balasan" yang memfokuskan tandanya.
5. Prompt mewajibkan:
   - `note` berupa perbaikan yang diawali kata kerja;
   - `example` berupa kalimat siap pakai;
   - minimal 1 poin konsumen;
   - aturan bahasa: sapaan "Anda", tanpa nama field, tanpa menyebut referensi atau standar jawaban.
6. Backend mengganti istilah teknis yang dikenal dengan bahasa sehari-hari di semua teks untuk agent. Kutipan dan enum tidak diubah.
7. Catatan sistem pembatasan skor ditulis dalam bahasa Indonesia biasa.

## Design

- `reply-annotations.ts`:
  - validasi poin dilonggarkan untuk `reason` kosong dan kutipan panjang;
  - `locateQuote` diekspor untuk memverifikasi kutipan langkah perbaikan.
- `humane-text.ts` (baru):
  - daftar istilah → padanan bahasa sehari-hari;
  - istilah dalam kurung atau backtick dihapus;
  - `humanizePdktValue` berjalan rekursif dan melewati kunci `quote`, `replyQuote`, `category`, `dimension`, `status`, `kind`.
- `evaluation-service.ts`:
  - hasil tanpa poin konsumen disimpan sebagai cadangan dan dilempar sebagai respons tidak valid agar dicoba ulang;
  - setelah loop selesai, cadangan dikembalikan bersama `console.warn`;
  - `humanizePdktValue` membungkus hasil redaksi;
  - `buildPdktEdu` menerima `agentReplyBody`;
  - `isCompleteReview` menggantikan `hasStoredReplyMarks`.
- `@trainers/types`: `PdktActionItemAI.quote?` dan skema zod-nya.
- Web:
  - `numberReplyNotes` dan `noteNumberForQuote` di `pdkt-reply-marks.tsx`;
  - id balasan dibagi lewat `replyIdBase`;
  - `ActionQuote` di ringkasan skor;
  - `IncompleteReviewNotice` menggantikan `MarksMissingNotice` dan punya dua varian.

## Tasklist

- [x] RED unit (izin Fajar 2026-10-14, file `apps/api/src/__tests__/pdkt-reply-annotations.test.ts`). Tujuh kasus gagal karena alasan yang dituju:
  - poin tidak dibuang diam-diam;
  - coba ulang saat poin kosong;
  - cadangan sesudah 3 percobaan;
  - penggantian istilah teknis;
  - catatan sistem dalam bahasa Indonesia;
  - kutipan langkah perbaikan;
  - aturan prompt.
- [x] RED E2E di `apps/web/e2e/pdkt-flow.spec.ts`:
  - tautan langkah perbaikan pada test "tahap Telaah: skor, rincian…";
  - region "Telaah tanpa poin konsumen" beserta request `retry-eval` pada test "telaah tanpa consumerPoints…".
- [x] GREEN backend, types, prompt, dan UI.
- [x] Typecheck `packages/types`, `apps/api`, `apps/web` (+ e2e); ESLint file berubah; `git diff --check`.
- [x] Satu run penuh `pdkt-flow.spec.ts`.
- [x] Review thermo-nuclear inline dan cek visual ringkasan skor (screenshot desktop, tema terang).

## Hasil (2026-10-14)

| Gate             | Perintah                                                                                                                          | Hasil                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Unit (disetujui) | `npx vitest run src/__tests__/pdkt-reply-annotations.test.ts` (apps/api, env dummy lokal)                                         | 24 passed (RED awal: 7 failed)                    |
| E2E fokus        | `npx playwright test e2e/pdkt-flow.spec.ts --grep "tahap Telaah: skor, rincian\|tanpa consumerPoints\|telaah lama tanpa penanda"` | 3 passed (RED awal: 2 failed pada assertion baru) |
| E2E penuh        | `npx playwright test e2e/pdkt-flow.spec.ts`                                                                                       | 65 passed (4.4m)                                  |
| Typecheck        | `tsc --noEmit` di types, api, web, web e2e                                                                                        | lulus                                             |
| Lint / diff      | ESLint file berubah; `git diff --check`                                                                                           | bersih                                            |

Hunk format-only dari Prettier pada `evaluation-service.ts` dan `packages/types/src/pdkt.ts` dikembalikan, karena kedua file itu memang belum Prettier-clean di `main`.

### Belum terbukti

- **Klaim telaah ulang** berbasis `evaluation_completed_at` (`processPdktEvaluation`) tidak punya test otomatis. E2E memakai API tiruan, dan unit test untuk rantai Supabase belum diizinkan.
- **Mutu tulisan AI sungguhan** setelah aturan prompt baru: perlu uji manual setelah deploy.
- **Suite unit lama** (`pdkt-evaluation-prompt`, `pdkt-evaluate-edukatif`, `pdkt-evaluate-route`) tidak dijalankan. Mock AI di sana tanpa `consumerPoints` sekarang memicu coba ulang, jadi assertion jumlah panggilan bisa berubah. Suite ini tidak dijalankan CI.

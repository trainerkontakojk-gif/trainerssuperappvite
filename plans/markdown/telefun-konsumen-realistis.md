# Telefun — konsumen AI yang lebih realistis (Lane C)

## Requirement

Sumber: audit prompt konsumen Telefun (2026-10-17) dan keputusan Fajar di thread proyek.

- Konsumen terasa seperti manusia, bukan asisten yang membantu atau memberi petunjuk ketika agen salah.
- Kepribadian mengikuti tipe yang dipilih; tipe Marah benar-benar sulit ditangani.
- Hold: konsumen pada akhirnya selalu menerima hold supaya durasi panggilan (maks 15 menit) tetap terkendali. Hanya nada yang berbeda per tipe. Untuk hold ke-2 dan seterusnya, tipe Marah, Terburu-buru, dan Kritis boleh menolak satu kali dengan satu kalimat, lalu menerima.
- Sinyal hold: saat hold selesai, aplikasi memberi tahu AI urutan hold dan apakah lamanya melewati batas wajar, supaya konsumen bisa bereaksi sesuai tipe.

## Design

- `apps/web/src/routes/telefun/services/promptBuilder.ts`
  - Aturan prosedural per tipe (`getProceduralInstruction`), tanpa contoh kalimat sopan untuk semua tipe.
  - Aturan kelanjutan: konsumen tidak lagi menyodorkan cerita atau "langkah berikutnya" saat agen pasif; ia menagih agen.
  - Blok baru `POSISI KONSUMEN`: konsumen tidak tahu jawaban yang benar, tidak mengoreksi agen dan tidak memberi petunjuk.
  - Tipe Marah: satu batas tegas (tanpa makian kasar, SARA, ancaman fisik), perilaku marah realistis, empati template membuat makin kesal.
  - Menyela per tipe (`getInterruptionInstruction`): Marah dan Terburu-buru boleh menyela tanpa tantangan Interupsi.
  - Etika sopan hanya untuk tipe yang cocok; contoh gaya bicara per tipe; hapus "benih konsistensi".
  - Penutupan: fase penutup tidak dipaksa sopan untuk tipe Marah.
  - `getHoldEndInstruction(consumerType, interval)`: marker `[TELEFUN_CONTROL:HOLD_END]` berisi urutan hold dan "masih wajar"/"lama" berdasarkan batas hold yang sudah ada (`TELEFUN_FIRST_HOLD_LIMIT_MS` 60 dtk, `TELEFUN_SUBSEQUENT_HOLD_LIMIT_MS` 180 dtk).
- `apps/web/src/routes/telefun/services/liveSession.ts`: `setHold(false)` mengirim marker HOLD_END lewat `realtimeInput.text` (jalur yang sama dengan TIME_CUE) dan mencatat event `hold_end_cue_sent`.
- `apps/web/src/routes/telefun/services/simulationChallenges.ts`: "Salah Paham" tidak langsung menerima klarifikasi.
- `apps/web/src/routes/telefun/telefunSettings.ts` tidak diubah: deskripsi tipe yang tersimpan di setelan trainer tetap dipakai, dan perilaku baru dibawa oleh prompt.
- Tidak ada perubahan server, skema, atau kontrak API. Prompt masih dirakit di browser (temuan keamanan audit), dipindah ke backend di pekerjaan terpisah. Panjang prompt tetap di bawah `TELEFUN_MAX_INSTRUCTIONS_LENGTH`.

## Tasklist

- [x] RED: E2E `apps/web/e2e/telefun-consumer-prompt.spec.ts` membaca instruksi di pesan konfigurasi dan pesan sinyal hold dari server suara tiruan.
- [x] GREEN: ubah file di atas.
- [x] Hapus kasus unit lama yang menguji teks yang sengaja diganti (digantikan E2E).
- [x] Typecheck web, lint, E2E fokus, `git diff --check`.

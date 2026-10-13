# PDKT: tahap Pahami, Tanggapi, dan Telaah sesuai mockup

Lane: **D** (redesain UI yang signifikan pada ruang kerja simulasi). Tidak ada perubahan API, skema, izin,
atau bentuk data evaluasi.

Sumber desain: canvas "Redesign PDKT", artboard `2. Tahap Pahami — baca email`, `3. Tahap Tanggapi — tulis
balasan`, `4. Tahap Telaah — hasil penilaian`, dan `5. Telaah di HP`. Fajar meminta 13 Okt 2026 ("kerjakan
tampilan tahap Pahami, Tanggapi, dan Telaah"). Mockup memakai hex tetap; implementasi memakai token
`docs/design.md` supaya tema gelap tetap benar.

## Requirement

Tahap ditentukan dari email yang dipilih:

- email `open`, editor tertutup → **Pahami** (kotak masuk + panel baca);
- email `open`, editor terbuka → **Tanggapi** (layar fokus tanpa daftar email);
- email `replied` → **Telaah** (layar fokus tanpa daftar email).

Pahami:

- P1. Kotak masuk berisi:
  - judul "Kotak masuk";
  - tombol **Baru** dan menu **Menu lainnya** (Riwayat, Pengaturan, Pilih beberapa);
  - pencarian "Cari pengirim atau subjek";
  - filter **Semua**, **Belum dibalas · N**, **Dibalas**.
- P2. Baris email memuat pengirim, waktu, subjek, dan status:
  - "Belum dibalas";
  - "Sedang dinilai AI…";
  - "Penilaian gagal";
  - "Dibalas" + "Skor N".
- P3. Navigasi "Tahap latihan" menandai tahap aktif (`aria-current="step"`). Telaah belum bisa dibuka, dengan
  keterangan "Telaah terbuka setelah balasan dikirim".
- P4. Panel baca memuat:
  - subjek, pengirim (nama, email, inisial), dan tanggal;
  - isi email rata kiri dengan lebar baca terbatas;
  - "Lampiran (N)" yang bisa diperbesar.
- P5. Data peserta (target dan pelaksana, plus batch/tim untuk peserta resmi) pindah ke header ruang kerja.
- P6. Bilah bawah berisi **Hapus** (dinonaktifkan bila tidak berizin) dan **Tulis balasan**.

Tanggapi:

- T1. Header memuat:
  - **Kotak masuk** (kembali ke Pahami, draf tetap tersimpan);
  - navigasi tahap, di mana Pahami ditandai selesai dan bisa diklik.
- T2. Dua kolom: "Email konsumen" (tanggal, subjek, pengirim, isi, lampiran) dan "Tulis balasan" (Kepada,
  Subjek, isian berlabel "Balasan Anda").
- T3. Bilah bawah editor menampilkan "Draf tersimpan otomatis · N kata · N karakter" dan **Kirim balasan**.
- T4. Kirim membuka konfirmasi "Kirim balasan sekarang?" dengan **Periksa lagi** dan **Kirim dan nilai**.
  Setelah terkirim, layar pindah ke Telaah untuk email itu.

Telaah:

- R1. Header memuat **Kotak masuk**, navigasi tahap (Pahami dan Tanggapi selesai), dan data peserta.
  "Kotak masuk" tidak langsung membuka ulang email yang sama.
- R2. Judul "Balasan untuk {pengirim}" + subjek.
- R3. Keadaan penilaian:
  - menunggu/diproses: "Sedang dinilai AI…" (`role="status"`), diperbarui otomatis;
  - gagal: pesan galat dan **Coba lagi**;
  - belum dimulai: keterangan singkat.
- R4. **Ringkasan skor** memuat:
  - skor total "/ 100" dengan predikat;
  - **Perbaiki ini dulu**, yaitu action item prioritas 1 beserta contohnya dan "Berdampak ke: {aspek}";
  - langkah berikutnya (action item lain);
  - kesesuaian dengan kunci jawaban (tanpa membocorkan kunci);
  - lama pengerjaan.
- R5. **Rincian skor**: lima aspek dengan nama, keterangan singkat, nilai, dan bar. Aspek di bawah 75 diberi
  "Perlu perbaikan" dan tips aspeknya.
- R6. **Balasan Anda** menandai kalimat yang dikomentari AI dengan nomor. **Yang perlu diperbaiki** mendaftar
  catatan bernomor yang sama; catatan tanpa posisi diberi keterangan "Tidak ditandai di balasan".
- R7. **Temuan lain**: typo, kejelasan, dan isi yang kurang, bila ada. **Catatan AI** menampilkan masukan umum.
- R8. "Lihat contoh balasan yang lebih baik" (tertutup secara bawaan) berisi contoh balasan dan tombol Salin.
  "Lihat email konsumen" (tertutup) berisi email asli.
- R9. Tombol bawah:
  - **Kembali ke kotak masuk**;
  - **Latihan lagi dengan skenario serupa**, yang langsung membuat email baru dari skenario yang sama bila
    skenario itu masih ada (bila tidak, tombolnya menjadi **Buat email baru**);
  - **Hapus** untuk email yang boleh dihapus.

Keputusan:

- Di HP, bagian Telaah ditumpuk berurutan (skor → rincian → balasan → masukan), bukan tab seperti artboard 5.
  Dengan begitu tidak ada konten yang tersembunyi di balik tab, dan satu struktur dipakai untuk semua ukuran.
- "Yang sudah baik" di mockup tidak punya data di hasil evaluasi, jadi diganti **Catatan AI** (`feedback`).
  Tidak ada teks karangan.
- "Dinilai {tanggal}" dari mockup tidak dipakai karena waktu penilaian tidak disimpan. Header menampilkan
  lama pengerjaan bila ada.
- Konfirmasi kirim tidak menjanjikan durasi penilaian.

## Design

- Baru:
  - `components/PdktStageNav.tsx`: navigasi tiga tahap;
  - `components/PdktWorkspaceHeader.tsx`: header ruang kerja, versi kotak masuk dan versi fokus;
  - `components/EmailAttachments.tsx`: daftar lampiran + pratinjau (dipakai Pahami dan Tanggapi);
  - `components/PdktReviewStage.tsx`: tahap Telaah;
  - `utils/reviewSummary.ts`: fungsi murni untuk predikat skor, baris rincian, dan prioritas;
  - `src/lib/pdkt-reply-marks.tsx`: penempatan tanda catatan dan sorotan contoh balasan. Logika ini
    dipindah dari `PdktEducationSections` supaya tampilan monitoring dan Telaah memakai aturan yang sama.
- Diubah:
  - `MailboxSidebar.tsx`: P1–P2;
  - `EmailDetailPane.tsx`: menjadi panel Pahami, prop evaluasi dihapus;
  - `ReplyComposer.tsx`: menjadi tahap Tanggapi dengan dua kolom dan konfirmasi. Penyimpanan draf per email
    tetap ada, dan draf juga disimpan saat komponen ditutup;
  - `simulation.tsx`: memilih tahap. Pemilihan otomatis di desktop hanya memilih email `open`, sehingga
    kembali dari Telaah tidak membuka email yang sama lagi.
- `lib/pdkt-dimensions.ts` mendapat keterangan singkat tiap aspek.
- Unit test lama yang memakai prop evaluasi `EmailDetailPane` (`pdkt-mailbox.test.tsx`,
  `pdkt-ai-image-rendering.test.tsx`) diganti. Kasus evaluasi (memuat, gagal + coba lagi, skor, kesesuaian
  kunci jawaban) kini dibuktikan E2E Telaah. Prop lain disesuaikan supaya root typecheck tetap lulus. Tes
  tidak dijalankan.
- Docs: `docs/modules.md` (PDKT).

## Tes

E2E hermetic `apps/web/e2e/pdkt-flow.spec.ts`:

- Pahami:
  - kotak masuk baru (judul, Baru, menu lainnya, filter dengan jumlah);
  - navigasi tahap dengan Telaah terkunci;
  - panel baca dengan lampiran;
  - baris Dibalas menampilkan skor.
- Tanggapi:
  - Tulis balasan membuka layar fokus;
  - hitungan kata;
  - Periksa lagi menutup konfirmasi;
  - Kirim dan nilai mengirim `POST /pdkt/mailbox/reply` berisi teks balasan, lalu Telaah tampil "Sedang
    dinilai AI…".
- Telaah:
  - skor, Perbaiki ini dulu, rincian lima aspek, tanda catatan bernomor, temuan lain, contoh balasan;
  - Kembali ke kotak masuk tidak membuka ulang email.
- Telaah gagal: pesan galat, lalu Coba lagi mengirim `POST /pdkt/history/retry-eval`, lalu "Sedang dinilai
  AI…".
- Tes yang sudah ada (privasi penerima, ukuran teks, landing membuka email) disesuaikan dengan label baru.

## Tasklist

- [x] RED E2E; jalankan, pastikan gagal karena UI lama.
- [x] GREEN Pahami.
- [x] GREEN Tanggapi dan Telaah.
- [x] Spec PDKT penuh, typecheck, lint, build.
- [x] Review `thermo-nuclear`, cek visual (desktop terang/gelap, HP), docs, `git diff --check`.

## Evidence (13 Okt 2026)

- RED: tes tahap baru dan tes yang disesuaikan gagal di UI lama. Penanda ruang kerja (filter "Dibalas"), navigasi
  tahap, dan layar fokus belum ada.
- Saat GREEN, ada dua temuan:
  - dialog konfirmasi tertutup editor karena ruang kerja PDKT adalah lapisan `fixed z-[100]`. Dialog kini
    dirender di dalam ruang kerja, sama seperti dialog PDKT lain;
  - setelah balasan terkirim, pilihan email hilang. Penyebabnya: daftar dimuat ulang (status `replied`) saat
    filter masih "Belum dibalas". Kini pilihan hanya dilepas saat email hilang dari kotak masuk atau peserta
    mengganti filter.
- Pemeriksaan kontras yang ditambahkan ke tes Telaah menemukan teks abu di kotak "Perbaiki ini dulu" 4.47:1.
  Teksnya kini memakai warna utama.
- `pnpm exec playwright test e2e/pdkt-flow.spec.ts`: 19/19 lulus.
- Spec terkait (`monitoring`, `edukatif-visual`, `main-landmark`, `authenticated-shell`): 42 lulus. Satu gagal,
  yaitu kegagalan lama di luar cakupan: `monitoring.spec.ts` "sesi kedaluwarsa…".
- `pnpm typecheck`, `pnpm lint` (0 error; tidak ada peringatan baru di file yang diubah), `pnpm build`, dan
  `git diff --check` lulus.
- Cek visual (screenshot Playwright):
  - Pahami: desktop terang/gelap dan HP;
  - Tanggapi: dengan konfirmasi;
  - Telaah: desktop terang/gelap dan HP 390px.

  Perbaikan setelah cek:
  - panel memakai permukaan putih;
  - filter "Belum dibalas · N" tidak lagi turun baris;
  - di HP, keterangan tahap disembunyikan secara visual dan panah ganda dihilangkan.
- Unit test lama:
  - enam kasus `EmailDetailPane` di `pdkt-mailbox.test.tsx` dihapus karena sudah dibuktikan E2E (isi email;
    penilaian memuat/gagal/selesai; kesesuaian kunci jawaban; pelaksana di header);
  - `pdkt-ai-image-rendering.test.tsx` disesuaikan dengan prop dan label lampiran baru;
  - kasus lain (hapus tanpa izin, tombol kembali, PDF, zoom) tetap sebagai inventaris legacy.

  Tidak ada unit test yang dijalankan.
- `EmailComposer.tsx` dihapus karena tidak dipakai di mana pun.

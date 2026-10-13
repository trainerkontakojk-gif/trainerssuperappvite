# PDKT: halaman awal dan Pengaturan sesuai mockup

Lane: **D** (redesain UI yang signifikan: halaman awal modul dan dialog Pengaturan). Tidak ada perubahan API,
skema, atau izin.

Sumber desain: canvas "Redesign PDKT" (artboard `1. Halaman awal PDKT`, `1b. Pengaturan — daftar skenario`,
`1c. Pengaturan — ubah skenario & arah balasan`), disetujui Fajar 13 Okt 2026 ("kerjakan desain dari
mockup"). Mockup memakai warna hex tetap; implementasi memakai token `docs/design.md` supaya tema gelap
tetap benar.

## Requirement

Halaman awal (`/pdkt`):

- A1. Baris atas: label "PDKT · Simulasi email konsumen", lalu tombol **Riwayat**, **Pemakaian AI**
  (dengan lencana biaya sesi terakhir bila ada), dan **Pengaturan**.
- A2. Hero: judul "Pahami keluhannya. Balas dengan tepat.", paragraf penjelas, tombol **Mulai simulasi**
  dan **Atur skenario**, serta tiga poin: "Kasus selalu baru", "Tanpa bocoran jawaban", "Ditelaah AI".
- A3. Ilustrasi tiga tahap (Pahami → Tanggapi → Telaah) bersifat dekoratif (`aria-hidden`), punya tombol
  jeda (WCAG 2.2.2), dan `prefers-reduced-motion` menampilkan tahap Telaah tanpa animasi.
- A4. **Progres latihan** dari data nyata, tanpa angka karangan:
  - "Menunggu balasan" = jumlah email berstatus `open` di kotak masuk, plus usia email terlama;
  - "Skor rata-rata" = rata-rata skor 5 sesi terakhir yang sudah ditelaah;
  - "Sedang ditelaah AI" = jumlah sesi berstatus `pending`/`processing`.
- A5. **Belum dibalas**: maksimal 3 email `open`, terlama dulu. Klik baris membuka kotak masuk dengan
  email itu terpilih, melalui pemilih peserta seperti tombol Mulai simulasi.
- A6. **Fokus berikutnya**: aspek dengan rata-rata terendah dari 5 sesi terakhir yang ditelaah, plus
  tombol membuka sesi terbaru.
- A7. **Hasil telaah terbaru**: maksimal 3 sesi yang sudah ditelaah (email, peserta, tanggal, skor). Klik
  membuka sesi itu, dan "Lihat semua riwayat" membuka dialog Riwayat.
- A8. Setiap bagian punya keadaan kosong yang jelas. Gagal memuat satu sumber tidak mengosongkan bagian
  lain.

Pengaturan:

- S1. Header "Pengaturan PDKT" dengan keterangan "Berlaku untuk sesi yang Anda mulai berikutnya."
- S2. Menu: **Skenario** (jumlah aktif), **Karakter konsumen**, **Identitas konsumen**, **Gaya & AI**,
  plus catatan bahwa karakter, arah balasan, dan kunci jawaban tidak terlihat peserta.
- S3. Footer: "Pulihkan bawaan", penanda "Belum disimpan" saat ada perubahan, **Tutup**, **Simpan**.
- S4. Daftar skenario:
  - setiap baris memuat sakelar aktif (`role="switch"`), judul, kategori, arah balasan, dan cara
    pembuatan email, plus tombol **Ubah** dan **Hapus**;
  - di atas daftar ada pencarian dan filter kategori;
  - aktifkan/nonaktifkan semua tetap tersedia.
- S5. Kartu arah balasan di editor menampilkan label (Normatif / Jebakan / Substansi) beserta ringkasan
  Kepada, Tembusan, dan Jawaban benar.
- S6. Sakelar "Gambar lampiran" pindah ke tab Gaya & AI.

Non-goals (PR ini):

- Editor skenario tetap memakai wizard tiga langkah yang ada. Versi satu halaman dari mockup butuh
  pemindahan lampiran, identitas per skenario, dan isi email manual, jadi dikerjakan terpisah.
- Popover rincian Pemakaian AI tetap memakai dialog Pemakaian yang ada.
- Tahap Pahami, Tanggapi, dan Telaah (artboard 2–5) tidak diubah.

## Design

1. `apps/web/src/routes/pdkt/utils/landingSummary.ts`: fungsi murni yang merangkum riwayat dan kotak
   masuk (A4–A7) beserta format "Hari ini / Kemarin / N hari lalu" (WIB).
2. `components/PdktStageDemo.tsx`: ilustrasi tiga tahap. Animasi CSS di `index.css` dengan kelas
   `pdkt-demo-*`, berhenti saat dijeda dan saat reduced-motion. Menggantikan `PdktMotionFrame`.
3. `components/PdktLandingOverview.tsx`: tiga bagian data di bawah hero.
4. `index.tsx`:
   - memuat daftar kotak masuk (`GET /pdkt/mailbox`, payload ringan tanpa snapshot);
   - merender hero dan overview;
   - meneruskan `initialSelectedMailboxId` ke `PdktSimulation`.
5. `simulation.tsx` menerima `initialSelectedMailboxId` sebagai pilihan awal.
6. Pengaturan:
   - `SettingsModal`: header, menu, catatan privasi, footer;
   - `ScenarioList`: baris, pencarian, dan filter;
   - `ScenarioRecipientsField`: kartu arah;
   - `PdktSystemTab`: sakelar gambar;
   - `PdktIdentityTab` / `PdktConsumersTab`: judul dan copy.
7. Docs: `docs/modules.md` (PDKT) dan `docs/design.md` (pengecualian animasi landing modul: berhenti
   dengan tombol jeda).

## Tes

E2E hermetic `apps/web/e2e/pdkt-flow.spec.ts`:

- landing menampilkan hero baru, aksi utama, dan tiga poin; copy lama tidak kembali;
- landing dengan mailbox dan riwayat menampilkan angka Progres latihan, baris Belum dibalas, Fokus
  berikutnya, dan Hasil telaah terbaru; klik baris Belum dibalas membuka email itu di kotak masuk;
- ilustrasi bisa dijeda (tombol berubah menjadi "Putar animasi");
- Pengaturan: judul baru, menu baru, sakelar skenario, label arah di baris, filter kategori, penanda
  "Belum disimpan";
- tes yang sudah ada (Riwayat, Pemakaian, Mulai simulasi, kontras, ukuran teks, arah balasan) disesuaikan
  dengan label baru.

## Tasklist

- [x] RED E2E; jalankan, pastikan gagal karena UI lama.
- [x] GREEN landing.
- [x] GREEN Pengaturan.
- [x] Typecheck, lint, build, E2E PDKT penuh.
- [x] Review `thermo-nuclear` dan audit UI, docs, `git diff --check`.

## Evidence (13 Okt 2026)

- RED: 7 tes baru/berubah di `pdkt-flow.spec.ts` gagal terhadap UI lama (hero, ringkasan progres, jeda
  animasi, Pengaturan, Pemakaian AI, ukuran teks, editor arah balasan).
- GREEN: `pnpm exec playwright test e2e/pdkt-flow.spec.ts` 14/14 lulus (dua kali, sebelum dan sesudah
  perbaikan review).
- Spec terkait: `authenticated-shell`, `main-landmark`, `monitoring`, `home-agent`, `accessibility`,
  `typography-floor` 46 lulus. Satu gagal, dan itu kegagalan lama di luar cakupan: `monitoring.spec.ts`
  "sesi kedaluwarsa…" mencari judul landing yang sudah dihapus.
- `pnpm typecheck`, `pnpm lint` (0 error), `pnpm build`, dan `git diff --check` lulus.
- Cek visual (screenshot Playwright, data contoh): halaman awal desktop terang/gelap dan HP 390px,
  Pengaturan desktop dan HP (menu bergeser ke samping), serta kartu arah balasan di tema gelap.
- Review:
  - `hasUnsavedChanges` kini dibaca setiap render untuk penanda "Belum disimpan". Perbandingan
    JSON settings (bisa memuat lampiran base64) dipindah ke `useMemo`.
  - Label dimensi dan helper arah balasan dipindah ke modul `.ts` supaya tidak menambah peringatan
    fast-refresh.
- Unit test lama `apps/web/src/__tests__/pdkt-settings-modal.test.tsx` masih mencari label lama ("Pengaturan
  Simulasi"). Tes itu inventaris legacy, tidak dijalankan CI, dan tidak dijalankan tanpa persetujuan Fajar.

### Perapian (permintaan Fajar "Rapikan dulu")

- Jeda animasi kini berhenti di tahap Telaah yang utuh (`data-static`), sama dengan reduced-motion.
  Sebelumnya jeda bisa membekukan bingkai setengah jadi yang tampak kosong.
- Tabel Hasil telaah terbaru di HP tidak lagi digulir ke samping: kolom Peserta dan Tanggal pindah ke bawah
  judul email.
- Judul di Belum dibalas dan di daftar skenario boleh dua baris. Butir info skenario tidak lagi memakai
  pemisah "·" yang menggantung saat baris turun.
- Menu Pengaturan di HP memakai penanda tab berbentuk kapsul, bukan garis vertikal.
- `pdkt-flow.spec.ts` 14/14 lulus setelah perapian; screenshot HP terang/gelap dan desktop dicek ulang.

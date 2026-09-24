# PDKT Scenario Creation Mode

## Perubahan

Alur `Tambah Skenario Baru` kini menampilkan pilihan mode sebelum membuka wizard:

- **Skenario AI** — trainer menjelaskan situasi; email simulasi dibuat dari deskripsi oleh AI. Form tidak meminta email final pada langkah pertama.
- **Email buatan sendiri** — trainer menulis subjek dan isi email sendiri. Generator AI tidak ditampilkan dan email disimpan sebagai template yang selalu dipakai untuk skenario tersebut.

Wizard tiga tahap, profil pengirim, penerima, lampiran, pengaturan simulasi, validasi, dan konfirmasi perubahan tetap dipakai sesuai kebutuhan tiap mode. Edit skenario lama langsung membuka wizard; mode lama diinferensikan dari `alwaysUseSampleEmail`.

## UX Follow-up: Tujuan & Pratinjau

- Step ketiga kini bernama `Tujuan & Pratinjau` untuk mode AI maupun manual. Urutan mental model dibuat eksplisit: `Penerima Email → Email Tambahan/Lampiran → Pratinjau Email → Simpan`.
- Surface step 3 memakai dua kolom pada desktop: kolom kiri berisi lawan bicara utama, email tambahan, dan lampiran; kolom kanan berisi pratinjau email. Pada layar kecil kolom ditumpuk dalam urutan yang sama.
- Copy penerima disederhanakan menjadi `Penerima Email`, `Lawan Bicara Utama`, `Email Tambahan`, dan `Tambah Email`. `Mode Penerima` dihapus dari UI, tetapi `recipientMode` tetap dipertahankan untuk kompatibilitas state/storage/API.
- `konsumen@ojk.go.id` ditampilkan sebagai baris tersendiri dengan keterangan `Disertakan otomatis.`. Preview email menampilkan tujuan utama yang dipilih, subjek, dan body dalam bentuk email, bukan form konfigurasi.
- Mode AI menempatkan `Buat Pratinjau`/`Buat Ulang` di area preview setelah penerima dan lampiran. Mode manual menampilkan preview dengan `Edit Email` untuk membuka editor subject/body terkontrol; generator AI tidak ditampilkan.
- Pengaturan perilaku simulasi tetap paling bawah dalam disclosure tertutup `Pengaturan tambahan`. Konten wizard tetap scrollable dan sticky footer edit menggunakan `Simpan Skenario`.

## Kompatibilitas

Tidak ada perubahan pada tipe `PdktScenario`, API, normalizer, storage, atau migration. Email manual memakai field `sampleEmailTemplate` dan `alwaysUseSampleEmail` yang sudah ada. Untuk skenario manual baru yang tidak memiliki deskripsi terpisah, isi email dipakai sebagai fallback deskripsi saat disimpan agar kontrak lama tetap valid.

## Verifikasi

- Web Vitest terarah untuk `pdkt-settings-modal.test.tsx` dan `pdkt-scenario-recipients.test.tsx`: **33 test passed**.
- Typecheck Web: **pass**.
- ESLint file terkait: **pass**.
- Web production build: **pass**; terdapat warning non-blocking dari builtin Tailwind/Vite yang di-skip.
- `git diff --check`: **pass**.
- Recheck browser terbaru tidak diklaim sebagai bukti visual karena session dogfood mendapat `403` dari Supabase; tidak ada credential yang disimpan.

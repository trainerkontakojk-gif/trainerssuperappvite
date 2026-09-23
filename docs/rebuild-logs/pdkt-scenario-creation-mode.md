# PDKT Scenario Creation Mode

## Perubahan

Alur `Tambah Skenario Baru` kini menampilkan pilihan mode sebelum membuka wizard:

- **Skenario AI** — trainer menjelaskan situasi; email simulasi dibuat dari deskripsi oleh AI. Form tidak meminta email final pada langkah pertama.
- **Email buatan sendiri** — trainer menulis subjek dan isi email sendiri. Generator AI tidak ditampilkan dan email disimpan sebagai template yang selalu dipakai untuk skenario tersebut.

Wizard tiga tahap, profil pengirim, penerima, lampiran, pengaturan simulasi, validasi, dan konfirmasi perubahan tetap dipakai sesuai kebutuhan tiap mode. Edit skenario lama langsung membuka wizard; mode lama diinferensikan dari `alwaysUseSampleEmail`.

## UX Follow-up: Email & Pengaturan

- Header dan label tahap mengikuti mode aktif: `1. Skenario AI` atau `1. Email Anda`, lalu `2. Profil Pengirim`, kemudian `3. Review Email AI` atau `3. Review Email Anda`.
- Mode AI menampilkan konteks bahwa AI membuat email, generator/regenerate yang relevan, dan preview hasil.
- Mode manual menampilkan editor subject/body yang terhubung ke draft yang sama. User dapat mengubah email langsung pada tahap review dan menyimpannya tanpa kontrol generator AI.
- Penerima dan lampiran tetap terlihat pada tahap review. Pengaturan perilaku simulasi dipindahkan ke disclosure tertutup `Pengaturan tambahan` agar hierarchy tidak penuh sejak awal.
- Area konten wizard tetap scrollable dan sticky footer tetap terpisah dari field paling bawah.

## Kompatibilitas

Tidak ada perubahan pada tipe `PdktScenario`, API, normalizer, storage, atau migration. Email manual memakai field `sampleEmailTemplate` dan `alwaysUseSampleEmail` yang sudah ada. Untuk skenario manual baru yang tidak memiliki deskripsi terpisah, isi email dipakai sebagai fallback deskripsi saat disimpan agar kontrak lama tetap valid.

## Verifikasi

- Web Vitest terarah untuk `pdkt-settings-modal.test.tsx` dan `pdkt-scenario-recipients.test.tsx`: **32 test passed**.
- Typecheck Web: **pass**.
- Web production build: **pass**.
- `git diff --check`: **pass**.
- Recheck browser terbaru tidak diklaim sebagai bukti visual karena session dogfood mendapat `403` dari Supabase; tidak ada credential yang disimpan.

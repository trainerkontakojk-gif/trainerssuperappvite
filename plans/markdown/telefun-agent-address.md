# Telefun — konsumen AI tidak menebak jenis kelamin agen

## Requirement

Laporan Fajar (2026-10-23): konsumen AI selalu salah memanggil agen pria/wanita (Pak/Bu, Mas/Mbak).

Penyebab di prompt (`apps/web/src/routes/telefun/services/promptBuilder.ts`):

- Konsumen tidak pernah diberi tahu jenis kelamin agen.
- Etika default untuk tipe selain Marah/Terburu-buru memerintahkan "Gunakan sapaan Pak/Bu"; Marah/Terburu-buru diperintah "Tetap memanggil agen dengan Mas/Mbak atau Pak/Bu".
- Contoh gaya bicara, silent handling, dan contoh penerimaan solusi memakai Mas/Mbak/Pak yang ditiru model.

Perilaku yang diminta:

- Konsumen memanggil agen dengan sapaan netral "Kak" atau tanpa sapaan, dan tidak menebak Mas/Mbak/Pak/Bu dari suara atau nama.
- Tidak ada contoh kalimat yang memakai sapaan bergender untuk agen.
- Identitas gender konsumen sendiri (KARAKTER: PRIA/WANITA) tidak berubah.

Di luar scope (butuh persetujuan terpisah): memakai `profiler_peserta.jenis_kelamin` peserta yang dipilih agar konsumen bisa memakai Mas/Mbak yang benar. Itu mengubah respons API sesi Telefun dan membaca data pribadi peserta, dan akun "self" tidak punya data jenis kelamin.

## Design

- `promptBuilder.ts`: satu aturan `SAPAAN UNTUK AGEN` di blok etika untuk semua tipe; hapus perintah Pak/Bu dan Mas/Mbak; ganti sapaan di contoh dengan "Kak" atau tanpa sapaan.
- Tidak ada perubahan server, skema, atau kontrak API.

## Tasklist

- [x] RED: test E2E di `apps/web/e2e/telefun-consumer-prompt.spec.ts` untuk tipe Marah dan Ramah: aturan sapaan netral ada, tidak ada sapaan bergender untuk agen di luar aturan itu.
- [x] GREEN: ubah `promptBuilder.ts`.
- [x] Spec fokus, typecheck web, eslint, `thermo-nuclear`.
- [x] CHANGELOG, commit, push.

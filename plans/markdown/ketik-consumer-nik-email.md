# KETIK — NIK dan email pada identitas konsumen

- **Lane:** D (kontrak tipe bersama, migrasi `ketik_history` + RPC finish, prompt AI konsumen, tampilan riwayat/monitoring).
- **Status:** draft, menunggu keputusan pengguna pada bagian "Keputusan terbuka".
- **Batas operasi:** implementasi dan verifikasi hanya di Supabase lokal. Migrasi produksi dijalankan terpisah dengan izin eksplisit, sebelum kode tayang.

## Kondisi saat ini (hasil telusur kode)

- "Database konsumen AI" KETIK **bukan tabel Supabase**, melainkan daftar tetap 50 nama + gender di `packages/types/src/ketik-identity.ts` (`KETIK_DUMMY_CONSUMERS`), ditambah 49 kota (`DUMMY_CITIES`) dan 18 prefix HP.
- `resolveKetikSessionIdentity()` memilih nama, kota, dan prefix HP dengan indeks acak yang sama tetapi modulo berbeda, sehingga kombinasi nama–kota tidak koheren (mis. "Teuku Fariz" bisa berdomisili di Jayapura). Nomor HP dibentuk dari indeks, bukan disimpan.
- Identitas tersimpan di `ketik_sessions.snapshot.config.identity` (JSON), lalu `finish_ketik_session` menyalin `name/phone/city` ke kolom `ketik_history.consumer_name/consumer_phone/consumer_city`.
- Pengguna dapat mengisi identitas tetap di Pengaturan → Identitas (`KetikIdentityTab.tsx`); field kosong = acak per sesi.
- Prompt konsumen (`consumer-response.ts`) mewajibkan AI memberi Nama/HP/Kota persis dari `identity` saat diverifikasi agen.

## Requirement

1. Setiap sesi KETIK memiliki identitas konsumen lengkap: nama, gender, kota, nomor HP, **NIK**, dan **email**.
2. NIK berformat 16 digit yang tampak realistis (kode wilayah sesuai kota domisili, tanggal lahir dengan aturan +40 untuk perempuan, nomor urut) tetapi **dijamin bukan NIK orang sungguhan** (nomor urut `0000`, yang tidak pernah diterbitkan Dukcapil).
3. Email turunan nama konsumen dan memakai domain yang tidak dapat menerima email sungguhan (lihat keputusan D2).
4. Pool konsumen bawaan diperluas dari 50 menjadi ±150–200 rekaman lengkap; 50 nama lama tetap ada dan dilengkapi NIK/email. Nama, gender, kota, NIK, email, dan HP dalam satu rekaman konsisten satu sama lain.
5. Pengguna dapat mengisi NIK dan email tetap di Pengaturan → Identitas, sama seperti HP/kota; kosong = dari pool acak. NIK manual divalidasi 16 digit, email divalidasi format.
6. AI konsumen memberikan NIK dan email persis saat agen meminta verifikasi data, tidak mengarang yang lain, dan tidak menyebutkannya tanpa diminta.
7. Header chat, riwayat KETIK, ekspor transkrip, dan Monitoring menampilkan NIK dan email. Sesi lama (sebelum fitur ini) tampil "—", tidak error.
8. Penugasan konfigurasi (`configuration-assignments.ts`) tetap tidak menyalin identitas ke akun lain.

## Design

### Data konsumen (tetap di kode, bukan tabel)

- Ganti `KETIK_DUMMY_CONSUMERS` menjadi rekaman lengkap `{ name, gender, city, birthDate, nik, email, phone }` di `packages/types/src/ketik-consumer-pool.ts` (file data terpisah agar `ketik-identity.ts` tetap ringkas).
- Data dibuat **sekali** oleh skrip generator deterministik `scripts/generate-ketik-consumer-pool.mjs` (seed tetap → hasil sama setiap dijalankan), lalu hasilnya di-commit. Runtime tidak membangkitkan NIK secara acak, sehingga data bisa direview dan tidak berubah antar-deploy.
- Generator: memasangkan nama daerah dengan kota yang cocok (nama Aceh → Banda Aceh, Bali → Denpasar, Bugis → Makassar, dst.), mengambil kode wilayah 6 digit dari tabel kecil kota→kode di skrip, tanggal lahir umur 21–60, nomor urut `0000`, email `nama.belakang<2 digit>@<domain>`, HP dari prefix yang ada.
- `resolveKetikSessionIdentity()` memilih **satu rekaman utuh** dari pool. Override pengguna per field tetap menang; jika pengguna mengisi nama sendiri tanpa NIK/email, NIK/email diambil dari rekaman acak dan email dibentuk ulang dari nama pengguna.
- Alasan tidak memakai tabel Supabase: tidak perlu UI admin untuk mengedit pool, tidak ada query tambahan per sesi (lebih cepat), dan tidak ada data pribadi palsu di database yang perlu diberi RLS. Bila nanti trainer perlu mengelola pool dari UI, pindahkan ke tabel sebagai pekerjaan terpisah.

### Kontrak tipe (`packages/types/src/ketik.ts`)

- `KetikIdentitySettings` + `nik: string`, `email: string` (default `""`).
- `ketikIdentitySchema` + `nik`, `email` sebagai `z.string().optional()` agar snapshot sesi lama tetap lolos parsing.
- `generateMessageSchema.identity` ditambah field yang sama (opsional).
- `settings-history.ts` menormalkan settings lama tanpa field ini menjadi `""`.

### Database (migrasi + rollback)

- `supabase/migrations/<ts>_ketik_history_consumer_nik_email.sql`:
  - `ALTER TABLE ketik_history ADD COLUMN consumer_nik text, ADD COLUMN consumer_email text` (nullable, tanpa default → instan, tanpa rewrite tabel).
  - `CREATE OR REPLACE FUNCTION finish_ketik_session(...)` dengan signature persis sama, menambah salinan `snapshot#>>'{config,identity,nik}'` dan `'{config,identity,email}'`. Grant/`SECURITY` tidak berubah.
- `supabase/rollbacks/rollback_<ts>_ketik_history_consumer_nik_email.sql`: kembalikan definisi `finish_ketik_session` versi `20261020160000`, lalu drop dua kolom.
- RLS tidak berubah (kolom baru ikut policy baris yang sudah ada).

### Backend

- `consumer-response.ts` dan `prompt-policy.ts`: tipe `identity` + `nik`, `email`; aturan KONSISTENSI DATA menjadi "Nama/HP/Kota/NIK/Email"; tambahkan aturan "jangan menyebut NIK/email tanpa diminta; saat diminta, tulis persis".
- `history-read.ts`, `monitoring-history-service.ts`, `packages/types/src/monitoring.ts`: select dan map `consumer_nik`, `consumer_email`.

### Web

- `KetikIdentityTab.tsx`: dua input baru (NIK, Email) dengan validasi ringan dan teks bantuan "kosongkan agar dibuat acak".
- `ChatInterface.tsx` header: tampilkan email; NIK hanya di panel detail/riwayat agar header tidak penuh (lihat D3).
- `utils/transcript.ts`, riwayat KETIK, dan Monitoring sesi: tambah baris NIK dan email, fallback "—".
- `ketik-avatar.ts` seed tidak diubah agar avatar sesi lama tetap sama.

## Keputusan terbuka

- **D1 — Skala pool:** 150 (rekomendasi) atau 300 rekaman?
- **D2 — Domain email:** (a) domain fiktif yang tampak wajar tetapi tidak bisa menerima email, mis. `@mail.ojk-sim.id` atau `@contoh.id` — rekomendasi; (b) `@gmail.com`/`@yahoo.com` — paling realistis, tetapi bisa kebetulan sama dengan alamat orang sungguhan.
- **D3 — Tampilan header chat:** tampilkan NIK di header (agen langsung melihat) atau sembunyikan agar agen tetap berlatih menanyakan NIK ke konsumen? Rekomendasi: sembunyikan di header, tampilkan di riwayat/review.
- **D4 — Penilaian:** apakah review KETIK perlu menilai "agen meminta NIK/email untuk verifikasi"? Rekomendasi: tidak di tahap ini; pisahkan sebagai perubahan rubrik.

## Tasklist

1. RED E2E: perluas `apps/web/e2e/ketik-session-api.spec.ts` / `ketik-history-api.spec.ts` — sesi baru menyimpan `consumer_nik` 16 digit berakhiran `0000` dan email valid di riwayat; sesi dengan settings NIK/email manual memakai nilai itu; riwayat sesi lama mengembalikan `null` tanpa error.
2. Skrip generator + file pool ter-commit; perbarui `resolveKetikSessionIdentity()`.
3. Tipe + normalisasi settings.
4. Migrasi + rollback; replay lokal bersih (`supabase db reset`).
5. Backend prompt + history/monitoring read.
6. Web: settings, header, transcript, riwayat, Monitoring.
7. E2E UI: `ketik-flow.spec.ts` mengisi NIK/email di Pengaturan dan melihatnya di riwayat.
8. Gate: typecheck/lint/build, E2E fokus hijau, `thermo-nuclear`, CHANGELOG.
9. Rilis: migrasi produksi (dengan izin) → push API → push web, sama seperti rilis durable messages; commit backend sudah membawa penyesuaian tipe/fixture web agar setiap commit lolos CI.

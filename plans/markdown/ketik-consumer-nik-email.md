# KETIK — NIK dan email pada identitas konsumen

- **Lane:** D (kontrak tipe bersama, migrasi `ketik_history` + RPC finish, prompt AI konsumen, tampilan riwayat/monitoring).
- **Status:** semua keputusan (D1–D4) diambil 2026-10-20. Mockup: https://claude.ai/artifact/KfxFGdTd6KiHbV4Q8Bzr5D (privat).
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
3. Email turunan nama konsumen dengan domain `@gmail.com` (keputusan D2). Aplikasi tidak pernah mengirim email ke alamat ini; risiko kebetulan sama dengan alamat sungguhan diterima.
4. Pool konsumen bawaan diperluas dari 50 menjadi 150 rekaman lengkap; 50 nama lama tetap ada dan dilengkapi NIK/email. Nama, gender, kota, NIK, email, dan HP dalam satu rekaman konsisten satu sama lain.
5. Pengguna dapat mengisi NIK dan email tetap di Pengaturan → Identitas, sama seperti HP/kota; kosong = dari pool acak. Isian **tidak diblokir** walau salah format: trainer boleh sengaja mengisi data "ngaco" (NIK kurang/lebih dari 16 digit, ada huruf, atau domain email typo seperti `gnail.com`). Di bawah isian tampil catatan netral bahwa data tidak sesuai format dan agen akan dinilai mengonfirmasinya; tombol Simpan tetap aktif.
5a. Data dari pool acak selalu valid; anomali hanya datang dari isian manual.
6. AI konsumen memberikan NIK dan email persis saat agen meminta verifikasi data, tidak mengarang yang lain, dan **tidak pernah menyebutkannya tanpa diminta** — termasuk di pesan pembuka; NIK/email baru muncul setelah agen menanyakannya. Bila data identitasnya salah format dan agen mengonfirmasi, konsumen memilih salah satu: **tidak bersedia menjawab** (menolak atau mengabaikan bagian itu), atau **memberikan versi yang sesuai format**. Versi yang sesuai dihitung server secara deterministik dan dikirim ke prompt sebagai `identity.correction` (NIK: digit lebih dibuang dari belakang atau digit kurang ditambahkan; email: domain typo diganti domain umum terdekat, mis. `gnail.com` → `gmail.com`), supaya konsumen tidak mengarang nilai yang berbeda-beda. Setelah memberikan versi yang sesuai, konsumen konsisten memakai versi itu sampai akhir sesi.
6a. Penilaian verifikasi (keputusan D4): bila NIK/email sesi tidak sesuai format, review menilai apakah agen **bertanya atau mengonfirmasi data yang tidak sesuai itu minimal 1 kali**. Satu kali sudah cukup untuk nilai penuh; agen tidak dituntut mengulang, dan tidak dikurangi nilainya bila konsumen tidak menjawab. Bila agen tidak pernah menyinggungnya, nilai Probing berkurang dan muncul catatan "fix" beserta contoh kalimat konfirmasi. Bila data sesi valid, aturan ini tidak berlaku (tetap tidak menghukum agen yang tidak menanyakan ulang data yang sudah jelas).
6b. Panel Data konsumen menampilkan data apa adanya tanpa tanda peringatan, supaya agen sendiri yang menemukan ketidaksesuaian.
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
- Deteksi anomali deterministik di `packages/types/src/ketik-identity.ts` (`detectKetikIdentityAnomalies(identity)`), dipakai bersama oleh catatan di Pengaturan dan oleh review:
  - NIK: bukan tepat 16 digit angka (kurang, lebih, atau ada karakter selain angka/spasi).
  - Email: format tanpa `@`/domain, atau domain berjarak edit 1–2 dari domain umum (`gmail.com`, `yahoo.com`, `yahoo.co.id`, `outlook.com`, `hotmail.com`, `icloud.com`) tetapi tidak sama persis, mis. `gnail.com`, `gmial.com`, `gmail.co`.
- `review-policy.ts`: bila ada anomali, prompt review mendapat blok `verificationContext` (field mana yang tidak sesuai dan nilainya, dari server, bukan dari browser) dan aturan Probing tambahan sesuai Requirement 6a. Tanpa anomali, blok ini tidak dikirim. Tidak menambah dimensi atau kolom skor baru.
- `history-read.ts`, `monitoring-history-service.ts`, `packages/types/src/monitoring.ts`: select dan map `consumer_nik`, `consumer_email`.

### Web

- `KetikIdentityTab.tsx`: dua input baru (NIK, Email) tanpa validasi yang memblokir; catatan netral dari `detectKetikIdentityAnomalies()` saat data tidak sesuai format; bagian "Contoh identitas acak".
- `ChatInterface.tsx`: header tetap ramping (nama, kota, timer); tombol "Data konsumen" membuka panel kanan berisi Nama, Kota, HP, NIK (16 digit utuh tanpa spasi, supaya agen bisa melihat sendiri bila jumlah digitnya kurang/lebih), Email, dengan tombol salin. Di layar sempit panel menjadi sheet dari bawah (keputusan D3).
- Telaah (`KetikReviewResult.tsx`, `KetikReviewStage.tsx`): bila sesi punya data tidak sesuai, tampilkan bagian "Verifikasi data" di bawah skor per aspek — tabel Data / Nilai di sesi / Tidak sesuai karena / Dikonfirmasi (Ya/Tidak) — dan tandai nilai yang tidak sesuai di transkrip. Catatan "Probing · Verifikasi data" muncul di tab "Perbaiki dulu" dengan kutipan pesan agen yang seharusnya mengonfirmasi dan contoh kalimat. Sesi dengan data valid tidak menampilkan bagian ini.
- `utils/transcript.ts`, riwayat KETIK, dan Monitoring sesi: tambah baris NIK dan email, fallback "—".
- `ketik-avatar.ts` seed tidak diubah agar avatar sesi lama tetap sama.

## Keputusan

- **D1 — Jumlah konsumen di pool acak:** 150 (sekarang 50).
- **D2 — Domain email:** `@gmail.com`.
- **D3 — Tampilan simulasi:** NIK dan email ditampilkan lewat panel "Data konsumen" di samping chat (mockup Simulasi B).
- **D4 — Penilaian:** review menilai konfirmasi data yang tidak sesuai, minimal 1 kali, sesuai Requirement 6a.

## Tasklist

1. RED E2E (tambahan): sesi dengan NIK 15 digit / email `@gnail.com` dari Pengaturan tersimpan apa adanya di snapshot dan riwayat; review menerima `verificationContext` hanya bila ada anomali.
1. RED E2E: perluas `apps/web/e2e/ketik-session-api.spec.ts` / `ketik-history-api.spec.ts` — sesi baru menyimpan `consumer_nik` 16 digit berakhiran `0000` dan email valid di riwayat; sesi dengan settings NIK/email manual memakai nilai itu; riwayat sesi lama mengembalikan `null` tanpa error.
2. Skrip generator + file pool ter-commit; perbarui `resolveKetikSessionIdentity()`.
3. Tipe + normalisasi settings.
4. Migrasi + rollback; replay lokal bersih (`supabase db reset`).
5. Backend prompt + history/monitoring read.
6. Web: settings, header, transcript, riwayat, Monitoring.
7. E2E UI: `ketik-flow.spec.ts` mengisi NIK/email di Pengaturan dan melihatnya di riwayat.
8. Gate: typecheck/lint/build, E2E fokus hijau, `thermo-nuclear`, CHANGELOG.
9. Rilis: migrasi produksi (dengan izin) → push API → push web, sama seperti rilis durable messages; commit backend sudah membawa penyesuaian tipe/fixture web agar setiap commit lolos CI.

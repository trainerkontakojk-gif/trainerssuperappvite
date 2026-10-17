# PDKT — email konsumen yang lebih manusiawi dan menantang dibaca

Lane C (perubahan perilaku prompt AI + perbaikan bug, satu modul backend). Sumber: audit `/mnt/project-files/audit-pdkt/audit-prompt-konsumen.md` dan persetujuan Fajar (17 Oktober 2026).

## Requirement

1. Pengecekan nama mencocokkan kata utuh: identitas "Agus" yang menulis "Agustus" (juga "Eko"/"ekonomi", "Siti"/"positif") tidak lagi dianggap membocorkan nama.
2. Email tetap panjang (500–1000 kata, 5–8 paragraf) untuk semua tipe, termasuk Terburu-buru. Fajar: "semakin banyak teks semakin bagus" untuk melatih kemampuan membaca.
3. Tantangan membaca selalu aktif: fakta inti tersebar (bukan satu paragraf satu aspek), "lampiran" ditulis di isi email (chat WA/SMS, rincian transfer, email lama yang diteruskan), 2–3 permintaan dengan satu terselip di tengah, gaya Terburu-buru panjang tapi tergesa.
4. Tantangan acak (masing-masing ~50%): fakta/angka pengecoh, dan konsumen meralat ucapannya sendiri.
5. Kepribadian dijalankan: arahan menulis per tipe bawaan (marah, bingung, kritis, ramah, terburu-buru, pasrah) di luar blok data; tipe kustom tetap mengikuti nama/deskripsi/tone. Satu batas: tanpa makian kasar, SARA, atau ancaman fisik.
6. Konsumen orang awam: tidak menulis prosedur, nama layanan, atau dasar hukum yang benar; Kritis boleh menuntut dasar hukum tanpa menyebutkannya.
7. Mode Realistis selaras dengan contoh di layar (singkatan, tanda baca berlebihan, kalimat tidak baku), intensitas mengikuti tipe.
8. Kalimat nama cadangan tidak lagi muncul sebelum salam pembuka atau setelah tanda tangan, dan tidak menggandakan nama yang sudah ditulis AI. AI diminta menulis `{{consumer_name}}` di posisi yang diizinkan.

## Design

- Perubahan di `apps/api/src/services/pdkt-email-policy.ts`, dengan blok suara konsumen (kepribadian, orang awam, tantangan membaca) dipisah ke `apps/api/src/services/pdkt/consumer-voice.ts` agar file utama tetap di bawah 1.000 baris:
  - helper pencocokan nama kata utuh untuk `validatePdktEmailPolicyCompliance`;
  - satu `PDKT_CONTENT_LENGTH` untuk semua tipe;
  - `readingChallenges` dipilih sekali di `buildPdktEmailGenerationPolicy` (bisa disuntik untuk tes) sehingga retry memakai pilihan yang sama;
  - blok baru `PERAN`, `KEPRIBADIAN`, `ORANG AWAM`, `TANTANGAN MEMBACA` di system instruction; aturan gaya lama nomor 2 diganti;
  - fallback nama: upfront disisipkan setelah salam pembuka, late ditaruh di blok tanda tangan, keduanya dilewati bila nama sudah ada.
- Tidak ada perubahan skema, API, UI, atau database.

## Tasklist

- [x] E2E API `apps/web/e2e/pdkt-consumer-email-api.spec.ts` (Hono asli, Supabase stub lokal, provider Gemini dicegat): RED dulu.
- [x] Implementasi GREEN.
- [x] Hapus kasus unit "250-500 kata" yang tergantikan E2E.
- [x] Typecheck/lint/build api, `git diff --check`, thermo-nuclear review, CHANGELOG.

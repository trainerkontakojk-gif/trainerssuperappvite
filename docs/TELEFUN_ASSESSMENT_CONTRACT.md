# Kontrak Penilaian Telefun

Dokumen ini menjelaskan batas kepercayaan data penilaian suara Telefun. Tujuannya
agar hasil AI, cache database, API, dan tampilan selalu memakai arti data yang
sama.

## Skala Nilai

- `overallScore` dan seluruh skor aspek memakai skala `0..10`.
- Nilai `0` adalah nilai valid, bukan tanda data kosong.
- `wordsPerMinute` adalah angka kecepatan bicara mentah.
- `fillerWords.count` adalah jumlah kata pengisi mentah.
- Nilai radar `displayScore` memakai skala `0..100` dan dibangun sistem dari
  assessment yang sudah valid.
- Untuk metric Fillers, `displayScore` tetap skor kualitas: semakin sedikit
  `fillerWords.count`, semakin tinggi skor. Count mentah tetap ditampilkan
  terpisah sebagai detail.
- Pada radar web, panduan visual `Target QA` untuk Fillers digambar rendah agar
  sesuai dengan arti jumlah filler ideal yang kecil. Ini tidak mengubah
  `displayScore` kualitas atau target kanonik di shared contract.

## Trust Boundary

Semua data dari Gemini, kolom JSON Supabase, dan respons HTTP dianggap
`unknown`. Data baru boleh dipakai setelah lolos:

```ts
parseVoiceQualityAssessment(input);
parseTelefunScoreResult(input);
```

Parser kanonik berada di
`packages/types/src/telefun-assessment.ts`. API dan web tidak boleh membuat
parser atau interface respons skor versi sendiri.

Assessment wajib memiliki lima aspek:

1. speaking rate;
2. intonation;
3. articulation;
4. filler words;
5. emotional tone.

Payload tanpa salah satu aspek tersebut ditolak. Angka non-finite, WPM negatif,
dan jumlah filler negatif atau pecahan juga ditolak.

## Communication Profile

Communication profile dari cache hanya dipertahankan bila struktur dan target
metriknya valid. Profile yang hilang atau stale dibangun ulang secara
deterministik dari assessment melalui
`enrichAssessmentWithCommunicationProfile()`.

Target radar tidak berasal dari AI. Target tetap dimiliki sistem.

## Hold Management

Hold assessment dihitung backend dari `session_metrics.hold`. AI tidak boleh
menentukan atau menimpa hasil hold.

Payload hold yang tidak valid dinormalisasi menjadi status `not_used` dengan
verdict `N/A`. Cache lama yang belum memiliki hold disinkronkan ketika dibaca.

## Persistence

Backend hanya menyimpan assessment setelah parser kanonik berhasil. Kegagalan
update Supabase menghasilkan respons gagal; service tidak boleh melaporkan
assessment sebagai berhasil tersimpan.

Fase ini tidak menambah migrasi atau backfill database. Row lama dinormalisasi
saat melewati boundary aplikasi.

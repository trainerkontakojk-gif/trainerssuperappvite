# Kontrak Penilaian Telefun

Dokumen ini menjelaskan batas kepercayaan data penilaian suara Telefun. Tujuannya
agar hasil AI, cache database, API, dan tampilan selalu memakai arti data yang
sama.

## Skala Nilai

- `overallScore` dan seluruh skor aspek memakai skala **`0..10`**.
- Nilai `0` adalah nilai valid, bukan tanda data kosong.
- `wordsPerMinute` adalah angka kecepatan bicara mentah.
- `fillerWords.count` adalah jumlah kata pengisi mentah.
- Nilai radar `displayScore` memakai skala **`0..100`** dan dibangun sistem dari
  assessment yang sudah valid.
- Skala `0..100` pada radar adalah **koordinat visual**, bukan skor kualitas
  universal. Arti tiap sumbu bergantung pada metrik (lihat bagian Radar Chart).

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

## Bukti bahasa pada Telaah

`contentReview.agentNotes` memuat maksimal 16 temuan. Field lama tetap berlaku;
hasil lama tanpa `category` tetap terbaca tanpa diberi kategori hasil tebakan.
Kategori baru: `repetition` (Pengulangan), `effectiveness` (Efektivitas kalimat),
`clarity`, `empathy`, `politeness`, `accuracy`, dan `confirmation`.

AI diminta memeriksa setiap dimensi, bukan memenuhi kuota kesalahan. Catatan
`fix` berkategori harus mempunyai contoh kalimat pengganti. Aspek bahasa tidak
mengubah skor suara atau rumus radar, dan tidak menambah panggilan AI; field
ini dihasilkan oleh panggilan assessment yang sudah ada. Ketepatan informasi
hanya dinilai sejauh dapat dibuktikan oleh konteks; tidak ada sumber aturan
eksternal baru. Intonasi, artikulasi dan tempo tetap dinilai dari audio, bukan
dari transkrip. Keandalan klasifikasi semantik tetap bergantung pada model.

Backend mencocokkan kutipan dengan ucapan pembicara yang benar. Field opsional
`startOffset` menyimpan posisi karakter UTF-16 pada teks asli. Untuk kategori
pengulangan, `comparison` wajib menunjuk bukti agen yang lebih awal; bukti
tidak ada, pembicara salah, referensi ke masa depan atau satu kemunculan yang
dipakai dua kali ditolak. Satu baris boleh memuat dua kemunculan berbeda yang
tidak bertumpuk. Ini membuktikan keberadaan/urutan kutipan, bukan membuktikan
secara deterministik bahwa pengulangannya tidak perlu. Konfirmasi yang memang
bertujuan memperjelas kebutuhan bukan otomatis kesalahan.

UI menandai kutipan utama dengan nomor catatan dan pembanding dengan akhiran
`a` (misalnya `1` dan `1a`). Keduanya membuka catatan yang sama; tombol Agen
dan Pembanding kembali ke baris terkait. Kutipan bertumpang tindih tetap
mempertahankan semua tombol tanpa menggandakan teks. Posisi eksplisit yang
tidak lagi cocok tidak dipindahkan diam-diam ke kemunculan lain.

Tidak ada migrasi/backfill otomatis atau Telaah ulang saat membuka hasil lama.
Trainer/admin dapat menjalankan Telaah ulang secara eksplisit untuk memperoleh
anotasi baru. Perubahan ini baru tersedia setelah versi aplikasi dirilis;
penambahan kode bukan bukti deployment.

## Communication Profile

Communication profile adalah struktur deterministik yang dibangun dari
assessment mentah. Target radar dan status tidak berasal dari AI — target
tetap dimiliki sistem.

### Target Sistem

Setiap metrik memiliki target tetap (hard-coded di
`packages/types/src/telefun-communication-profile.ts`):

| Metrik           | Target (displayScore / radar) | targetDirection       |
| ---------------- | ----------------------------- | --------------------- |
| Speaking Rate    | 70                            | `match_target`        |
| Intonation       | 80                            | `match_target`        |
| Articulation     | 90                            | `match_target`        |
| Tone             | 85                            | `match_target`        |
| Fillers          | count ≤ 3 (radar guide: 20)   | `lower_raw_is_better` |

- **Non-Fillers** — `targetDirection = "match_target"`: skor radar mendekati
  target = semakin baik. Deviasi absolut terhadap target yang dinilai.
- **Fillers** — `targetDirection = "lower_raw_is_better"`: semakin sedikit
  kata pengisi semakin baik. Kartu metrik menampilkan **raw count** dan
  **contoh kata**, bukan displayScore.

### Penentuan Status

**Non-Fillers** (Speaking Rate, Intonation, Articulation, Tone):

```
abs(displayScore - targetScore)
  ≤ 10  → good
  ≤ 25  → needs_improvement
  > 25  → poor
```

Fungsi: `getMetricStatus(displayScore, targetScore)`.

**Fillers** (berdasarkan raw count, bukan displayScore):

```
count ≤ 3  → good
count ≤ 5  → needs_improvement
count > 5  → poor
```

Fungsi: `evaluateFillerCountStatus(count)`. Target maksimal 3 kata pengisi.

### Fillers — Radar Burden

DisplayScore Fillers pada radar adalah **radar burden** — visualisasi
kepadatan — bukan skor kualitas:

```
burden = min(100, round(count / 15 * 100))
```

| Count | Burden | Visual                        |
| ----- | ------ | ----------------------------- |
| 0     | 0      | Paling dalam (terbaik)        |
| 3     | 20     | Target QA (guide line hijau)  |
| 5     | 33     | Batas needs_improvement       |
| 15+   | 100    | Paling luar (terburuk)        |

Semakin rendah burden = semakin baik. Guide line hijau radar untuk Fillers
digambar di nilai 20 (setara count = 3).

### Staleness & Rebuild

Profile dari cache hanya dipertahankan bila semua kondisi berikut terpenuhi:

1. **targetDirection** cocok dengan implementasi saat ini (`match_target`
   untuk non-fillers, `lower_raw_is_better` untuk fillers).
2. **evaluationMode** cocok dengan `BENCHMARK_DEFAULTS`.
3. **status** cocok dengan formula terkini — untuk non-fillers via
   `getMetricStatus()`, untuk fillers via `evaluateFillerCountStatus()`.
4. **Fillers displayScore** sama dengan `mapFillerCountToRadarBurden(count)`
   — mendeteksi dan memperbaiki cache yang masih menyimpan skor kualitas
   terbalik dari implementasi lama.

Profile yang hilang, stale, atau menggunakan rumus lama otomatis dibangun
ulang secara deterministik melalui
`enrichAssessmentWithCommunicationProfile()`.

## Tampilan profil (diagram spider)

Sejak 2026-10-15 (sore) profil tampil sebagai diagram spider
`TelefunProfileRadar` di Telaah dan Monitoring, menggantikan daftar
`TelefunTargetList`. Semua sumbu memakai `metric.score` (skor aspek AI 0–10,
makin tinggi makin baik), bukan `displayScore` 0–100, sehingga tidak ada lagi
sumbu terbalik untuk filler. Cincin skala 2–10 diberi angka; zona hijau
"Sudah baik" dihapus karena batasnya sulit dibaca. Pembagian Perbaiki
dulu/Sudah baik (`TELEFUN_FIX_THRESHOLD`, 7,0) tetap di tab dan warna bar. `displayScore`, target, dan status di atas tetap kontrak data;
hanya tampilannya yang berubah.

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

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

## Radar Chart

Radar chart membandingkan **Hasil Anda** (biru) dengan **Target QA** (hijau)
pada skala 0–100.

- **Non-Fillers**: skor biru mendekati target hijau = semakin baik. Terlalu
  rendah maupun terlalu tinggi kurang baik — deviasi absolut terhadap target
  yang dinilai.
- **Fillers (↓)**: skor biru di bawah guide hijau (20) = baik. Semakin
  rendah semakin baik.
- **Luas polygon bukan ukuran kualitas universal** — nilai absolut tiap
  sumbu memiliki arti yang berbeda tergantung metriknya. Dua profil belum
  tentu setara meskipun luas poligonnya sama.

Arti tiap sumbu radar:

| Sumbu           | Nilai pengguna (biru)               | Target (hijau) |
| --------------- | ----------------------------------- | -------------- |
| Speaking Rate   | Skor ternormalisasi dari WPM        | 70             |
| Intonation      | Skor AI (×10)                       | 80             |
| Articulation    | Skor AI (×10)                       | 90             |
| Tone            | Skor AI (×10)                       | 85             |
| Fillers (↓)     | Radar burden dari raw count         | 20             |

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

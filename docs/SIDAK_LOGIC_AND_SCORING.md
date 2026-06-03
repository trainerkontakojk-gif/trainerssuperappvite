# SIDAK Logic and Scoring

Dokumen ini menjelaskan logika bisnis SIDAK yang dipakai saat ini: sumber data, pemisahan row audit, rumus skor, dan cara metrik dashboard/ranking dihitung.

## Sumber Kebenaran

- Scoring engine di `apps/api/src/lib/scoring.ts`.
- Business logic SIDAK di `apps/api/src/services/sidak-service.ts`.
- Shared types di `packages/types/src/index.ts`.
- Migration di `supabase/migrations/001_sidak.sql`.

## Istilah Dasar

- `nilai` adalah nilai hasil audit per indikator dengan rentang `0` sampai `3`.
- `nilai = 3` berarti tidak ada temuan pada indikator tersebut.
- `nilai < 3` berarti ada temuan dan nilai makin kecil berarti kualitas makin buruk.
- `bobot` adalah kontribusi indikator di dalam kategori atau mode skor tertentu.
- `rule version` adalah snapshot indikator dan bobot yang berlaku untuk service dan periode tertentu.
- `audit presence` adalah row yang dipakai untuk membuktikan agent benar-benar diaudit, termasuk clean session phantom-only.
- `finding` adalah row countable yang benar-benar menambah jumlah temuan.

## Alur Data

1. Row temuan dikelompokkan per sesi, biasanya memakai `no_tiket`.
2. Kalau `no_tiket` kosong, implementasi memakai key fallback berbasis waktu atau periode.
3. Row dipartisi menjadi tiga bucket:
   - `auditPresenceRows`: semua row yang mewakili audit valid.
   - `scoreRows`: row real jika ada, atau phantom-only jika satu sesi memang hanya punya phantom.
   - `findingRows`: hanya row real yang countable.
4. Skor sesi dihitung dari `scoreRows`.
5. Skor agent dihitung dari kumpulan skor sesi.
6. Dashboard dan ranking memakai `auditPresenceRows` untuk populasi audit, lalu `findingRows` untuk total defect.

## Rumus Skor Sesi

Ada tiga mode skor:

| Mode          | Rumus                                                              |
| ------------- | ------------------------------------------------------------------ |
| `flat`        | `score = (sum((nilai / 3) * bobot) / sum(bobot)) * 100`            |
| `no_category` | Sama seperti `flat`                                                |
| `weighted`    | Hitung skor per kategori dulu, lalu gabungkan dengan bobot service |

### Mode `weighted`

```
nonCriticalScore = (sum((nilai / 3) * bobot non-critical) / sum(bobot non-critical)) * 100
criticalScore = (sum((nilai / 3) * bobot critical) / sum(bobot critical)) * 100
finalSessionScore = (nonCriticalScore * non_critical_weight) + (criticalScore * critical_weight)
```

Jika satu kategori tidak punya indikator, skor kategori itu dianggap `100`.

## Rumus Skor Agent

Skor agent tidak langsung mengambil satu sesi, tetapi merata-ratakan sesi yang paling buruk dulu.

1. Hitung skor untuk setiap sesi.
2. Urutkan skor sesi dari yang paling rendah ke yang paling tinggi.
3. Ambil maksimal 5 skor terburuk.
4. Jika jumlah sesi kurang dari 5, isi sisa slot dengan `100`.
5. Rata-ratakan 5 nilai itu.

```
finalAgentScore = (s1 + s2 + s3 + s4 + s5) / 5
```

`s1..s5` adalah lima skor sesi hasil sampling setelah padding.

## Rumus Clean Session

Clean session tetap dihitung sebagai audit valid, tetapi tidak menambah defect.

- `auditPresenceRows` ikut menambah populasi audited.
- `scoreRows` dipakai untuk skor; kalau satu sesi hanya punya phantom, phantom tetap dipakai supaya skor sesi tidak hilang.
- `findingRows` hanya row real yang countable.

Konsekuensinya:

- clean session bisa membuat `score = 100`
- clean session bisa membuat `findingsCount = 0`
- clean session tidak boleh menambah total defect, pareto, donut, atau ranking defect

## Logika Workspace Data (Data Report)

Berbeda dengan dashboard yang menghitung populasi audit secara luas (termasuk clean session), Workspace Data (`/sidak/reports-data`) dirancang sebagai alat kerja perbaikan kualitas.

- **Eksklusi Phantom**: Row `is_phantom_padding = true` tidak pernah ditampilkan di tabel maupun ekspor Excel.
- **Findings-Only**: Hanya row yang memiliki data temuan riil DAN saran perbaikan yang ditampilkan.
- **Tujuan**: Memungkinkan trainer/leader untuk melakukan audit detail dan coaching fokus pada area yang bermasalah saja.

## Metrik Dashboard Dan Ranking

| Metrik               | Rumus                                            |
| -------------------- | ------------------------------------------------ |
| `totalAgents`        | Jumlah agent dengan audit presence               |
| `totalDefects`       | Jumlah `findingRows` countable                   |
| `avgDefectsPerAudit` | `totalDefects / totalAgents`                     |
| `zeroErrorRate`      | `(agent tanpa findingRows / totalAgents) * 100`  |
| `avgAgentScore`      | `sum(finalAgentScore) / totalAgents`             |
| `complianceRate`     | `(agent dengan score >= 95 / totalAgents) * 100` |

## Delta KPI Dashboard

Persentase kenaikan/penurunan (delta) di KPI Dashboard dihitung berdasarkan dua titik terakhir dari data tren (sparkline). Unit delta disesuaikan dengan jenis metrik:
1. **Metrik Count/Ratio** (`total-defects` dan `avg-defects`): Delta ditampilkan sebagai persentase relatif terhadap periode sebelumnya. Rumusnya: `((current - previous) / previous) * 100`.
2. **Metrik Persen** (`avg-score` dan `compliance`): Delta ditampilkan sebagai perubahan poin persentase (poin) absolut agar operator tidak bingung. Rumusnya: `current - previous` (dengan nilai mutlak untuk magnitudo).
3. **Kepatuhan (Compliance)**: Delta kepatuhan dihitung menggunakan `complianceRate` (persentase) alih-alih `complianceCount` (jumlah agen) agar konsisten dengan nilai utama KPI.

Ranking agent diurutkan dari defect terbanyak ke tersedikit, lalu nama agent sebagai tie-break.

Pareto dan donut memakai `findingRows` saja. Phantom tidak dihitung sebagai defect.

## Contoh Hitung

### Contoh 1 - Sesi Weighted

Asumsi service memakai bobot `critical = 0.50` dan `non-critical = 0.50`.

| Indikator | Kategori     | Bobot | Nilai |
| --------- | ------------ | ----- | ----- |
| A         | non-critical | 2     | 3     |
| B         | non-critical | 1     | 2     |
| C         | critical     | 1     | 0     |

Hitungan:

- `nonCriticalScore = ((3/3 * 2) + (2/3 * 1)) / 3 * 100 = 88.89`
- `criticalScore = ((0/3 * 1) / 1) * 100 = 0`
- `finalSessionScore = (88.89 * 0.50) + (0 * 0.50) = 44.44`

### Contoh 2 - Sampling 5 Sesi

Kalau skor sesi agent adalah `44.44`, lalu tidak ada sesi lain:

- skor sesi terurut: `44.44`
- setelah padding: `44.44, 100, 100, 100, 100`
- `finalAgentScore = 88.89`

Artinya satu sesi buruk tidak langsung menjadi skor final agent, karena SIDAK mengambil 5 sesi terburuk lalu rata-ratanya.

### Contoh 3 - Clean Session Phantom-Only

Kalau satu periode hanya berisi phantom padding:

- `auditPresenceRows = 1`
- `scoreRows = 1`
- `findingRows = 0`
- skor sesi = `100`
- `findingsCount = 0`

Hasilnya tetap masuk audited population, tetap tampil di ranking, tetapi tidak menambah defect.

## Catatan Praktis

- `weighted`, `flat`, dan `no_category` punya rumus dasar yang berbeda pada level sesi.
- Snapshot rule version harus dipakai untuk periode yang sudah dipublish agar skor historis tidak berubah.
- Jika data temuan real dan phantom bercampur dalam sesi yang sama, hitungan skor dan defect harus mengikuti row real saja.
- Gunakan `docs/SIDAK_SCORING_GUARDRAILS.md` untuk perubahan yang menyentuh scoring atau agregasi SIDAK.
- **Tampilan UI**: Halaman input (`/sidak/input`) memakai grid responsif untuk pilihan folder, agen, periode, dan daftar temuan. Di mobile grid kembali menjadi satu kolom agar tetap mudah dibaca; di layar lebih lebar trainer bisa melihat lebih banyak pilihan atau sesi dalam satu viewport.

## BKO Parameter and Weights Resolver

Halaman Input Temuan (`/sidak/input`) menggunakan backend resolver khusus (`GET /resolved-input-config`) untuk memuat konfigurasi parameter aktif dan bobot per `(service_type, period_id)`. Hal ini menjamin parity dengan legacy:
1. **Layanan BKO**: Parameter diselesaikan berdasarkan rule version yang aktif pada periode target. Jika tidak ada versi yang aktif, dropdown parameter akan dinonaktifkan secara eksplisit dan menampilkan peringatan.
2. **Flat List**: Mode scoring BKO adalah `no_category`. Parameter ditampilkan dalam satu daftar datar (tanpa pemisahan kategori Critical/Non-Critical).
3. **Pembersihan State**: Perpindahan layanan di halaman input secara otomatis membersihkan input manual yang sedang berjalan serta data preview Excel untuk mencegah kebocoran parameter antar layanan.


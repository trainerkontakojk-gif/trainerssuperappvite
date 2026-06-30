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

> [!NOTE]
> Dashboard SIDAK menghitung summary endpoint dari row `qa_temuan` secara real-time memakai scoring engine aplikasi. Materialized view/cache summary tidak menjadi sumber kebenaran untuk response dashboard karena formula SQL/cache dapat tertinggal dari rule-version, grouping sesi, dan `isCountableFinding()`.

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

## Dashboard Forecast (Prediksi)

Fitur forecasting SIDAK Dashboard memproyeksikan tren temuan dan parameter untuk N bulan ke depan (default 3, range 1–6).

### Arsitektur

1. **Batch Generation**: Satu request menghasilkan forecast untuk Total Temuan + seluruh parameter dalam satu panggilan Gemini.
2. **Regresi Linear (Deterministik)**: Angka forecast dihitung secara deterministik via regresi linear — tidak menggunakan AI untuk angka.
3. **Narasi AI**: Gemini 3.1 Flash Lite (temperature 0.3) menghasilkan insight naratif berdasarkan hasil regresi. Dipanggil sekali per generasi.
   - Blok parameter tidak dibiarkan bergantung penuh pada format model; backend menormalkan ulang bagian itu agar tiga blok delta tetap tampil konsisten.
4. **Persistence**: Snapshot disimpan di `sidak_dashboard_forecast_snapshots` dengan SHA-256 fingerprint untuk deteksi stale (perubahan data historis).
5. **Cache-Only Lookup**: Setiap mount page melakukan `POST /dashboard/forecast { cacheOnly: true }` — tidak memanggil Gemini, hanya lookup DB.
6. **Leader Scope**: Scope leader di-hash ke dalam `filterKey`, mencegah kebocoran snapshot antar scope akses.

### 3-State Lifecycle

| State     | Makna                                   | Visual                                |
| --------- | --------------------------------------- | ------------------------------------- |
| `missing` | Belum ada snapshot untuk filter ini     | Button "Update Prediksi"              |
| `fresh`   | Snapshot ada dan data masih sama        | Insight panel tampil, button tersedia |
| `stale`   | Snapshot ada tapi data historis berubah | Button pulse animasi, insight hidden  |

### Visibility Toggle

Saat snapshot forecast sudah ada, user dapat menyembunyikan atau menampilkan
kembali forecast yang sedang aktif tanpa menghapus snapshot dari state.

- Toggle hanya memengaruhi rendering chart forecast dan insight panel.
- Data snapshot tetap tersimpan sehingga user bisa menampilkan kembali forecast
  tanpa request ulang selama state masih valid.
- Saat snapshot hilang karena filter berubah atau data di-reset, toggle kembali
  ke kondisi tampil default.
- Kontrol UI harus tetap bisa diakses lewat keyboard, memakai label yang jelas,
  dan menampilkan `Sembunyikan Prediksi` / `Tampilkan Prediksi` secara eksplisit.

### Confidence Forecast

Label `Confidence` pada forecast SIDAK menunjukkan tingkat keyakinan hasil regresi linear, bukan confidence statistik formal.

Aturan yang dipakai saat ini:

| Kondisi                                  | Confidence                    |
| ---------------------------------------- | ----------------------------- |
| Titik historis `< 4`                     | `low`                         |
| Titik historis `4-7`                     | `medium`                      |
| Titik historis `>= 8`                    | `high`                        |
| Jika `averageError / averageValue > 0.4` | Turun 1 level dari hasil awal |

Interpretasi praktis:

- Tren bisa tetap `down` atau `up` walaupun confidence masih `medium`.
- Confidence turun bila data historis masih sedikit atau sebaran titik historis terlalu jauh dari garis regresi.
- Nilai `direction` dan `confidence` dihitung terpisah, jadi tren yang konsisten belum tentu otomatis menjadi `high`.

### Makna Perubahan Parameter

Series parameter forecast berisi **jumlah temuan**, bukan skor kualitas. Karena
itu, arah perubahannya dibaca sebagai berikut:

| Nilai perubahan          | Makna                                                                |
| ------------------------ | -------------------------------------------------------------------- |
| Negatif, misalnya `-9`   | Jumlah temuan diproyeksikan turun sekitar 9; ini merupakan perbaikan |
| Positif, misalnya `+7.3` | Jumlah temuan diproyeksikan naik sekitar 7,3; ini merupakan risiko   |
| Mendekati `0`            | Jumlah temuan relatif stabil                                         |

Narasi AI wajib memakai format delta ringkas seperti `(-9)` atau `(+7,3)`.
Penurunan jumlah temuan tetap berarti perbaikan, jadi jangan menyebut delta
negatif sebagai penurunan kualitas. Perubahan kontrak semantik forecast
dimasukkan ke data fingerprint agar snapshot dengan narasi lama ditandai stale
dan perlu diperbarui.
Jika model menulis blok parameter yang tidak rapi atau menghilangkan delta,
backend akan menggantinya dengan ringkasan parameter deterministik supaya
insight tetap mudah dibaca oleh orang awam.

### Endpoint

`POST /api/v1/sidak/dashboard/forecast`

| Parameter       | Type    | Default  | Deskripsi                                 |
| --------------- | ------- | -------- | ----------------------------------------- |
| `filters`       | object  | required | Filter dashboard (year, serviceType, dll) |
| `horizonMonths` | number  | `3`      | Jumlah bulan forecast (1–6)               |
| `forceRefresh`  | boolean | `false`  | Skip cache, regenerasi paksa              |
| `cacheOnly`     | boolean | `false`  | Lookup saja, jangan generate              |

### Komponen Frontend

- **ForecastActionButton**: 4-state button (missing/fresh/stale/loading) dengan pulse animation untuk stale, `motion-reduce:animate-none` untuk aksesibilitas.
- **ForecastInsightPanel**: Panel insight naratif dengan 3 metric cards (arah tren, proyeksi perubahan, metode) + parsed narrative body.
- **ParamTrendChart**: Dashed forecast line (`strokeDasharray="5 5"`) untuk parameter visible atau Total Temuan, anchor point di bulan aktual terakhir.

## Catatan Praktis

- `weighted`, `flat`, dan `no_category` punya rumus dasar yang berbeda pada level sesi.
- Snapshot rule version harus dipakai untuk periode yang sudah dipublish agar skor historis tidak berubah.
- Jika data temuan real dan phantom bercampur dalam sesi yang sama, hitungan skor dan defect harus mengikuti row real saja.
- Gunakan `docs/SIDAK_SCORING_GUARDRAILS.md` untuk perubahan yang menyentuh scoring atau agregasi SIDAK.
- **Tampilan UI**: Halaman input (`/sidak/input`) memakai grid responsif untuk pilihan folder, agen, periode, dan daftar temuan. Di mobile grid kembali menjadi satu kolom agar tetap mudah dibaca; di layar lebih lebar trainer bisa melihat lebih banyak pilihan atau sesi dalam satu viewport.

## Agent Detail Score Source

Skor bulanan halaman agent detail (`GET /sidak/agents/:id`) dihitung dari `qa_temuan` melalui scoring engine aplikasi dengan `PeriodScoringContext` yang spesifik per periode. Tabel `qa_dashboard_agent_period_summary` tidak digunakan sebagai sumber skor agent detail karena row history dapat berisi placeholder hasil migration refresh yang tidak setara dengan formula aplikasi.

Lihat `apps/api/src/services/sidak/period-scoring-context.ts` untuk implementasi canonical rule/indicator/weight resolver.

## BKO Parameter and Weights Resolver

Halaman Input Temuan (`/sidak/input`) menggunakan backend resolver khusus (`GET /resolved-input-config`) untuk memuat konfigurasi parameter aktif dan bobot per `(service_type, period_id)`. Hal ini menjamin parity dengan legacy:

1. **Layanan BKO**: Parameter diselesaikan berdasarkan rule version yang aktif pada periode target. Jika tidak ada versi yang aktif, dropdown parameter akan dinonaktifkan secara eksplisit dan menampilkan peringatan.
2. **Flat List**: Mode scoring BKO adalah `no_category`. Parameter ditampilkan dalam satu daftar datar (tanpa pemisahan kategori Critical/Non-Critical).
3. **Pembersihan State**: Perpindahan layanan di halaman input secara otomatis membersihkan input manual yang sedang berjalan serta data preview Excel untuk mencegah kebocoran parameter antar layanan.

# Forecasting SIDAK — Referensi Pengembangan

> Dibuat: 8 Juli 2026
> Konteks: Evaluasi metode forecasting pada dashboard SIDAK Forecast

## Data Historis CALL (Jan–Jun 2026)

### Sumber Data
- **Service Type:** `call`
- **Filter:** `isCountableFinding()` — temuan dengan nilai < 3 ATAU memiliki catatan ketidaksesuaian/sebaiknya
- **Database:** Supabase `qa_temuan`

### Data Per Bulan

| Bulan | x | Temuan | Keterangan |
|:------|:-:|:------:|:-----------|
| Jan 26 | 1 | **164** | Data awal |
| Feb 26 | 2 | **129** | Turun |
| Mar 26 | 3 | **130** | Stabil |
| Apr 26 | 4 | **122** | Turun |
| Mei 26 | 5 | **106** | Turun |
| Jun 26 | 6 | **156** | Lonjakan naik |

### Catatan Anomali
Juni 2026 menunjukkan lonjakan signifikan (156) setelah tren menurun dari Jan–Mei. Ini membuat model regresi linear kurang representatif.

---

## Metode Forecasting: Evaluasi & Perbandingan

### 1. Regresi Linear (Metode Saat Ini)

**Rumus:** `y = a + bx`

**Hasil:**
- **Persamaan:** y = 146,19 − 3,34x
- **Slope (b):** −3,34 (turun ~3 temuan per bulan)
- **Intercept (a):** 146,19

**Korelasi:**
- **r = −0,29** (korelasi negatif lemah)
- **R² = 8,3%** — hanya 8,3% variasi temuan dijelaskan oleh waktu
- **91,7%** sisanya dari faktor lain (sampling, agent performance, seasonality)

**Prediksi:**
| Bulan | x | Prediksi |
|:------|:-:|:--------:|
| Jul 26 | 7 | **123** |
| Agt 26 | 8 | **119** |
| Sep 26 | 9 | **116** |

**Kelemahan:**
- Asumsi linear tidak cocok untuk data dengan spike/fluktuasi
- R² rendah → waktu bukan prediktor utama
- Sensitif terhadap outlier (Juni spike)

### 2. Moving Average (MA-3)

**Rumus:** Rata-rata 3 bulan terakhir

| Bulan | MA-3 |
|:------|:----:|
| Mar | 141 |
| Apr | 127 |
| Mei | 119 |
| Jun | **128** |
| **Jul (prediksi)** | **128** |

### 3. Weighted Moving Average (WMA-3)

**Rumus:** `(3×bulan_terakhir + 2×bulan_kedua + 1×bulan_ketiga) ÷ 6`

**Bobot:** Paling baru = paling berat (3:2:1)

**Prediksi Juli:** `(3×156 + 2×106 + 1×122) ÷ 6 = **134**`

### Perbandingan Prediksi Juli 2026

| Metode | Prediksi | Karakteristik |
|:-------|:--------:|:--------------|
| Linear Regression | **123** | Terus turun, kurang sensitif |
| MA-3 | **128** | Stabil, lagging indicator |
| WMA-3 | **134** | Responsif ke spike terakhir |

---

## Evaluasi Dashboard Saat Ini

### Yang Jalan Baik ✅
- `isCountableFinding()` filter tepat — hanya hitung temuan meaningful
- Linear regression sebagai *baseline* sederhana
- Confidence level dengan penalti (error > 40% → downgrade)

### Yang Bisa Ditingkatkan 🔧
1. **Error bounds** — tampilkan rentang prediksi (± error), bukan cuma nilai tunggal
2. **Anomaly flagging** — deteksi otomatis lonjakan/drop signifikan
3. **MA line** — tampilkan MA-3 sebagai secondary line di chart
4. **R² display** — kasih indikator seberapa bisa diandalkan model
5. **Metode adaptif** — pilih regresi atau MA berdasarkan pola data

### Catatan untuk Developer
- `isCountableFinding()` ada di `shared-constants.ts`
- `calculateLinearForecast()` ada di `dashboard-forecast.ts`
- `periodMetrics.total` = hasil filter `isCountableFinding()`
- Data points ≥ 8 untuk confidence "high"
- Slope dihitung dari `n * sumXY - sumX * sumY / (n * sumXX - sumX²)`

---

## Rekomendasi ke Depan

1. **Jangan ganti regresi linear sepenuhnya** — cukup untuk early warning
2. **Tambahkan MA-3 sebagai pembanding** — murah komputasi, mudah dipahami
3. **Lanjutkan collect data** — makin banyak titik, makin akurat
4. **Evaluasi ulang setelah data ≥ 12 bulan** — baru bisa liat seasonal pattern
5. **Kalau mau lebih advanced:** pertimbangkan Exponential Smoothing atau ARIMA untuk data dengan musiman

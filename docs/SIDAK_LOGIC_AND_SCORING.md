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
- Pada `/sidak/forecast`, chip parameter menambah opsi fokus satu atau beberapa
  parameter tanpa mengubah snapshot. Saat total temuan aktif, halaman menjaga
  chart tetap ringkas dengan maksimal 2 seri terlihat; mematikan total memberi
  ruang untuk membandingkan dua parameter sekaligus.

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

## Forecast Agent Submodule

Submodul baru `/sidak/forecast` memakai service forecast dashboard yang sama untuk bagian layanan, lalu menambahkan forecast agent deterministic untuk prioritas coaching.

### Arsitektur

1. **Service Reuse**: Page tetap memanggil `POST /api/v1/sidak/dashboard/forecast` untuk trend layanan dan snapshot cache `missing/fresh/stale`.
2. **Deterministic Agent Forecast**: Endpoint `POST /api/v1/sidak/forecast/agents` menghitung proyeksi skor, temuan, dan critical findings per agent dengan regresi linear.
3. **Klasifikasi Lane**:
   - `improving`: skor naik atau temuan turun, tanpa sinyal buruk dominan.
   - `declining`: skor turun atau temuan naik, terutama bila critical findings ikut naik.
   - `stable`: sinyal campuran atau perubahan tidak signifikan.
   - `insufficient_data`: kurang dari 2 periode historis.
4. **Scope Guard**: Leader harus lolos `getAccessibleAgentIds()` dan scope layanan dari `getAccessibleSidakFilters()`; kalau scope kosong, request gagal closed.

### Endpoint

`POST /api/v1/sidak/forecast/agents`

| Parameter       | Type    | Default  | Deskripsi                                          |
| --------------- | ------- | -------- | -------------------------------------------------- |
| `year`          | number  | current  | Tahun filter                                       |
| `serviceType`   | string  | `call`   | Layanan SIDAK yang dianalisis                      |
| `folderIds`     | string[]| `[]`     | Scope folder/batch yang dipilih                    |
| `startMonth`    | number  | `null`   | Batas awal bulan                                    |
| `endMonth`      | number  | `null`   | Batas akhir bulan                                   |
| `horizonMonths` | number  | `3`      | Horizon proyeksi agent (1–6)                        |

### Output

- `improvingAgents[]`
- `decliningAgents[]`
- `stableAgents[]`
- `watchlistAgents[]`
- `summary.totalEligible`
- `summary.improvingCount`
- `summary.decliningCount`
- `summary.latestPeriodLabel`

### UI Notes

- Service chart harus menjaga token warna aplikasi dan tidak hardcode hex.
- State membaik/memburuk wajib punya label, ikon, dan delta, bukan warna saja.
- Filter berubah harus menghapus hasil lama sebelum lookup baru berjalan agar data lama tidak tampak seperti hasil baru.

## Catatan Praktis

- `weighted`, `flat`, dan `no_category` punya rumus dasar yang berbeda pada level sesi.
- Snapshot rule version harus dipakai untuk periode yang sudah dipublish agar skor historis tidak berubah.
- Jika data temuan real dan phantom bercampur dalam sesi yang sama, hitungan skor dan defect harus mengikuti row real saja.
- Gunakan `docs/SIDAK_SCORING_GUARDRAILS.md` untuk perubahan yang menyentuh scoring atau agregasi SIDAK.
- **Tampilan UI**: Halaman input (`/sidak/input`) memakai grid responsif untuk pilihan folder, agen, periode, dan daftar temuan. Di mobile grid kembali menjadi satu kolom agar tetap mudah dibaca; di layar lebih lebar trainer bisa melihat lebih banyak pilihan atau sesi dalam satu viewport.

## Agent Detail Score Source

Skor bulanan halaman agent detail (`GET /sidak/agents/:id`) dihitung dari `qa_temuan` melalui scoring engine aplikasi dengan `PeriodScoringContext` yang spesifik per periode. Tabel `qa_dashboard_agent_period_summary` tidak digunakan sebagai sumber skor agent detail karena row history dapat berisi placeholder hasil migration refresh yang tidak setara dengan formula aplikasi.

Lihat `apps/api/src/services/sidak/period-scoring-context.ts` untuk implementasi canonical rule/indicator/weight resolver.

## Agent Detail Root Cause Diagnosis

Halaman `/sidak/agents/$id` menampilkan diagnosis akar masalah berbasis aturan dari data temuan SIDAK. Proses ini **tidak memakai AI** dan tidak mengubah skor. Backend mengelompokkan temuan dari `ketidaksesuaian` dan `sebaiknya` ke registry klaster yang terurut berdasarkan prioritas bisnis.

### Klaster

1. `salah_nama_perusahaan_produk` (prioritas 10)
2. `kelebihan_standar_jawaban` (prioritas 9)
3. `salah_penggunaan_sistem` (prioritas 9) — ditambahkan Phase 3 untuk error sistem/APPK
4. `salah_jawaban` (prioritas 8)
5. `kurang_teliti_verifikasi_data` (prioritas 7)
6. `kurang_paham_standar_jawaban` (prioritas 6)
7. `kurang_menggali` (prioritas 5)
8. `lainnya` (prioritas 0 — fallback)

### Aturan

- Temuan `is_phantom_padding=true` tidak dipakai untuk diagnosis.
- Temuan `nilai` 0–3 dipakai selama memiliki evidence teks (`ketidaksesuaian`, `sebaiknya`).
- `nilai = 3` (rekomendasi) tetap dipertimbangkan untuk diagnosis coaching.
- Jika satu temuan cocok beberapa keyword, sistem memilih klaster dengan prioritas tertinggi.
- Jika tidak ada keyword yang cocok, temuan masuk ke `lainnya`.
- Klaster diurutkan berdasarkan prioritas, jumlah temuan, jumlah critical, dan jumlah tiket.
- Evidence teks diambil dari `ketidaksesuaian`, lalu `sebaiknya`, lalu fallback ke nama parameter.

### Coverage Target

- Root cause clustering bersifat **deterministic** (rule-based), bukan formula skor.
- Persentase `lainnya` adalah target **operasional coverage** — bukan metrik kualitas AI.
- Target coverage: **lainnya < 20%** dari temuan countable dengan evidence.
- Audit coverage dilakukan via `scripts/sidak/audit-root-cause-coverage.mjs` terhadap data real `qa_temuan`.
- Baseline (sebelum ekspansi): 84.5% fallback.
- Setelah ekspansi keyword Phase 2: ~47% fallback.
- Setelah cluster baru `salah_penggunaan_sistem` (Phase 3): ~31% fallback.
- Final setelah semua ekspansi: **17.49% fallback** — target tercapai.

### Ekspansi Registry (Phase 2)

Keyword registry diperluas berdasarkan bukti audit fallback, bukan tebakan. Penambahan terbaru:

**`salah_jawaban`:** `tidak sesuai dalam memilih`, `tidak sesuai memilih`, `salah memilih`, `tidak sesuai dalam memberikan`, `tidak sesuai dalam menuliskan`, `tidak sesuai menuliskan`, `tidak sesuai dalam menyampaikan`, `tidak sesuai dalam melakukan`, `salah menulis`, `tidak memberikan jawaban`, `belum memperbaiki`.

**`kurang_teliti_verifikasi_data`:** `tidak sesuai mencatat`, `tidak mencatat`, `tidak menuliskan`, `tidak melampirkan`.

**`kurang_menggali`:** `tidak menanyakan`, `tidak melakukan probing`.

### Batasan AI

- AI tidak dipanggil di request path `GET /sidak/agents/:id` atau `deriveAgentRootCauses()`.
- AI suggestion, jika ditambahkan nanti, hanya dipakai untuk batch/offline analysis dan menghasilkan rekomendasi yang ditinjau manual.
- Feature flag: `SIDAK_ROOT_CAUSE_AI_SUGGESTIONS=true` (default: disabled).

### Arsitektur

| Lapisan | File | Tanggung Jawab |
|---------|------|----------------|
| Tipe | `packages/types/src/sidak.ts` | `RootCauseResult`, `RootCauseEvidence`, `RootCausePeriodBreakdown` |
| Service | `apps/api/src/services/sidak/agent-root-causes.ts` | Registry, matching, grouping, sorting |
| Integrasi | `apps/api/src/services/sidak/agent-directory.ts` | Panggil `deriveAgentRootCauses()` di `getAgentDetail()` |
| Hook | `apps/web/src/hooks/useAgentDetail.ts` | Filter `activeRootCauses` per bulan/layanan aktif |
| Komponen (container) | `apps/web/src/components/sidak/AgentAuditDossier.tsx` | Full-width audit dossier: score strip + ticket impact + root-cause coaching; membungkus `RootCauseCard` & `TopTicketsCard` yang kini thin presentational blocks (tanpa outer `rounded-2xl bg-surface`) |
| Komponen (thin) | `apps/web/src/components/sidak/RootCauseCard.tsx` | Render utama + secondary causes + empty state (di-embed dalam dossier) |

## BKO Parameter and Weights Resolver

Halaman Input Temuan (`/sidak/input`) menggunakan backend resolver khusus (`GET /resolved-input-config`) untuk memuat konfigurasi parameter aktif dan bobot per `(service_type, period_id)`. Hal ini menjamin parity dengan legacy:

1. **Layanan BKO**: Parameter diselesaikan berdasarkan rule version yang aktif pada periode target. Jika tidak ada versi yang aktif, dropdown parameter akan dinonaktifkan secara eksplisit dan menampilkan peringatan.
2. **Flat List**: Mode scoring BKO adalah `no_category`. Parameter ditampilkan dalam satu daftar datar (tanpa pemisahan kategori Critical/Non-Critical).
3. **Pembersihan State**: Perpindahan layanan di halaman input secara otomatis membersihkan input manual yang sedang berjalan serta data preview Excel untuk mencegah kebocoran parameter antar layanan.

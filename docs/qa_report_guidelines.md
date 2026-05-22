# QA Analyzer Reporting Guidelines — Path to Zero

Dokumen ini adalah rujukan standar untuk AI dalam menghasilkan laporan kualitas di modul SIDAK (QA Analyzer). AI harus menginterpretasikan data secara dinamis mengikuti prinsip-prinsip di bawah ini.

---

## 🎯 Filosofi Utama: Path to Zero

Laporan ini tidak hanya menilai skor akhir, tetapi melacak perjalanan setiap parameter QA menuju angka nol temuan (**Zero Defect**).

- **Fokus Parameter**: Setiap parameter (misal: Verifikasi Data, Empati) dianggap memiliki "nyawa" dan trennya sendiri.
- **Audit Penuh (Full Audit)**: Data yang diolah adalah 100% sampel audit (bukan sampling), sehingga angka temuan adalah absolut dan nyata.
- **Arah Pergerakan (Directional)**: Fokus pada apakah angka temuan:
  - ↓ **Mendekati Zero**: Perbaikan (Improving).
  - ↑ **Menjauhi Zero**: Pemburukan (Worsening).
  - → **Stagnan**: Tidak ada perubahan volume temuan.
- **Alarm Regresi (⚠️ Regression Alert)**: Parameter yang pada periode sebelumnya sudah mencapai Zero, namun pada periode ini muncul temuan baru. Ini adalah prioritas utama untuk dicegah agar tidak menjadi kebiasaan buruk baru.

---

## 🤖 Instruksi untuk AI (Adaptabilitas Data)

AI **DIBERIKAN WEWENANG** untuk memodifikasi laporan berdasarkan kondisi data aktual:

1. **Identifikasi Peristiwa Eksternal**: Jika ada lonjakan temuan pada parameter tertentu yang bertepatan dengan peluncuran produk baru, AI harus menyebutkan korelasi ini.
2. **Cluster Temuan**: Jika temuan menumpuk di tim atau kelompok agen tertentu, AI harus melakukan segmentasi otomatis.
3. **Sustained Mastery**: Jika parameter tertentu sudah Zero selama >3 periode, AI bisa menghilangkannya dari detail analisis dan memindahkannya ke kategori "Sustained Mastery".

---

## 📘 FORMAT 1: Laporan Kualitas Layanan (Service Report)

**Target**: Management & Executive.
**Tujuan**: Monitoring strategi makro.

### 1. Ringkasan Eksekutif

- Visualisasi status (🟢/🟡/🔴) berdasarkan volume temuan.
- Highlight parameter yang "Memburuk" vs "Membaik" secara signifikan.

### 2. Path to Zero Tracker (Dashboard Arah)

Tabel perbandingan per periode yang menunjukkan:

- `Temuan Sekarang` vs `Temuan Lalu`.
- `Selisih (Δ)` dan `Arah (Direction Icon: ↓ ↑ →)`.
- `Status Path to Zero` (Mendekati/Menjauhi/Stagnan).

### 3. Analisis Deep-Dive

- **Zoom-in Worsening**: Analisis penyebab kenaikan temuan pada parameter tertentu.
- **Success Spotlight**: Analisis mengapa parameter tertentu bisa membaik.
- **Pareto Analisis**: Menunjukkan 2-3 parameter penyumbang 80% defect.

### 4. Rekomendasi Strategis

- Rekomendasi tingkat sistem (Training, Update SOP, Perbaikan Produk, Update Tooling).

---

## 📗 FORMAT 2: Laporan Kinerja Individu (Individual Report)

**Target**: Team Leader & Agen.
**Tujuan**: Coaching & Personal Development.

Laporan individu menggunakan format profesional **3 halaman A4** dengan header/footer konsisten dan layout multi-section untuk **Word (.docx) dan Webpage (.html)**.

### Halaman 1 — Cover & Ringkasan Eksekutif

- **Kartu Profil Agen**: Nama, tim, batch, periode, team leader, QA reviewer.
- **4 Score Card**: Nilai Akhir (0–100), Temuan (total), Kepatuhan (%), Zero Error (Ya/Tidak).
- **Executive Summary**: Ringkasan performa yang dihasilkan AI.
- **Radar Chart**: Skor per dimensi (Akurasi, Empati, Kepatuhan, Kecepatan, Komunikasi) skala 0–100.

### Halaman 2 — Analisis Kinerja

- **Trend Chart**: Grafik garis skor bulanan (6 bulan terakhir).
- **Donut Severity**: Distribusi temuan Kritis vs Non-Kritis.
- **Horizontal Bar Chart**: Top 10 parameter temuan terbanyak.
- **Tabel Perbandingan Layanan**: Skor agen vs rata-rata layanan per dimensi.
- **Tabel Recurring Findings**: Temuan berulang (frekuensi >= 2).
- **Insight AI**: Narasi analitis dari AI.

### Halaman 3 — Rekomendasi & Rencana Aksi

- **Kekuatan Utama**: 2–5 bullet poin kekuatan agen.
- **Area Prioritas**: 2–5 item area yang perlu perbaikan.
- **Rekomendasi Coaching**: 2–5 saran coaching.
- **Rencana Aksi 30 Hari**: 4 minggu target spesifik.
- **Checklist Tindak Lanjut**: Tabel item dengan target minggu dan status.
- **Disclaimer**: Konten AI perlu validasi manusia.

---

## 📊 Klasifikasi Temuan (Severity)

- **Critical**: Kesalahan fatal yang berdampak langsung pada operasional atau kepuasan pelanggan utama.
- **Non-Critical**: Kesalahan minor atau administratif.
  _Catatan: Parameter yang menyentuh ranah sistem/system error tidak dihitung sebagai defect pekerjaan._

---

## 💾 Pilihan Format Ekspor & Standar Penamaan File

Modul SIDAK mendukung dua pilihan format ekspor laporan:

1. **Microsoft Word (`.docx`)**: Format dokumen formal standar industri.
2. **Webpage Interaktif (`.html`)**: Format halaman web premium responsif yang **fully self-contained** (merender grafik menggunakan SVG/CSS inline tanpa dependensi eksternal).

Setiap file yang dihasilkan otomatis memiliki nama berkas yang manusiawi:

- **Laporan Layanan**: `Laporan_QA_Layanan_[Service]_[Periode].[docx|html]`
- **Laporan Individu**: `Laporan_QA_Individu_[NamaAgent]_[Periode].[docx|html]`

_Catatan: Spasi otomatis diganti dengan underscore (\_) dan karakter khusus dibersihkan._

---

## Implementasi di Monorepo

- **Backend API**: `/api/v1/ai/` endpoints menangani report generation.
- **Frontend**: `/sidak/reports-ai` untuk AI report generation form.
- **Storage**: Bucket `reports` di Supabase Storage menyimpan file `.docx` dan `.html`.
- **AI Models**: Model selection via `apps/api/src/lib/ai-models.ts`, logged ke `ai_usage_logs`.

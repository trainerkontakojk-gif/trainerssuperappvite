# TNA (Training Needs Analysis) — Fase 6: Dashboard Efektivitas, Ekspor Ringkasan, Pengingat Jatuh Tempo

- **Status:** DISETUJUI rev. 2 (2026-11-07). Fajar memilih K38 "semua sekarang" (dashboard dengan empty state + ekspor + badge), K39 usulan lengkap, K40 HTML siap cetak, K42 badge dalam aplikasi; K41 dan K43 memakai usulan tanpa koreksi. Prasyarat data K38: preflight produksi read-only 2026-11-07 (Fase 5) mencatat **0 rencana TNA**, jadi dashboard produksi kosong sampai ada rencana selesai; pengujian memakai fixture lokal. Lane **C** (tanpa migrasi). T0 **SELESAI** 2026-11-07 (`tna-phase-6-t0-report.md`): S28/S29 aman, ekspor tanpa endpoint baru, badge = panggilan API shell pertama; usulan P-1–P-5 disetujui Fajar 2026-11-07 ("Okee"). T1 **SELESAI** 2026-11-07 (`tna-phase-6-t1-report.md`): `GET /tna/effectiveness` dan `GET /tna/plans/due-count` (menggantikan `count_only` di D29 agar tipe `GET /plans` tidak menjadi union); RED → GREEN 5/5, regresi API TNA **115/115**. Berikutnya T2.
- **Tanggal rencana:** 2026-11-04.
- **Baseline saat perencanaan:** `1b366ee9` (`main`). Mulai dari `main` terbaru di branch baru, mis. `feat/tna-phase-6`.
- **Fondasi:** Fase 1–2 wajib. Fase 3 (progres latihan) dan Fase 5 (`program_snapshot`) memperkaya dashboard bila sudah ada, tetapi tidak wajib.
- **Executor:** Codex atau agent lain, satu task per sesi.
- **Risk lane:** **Lane C** bila tanpa migrasi (agregasi baca + UI + ekspor); naik ke **Lane D** bila K42 memilih pengingat tersimpan atau email.

## 0. Wajib dibaca executor sebelum mulai

1. `AGENTS.md` → `docs/AGENT_WORKFLOW.md`; skill `trainers-superapp-tdd`, `ui-ux-pro-max`/`impeccable` (T3), `thermo-nuclear` (T5); skill `dataviz` sebelum membuat grafik. Bukan `superpowers:*`.
2. Fase 2 D11–D14 (snapshot evaluasi, verdict K14, tindak lanjut K15, bagian "Perlu dievaluasi").
3. `apps/web/src/routes/tna/efek-export.ts` dan `efek.tsx` (pola ekspor HTML siap cetak dan laporan EFEK yang sudah ada).
4. `docs/modules.md` §8–§9 dan bagian EFEK.

## Requirement

### Konteks bisnis

Setelah beberapa rencana `selesai`, tim training perlu menjawab: **program mana yang paling sering mencapai target**, untuk gap type dan layanan apa, dan berapa lama rata-rata siklusnya. Trainer juga perlu **mengekspor** Ringkasan TNA + Ringkasan Evaluasi untuk dilaporkan, dan **diingatkan** saat rencana jatuh tempo evaluasi.

### Fakta kode yang membentuk rencana ini

- Rencana `selesai` menyimpan `evaluation_snapshot`, `verdict`, `follow_up`, `completed_at` yang beku (Fase 2). Agregasi tidak perlu menghitung ulang SIDAK.
- `/tna` sudah menampilkan bagian **Perlu dievaluasi** (`GET /tna/plans?due=1`). Belum ada notifikasi atau email di repo (tidak ada tabel atau layanan notifikasi).
- EFEK (`efek_sessions`) adalah alur terpisah yang mengukur efek kelas per program simulasi dengan skor QA sebelum/sesudah. EFEK sudah punya ekspor HTML siap cetak.
- Narasi TNA dan evaluasi sudah deterministik di `narrative.ts`.

## 1. Keputusan (disetujui Fajar 2026-11-07)

| #   | Aspek                 | Usulan (rekomendasi)                                                                                                                                                                                                                                                                                                             | Alternatif                                                                                     | Status                                                                                            |
| --- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| K38 | Kapan dikerjakan      | Jalankan query **read-only** jumlah rencana per status di produksi (butuh izin Fajar). Kerjakan dashboard bila sudah ada **≥ 5 rencana `selesai`**; sebelum itu kerjakan ekspor (K40) dan pengingat (K42) saja.                                                                                                                  | Kerjakan semua sekarang dengan empty state.                                                    | **Disetujui: alternatif** — semua sekarang dengan empty state (produksi 0 rencana per 2026-11-07) |
| K39 | Isi dashboard         | Per program, gap type, dan layanan: jumlah rencana selesai, distribusi verdict (tercapai/sebagian/tidak), median penurunan tingkat per 100 sesi (baseline beku → evaluasi beku), distribusi tindak lanjut, median durasi aktivasi → selesai. Filter rentang `completed_at`. Grup dengan < 3 rencana diberi label "Data sedikit". | Tambah peringkat program; atau hanya tabel tanpa grafik.                                       | **Disetujui: usulan**                                                                             |
| K40 | Ekspor                | **HTML siap cetak** per rencana (Ringkasan TNA + target + Ringkasan Evaluasi + tabel peserta), memakai pola `efek-export.ts`, dibuat di klien dari respons API yang sudah ada. Tidak ada PDF/DOCX server.                                                                                                                        | PDF server-side; DOCX.                                                                         | **Disetujui: usulan**                                                                             |
| K41 | Hubungan dengan EFEK  | Dashboard **hanya** rencana TNA. EFEK tetap laporan terpisah; dashboard menautkan ke EFEK dengan penjelasan satu kalimat bedanya.                                                                                                                                                                                                | Gabungkan EFEK dan TNA dalam satu dashboard (metrik dan unit berbeda; berisiko membingungkan). | **Disetujui: usulan**                                                                             |
| K42 | Pengingat jatuh tempo | **Dalam aplikasi saja**: badge jumlah rencana jatuh tempo di entri TNA (rail/drawer), dihitung dari `GET /tna/plans?due=1`. Tanpa tabel baru, tanpa email.                                                                                                                                                                       | Email harian ke pembuat rencana (butuh layanan email, worker terjadwal, preferensi).           | **Disetujui: usulan**                                                                             |
| K43 | Akses                 | Dashboard dan ekspor memakai `tna.read` (admin + trainer). Fase 4 dibatalkan 2026-11-07: leader tidak punya akses TNA.                                                                                                                                                                                                           | Leader melihat dashboard terbatas pada rencana timnya.                                         | **Disetujui: usulan**                                                                             |

### Hasil Fase 6

1. Tab **Efektivitas** di `/tna` dengan ringkasan K39, filter rentang waktu, dan tautan ke daftar rencana di balik setiap angka.
2. Tombol **Ekspor ringkasan** di detail rencana `aktif`/`evaluasi`/`selesai`.
3. Badge jatuh tempo di entri TNA.

### Di luar cakupan Fase 6

Email/push, PDF/DOCX server, narasi AI, penggabungan EFEK, prediksi keberhasilan, dashboard untuk leader/agent.

## 2. Desain

### D28. Agregasi (`apps/api/src/services/tna/effectiveness.ts`)

- Sumber: hanya rencana `selesai` (snapshot beku) dibaca dengan JWT pengguna/RLS, paginasi penuh. Tidak menghitung ulang SIDAK dan tidak memakai service-role.
- Penurunan tingkat = `baseline_snapshot.ratePer100 − evaluation_snapshot.population.ratePer100` (nama field persis diverifikasi di T0); `null` bila salah satu `null`. Median, bukan rata-rata.
- Pengelompokan program memakai `program_snapshot` bila ada (Fase 5), selain itu program live.
- Fungsi murni, deterministik; urutan grup stabil (jumlah rencana desc, lalu nama).

### D29. API

| Method & path                                                        | Kapabilitas | Isi                                                           |
| -------------------------------------------------------------------- | ----------- | ------------------------------------------------------------- |
| `GET /tna/effectiveness?from&to&group_by=program\|gap_type\|service` | `tna.read`  | Grup K39 + `total_completed` + `thin` per grup.               |
| `GET /tna/plans?due=1&count_only=1`                                  | `tna.read`  | Perluasan: `{ count }` untuk badge K42 (murah, tanpa detail). |

Ekspor K40 tidak butuh endpoint baru; T0 memastikan `GET /tna/plans/:id` sudah membawa semua field yang dibutuhkan.

### D30. Antarmuka

- Tab **Efektivitas**: kartu ringkas (rencana selesai, % tercapai penuh, median penurunan), lalu tabel grup dengan bar verdict bertumpuk. Grafik mengikuti skill `dataviz` (palet aksesibel, terang/gelap). Mobile: kartu per grup.
- Empty state: "Belum ada rencana selesai. Dashboard terisi setelah evaluasi pertama diselesaikan."
- Ekspor: halaman cetak dengan kop modul, tanggal ekspor WIB, semua angka dengan format Indonesia, catatan "indikatif, bukan bukti sebab-akibat".
- Badge: angka kecil di entri TNA, `aria-label` "{n} rencana perlu dievaluasi"; disembunyikan bila 0 atau gagal dimuat (tidak menampilkan error di nav).

## 3. Task

| Task | Isi                                                                                                                                                                                           | Bukti selesai                                            |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| T0   | **Discovery read-only**: nama field snapshot evaluasi, kelengkapan respons detail untuk ekspor, titik pasang badge di nav. Dengan izin Fajar, query produksi jumlah rencana per status (K38). | `plans/markdown/tna-phase-6-t0-report.md`.               |
| T1   | **Agregasi + API** (D28, D29). RED-first real backend dengan fixture rencana selesai berbagai verdict, metrik `null`, grup tipis, filter tanggal; leader/agent 403.                           | GREEN; angka cocok dengan perhitungan manual di laporan. |
| T2   | **Ekspor** (K40). RED-first spec browser hermetic: konten ekspor untuk rencana aktif dan selesai, tanpa field kosong "undefined".                                                             | GREEN.                                                   |
| T3   | **UI dashboard + badge** (D30) dengan `ui-ux-pro-max`/`impeccable`/`dataviz`. Spec browser: dashboard terisi, empty state, gagal + Coba lagi, badge 0/n, desktop + mobile, terang + gelap.    | GREEN; screenshot.                                       |
| T4   | (Hanya bila K42 memilih email) rencana terpisah Lane D. Jangan dikerjakan di Fase 6 ini.                                                                                                      | —                                                        |
| T5   | **Review & dokumentasi**: `thermo-nuclear`, sinkron `docs/modules.md`, gate serial, `graphify update .`.                                                                                      | `plans/markdown/tna-phase-6-t5-report.md`.               |

## 4. Strategi E2E

Real backend loopback untuk agregasi, hermetic browser untuk ekspor/dashboard/badge, satu runner pada satu waktu. Tidak ada unit test baru tanpa izin Fajar.

## 5. Rilis

Tanpa migrasi (bila K42 = dalam aplikasi). Deploy API + web biasa. Query produksi K38 hanya dengan izin Fajar.

## 6. STOP conditions (berhenti dan tanya Fajar)

- **S28:** Snapshot evaluasi tidak memuat angka yang dibutuhkan K39 tanpa menghitung ulang SIDAK.
- **S29:** Agregasi butuh service-role atau membaca data di luar `tna_*`.
- **S30:** Muncul kebutuhan email, worker terjadwal, AI, atau penggabungan EFEK.
- STOP Fase 1–2 tetap berlaku.

# TNA Fase 6 — Laporan T0 (discovery read-only)

- **Tanggal:** 2026-11-07. Baseline `78bc2f1a` (`main`).
- **Rencana:** [`tna-phase-6.md`](tna-phase-6.md) rev. 2 (K38 semua sekarang, K39 usulan lengkap, K40 HTML siap cetak, K41 hanya TNA, K42 badge dalam aplikasi, K43 `tna.read`).
- **Cara:** pembacaan kode dan skema di repo. Tidak ada query produksi baru: jumlah rencana produksi sudah diketahui dari preflight Fase 5 hari ini (**0 rencana TNA**), dan K38 sudah diputuskan tanpa menunggu data.

## Temuan

### 1. Angka K39 tersedia dari snapshot beku (S28 aman)

| Angka K39        | Sumber                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| Tingkat baseline | `tna_plans.baseline_snapshot.ratePer100` (dibekukan saat aktivasi; aktivasi menolak tanpa audit) |
| Tingkat evaluasi | `tna_plans.evaluation_snapshot.population.ratePer100` (dibekukan saat selesai)                   |
| Verdict          | `tna_plans.verdict` (juga `evaluation_snapshot.verdict`)                                         |
| Tindak lanjut    | `tna_plans.follow_up`                                                                            |
| Durasi           | `activated_at` → `completed_at`                                                                  |
| Program          | `program_snapshot` (Fase 5), selain itu baris katalog                                            |
| Gap type         | `tna_needs.gap_type` (divalidasi trainer) atau `tna_programs.gap_type` — lihat P-1               |
| Layanan          | `tna_needs.service_type` (sama dengan `baseline_snapshot.serviceType`)                           |

Kedua tingkat bertipe `nullable`, jadi penurunan tetap dihitung `null` bila salah satu `null`. SIDAK tidak dihitung ulang.

### 2. Agregasi cukup dengan JWT pengguna (S29 aman)

`tna_plans`, `tna_needs`, dan `tna_programs` punya RLS SELECT `is_admin_or_trainer()`. Semua angka ada di tabel `tna_*`; tidak perlu service-role atau tabel SIDAK.

### 3. Ekspor tidak butuh endpoint baru

`GET /tna/plans/:id` sudah membawa semua bagian ekspor K40:

- `plan`: judul, intervensi, jadwal, target tingkat/sebaran, kesimpulan, tindak lanjut;
- `program`: nama snapshot atau katalog;
- `narrative`: Ringkasan TNA, yang memuat klaster tervalidasi dan catatan penyebab;
- `evaluation_narrative` dan `evaluation`: Ringkasan Evaluasi beserta kohort;
- `participants` dan `participant_evaluation`: tabel peserta;
- `practice`: progres latihan simulasi;
- `plan.baseline_snapshot.parameterName` dan `serviceType`: kop parameter.

Pola `efek-export.ts` (`esc` untuk setiap nilai, `STYLE` inline, unduh satu file HTML) bisa dipakai ulang. `esc` saat ini privat di file itu.

### 4. Badge adalah panggilan API pertama di shell

- `Layout.tsx`, `Sidebar`, `MobileDrawer`, `MobileTabBar`, dan `NavList` saat ini **tidak memanggil API sama sekali**. Badge K42 menjadi permintaan shell pertama.
- **Tempat badge:**
  - `NavList` → `NavItemContent`, dipakai sidebar/rail dan drawer;
  - `MobileTabBar`, karena TNA adalah tab utama ponsel untuk admin dan trainer (`MOBILE_TAB_IDS`).
- `tnaPlansQuerySchema` tidak strict, jadi `count_only=1` saat ini diabaikan diam-diam dan respons tetap daftar penuh. Perluasan D29 aman untuk klien lama.

### 5. Dampak ke harness E2E browser (penting)

Permintaan baru di shell untuk admin dan trainer akan tercatat sebagai `/api` tak dimock di setiap guard egress yang membuka halaman sebagai admin atau trainer:

- `helpers/hermeticShell.ts`, dipakai mayoritas spec hermetic;
- enam harness SIDAK dengan guard sendiri: `sidakAgentDetailDatesHarness`, `sidakPeriodsHarness`, `sidakAgentReportFixture`, `sidakTemuanDatesHarness`, `sidakSettingsHarness`, `sidakJadwalShiftingHarness`;
- sekitar sepuluh spec dengan guard inline, antara lain `sidak-agent-detail-*`, `sidak-agent-heatmap`, `sidak-agent-efek-training`, `sidak-heatmap-browser-integration`, `sidak-agent-report-download`, `sidak-temuan-dates`, dan `sidak-reports-data`.

UI badge tetap aman bila permintaannya gagal, karena D30 menyembunyikan badge. Yang gagal adalah asersi "tidak ada `/api` yang di-abort" di spec-spec tersebut.

## Usulan (butuh persetujuan Fajar)

- **P-1 — Gap type dari kebutuhan.** Kelompokkan "gap type" memakai `tna_needs.gap_type`, yaitu gap yang divalidasi trainer untuk kasus itu, bukan gap bawaan program. Program dan layanan tetap dari rencana dan kebutuhan.
- **P-2 — Angka menaut ke rencana.** Respons `GET /tna/effectiveness` membawa daftar ringkas rencana per grup (`id`, judul, verdict, `completed_at`). UI menampilkannya sebagai daftar yang bisa dibuka di bawah setiap grup, dengan tautan ke `/tna/rencana/$id`. Tidak perlu filter baru di `GET /tna/plans`.
- **P-3 — Nama tab "Hasil rencana".** Label "Efektivitas" mudah tertukar dengan tab **EFEK** yang bersebelahan. Usul label tab **Hasil rencana** di `/tna/hasil`, disertai satu kalimat yang membedakannya dari EFEK (K41). Isinya tetap dashboard K39.
- **P-4 — Kapan badge dimuat.** `Layout` memuat `GET /tna/plans?due=1&count_only=1` hanya untuk peran dengan `tna.read`:
  - saat shell dibuka;
  - setiap kali pengguna masuk ke halaman `/tna…`, karena di sanalah status rencana berubah.

  Tanpa polling berkala. Badge disembunyikan bila jumlahnya 0 atau permintaan gagal.

- **P-5 — Satu mock bersama di harness.** Tambahkan helper `tnaDueCountMock` (default `{ count: 0 }`) di `e2e/helpers` dan daftarkan sebagai mock default di `hermeticShell` dan setiap guard yang tercantum di §5. Perubahan ini hanya di kode tes, sekitar 17 file, dan tidak mengubah asersi yang ada. Karena menyentuh banyak spec, T3 menjalankan seluruh suite browser hermetic satu kali, serial, sebagai bukti tidak ada regresi.

## Rencana task (tidak berubah kecuali usulan di atas)

T1 agregasi + API (real backend), T2 ekspor (hermetic), T3 UI dashboard + badge + mock bersama (hermetic, `ui-ux-pro-max`/`impeccable`/`dataviz`), T5 review dan docs. Tanpa migrasi; Lane C.

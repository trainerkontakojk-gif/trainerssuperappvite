# Phase 218 — SIDAK Mix Phantom Repair

**Date**: 2026-09-17
**Status**: IMPLEMENTED

## Ringkasan

Memperbaiki histori clean session pada detail agent dan mencegah agent dari
tim Mix tersimpan ke layanan CSO hanya karena default mapping.

## Root cause

- `tim = Mix` sebelumnya otomatis dipetakan menjadi `service_type = cso` pada
  halaman input.
- Margiyati memiliki 55 row phantom CSO pada periode 08/2026, tetapi tidak
  memiliki temuan CSO riil.
- Data Pencatatan Margiyati memiliki row riil pada Juni, Juli, dan September,
  tetapi tidak memiliki clean session Pencatatan pada Agustus.
- Endpoint detail menyembunyikan phantom dari koleksi `temuan`, sehingga tidak
  ada representasi UI yang dapat menampilkan clean session secara eksplisit.

## Implementasi kode

- Agent dari tim Mix sekarang masuk ke pemilihan layanan eksplisit sebelum
  periode dapat dipilih.
- `AgentDetailData` menambahkan koleksi `phantomSessions` terpisah dari
  `temuan`.
- Detail agent mengelompokkan phantom per periode dan nomor sesi lalu
  menampilkan kartu **Sesi tanpa temuan** dengan skor 100.
- Phantom tidak memiliki aksi edit/hapus dan tidak menambah jumlah temuan.
- Service selector detail tetap menampilkan service yang hanya memiliki phantom.
- Regression tests ditambahkan untuk API detail, hook, input Mix, dan komponen
  detail.

## Repair data

- Batch phantom CSO yang salah untuk agent terdampak dan periode 08/2026:
  **55 row dihapus**.
- Batch phantom Pencatatan baru:
  **35 row dibuat** dari 5 sesi × 7 indikator Pencatatan aktif.
- Read-back memverifikasi:
  - service `pencatatan`;
  - periode 08/2026;
  - `is_phantom_padding = true`;
  - `nilai = 3`;
  - catatan ketidaksesuaian/rekomendasi kosong;
  - 5 sesi phantom;
  - batch CSO lama tersisa 0 row.

## Verification data aktual

`getAgentDetail(agent, 2026, pencatatan, 1–9)` menghasilkan:

- Juni: skor 99,07; 1 sesi; 1 temuan
- Juli: skor 92,20; 6 sesi; 6 temuan
- Agustus: skor 100; 5 sesi; 0 temuan
- September: skor 99,53; 1 sesi; 1 temuan
- `temuan`: 40 row riil
- `phantomSessions`: 35 row / 5 sesi

Forecast service-level juga memverifikasi:

- Margiyati **tidak lagi muncul pada CSO**.
- Margiyati muncul pada **Pencatatan** dengan 4 titik historis.

## Verification kode

- API focused tests: **55 passed**
- Web focused tests: **19 passed**
- TypeScript web/API/types: **PASS**
- Web production build: **PASS**
- API build: **PASS**
- Lint: **0 errors**; warning existing/non-blocking tetap tercatat oleh runner.

# SIDAK Mix Phantom Repair

## Requirement

- Margiyati Chasanah harus memiliki histori Pencatatan 08/2026 sebagai sesi
  tanpa temuan dengan skor 100.
- Batch phantom CSO Margiyati 08/2026 tidak boleh tetap mengklasifikasikan
  Margiyati sebagai CSO apabila konteks audit yang disetujui adalah Pencatatan.
- Sesi phantom harus tetap tersedia sebagai histori, tetapi tidak diperlakukan
  sebagai temuan yang dapat diedit/dihapus.
- Pemilihan layanan untuk agent `tim=Mix` harus eksplisit agar default CSO tidak
  terulang.
- Perbaikan data production harus read-back diverifikasi dan tidak boleh
  memindahkan indicator CSO ke Pencatatan karena kedua service memiliki
  indikator berbeda.

## Design

- **Input UI**: agent Mix masuk ke langkah pemilihan layanan secara eksplisit;
  agent dengan tim non-Mix tetap memakai mapping layanan yang ada. Semua request
  konfigurasi, periode, dan save memakai service yang dipilih.
- **Agent detail API**: pertahankan `periodSummaries` sebagai sumber histori,
  tambahkan `phantomSessions` terpisah dari `temuan` agar phantom dapat
  ditampilkan sebagai sesi tanpa temuan tanpa membuka edit/delete.
- **Agent detail UI**: tampilkan phantom sebagai blok `Sesi tanpa temuan` per
  bulan/tiket, dengan skor 100 dan jumlah parameter, bukan sebagai baris temuan.
  Service selector juga mempertimbangkan service yang hanya memiliki phantom.
- **Data repair**: buat batch baru 5 × indikator aktif Pencatatan untuk agent,
  periode 08/2026, dan hapus batch phantom CSO yang salah hanya setelah insert
  serta read-back batch baru terverifikasi. Gunakan exact agent, period, service,
  dan `phantom_batch_id` sebagai guard.
- **Regression**: tambah test backend untuk mengembalikan phantom terpisah dan
  test web untuk service Mix yang tidak auto-CSO serta render sesi tanpa temuan.

## Tasklist

- [x] Tambah RED tests untuk API detail, hook/UI phantom, dan input Mix.
- [x] Implementasikan kontrak `phantomSessions` dan explicit service Mix.
- [x] Jalankan GREEN focused tests, typecheck, lint, build.
- [x] Repair data Margiyati secara guarded read/insert/verify/delete/verify.
- [x] Verifikasi ulang `/sidak/agents/:id` dan Forecast dengan data production.
- [x] Perbarui dokumentasi, commit, dan push.

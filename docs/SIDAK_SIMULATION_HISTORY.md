# SIDAK Agent Simulation History

`/sidak/agents/:id` menampilkan quick list riwayat simulasi yang secara eksplisit tertaut ke `profiler_peserta.id` pada tiga tabel history canonical: `ketik_history`, `pdkt_history`, dan `telefun_history`.

## API contract

Semua endpoint berada di bawah `/api/v1/sidak` dan memakai Hono RPC dengan transport autentikasi aplikasi.

### List

`GET /agents/:id/simulations?module=all&cursor=<opaque>` mengembalikan:

```json
{
  "success": true,
  "data": {
    "items": [],
    "nextCursor": null
  }
}
```

`module` menerima `all`, `ketik`, `pdkt`, atau `telefun`. Setiap respons memuat paling banyak lima item. Urutan global adalah `occurredAt` terbaru, nama modul ascending, lalu ID sesi ascending. Cursor membawa ketiga nilai tie-break sehingga sesi dengan waktu sama tidak hilang atau berulang.

Ringkasan memuat judul skenario, waktu sesi, durasi, skor nullable, skala (`100` untuk KETIK/PDKT dan `10` untuk Telefun), status review, snapshot participant, dan actor `user_id` beserta proyeksi email/role. Query hanya memilih kolom metadata yang dibutuhkan untuk list; transcript dan hasil review lengkap tidak diambil.

### Detail

`GET /agents/:id/simulations/:module/:historyId` hanya membaca sesi jika ID sesi pada modul tersebut memiliki `simulation_subject_type = 'participant'` dan `simulation_subject_peserta_id = :id`. Pemeriksaan ini dilakukan sebelum transcript, review, coaching, atau storage signing dibaca.

Detail memakai normalizer dan renderer review Monitoring yang sama untuk KETIK, PDKT, dan Telefun. Membuka detail tidak menjalankan AI atau evaluasi ulang. Error sumber data mengembalikan error ramah dan tidak membuat daftar parsial.

## Access

Admin dan trainer dapat membaca semua modul untuk agent yang diminta dan dapat menerima signed URL rekaman Telefun setelah path lolos validasi owner + session ID. Leader harus memiliki scope SIDAK yang berhasil dibaca dan agent harus ada di daftar agent pada scope tersebut.

Mapping service scope leader:

| SIDAK service | Modul simulasi |
| --- | --- |
| `chat` | KETIK |
| `email` | PDKT |
| `call` | Telefun |

`module=all` hanya mengembalikan modul yang dipetakan dari scope leader. Detail modul di luar scope ditolak sebelum history dibaca. Leader dengan `call` yang disetujui dapat menerima signed URL Telefun; TTL tetap 3.600 detik. URL yang sudah diterbitkan tetap berlaku sampai kedaluwarsa setelah approval dicabut, tetapi penerbitan URL baru dihentikan.

Sesi `self`, legacy tanpa atribusi, participant yang FK-nya sudah `NULL`, dan history dari tabel `results` tidak masuk quick list ini. Snapshot nama/batch/tim tetap dipakai untuk tampilan ketika peserta berganti nama atau dipindahkan.

## Frontend behavior

Quick list berada paling bawah halaman detail agent, setelah seluruh konten audit SIDAK. List memiliki filter modul dan pemuatan lima item berikutnya. Filter tahun, bulan, dan layanan audit tidak memengaruhi query ini. Popup memakai `ReviewDetailModal` dan panel Monitoring bersama, dengan transcript yang bergulir, focus trap, Escape, pengembalian fokus, skeleton, empty state, retry, dan layout vertikal pada layar kecil. Hook membatalkan request lama serta memberi setiap agent/filter generation token agar respons lama tidak ditampilkan pada konteks baru.

Fitur ini tidak menambah migration, backfill, perubahan rumus skor, atau kolom ekspor SIDAK. Migration atribusi `20260910000000_simulation_subject_attribution.sql` harus sudah diterapkan dan schema cache PostgREST harus memuat kolom atribusi sebelum rollout.

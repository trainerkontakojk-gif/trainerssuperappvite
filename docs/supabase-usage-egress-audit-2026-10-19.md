# Audit historis Supabase — Usage, Egress, dan Traffic Produksi

- **Tanggal audit:** 2026-10-19 (WIB)
- **Auditor asli:** Hermes, atas permintaan Fajar
- **Scope:** verifikasi laporan pihak ketiga mengenai egress Supabase produksi Trainers SuperApp.
- **Sifat audit yang dilaporkan:** operasi baca; tidak ada perubahan kode, mutasi data, atau migrasi produksi.
- **Penyuntingan arsip:** 2026-10-20, dokumentasi saja; tanpa akses ulang ke produksi.

> Ini adalah catatan historis, bukan status sistem terkini. Angka remote berikut berasal dari laporan auditor asli dan belum diverifikasi ulang dalam penyuntingan arsip. Identitas akun/proyek dan lokasi kredensial disamarkan. Skrip serta output mentah tidak disertakan, sehingga angka belum dapat direproduksi secara independen dari repo ini.
>
> Saat audit dilaksanakan belum ada fix. Namun, `CHANGELOG.md` tanggal 19 Oktober sudah mencatat perbaikan unduhan rekaman dan guard dev terhadap DB produksi. Bandingkan rekomendasi dengan implementasi terkini sebelum menindaklanjutinya.

## 1. Ringkasan dan batas kesimpulan

| Klaim                                                                                  | Penilaian arsip                                                              | Batas bukti                                                                                    |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Mesin lain mengakses produksi memakai service-role                                     | Konfigurasi lokal berisiko dilaporkan; akses aktif mesin lain belum terbukti | Konfigurasi bukan bukti proses aktif atau atribusi trafik                                      |
| Trafik 16 Oktober berasal dari Railway, Telkom, GCP, dan Python dengan jumlah tertentu | Belum dapat diverifikasi                                                     | Log yang diperiksa tidak menyediakan IP; user-agent tidak mengidentifikasi mesin               |
| Server GCP masih menjalankan worker yang sama                                          | Belum terverifikasi                                                          | Sampel gap polling tidak menunjukkan duplikasi, tetapi tidak membuktikan ketiadaan worker lain |
| Rekaman diunduh penuh sekitar tiga kali per halaman                                    | Ada jalur unduhan berulang; jumlah byte per kunjungan belum terbukti         | Dua jalur decoding membaca file; `preload="metadata"` bukan bukti unduhan penuh ketiga         |
| Polling banyak tetapi kecil                                                            | Jumlah dominan; biaya byte per endpoint belum terukur                        | Rata-rata harian bukan pengukuran byte khusus polling                                          |
| Log produksi tujuh hari telah diperiksa                                                | Tidak konsisten dengan retensi yang dilaporkan                               | Auditor mencatat retensi log Free satu hari; statistik usage tujuh hari berbeda dari log       |

**Kesimpulan utama:** REST dominan dalam breakdown egress yang dicatat. Belum ada atribusi byte per endpoint yang membuktikan SIDAK atau polling sebagai penyebab utama. Storage menunjukkan lonjakan pada dua hari, tetapi penyebab dan penghematan perbaikan perlu pengukuran jaringan.

## 2. Metode dan sumber yang dilaporkan

- Supabase Management API: plan, jumlah request, dan log.
- Query Postgres berupa `SELECT` melalui Management API.
- Storage API: listing, signed URL, dan pemeriksaan header respons.
- Dashboard Usage: kartu ringkasan dan data chart melalui sesi pemilik.
- Kode dan dokumentasi repo saat audit, termasuk `docs/deployment.md`, `docs/architecture.md`, `docs/CODEX_CLOUD.md`, dan `plans/markdown/e2e-webserver-isolation.md`.

Kredensial tidak disertakan. Penggunaan PAT atau service-role untuk operasi baca **tidak berarti hak kredensialnya read-only**.

## 3. Snapshot plan dan Usage

Organisasi aplikasi memakai plan **Free**. Identitas organisasi, proyek, dan email pemilik disamarkan. Proyek produksi dilaporkan berada di Singapore, compute nano, dengan status sehat saat audit.

| Metrik dashboard | Pemakaian | Kuota  |
| ---------------- | --------- | ------ |
| Egress uncached  | 4,546 GB  | 5 GB   |
| Cached egress    | 0,257 GB  | 5 GB   |
| Storage          | 0,44 GB   | 1 GB   |
| Database         | 108,91 MB | 0,5 GB |
| Log ingestion    | 0,484 GB  | 1 GB   |
| Log query        | 17,432 GB | 100 GB |

Uncached egress tercatat sekitar **91% kuota** pada snapshot ini, bukan ukuran pemakaian terkini.

### Breakdown egress harian yang dicatat

Angka dalam MB; auditor mencatat breakdown chart termasuk cached egress.

| Tanggal 2026 | Total | REST  | Storage | Auth |
| ------------ | ----- | ----- | ------- | ---- |
| 13 Okt       | 486,5 | 485,3 | 0,0     | 1,23 |
| 16 Okt       | 479,2 | 477,1 | 0,4     | 1,66 |
| 30 Sep       | 444,0 | 442,0 | 0,0     | 1,98 |
| 15 Okt       | 407,2 | 309,5 | 96,7    | 1,06 |
| 14 Okt       | 364,1 | 362,9 | 0,0     | 1,18 |
| 6 Okt        | 281,4 | 279,4 | 0,6     | 1,36 |
| 17 Okt       | 237,0 | 103,9 | 132,8   | 0,35 |

Total chart periode 19 September–19 Oktober yang dilaporkan: **4,234 GB**, dengan REST **3,99 GB (sekitar 94%)**, Storage **0,231 GB**, dan Auth **15,2 MB**.

**Selisih chart dan kartu belum direkonsiliasi.** Chart disebut termasuk cached, sedangkan kartu 4,546 GB adalah uncached. Periode, cakupan, unit, dan waktu refresh harus diperiksa; selisih tidak boleh otomatis dianggap pembulatan. Rasio 3,99/4,546 tidak digunakan sebagai atribusi egress.

## 4. Jumlah request dan polling

Auditor mencatat total window tujuh hari **77.068 request**.

| Tanggal Oktober 2026 | Total  | REST   | Auth | Storage |
| -------------------- | ------ | ------ | ---- | ------- |
| 12                   | 5.419  | 5.242  | 164  | 13      |
| 13                   | 12.795 | 12.133 | 648  | 14      |
| 14                   | 3.586  | 2.961  | 624  | 1       |
| 15                   | 4.704  | 4.066  | 566  | 72      |
| 16                   | 20.614 | 19.699 | 876  | 39      |
| 17                   | 11.901 | 11.662 | 185  | 54      |
| 18                   | 17.870 | 17.811 | 59   | 0       |
| 19                   | 185    | 181    | 4    | 0       |

Tanggal 12 dan 19 parsial. Tidak ada request Realtime dalam tabel sumber.

Pada window log terakhir, dua RPC dominan:

- `claim_ketik_review`: **14.975** request, user-agent `node`.
- `claim_telefun_realtime_orphans`: **2.547** request, user-agent `node`.
- Gabungan: **17.522**, sekitar 97% dari sekitar 18.100 request yang dilaporkan.
- `qa_temuan`: **33** request; jumlah kecil tidak membuktikan kontribusi byte kecil.
- Listing Storage oleh skrip audit sendiri: **121** request, user-agent `Python-urllib`. Trafik audit perlu dibedakan dari trafik aplikasi.

Sampel sekitar tiga jam menunjukkan median gap 5,04 detik dan 30,02 detik, tanpa gap di bawah 40% median. Ini tidak menunjukkan duplikasi dalam sampel, tetapi bukan inventaris seluruh proses/deployment. Asal polling sebelum worker embedded di API tidak dapat ditentukan hanya dari catatan deployment.

Pada 18 Oktober, 17.811 request REST dibandingkan dengan 20,1 MB menghasilkan rata-rata sekitar 1,1 KB/request. Angka ini **bukan** pengukuran byte khusus worker dan tidak membuktikan klaim 0,1 MB/hari.

## 5. Rekaman Telefun: indikasi dan hal yang belum terukur

Referensi berikut adalah lokasi yang dicatat auditor pada saat audit; nomor baris dapat berubah setelah perbaikan.

| Lokasi historis                                                    | Perilaku yang dicatat                                                         |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `apps/web/src/routes/telefun/hooks/useRecordingAnalysis.ts:45`     | Decode rekaman gabungan                                                       |
| `apps/web/src/routes/telefun/hooks/useRecordingAnalysis.ts:57-58`  | Decode rekaman agen                                                           |
| `apps/web/src/routes/telefun/utils/recordingAudio.ts:32-36`        | `fetch` dan `arrayBuffer()` untuk file utuh                                   |
| `apps/web/src/routes/telefun/components/TelefunCallPlayer.tsx:225` | Pemutar dengan `preload="metadata"`; belum membuktikan unduhan penuh tambahan |
| `apps/api/src/routes/telefun/recordings.ts:374`                    | Pembuatan signed URL                                                          |

Snapshot bucket: **156 file, total 408 MB**, median 0,74 MB; file terbesar **14.585.460 byte**. Rekaman gabungan dan rekaman agen merupakan file berbeda, sehingga ukurannya tidak boleh diasumsikan sama.

Sampel respons dilaporkan berupa `206 Partial Content`, memiliki ETag, tanpa `Cache-Control`, dan `CF-Cache-Status: MISS`. Signed URL berbeda ketika dibuat pada detik berbeda. Ini menunjukkan potensi berkurangnya reuse cache, bukan bukti semua request selalu ke origin.

Untuk membuktikan konsumsi per kunjungan diperlukan pengukuran request/response, Range, cache browser, ukuran kedua file, dan aktivitas pemutar. Estimasi **28–42 MB per kunjungan**, **340 MB/jam**, atau penghematan **2/3** belum dibuktikan oleh data ini.

## 6. SIDAK dan pembacaan database

Auditor mencatat `qa_temuan` memiliki 7.933 baris, ukuran tabel sekitar 6 MB, 272,5 juta index-tuple fetch, dan 80,4 juta sequential tuple read.

Statistik tersebut merupakan **pembacaan internal DB, bukan byte yang dikirim ke klien**. Window/reset statistik juga belum disejajarkan dengan periode egress. Statistik ini dapat menjadi petunjuk investigasi, tetapi tidak membuktikan query tanpa paginasi, respons besar, atau SIDAK sebagai penyebab utama egress.

Langkah berikutnya adalah mengorelasikan endpoint, ukuran respons, frekuensi, query, dan periode pengamatan yang sama.

## 7. Lingkungan lokal dan akses produksi

Laporan asli mencatat konfigurasi produksi pada `.env` dan `.env.local`, serta jalur integrasi loopback pada `apps/api/.env.integration`. Dokumen isolasi dev mencatat risiko proses dev mengakses produksi. Ini adalah **bukti konfigurasi berisiko**, bukan bukti mesin lain aktif saat audit.

Auditor melaporkan tidak ada proses dev atau penjadwal lokal yang relevan saat pemeriksaan. Pemeriksaan koneksi DB tidak dapat mengidentifikasi semua pemanggil yang memakai PostgREST. User-agent dan status lease juga tidak cukup untuk atribusi mesin.

Tidak ada inventaris GCP/cloud lain dalam bukti yang disertakan. Keberadaan konfigurasi setup cloud tidak membuktikan kredensial terpasang atau prosesnya aktif.

## 8. Rekomendasi historis dan tindak lanjut

1. Rekonsiliasi kartu dan chart Usage sebelum menetapkan persentase kontribusi.
2. Ukur payload REST per endpoint; sertakan SIDAK sebagai kandidat, bukan kesimpulan.
3. Verifikasi perbaikan reuse rekaman terhadap jaringan nyata dan bandingkan byte sebelum/sesudah.
4. Verifikasi guard dev terhadap produksi dan gunakan target lokal/test-only untuk pengujian.
5. Inventaris worker sebelum mengubah polling atau menghapus orphan sweep; jangan menganggap loop tidak diperlukan hanya dari nama atau riwayat fiturnya.
6. Konfirmasi penempatan kredensial di lingkungan cloud yang tidak lagi dipakai. Penghapusan atau rotasi remote memerlukan otorisasi tersendiri.

Tidak ada rekomendasi runtime yang dieksekusi dalam penyuntingan arsip ini.

## 9. Reproduksi dan kebersihan kredensial

Auditor menyebut skrip lokal `sb_usage.py`, `sb_storage.py`, `sb_worker.py`, `sb_recording_logs.py`, `sb_signed_url.py`, `sb_sign_compare.py`, dan `sb_headers.py`. Skrip serta output mentah berada di luar repo dan tidak diverifikasi dalam penyuntingan ini. Dokumen ini bukan artefak reproduksi lengkap.

Auditor juga melaporkan salinan PAT sementara di luar repo. **Status penghapusannya belum diverifikasi.** Pemilik perlu memastikan salinan yang tidak diperlukan sudah dibersihkan. Penyuntingan ini tidak membaca, menampilkan, menghapus, atau merotasi kredensial.

**Batas akhir:** snapshot berasal dari 19 Oktober 2026; log yang dilaporkan hanya mencakup sekitar 24 jam. Statistik usage tujuh hari tidak menggantikan bukti log historis atau atribusi per mesin.

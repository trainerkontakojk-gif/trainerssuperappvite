# Telefun — konsumen marah ngotot dan domisili belum spesifik

## Requirement

Laporan Fajar (2026-10-23): konsumen AI Telefun terasa "lebih bodoh", terutama tipe Marah.

1. **Domisili belum spesifik.** Trainer sengaja mengisi domisili berupa provinsi (mis. "Lampung") atau "Jakarta" agar agen melatih probing ("Lampung-nya kota Bandar Lampung atau kabupaten mana, Pak?"). Prompt Telefun hanya punya `KONTRAK VERIFIKASI IDENTITAS` yang mewajibkan kota diulang "PERSIS dan UTUH" dan melarang substitusi, sehingga konsumen tidak bisa menjawab probing kota/kabupaten dan terdengar bodoh.
   - Saat domisili ditanya pertama kali, konsumen menyebut nilai terkonfigurasi apa adanya ("Lampung"); tidak menyebut kota/kabupaten sebelum agen menanyakannya.
   - Saat agen menanyakan kota/kabupatennya, konsumen menjawab satu kota/kabupaten spesifik yang deterministik (sama dengan aturan KETIK: ibu kota provinsi; "Jakarta" → salah satu kota administrasi berdasarkan nama) dan memakainya sampai akhir panggilan. Tipe marah tetap menjawab, dengan nada kesal, lalu kembali ke masalahnya.
   - Domisili yang sudah spesifik tidak mendapat blok ini.
2. **Konsumen marah tidak ngotot.** Konsumen marah langsung menerima solusi, tidak seperti konsumen hard complain.
   - Solusi pertama tidak langsung diterima; konsumen menolak atau mempertanyakannya minimal sekali dengan alasan kerugiannya.
   - Solusi standar (lapor, tunggu sekian hari kerja, cek sendiri) diprotes: minta dipercepat, jaminan, atau atasan.
   - Baru menerima setelah agen mengakui masalah secara spesifik, memberi langkah konkret, dan kepastian waktu atau nomor laporan; menerimanya dengan berat hati dan bersyarat, tanpa berubah ramah.
   - Menerima permintaan prosedural (hold, verifikasi) bukan berarti menerima solusi.
   - Tidak berdebat tanpa akhir dan tidak mengarang tuntutan di luar skenario.

## Design

- `apps/web/src/routes/telefun/services/promptBuilder.ts`
  - Pakai `detectKetikIdentityAnomalies` dan `computeKetikIdentityCorrection` dari `@trainers/types` (sudah dipakai KETIK, deterministik) untuk field `city`.
  - Bila domisili belum spesifik, tambahkan blok `DOMISILI BELUM SPESIFIK` setelah kontrak verifikasi, dan kontrak verifikasi memberi pengecualian untuk rincian kota/kabupaten tersebut.
  - Untuk tipe `marah`, tambahkan blok `TUNTUTAN DAN PENOLAKAN SOLUSI (MARAH)`; `POSISI KONSUMEN` butir 2 dan `ATURAN KEPATUHAN PROSEDURAL` butir 1 menegaskan bahwa percaya atau patuh prosedur bukan berarti menerima solusi.
- Tidak ada perubahan server, skema, atau kontrak API.

## Tasklist

- [x] RED: tambah dua test di `apps/web/e2e/telefun-consumer-prompt.spec.ts` (domisili "Lampung" dan konsumen marah ngotot), jalankan, pastikan gagal karena alasan yang diharapkan.
- [x] GREEN: ubah `promptBuilder.ts`.
- [x] Jalankan spec fokus, typecheck web, `thermo-nuclear`.
- [x] CHANGELOG, commit, push.

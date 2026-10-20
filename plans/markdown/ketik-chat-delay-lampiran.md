# KETIK — pesan agen langsung tampil dengan centang, lampiran konsumen relevan

Lane C (bug fix lintas file: hook chat web + prompt konsumen API).

## Requirement

1. Saat agen menekan Kirim, bubble pesannya langsung tampil di ruang chat. Sebelumnya bubble baru muncul setelah jeda tenang (`QUIET_WINDOW_MS`: 3 detik realistis, 1,2 detik training_fast) karena bubble ditambahkan di dalam loop antrean setelah jeda itu. Pesan antrean berikutnya juga langsung tampil. Jeda tenang tetap berlaku untuk pengiriman ke server (pesan beruntun tetap dijawab sekali).
2. Konsumen AI mengirim lampiran skenario yang relevan. Instruksi lampiran sebelumnya hanya daftar indeks tanpa panduan kapan mengirim, dan aturan BUKA INFORMASI BERTAHAP membuat bukti hanya keluar bila ditanya. Keterangan gambar juga diletakkan di luar blok data.

## Design

- `apps/web/src/routes/ketik/hooks/useServerKetikChat.ts`: antrean menyimpan waktu kirim; `send()` langsung menampilkan bubble agen. Fungsi murni `presentMessages` menggabungkan pesan server dengan bubble antrean yang belum ada di server, kecuali chat sudah tertutup (teks antrean yang tidak terkirim tidak ditampilkan, sesuai kontrak lama). Fungsi itu juga memberi status centang: `sent` (hanya di browser), `delivered` (sudah disimpan server), `read` (konsumen mulai mengetik atau sudah membalas). Body request tetap `{requestId, text, expectedVersion, awaitMore?}`.
- `KetikMessageBubble.tsx`: centang ala WhatsApp dengan label aksesibel (Terkirim/Diterima/Dibaca) dan animasi pegas kecil saat status berubah, yang dimatikan bila pengguna memilih gerak dikurangi. Status Dibaca tampil dengan opasitas penuh, karena warna biru tidak terlihat di atas bubble KETIK yang biru.
- `apps/api/src/services/ketik/prompt-policy.ts`: format daftar `Indeks n: "keterangan"` dan `imageDescriptions` dipertahankan (dikunci oleh tes lama). Ditambah bagian KAPAN MENGIRIM LAMPIRAN: kirim saat agen meminta bukti, tangkapan layar, foto, atau dokumen; boleh satu lampiran tanpa diminta saat menceritakan hal yang persis ditunjukkan lampiran itu; pilih berdasarkan keterangan; tiap lampiran sekali; tag sebagai part sendiri.

## Tasklist

- [x] RED: `ketik-server-chat.spec.ts` — bubble agen tampil (centang satu) sebelum request `/turns` dikirim (mode realistis), lalu jadi Dibaca setelah konsumen membalas.
- [x] RED: `ketik-consumer-prompt-api.spec.ts` — skenario dengan dua lampiran berketerangan menawarkan tiap indeks dengan keterangannya dan memuat panduan KAPAN MENGIRIM LAMPIRAN.
- [x] GREEN: hook dan prompt policy.
- [x] Thermo-nuclear review, typecheck web/api, spec KETIK terkait.

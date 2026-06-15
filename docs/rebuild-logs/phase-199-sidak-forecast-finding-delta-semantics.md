# Phase 199 - SIDAK Forecast Finding Delta Semantics

## Ringkasan

Insight forecast SIDAK sebelumnya dapat menafsirkan delta negatif seperti `-9`
sebagai penurunan kualitas. Padahal series parameter berasal dari jumlah temuan,
sehingga delta negatif berarti jumlah temuan berkurang dan merupakan perbaikan.

## Perubahan

- Prompt backend sekarang menyebut eksplisit bahwa data adalah jumlah temuan.
- Setiap parameter dikirim ke model bersama interpretasi deterministik:
  delta negatif membaik, delta positif berisiko, dan delta nol stabil.
- Parser frontend memprioritaskan nilai numerik agar warna/tone tidak dibalik
  oleh judul subsection AI yang keliru.
- Versi kontrak ditambahkan ke fingerprint agar snapshot lama menjadi stale.
- Dokumentasi SIDAK menjelaskan unit dan arah perubahan parameter.

## Verifikasi

- Targeted API forecast tests.
- Targeted web insight parser/component tests.
- TypeScript compile untuk workspace API dan web.
- `git diff --check`.

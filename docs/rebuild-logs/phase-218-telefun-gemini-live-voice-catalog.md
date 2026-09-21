# Phase 218 — Telefun Gemini Live Voice Catalog

Tanggal: 2026-09-21
Scope: menambahkan voice Gemini Live/TTS resmi ke Telefun dengan mapping gender yang disetujui Fajar.

## Perubahan

- Shared registry `packages/types/src/telefun-voices.ts` kini memuat 30 voice:
  14 female dan 16 male.
- Voice lama (`Puck`, `Charon`, `Fenrir`, `Orus`, `Kore`, `Leda`, `Aoede`)
  tetap dipertahankan.
- Identity picker Telefun otomatis menampilkan voice sesuai gender melalui
  `getVoicesForModel()`.
- `VOICE_OPTIONS` legacy di `telefunSettings.ts` sekarang diturunkan dari
  shared registry, sehingga tidak stale.
- Default voice tetap `Kore`.

## Mapping yang disetujui

- Female: `Zephyr`, `Kore`, `Leda`, `Aoede`, `Callirrhoe`, `Autonoe`,
  `Despina`, `Erinome`, `Laomedeia`, `Achernar`, `Gacrux`, `Pulcherrima`,
  `Vindemiatrix`, `Sulafat`.
- Male: `Puck`, `Charon`, `Fenrir`, `Orus`, `Enceladus`, `Iapetus`, `Umbriel`,
  `Algieba`, `Algenib`, `Rasalgethi`, `Schedar`, `Alnilam`, `Achird`,
  `Zubenelgenubi`, `Sadachbia`, `Sadaltager`.

Google mendokumentasikan nama dan karakter suara, tetapi tidak mempublikasikan
field gender first-party untuk seluruh katalog. Mapping di atas adalah mapping
aplikasi yang disetujui Fajar dan tidak boleh diganti diam-diam.

## Verifikasi

- RED voice-registry test: gagal karena registry masih 7 voice.
- GREEN voice-registry test: 6 passed.
- Existing gender-aware normalization tetap dipertahankan.
- Full affected test/typecheck/build gate dijalankan setelah perubahan selesai.

# Scenario Description Character Counter

## Ringkasan

Perbaikan ini memperjelas panjang deskripsi skenario pada editor KETIK dan PDKT tanpa mengubah kontrak data atau alur penyimpanan.

## Perilaku

- **KETIK:** menampilkan counter live yang aksesibel dan menggunakan `maxLength` kanonis `12.000` karakter (`KETIK_PROMPT_LIMITS.scenarioDescription`).
- **PDKT:** menampilkan counter live dan menggunakan `maxLength` kanonis prompt `longText`, yaitu `50.000` karakter (`PDKT_PROMPT_INPUT_LIMITS.longText`). Counter dan pesan error validasi dapat dirujuk bersama melalui `aria-describedby`; validasi required tetap dipertahankan.
- **Telefun:** sengaja tidak memiliki counter atau `maxLength` finite. Kontrak API untuk `instruction` adalah `z.string()` tanpa batas maksimum.
- Draft legacy yang melebihi batas KETIK/PDKT tidak dipotong diam-diam saat dibuka; nilainya tetap terlihat sehingga pengguna dapat menghapusnya secara eksplisit.

## Verifikasi

- Tes terfokus: 24 tes lulus.
- Typecheck web dan lint scoped lulus.
- Tidak ada perubahan API, schema, migrasi, atau payload.
- Browser visual QA tidak dilakukan.

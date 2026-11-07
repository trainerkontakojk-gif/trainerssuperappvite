# Telefun OpenAI Voice Gender Parity Design

## Tujuan

Menyamakan perilaku pemilihan suara GPT Realtime dengan Gemini Live pada pengaturan identitas Telefun. Pilihan suara harus mengikuti jenis kelamin persona, bukan menampilkan seluruh suara OpenAI dalam satu daftar tanpa pembeda.

## Requirement

### Acceptance criteria

- Saat model Telefun memakai Gemini Live, perilaku pemilihan suara tidak berubah.
- Saat model Telefun memakai GPT Realtime dan jenis kelamin `male`, pilihan suara hanya menampilkan suara OpenAI berkarakter laki-laki.
- Saat model Telefun memakai GPT Realtime dan jenis kelamin `female`, pilihan suara hanya menampilkan suara OpenAI berkarakter perempuan.
- Saat jenis kelamin `random`, pilihan suara dinonaktifkan dan runtime memilih suara yang kompatibel setelah gender persona ditentukan.
- Mengganti jenis kelamin menghapus pilihan suara lama agar suara yang tidak kompatibel tidak ikut tersimpan.
- Suara yang diminta tetapi tidak kompatibel dengan provider atau gender harus dinormalisasi ke suara acak dari kelompok gender yang benar.
- Seluruh voice ID resmi GPT Realtime tetap valid di lapisan protokol. `alloy`, yang tidak mempunyai klasifikasi gender resmi, tidak ditawarkan dalam picker berbasis gender tetapi tetap diterima untuk kompatibilitas data lama.

### Edge cases

- Setting lama berisi suara Gemini ketika model berubah ke GPT Realtime.
- Setting lama berisi suara GPT Realtime dengan gender yang tidak cocok.
- Setting lama berisi `alloy`.
- Model ID kosong atau tidak dikenal dinormalisasi melalui registry model kanonik.
- Nilai gender kosong diperlakukan sebagai `random`.

### Constraints

- OpenAI hanya menerbitkan daftar nama voice, bukan gender resminya. Pengelompokan adalah metadata produk Telefun berdasarkan karakter suara yang dipersepsikan dan harus dinyatakan sebagai keputusan internal, bukan kontrak OpenAI.
- Tidak menambah dependency eksternal atau static import besar.
- Tetap menggunakan registry model dan voice bersama di `@trainers/types`; jangan hardcode daftar berbeda di komponen React.
- Pertahankan token desain, akses keyboard, focus state, dark/light theme, dan layout Settings saat ini.

## Design

### Voice registry

Tambahkan registry `OPENAI_REALTIME_VOICES_BY_GENDER` di shared types, sejajar dengan `GEMINI_LIVE_VOICES_BY_GENDER`.

Pengelompokan produk:

| Gender | Voice |
| --- | --- |
| Laki-laki | `ash`, `ballad`, `echo`, `verse`, `cedar` |
| Perempuan | `coral`, `sage`, `shimmer`, `marin` |
| Netral/legacy-only | `alloy` |

`OPENAI_REALTIME_VOICES` tetap memuat sepuluh voice resmi agar validasi protokol dan setting lama tidak rusak.

### Data flow

```text
telefunModelId + identitySettings.gender
  -> resolve provider dari model registry
  -> getVoicesForModel(modelId, gender)
  -> picker hanya menampilkan kelompok gender yang cocok

saved/requested voice + resolved runtime gender
  -> resolveVoiceForModel(...)
  -> pertahankan voice jika provider dan gender cocok
  -> selain itu pilih acak dari kelompok gender provider tersebut
```

### UI behavior

`TelefunIdentityTab` menggunakan aturan yang sama untuk Gemini dan GPT Realtime:

- `random`: select suara disabled dan helper text menjelaskan pemilihan otomatis sesuai gender.
- `male` atau `female`: select aktif dan hanya berisi kelompok yang sesuai.
- Tidak ada opsi default lintas gender.
- Perubahan gender mengosongkan `voiceName` untuk mencegah pilihan stale.

Tidak diperlukan redesign visual. Perubahan hanya memperbaiki isi dan state control yang sudah ada.

### Runtime behavior

Resolver suara menjadi provider-aware sekaligus gender-aware. OpenAI tidak lagi mempertahankan requested voice hanya karena voice ID valid; voice tersebut juga harus berada di kelompok gender hasil resolusi persona. Jika tidak cocok, resolver memilih secara acak dari kelompok yang benar.

`alloy` tetap lolos `isVoiceValidForModel()` untuk kompatibilitas protokol, tetapi akan diganti oleh resolver gender-aware ketika sesi baru dibangun.

### Error handling

- Tidak menampilkan error kepada user untuk setting lama yang tidak kompatibel; normalisasi berlangsung defensif.
- Registry kosong dianggap programming error dan dicegah lewat konstanta serta regression test.
- Model tidak dikenal mengikuti fallback model kanonik yang sudah ada.

## Testing

Gunakan TDD dengan regression test yang awalnya gagal:

1. Shared/web registry mengembalikan kelompok suara OpenAI sesuai gender.
2. Resolver mengganti suara OpenAI yang berbeda gender dengan anggota kelompok yang benar.
3. Picker GPT Realtime disabled untuk `random`.
4. Picker GPT Realtime hanya menampilkan voice sesuai gender.
5. Mengubah gender membersihkan pilihan voice GPT Realtime.
6. Test existing Gemini dan validasi protokol tetap lulus.

Verifikasi akhir mengikuti scope product behavior: focused Vitest Telefun terlebih dahulu, lalu lint, build, `test:core`, `git diff --check`, dan audit UI Impeccable.

## Dokumentasi

Perbarui `docs/telefun.md` untuk menjelaskan bahwa kedua provider menggunakan picker suara berbasis gender dan bahwa klasifikasi OpenAI merupakan metadata internal Telefun. Wiki tidak perlu diubah karena ini bug fix internal tanpa perubahan API publik atau navigasi.

## Non-goals

- Menambah preview/playback suara.
- Mengubah daftar model GPT Realtime.
- Mengubah prompt identitas atau kontrak API session.
- Mengubah desain Settings Telefun di luar state dan copy picker suara.

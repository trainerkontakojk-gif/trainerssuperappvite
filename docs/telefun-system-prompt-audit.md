# Laporan Audit System Prompt Telefun

**Tanggal Audit:** 20 Juli 2026
**Metodologi:** Read-only document & code review
**Scope:** System prompt yang dikirim ke LLM (Gemini Live API) pada sesi Telefun — mencakup `promptBuilder.ts`, `liveSession.ts`, `telefunSettings.ts`, `simulationChallenges.ts`, dan `telefun-analysis.ts`.

---

## Executive Summary / Verdict

**Fungsional tetapi belum ideal.** Sistem prompt Telefun saat ini bekerja dan menghasilkan simulasi yang cukup realistis, namun memiliki sejumlah masalah struktural yang menurunkan maintainability dan konsistensi:

- **Bukan konflik fatal** — tidak ada instruksi yang saling bertentangan secara eksplisit hingga membuat model bingung.
- **Konflik semantik ringan–sedang** — terutama pada role time cue (dikirim sebagai `role: "user"` tapi berisi instruksi sistem), persona (deskripsi kaya hilang karena deteksi substring), dan redundansi aturan penutupan.
- **Redundansi struktural** — aturan yang sama diulang di beberapa tempat dengan formulasi berbeda, meningkatkan risiko inkonsistensi di masa depan.
- **Tidak ada single source of truth** — prompt dibangun dari dua jalur berbeda (`buildTelefunLiveSystemInstruction` + `sendPrompt` untuk time cue) tanpa koordinasi yang jelas.

**Risiko tertinggi:** Time cue berlabel sistem tetapi dikirim sebagai role `user`, dan tidak adanya mekanisme yang menjamin konsistensi antara system prompt awal dengan injeksi waktu-nyata.

## Status Remediasi

Audit ini telah dijadikan dasar implementasi pada 20 Juli 2026. Keputusan final berikut mempertahankan arsitektur prompt-first dan timer aplikasi sebagai source of truth.

| Temuan | Keputusan implementasi |
|---|---|
| T1 | `getTimeCueInstruction()` menghasilkan marker `[TELEFUN_CONTROL:TIME_CUE]` yang dikontrakkan di system prompt awal. Gemini mengirimnya lewat `realtimeInput.text`; OpenAI mengirim conversation item `role: "system"`. Adapter OpenAI hanya menerima system item dengan marker tersebut. |
| T2 | Field aktif `settings.systemInstruction` dihapus dari tipe, default, override sesi, dan requirement API. Parser/save frontend membuang key legacy; API tetap menerima payload lama lewat `.passthrough()` agar kompatibel. |
| T3 | Guidance persona memakai `consumerType.id` yang stabil dan selalu menyertakan `consumerType.description` sebagai profil lengkap. |
| T4 | Seluruh kondisi premature close dikonsolidasikan ke satu section `ATURAN KELANJUTAN DAN PENUTUPAN`. |
| T5 | Skrip memakai hierarki eksplisit: fakta/inti wajib, jawaban aktual natural, urutan fleksibel tanpa mengubah fakta. |
| T6 | Instruksi voice teknis/pitch dihapus. Prompt hanya menjaga gender sebagai identitas karakter; voice aktual tetap dipilih oleh `resolveVoiceForModel()`. |
| T7 | Batas diam absolut dihapus dan diganti petunjuk relatif. |
| T8 | Wording kebijakan interruption dipusatkan di `simulationChallenges.ts` melalui `getSimulationInterruptionInstruction()`. |
| T9 | Parameter `maxCallDuration` dihapus dari builder. Timer aplikasi memicu cue runtime, sehingga model tidak diminta menghitung durasi sendiri. |

Dokumentasi operasional terkini ada di `docs/telefun.md`. Temuan di bawah dipertahankan sebagai rekam audit sebelum remediasi.

---

## Tabel Penilaian

| Aspek | Penilaian | Keterangan |
|-------|-----------|------------|
| **Kebenaran Fungsional** | Cukup | Simulasi berjalan, tetapi ada celah persona dan time cue |
| **Konsistensi Internal** | Perlu diperbaiki | Redundansi aturan, konflik semantik ringan |
| **Maintainability** | Perlu diperbaiki | Dua jalur prompt, duplikasi challenge logic |
| **Single Source of Truth** | Perlu diperbaiki | systemInstruction di settings tidak dipakai builder |
| **Dokumentasi & Struktur** | Cukup | Relatif terbaca, tetapi mapping antar file tidak jelas |

---

## Temuan Audit

### T1 — Time Cue Berlabel Sistem Dikirim sebagai `role: "user"` ⚠️ **SEDANG**

**Lokasi:**
- `promptBuilder.ts:146–167` — fungsi `getTimeCueInstruction` menghasilkan teks berawalan `[INSTRUKSI SISTEM - ...]`
- `liveSession.ts:913–927` — `sendPrompt()` mengirim via `clientContent.turns` dengan `role: "user"`
- `liveSession.ts:1205–1219` — `sendTimeCue()` memanggil `sendPrompt()` dengan hasil `getTimeCueInstruction()`

**Deskripsi:**
Fungsi `sendTimeCue()` di `liveSession.ts:1205–1219` menghasilkan instruksi penutupan berbasis sisa waktu (20, 30, 60, 120 detik) melalui `getTimeCueInstruction()`. Teks ini diawali label `[INSTRUKSI SISTEM - ...]` untuk membedakannya dari percakapan konsumen biasa. Namun, teks tersebut dikirim melalui `sendPrompt()` yang sama dengan percakapan biasa — yaitu sebagai `clientContent.turns` dengan `role: "user"` dan `turnComplete: true` (lihat `liveSession.ts:920–926`). Sementara itu, system prompt sebenarnya (dari `buildTelefunLiveSystemInstruction`) dikirim sebagai `systemInstruction` di sesi Gemini setup (`liveSession.ts:858–880`).

**Dampak:**
Model menerima instruksi sistem di dua lapis yang berbeda: satu sebagai `systemInstruction` bawaan (authority tinggi), satu lagi sebagai percakapan user biasa (authority lebih rendah). Label `[INSTRUKSI SISTEM]` hanyalah teks biasa — Gemini Live API tidak mengenalinya sebagai instruksi sistem yang authoritative. Model bisa saja mengabaikan instruksi ini karena datangnya dari "user" (konsumen), bukan dari sistem.

**Rekomendasi:**
1. Gunakan mekanisme runtime control jika provider mendukungnya (misalnya update `systemInstruction` via API), atau gunakan state machine di sisi client untuk mengelola fase sesi.
2. Pisahkan instruksi sistemik dari percakapan konsumen — gunakan marker kontrol eksplisit (contoh: `[TIME_CUE: 30s]`) yang dibedakan dari ucapan agen, bukan label `[INSTRUKSI SISTEM]`.
3. Pastikan format konsisten antara `getTimeCueInstruction` dan `buildTelefunLiveSystemInstruction` agar model melihatnya sebagai satu kesatuan instruksi.

---

### T2 — `settings.systemInstruction` Tidak Digunakan oleh Builder ⚠️ **SEDANG**

**Lokasi:**
- `telefunSettings.ts:583–587` — `DEFAULT_TELEFUN_SETTINGS.systemInstruction = "Anda adalah konsumen yang menghubungi OJK. Bantu agen melatih kemampuan komunikasi."`
- `index.tsx:207–217` — `systemInstruction` ditimpa dengan `randomScenario.instruction`
- `promptBuilder.ts:11–18` — `buildTelefunLiveSystemInstruction` menerima params `identity`, `scenario`, `consumerType`, dll., tetapi **tidak membaca** `settings.systemInstruction`

**Deskripsi:**
`DEFAULT_TELEFUN_SETTINGS` memiliki field `systemInstruction` (baris 586–587) berisi kalimat umum. Saat sesi dimulai, `index.tsx:212` menimpa `systemInstruction` dengan `randomScenario.instruction` (contoh: "Konsumen diteror oleh pinjol ilegal padahal tidak pernah meminjam."). Namun, `promptBuilder.ts` mengabaikan field ini sama sekali — fungsi `buildTelefunLiveSystemInstruction` membangun prompt dari parameter `scenario.instruction` dan `scenario.script` secara hardcoded di dalam template string.

**Dampak:**
- Field `systemInstruction` di settings memberikan ilusi bahwa prompt dapat dikustomisasi dari UI/settings.
- Nilai `settings.systemInstruction` tidak pernah mencapai Gemini — hanya prompt dari builder yang dikirim sebagai system instruction.
- Jika suatu saat developer mengubah settings dengan harapan memengaruhi prompt, perubahan itu tidak akan berdampak.

**Rekomendasi:**
1. Hapus field `systemInstruction` dari `DEFAULT_TELEFUN_SETTINGS` jika tidak digunakan.
2. Atau, integrasikan `settings.systemInstruction` sebagai prefix/header dalam `buildTelefunLiveSystemInstruction`.
3. Dokumentasikan bahwa source of truth system prompt ada di `promptBuilder.ts`, bukan di settings.

---

### T3 — Persona Diturunkan dari Substring Nama, Deskripsi Kaya Sering Hilang 🟡 **RENDAH–SEDANG**

**Lokasi:**
- `promptBuilder.ts:169–196` — `getEmotionInstruction()` menggunakan `lowerName.includes(...)` untuk menentukan emosi
- `telefunSettings.ts:481–530` — `DEFAULT_CONSUMER_TYPES` berisi deskripsi rich per tipe konsumen (marah, bingung, kritis, ramah, terburu-buru, pasrah)

**Deskripsi:**
Fungsi `getEmotionInstruction()` menentukan instruksi emosi berdasarkan substring dari `consumerType.name.toLowerCase()`. Contoh: jika nama mengandung "marah", "ngeyel", "emosi", atau "kesal", outputnya adalah `"EMOSI: MARAH/KESAL. Nada tinggi dan cepat. Jaga konsistensi suara."`. Deskripsi rich dari `consumerType.description` (misalnya baris 486–488: "Konsumen sangat marah, nada bicara tinggi, emosional, dan tidak sabaran...") HANYA digunakan sebagai fallback ketika tidak ada substring yang cocok — di baris 195: `` EMOSI: ${consumerType.description}. Bicara natural. ``

**Dampak:**
- Untuk tipe `"marah"` (id: "marah", name: "Marah & Emosional"), deskripsi rich yang panjang (3+ kalimat) diabaikan dan diganti dengan satu kalimat generik.
- Persona konsumen menjadi kurang nuanced karena hanya mengandalkan kata kunci dalam nama.
- Jika nama tipe diubah di settings, emosi bisa berubah secara tidak terduga.

**Rekomendasi:**
1. Gunakan `consumerType.id` dari pada substring `name` untuk menentukan emosi — lebih stabil.
2. Sertakan `consumerType.description` sebagai pelengkap (bukan fallback) agar persona lebih kaya.
3. Pertimbangkan untuk menambahkan field `emotionTag` eksplisit di `TelefunConsumerType`.

---

### T4 — Larangan Menutup Diulang di Berbagai Tempat 🟡 **RENDAH**

**Lokasi:**
- `promptBuilder.ts:49` — `"Jangan mengakhiri sesi hanya karena agen diam"`
- `promptBuilder.ts:82` — `"jangan menutup sesi sendiri"` (di dalam challengeInstruction)
- `promptBuilder.ts:110–112` — aturan 5, 6, 7: larangan menutup karena respons singkat, larangan menutup karena perkiraan waktu sendiri
- `promptBuilder.ts:125–128` — ATURAN PENYELESAIAN MASALAH: "JANGAN mengatakan terima kasih, saya tutup dulu"

**Deskripsi:**
Terdapat **4 lokasi terpisah** dalam satu file (`promptBuilder.ts`) yang melarang model menutup percakapan secara prematur, masing-masing dengan konteks yang sedikit berbeda:
- Silent handling (baris 49): konteks agen diam
- Challenge instruction (baris 82): konteks tantangan percakapan
- Aturan bicara (baris 110–112): konteks respons singkat + perkiraan waktu
- Aturan penyelesaian masalah (baris 125–128): konteks setelah solusi awal diberikan

**Dampak:**
- Meningkatkan panjang prompt tanpa menambah nilai signifikan (sekitar 6–7 baris redundan).
- Jika suatu saat aturan diubah di satu tempat tetapi tidak di tempat lain, terjadi inkonsistensi.
- Model mungkin memberi bobot lebih pada instruksi yang diulang, tetapi tidak ada jaminan redundansi membantu.

**Rekomendasi:**
1. Konsolidasikan semua larangan menutup ke satu **aturan tunggal** yang komprehensif.
2. Tempatkan di ATURAN PENYELESAIAN MASALAH atau ATURAN BICARA, lalu hapus dari bagian lain.
3. Gunakan format: "JANGAN menutup telepon dalam situasi berikut: [daftar]."

---

### T5 — Script Hierarchy Ambigu 🟡 **RENDAH**

**Lokasi:**
- `promptBuilder.ts:53–72` — `scriptInstruction`

**Deskripsi:**
Instruksi skrip percakapan memberikan panduan yang cukup lengkap tentang bagaimana menggunakan skrip (format dialog vs format poin alur), namun hierarki pengambilan keputusan saat ada konflik tidak jelas. Kalimat di baris 69: "Jika ada konflik antara skrip, pertanyaan agen, dan kondisi percakapan aktual, prioritaskan respons yang paling natural namun tetap konsisten dengan inti masalah pada skrip" memberikan fleksibilitas yang besar tetapi tanpa panduan yang jelas tentang sejauh mana boleh menyimpang.

Selain itu, bagian ini menyebut "BOLEH menyimpang dari urutan skrip bila diperlukan" (baris 68) yang bisa bertentangan dengan ekspektasi bahwa skrip adalah panduan utama (baris 54–55).

**Dampak:**
- Model mungkin menghasilkan variasi percakapan yang terlalu jauh dari skrip.
- Sulit diprediksi apakah model akan mengikuti skrip secara ketat atau longgar.
- Testing dan debugging alur percakapan menjadi sulit karena output tidak konsisten.

**Rekomendasi:**
1. Tetapkan hierarki keputusan yang jelas, misal: (1) Ikuti alur skrip, (2) Jika agen bertanya di luar skrip, jawab natural sesuai identitas, (3) Jika ada konflik, prioritaskan naturalness di atas urutan skrip.
2. Gunakan format terstruktur (misal: "SKENARIO: ..." + "ALUR WAJIB: ..." + "FLEKSIBEL: ...") daripada paragraf panjang.

---

### T6 — Voice Prompt Tidak Operasional Dibanding Voice Runtime 🟡 **RENDAH**

**Lokasi:**
- `promptBuilder.ts:38–41` — `genderInnerText`: "SUARA: LAKI-LAKI (Bapak-bapak). Gunakan suara berat." / "SUARA: PEREMPUAN (Ibu-ibu). Gunakan suara wanita."
- `liveSession.ts:850–856` — `resolveVoiceForModel()` menangani pemilihan voice aktual di runtime

**Deskripsi:**
System prompt berisi instruksi verbal tentang suara ("Gunakan suara berat", "Gunakan suara wanita") yang bersifat **deklaratif** — meminta model untuk mengatur suaranya sendiri. Namun, di runtime, `liveSession.ts:852–856` menggunakan `resolveVoiceForModel()` untuk mengatur voice secara teknis melalui parameter `voice` di session configure (Gemini Live API). Voice yang sebenarnya diputar adalah hasil dari pengaturan teknis ini, bukan dari instruksi verbal di prompt.

**Dampak:**
- Instruksi verbal di prompt tidak operasional — tidak memengaruhi suara yang dihasilkan API.
- Jika pengaturan teknis `voiceName` berbeda dengan gender di prompt, bisa terjadi mismatch (misal: voice teknis perempuan, tapi prompt menyuruh "Gunakan suara berat").
- Menambah panjang prompt tanpa efek fungsional.

**Rekomendasi:**
1. Hapus `genderInnerText` dari prompt, atau jadikan sebagai instrupsi konsistensi karakter (bukan suara teknis).
2. Pastikan `voiceName` dari `resolveVoiceForModel()` sinkron dengan gender character.
3. Dokumentasikan bahwa voice control dilakukan sepenuhnya via API parameter, bukan prompt.

---

### T7 — Silent Handling Timer 🟡 **RENDAH**

**Lokasi:**
- `promptBuilder.ts:43–50` — `silentInstruction` dengan batas waktu <30 detik, 30–45 detik

**Deskripsi:**
Instruksi silent handling memberikan batas waktu spesifik: "Jika agen diam sebentar (<30 detik), tunggu... Jika agen diam lebih lama (30-45 detik), panggil agen secara natural satu kali." Ini bergantung pada model untuk menghitung durasi diam secara real-time — kemampuan yang tidak dimiliki LLM secara native. Model tidak memiliki konsep waktu absolut dan tidak bisa menghitung berapa detik telah berlalu.

**Dampak:**
- Instruksi waktu ini pada praktiknya tidak dapat diikuti secara presisi oleh model.
- Model mungkin mengabaikan batas waktu dan hanya bereaksi berdasarkan jumlah giliran percakapan (turn count) — yang tidak selalu berkorelasi dengan waktu.
- Menciptakan false expectation bahwa model akan menunggu tepat 30 detik sebelum memanggil agen.

**Rekomendasi:**
1. Ganti batas waktu absolut dengan petunjuk berbasis giliran: "Jika agen belum merespons setelah 2-3 kalimat Anda, ..."
2. Atau, serahkan penanganan silent ke logika aplikasi (timeout timer di sisi client) yang mengirim sinyal ke model.
3. Hapus referensi detik dan gunakan istilah relatif ("sebentar", "agak lama", "sangat lama").

---

### T8 — Challenge Overlap: simulationChallenges.ts vs promptBuilder.ts 🟡 **RENDAH**

**Lokasi:**
- `simulationChallenges.ts:16–35` — definisi `SIMULATION_CHALLENGES` dengan `promptInstruction` per challenge (7 jenis)
- `promptBuilder.ts:75–90` — challenge instruction dibangun dari `getSimulationChallengeDefinitions()`
- `promptBuilder.ts:106–109` — interruption instruction ditulis ulang secara kondisional

**Deskripsi:**
`simulationChallenges.ts` mendefinisikan 7 jenis challenge dengan `promptInstruction` yang sudah siap pakai. `promptBuilder.ts` menggunakan `getSimulationChallengeDefinitions()` untuk mengambil definisi challenge dan menggabungkannya ke prompt (baris 75–84). Namun, untuk challenge `interruption`, promptBuilder memiliki **logika duplikat** di baris 86–90 yang menulis ulang instruksi interruption berdasarkan ada/tidaknya challenge `interruption` di daftar. Ini menciptakan dua sumber instruksi untuk interruption: satu dari `SIMULATION_CHALLENGES` dan satu lagi dari conditional logic di `promptBuilder.ts`.

**Dampak:**
- Jika suatu saat konten `promptInstruction` untuk `interruption` diubah di `simulationChallenges.ts`, perubahan itu mungkin tidak efektif karena `promptBuilder.ts` memiliki versi sendiri.
- Dua instruksi interruption yang mirip tapi tidak identik bisa membingungkan model.
- Logika kondisional di promptBuilder (baris 86–90) menjadi tech debt karena menduplikasi data dari file lain.

**Rekomendasi:**
1. Hapus conditional interruption instruction di `promptBuilder.ts:86–90` dan serahkan sepenuhnya ke `SIMULATION_CHALLENGES`.
2. Jika interruption membutuhkan aturan khusus (kondisional "BOLEH menyela" vs "JANGAN menyela"), tambahkan sebagai properti terpisah di `SimulationChallengeDefinition` daripada conditional logic di builder.
3. Dokumentasikan bahwa `simulationChallenges.ts` adalah source of truth untuk challenge instructions.

---

### T9 — `maxCallDuration` Diterima Builder tetapi Tidak Digunakan 🟡 **RENDAH**

**Lokasi:**
- `promptBuilder.ts:16` — deklarasi parameter `maxCallDuration: number`
- `promptBuilder.ts:19` — destructuring hanya mengambil `{ identity, scenario, consumerType, responsePacingMode }`
- `liveSession.ts:864` — pengiriman `maxCallDuration: this.config.maxCallDuration || 0` ke builder

**Deskripsi:**
Parameter `maxCallDuration` diterima oleh fungsi `buildTelefunLiveSystemInstruction` di parameter `params`, tetapi langsung diabaikan — tidak pernah digunakan dalam template prompt. Nilainya hanya dikirim dari `liveSession.ts:864` dan diterima oleh builder di baris 16, tetapi variabel `maxCallDuration` tidak di-destructure atau digunakan di mana pun.

**Dampak:**
- Developer mungkin mengira durasi panggilan diinformasikan ke model, padahal tidak.
- Time cue terpisah (`sendTimeCue`) menangani pengingat waktu, tapi konteks durasi total panggilan tidak disampaikan ke model sejak awal.
- Menambah kebingungan saat membaca kode: parameter diterima tapi tidak dipakai.

**Rekomendasi:**
1. Integrasikan `maxCallDuration` ke dalam prompt agar model menyadari batas waktu dari awal sesi — misal: "Sesi ini akan berlangsung maksimal X menit."
2. Atau, hapus parameter `maxCallDuration` dari signature fungsi jika memang sengaja tidak digunakan.
3. Pastikan time cue konsisten dengan `maxCallDuration`.

---

## Hal yang Sudah Berjalan Baik

1. **Struktur prompt cukup rapi** — `promptBuilder.ts` mengorganisasi prompt dalam bagian-bagian jelas dengan komentar yang membantu.
2. **Parameterisasi yang baik** — prompt menerima parameter `identity`, `scenario`, `consumerType`, dll., sehingga prompt dapat disesuaikan tanpa mengubah template.
3. **Pemisahan logika** — fungsi `buildTelefunLiveSystemInstruction`, `getTimeCueInstruction`, `getEmotionInstruction` dipisahkan dengan baik.
4. **Pacing mode support** — sudah ada `realistic` vs `training_fast` yang berdampak nyata pada template prompt.
5. **Gender voice included** — meskipun tidak operasional secara teknis, konsistensi karakter sudah dipertimbangkan.
6. **Challenge system modular** — definisi challenge di file terpisah (`simulationChallenges.ts`) yang baik untuk maintainability.
7. **Comprehensive consumer types** — 6 tipe konsumen dengan deskripsi kaya dan tingkat kesulitan berbeda.
8. **Time cue bertahap** — `getTimeCueInstruction` memberikan instruksi berbeda berdasarkan urgency (4 level: 2 menit, 1 menit, 30 detik, 20 detik).

---

## Catatan: Post-Call `telefun-analysis.ts` Terpisah dan Bukan Konflik Persona

`telefun-analysis.ts` (di `apps/api/src/lib/`) adalah modul backend untuk **post-call analysis** — menganalisis kualitas suara agen setelah sesi selesai. Fungsi `analyzeVoiceQuality()` dan `generateCoachingSummary()` bekerja dengan cara:
1. Mengambil rekaman audio dari storage.
2. Mengirim ke Gemini untuk analisis voice quality (speaking rate, intonasi, artikulasi, filler words, emotional tone).
3. Menghasilkan coaching summary.

Modul ini **tidak berinteraksi** dengan system prompt sesi live (`promptBuilder.ts`) dan **tidak ada overlap persona** — analysis prompt-nya adalah untuk menilai suara agen, bukan untuk meniru konsumen. System instruction-nya adalah "Anda adalah pelatih vokal profesional" (baris 213), berbeda dengan persona konsumen di system prompt live.

**Status:** Tidak ada konflik. Modul ini aman dan terisolasi dengan baik.

---

## Struktur Prompt Ideal (Rekomendasi)

Berdasarkan temuan di atas, struktur prompt yang ideal untuk `buildTelefunLiveSystemInstruction` adalah:

```
┌──────────────────────────────────────────────────┐
│  ROLEPLAY: Kamu adalah KONSUMEN                  │
│                                                   │
│  1. IDENTITAS (wajib konsisten)                   │
│     - NAMA, LOKASI, NOMOR HP                      │
│     - JENIS KONSUMEN + DESKRIPSI (rich)           │
│     - EMOSI (berdasarkan ID, bukan substring)     │
│                                                   │
│  2. SKENARIO / MASALAH                            │
│     - Judul & instruksi singkat                   │
│     - Script (1 aturan hierarki jelas)            │
│                                                   │
│  3. ATURAN BICARA (konsolidasi)                   │
│     - 1 aturan larangan menutup (komprehensif)    │
│     - Pacing (realistic vs fast)                  │
│     - Interruption (dari simulationChallenges)    │
│                                                   │
│  4. TANTANGAN (dari simulationChallenges.ts)      │
│     - Daftar challenge sesuai konfigurasi         │
│                                                   │
│  5. ATURAN ROLEPLAY                               │
│     - Jangan menawarkan bantuan                   │
│     - Jangan memperkenalkan diri sebagai AI       │
│                                                   │
│  6. KONSISTENSI SUARA & KARAKTER                 │
│     - Gender (deklaratif, bukan teknis)           │
│     - Emosi sesuai tipe konsumen                  │
└──────────────────────────────────────────────────┘
```

**Perubahan utama dari struktur saat ini:**
1. Gunakan `consumerType.id` untuk deteksi emosi, bukan substring `name`.
2. Sertakan `consumerType.description` secara eksplisit.
3. Konsolidasi aturan penutupan jadi satu bagian.
4. Hapus instruksi voice teknis (serahkan ke API).
5. Hapus batas waktu absolut di silent handling.
6. Gunakan `maxCallDuration` jika diteruskan.
7. Single source of truth: `promptBuilder.ts`, bukan `settings.systemInstruction`.

---

## Prioritas Perbaikan

| Prioritas | Temuan | Upaya | Dampak |
|-----------|--------|-------|--------|
| 🔴 **P1** | T1 — Time cue role user | Sedang | Tinggi: instruksi waktu dapat diabaikan model |
| 🔴 **P1** | T2 — settings.systemInstruction orphan | Rendah | Sedang: source of truth palsu |
| 🟡 **P2** | T3 — Persona substring vs deskripsi rich | Rendah | Sedang: persona kurang nuanced |
| 🟡 **P2** | T4 — Redundansi larangan menutup | Rendah | Rendah: memperpendek prompt |
| 🟡 **P2** | T8 — Challenge overlap | Rendah | Rendah–Sedang: duplikasi instruksi |
| 🟢 **P3** | T5 — Script hierarchy ambigu | Sedang | Rendah: hanya pada edge case |
| 🟢 **P3** | T6 — Voice prompt non-operasional | Rendah | Rendah: tidak memengaruhi fungsional |
| 🟢 **P3** | T7 — Silent handling timer | Rendah | Rendah: model tidak bisa hitung detik |
| 🟢 **P3** | T9 — maxCallDuration unused | Rendah | Rendah: parameter mati |

---

## Cakupan Audit

| Aspek | Status |
|-------|--------|
| System prompt builder | ✅ `promptBuilder.ts` (233 baris) |
| Prompt delivery mechanism | ✅ `liveSession.ts` (1225 baris, difokuskan 850–927, 1205–1219) |
| Settings / konfigurasi prompt | ✅ `telefunSettings.ts` (606 baris, difokuskan 481–606) |
| UI override settings | ✅ `index.tsx` (613 baris, difokuskan 200–217) |
| Challenge definitions | ✅ `simulationChallenges.ts` (36 baris) |
| Post-call analysis (separasi) | ✅ `telefun-analysis.ts` (378 baris) |
| Test coverage prompt builder | ❌ Tidak dalam scope audit ini |
| Runtime behavior log | ❌ Tidak dalam scope audit ini |

**Metodologi:** Read-only — analisis berbasis kode sumber, tanpa eksekusi, testing, atau build. Semua temuan diverifikasi terhadap konten file aktual pada commit saat audit dilakukan.

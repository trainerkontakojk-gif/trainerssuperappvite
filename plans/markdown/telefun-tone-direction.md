# Telefun — arahan nada per giliran, suara per tipe, dan klip nonverbal

Status: siap dikerjakan. Lane **C** (perilaku Telefun lintas file di `apps/web` + `packages/types`, tanpa skema, auth, atau kontrak API publik). Worker yang dituju: Codex `gpt-6-luna`. Disusun 2026-10-28 dari spike suara bersama Fajar.

## Cara membaca plan ini (worker)

1. Baca dulu, berurutan: `AGENTS.md`, `docs/AGENT_WORKFLOW.md` (§3 Lane C, §4 changelog, §7 verifikasi), dan `.claude/skills/trainers-superapp-tdd/SKILL.md`. Skill itu berlaku untuk Codex juga: perlakukan sebagai instruksi kerja.
2. Kerjakan task **berurutan**. Jangan lompat. Setiap task punya titik **STOP**: kalau syaratnya tidak terpenuhi, berhenti dan laporkan ke Fajar dengan bukti, jangan mengarang jalan lain.
3. TDD: tulis E2E Playwright yang gagal dulu (RED), jalankan dan pastikan gagal karena alasan yang benar, baru implementasi (GREEN), lalu rapikan. **Jangan menambah atau menjalankan unit test (Vitest)** tanpa izin Fajar; jangan sentuh `scripts/test-core.json` / `scripts/test-fast.json`.
4. Satu test run pada satu waktu (Mac Fajar tidak kuat paralel). Jalankan E2E terfokus dari `apps/web`:
   `pnpm exec playwright test e2e/<spec>.spec.ts -g "<judul test>"` — jangan `pnpm test:e2e -- -g`.
5. Setiap commit menambah satu baris `- type(scope): ringkasan` di `CHANGELOG.md` di bawah `## <tanggal hari ini>`. Commit dan push ke `main` sudah diizinkan setelah gate hijau; **deploy produksi dan perubahan Supabase remote tidak**.
6. Jangan pernah mencetak, menulis, atau meng-commit `GEMINI_API_KEY`. Jangan ubah file `.env*` (kecuali `.env.example`).

## Requirement

Konsumen AI Telefun (Gemini 3.8 Live) terdengar datar. Spike 2026-10-28 (sampel di `~/Downloads/Telefun Sampel Suara/`) menghasilkan keputusan berikut, semuanya sudah disetujui Fajar:

- **R1 — Arahan nada per giliran.** Aplikasi mengirim catatan tersembunyi `[TELEFUN_CONTROL:TONE] …` ke sesi Live sebelum konsumen menjawab, sehingga alur emosi terdengar (varian "C" di spike). Catatan dipilih oleh **aturan tetap** (fase panggilan, event hold, tipe konsumen), **bukan** model AI tambahan.
- **R2 — Catatan menetapkan batas bawah, bukan memaksa reda.** Aturan tetap tidak bisa menilai empati trainee, jadi catatan tidak boleh menyuruh konsumen melunak pada giliran tertentu. Keputusan reda tetap milik prompt produksi (tangga kesabaran).
- **R3 — Suara mengikuti tipe konsumen, dan menang atas pilihan suara manual** (keputusan Fajar):

  | Tipe                        | Wanita        | Pria                     |
  | --------------------------- | ------------- | ------------------------ |
  | `marah` (Marah & Emosional) | Kore          | Orus atau Alnilam (acak) |
  | `pasrah` (Pasrah & Sedih)   | Kore          | Algieba                  |
  | tipe lain                   | tidak berubah | tidak berubah            |

- **R4 — Konsumen sedih "menahan tangis".** Live tidak bisa benar-benar menangis (spike: "hiks" terdengar seperti terengah-engah). Untuk `pasrah`, tambahkan blok arahan vokal menangis di **atas** prompt (varian C2), ditambah catatan nada per giliran.
- **R5 — Klip nonverbal TTS.** Bunyi yang tidak bisa dibuat Live diputar dari klip WAV pra-buat (Gemini TTS, suara yang sama) **di awal giliran konsumen**, sebelum audio Live:
  - `marah`: `sigh` (hela napas), `groan` (erang), `tsk` (decak), `pff` (dengus), `exhale` (napas berat).
  - `pasrah`: `sniffle` (sedot ingus, disetujui), `sob`, `whimper`.
  - Maksimal satu klip per dua giliran konsumen; tidak pernah saat hold; klip ikut terekam di rekaman panggilan penuh.
- **R6 — Perbaikan daftar suara.** Fajar mendengar **Pulcherrima** sebagai suara pria, padahal `packages/types/src/telefun-voices.ts` memasukkannya ke daftar wanita.
- **R7 — Konsumen menagih saat agen diam.** Saat ini prompt hanya meminta ("Jika agen diam cukup lama, tagih…") dan konsumen tidak konsisten. Kirim kontrol berbasis aturan saat agen diam ±5 detik di luar hold.
- **Bukan scope:** model AI pengarah nada, menyela trainee yang bicara panjang, suara latar (ambience), perubahan UI Pengaturan, perubahan skema/RLS/API.

## Design

### Fakta kode saat ini (sudah diverifikasi 2026-10-28)

- Prompt konsumen: `apps/web/src/routes/telefun/services/promptBuilder.ts` → `buildTelefunLiveSystemInstruction()`. Bagian `KONTROL RUNTIME APLIKASI` (±baris 125) sudah menjelaskan marker `[TELEFUN_CONTROL:TIME_CUE]` dan `[TELEFUN_CONTROL:HOLD_END]`.
- Sesi Live di browser: `apps/web/src/routes/telefun/services/liveSession.ts` (`class LiveSession`).
  - `sendHoldEndCue()` (±baris 1101) dan `sendTimeCue()` (±baris 1611) mengirim teks via `buildGeminiRealtimeTextMessage(text)` = `{ realtimeInput: { text } }` — ini **memicu jawaban** dari model.
  - `handleJsonMessage()` (±baris 438): `serverContent.modelTurn.parts` = konsumen mulai bicara; `serverContent.turnComplete` = giliran konsumen selesai.
  - `playPcm(data, sampleRate)` (±baris 826) menjadwalkan `AudioBufferSourceNode` berurutan lewat `this.nextStartTime`, terhubung ke speaker **dan** `recordingDestination`; berhenti saat `isHeld`.
  - `handleSpeechAndInterruptionState()` (±baris 777) melacak kapan trainee bicara/diam.
- Builder pesan protokol: `apps/web/src/routes/telefun/services/liveProtocol/gemini.ts`.
- Server `apps/telefun` meneruskan pesan klien yang punya `setup`, `realtimeInput`, atau `clientContent` (`isGeminiForwardableMessage`, `apps/telefun/src/server-protocol.ts:121`). **Tidak perlu perubahan backend.**
- Pemilihan suara: `resolveFinalIdentity()` di `apps/web/src/routes/telefun/telefunSettings.ts`, dipanggil di `apps/web/src/routes/telefun/index.tsx` (±baris 300) **setelah** `consumerType` dipilih. Resolver: `apps/web/src/routes/telefun/telefunVoiceRegistry.ts`. Daftar suara per gender: `packages/types/src/telefun-voices.ts`.
- Timeline event: union `TelefunTimelineEventName` di `apps/web/src/routes/telefun/types.ts:107`.
- E2E: server Live ditiru `mockTelefunVoiceServer()` (`apps/web/e2e/helpers/telefunFixtures.ts:478`) yang mengumpulkan semua pesan klien di array `messages` dan bisa mengirim audio PCM palsu (`audioResponse`). Contoh pola: test `"sinyal hold: …"` di `apps/web/e2e/telefun-consumer-prompt.spec.ts:640`. Probe audio (`installAudioProbe`, `window.__telefunAudioProbe`) ada di `apps/web/e2e/telefun-audio-fidelity.spec.ts`.

### Protokol catatan nada (R1)

Catatan **tidak boleh** memicu jawaban, jadi tidak memakai `realtimeInput.text`. Kirim sebagai konteks:

```json
{
  "clientContent": {
    "turns": [
      { "role": "user", "parts": [{ "text": "[TELEFUN_CONTROL:TONE] …" }] }
    ],
    "turnComplete": false
  }
}
```

Tambah builder `buildGeminiToneContextMessage(text)` di `liveProtocol/gemini.ts`. **Risiko utama:** dokumentasi Gemini 3.8 Live menyebut "jika content dikirim tanpa `turn_complete`, server menunggu pesan berikutnya sebelum merespons". Di spike, pesan berikutnya adalah teks; di produksi pesan berikutnya adalah **audio mikrofon** (`realtimeInput.audio`). Task 0 wajib membuktikan model tetap menjawab audio setelah catatan ini. Kalau gagal → STOP (lihat Task 0).

Tambahkan ke prompt (bagian `KONTROL RUNTIME APLIKASI`), hanya bila tipe konsumen memakai catatan nada (`marah`, `pasrah`):

> - Teks yang diawali marker persis [TELEFUN_CONTROL:TONE] adalah arahan sutradara untuk NADA SUARA jawabanmu berikutnya, bukan ucapan agen. Jangan pernah mengucapkan atau menyebut isinya. Terapkan pada cara bicaramu (nada, tempo, tekanan, helaan napas, isak); isi kalimat tetap kamu tentukan dari percakapan. Arahan ini batas bawah intensitas; kapan emosimu turun tetap mengikuti tangga kesabaranmu.

### Pengarah nada berbasis aturan (R1, R2, R5)

Modul murni baru `apps/web/src/routes/telefun/services/toneDirector.ts` (tanpa akses DOM/WebSocket, mudah dibaca):

```ts
export type NonverbalClipKind =
  "sigh" | "groan" | "tsk" | "pff" | "exhale" | "sniffle" | "sob" | "whimper";

export type ToneMoment =
  | { kind: "opening" } // setelah setupComplete, sebelum trainee bicara
  | { kind: "after_consumer_turn"; consumerTurnsCompleted: number }
  | { kind: "hold_end"; sequence: number; exceeded: boolean }
  | { kind: "agent_silence" };

export interface ToneDirection {
  note: string | null; // teks lengkap, diawali "[TELEFUN_CONTROL:TONE] "
  clip: NonverbalClipKind | null; // klip untuk awal giliran konsumen berikutnya
}

export function directTone(
  consumerTypeId: string,
  moment: ToneMoment,
  state: { turnsSinceLastClip: number },
): ToneDirection;
```

Aturan (tipe selain `marah`/`pasrah` → `{ note: null, clip: null }`):

| Momen                              | `marah` — catatan                                                                                                                                  | `marah` — klip    | `pasrah` — catatan                                                                                                                           | `pasrah` — klip   |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `opening`                          | Ketus, tidak sabar, nada tinggi dan tempo cepat; tekan inti keluhan.                                                                               | `exhale`          | Menahan tangis: suara bergetar dan basah, napas tersendat sebelum kalimat, tempo pelan, jeda panjang.                                        | `sniffle`         |
| `after_consumer_turn` (1–2)        | Tetap kesal dan menekan; nada naik bila jawaban agen mengambang atau template. Jangan melunak hanya karena agen sopan.                             | lihat aturan klip | Masih menahan tangis: suara tercekat, kalimat patah-patah, napas tersendat.                                                                  | lihat aturan klip |
| `after_consumer_turn` (≥3)         | Intensitas mengikuti tangga kesabaranmu; tetap kesal kecuali agen sudah mengakui masalah secara spesifik dan memberi langkah plus kepastian waktu. | lihat aturan klip | Suara tetap serak dan sengau seperti habis menangis; boleh sedikit lebih tenang hanya bila agen berempati tulus dan memberi langkah konkret. | lihat aturan klip |
| `hold_end` ke-1, tidak lewat batas | Kesal karena ditahan; hela napas berat sebelum bicara, nada naik.                                                                                  | `sigh`            | Lelah menunggu; suara makin lirih dan bergetar.                                                                                              | `sniffle`         |
| `hold_end` ke-2+ atau lewat batas  | Lebih kesal dari sebelumnya; nada tinggi dan tidak sabar.                                                                                          | `groan`           | Hampir pecah tangis; suara tercekat.                                                                                                         | `sob`             |
| `agent_silence`                    | (lihat R7)                                                                                                                                         | `tsk`             | (lihat R7)                                                                                                                                   | `null`            |

Aturan klip untuk `after_consumer_turn`: hanya bila `state.turnsSinceLastClip >= 2`; `marah` bergiliran `tsk` → `pff` → `exhale`; `pasrah` bergiliran `sniffle` → `whimper` → `sniffle`. Momen `opening` dan `hold_end` selalu boleh memberi klip.

**Aturan isi catatan** (wajib, ada asersi E2E-nya): tidak ada tanda kutip, tidak ada contoh kalimat yang bisa diucapkan, tidak ada angka, tidak ada kata "menangis"/"sesenggukan" sebagai kata tunggal yang bisa terbaca (spike: C2-Charon mengucapkan "sesenggukan" lalu kehilangan suara). Gunakan deskripsi suara ("menahan tangis", "napas tersendat").

### Kapan catatan dikirim (di `LiveSession`)

- `opening`: sekali, setelah `setupComplete` (di `completeSetup()`), sebelum audio trainee pertama dikirim.
- `after_consumer_turn`: setiap `serverContent.turnComplete` (hitung `consumerTurnsCompleted`).
- `hold_end`: di `sendHoldEndCue()`, kirim catatan nada **sebelum** pesan `HOLD_END` yang ada.
- `agent_silence`: lihat R7.
- Setiap pengiriman memancarkan timeline event baru `tone_note_sent` (meta: `moment`, tanpa isi teks).

### Klip nonverbal (R5)

- Aset: `apps/web/public/telefun/nonverbal/<voice-lowercase>/<kind>-<n>.wav` (PCM 16-bit mono 24 kHz). Manifest TS `apps/web/src/routes/telefun/services/nonverbalClips.ts`: peta `voice → kind → string[]` (URL). Hanya suara `Kore`, `Orus`, `Alnilam`, `Algieba`. Suara tanpa entri = tanpa klip.
- Saat panggilan dimulai, `LiveSession` mem-_prefetch_ klip untuk suara aktif saja (`fetch` → validasi header WAV → simpan PCM). Helper `parsePcm16MonoWav(bytes)` menolak WAV yang bukan PCM16 mono 24 kHz.
- Pemutaran: ketika `directTone()` memberi `clip`, simpan sebagai `pendingClip`. Pada **chunk audio model pertama dari giliran baru** (`modelTurn` pertama setelah `turnComplete` sebelumnya / setelah opening), panggil `playPcm(clipPcm)` **lebih dulu**, lalu audio Live mengantre di belakangnya lewat `nextStartTime`. Pilih varian klip bergiliran supaya tidak berulang. Emit timeline `nonverbal_clip_played` (meta: `kind`).
- Tidak memutar bila `isHeld`, `intentionalClose`, atau klip gagal di-prefetch. Prefetch gagal → emit `nonverbal_clip_unavailable` sekali, panggilan **tetap jalan** tanpa klip (fallback tunggal yang dibatasi; tidak ada pesan error ke pengguna karena klip bersifat dekoratif).
- Durasi target: `marah` ≤ 1,2 dtk, `pasrah` ≤ 2,0 dtk (klip ditambahkan di depan jawaban, jadi menambah jeda).

### Sumber klip (keputusan Fajar: skrip dev lokal, tanpa `logAiUsage`)

Skrip dev `scripts/telefun/generate-nonverbal-clips.mjs`: dijalankan manual sekali, **tidak** dipanggil build/CI/runtime, jadi dianggap pembuatan aset, bukan panggilan AI produk. Provenance dicatat di `apps/web/public/telefun/nonverbal/README.md` (model, tag, style, tanggal, asal file).

- Pakai ulang klip yang sudah didengar Fajar (salin dari `~/Downloads/Telefun Sampel Suara/`):
  - Kore marah: `7 Klip marah TTS + Live/Kore-{sigh,groan,tsk,pff,exhale}-r{1,2}.wav`
  - Kore sniffle: `6 Sniffle TTS/Kore-2-r1.wav`, `Kore-2-r2.wav`
  - Kore sob/whimper: `5 Klip tangis TTS + Live/clip-Kore-sob.wav`, `clip-Kore-whimper.wav` (potong ke ≤2,0 dtk dengan fade-out 80 ms)
  - Algieba sniffle: `9 Live sedih - kandidat suara/sniffle-Algieba-r1.wav`, `sniffle-Algieba-r2.wav`
- Buat baru dengan skrip (Orus & Alnilam: `sigh`, `groan`, `tsk`, `pff`, `heavy breath` → `exhale`; Algieba: `sob`, `whimper`; masing-masing 2 varian = 24 panggilan):
  - Endpoint dan body **persis** seperti yang terbukti jalan di spike:
    `POST https://generativelanguage.googleapis.com/v1beta/interactions`, header `x-goog-api-key`, body
    `{ model: "gemini-3.8-flash-tts", input: [{ type: "user_input", content: [{ type: "text", text: "<sigh>", annotations: [{ type: "speech_metadata", style }] }] }], response_format: { type: "audio", mime_type: "audio/l16", sample_rate: 24000 }, generation_config: { speech_config: [{ voice }] }, stream: true }`.
    Respons SSE: ambil part `type: "audio"` dari event `step.delta` (field `delta`) dan `step.start` dengan `step.type === "model_output"` (field `step.content`). **Jangan** menambah field system/developer instruction (error 400).
  - Style marah: `"konsumen yang sedang kesal dan tidak sabar di telepon, tanpa kata"`. Style sedih: `"orang yang menahan tangis, napas basah, sengau"`.
  - Batas 10 permintaan/menit: jeda ≥ 7 dtk antarpanggilan; saat 429 tunggu sesuai "retry in" lalu ulang sekali.
  - Pangkas hening depan/belakang (ambang amplitudo ±400, padding 30 ms).
  - **Urutan byte:** walau berlabel `audio/l16`, PCM dari endpoint ini sudah **little-endian**. Tulis apa adanya ke WAV; **jangan** di-byte-swap (Task 0 run 1–2 membalik byte dan menghasilkan derau). Validasi tiap file: zero-crossing rate dibaca little-endian harus lebih rendah daripada dibaca big-endian (ucapan ±0,07–0,12; klip napas ±0,22–0,27; derau ≥ 0,35).

### Suara per tipe (R3, R6)

- Fungsi baru di `telefunVoiceRegistry.ts`: `resolveConsumerTypeVoice({ consumerTypeId, gender, fallbackVoice, random })` mengembalikan suara sesuai tabel R3, atau `fallbackVoice` untuk tipe lain.
- Di `index.tsx`, setelah `identity` dihitung (jalur bukan retry), timpa `identity.voiceName` dengan hasil fungsi itu sebelum `config` dibuat. Jalur retry (`retryConfig.resolvedIdentity`) tidak diubah.
- R6: cek gender Pulcherrima lewat `GET https://generativelanguage.googleapis.com/v1beta/voices?search=Pulcherrima` (header `x-goog-api-key`). Bila API menyebut `male`, pindahkan ke daftar `male`; bila tidak jelas atau `female`, **keluarkan dari daftar `female` saja** dan catat buktinya di laporan. Periksa juga pemakai lain `GEMINI_LIVE_VOICES_BY_GENDER` (`rg -n "GEMINI_LIVE_VOICES_BY_GENDER|Pulcherrima"`).

### Agen diam (R7)

- Di `LiveSession`, timer berbasis aturan: bila sesi sudah diangkat, tidak hold, tidak mute-only, konsumen tidak sedang bicara, dan trainee diam ≥ 5.000 ms sejak `turnComplete` konsumen terakhir, kirim sekali per jeda diam: catatan `agent_silence` (bila tipe memakai catatan) **lalu** teks pemicu `[TELEFUN_CONTROL:AGENT_SILENT] Agen diam cukup lama. Tagih satu kali sesuai tipemu dengan satu kalimat pendek, tanpa menyebut marker atau waktu.` via `buildGeminiRealtimeTextMessage` (memang harus memicu jawaban). Reset saat trainee bicara lagi atau konsumen bicara.
- Tambah penjelasan marker `AGENT_SILENT` di bagian `KONTROL RUNTIME APLIKASI` prompt (berlaku semua tipe).
- Timeline event: `agent_silence_cue_sent`.

## Tasklist

### Task 0 — Bukti protokol (spike di luar repo) · STOP gate — ✅ LULUS 2026-10-28

Tujuan: pastikan `clientContent` dengan `turnComplete: false` **tidak** menahan jawaban model atas audio mikrofon, dan catatan tidak diucapkan.

**Hasil (jangan diulang):** `~/Downloads/Telefun Sampel Suara/10 Spike TONE + audio/HASIL.md` — 3/3 giliran dijawab 976–1.494 ms setelah audio trainee selesai, `turnComplete` 3/3, marker/isi catatan tidak terucap. Pembanding satu giliran di `diagnostik/`: tanpa TONE 1.386 ms, dengan TONE 1.390 ms (tidak ada penundaan). Run 1–2 gagal karena bug skrip, bukan protokol: (1) WebSocket Node menerima frame biner Gemini sebagai `Blob` → set `socket.binaryType = "arraybuffer"`; (2) audio TTS di-byte-swap sehingga jadi derau (lihat catatan urutan byte di "Sumber klip"). Arsip: `HASIL-run1-…`, `HASIL-run2-…`, `trainee-puck-16k-RUSAK-byte-order.wav`.

Langkah asli (sudah dikerjakan):

- [x] Tulis skrip di `~/Downloads/Telefun Sampel Suara/10 Spike TONE + audio/` (bukan di repo). Kunci dibaca dari `.env.local`/`.env` repo saat runtime, tidak pernah dicetak.
- [x] Buat audio trainee: satu panggilan TTS (endpoint seperti di atas, suara `Puck`, teks `"Mohon maaf Bu, untuk gangguannya kami perlu cek dulu ya, mohon ditunggu."`), resample 24 kHz → 16 kHz.
- [x] Buka WebSocket `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=…` dengan `setup` yang meniru produksi: salin `generationConfig`, `realtimeInputConfig`, `inputAudioTranscription`, `outputAudioTranscription` dari `buildCanonicalGeminiSetup()` (`apps/telefun/src/providers/GeminiLiveAdapter.ts:564`), model `models/gemini-3.8-live`, suara `Kore`, system instruction = prompt produksi tipe `marah` (bangun via `apps/web/node_modules/.bin/tsx` yang mengimpor `buildTelefunLiveSystemInstruction` + `DEFAULT_CONSUMER_TYPES`) ditambah aturan marker TONE di atas.
- [x] Setelah `setupComplete`: kirim catatan TONE (`clientContent`, `turnComplete: false`), lalu alirkan audio trainee sebagai `realtimeInput.audio` (`mimeType: "audio/pcm;rate=16000"`) per 100 ms secara real-time, lalu 2 dtk hening (nol). Ulangi 3 kali dalam satu sesi (3 giliran).
- [x] Catat per giliran: apakah ada `modelTurn` audio, waktu sampai audio pertama, `outputTranscription`. Simpan WAV jawaban dan `HASIL.md`.
- [x] **Lulus** bila 3/3 giliran dijawab dalam < 3 dtk setelah audio selesai dan transkrip tidak memuat isi catatan/marker. **STOP** bila tidak lulus: laporkan ke Fajar dengan HASIL.md; jangan lanjut ke Task 2 dengan mekanisme lain.
- [x] Biaya: ≤ 1 panggilan TTS + 1 sesi Live.

### Task 1 — Suara per tipe dan perbaikan daftar (R3, R6)

- [x] RED: di `apps/web/e2e/telefun-consumer-prompt.spec.ts`, test baru "suara mengikuti tipe: marah/pasrah memakai suara teruji, menimpa pilihan manual". Pakai `mockTelefunVoiceServer` + `messages`; baca `voice` dari pesan `telefun_session_configure`. Kasus: (a) `marah` + wanita → `Kore`; (b) `marah` + pria → `Orus` atau `Alnilam`; (c) `pasrah` + pria → `Algieba`; (d) `marah` + wanita + suara manual `Aoede` di pengaturan → tetap `Kore`; (e) tipe `ramah` + suara manual `Aoede` → `Aoede`. RED gagal pada empat kasus yang berubah; kontrol `ramah` lulus. GREEN: kelima skenario lulus.
- [x] GREEN: `resolveConsumerTypeVoice()` + pemanggilan di `index.tsx`.
- [x] R6 sesuai Design. GET katalog suara Gemini mengembalikan HTTP 200 dengan `id: pulcherrima`, `display_name: Pulcherrima`, `gender: neutral`; sesuai aturan, Pulcherrima dikeluarkan dari daftar wanita saja. Pemakai dan assertion katalog diperbarui.
- [x] Typecheck: `pnpm --filter @trainers/web exec tsc --noEmit`, `pnpm --dir apps/telefun exec tsc --noEmit -p tsconfig.json`, dan `pnpm --dir apps/api exec tsc --noEmit -p tsconfig.json` lulus.
- [x] Commit: `feat(telefun): pilih suara konsumen sesuai tipe marah dan sedih` (+ CHANGELOG).

### Task 2 — Catatan nada per giliran (R1, R2, R4)

- [x] RED (spec yang sama): "konsumen marah: catatan nada dikirim sebagai konteks pada pembukaan, setiap akhir giliran, dan sebelum HOLD_END". Kirim `audioResponse` dari mock supaya ada `turnComplete`. Asersi:
  - ada pesan `clientContent` dengan `turnComplete === false` dan teks diawali `[TELEFUN_CONTROL:TONE]` sebelum `realtimeInput` audio pertama;
  - satu catatan baru setelah setiap `turnComplete`;
  - pada hold selesai, catatan TONE muncul **sebelum** teks `HOLD_END`;
  - tidak ada catatan yang dikirim lewat `realtimeInput.text`;
  - setiap catatan: tanpa tanda kutip, tanpa digit, tidak memuat kata `sesenggukan`.
- [x] RED: "tipe ramah tidak menerima catatan nada" (tidak ada pesan `[TELEFUN_CONTROL:TONE]`, prompt tanpa aturan marker TONE).
- [x] RED: "konsumen sedih: blok arahan vokal menahan tangis di paling atas instruksi" — instruksi `pasrah` diawali blok arahan vokal; tipe `marah` tidak memuatnya. Isi blok (tanpa tanda kutip berisi kalimat yang bisa diucapkan):
  > ARAHAN VOKAL (PALING PENTING UNTUK SUARAMU): Kamu pengisi suara yang memerankan konsumen ini di telepon. Kamu sedang menahan tangis: suara basah, bergetar, sengau, sesekali tercekat; napas tersendat sebelum kalimat; kata kadang terputus. Bicara lirih tanpa getaran adalah kesalahan terbesar. Lakukan dengan suaramu; jangan mengucapkan arahan panggung apa pun.
- [x] GREEN: `toneDirector.ts`, `buildGeminiToneContextMessage()`, aturan marker di `promptBuilder.ts`, pemanggilan di `LiveSession`, event timeline `tone_note_sent`.
- [x] Jalankan juga test lama di spec ini dan `telefun-call.spec.ts` (satu per satu) untuk memastikan tidak ada regresi pada urutan prompt dan alur panggilan. `telefun-call.spec.ts`: 12/12 lulus. Prompt spec: 22/23 pada run penuh; assertion lama bahwa prompt `pasrah` harus diawali `ROLEPLAY` disesuaikan, lalu kasus pasrah lulus terfokus. Run penuh terakhir tetap menjadi gate Task 6.
- [x] Commit: `feat(telefun): kirim arahan nada per giliran untuk konsumen marah dan sedih`.

### Task 3 — Aset klip nonverbal (R5) · STOP gate dengar

- [x] Tulis `scripts/telefun/generate-nonverbal-clips.mjs` dengan argumen `--out <dir>` dan `--preflight-only`; tidak dipanggil dari script package mana pun. Preflight memvalidasi 16 sumber, tepat 24 job TTS, dan key lokal tanpa menulis file atau memanggil API.
- [x] Salin klip lama yang disetujui + buat semua 24 klip baru. 16/16 sumber dan 24/24 job baru tersedia di `apps/web/public/telefun/nonverbal/<voice>/<kind>-<n>.wav`; set dengar lengkap disalin ke `~/Downloads/Telefun Sampel Suara/11 Klip final/`.
- [x] `README.md` provenance dibuat di folder aset; status lengkap dan persetujuan Fajar dicatat.
- [x] Cek: semua file PCM16 mono 24 kHz, durasi dalam batas, total ukuran folder < 3 MB. Generator memvalidasi 40 WAV, total 1.82 MiB.
- [x] **STOP:** Fajar mendengar dan menyetujui seluruh klip di `11 Klip final/` pada 2026-10-29; lanjut ke Task 4.
- [x] Commit: `chore(telefun): tambahkan klip nonverbal TTS untuk konsumen marah dan sedih`.

Progress 2026-10-29: generator preflight passed; all 16 approved sources and 24/24 generated jobs are present. The final three Algieba clips were generated after the earlier cooldown window. The generator validated all 40 WAVs (PCM16 mono 24 kHz, duration and byte-order checks) at 1.82 MiB total. The complete set was copied to `~/Downloads/Telefun Sampel Suara/11 Klip final/` and Fajar approved all clips. Task 3 is complete.

### Task 4 — Pemutaran klip (R5)

- [x] RED: E2E membuktikan klip marah dijadwalkan sebelum audio Live, tidak dijadwalkan saat hold, kegagalan aset tidak menghentikan audio Live, dan tipe ramah tidak meminta klip. Baseline: tiga kasus marah gagal karena tidak ada request klip; kontrol ramah lulus.
- [x] GREEN: `nonverbalClips.ts`, `parsePcm16MonoWav()`, prefetch suara aktif, `pendingClip`, dan event `nonverbal_clip_played` / `nonverbal_clip_unavailable`.
- [x] `hermeticShell` menerima request aset same-origin; seluruh test melakukan `expectHermetic`.
- [x] E2E terfokus: `pnpm exec playwright test e2e/telefun-nonverbal.spec.ts` — 4/4 lulus.
- [x] Commit: `feat(telefun): putar klip nonverbal di awal giliran konsumen`.

### Task 5 — Agen diam (R7)

- [x] RED: `telefun-agent-silence.spec.ts` gagal karena tidak ada `[TELEFUN_CONTROL:AGENT_SILENT]` setelah lima detik; hold control lulus sebelum implementasi.
- [x] GREEN: `AgentSilenceCueTimer` mengirim satu pemicu setelah lima detik di luar hold/mute saat sesi siap; reset ketika trainee mulai bicara atau konsumen mulai bicara; catatan TONE marah dikirim lebih dulu. Prompt runtime menjelaskan marker untuk semua tipe dan event timeline `agent_silence_cue_sent` dipancarkan.
- [x] E2E terfokus: `pnpm exec playwright test e2e/telefun-agent-silence.spec.ts` — 2/2 lulus; menguji batas 4,9/5 detik, satu pemicu per jeda, reset setelah trainee bicara, urutan TONE, prompt, dan hold.
- [x] Commit: `feat(telefun): tagih agen yang diam dengan kontrol berbasis aturan`.

### Task 6 — Review, dokumentasi, verifikasi akhir

- [x] Review `thermo-nuclear`: baca `.claude/skills/thermo-nuclear/SKILL.md` dan terapkan pada seluruh diff; perbaiki temuan.
- [x] Dokumentasi: `docs/telefun.md` — marker `TONE` dan `AGENT_SILENT`, tabel suara per tipe, klip nonverbal + cara regenerasi, keputusan "skrip dev tanpa logAiUsage".
- [x] Verifikasi serial (satu per satu), catat perintah dan hasil persisnya:
  - E2E `telefun-agent-silence.spec.ts` 2/2; `telefun-nonverbal.spec.ts` 4/4; `telefun-consumer-prompt.spec.ts` 23/23; `telefun-call.spec.ts` 12/12; `telefun-audio-fidelity.spec.ts` 26/26.
  - `pnpm --filter @trainers/web exec tsc --noEmit`, `pnpm --dir apps/telefun exec tsc --noEmit -p tsconfig.json`, `pnpm --dir apps/api exec tsc --noEmit -p tsconfig.json` — semuanya exit 0.
  - ESLint pada file yang diubah — exit 0, dua warning unused pada helper playback di perubahan lokal `telefun-call.spec.ts`; `git diff --check` — exit 0.
- [x] Jalankan `graphify update .` sekali setelah semua kode selesai (tidak di-commit; `graphify-out/` lokal): exit 0, 18.216 node dan 34.855 edge; visual HTML dilewati karena melewati batas 5.000 node.
- [x] **Uji dengar manual oleh Fajar** di `pnpm` dev lokal (`scripts/dev-local.mjs`): satu panggilan `marah` (Kore), satu `marah` pria, satu `pasrah` (Kore), satu `pasrah` (Algieba). Worker tidak boleh mengklaim hasil dengar. Fajar menyatakan sudah mendengarkan dan menyetujui keempat panggilan pada 2026-10-29.
- [x] Laporan akhir: lane, plan ini, file yang diubah, perintah + exit status, bukti Task 0, hasil keputusan Pulcherrima, hal yang belum diverifikasi.

Progress 2026-10-29: Task 5 RED/GREEN passed. The hermetic E2E uses a silent fake microphone and pauses the page clock immediately before its mocked consumer turn, then verifies one cue at 5 seconds, no repeat before trainee speech, a fresh interval afterward, TONE ordering for `marah`, and no cue while held. Final serial verification passed: 67/67 tests across five E2E files; web, Telefun, and API typechecks all exit 0; ESLint has only two pre-existing unused-helper warnings in the preserved dirty `telefun-call.spec.ts` hunk. The first audio-fidelity run reported eight extra-source/count failures because the suite used default `marah` and now correctly prefetches an opening clip; setting this PCM-only harness to `ramah` isolated the model-audio assertions and the full suite passed 26/26. Graphify update exited 0. The remaining gate is Fajar's four-call local listening check; no real-provider or physical-device result is claimed.

## Risiko dan catatan

- **Task 0 gagal** = seluruh R1 butuh desain ulang; jangan menambal dengan `realtimeInput.text` (itu memicu jawaban ekstra).
- Klip menambah jeda sebelum konsumen bicara sebesar durasi klip; jaga batas durasi.
- Live kadang menulis "(Hela napas)" di transkrip output; itu anotasi transkripsi, tidak perlu disaring di task ini, tetapi perhatikan dampaknya ke penilaian bila muncul di Telaah.
- Algieba sekali salah sapa ("Pak" setelah "Mas") di spike; amati saat uji dengar manual.
- Charon dan suara "Informative" lain terdengar datar untuk emosi; jangan dipakai untuk `marah`/`pasrah`.

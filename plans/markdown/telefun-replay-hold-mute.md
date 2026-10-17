# Telefun — senyapkan hold di replay Telaah

Lane C (perubahan perilaku web lintas file, tanpa backend/skema).

## Requirement

- Sesi Telefun sebelum commit `29439902` (22 Sep 2026) merekam suara mikrofon agen selama hold, walau suara itu tidak dikirim ke konsumen AI. Contoh: sesi `447f3435-0df7-45a0-995a-217aa9d98a7a` (10 Sep 2026, 4 hold).
- Pemutar Telaah harus senyap selama setiap interval hold dari `session_metrics.hold.intervals`, baik saat diputar melewati batas hold maupun saat digeser ke dalamnya.
- Di luar hold, suara tetap terdengar. Sesi baru (sudah senyap di rekaman) tidak berubah secara terdengar.
- Di luar cakupan: berkas unduhan rekaman, rekaman tersimpan, penilaian ulang, dan gelombang.

## Design

- Interval hold diukur dari jam sesi `LiveSession.sessionStartTime` (saat `auth_ok`), bukan dari awal rekaman. Perekam mulai lebih dulu, jadi jam rekaman mendahului jam sesi.
- Sesi `447f3435`: durasi pemutar 906,22 dtk dan `sessionDurationMs` 906.161, sehingga selisihnya +0,56 dtk.
  - Diukur pada timeline elemen `<audio>` di produksi setelah deploy, hold ke-4 (jendela senyap berakhir 848,0 dtk): suara agen selama hold berhenti di 847,5 dtk dan konsumen mulai di 848,3 dtk.
  - Hold ke-3: agen menyapa lagi di 572,5 dtk, sesudah jendela berakhir di 571,4 dtk.
  - Awal hold ke-4 (735,2 dtk): ucapan agen sebelum hold selesai di 734,8 dtk, jadi tidak terpotong.
  - Hasil `decodeAudioData` lebih pendek 1,7 dtk (904,5 dtk) karena mengabaikan celah timestamp WebM. Karena itu timeline hasil decode tidak bisa dipakai untuk menyelaraskan.
- Selisih jam = `durasiRekaman − (sessionDurationMs − 500)`. Selisih ini dibatasi; lebih dari ±3 dtk dianggap tidak andal dan menjadi 0. Helper murni `holdWindowsInRecording` ada di `utils/recordingAudio.ts`.
- `TelefunCallPlayer` menerima `sessionDurationMs` dan mengatur `audio.muted` saat `timeupdate`, `seeked`, dan di loop `requestAnimationFrame` selama diputar, supaya batas hold presisi. Pita hold di garis waktu memakai jendela yang sama.

## Tasklist

1. E2E RED di `apps/web/e2e/telefun-flow.spec.ts`: hold 121–148 dtk, selisih −1 dtk. Senyap di dalam jendela (digeser dan diputar melewati batas), bersuara di luar.
2. Implementasikan helper dan pemutar; teruskan `sessionDurationMs` dari `TelefunReviewStage`.
3. GREEN, lalu typecheck/lint web, `thermo-nuclear`, `git diff --check`.

## Tambahan: mute

### Requirement

- Mute juga menyenyapkan replay Telaah, seperti hold. Interval mute belum pernah disimpan, jadi ini hanya berlaku untuk sesi baru. Sesi sebelum 21 Agustus 2026 (sebelum `17c5dcbb`) yang ikut merekam suara mute tidak bisa diperbaiki.

### Design

- `SessionMetrics.mutes?: TelefunMuteInterval[]` (`startedAtMs`, `endedAtMs` di jam sesi). Field ini opsional dan ditambahkan ke jsonb `session_metrics` yang sudah `z.any()` di API, jadi tidak perlu migrasi atau perubahan backend.
- `LiveSession.setMute` mencatat awal dan akhir mute. Mute yang masih aktif ditutup di `buildSessionMetrics`. Mute yang dimulai sebelum `auth_ok` dicatat dari 0.
- Pemutar menyenyapkan audio selama gabungan interval hold dan mute, dengan geser jam yang sama. Pita oranye tetap hanya untuk hold.

### Tasklist

1. E2E RED (`telefun-call.spec.ts`): Bisukan lalu Bunyikan menghasilkan satu interval di `session_metrics.mutes` pada PATCH sesi.
2. E2E RED (`telefun-flow.spec.ts`): replay senyap di dalam interval mute.
3. Implementasi, GREEN, typecheck/lint, `thermo-nuclear`.

## Revisi: mute tidak lagi disenyapkan (2026-10-17)

- Audit: selama mute, `LiveSession` hanya mematikan track mikrofon agen (`applyMicrophoneCaptureStateToTracks`); `playPcm` tetap memutar dan merekam suara konsumen AI (hanya diblok saat hold). Menyenyapkan replay selama mute justru membuang suara konsumen yang benar-benar didengar agen, tanpa manfaat untuk suara agen (sudah senyap di rekaman).
- Pemutar Telaah kembali hanya menyenyapkan interval hold. `session_metrics.mutes` tetap dicatat sebagai data sesi.
- E2E `telefun-flow.spec.ts` ("rekaman tetap bersuara selama mute; hanya hold yang senyap") RED lebih dulu, lalu GREEN.

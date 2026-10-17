# Telefun — senyapkan hold di replay Telaah

Lane C (perubahan perilaku web lintas file, tanpa backend/skema).

## Requirement

- Sesi Telefun sebelum commit `29439902` (22 Sep 2026) merekam suara mikrofon agen selama hold, walau suara itu tidak dikirim ke konsumen AI. Contoh: sesi `447f3435-0df7-45a0-995a-217aa9d98a7a` (10 Sep 2026, 4 hold).
- Pemutar Telaah harus senyap selama setiap interval hold dari `session_metrics.hold.intervals`, baik saat diputar melewati batas hold maupun saat digeser ke dalamnya.
- Di luar hold, suara tetap terdengar. Sesi baru (sudah senyap di rekaman) tidak berubah secara terdengar.
- Di luar cakupan: berkas unduhan rekaman, rekaman tersimpan, penilaian ulang, dan gelombang.

## Design

- Interval hold diukur dari jam sesi `LiveSession.sessionStartTime` (saat `auth_ok`), bukan dari awal rekaman. Bukti sesi `447f3435`: rekaman 904,5 dtk, `sessionDurationMs` 906.161, dan metrik ditulis ±500 ms setelah perekam berhenti. Di hold ke-4, suara AI konsumen (yang diblokir selama hold) mulai ±1,1 dtk sebelum `endedAtMs`. Jadi jam rekaman tertinggal ±1,16 dtk.
- Selisih jam = `durasiRekaman − (sessionDurationMs − 500)`. Selisih ini dibatasi; lebih dari ±3 dtk dianggap tidak andal dan menjadi 0. Helper murni `holdWindowsInRecording` ada di `utils/recordingAudio.ts`.
- `TelefunCallPlayer` menerima `sessionDurationMs` dan mengatur `audio.muted` saat `timeupdate`, `seeked`, dan di loop `requestAnimationFrame` selama diputar, supaya batas hold presisi. Pita hold di garis waktu memakai jendela yang sama.

## Tasklist

1. E2E RED di `apps/web/e2e/telefun-flow.spec.ts`: hold 121–148 dtk, selisih −1 dtk. Senyap di dalam jendela (digeser dan diputar melewati batas), bersuara di luar.
2. Implementasikan helper dan pemutar; teruskan `sessionDurationMs` dari `TelefunReviewStage`.
3. GREEN, lalu typecheck/lint web, `thermo-nuclear`, `git diff --check`.

# KETIK — konsumen menunggu agen selesai mengetik

Status: siap dikerjakan. Lane **C** (perilaku chat KETIK lintas file di `apps/web`, tanpa skema, auth, RLS, atau kontrak API). Worker yang dituju: Codex `gpt-6-luna`. Disusun 2026-10-29 dari keluhan peserta dan diskusi dengan Fajar.

## Cara membaca plan ini (worker)

1. Baca dulu, berurutan: `AGENTS.md`, `docs/AGENT_WORKFLOW.md` (§3 Lane C, §4 changelog, §7 verifikasi), dan `.claude/skills/trainers-superapp-tdd/SKILL.md`. Skill itu berlaku untuk Codex juga: perlakukan sebagai instruksi kerja.
2. **Kerjakan di worktree terpisah, bukan di checkout utama.** Checkout utama (`/Users/nadindyta/Downloads/_Projects/trainerssuperappvite`) berisi pekerjaan Telefun yang belum di-commit. Jangan `git stash`, `git checkout`, `git reset`, atau `git add -A` di sana. Langkah setup ada di Task 0.
3. Kerjakan task **berurutan**. Setiap task punya titik **STOP**: kalau syaratnya tidak terpenuhi, berhenti dan laporkan ke Fajar dengan bukti, jangan mengarang jalan lain.
4. TDD: tulis E2E Playwright yang gagal dulu (RED), jalankan dan pastikan gagal karena alasan yang benar, baru implementasi (GREEN), lalu rapikan. **Jangan menambah atau menjalankan unit test (Vitest)** tanpa izin Fajar; jangan sentuh `scripts/test-core.json` / `scripts/test-fast.json`.
5. Satu test run pada satu waktu (Mac Fajar tidak kuat paralel). Sebelum menjalankan Playwright, pastikan tidak ada dev server atau Playwright lain yang jalan dari checkout utama (`pgrep -fl "playwright|vite"`). Kalau ada, tunggu atau tanya Fajar. Jalankan E2E terfokus dari `apps/web` di worktree:
   `pnpm exec playwright test e2e/ketik-server-chat.spec.ts -g "<judul test>"`. Jangan pakai `pnpm test:e2e -- -g`.
6. Setiap commit menambah satu baris `- type(scope): ringkasan` di `CHANGELOG.md` di bawah `## <tanggal hari ini>`. Commit dan push ke `main` sudah diizinkan setelah gate hijau; **deploy produksi dan perubahan Supabase remote tidak**.
7. Jangan ubah file `.env*` (kecuali `.env.example`).

## Requirement

Peserta mengeluh balasan konsumen AI muncul saat mereka masih mengetik bubble lanjutan, sehingga penjelasan mereka "terpotong". Menyela sesekali itu wajar di chat sungguhan, tapi sekarang hampir pasti terjadi setiap kali agen memecah pesan.

- **R1 — Agen yang sedang mengetik menahan konsumen.** Selama kolom balasan berisi draf yang masih diedit, konsumen belum meminta balasan ke AI. Agen dianggap selesai mengetik bila tidak ada ketikan selama `DRAFT_IDLE_MS` (5 detik), atau bila kolomnya dikosongkan.
- **R2 — Balasan yang sudah jadi juga ditahan.** Kalau balasan AI sudah selesai tetapi belum tampil, dan agen mulai/masih mengetik, bubble konsumen ditahan dengan aturan R1 yang sama.
- **R3 — Ada batas atas, supaya konsumen tetap bisa menyela.** Penahanan R1 dan R2 masing-masing paling lama `MAX_TYPING_HOLD_MS` sejak saat konsumen seharusnya bertindak tanpa penahanan: **30 detik** (realistic), **15 detik** (training fast). Lewat dari itu, konsumen membalas walaupun agen masih mengetik.
- **R4 — Jeda diam setelah kirim lebih panjang.** `QUIET_WINDOW_MS` berubah dari 3000/1200 menjadi **8000 (realistic) / 3000 (training fast)**, dan sekarang ikut dikalikan `consumerSpeedFactor` (jadi _terburu-buru_ ≈ 4,8 detik, _marah_ 6 detik di mode realistic).
- **R5 — Waktu habis tetap menang.** Penahanan tidak berlaku pada jalur penutupan (`owesClosing`) dan tidak boleh mendorong balasan melewati `expiresAt`. Bila sisa waktu < 20 detik, tidak ada penahanan.
- **Angka di R1, R3, dan R4 adalah default yang disepakati.** Fajar akan membandingkannya dengan p90 `agent_bubble_gap` dari data produksi. Taruh semua angka di `apps/web/src/routes/ketik/lib/pacing.ts` sebagai konstanta bernama supaya mudah diganti.
- **Bukan scope:** membatalkan/menghapus balasan yang sudah dipublikasikan server (butuh RPC/migrasi, Lane D), telemetri waktu tampil balasan atau status draf (butuh skema), perubahan backend `apps/api`, perubahan UI yang terlihat, dan perubahan prompt konsumen.

## Design

### Fakta kode saat ini (diverifikasi 2026-10-29 di `a6663be7`)

- Konstanta tempo: `apps/web/src/routes/ketik/lib/pacing.ts`. `QUIET_WINDOW_MS = { realistic: 3000, training_fast: 1200 }` (baris 24), `readingMs()` (baris 13), `consumerSpeedFactor()` (baris 34), `REALISTIC_RANGES` / `TRAINING_FAST_RANGES` untuk jeda tampil.
- Penjadwal: `apps/web/src/routes/ketik/hooks/useServerKetikChat.ts`.
  - `scheduleResponse()` (±baris 211) menghitung `dueAt = lastSendAt + max(QUIET_WINDOW_MS[mode], readingMs(...) * factor)` lalu memasang `responseTimer` yang memanggil `requestResponse()`. Faktor kecepatan **tidak** mengenai `QUIET_WINDOW_MS`.
  - `requestResponse()` (±baris 304) menyalakan indikator mengetik (`setTyping(true)`), memanggil `ketikApi.requestResponse`, lalu menampilkan balasan satu per satu lewat `wait(...)` dan `hidden.current` (±baris 390–407). Loop tampil ini **tidak** tahu apakah agen sedang mengetik.
  - `send()` (±baris 499) mereset `lastSendAt` dan membatalkan `responseTimer`.
  - Hook mengembalikan `{ messages, isLoading, isConsumerTyping, queuedCount, error, retry, retryLabel, send, sessionPhase }`.
- Komposer: `apps/web/src/routes/ketik/components/ChatInterface.tsx`. Draf disimpan lokal di `inputText`. Perubahan lewat `onChange` (±baris 413), `insertTemplate()` (±baris 162), dan dikosongkan di `handleSend()` (±baris 157). Draf tidak pernah sampai ke hook.
- Backend sudah mencoba ulang sekali dengan konteks terbaru bila pesan agen masuk saat AI sedang menyusun balasan (`superseded`, migrasi `20261020160000_ketik_durable_agent_messages.sql` ±baris 396). Plan ini tidak mengubahnya.
- E2E: `apps/web/e2e/ketik-server-chat.spec.ts`. Pola mock ada di test `"two quick agent messages are stored separately and answered by one response request"` (±baris 908): `session()` default memakai `responsePacingMode: "training_fast"`, route `/messages` menambah pesan agen, route `/respond` menghitung panggilan dan menambah balasan konsumen. Test di ±baris 259 mencatat: **pakai waktu nyata, bukan `page.clock`**, karena clock palsu membuat animasi keluar indikator mengetik macet.

### Bentuk perubahan yang disarankan

1. **`pacing.ts`**: ubah `QUIET_WINDOW_MS`, tambah `DRAFT_IDLE_MS = 5000` dan `MAX_TYPING_HOLD_MS = { realistic: 30000, training_fast: 15000 } as const`. Komentar satu baris per konstanta, mengikuti gaya file.
2. **Hook**: tambah fungsi yang dikembalikan, misalnya `noteDraft(text: string)`, yang menyimpan `{ active: text.trim().length > 0, at: Date.now() }` di ref. Jangan pasang ulang timer di setiap ketikan. Cukup periksa status draf ketika timer jatuh tempo:
   - Di `scheduleResponse()`: setelah `dueAt` dasar dihitung, simpan `holdUntil = dueAt + MAX_TYPING_HOLD_MS[mode]` (reset setiap `send()`). Saat timer jatuh tempo dan agen masih mengetik (`active && now - at < DRAFT_IDLE_MS`) dan `now < holdUntil`, jadwalkan ulang ke `min(at + DRAFT_IDLE_MS, holdUntil)` alih-alih meminta balasan.
   - Saat draf menjadi kosong (`active` berubah ke `false`), panggil `scheduleResponseRef.current()` supaya konsumen tidak menunggu sisa `DRAFT_IDLE_MS`.
   - Di loop tampil `requestResponse()`: sebelum membuka `hidden` untuk setiap balasan, tunggu selama agen masih mengetik, dibatasi `revealHoldUntil = (waktu tampil terjadwal) + MAX_TYPING_HOLD_MS[mode]` dan `expiresAt - 5000`. Pakai `wait()` yang sudah ada supaya unmount tetap membersihkan timer.
   - Lewati semua penahanan bila `owesClosing(session)` atau sisa waktu < 20 detik (R5).
3. **`ChatInterface.tsx`**: panggil `noteDraft` di setiap tempat `inputText` berubah (ketikan, sisipan template, kosong setelah kirim). Cara paling sederhana: satu `useEffect` pada `inputText`.
4. Tidak ada perubahan pada `packages/types`, `apps/api`, atau skema.

Kalau saat drift-check ternyata bentuk ini tidak cocok dengan kode (misalnya ada penjadwal lain yang juga memanggil `/respond`), STOP dan laporkan. Jangan menambah jalur kedua.

## Tasklist

### Task 0 — Worktree dan baseline

Fajar menjalankan langkah setup di checkout utama (worker tidak menyalin file `.env*`):

```bash
cd /Users/nadindyta/Downloads/_Projects/trainerssuperappvite
git fetch origin
git worktree add ../trainerssuperappvite-ketik-pacing -b feat/ketik-typing-aware-pacing origin/main
# salin env lokal (bukan .env.example) ke worktree, struktur folder tetap
find . -maxdepth 3 -name '.env*' ! -name '.env.example' -not -path '*/node_modules/*' \
  -exec sh -c 'mkdir -p "../trainerssuperappvite-ketik-pacing/$(dirname "$1")" && cp "$1" "../trainerssuperappvite-ketik-pacing/$1"' _ {} \;
cd ../trainerssuperappvite-ketik-pacing && pnpm install
```

Worker, dari `../trainerssuperappvite-ketik-pacing`:

- [ ] `git status -sb` menunjukkan branch `feat/ketik-typing-aware-pacing`, bersih, dan plan ini ada di `plans/markdown/`.
- [ ] Drift-check fakta di §Design terhadap kode.
- [ ] Jalankan baseline: `pnpm exec playwright test e2e/ketik-server-chat.spec.ts -g "two quick agent messages"` dan `-g "typed out one at a time"`. Keduanya harus hijau.
- **STOP** kalau baseline merah atau fakta kode berbeda material.

### Task 1 — RED: E2E perilaku baru

Tambah test di `apps/web/e2e/ketik-server-chat.spec.ts` dengan pola mock test ±baris 908, waktu nyata. Ukur dengan `Date.now()` di route handler, beri toleransi ±1 detik.

- [ ] **"the consumer waits while the agent is still typing a follow-up"** (training fast): kirim satu pesan, lalu ketik draf satu karakter per ±1 detik selama ±8 detik tanpa mengirim. Pastikan `/respond` tidak dipanggil selama itu. Setelah berhenti mengetik, `/respond` dipanggil kira-kira `DRAFT_IDLE_MS` kemudian.
- [ ] **"clearing the draft releases the consumer"**: ketik draf, lalu kosongkan. `/respond` dipanggil tanpa menunggu `DRAFT_IDLE_MS` penuh (tetap setelah jeda diam).
- [ ] **"the consumer interrupts once the typing hold runs out"** (training fast): ketik terus tanpa henti. `/respond` tetap dipanggil sekitar `QUIET_WINDOW_MS + MAX_TYPING_HOLD_MS` (≈ 18 detik) setelah kirim.
- [ ] **"a ready reply stays hidden while the agent types"**: `/respond` langsung mengembalikan balasan. Mulai mengetik begitu handler `/respond` terpanggil dan terus mengetik. Bubble konsumen tidak terlihat selama agen mengetik, lalu terlihat setelah agen berhenti ±`DRAFT_IDLE_MS`.
- [ ] **"realistic mode waits eight seconds after a send"**: `session({ config: { ...realistic } })` dengan tipe konsumen faktor 1. Pastikan `/respond` tidak dipanggil sebelum ±7 detik dan dipanggil sebelum ±10 detik.
- [ ] Jalankan setiap test baru satu per satu. Semuanya harus gagal **karena perilaku lama** (konsumen menyela / jeda 3 detik), bukan karena selector atau mock salah. Simpan output RED untuk laporan.
- **STOP** kalau ada test yang lolos sebelum implementasi, atau gagal karena alasan lain.

### Task 2 — GREEN: implementasi

- [ ] Terapkan §Design "Bentuk perubahan yang disarankan" butir 1–3.
- [ ] Jalankan lima test baru satu per satu sampai hijau, lalu dua test baseline Task 0.
- [ ] Jalankan juga test yang menyentuh tempo dan waktu habis di spec yang sama: `-g "at expiry the consumer says goodbye once"` dan `-g "remain sendable while one contextual response is processing"`.
- **STOP** kalau test lama perlu diubah ekspektasinya. Satu-satunya pengecualian adalah waktu tunggu (`timeout`) yang jelas kalah oleh jeda baru; catat setiap perubahan itu beserta alasannya.

### Task 3 — Rapikan dan gate

- [ ] Refactor tanpa mengubah perilaku. Gaya dan kepadatan komentar mengikuti file sekitarnya.
- [ ] Review `thermo-nuclear` (`.claude/skills/thermo-nuclear/SKILL.md`) atas diff, lalu perbaiki temuan.
- [ ] Dari root worktree: `pnpm --filter @trainers/web typecheck`, `pnpm --filter @trainers/web exec eslint <file yang diubah>`, dan `git diff --check`.
- [ ] Jalankan seluruh `e2e/ketik-server-chat.spec.ts` dan `e2e/ketik-flow.spec.ts` sekali di akhir.
- [ ] Perbarui deskripsi tempo KETIK di `docs/modules.md` (satu atau dua kalimat: konsumen menunggu agen selesai mengetik, dengan batas atas).

### Task 4 — Commit, gabung, bersihkan

- [ ] Commit di branch worktree dengan entri `CHANGELOG.md`, misalnya `- fix(ketik): konsumen menunggu agen selesai mengetik sebelum membalas`.
- [ ] `git fetch origin && git rebase origin/main`. Konflik `CHANGELOG.md` dengan pekerjaan Telefun: pertahankan kedua baris di bawah tanggal yang sama.
- [ ] Ulangi test baru sekali setelah rebase kalau rebase mengubah file KETIK (seharusnya tidak).
- [ ] Push langsung ke main dari worktree, **tanpa** menyentuh checkout utama: `git push origin HEAD:main`.
- [ ] Laporkan ke Fajar: daftar commit, output RED/GREEN, perintah gate yang dijalankan beserta hasilnya, dan perubahan `timeout` test lama kalau ada.
- [ ] Fajar yang menghapus worktree setelah menerima laporan: `git worktree remove ../trainerssuperappvite-ketik-pacing && git branch -d feat/ketik-typing-aware-pacing`. Checkout utama cukup `git pull --ff-only` setelah pekerjaan Telefun di-commit.

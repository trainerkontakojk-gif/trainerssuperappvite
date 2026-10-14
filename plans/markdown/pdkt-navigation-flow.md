# PDKT Navigation Flow

Lane C (perilaku navigasi lintas beberapa file di modul PDKT, tanpa skema/RLS/kontrak API). Wajib memuat skill `trainers-superapp-tdd` sebelum mengedit. Ikuti `AGENTS.md` dan `docs/AGENT_WORKFLOW.md`.

## Requirement

Audit route PDKT setelah redesain (2026-10-14) menemukan alur navigasi yang janggal. Semua path di bawah relatif ke `apps/web/src`.

### F1 — Tombol Back browser keluar dari PDKT (prioritas tinggi)

Ruang kerja PDKT (kotak masuk, Pahami, Tanggapi, Telaah) hanya disimpan sebagai state React `view: "home" | "mailbox"` di `routes/pdkt/index.tsx`. Email terpilih ada di state `selectedId` di `routes/pdkt/simulation.tsx`. URL tetap `/pdkt`.

- Beranda → `/pdkt` → Mulai simulasi → Back browser: user kembali ke Beranda, bukan ke landing PDKT.
- Gestur back di HP berperilaku sama. Seharusnya gestur itu kembali dari detail email ke daftar.
- Refresh saat di Telaah atau Pahami membuang posisi dan kembali ke landing.

### F2 — Dari Riwayat ke sesi, tidak ada jalan kembali ke Riwayat di aplikasi

Riwayat (`routes/pdkt/history.tsx`) → link sesi `/pdkt?sesi=<id>` → landing memuat riwayat lagi, lalu membuka Telaah. Akibatnya:

- Landing sempat tampil sekilas sebelum Telaah terbuka.
- Tombol header Telaah berlabel "Kotak masuk" membawa ke kotak masuk. Dari sana, panah kiri membawa ke landing. User yang datang dari Riwayat tidak punya tombol untuk kembali ke Riwayat.

### F3 — Ruang kerja → Riwayat → kembali kehilangan posisi

Tombol Riwayat di sidebar kotak masuk (`routes/pdkt/simulation.tsx`, `onHistory`) pindah ke `/pdkt/history`. Saat kembali (link "PDKT" maupun Back browser), user mendarat di landing, bukan di kotak masuk. `simulationSubject` (peserta yang dipilih trainer/admin) juga ter-reset ke `self`.

### F4 — "Latihan lagi" membuat email untuk subjek yang salah (bug data)

`handleStartNew` di `routes/pdkt/simulation.tsx` mengirim prop `simulationSubject` ke `pdktClient.session.create`. Prop itu berasal dari pemilih peserta saat masuk ruang kerja, dan default-nya `{ type: "self" }`. Sesi yang dibuka dari Riwayat atau dari "Sesi terakhir" di landing (`handleSelectSession`) tidak melewati pemilih peserta. Akibatnya "Latihan lagi dengan skenario ini" di Telaah membuat email atas nama trainer, bukan atas nama peserta pemilik sesi. Hal yang sama terjadi saat menelaah email milik peserta B di ruang kerja yang dibuka untuk peserta A.

### F5 — Pemilih peserta muncul untuk membuka email lama

Landing → klik email di "Belum dibalas" → `handleStartSimulation(mailboxId)` memunculkan `SimulationSubjectPicker` untuk role dengan `simulation.subject.select`. Email itu sudah punya `simulationSubject` sendiri, sedangkan pilihan pemilih hanya berlaku untuk email baru.

### F6 — Hal kecil

- a. Di tahap Tanggapi, tombol header "Kotak masuk" (`backToInbox`) kembali ke Pahami dengan email yang sama. Di HP, yang tampil adalah detail email, bukan daftar, sehingga label tidak sesuai.
- b. Breadcrumb `/pdkt/history` (`components/layout/nav-config.ts`) hanya menampilkan "PDKT" tanpa link dan tanpa crumb "Riwayat".
- c. Route `/pdkt/simulation` (`router.tsx`, `components/Layout.tsx` `isStandaloneRoute`, crumb "Simulasi" di `nav-config.ts`) tidak dirujuk dari mana pun. Kalau dibuka langsung, pemilih peserta terlewati.

### Acceptance criteria

1. Masuk ruang kerja dari landing menambah entri history. Back browser dari kotak masuk kembali ke landing PDKT.
2. Membuka email di ruang kerja menambah entri history. Di HP, Back dari detail email kembali ke daftar. Di desktop, Back kembali ke kotak masuk tanpa email terpilih.
3. Refresh di kotak masuk atau di email terpilih (Pahami/Telaah) membuka kembali posisi yang sama. Tahap Tanggapi boleh jatuh ke Pahami untuk email yang sama; drafnya sudah tersimpan di `localStorage` (`pdkt_draft_<id>`).
4. Riwayat → sesi → Back browser kembali ke Riwayat tanpa landing tampil sekilas. Telaah yang dibuka dari Riwayat punya tombol kembali berlabel "Riwayat" yang menuju `/pdkt/history`.
5. Ruang kerja → Riwayat → Back browser kembali ke kotak masuk dengan subjek peserta yang sama.
6. "Latihan lagi" di Telaah membuat sesi dengan `simulationSubject` milik email yang sedang ditelaah, bukan subjek ruang kerja. Ini dibuktikan lewat body request `POST /api/pdkt/session/create` di E2E.
7. Klik email "Belum dibalas" di landing langsung membuka email itu tanpa pemilih peserta. "Mulai simulasi" tetap memunculkan pemilih untuk role yang berhak.
8. F6a: di tahap Tanggapi, tombol header berlabel sesuai tujuannya ("Kembali ke email" atau setara), atau membawa ke daftar. Pilih salah satu dan jelaskan di PR.
9. F6b: breadcrumb `/pdkt/history` = `PDKT (link /pdkt) › Riwayat`.
10. F6c: `/pdkt/simulation` redirect ke `/pdkt` (pola yang sama dengan `/ketik/history` di `router.tsx`). Hapus pengecualian `isStandaloneRoute` dan crumb "Simulasi".
11. Seluruh test PDKT yang sudah ada di `apps/web/e2e/pdkt-flow.spec.ts` tetap hijau.

### Di luar scope

- Redesain visual, kontrak API, skema, dan RLS.
- Modul lain (KETIK, Telefun, SIDAK).
- Membuat tahap Tanggapi bisa dipulihkan lewat URL (cukup Pahami/Telaah, lihat AC 3).

## Design

### State ruang kerja ke search param `/pdkt`

Perluas `validateSearch` route `/pdkt` di `router.tsx`. Pertahankan `sesi` untuk kompatibilitas link lama.

```ts
type PdktSearch = {
  sesi?: string; // sudah ada: buka sesi riwayat
  ruang?: 1; // ruang kerja terbuka
  email?: string; // mailbox id terpilih
  dari?: "riwayat"; // asal navigasi, untuk tombol kembali di Telaah
};
```

- `view` di `routes/pdkt/index.tsx` diturunkan dari `ruang` (bukan `useState`). Masuk ruang kerja = `navigate({ search: { ruang: 1, ... } })` (push). `onBack` ruang kerja = `navigate({ to: "/pdkt", search: {} })` atau `history.back()` bila entri sebelumnya adalah landing. Pilih satu primary path dan dokumentasikan; jangan dua mekanisme paralel.
- `selectedId` di `routes/pdkt/simulation.tsx` dikontrol dari `email`. Memilih email = push. `onBackToList` dan `backToInbox` (Telaah) = hapus `email`. `PdktSimulation` menerima `selectedId` dan `onSelectedIdChange` sebagai prop. Saat ini `PdktSimulation` hanya dipakai dari landing (setelah F6c), jadi tidak perlu mode tak terkontrol.
- Efek auto-select desktop (`useEffect` yang memilih email "open" pertama) harus memakai `replace: true` agar tidak menambah entri history, dan tidak boleh menimpa `email` dari URL selama `mailboxItems` belum termuat. Perilaku ini sudah ada; jangan sampai rusak.
- Email replay sintetis (`replay_<historyId>`) tidak punya baris mailbox. Untuk itu `email` tidak dipakai; pertahankan `sesi` sebagai sumber, tapi jangan langsung menghapusnya lewat `replace` seperti sekarang. Biarkan `?sesi=<id>&ruang=1&dari=riwayat` tetap di URL selama Telaah terbuka, supaya refresh dan Back konsisten.
- F2 "landing tampil sekilas": saat `sesi` ada, render skeleton ruang kerja (bukan landing) sampai riwayat termuat.

### Subjek peserta

- F3: simpan `simulationSubject` terpilih di `sessionStorage` dengan kunci per akun (`pdkt_subject_<userId>`). Pulihkan saat `ruang=1` di-mount tanpa melewati pemilih. Reset saat akun berganti (efek `accountKey` yang sudah ada). Bungkus akses storage dengan try/catch dan fallback ke `self`.
- F4: di `handleStartNew` untuk "Latihan lagi" dari Telaah, pakai `selectedItem.simulationSubject` bila ada. Petakan dari snapshot mailbox ke bentuk `SimulationSubjectSelection` yang diterima `session.create`; periksa tipe di `packages/types`. Kalau `participantId` null (peserta sudah dihapus), jangan diam-diam pindah ke `self`: nonaktifkan tombol dan beri pesan yang manusiawi. "Buat email baru" dari sidebar tetap memakai subjek ruang kerja.
- F5: `onOpenMailbox(mailboxId)` dengan id → langsung buka ruang kerja tanpa pemilih, memakai subjek tersimpan atau `self` untuk email baru berikutnya. Tanpa id → alur lama (pemilih).

### Lain-lain

- F2 tombol kembali: `PdktWorkspaceHeader` mode `focus` menerima `backLabel` dan `onBack` opsional. Saat `dari=riwayat`, label "Riwayat" dan aksi kembali ke `/pdkt/history`.
- F6b dan F6c sesuai acceptance.

### Risiko yang perlu dicek

- `AnimatePresence` landing ↔ ruang kerja: transisi harus tetap jalan saat dipicu perubahan URL.
- `computeUsageDeltaNow` dan baseline usage disimpan di state landing. Pastikan baseline tetap diambil saat masuk ruang kerja lewat URL (refresh).
- `notify.error` untuk `sesi` yang tidak ditemukan (test "tautan sesi yang tidak ada lagi…") harus tetap lulus.
- Lebar layar `< 768` di efek auto-select: di HP, `email` dari URL harus tetap dihormati.

## Tasklist

- [x] Muat `trainers-superapp-tdd`. Drift-check plan ini terhadap kode terbaru (`routes/pdkt/index.tsx`, `routes/pdkt/simulation.tsx`, `routes/pdkt/history.tsx`, `routes/pdkt/components/PdktWorkspaceHeader.tsx`, `router.tsx`, `components/layout/nav-config.ts`, `components/Layout.tsx`).
- [x] Graphify query untuk pemanggil `PdktSimulation`, `PdktWorkspaceHeader`, dan `handleSelectSession` sesuai matrix di `docs/AGENT_WORKFLOW.md`.
- [x] RED: tambah test hermetic di `apps/web/e2e/pdkt-flow.spec.ts` (pakai `openHermeticShell` dan mock yang sudah ada), satu per acceptance:
  - [x] AC1–2: Back dari kotak masuk → landing; Back dari detail email (viewport ponsel) → daftar.
  - [x] AC3: reload di email terpilih membuka email yang sama.
  - [x] AC4: Riwayat → sesi → tombol "Riwayat" dan Back browser → `/pdkt/history`; landing tidak pernah terlihat (assert hero tidak ada selama transisi).
  - [x] AC5: ruang kerja (subjek peserta) → Riwayat → Back → kotak masuk dengan subjek yang sama, tanpa pemilih.
  - [x] AC6: Telaah email milik peserta X → "Latihan lagi" → body `session/create` berisi subjek X.
  - [x] AC7: klik "Belum dibalas" sebagai trainer → tidak ada pemilih, email terbuka.
  - [x] AC9–10: breadcrumb Riwayat; `/pdkt/simulation` redirect ke `/pdkt`.
  - Jalankan hanya spec PDKT, satu run Playwright saja (jangan paralel), dan pastikan test gagal karena alasan yang benar.
- [x] GREEN: implementasi sesuai Design, berurutan F4 → F5 → F1/F2/F3 → F6.
- [x] Jalankan `pdkt-flow.spec.ts` sampai hijau (50/50).
- [x] Jalankan seluruh suite Playwright default sekali di akhir branch (gagal di Monitoring; lihat Hasil).
- [x] `impeccable` audit untuk header/tombol yang berubah (F2, F6a).
- [x] `thermo-nuclear` review.
- [x] Root typecheck, lint, build, `git diff --check`.
- [x] Isi bagian Hasil di bawah dengan perintah dan bukti persis. Jangan commit, push, atau buka PR tanpa izin Fajar.

## Hasil

Implementasi lokal, Lane C, 2026-10-14. Tidak ada commit, push, PR, deployment, migrasi, atau panggilan provider AI nyata.

### Keputusan implementasi

- Tombol kembali ke landing memakai satu primary path: navigasi eksplisit `/pdkt` dengan search kosong. Browser Back tetap mengikuti history browser.
- Pilihan email dikontrol URL. Auto-select desktop memakai replace; sebelum klik dari preview otomatis, entri itu dinormalisasi menjadi daftar lalu pilihan eksplisit di-push. Ini menjaga auto-select sekaligus membuat Back dari detail kembali ke daftar tanpa auto-open ulang.
- Tautan `sesi` tetap tersedia selama Telaah, termasuk replay sintetis tanpa `email=replay_*`. Landing tidak dirender ketika sesi sedang dimuat.
- F6a memilih label **Kembali ke email** untuk tahap Tanggapi.
- Snapshot peserta dipetakan menjadi selection `{ type: "participant", participantId }` atau `{ type: "self" }`. Peserta terhapus, snapshot unknown, dan snapshot yang tidak tercatat memblokir latihan ulang; tidak ada fallback diam-diam ke trainer. Pemilih skenario untuk latihan ulang juga membawa peserta email yang sama.
- `sessionStorage` memakai schema selection kanonik dan key per akun. Storage rusak/terblokir dan key akun lain terbukti fallback ke self untuk email baru.
- AC5 menemukan menu Riwayat berada di belakang workspace `z-[100]`. `MailboxSidebar` memakai override positioner `z-[110]`, mengikuti pola overlay lokal yang sudah ada, tanpa mengubah komponen dropdown bersama.
- Lima fixture Vitest lama memakai adapter kecil untuk props selection yang sekarang wajib/kontrol URL. Tidak ada unit test baru dan tidak ada unit suite yang dijalankan.
- `docs/modules.md` dan `plans/README.md` disinkronkan.

### Bukti verifikasi

| Gate | Perintah | Hasil |
| --- | --- | --- |
| RED navigasi | `pnpm --dir apps/web exec playwright test pdkt-flow.spec.ts --grep 'navigation acceptance'` | Exit 1, 14 gagal sebelum implementasi. Fixture menu AC5 dan consumer-type AC6 kemudian dibetulkan; kegagalan fixture tidak dianggap bukti produk. |
| RED atribusi tepat | `pnpm --dir apps/web exec playwright test pdkt-flow.spec.ts --grep 'AC6 latihan lagi'` | Exit 1: request actual `self`, expected participant X. |
| Focused E2E final | `pnpm --dir apps/web exec playwright test pdkt-flow.spec.ts` | Exit 0, **50 passed (3.4m)**: 32 test lama + 18 acceptance/boundary. |
| Pemeriksaan copy akhir | `pnpm --dir apps/web exec playwright test pdkt-flow.spec.ts --grep 'AC6 atribusi\|AC8 Tanggapi'` | Exit 0, **3 passed (16.1s)** setelah pesan pemulihan peserta diperjelas. |
| Root typecheck | `pnpm typecheck --concurrency=1` | Exit 0, 4/4 task sukses. Run awal TS2322 pada fixture route legacy; diperbaiki melalui adapter. |
| Root lint | `pnpm lint --concurrency=1` | Exit 0, 4/4 task sukses; 0 error, warning existing tetap ada. |
| Root build | `pnpm build --concurrency=1` | Exit 0, 3/3 task sukses; production Vite build selesai. |
| Suite default | `pnpm --dir apps/web exec playwright test --max-failures=1` | Exit 1: **94 passed, 1 failed, 3 skipped, 434 did not run (4.9m)**. Fail-fast pada Monitoring, di luar scope; bukan full-suite PASS. Runner juga melaporkan 1 error di luar test. |
| Diff | `git diff --check` | Exit 0, pemeriksaan final setelah pengisian Hasil. |

Run awal memakai bentuk `pnpm --filter @trainers/web test:e2e -- ...`; pnpm 12 meneruskan `--` literal sehingga runner memilih seluruh suite. Run dihentikan, lalu semua focused run memakai command langsung di atas. Iterasi GREEN memperbaiki portal menu serta fixture polling, race reload, strict locator, dan variabel audit console; semua sudah tercakup run focused final yang hijau.

### Review dan batas bukti

- Graphify: query spesifik `PdktSimulation PdktWorkspaceHeader handleSelectSession callers` menemukan 27 node; pemanggil diverifikasi lagi lewat source/import nyata. Cache update final `GRAPHIFY_MAX_WORKERS=1 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 graphify update .` exit 0: 15.020 node, 28.201 edge, 995 komunitas. HTML graph dilewati otomatis karena ukuran >5.000 node; tidak ada cache graph yang ditrack Git.
- Impeccable: detector pada header/review/sidebar exit 0 tanpa temuan. Screenshot Tanggapi desktop 1280×720 dan ponsel 390×844 diperiksa; label sesuai tujuan, tidak overflow horizontal, tombol minimal 44px. E2E AC8 memeriksa page/console errors dan aksi kembali ke email.
- Thermo-nuclear: review langsung atas diff; state view/selection tidak diduplikasi lagi, storage terisolasi di hook kecil, tidak ada kontrak backend baru atau any baru pada logika produksi yang ditambahkan. File simulation memang sudah besar sebelum pekerjaan ini; pemisahan seluruh workspace tidak dimasukkan ke perubahan navigasi.
- Bukti browser memakai Chromium lokal/hermetic dan emulasi viewport, bukan perangkat HP fisik, backend hosted, atau panggilan AI berbayar. Browser plugin tidak tersedia; Playwright dipakai sesuai tasklist.


### Penghalang gate suite default

`apps/web/e2e/monitoring.spec.ts:533` masih mengharapkan heading **Lima modul. Satu pengalaman.**. Snapshot browser menunjukkan landing berhasil terbuka dengan heading **Trainers SuperApp** dan **Enam modul. Satu alur kerja.**. `git diff --exit-code -- apps/web/e2e/monitoring.spec.ts apps/web/src/routes/index.tsx` exit 0: kedua file tidak berubah dalam pekerjaan ini. Jadi assertion copy Monitoring sudah tidak cocok dengan landing saat ini, bukan kegagalan navigasi PDKT. File tersebut tidak diperbaiki karena di luar scope. Suite default dihentikan oleh `--max-failures=1`; 434 test tersisa tidak diklaim lulus.

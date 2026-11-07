# TNA Fase 6 — Laporan T3 (dashboard Hasil rencana + badge jatuh tempo)

- **Tanggal:** 2026-11-07. Baseline `72a1a63e` (`main`).
- **Rencana:** [`tna-phase-6.md`](tna-phase-6.md) rev. 2 (D30, K39, K41, K42, P-2–P-5). Lane **C** (UI baru, tanpa API atau migrasi baru).
- **Skill:**
  - `ui-ux-pro-max` untuk brief desain;
  - `dataviz` untuk bentuk grafik dan validasi palet;
  - `impeccable` untuk audit sesudah implementasi.
- **Target:** spec browser hermetic (semua API di-mock, dev server lokal `127.0.0.1:3005`).

## Brief desain

- **Permukaan:**
  - tab **Hasil rencana** (`/tna/hasil`, guard `tna.read`), urutan kedua sesudah "Kebutuhan & rencana" (P-3);
  - breadcrumb "TNA › Hasil rencana";
  - badge di entri TNA: sidebar, rail, drawer, dan tab ponsel.
- **Hierarki halaman:**
  1. kalimat pembeda dari EFEK, dengan tautan EFEK dan catatan "indikatif" (K41);
  2. filter satu baris (Kelompokkan menurut, Selesai dari, Selesai sampai), disimpan di URL `?group=&from=&to=`;
  3. empat angka ringkasan;
  4. daftar per kelompok.
- **Angka ringkasan:**
  - Rencana selesai;
  - Tercapai penuh (%);
  - Median perubahan tingkat ("Turun/Naik X per 100 sesi", arah dalam kata, bukan tanda minus);
  - Median durasi aktivasi–selesai.
- **Baris kelompok** (P-2):
  - nama kelompok dan "n selesai", ditambah "Data sedikit (kurang dari 3 rencana)" bila tipis;
  - bar verdict dan teks jumlah per verdict;
  - `dl` dua kolom: tercapai penuh, perubahan tingkat, durasi, tindak lanjut;
  - `<details>` "Lihat n rencana" berisi tautan ke `/tna/rencana/$id` dengan verdict dan tanggal selesai WIB.
- **Keadaan:**
  - memuat;
  - gagal, dengan pesan server dan **Coba lagi**;
  - kosong tanpa filter: "Belum ada rencana selesai. Dashboard terisi setelah evaluasi pertama diselesaikan." (produksi saat ini, K38);
  - kosong dengan filter: "Tidak ada rencana selesai pada rentang tanggal ini.";
  - rentang terbalik: pesan inline tanpa request.
- **Badge:** angka di pill `--fg`/`--bg` (`aria-hidden`), ditambah teks pembaca layar ", n rencana perlu dievaluasi" di dalam tautan.
  - Disembunyikan bila 0 atau gagal; tidak ada error di navigasi.
  - Dimuat saat shell dibuka dan setiap pindah halaman di dalam `/tna` (P-4), tanpa polling.
  - Hanya untuk peran dengan `tna.read`.
- **Responsif dan aksesibilitas:**
  - target sentuh ≥ 44px; tanpa scroll halaman horizontal;
  - ringkasan `region` berlabel, daftar berlabel;
  - verdict tidak pernah warna saja.
- **Bukan tujuan:** peringkat program, grafik tren waktu, ekspor dashboard.

## Grafik (skill `dataviz`)

- **Bentuk:** bar bagian-dari-keseluruhan per kelompok, untuk sebaran tiga verdict dalam satu kelompok.
  - Selalu disertai teks jumlah ("1 tercapai · 1 tercapai sebagian · 1 tidak tercapai") dan legenda di atas daftar.
  - Bar `aria-hidden`; teks dan daftar adalah tampilan tabelnya.
  - Hover memakai `title` per segmen.
  - Celah 2px antarsegmen; ujung membulat hanya di sisi luar.
- **Warna:** verdict adalah skala berurut, jadi dipakai **diverging**: dua kutub (hijau tercapai, merah tidak tercapai) dengan abu netral di tengah (tercapai sebagian).
  - Status `warning` (oranye) **ditolak**: validator memberi hasil berikut di mode terang.

    | Pasangan        | Ukuran                 | Nilai | Batas |
    | --------------- | ---------------------- | ----- | ----- |
    | oranye vs merah | ΔE buta warna (deutan) | 2,8   | ≥ 8   |
    | oranye vs merah | ΔE penglihatan normal  | 9,9   | ≥ 15  |

  - Token baru di `index.css` (`--verdict-good/mid/bad`), divalidasi `scripts/validate_palette.js`:

    | Mode   | Hijau     | Merah     | Abu       | Hasil validator                                                  |
    | ------ | --------- | --------- | --------- | ---------------------------------------------------------------- |
    | Terang | `#047857` | `#dc2626` | `#a3a3a3` | ΔE buta warna 8,6, normal 30,9, kontras ≥ 3:1 terhadap `#fafafa` |
    | Gelap  | `#0f9f6e` | `#dc2626` | `#525252` | ΔE buta warna 8,7, normal 32,6, kontras ≥ 3:1 terhadap `#0a0a0a` |

    Hijau gelap digeser dari `--success` (`#34d399`) karena itu di luar pita kecerahan 0,48–0,67.

## File

| File                                                                     | Isi                                                                                                                                                  |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/routes/tna/results.tsx`                                    | Halaman Hasil rencana.                                                                                                                               |
| `apps/web/src/router.tsx`                                                | Route `/tna/hasil` dengan `validateSearch` (`group`, `from`, `to`; program = bawaan, tidak masuk URL).                                               |
| `apps/web/src/routes/tna/TnaTabs.tsx`, `components/layout/nav-config.ts` | Tab dan breadcrumb.                                                                                                                                  |
| `apps/web/src/components/layout/nav-badges.ts`                           | Konteks badge dan `useNavBadges` (pemuatan due count).                                                                                               |
| `apps/web/src/components/layout/NavBadgeMark.tsx`                        | Pill angka + teks pembaca layar.                                                                                                                     |
| `apps/web/src/components/Layout.tsx`, `NavList.tsx`, `MobileTabBar.tsx`  | Penyedia konteks dan render badge.                                                                                                                   |
| `apps/web/src/index.css`                                                 | Token verdict terang/gelap; `.nav-badge` (posisi rail diatur terpisah).                                                                              |
| `apps/web/e2e/tna-effectiveness-flow.spec.ts`                            | Spec baru (9 test).                                                                                                                                  |
| `apps/web/e2e/helpers/hermeticShell.ts`                                  | P-5: mock bawaan `TNA_DUE_COUNT` (count 0) dan `mockTnaDueCount(page)` untuk harness dengan guard sendiri.                                           |
| 6 harness SIDAK + `sidak-reports-data.spec.ts`                           | P-5: `mockTnaDueCount(page)` didaftarkan sesudah guard catch-all. Hanya 3 baris per file; file lama yang belum bersih Prettier tidak diformat ulang. |
| `plans/markdown/tna-phase-6-*.png`                                       | Screenshot dashboard desktop/mobile terang/gelap dan badge.                                                                                          |

## Spec (`tna-effectiveness-flow.spec.ts`)

1–2. **Dashboard 1440 dan 390:**

- tab dari `/tna`, URL, breadcrumb, tautan EFEK;
- empat angka ringkasan;
- dua kelompok, termasuk teks verdict, 33,3%, turun/naik, dan "Data sedikit" hanya di kelompok tipis;
- "Lihat 3 rencana" menaut ke detail rencana;
- tanpa scroll horizontal; screenshot terang dan gelap;
- tidak ada `/api` tak dimock.

3. Filter kelompok dan tanggal: masuk URL, dan urutan query request persis (`group_by`, `from`, `to`; tanpa query untuk bawaan).
4. Label gap dan layanan memakai label manusiawi; `?group=gap_type` memulihkan pilihan.
5. Kosong tanpa filter dan dengan filter: dua pesan berbeda.
6. Gagal 503: pesan server, lalu **Coba lagi** memuat data.
7. Badge sidebar: "2 rencana perlu dievaluasi"; sesudah pindah ke `/tna`, dimuat ulang menjadi 1; screenshot.
8. Badge 0 dan badge gagal 503: tidak ada badge dan tidak ada `alert`.
9. Badge tab mobile: "3 rencana perlu dievaluasi", tanpa scroll horizontal; screenshot.

## Audit impeccable

- `impeccable detect` pada `results.tsx`, `nav-badges`, `MobileTabBar.tsx`, `NavList.tsx`, `TnaTabs.tsx`, `plan.tsx`: exit 0, **tidak ada temuan**.
- Pemeriksaan visual screenshot (desktop + mobile, terang + gelap, badge):
  - **[P3] Nilai ringkasan pecah dua baris di mobile.** "Turun 150 per 100 sesi" pada `text-2xl` tidak muat di kolom 2×2. **Diperbaiki:** `text-xl` di layar sempit, `text-2xl` mulai `sm`.
  - Badge sidebar dan tab ponsel terbaca; abu tengah di mode gelap tetap terlihat terhadap permukaan.
- Skor (penilaian sendiri): A11y 4, Performance 4, Responsive 4, Theming 4, Integrity 4 → **20/20**.

## Bukti eksekusi (satu runner pada satu waktu)

| Langkah                                         | Perintah (di `apps/web`)                                                                                                                   | Hasil                                                                                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RED                                             | `pnpm exec playwright test tna-effectiveness-flow.spec.ts`                                                                                 | exit 1, **9 failed** (tab, halaman, dan badge belum ada)                                                                                                              |
| GREEN                                           | sama                                                                                                                                       | exit 0, **9 passed** (percobaan pertama)                                                                                                                              |
| Sesudah polesan, screenshot badge, dan mock P-5 | sama                                                                                                                                       | exit 0, **9 passed**                                                                                                                                                  |
| Typecheck web + E2E                             | `pnpm --filter @trainers/web typecheck`                                                                                                    | exit 0                                                                                                                                                                |
| Lint                                            | `eslint` pada layout, route TNA, router, harness                                                                                           | 0 error. Tiga warning `react-refresh` baru di `nav-badges.tsx` diperbaiki dengan memisah hook (`.ts`) dan komponen (`.tsx`); tersisa 38 warning lama di `router.tsx`. |
| Suite browser penuh (dihentikan)                | `pnpm exec playwright test --workers=1` (996 test)                                                                                         | Dihentikan atas permintaan Fajar di sekitar test ke-29; diganti run terarah di bawah.                                                                                 |
| Run terarah (P-5)                               | 21 file: satu atau dua spec per harness yang diubah, `sidak-jadwal-shifting`, `sidak-reports-data`, shell/navigasi, semua spec browser TNA | exit 1: **232 passed, 2 failed** (lihat di bawah).                                                                                                                    |
| Baseline `main` (perubahan T3 di-stash)         | `authenticated-shell.spec.ts:199`, `shell-focus.spec.ts:110`                                                                               | `authenticated-shell` agent **gagal juga di `main`** (pra-ada); `shell-focus` **lulus di `main`**, jadi regresi T3.                                                   |
| `shell-focus` dengan T3, 3× ulang               | `shell-focus.spec.ts --repeat-each=3`                                                                                                      | 3/3 gagal di test fokus navigasi sidebar (konsisten).                                                                                                                 |
| Bisect                                          | fetch badge dimatikan; lalu `Layout.tsx` dan `router.tsx` dikembalikan bergantian                                                          | Tetap gagal tanpa fetch; lulus bila `Layout.tsx` dikembalikan → penyebab di penyedia konteks badge.                                                                   |
| Sesudah perbaikan                               | `shell-focus.spec.ts:110`; tes badge `--repeat-each=3` dengan asersi fokus `h1` saat jumlah berubah 2 → 1                                  | exit 0, 1 passed; 3 passed                                                                                                                                            |
| Cek ulang shell + dashboard                     | `shell-focus authenticated-shell sidebar-nav-state main-landmark tna-effectiveness-flow`                                                   | **51 passed, 1 failed**: hanya kegagalan agent `authenticated-shell` yang pra-ada                                                                                     |

## Regresi yang ditemukan dan diperbaiki

- **[P1] Fokus navigasi hilang.** Sesudah pindah halaman lewat sidebar, fokus tidak lagi pindah ke `h1` halaman baru (`shell-focus.spec.ts`, trainer: Beranda → KTP).
  - **Penyebab:** `useNavBadges` mengembalikan objek `{}` baru setiap render shell, sehingga semua konsumen konteks di navigasi ikut render ulang tepat saat `useRouteFocus` memindahkan fokus.
  - **Perbaikan:** nilai konteks stabil (konstanta `NO_BADGES` dan `useMemo` per jumlah).
  - **Bukti:** tes badge sekarang juga memastikan fokus tetap di `h1` saat jumlah berubah.
- **Pra-ada, bukan dari T3:** `authenticated-shell.spec.ts:199` (agent, tab bar dan drawer) gagal karena `GET /api/v1/home/agent-summary` dan `GET /api/v1/telefun/sessions?view=list` tidak di-mock. Gagal identik di `main` sebelum T3. Agent tidak punya `tna.read`, jadi badge tidak dimuat untuk peran ini. Tidak diperbaiki di T3.

## Berikutnya

T5: review `thermo-nuclear`, sinkron `docs/modules.md` (dan `docs/auth-rbac.md` untuk dua endpoint baru), gate serial, `graphify update .`.

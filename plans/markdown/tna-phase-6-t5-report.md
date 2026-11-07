# TNA Fase 6 — Laporan T5 (review dan dokumentasi)

- **Tanggal:** 2026-11-07. Baseline `de734892` (`main`).
- **Rencana:** [`tna-phase-6.md`](tna-phase-6.md) rev. 2, T5. Lane **C**.
- **Cakupan review:** seluruh kode Fase 6 `91c2a120..de734892` di luar `plans/` dan screenshot. Ini mencakup:
  - API: `effectiveness.ts`, `read-service.ts`, `routes/tna.ts`, tipe;
  - ekspor: `html-export.ts`, `plan-export.ts`, `efek-export.ts`, `plan.tsx`;
  - dashboard: `results.tsx`, route, tab, breadcrumb;
  - badge: `nav-badges.ts`, `NavBadgeMark.tsx`, `Layout.tsx`, `NavList.tsx`, `MobileTabBar.tsx`, CSS;
  - tes: tiga spec baru dan perubahan harness P-5.
- **Target uji:** Supabase lokal dan dev server lokal. Tidak ada akses produksi.

## Review thermo-nuclear

```text
Verdict: PASS
```

Ditelusuri lintas lapisan, tanpa temuan P0–P2 baru:

- **Akses:** kedua endpoint baru memakai `tna.read` dan JWT pengguna (RLS admin/trainer); tidak ada service-role. Shell memanggil `due-count` hanya untuk peran dengan `tna.read`. Ekspor tidak punya endpoint, karena memakai detail rencana yang sudah dibatasi.
- **Kebenaran angka:** agregasi hanya dari rencana `selesai` dan nilai beku; median mengabaikan nilai `null`; rentang tanggal hari kalender WIB inklusif. Tanggal tidak valid → 400 (bug 500 tertangkap dan diperbaiki di T1).
- **Kontrak:** `GET /tna/plans` tidak berubah. Badge memakai route sendiri supaya tipe Hono tidak menjadi union (T1). Aturan jatuh tempo satu sumber (`dueFilter`).
- **Keamanan output:** semua nilai di file ekspor melewati `esc`; judul berisi markup diuji ter-escape.
- **UI:** verdict tidak pernah warna saja; palet divalidasi untuk buta warna terang/gelap. Regresi fokus navigasi akibat nilai konteks yang tidak stabil ditemukan dan diperbaiki di T3, dan diuji juga saat jumlah badge berubah.
- **Aturan baru `AGENTS.md` (`bcd1c4d4`, tanpa state machine implisit baru):** tidak ada siklus status baru di Fase 6. Badge hanya memuat satu angka, dashboard dan ekspor memakai `useApi` atau data yang sudah dimuat.
- **Ukuran file:** `results.tsx` 331, `effectiveness.ts` 233, `plan-export.ts` 153 baris; semua jauh di bawah batas ~1.000.

Catatan P3 (diterima, tidak diubah):

- **Badge tidak berubah setelah aksi di halaman yang sama.** Misalnya sesudah menyelesaikan evaluasi di detail rencana, badge baru diperbarui saat pindah halaman. Ini sesuai P-4 (tanpa polling) dan didokumentasikan di `docs/modules.md`.
- **Data lama tetap tampil selama filter berganti.** `useApi` mempertahankan data sebelumnya selama memuat filter baru, tanpa indikator memuat, hanya sesaat. Perilaku ini sama dengan halaman TNA lain.

## Dokumentasi

| File                | Perubahan                                                                                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/modules.md`   | Bagian baru "Fase 6 — hasil rencana, ekspor, dan pengingat": tab, filter, ringkasan, kelompok, ekspor, badge, dan endpoint. Catatan bahwa Fase 4 (akses leader) dibatalkan. |
| `docs/auth-rbac.md` | Bagian baru "TNA — hasil rencana dan pengingat (Fase 6)": dua endpoint baca, kapabilitas, jalur data, dan bahwa leader/agent tidak pernah mengirim `due-count`.             |
| `docs/database.md`  | Tidak berubah: Fase 6 tanpa migrasi.                                                                                                                                        |

## Bukti eksekusi (satu runner pada satu waktu)

| Langkah             | Perintah                                                                                                                                                                 | Hasil                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Regresi API TNA     | `apps/web`: `pnpm exec playwright test -c playwright.api.config.ts --project=tna-real-backend --workers=1`                                                               | exit 0, **115 passed** (2.8m)                                    |
| Regresi browser TNA | `apps/web`: `pnpm exec playwright test tna-catalog-flow tna-practice-flow tna-flow.spec tna-evaluation-flow tna-efek tna-export-flow tna-effectiveness-flow --workers=1` | exit 0, **69 passed** (4.9m)                                     |
| Typecheck           | `pnpm --filter @trainers/{types,api,web} typecheck`                                                                                                                      | exit 0 ketiganya                                                 |
| Lint                | `eslint` pada file Fase 6 (API, tipe, route TNA, layout, router, spec TNA, `hermeticShell`)                                                                              | exit 0, 0 error; 38 warning `react-refresh` lama di `router.tsx` |
| Build               | `pnpm --dir apps/api build`, `pnpm --dir apps/web build`                                                                                                                 | exit 0 keduanya                                                  |
| Graph               | `graphify update .`                                                                                                                                                      | exit 0, 19.162 node, 36.806 edge                                 |
| Format / spasi      | `prettier --check docs/modules.md` dan laporan ini; `git diff --check`                                                                                                   | exit 0                                                           |

### Suite browser penuh (sesudah T5, atas permintaan Fajar)

`apps/web`: `pnpm exec playwright test --reporter=line --workers=1` → exit 1, **985 passed, 7 failed, 4 skipped** (1,2 jam, 996 test).

Ketujuh kegagalan tidak terkait Fase 6. Tidak ada yang menyebut `due-count`, halaman TNA, atau badge.

| Test                                                                                                     | Penyebab                                                                                    | Bukti pra-ada                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authenticated-shell.spec.ts:199` (agent, tab bar dan drawer)                                            | `GET /api/v1/home/agent-summary` dan `GET /api/v1/telefun/sessions?view=list` tidak di-mock | Gagal identik di `main` sebelum T3 (dijalankan dengan perubahan T3 di-stash)                                                                                   |
| `static-security.spec.ts` (5 test: header CSP/`nosniff`, deep link `noindex`, 404 dotfile/aset/encoding) | Respons dev server lokal tidak membawa header keamanan dan 404 yang diharapkan              | Fase 6 tidak mengubah `vite.config.ts`, konfigurasi Vercel, `public/`, `playwright.config.ts`, atau spec ini (`git diff 91c2a120..HEAD` kosong untuk path itu) |
| `usage.spec.ts:123` (popover di landing Telefun)                                                         | `GET /api/v1/telefun/sessions/month-count` tidak di-mock                                    | Endpoint dipakai web sejak `57e7d96f` (2026-10-17 18:53), sesudah perubahan terakhir spec ini `e9a8abea` (15:35 hari yang sama)                                |

**Diperbaiki sesudahnya (2026-11-07, perubahan tes saja):**

- **`authenticated-shell`:** `DASHBOARD_MOCKS` ditambah `home/agent-summary` (`{ linked: false, qa: null }`) dan `telefun/sessions` (`[]`), dengan bentuk yang sama seperti `home-agent.spec.ts`.
- **`usage.spec.ts`:** landing Telefun memakai `telefunMocks([])` bersama (settings, `month-count`, riwayat), sehingga mock tidak tertinggal lagi dari permintaan halaman.
- **`static-security`:** akar masalahnya, spec ini dibuat untuk server statis hasil build (`pnpm start` → `scripts/serve-static.mjs`, port 3105) lewat `playwright.static-security.config.ts`, seperti tercatat di log rilis fase 214. Namun `playwright.config.ts` bawaan hanya mengecualikan `*-api.spec.ts`, jadi spec ini ikut dijalankan terhadap dev server Vite yang memang tidak mengirim header itu. `testIgnore` bawaan kini juga mengecualikan `static-security.spec.ts`. Header dan konfigurasi produksi tidak diubah.

Bukti:

| Perintah                                                                                      | Hasil                                                                             |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `pnpm exec playwright test --config playwright.static-security.config.ts` (dari build `dist`) | **5 passed**                                                                      |
| `pnpm exec playwright test authenticated-shell usage.spec --workers=1`                        | **17 passed**                                                                     |
| `pnpm exec playwright test --list`                                                            | 991 test di 92 file; `static-security` tidak lagi terdaftar di konfigurasi bawaan |

## Status Fase 6

Selesai: T0–T3 dan T5. T4 (email) memang di luar Fase 6 (K42). Tanpa migrasi; kode sudah di `main` (auto-deploy). Suite browser penuh sudah dijalankan (tanpa kegagalan baru). Belum diverifikasi: tampilan di produksi.

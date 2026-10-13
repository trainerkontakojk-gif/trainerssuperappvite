# Redesain Shell & Beranda

Lane **D**: redesain UI yang signifikan, ditambah satu kontrak API baru (`GET /api/v1/home/attention`). Rujukan visual: [`mockups/dashboard-shell/`](../../mockups/dashboard-shell/README.md). Mockup ini sudah lolos audit Impeccable (axe WCAG 2.2 AA 0 pelanggaran, 13 Okt 2026).

## Requirement

### Masalah saat ini

Bukti dari kode per 13 Okt 2026:

1. **Rail hanya berisi ikon, padahal nama modulnya akronim** (`Sidebar.tsx`). Nama modul baru terbaca lewat tooltip saat hover. Logo "S" tidak bermakna. Akun, Tema, dan Keluar (sekali klik) memakan slot rail. Avatar tidak bisa diklik.
2. **Ada empat daftar navigasi yang berbeda:**
   - `desktopRailModules` di `Sidebar.tsx`
   - `MOBILE_TAB_IDS` di `nav-config.ts`, yang tidak dipakai `MobileTabBar`
   - `PRIMARY_TABS` di `MobileTabBar.tsx`
   - `visibleModules` di `dashboard.tsx`

   Akibatnya:
   - TNA tidak muncul di Beranda dan tab bar mobile.
   - Tab Telefun tampil untuk leader/agent tanpa capability `telefun.use`, lalu berujung ke modal maintenance.

3. **Navigasi SIDAK (11 halaman) dan Management tersembunyi di flyout terpisah.** TNA, yang juga punya sub-halaman, tidak memakai pola yang sama.
4. **Beranda (`dashboard.tsx`) bermasalah:**
   - Bagian paling atas dipakai salam generik.
   - "Workspace Terpadu" menduplikasi sidebar dan memakai pola identical card grid, yang dilarang `docs/design.md` §8.
   - "Pintasan Cepat" dan "Opsi Manajerial" menduplikasi navigasi.
   - Grafik tren baru terlihat setelah scroll.
   - Log aktivitas punya tombol hapus per baris dengan `window.confirm`.
   - `getModuleColors` memakai warna yang tidak sesuai token `--module-*`.
   - Tampilan agent hanya salam ditambah dua kartu.

### Hasil yang diharapkan

**A. Satu sumber navigasi**

- `nav-config.ts` mengekspor satu model navigasi (`buildNavModel(role)`) yang difilter dengan `isCapabilityAllowed`.
- Sidebar, drawer mobile, tab bar, Beranda, dan pencarian ⌘K (bila disetujui) semuanya membaca model ini.
- Tidak ada lagi daftar modul lokal di komponen.

**B. Sidebar berlabel (≥1024px)**

- **Lebar dan isi item:** sidebar 248px. Tiap item berisi ikon, nama modul, dan fungsi singkat.
- **Grup:** Beranda · Latihan (KETIK, PDKT, TELEFUN) · Kualitas (SIDAK, TNA) · Data (KTP) · Administrasi (dari `MANAGEMENT_LINKS`).
- **Sub-halaman:** SIDAK memakai `ui/collapsible` dan terbuka otomatis saat route `/sidak/*` aktif.
- **Mode ciut:** sidebar bisa diciutkan menjadi rail 64px.
  - Pilihan ini disimpan di `localStorage` dengan `try/catch`.
  - Nama tetap aksesibel, tooltip muncul di luar area scroll, dan rail tetap bisa di-scroll di layar pendek.
  - Hitungan "Persetujuan Akses" tampil sebagai titik.
- **Menu pengguna:** avatar, nama, dan peran di bawah sidebar membuka menu berisi Pengaturan akun, Ganti tema, dan Keluar.
- **Gerbang Telefun:** `hasTelefunAccess` / `openMaintenance` tetap berlaku untuk item TELEFUN.

**C. Header & mobile (<1024px)**

- **Header:** breadcrumb tetap ada. Label root berubah dari "Dashboard" menjadi "Beranda", tapi route tetap `/dashboard`. Route Profiler tetap tanpa header, seperti sekarang.
- **Tab bar:** 4 tab sesuai peran ditambah "Lainnya" yang membuka drawer.
  - Admin/trainer: Beranda, SIDAK, TNA, KETIK.
  - Leader: Beranda, SIDAK, KTP, KETIK.
  - Agent: Beranda, KETIK, PDKT.
- **Drawer:** daftar navigasinya sama persis dengan sidebar.

**D. Beranda sesuai peran**

| Peran         | Urutan isi                                                                                                                                                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin/trainer | Header (salam + tanggal + periode QA berjalan, aksi utama "Input temuan") → **Perlu tindakan** → **Tren temuan QA** (`DashboardTrendPanel` apa adanya) + temuan per layanan → **Aktivitas terakhir** (hanya baca) + **Pintasan** |
| Leader        | Header (aksi utama "Ranking tim") → Perlu tindakan (scope tim) → Tren → Pintasan                                                                                                                                                 |
| Agent         | Header (aksi utama "Lanjutkan KETIK") → **Latihan** (modul yang diizinkan) → **Riwayat sesi**                                                                                                                                    |

Detail tambahan untuk Beranda:

- **Warna modul:** hanya dari token `--module-*` (`getModuleColors` dihapus).
- **Hapus log aktivitas:** tetap ada, tapi hanya di halaman `/dashboard/activities`.
- **State wajib:** setiap section punya state loading (skeleton), kosong, dan error (`QaStatePanel` + "Coba lagi"). Gagal memuat satu section tidak boleh mengosongkan section lain.

**E. Endpoint "Perlu tindakan"**

`GET /api/v1/home/attention` menghitung item di backend, memakai JWT pengguna sehingga RLS tetap berlaku. Item yang dikirim hanya yang sesuai capability pengguna:

| Item                                               | Capability                                                                            | Sumber data                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Permintaan akses leader yang menunggu              | `admin.leaderAccess`                                                                  | Sumber yang sama dengan `/admin/leader-requests/pending`   |
| Agen di bawah target skor 95 pada periode terakhir | `sidak.read` (leader otomatis terbatas pada scope tim lewat RLS/scope yang sudah ada) | Logika ranking yang sama dengan `/sidak/dashboard/ranking` |
| Periode QA bulan berjalan belum dibuat             | `sidak.config.manage`                                                                 | `sidak` periods                                            |
| TNA (lihat keputusan K2)                           | `tna.read`                                                                            | Service TNA                                                |

Aturan respons:

- Item dengan hitungan 0 tidak dikirim. Jika semuanya 0, UI menampilkan "Tidak ada yang menunggu".
- Satu sumber yang gagal hanya menghilangkan item itu. Respons menyertakan `partial: true`, dan UI menampilkan catatan bahwa sebagian data tidak termuat.
- Error berupa pesan yang bisa dibaca manusia. Tidak ada panggilan AI, jadi `logAiUsage` tidak relevan.

**F. Aksesibilitas (diambil dari audit mockup)**

- Target kontrol minimal 44px. Karena root font 14px, pakai `h-[44px]`, bukan `h-11`.
- Teks memakai `--fg`/`--fg2`. `--fg3` di `index.css` (`#8a8a8a` gelap, `#707070` terang) sudah lolos 4.5:1 di atas bg/surface. Nilai di `docs/design.md` (`#525252`/`#a3a3a3`) sudah usang dan harus diperbarui.
- Satu landmark `main`. Region "Konten halaman" tetap dipertahankan karena dipakai banyak spec E2E.
- Fokus pindah ke `h1` setelah navigasi, `document.title` mengikuti halaman, dan ada skip link.
- Animasi dimatikan saat `prefers-reduced-motion`. Lebar sidebar tidak dianimasikan.

### Kriteria penerimaan (dibuktikan dengan E2E)

1. **Per peran (admin, trainer, leader, agent):** sidebar, drawer, dan tab bar menampilkan modul yang sama sesuai `access.ts`.
   - TNA tampil untuk admin/trainer di ketiga tempat.
   - Telefun tidak tampil untuk leader/agent di mana pun.
2. **Sidebar dan rail:**
   - Rail yang diciutkan tetap punya nama aksesibel untuk setiap item.
   - Status ciut bertahan setelah reload.
   - Di 1280×640, item Administrasi terakhir bisa dijangkau.
3. **Grup SIDAK** terbuka otomatis di `/sidak/*`, item aktif memakai `aria-current="page"`, dan sub-halaman yang dilarang capability tidak tampil.
4. **Menu pengguna:** Akun, Ganti tema, dan Keluar bisa dipakai dengan keyboard. Esc mengembalikan fokus ke tombol pemicu.
5. **Beranda admin:**
   - Tidak ada "Workspace Terpadu", "Opsi Manajerial", atau tombol hapus log.
   - "Perlu tindakan" menampilkan item dari endpoint.
   - Seluruh fitur prediksi di `dashboard-trend-forecast.spec.ts` tetap lolos.
6. **Beranda agent:** tanpa panel tren. Latihan hanya berisi modul yang diizinkan, dan riwayat sesi tampil, termasuk state kosong.
7. **Endpoint `home/attention`:**
   - Hanya mengembalikan item sesuai capability, diuji per peran.
   - Tidak membocorkan data di luar scope leader.
   - Satu sumber yang gagal menghasilkan `partial: true`, bukan 500.
8. **Kualitas visual:** tidak ada overflow horizontal di 320/390/768/1280/1440. Tidak ada teks di bawah 12px di shell, dan semua kontrol minimal 44px.

### Di luar scope

- Isi halaman modul (SIDAK, TNA, dan lainnya).
- Mengubah route.
- Mengubah matriks akses di `access.ts`.
- Migrasi skema: endpoint baru hanya membaca tabel yang sudah ada. Jika ternyata butuh RPC baru, berhenti dan reklasifikasi.
- Pencarian ⌘K, kecuali K1 disetujui.

## Design

### Komponen

| File                                       | Perubahan                                                                                                                                                                                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/layout/nav-config.ts`          | Tambah `buildNavModel(role)`, berisi grup, item (`id`, `label`, `description`, `href`, `icon`, `moduleColor`, `children?`, `badgeKey?`), dan `mobileTabs`. `MOBILE_TAB_IDS`/`MOBILE_TABS` dihapus. `buildBreadcrumb` mengganti label "Dashboard" menjadi "Beranda". |
| `lib/app-config.ts`                        | `APP_MODULES` tidak diubah bentuknya. Hanya ditambah field opsional `navLabel`/`navDescription`/`group`, supaya `index.tsx` dan legacy `app-config.test.ts` tetap valid.                                                                                            |
| `components/layout/NavList.tsx` (baru)     | Merender model untuk sidebar maupun drawer. Prop `idPrefix` mencegah id ganda. Memakai `ui/collapsible` untuk SIDAK dan `Link` TanStack dengan `activeProps` ditambah `aria-current`.                                                                               |
| `components/layout/Sidebar.tsx`            | Ditulis ulang. Wordmark + tombol ciut, lalu `NavList`, lalu `UserMenu`. Flyout dan props `flyoutOpen`/`flyoutModule` dihapus. Tooltip rail memakai Base UI Tooltip (cek API lewat Context7, `@base-ui/react` 1.8).                                                  |
| `components/layout/UserMenu.tsx` (baru)    | Memakai `ui/dropdown-menu` (Base UI Menu dengan navigasi panah bawaan). Isinya Akun, Ganti tema (`useThemeMode`), dan Keluar (`signOutLocalSession`).                                                                                                               |
| `components/layout/MobileTabBar.tsx`       | Membaca `mobileTabs` dari model. `PRIMARY_TABS` lokal dihapus. Label 12px dan tab aktif ditebalkan.                                                                                                                                                                 |
| `components/layout/MobileDrawer.tsx`       | Isinya diganti `NavList` + `UserMenu`. Perilaku bottom-sheet dan scroll-lock tetap.                                                                                                                                                                                 |
| `components/Layout.tsx`                    | State flyout dihapus, ditambah skip link. Fokus ke `h1` dan `document.title` diatur lewat hook kecil `useRouteFocus`. `main` dan region "Konten halaman" tetap.                                                                                                     |
| `index.css`                                | `.sidebar-rail*` dan `.sidebar-flyout*` diganti kelas sidebar baru. Token tidak diubah.                                                                                                                                                                             |
| `routes/dashboard.tsx`                     | Dipecah menjadi `routes/dashboard/home/{StaffHome,AgentHome,AttentionList,ActivityFeed,Shortcuts,ServiceBreakdown}.tsx`. Pengambilan data tren tetap seperti sekarang. `getModuleColors`, `handleDeleteActivity`, dan grid modul dihapus.                           |
| `routes/dashboard/DashboardTrendPanel.tsx` | Tidak diubah, hanya dipindah posisinya.                                                                                                                                                                                                                             |

"Temuan per layanan" diambil dari `serviceTrendMap` yang sudah dimuat (`serviceSummary`), jadi tidak butuh request baru.

### Backend dan kontrak

- **`packages/types`:** `HomeAttentionItem` dengan `{ kind, count, period?, scope }` dan `HomeAttentionResponse` dengan `{ items, partial }`. `kind` adalah enum tetap, sedangkan label dan CTA ditentukan di UI.
- **`apps/api/src/routes/home.ts` (baru):** di-mount di `/api/v1/home` dan dimasukkan ke `AppType` agar bisa dipakai RPC `hc`. Setiap item dihitung oleh service di `apps/api/src/services/home/attention.ts`. Service ini memakai ulang fungsi query yang sudah ada (leader-requests pending, ranking SIDAK, periods, TNA), bukan menyalin SQL. Sumber dijalankan dengan `Promise.allSettled`. Hitungan "agen di bawah target" memakai `getAgentDirectorySummary` (`services/sidak/agent-directory.ts`, flag `atRisk`) agar definisinya sama dengan direktori agen SIDAK. Target 95 saat ini berupa literal di empat tempat (`agent-directory.ts`, `dashboard-data.ts`, `dashboard-trends.ts`, `temuan-service.ts`). Endpoint ini tidak menambah literal kelima. Mengekstrak konstanta bersama adalah refactor terpisah dan perlu persetujuan.
- **Frontend:** `homeClient.attention.$get()` lewat `fetchApi`/`unwrapResponse` yang sudah ada.

### Riwayat sesi agent

Diambil dari endpoint yang sudah ada, `ketik /history` dan `pdkt /history` (capability `*.history.read` mencakup agent). Ditampilkan 5 sesi terakhir gabungan dari keduanya.

Jika bentuk respons tidak memuat skor atau skenario, kolom itu tidak ditampilkan. Data tidak boleh dikarang.

### Risiko

| Risiko                                                                                                                                                            | Mitigasi                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ±11 spec E2E bergantung pada selektor shell lama (`.sidebar-rail`, `.sidebar-flyout`, `data-active`/`data-open`, nama link "Ketik"/"Telefun", heading "Halo, …"). | Spec diperbarui di fase yang sama dengan perubahannya. Pertahankan region "Konten halaman" dan nama aksesibel `KTP`/`PDKT`/`TNA`/`SIDAK`. Nama link KETIK/TELEFUN berubah ke label yang terlihat (WCAG 2.5.3), dan deskripsi masuk lewat `aria-describedby`. Tab bar dan sidebar sama-sama memakai label "Navigasi utama", karena hanya satu yang terlihat per breakpoint. |
| Endpoint agregat bocor scope leader.                                                                                                                              | Memakai JWT pengguna dan memakai ulang query yang sudah scoped. Ada E2E API per peran.                                                                                                                                                                                                                                                                                     |
| `app-config.test.ts` (unit legacy).                                                                                                                               | Bentuk `APP_MODULES` dipertahankan. Unit test tidak dijalankan atau ditambah tanpa izin Fajar.                                                                                                                                                                                                                                                                             |

### Yang perlu diubah di spec E2E

| Spec                               | Perubahan                                                 |
| ---------------------------------- | --------------------------------------------------------- |
| `authenticated-shell.spec.ts`      | Matriks per peran, rail/flyout, dan drawer ditulis ulang. |
| `sidebar-nav-state.spec.ts`        | Ditulis ulang untuk `aria-current` dan grup SIDAK.        |
| `tna-flow.spec.ts`                 | Selektor `data-active` dan "Lainnya".                     |
| `sidak-dashboard-insights.spec.ts` | Selektor `.sidebar-rail` dan `.sidebar-flyout`.           |
| `sidak-jadwal-shifting.spec.ts`    | Pengukuran overflow `.sidebar-rail`.                      |
| `sidak-reports-data.spec.ts`       | `nav[aria-label="Navigasi utama"]`.                       |
| `dashboard-trend-forecast.spec.ts` | Region dan urutan.                                        |

`main-landmark.spec.ts` dan `sidak-settings.spec.ts` seharusnya tidak berubah, karena region "Konten halaman" dipertahankan.

## Tasklist

Satu run Playwright pada satu waktu. Suite penuh hanya dijalankan di akhir branch. Setiap fase RED-first. Semua target E2E harus lokal dan hermetic (`openHermeticShell`, `assertLocalDevOnlyTarget`).

### PR-A — Navigasi & shell

- [x] **Fase 0 — persiapan**
  - [x] Drift-check rencana ini terhadap `main` terbaru dan catat path yang dirty.
  - [x] Context7: Base UI 1.8 `Tooltip` dan `Menu`.
  - [x] Graphify: `explain Sidebar`, `explain MobileDrawer` (sudah dicek: konsumen `APP_MODULES` adalah dashboard, Layout, Sidebar, nav-config, MobileDrawer, index, dan `app-config.test.ts`).
- [x] **Fase 1 — satu sumber navigasi**
  - [x] RED: `authenticated-shell.spec.ts`, per peran.
    - Drawer admin/trainer memuat TNA.
    - Tab bar leader/agent tanpa Telefun.
    - Sidebar, drawer, dan tab bar memuat himpunan modul yang sama.
  - [x] GREEN: `buildNavModel`; `MobileTabBar` dan `MobileDrawer` membaca model ini.
- [x] **Fase 2 — sidebar berlabel**
  - [x] RED: tulis ulang `sidebar-nav-state.spec.ts`.
    - `aria-current` pada item aktif.
    - Grup SIDAK terbuka otomatis di `/sidak/*`.
    - Rail ciut punya nama aksesibel dan statusnya bertahan setelah reload.
    - Item terakhir bisa dijangkau di 1280×640.
    - Menu pengguna bisa dipakai dengan keyboard, termasuk Esc.
  - [x] GREEN: `NavList`, `Sidebar`, `UserMenu`, CSS. Gerbang Telefun tetap berlaku.
- [x] **Fase 3 — header, drawer, fokus**
  - [x] RED: label breadcrumb "Beranda", skip link, fokus ke `h1` setelah klik nav, `document.title`, drawer tanpa id ganda.
  - [x] GREEN: `AppHeader`, `MobileDrawer`, `useRouteFocus`, `Layout`.
- [x] **Perbarui spec terdampak:** `tna-flow`, `sidak-dashboard-insights`, `sidak-jadwal-shifting`, `sidak-reports-data`. Jalankan masing-masing secara fokus.
- [x] **Gate PR-A**
  - [x] Audit + polish `impeccable` pada shell.
  - [x] Review `thermo-nuclear`.
  - [x] `pnpm --filter @trainers/web exec tsc --noEmit`, `pnpm lint`, `pnpm build`, `git diff --check`.

### PR-B — Beranda & endpoint

- [ ] **Fase 4 — kontrak dan endpoint `home/attention`**
  - [ ] RED: `apps/web/e2e/home-attention-api.spec.ts`, dijalankan terhadap Supabase lokal dengan seed.
    - Item per peran.
    - Leader hanya melihat scope timnya.
    - Agent menerima `items: []`.
    - Satu sumber gagal menghasilkan `partial: true`.
  - [ ] GREEN: tipe di `packages/types`, `routes/home.ts`, `services/home/attention.ts`, dan mount di `AppType`.
- [ ] **Fase 5 — tata letak Beranda staff**
  - [ ] RED: `apps/web/e2e/home-staff.spec.ts` (hermetic).
    - Urutan section.
    - Tidak ada Workspace Terpadu, Opsi Manajerial, atau tombol hapus log.
    - Perlu tindakan dari mock endpoint, termasuk state kosong, error, dan sebagian.
    - Pintasan hanya berisi tujuan yang diizinkan.
  - [ ] Perbarui `dashboard-trend-forecast.spec.ts`; semua tes prediksi harus tetap lolos.
  - [ ] GREEN: komponen `routes/dashboard/home/*`.
- [ ] **Fase 6 — Beranda agent**
  - [ ] RED: `apps/web/e2e/home-agent.spec.ts` (hermetic). Tanpa panel tren, Latihan hanya KETIK/PDKT, riwayat dari mock history, dan state kosong.
  - [ ] GREEN: `AgentHome`.
- [ ] **Gate PR-B:** sama dengan PR-A, ditambah `pnpm --dir apps/api exec tsc --noEmit` dan `pnpm --dir apps/api build`.

### Penutup branch

- [ ] **Dokumentasi:**
  - [ ] `docs/design.md`: perbarui nilai `--fg2`/`--fg3` ke `index.css` dan tambah section "Shell & navigasi" (grup, rail, tab bar per peran, target 44px).
  - [ ] `docs/architecture.md`: tambah endpoint `home/attention`.
- [ ] **Suite E2E penuh** sekali, di akhir branch.
- [ ] **`graphify update .`** sekali setelah batch kode terakhir.

### PR-C — Pencarian ⌘K (hanya bila K1 disetujui)

- [ ] RED: membuka dengan Ctrl/⌘K, filter, panah, Enter, Esc mengembalikan fokus, hasil hanya dari `buildNavModel(role)`.
- [ ] GREEN: memakai `ui/dialog` + listbox. Pencarian agen memerlukan endpoint tersendiri, jadi direncanakan terpisah.

### Log progres

- **13 Okt 2026 — Fase 0–1 selesai** di worktree `.claude/worktrees/shell-beranda` (branch `feat/shell-beranda` dari `origin/main` 9f40096).
  - Drift: `main` maju satu commit (#52, landing). Tidak ada file shell yang berubah; klaim masalah (`MOBILE_TAB_IDS` tak dipakai, `PRIMARY_TABS` lokal, Telefun tanpa capability, TNA tak ada di tab bar) terbukti di kode.
  - Context7 `/mui/base-ui/v1.8.0`: `Tooltip.Root disabled` (tooltip hanya saat rail ciut), `Tooltip.Positioner side="right"`, `Menu.Item closeOnClick={false}` (ganti tema tanpa menutup menu), `Menu.LinkItem`, `Menu.Popup finalFocus`.
  - Graphify: `explain Sidebar` hanya menemukan simbol di spec; konsumen `APP_MODULES` memakai hasil pemeriksaan sebelumnya.
  - RED: 9 test baru di `authenticated-shell.spec.ts` gagal (label/himpunan modul). GREEN: 15/15 lolos; spec terdampak `tna-flow`, `sidebar-nav-state`, `sidak-dashboard-insights`, `sidak-jadwal-shifting`, `main-landmark` 91/91 lolos.
  - Label navigasi kini final (K3): Beranda, KETIK, PDKT, TELEFUN, SIDAK, TNA, KTP.
- **13 Okt 2026 — Fase 2–3 dan gate PR-A selesai.**
  - Fase 2 RED: `sidebar-nav-state.spec.ts` ditulis ulang, 8/8 gagal (belum ada landmark sidebar). GREEN 9/9 (ditambah tes sidebar tersembunyi <1024px).
  - Fase 3 RED: `shell-focus.spec.ts` baru, 5/5 gagal. GREEN 5/5. Fokus pindah setelah event router `onRendered`, agar `h1` halaman lama tidak terpilih.
  - Drawer memakai Base UI Dialog (fokus, Esc, kunci scroll). Efek `body.style.overflow` di `Layout` dihapus.
  - Unit test `sidebar-active-open-separation.test.tsx` dihapus: kontrak kelas responsifnya kini dibuktikan E2E "di bawah 1024px sidebar tersembunyi". `layout-scroll-contract.test.tsx` hanya ditambah stub `useRouter` di mock; tidak dijalankan (butuh izin).
  - Spec terdampak diperbarui: `authenticated-shell`, `tna-flow` (`aria-current`), `sidak-dashboard-insights` (sidebar lebar vs rail), `sidak-jadwal-shifting` dan `sidak-reports-data` (tab bar dipilih dari `nav` yang `fixed`). Regresi terfokus 13 spec: 171/171 lolos.
  - Audit Impeccable pada aplikasi (hermetic): detektor bersih; axe WCAG 2.2 AA 0 pelanggaran di sidebar/menu/rail (terang+gelap) dan drawer 320/390/768 setelah memperbaiki kontras "Keluar" (`--destructive` 4.42/3.71 sebagai teks; kini teks `--fg`, ikon merah). Target <44px: 0. Overflow horizontal 320/390/768: 0.
  - Thermo-nuclear: `buildNavModel` disederhanakan (field `admin`/`modules`/`badgeKey`/`startsWith` yang tak terpakai dihapus). Lencana "Persetujuan Akses" dipindah ke PR-B karena butuh hitungan dari endpoint `home/attention`.
  - Gate: `tsc` web exit 0, `pnpm lint` exit 0 (0 error), `pnpm build` 3/3 sukses, `git diff --check` bersih.

## Keputusan (Fajar)

Disetujui 13 Okt 2026 dengan default di bawah.


- **K1 — Pencarian ⌘K.** Fitur baru. Default: tidak dikerjakan di PR-A/B; header hanya berisi breadcrumb.
- **K2 — Item TNA di "Perlu tindakan".** Skema kebutuhan TNA tidak punya status "menunggu validasi". Default: item TNA ditunda sampai definisinya disepakati. Alternatifnya, hitung rencana TNA berstatus `evaluasi`.
- **K3 — Label "Beranda".** Default: dipakai untuk nav dan breadcrumb, route tetap `/dashboard`.

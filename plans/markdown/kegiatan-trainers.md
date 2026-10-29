# Kegiatan Trainers — laman publik + menu Kelola Kegiatan

Status: siap dikerjakan. Worker yang dituju: Codex `gpt-6-luna`. Disusun 2026-10-29 dari diskusi Fajar dengan Claude (mockup di kanvas Design "Redesign Landing & Kegiatan Trainers", artboard "Laman Kegiatan Trainers").

- **Fase 1 (wajib): skema, storage, kontrak, API.** Lane **D**: tabel baru + RLS, bucket Storage baru, kontrak publik baru di `packages/types`, route API publik tanpa login, dan route admin.
- **Fase 2 (wajib): laman publik `/kegiatan` dan menu admin `/dashboard/kegiatan`.** Lane **D** (antarmuka baru). **Kalau worker tidak bisa memverifikasi tampilan secara visual** (screenshot 390px dan 1280px, terang dan gelap), berhenti setelah Fase 1 dan laporkan. Claude yang akan mengerjakan Fase 2.
- **Fase 3: dokumen dan gate akhir.**

## Cara membaca plan ini (worker)

1. Baca dulu, berurutan: `AGENTS.md`, `docs/AGENT_WORKFLOW.md` (§3 lane, §4 changelog, §5 skill/tool, §7 verifikasi), `.claude/skills/trainers-superapp-tdd/SKILL.md`, `.claude/skills/supabase-migration/SKILL.md`. Skill-skill itu berlaku untuk Codex juga: perlakukan sebagai instruksi kerja. Untuk Fase 2 baca juga `DESIGN.md` → `docs/design.md`.
2. **Kerjakan hanya di worktree `/Users/nadindyta/Downloads/_Projects/trainerssuperappvite-kegiatan` (branch `kegiatan-trainers`), yang sudah disiapkan Claude.** Checkout utama (`/Users/nadindyta/Downloads/_Projects/trainerssuperappvite`) dipakai sesi lain (Telefun). Jangan menyentuhnya: jangan `git stash`, `git checkout`, `git reset`, atau `git add -A` di sana. Abaikan worktree lama di `~/.codex/worktrees/`. Langkah cek ada di Task 0.
3. Kerjakan task **berurutan**. Setiap task punya titik **STOP**: kalau syaratnya tidak terpenuhi, berhenti dan laporkan ke Fajar dengan bukti, jangan mengarang jalan lain.
4. TDD: tulis E2E Playwright yang gagal dulu (RED), jalankan dan pastikan gagal karena alasan yang benar, baru implementasi (GREEN), lalu rapikan. **Jangan menambah atau menjalankan unit test (Vitest)** tanpa izin Fajar; jangan sentuh `scripts/test-core.json` / `scripts/test-fast.json`.
5. Satu test run pada satu waktu (Mac Fajar tidak kuat paralel). Sebelum menjalankan Playwright, pastikan tidak ada dev server atau Playwright lain yang jalan (`pgrep -fl "playwright|vite"`). Kalau ada, tunggu atau tanya Fajar. Jalankan dari `apps/web` di worktree:
   - browser: `pnpm exec playwright test e2e/kegiatan.spec.ts -g "<judul test>" --workers=1`
   - API (butuh Supabase lokal di loopback): `pnpm exec playwright test --config playwright.api.config.ts e2e/kegiatan-api.spec.ts -g "<judul test>" --workers=1`
   - Jangan pakai `pnpm test:e2e -- -g`. **Jangan pernah mengarahkan E2E ke produksi.**
6. Setiap commit menambah satu baris `- type(scope): ringkasan` di `CHANGELOG.md` di bawah `## <tanggal hari ini>`. Commit ke `main` sudah diizinkan setelah gate hijau. **Push baru boleh setelah Fase 2 selesai dan hijau** (lihat Task 9). **Deploy produksi dan perubahan Supabase remote (termasuk `db push` / menerapkan migrasi) tidak diizinkan**: Fajar yang menerapkan migrasi ke produksi.
7. Jangan ubah file `.env*` (kecuali `.env.example`).

## Requirement

`/kegiatan` sempat dipakai sebagai alias Log Aktivitas (commit `57478940`) karena salah tangkap; itu sudah dikembalikan ke `/dashboard/activities` (commit `0745bf8b`), jadi `/kegiatan` bebas. Jangan memindahkan Log Aktivitas lagi.

Landing page sudah punya dua tombol **Kegiatan Trainers** (header dan ajakan bawah) yang menuju `/kegiatan` (commit landing "feat(landing): ganti menu Modul dan Alur kerja …", hanya ada di branch `kegiatan-trainers`, **belum di-push**). Laman itu belum ada. Fajar memutuskan isi laman dikelola dari menu admin, bukan dari file di repo.

- **R1 — Laman publik `/kegiatan`.** Bisa dibuka tanpa login, karena tombolnya ada di landing untuk tamu. Isinya hanya poster/foto kegiatan per tahun dan per program. Klik poster/foto membuka link Google Drive di tab baru (`target="_blank" rel="noopener noreferrer"`). Folder Drive memang dibatasi; laman menulis catatan bahwa pengunjung mungkin perlu meminta akses ke pemilik folder.
- **R2 — Pilihan tahun.** Daftar tahun diambil dari data yang sudah terbit (urut terbaru dulu). Default: tahun terbaru yang punya data. Tahun tersimpan di URL (`/kegiatan?tahun=2026`).
- **R3 — Filter program.** `Semua` + lima program. Program tersimpan di URL (`&program=sobat`). Tanpa parameter = `Semua`. Saat `Semua`, item dikelompokkan per program dengan urutan tetap di bawah.
- **R4 — Program (tetap, di kode untuk versi ini)**, dengan kepanjangan yang sama dengan aplikasi:
  | kode                                                                                            | label   | kepanjangan                                |
  | ----------------------------------------------------------------------------------------------- | ------- | ------------------------------------------ |
  | `sobat`                                                                                         | SOBAT   | Solid Backup Antar Tim                     |
  | `ketik`                                                                                         | KETIK   | Kelas Etika & Trik Komunikasi              |
  | `telefun`                                                                                       | Telefun | Telephone Fun                              |
  | `pdkt`                                                                                          | PDKT    | Paham Dulu Kasih Tanggapan                 |
  | `ceriwis`                                                                                       | CERIWIS | Customer Experience Improvement With Smile |
  | KETIK, PDKT, dan Telefun harus sama dengan `apps/web/src/components/landing/landingModules.ts`. |
- **R5 — Menu admin "Kelola Kegiatan" di `/dashboard/kegiatan`.** Hanya admin dan trainer. Bisa: tambah, ubah, hapus, terbitkan/sembunyikan item. Setiap item punya: tahun, program, jenis (`Poster` / `Foto`), judul, tanggal kegiatan (opsional), gambar (unggah), link Google Drive, urutan, status terbit.
- **R6 — Validasi.**
  - Link Drive wajib `https://` dengan host `drive.google.com` atau `docs.google.com`. Selain itu ditolak dengan pesan manusiawi.
  - Gambar: PNG, JPEG, atau WebP, maksimal 5 MB. Ditolak dengan pesan manusiawi di luar itu.
  - Judul 1–120 karakter setelah `trim`. Tahun 2020–2100.
- **R7 — Item yang disembunyikan tidak pernah keluar dari API publik.** Admin/trainer tetap melihatnya di menu admin.
- **R8 — Empty state.** Laman publik tanpa data menulis kondisinya ("Belum ada kegiatan yang diterbitkan."), tanpa angka atau gambar palsu.
- **Bukan scope:** kelola daftar program dari UI (program baru = ubah konstanta + review), akses leader/agent ke menu admin, mengunggah ke Google Drive, membaca isi folder Drive, galeri multi-foto per item, menghapus objek Storage saat item dihapus (lihat Design), dan perubahan lain pada landing.

## Design

### Fakta kode saat ini (diverifikasi 2026-10-29 di branch `kegiatan-trainers`)

- Landing: `apps/web/src/routes/index.tsx`. Konstanta `KEGIATAN_HREF = "/kegiatan"` dipakai di header, menu mobile, dan ajakan bawah, berupa `<a href>` biasa karena route-nya belum ada. E2E-nya: `apps/web/e2e/landing-split-flap.spec.ts` (`"header hanya punya tombol Kegiatan Trainers; …"`).
- Router web: `apps/web/src/router.tsx` (TanStack Router, `createRoute`). Contoh route admin: `dashboardPracticeLimitsRoute` (`/dashboard/batas-latihan`, `beforeLoad: requireCapability("practice.limits.manage")`). Contoh route publik: `indexRoute` (`/`).
- Menu sidebar dan breadcrumb: `apps/web/src/components/layout/nav-config.ts` (entri `Batas latihan` ±baris 94 dan breadcrumb ±baris 431).
- Capability: `packages/types/src/access.ts` (`CAPABILITIES`, `can()`). Pola admin+trainer: `"tna.write": ["admin", "trainer"]`.
- Middleware API: `apps/api/src/middleware/role.ts` (`requireCapability`, `getActor`). Semua `/v1/*` melewati `authMiddleware` dan `rateLimitMiddleware` (`apps/api/src/app.ts` ±baris 51, 242). Route tanpa login ada di router `healthCheck` (±baris 119) yang dipasang di `/` dan ikut di `_allRoutes` untuk tipe RPC `AppType`.
- Klien Supabase API: `apps/api/src/lib/supabase.ts` (`createUserClient(token)` memakai anon key + JWT pengguna, `createAdminClient()` / `supabaseAdmin` service role).
- Pola unggah gambar lewat backend: `apps/api/src/lib/scenario-attachments.ts`. Data URL di JSON → byte → nama objek SHA-256 + ekstensi → `upload` service role dengan `upsert: false` (objek yang sudah ada dianggap file yang sama) → `getPublicUrl`. Bucket publik tanpa policy `storage.objects`, dibuat di `supabase/migrations/20261019120000_scenario_attachments_storage.sql`.
- Helper RLS: `public.is_admin_or_trainer()` (contoh: `supabase/migrations/20261008120000_tna_phase1.sql`).
- Rollback wajib: `supabase/rollbacks/rollback_<nama migrasi>.sql` (dicek hook dan CI).
- Dokumen kanonis modul: `docs/modules.md` (nomor bagian terakhir: §10 EFEK).

### Bentuk perubahan yang disarankan

1. **Migrasi** `supabase/migrations/<timestamp>_trainer_activities.sql` + rollback pasangannya.
   - Tabel `public.trainer_activities`: `id uuid pk default gen_random_uuid()`, `year int not null check (year between 2020 and 2100)`, `program text not null check (program in ('sobat','ketik','telefun','pdkt','ceriwis'))`, `kind text not null check (kind in ('poster','foto'))`, `title text not null check (char_length(btrim(title)) between 1 and 120)`, `event_date date null`, `image_url text not null`, `drive_url text not null check (drive_url ~ '^https://(drive|docs)\.google\.com/')`, `sort_order int not null default 0`, `is_published boolean not null default true`, `created_by uuid not null references auth.users(id)`, `updated_by uuid null references auth.users(id)`, `created_at`/`updated_at timestamptz not null default now()`. Index `(year, program, sort_order)`. Trigger `updated_at` memakai pola yang sudah ada di repo (cari dulu, jangan buat fungsi duplikat).
   - RLS aktif. Policy:
     - `SELECT TO anon, authenticated USING (is_published)` untuk laman publik.
     - `SELECT TO authenticated USING (public.is_admin_or_trainer())` untuk menu admin (melihat yang tersembunyi).
     - `INSERT / UPDATE / DELETE TO authenticated` dengan `public.is_admin_or_trainer()` (INSERT: `WITH CHECK`, UPDATE: `USING` + `WITH CHECK`).
   - Grant sesuai pola tabel lain di repo (cek grant `tna_*`). Jangan beri grant tulis ke `anon`.
   - Bucket `trainer-activity-media`: publik, `file_size_limit` 5242880, `allowed_mime_types` `image/png, image/jpeg, image/webp`, tanpa policy `storage.objects` (hanya service role yang menulis), meniru migrasi `scenario_attachments_storage`.
   - Rollback: drop tabel + policy + trigger, hapus baris bucket **hanya kalau kosong** (tulis komentar alasannya).
2. **Kontrak** `packages/types/src/kegiatan.ts` (ekspor lewat index paket):
   - `TRAINER_ACTIVITY_PROGRAMS` (tabel R4, urutan tetap) dan tipe `TrainerActivityProgram`.
   - `trainerActivityInputSchema` (zod): `year`, `program`, `kind`, `title`, `event_date` (`YYYY-MM-DD` atau `null`), `drive_url`, `sort_order`, `is_published`, dan `image` = data URL baru **atau** `image_url` lama saat mengubah tanpa ganti gambar. Validasi host Drive di sini juga.
   - `TrainerActivity` (baris lengkap untuk admin) dan `PublicTrainerActivity` (tanpa `created_by`, `updated_by`, `is_published`).
   - `PublicKegiatanResponse`: `{ years: number[]; year: number | null; items: PublicTrainerActivity[] }`.
   - Capability baru di `access.ts`: `"kegiatan.manage": ["admin", "trainer"]`.
3. **API**:
   - Publik: router baru `apps/api/src/routes/public-kegiatan.ts`, dipasang di `healthCheck` sebagai `GET /public/kegiatan?tahun=<int>` (tanpa login). Pakai klien anon (tanpa service role) supaya policy `is_published` yang berlaku. `years` = tahun distinct dari baris terbit, terbaru dulu. Tanpa `tahun` = tahun terbaru; tahun tanpa data = `items: []`. Header `Cache-Control: public, max-age=60`. Error manusiawi, bukan pesan database.
   - Admin: router `apps/api/src/routes/kegiatan.ts` di `/v1/kegiatan`, semua endpoint `requireCapability("kegiatan.manage")`, tabel ditulis dengan `createUserClient(token)` (RLS tetap berlaku):
     - `GET /v1/kegiatan?tahun=` daftar semua item (termasuk tersembunyi).
     - `POST /v1/kegiatan` buat item. `PATCH /v1/kegiatan/:id` ubah. `DELETE /v1/kegiatan/:id` hapus baris.
     - Gambar data URL diunggah lewat helper baru `apps/api/src/lib/trainer-activity-media.ts` yang meniru `scenario-attachments.ts` (SHA-256, `upsert: false`, `getPublicUrl`), memakai `createAdminClient()` **hanya untuk menulis Storage**. `image_url` dari klien hanya diterima kalau berawalan URL publik bucket ini (cegah URL luar).
     - Hapus item tidak menghapus objek Storage: nama objek berbasis isi, jadi file yang sama bisa dipakai item lain.
   - Rate limit: periksa `apps/api/src/middleware/rateLimit.ts`. Kalau bisa dipakai tanpa pengguna (berbasis IP), pasang di `/public/*`. Kalau tidak, jangan bangun limiter baru; cukup cache header di atas dan catat di laporan.
4. **Web**:
   - Route publik `/kegiatan` (`apps/web/src/routes/kegiatan.tsx`, lazy seperti `IndexPage`), search `{ tahun?: number; program?: TrainerActivityProgram }` divalidasi; nilai tak dikenal diabaikan. Ambil data lewat klien RPC bertipe ke `/public/kegiatan` (tanpa token). Ganti `KEGIATAN_HREF` di landing menjadi `<Link to="/kegiatan">` setelah route ada.
   - Tampilan mengikuti mockup: header landing yang sama (tombol Kegiatan Trainers aktif, Masuk/Ajukan Akses atau Dashboard, tema), judul "Kegiatan Trainers", kalimat pengantar, segmented control tahun, chip filter program (bisa di-scroll horizontal di layar sempit), catatan akses Drive (ikon gembok), lalu per program: judul kode + kepanjangan + jumlah item, grid `repeat(auto-fill, minmax(220px, 1fr))` berisi kartu gambar 4:5 (`object-fit: cover`) dengan judul, tanggal (format `id-ID`) dan tanda "Buka di Drive" saat hover/fokus (selalu tampil di perangkat sentuh). `aria-label` kartu: `<judul> <program> <tahun>, buka di Google Drive (perlu akses)`. Gambar `loading="lazy"` dan `alt` = judul.
   - Warna program: KETIK/PDKT/Telefun memakai token modul yang sudah ada; SOBAT oranye dan CERIWIS pink sebagai token baru di `apps/web/src/index.css` untuk tema terang dan gelap, lolos kontras ≥3:1 sebagai ikon/titik (warna program bukan warna teks body).
   - Halaman admin `/dashboard/kegiatan` (`requireCapability("kegiatan.manage")`), entri sidebar "Kelola Kegiatan" + breadcrumb di `nav-config.ts`. Isi: filter tahun, tabel/daftar item (thumbnail, judul, program, jenis, tanggal, status terbit, aksi Ubah/Hapus), tombol "Tambah kegiatan" membuka modal formulir (komponen shadcn yang sudah ada). Unggah gambar dengan pratinjau; validasi tipe/ukuran di klien juga, tapi backend tetap sumber kebenaran. Hapus butuh konfirmasi. Status terbit bisa diubah langsung dari daftar.
   - Semua teks Bahasa Indonesia, tanpa emoji, tanpa badge dekoratif (`docs/design.md`).

### Keputusan yang sudah diambil (jangan diubah tanpa Fajar)

- Laman publik tanpa login (R1). Kalau ada alasan keamanan untuk menutupnya, STOP dan tanyakan.
- Kelola isi dari menu admin lewat backend, bukan file repo.
- Program tetap di kode untuk versi ini.

## Tasklist

### Task 0 — Setup worktree

1. Worktree sudah ada: `cd /Users/nadindyta/Downloads/_Projects/trainerssuperappvite-kegiatan`. Pastikan `git branch --show-current` = `kegiatan-trainers` dan `git log --oneline -3` memuat commit `feat(landing): ganti menu Modul dan Alur kerja …` dan `revert(web): kembalikan Log Aktivitas …`. **STOP** kalau tidak.
2. Di worktree: `pnpm install --frozen-lockfile`. Supabase lokal harus jalan di loopback (`supabase status`). **STOP** kalau target bukan lokal.

### Task 1 — Migrasi + rollback (Fase 1)

1. Ikuti `supabase-migration`: tulis E2E API yang gagal dulu (Task 3 bisa ditulis lebih dulu), lalu migrasi + rollback.
2. Terapkan ke Supabase lokal saja (`supabase db reset` atau `supabase migration up --local`), lalu cek replay bersih dari nol. **STOP** kalau replay gagal.
3. Commit: `feat(kegiatan): tabel trainer_activities, RLS, dan bucket media`.

### Task 2 — Kontrak dan capability

1. `packages/types/src/kegiatan.ts` + capability `kegiatan.manage`. Typecheck `@trainers/types`, `apps/api`, `apps/web`.

### Task 3 — API (TDD)

1. `apps/web/e2e/kegiatan-api.spec.ts` (real backend lokal, serial, fixture dibuat dan dibersihkan sendiri dengan tag unik). Test minimal:
   - `"admin dan trainer bisa membuat, mengubah, menyembunyikan, dan menghapus kegiatan"`
   - `"leader, agent, dan tamu ditolak dari endpoint admin"` (403 untuk role, 401 tanpa token)
   - `"API publik hanya mengembalikan item terbit, urut, dan daftar tahunnya"`
   - `"link selain Google Drive dan gambar di luar PNG/JPEG/WebP 5 MB ditolak dengan pesan manusiawi"`
   - `"image_url di luar bucket kegiatan ditolak"`
   - `"anon tidak bisa menulis tabel langsung lewat PostgREST"` (bukti RLS, bukan hanya middleware)
2. RED → implementasi → GREEN. Commit: `feat(kegiatan): API publik dan admin untuk Kegiatan Trainers`.
3. **Cek titik visual:** kalau worker tidak bisa mengambil dan melihat screenshot, berhenti di sini dan laporkan (Fase 2 dikerjakan Claude).

### Task 4 — UX constraint (Fase 2)

1. Jalankan `ui-ux-pro-max` untuk laman publik dan halaman admin; catat kriteria penerimaan di laporan.

### Task 5 — Laman publik `/kegiatan` (TDD)

1. `apps/web/e2e/kegiatan.spec.ts` (hermetik, jaringan di-mock seperti spec landing). Test minimal:
   - `"tamu membuka Kegiatan Trainers dari landing dan melihat tahun terbaru"`
   - `"filter tahun dan program tersimpan di URL dan bisa dibagikan"`
   - `"kartu membuka Google Drive di tab baru dengan rel noopener"`
   - `"tanpa data menampilkan empty state, bukan kartu palsu"`
   - `"tanpa overflow horizontal 320–1440 px dan lolos axe di tema terang dan gelap"`
2. Perbarui E2E landing kalau tombol berubah dari `<a>` ke `<Link>` (href tetap `/kegiatan`).
3. Commit: `feat(kegiatan): laman publik Kegiatan Trainers`.

### Task 6 — Menu admin `/dashboard/kegiatan` (TDD)

1. Tambahkan ke `kegiatan.spec.ts`:
   - `"admin menambah kegiatan dengan gambar dan link Drive, lalu muncul di daftar"`
   - `"validasi formulir: link bukan Drive dan gambar terlalu besar ditolak sebelum dikirim"`
   - `"menyembunyikan dan menghapus kegiatan butuh konfirmasi untuk hapus"`
   - `"leader dan agent tidak melihat menu Kelola Kegiatan dan diarahkan keluar dari rutenya"`
2. Commit: `feat(kegiatan): menu Kelola Kegiatan untuk admin dan trainer`.

### Task 7 — Review dan polish

1. `thermo-nuclear` untuk seluruh diff. Perbaiki temuan material.
2. `impeccable` audit/polish untuk kedua halaman. Screenshot 390px dan 1280px, terang dan gelap, untuk `/kegiatan` (dengan data dan kosong) dan `/dashboard/kegiatan` (daftar dan modal). Simpan di `plans/markdown/kegiatan-trainers-*.png`.

### Task 8 — Dokumen (Fase 3)

1. `docs/modules.md`: bagian baru "Kegiatan Trainers" (tujuan, rute, capability, tabel, bucket, aturan publik/tersembunyi, validasi).
2. `docs/architecture.md` hanya kalau route publik non-`/v1` baru perlu dicatat di sana (cek dulu apakah route tanpa login sudah didokumentasikan).

### Task 9 — Gate akhir dan push

1. Dari root worktree: typecheck root, lint, production build, lalu semua spec yang disentuh (`landing-split-flap`, `landing-auth`, `kegiatan`, `kegiatan-api`) satu per satu, `--workers=1`.
2. `git diff --check`. Laporkan perintah persis + exit code.
3. Bawa branch ke `main` tanpa menyentuh checkout utama: di worktree, `git fetch origin && git rebase origin/main` (selesaikan konflik `CHANGELOG.md` dengan mempertahankan semua entri), jalankan ulang spec yang disentuh kalau rebase membawa perubahan, lalu `git push origin HEAD:main`. Kalau push ditolak karena `main` bergerak, ulangi fetch + rebase. Commit tombol landing ikut ter-push di sini, sehingga tombol dan lamannya rilis bersamaan. **Jangan** force-push.
4. **Jangan** menerapkan migrasi ke Supabase remote. Laporan akhir harus menulis jelas: "Migrasi `<nama>` belum diterapkan ke produksi; Fajar perlu menerapkannya sebelum deploy web." Sebutkan juga bahwa laman publik akan error sampai migrasi diterapkan, jadi urutannya: migrasi dulu, baru deploy.

## Laporan akhir (format)

- Lane, plan ini, dan task yang selesai/berhenti (dengan alasan STOP kalau ada).
- Daftar file yang diubah.
- Perintah verifikasi persis dengan exit code dan ringkasan hasil (jumlah test lulus/gagal).
- Screenshot (Fase 2).
- Hal yang belum dikerjakan atau sengaja ditunda (misalnya rate limit `/public/*`).

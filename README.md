# Trainers SuperApp

Trainers SuperApp adalah aplikasi kerja untuk trainer yang mengumpulkan banyak kebutuhan pelatihan dalam satu tempat. Di sini ada simulasi chat, email, dan suara, ditambah alat untuk analisis kualitas, pengelolaan data peserta, dan dashboard admin.

Kalau Anda baru pertama kali membuka repo ini, anggap README ini seperti peta singkat: apa fungsi aplikasinya, modul-modul utamanya apa saja, lalu bagaimana cara menjalankannya di komputer Anda.

## Gambaran Singkat

- **SIDAK** dipakai untuk analisis kualitas dan input audit.
- **KETIK** dipakai untuk simulasi chat.
- **PDKT** dipakai untuk simulasi email.
- **Telefun** dipakai untuk simulasi panggilan suara.
- **Profiler** dipakai untuk mengelola data peserta.
- **Dashboard Admin** dipakai untuk ringkasan, pengelolaan pengguna, kelompok akses, dan log aktivitas.

## Modul yang Tersedia

| Modul | Penjelasan Sederhana | Route |
|---|---|---|
| Dashboard | Tempat melihat ringkasan aplikasi, aktivitas, dan beberapa pengaturan penting | `/dashboard`, `/dashboard/*` |
| SIDAK | Ruang kerja untuk audit kualitas, ranking, input data, dan laporan | `/sidak`, `/sidak/*` |
| KETIK | Simulasi percakapan chat untuk latihan komunikasi | `/ketik`, `/ketik/*` |
| PDKT | Simulasi balasan email untuk latihan menghadapi pesan pelanggan | `/pdkt`, `/pdkt/*` |
| Telefun | Simulasi panggilan suara berbasis WebSocket | `/telefun` |
| Profiler | Pengelolaan data peserta, impor, ekspor, dan analitik | `/profiler`, `/profiler/*` |
| Monitoring | Riwayat penggunaan AI, harga, dan kurs | `/monitoring` |
| Account | Profil akun, penggantian password, dan logout semua perangkat | `/account` |

## Struktur Proyek

```text
apps/
  api/          Backend Hono API untuk validasi, business logic, AI, dan mutasi database
  web/          Frontend Vite + React untuk UI dan interaksi pengguna
  telefun/      Service WebSocket untuk simulasi suara
packages/
  types/        Skema Zod dan tipe TypeScript yang dipakai bersama
supabase/
  migrations/   Skema database dan perubahan schema
docs/
  rebuild-logs/  Catatan per fase pengerjaan
  *.md          Dokumentasi teknis dan panduan operasional
```

## Mulai Cepat

Kalau Anda ingin menjalankan proyek ini secara lokal, cukup pakai perintah berikut:

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
pnpm lint
```

- `pnpm dev` menjalankan web, API, dan Telefun sekaligus.
- `pnpm build` membuat build untuk production.
- `pnpm test` menjalankan seluruh test suite.
- `pnpm lint` mengecek kualitas kode.

## Environment Variables

File `.env` dan `.env.local` di root diabaikan oleh git. Untuk kerja lokal, pakai `.env.local` sebagai tempat utama menyimpan rahasia dan override, lalu salin template yang tersedia jika perlu.

### Frontend (`apps/web`)

Gunakan prefix `VITE_` untuk variabel yang dibaca langsung saat build frontend:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_URL`
- `VITE_TELEFUN_WS_URL`

### Backend (`apps/api`)

Variabel ini dipakai oleh server API:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `OPENROUTER_API_KEY`

### Telefun (`apps/telefun`)

Service suara ini memakai variabel berikut:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`

### Script Sinkronisasi Database

Kalau Anda menjalankan script sinkronisasi database, salin template `.env.migration` lalu isi `OLD_DB_URL` dan `NEW_DB_URL`.

## Migrasi Database

Contoh perintah yang sering dipakai:

```bash
# Sync May qa_temuan (dry-run dulu)
node scripts/database-parity/sidak-may-incremental-sync.mjs
node scripts/database-parity/sidak-may-incremental-sync.mjs --apply

# Verifikasi post-sync
node scripts/database-parity/sidak-post-sync-verify.mjs --check-mv

# Backfill dashboard summaries
node scripts/database-parity/sidak-post-sync-verify.mjs --refresh-summaries
```

## Dokumentasi Lanjutan

Kalau Anda ingin masuk lebih dalam, ini halaman yang paling berguna:

- `docs/architecture.md` — gambaran arsitektur monorepo dan alur data
- `docs/modules.md` — penjelasan tiap modul dari sisi penggunaan
- `docs/deployment.md` — panduan deployment
- `docs/database.md` — skema, RLS, dan keamanan database
- `docs/checklist-audit-trainers-superapp.md` — checklist audit parity
- `docs/rebuild-logs/` — catatan pengerjaan per fase

## Catatan Penting

- Build production tidak otomatis menjalankan migrasi Supabase.
- File backup lokal ada di `local-backups/` dan tidak seharusnya ikut masuk ke git.
- Kalau Anda butuh panduan teknis yang lebih detail, mulai dari `docs/README.md`.

## License

Private

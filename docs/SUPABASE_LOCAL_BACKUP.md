# Supabase Local Backup Runbook

Dokumen ini menjelaskan backup lokal Supabase untuk repo Trainers SuperApp. Backup lengkap terdiri dari dua lapisan: database PostgreSQL dan file fisik Supabase Storage.

## Ringkasan

- Database backup memakai `pg_dump` dan disimpan di `local-backups/supabase/<timestamp>/`.
- Storage backup memakai Supabase Storage API dan disimpan di `local-backups/supabase-storage/<timestamp>/`.
- Folder `local-backups/` sudah masuk `.gitignore` karena backup berisi PII dan data internal.
- Backup database dan storage dibuat terpisah. Untuk snapshot lengkap, jalankan keduanya dalam waktu berdekatan.

## Prasyarat

Install PostgreSQL client tools agar `pg_dump`, `pg_restore`, dan `psql` tersedia:

```bash
brew install libpq
brew link --overwrite libpq
```

Environment yang dibutuhkan:

```bash
SUPABASE_DB_URL="postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require"
VITE_SUPABASE_URL="https://<project-ref>.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
```

Jangan commit connection string, service role key, atau isi `local-backups/`.

## Command

Backup database `public` schema:

```bash
SUPABASE_DB_URL="postgresql://..." npm run backup:supabase
```

Backup storage semua bucket:

```bash
VITE_SUPABASE_URL="https://..." \
SUPABASE_SERVICE_ROLE_KEY="..." \
npm run backup:supabase:storage
```

Backup database dan storage:

```bash
SUPABASE_DB_URL="postgresql://..." \
VITE_SUPABASE_URL="https://..." \
SUPABASE_SERVICE_ROLE_KEY="..." \
npm run backup:supabase:all
```

Backup bucket tertentu:

```bash
SUPABASE_STORAGE_BUCKETS="profiler-foto" npm run backup:supabase:storage
```

## Artifact Database

Output database:

```text
local-backups/supabase/<timestamp>/
  public.dump
  public.schema.sql
  public.data.sql
  table-counts.txt
  backup-meta.json
  restore-notes.md
```

Artifact penting:

- `public.dump`: custom-format dump untuk `pg_restore`.
- `public.schema.sql`: schema-only SQL untuk audit.
- `public.data.sql`: data-only SQL untuk inspeksi/manual restore.
- `table-counts.txt`: exact row count per tabel `public`.
- `backup-meta.json`: metadata backup dan versi tool.
- `restore-notes.md`: instruksi restore sesuai mode backup.

## Artifact Storage

Output storage:

```text
local-backups/supabase-storage/<timestamp>/
  storage/
    profiler-foto/
    reports/
    telefun-recordings/
  storage-manifest.jsonl
  storage-summary.json
  storage-errors.jsonl
  restore-storage-notes.md
```

Artifact penting:

- `storage/`: file fisik per bucket, mengikuti path asli Supabase.
- `storage-manifest.jsonl`: satu baris per object, berisi bucket, path, size, content type, dan SHA256.
- `storage-summary.json`: summary jumlah object dan total bytes per bucket.
- `storage-errors.jsonl`: daftar object gagal download. File kosong berarti tidak ada error.

Bucket aktif:

- `profiler-foto`: Foto aset peserta (KTP/Profiler).
- `reports`: Dokumen laporan AI SIDAK (`.docx` dan `.html`).
- `telefun-recordings`: Rekaman Telefun.

## Restore Database

Restore ke Neon/Postgres eksternal:

```bash
pg_restore \
  --verbose \
  --no-owner \
  --no-privileges \
  --dbname "$TARGET_DATABASE_URL" \
  local-backups/supabase/<timestamp>/public.dump
```

Untuk Neon, gunakan unpooled connection string, bukan PgBouncer pooled URL.

Restore SQL manual:

```bash
psql "$TARGET_DATABASE_URL" -f local-backups/supabase/<timestamp>/public.schema.sql
psql "$TARGET_DATABASE_URL" -f local-backups/supabase/<timestamp>/public.data.sql
```

Setelah restore, bandingkan row count target dengan `table-counts.txt`.

## Restore Storage

Storage restore belum diotomasi. Gunakan `restore-storage-notes.md` dari folder backup sebagai panduan restore manual.

Langkah umum:

1. Buat bucket target dengan nama yang sama.
2. Upload ulang file dari `storage/<bucket>/...` ke bucket target.
3. Cocokkan object target dengan `storage-manifest.jsonl`.
4. Sampling file penting dan verifikasi ukuran/SHA256 jika diperlukan.

## Validasi Backup

Validasi database:

```bash
pg_restore --list local-backups/supabase/<timestamp>/public.dump | head
cat local-backups/supabase/<timestamp>/table-counts.txt
```

Validasi storage:

```bash
cat local-backups/supabase-storage/<timestamp>/storage-summary.json
wc -l local-backups/supabase-storage/<timestamp>/storage-manifest.jsonl
cat local-backups/supabase-storage/<timestamp>/storage-errors.jsonl
```

Backup storage dianggap bersih jika `storage-errors.jsonl` kosong dan `totalFailed` di `storage-summary.json` bernilai `0`.

## Batasan

- Backup ini adalah snapshot manual, bukan point-in-time recovery.
- `pg_dump` tidak membackup file fisik Storage.
- Storage backup tidak membackup RLS policy; policy storage ikut tercakup dalam database dump.
- Backup berisi PII: profil, foto, nomor telepon, QA records, hasil simulasi, usage/billing, dan dokumen internal.
- Jangan commit artifact backup atau secret env ke repository.

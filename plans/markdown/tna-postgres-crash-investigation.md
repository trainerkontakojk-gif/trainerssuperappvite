# Investigasi crash PostgreSQL lokal — TNA T1

## Status

**T1 tetap BLOCKED.** Investigasi memakai tepat **5 pemanggilan reproduksi baru**, sesuai batas Fajar. Semua pemanggilan menyebabkan crash; database kembali sehat setelah masing-masing pemanggilan. Crash dari pengujian T1 sebelumnya tidak termasuk lima pemanggilan investigasi ini.

Tidak ada perubahan migrasi TNA, assertion, image, extension, konfigurasi, atau `shared_preload_libraries`. Tidak reset database, tidak mengakses remote, tidak commit/push. Tiga fungsi dummy dibuat sementara dan seluruhnya dihapus. Tidak menjalankan ulang E2E T1 setelah budget reproduksi habis.

## Kesimpulan yang terbukti

1. **PostgREST tidak diperlukan:** pemanggilan langsung melalui psql dengan `SET LOCAL ROLE authenticated` sudah menyebabkan signal 11.
2. **Bukan khusus logika TNA:** dummy PL/pgSQL dengan isi hanya `BEGIN RETURN 1; END` juga crash; fungsi Telefun existing berperilaku sama.
3. **SECURITY DEFINER bukan syarat wajib:** varian SECURITY INVOKER dengan SET search_path juga crash.
4. **SET search_path bukan syarat wajib:** varian SECURITY DEFINER tanpa SET search_path juga crash.
5. Semua pemanggilan diuji hanya setelah `has_function_privilege('authenticated', signature, 'EXECUTE') = false`. Karena itu ekspektasinya penolakan izin, bukan eksekusi isi fungsi.
6. **Pola teramati:** pemanggilan fungsi PL/pgSQL tanpa EXECUTE oleh authenticated pada image/konfigurasi lokal ini mematikan backend PostgreSQL dan menyebabkan pemulihan seluruh instance.

Ini menunjukkan masalah lebih umum daripada TNA pada lingkungan yang diuji. **Tidak membuktikan semua fungsi terlarang, seluruh image PostgreSQL 17, atau produksi terdampak.** Belum menguji fungsi LANGUAGE SQL, kombinasi SECURITY INVOKER tanpa SET search_path, maupun pemanggilan fungsi dummy yang diizinkan. Tidak melampaui budget untuk melengkapi matrix tersebut.

## Lingkungan lokal (read-only)

- Container: `supabase_db_trainerssuperappvite`.
- Image aktual: `public.ecr.aws/supabase/postgres:17.6.1.106`.
- Server: PostgreSQL 17.6, x86_64-pc-linux-gnu, GCC 15.2.0.
- Docker `oomKilled=false`; log menunjukkan signal 11, bukan bukti OOM kill.
- `shared_preload_libraries`:
  `pg_stat_statements, pgaudit, plpgsql, plpgsql_check, pg_cron, pg_net, pgsodium, auto_explain, pg_tle, plan_filter, supabase_vault`.
- `pgaudit.log = none`; `plpgsql_check.mode = by_function`. Nilai hanya dibaca, tidak diubah.
- Catalog pg_available_extensions menunjukkan default version pgaudit 17.1, plpgsql_check 2.8, pg_tle 1.4.0; installed_version kosong untuk ketiganya. Ini tidak berarti shared libraries tersebut tidak dimuat, karena shared_preload_libraries memang memuatnya.
- `tna_create_need(uuid,jsonb)` dan `claim_telefun_realtime_orphans(integer)` berbahasa plpgsql, SECURITY DEFINER, EXECUTE authenticated false, service_role true.

## Metode dan hasil

Konfigurasi dibaca dari `.env.integration` tanpa mencetak nilainya. Host API dan database diwajibkan loopback. Setiap pemanggilan dilakukan dalam koneksi psql terpisah dengan:

```sql
BEGIN READ ONLY;
SET LOCAL ROLE authenticated;
SELECT <function call>;
ROLLBACK;
```

Sebelum pemanggilan: verifikasi database `SELECT 1` berhasil dan hak EXECUTE authenticated false. Sesudah pemanggilan: tunggu database menerima koneksi lagi dan verifikasi `SELECT 1` berhasil sebelum lanjut. Readiness probes bukan pemanggilan reproduksi tambahan.

| #   | Fungsi/pola                                       | Definer                  | SET search_path                 | Hasil                  | Pulih |
| --- | ------------------------------------------------- | ------------------------ | ------------------------------- | ---------------------- | ----- |
| 1   | TNA `tna_create_need(uuid,jsonb)`                 | Ya                       | public                          | psql exit 2, signal 11 | Ya    |
| 2   | Dummy `RETURN 1`                                  | Ya                       | public                          | psql exit 2, signal 11 | Ya    |
| 3   | Dummy `RETURN 1`                                  | Tidak (SECURITY INVOKER) | public                          | psql exit 2, signal 11 | Ya    |
| 4   | Dummy `RETURN 1`                                  | Ya                       | Tidak ada proconfig search_path | psql exit 2, signal 11 | Ya    |
| 5   | Telefun `claim_telefun_realtime_orphans(integer)` | Ya                       | empty string                    | psql exit 2, signal 11 | Ya    |

Pemanggilan pertama:

```sql
SELECT public.tna_create_need(
  '00000000-0000-4000-8000-000000000000'::uuid,
  '{}'::jsonb
);
```

Actor UUID itu sintetis, bukan akun existing; fungsi seharusnya tidak mencapai actor validation karena pemanggil tidak punya EXECUTE.

DDL dummy (nama unik per run; berikut bentuknya):

```sql
CREATE FUNCTION public.<owned_dummy>() RETURNS integer
LANGUAGE plpgsql
-- SECURITY DEFINER atau SECURITY INVOKER sesuai matrix
-- SET search_path = public atau tanpa clause sesuai matrix
AS $$ BEGIN RETURN 1; END; $$;
REVOKE ALL ON FUNCTION public.<owned_dummy>() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.<owned_dummy>() TO service_role;
```

Pembanding existing:

```sql
SELECT public.claim_telefun_realtime_orphans(1);
```

Pola grant/sumber Telefun: `supabase/migrations/20260801142542_telefun_openai_webrtc_phase5_production_hardening.sql` (fungsi dan grant pada akhir migrasi). Tidak ada mutasi data Telefun; pemanggilan ditolak/crash sebelum berhasil dan koneksi berada dalam transaksi read-only.

## Potongan log

Semua timestamp UTC pada 2026-10-08:

```text
06:41:54.159 server process (PID 2207) was terminated by signal 11: Segmentation fault
06:41:54.917 database system is ready to accept connections
06:41:56.760 server process (PID 2291) was terminated by signal 11: Segmentation fault
06:41:57.627 database system is ready to accept connections
06:41:58.861 server process (PID 2335) was terminated by signal 11: Segmentation fault
06:42:00.577 database system is ready to accept connections
06:42:03.328 server process (PID 2391) was terminated by signal 11: Segmentation fault
06:42:04.264 database system is ready to accept connections
06:42:05.163 server process (PID 2435) was terminated by signal 11: Segmentation fault
06:42:05.855 database system is ready to accept connections
```

psql pada kelima kasus: `server closed the connection unexpectedly`, exit 2. Tidak ada error 42501 yang berhasil dikembalikan ke client. Log juga mencatat backend lain diterminasi/reinitializing sesudah crash.

## Akar penyebab: batas bukti

Lokasi kerusakan telah dipersempit ke **server PostgreSQL lokal beserta loaded hooks/libraries saat pemanggilan fungsi tanpa izin**. Komponen/bug spesifik belum teridentifikasi. Tidak ada stack trace untuk menyalahkan pgaudit, plpgsql_check, extension lain, atau PostgreSQL core secara pasti.

Pemeriksaan read-only tidak menemukan gdb/eu-stack di PATH container maupun file `core*` pada pencarian terbatas `/var/lib/postgresql` dan `/tmp` (maxdepth 3). Ini bukan bukti bahwa core dump tidak ada di lokasi lain/host. Tidak memasang debugger atau mengubah core-dump settings.

## Cleanup dan evidence

- Ketiga fungsi dummy di-DROP setelah seluruh lima pemanggilan; setiap DROP exit 0.
- Query catalog terakhir menemukan 0 fungsi dengan prefix run `tna_probe_0dcd330b2097_`.
- Database `SELECT 1` berhasil pada akhir investigasi; verifikasi read-only exit 0.
- Perintah utama: `python3 /tmp/tna-crash-investigation.py`, exit 0 sebagai keberhasilan pengumpulan bukti/cleanup, **bukan** keberhasilan pemanggilan fungsi.
- Script/results sementara bukan artifact repo; SQL, matrix, dan potongan log di dokumen ini menjadi artifact handoff. Jangan menjalankan ulang reproduksi tanpa izin budget baru.

## Dampak dan usulan berikutnya

**Potensi denial-of-service terkonfirmasi di lokal:** role authenticated tanpa EXECUTE dapat menjatuhkan database melalui fungsi terlarang. Fungsi existing juga terkena, jadi jangan mengubah SQL/grant TNA atau memberikan EXECUTE kepada authenticated sebagai workaround.

1. Fajar membandingkan image/server version dan loaded libraries produksi secara read-only lewat dashboard/admin yang diotorisasi. **Jangan mencoba RPC pemicu pada produksi.** Versi yang sama membuat risiko relevan untuk ditinjau, tetapi bukan bukti produksi pasti terdampak.
2. Siapkan bug report privat untuk maintainer Supabase/Postgres dengan minimal DDL dummy, grant, SQL SET ROLE, exact image, matrix, dan log. Jangan sertakan credential/data produksi; tidak dipublikasikan oleh agent tanpa izin.
3. Untuk memastikan library/stack penyebab, butuh langkah tambahan yang belum diotorisasi: akses core/backtrace atau reproduksi di lingkungan disposable terpisah dengan debugger dan isolasi konfigurasi. Itu bukan alasan untuk mengubah stack lokal aktif sekarang.
4. T1 tetap BLOCKED. Setelah akar/target aman diputuskan Fajar, lanjutkan gate asli expected 42501 dan review implementasi parsial; baru kemudian menentukan apakah T1 selesai. Tidak melanjutkan T2 otomatis.

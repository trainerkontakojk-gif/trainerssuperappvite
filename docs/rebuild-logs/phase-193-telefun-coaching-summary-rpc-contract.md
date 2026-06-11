# Rebuild Log: Phase 193 — Telefun Coaching Summary RPC Contract

## Root Cause

Sebelumnya, endpoint API untuk generate anotasi Telefun (`POST /annotations/generate/:id`) mengalami kegagalan partial persistence karena ketidaksesuaian kontrak parameter pemanggilan RPC `public.upsert_telefun_coaching_summary`:
1. **RPC Mismatch**: Route mengirim 5 argument, termasuk `p_user_id`. Namun, signature RPC di database tidak menerima `p_user_id` (menggunakan database lookup `user_id` berdasarkan `p_session_id`).
2. **False Success**: Route Hono tidak mengecek object `error` dari respons RPC (`.rpc()`), sehingga kegagalan ini tidak memicu block `catch` dan tetap mengembalikan respons HTTP 200 secara salah (false success) kepada user meskipun coaching summary gagal di-update.
3. **Invalid Checksum**: Checksum dihitung menggunakan Base64 dari payload mentah, padahal constraint database mewajibkan lowercase SHA-256 hex 64 karakter dengan pola `^[a-f0-9]{64}$`. Checksum juga tidak dihitung dari data yang benar-benar dipersist setelah normalisasi dan pemotongan teks.
4. **Overload Legacy**: Database lokal/hosted masih memiliki overload legacy 2-arg `upsert_telefun_coaching_summary(UUID, JSONB)` dari migrasi lama yang dapat memicu schema drift atau pemanggilan endpoint yang salah.

---

## Perubahan yang Dilakukan

1. **Route API (`apps/api/src/routes/telefun/annotations.ts`)**:
   - Menambahkan import `createHash` dari `node:crypto`.
   - Normalisasi `annotationRows` (`moment` null/undefined diset ke `null` dan `text` dipotong maksimal 500 karakter).
   - Membuat helper `createReplayAnnotationChecksum` untuk menghitung checksum SHA-256 lowercase hex secara deterministik dari `annotationRows` non-manual yang sudah dinormalisasi dan di-sort.
   - Menghapus key `p_user_id` dari payload RPC pemanggilan `upsert_telefun_coaching_summary`.
   - Menambahkan pengecekan `rpcError` secara eksplisit dan melempar error jika terjadi kesalahan agar route fail closed dengan status HTTP 500.

2. **Terminal Database Migration (`supabase/migrations/20260611100000_fix_telefun_coaching_summary_rpc_contract.sql`)**:
   - Menghapus overload legacy 2-arg secara idempoten:
     ```sql
     DROP FUNCTION IF EXISTS public.upsert_telefun_coaching_summary(UUID, JSONB);
     ```
   - Menegaskan kembali hak akses EXECUTE hanya untuk `authenticated` dan `service_role` pada signature final 4-arg.

3. **Regression Tests**:
   - Membuat unit test baru di `apps/api/src/__tests__/telefun-annotations-rpc-contract.test.ts` untuk menguji helper checksum, format checksum, ketepatan payload RPC (tepat 4 parameter, tanpa `p_user_id`), determinisme, dan penanganan `rpcError`.
   - Test route menangkap row insert dan membuktikan checksum RPC dihitung dari row yang sudah dinormalisasi serta dipotong ke 500 karakter.
   - Menambahkan asersi contract pada `apps/api/src/__tests__/telefun-schema-contract.test.ts` untuk memverifikasi DROP overload 2-arg, privilege signature final, posisi terminal migration, dan default parameter metadata.

---

## Verifikasi dan Hasil

1. **Focused Tests**:
   ```bash
   pnpm --filter @trainers/api exec vitest run src/__tests__/telefun-annotations-rpc-contract.test.ts src/__tests__/telefun-schema-contract.test.ts
   ```
   Hasil: 2 file, 10 test lulus.

2. **Command Test dari Instruksi Audit**:
   ```bash
   pnpm --filter @trainers/api test -- src/__tests__/telefun-annotations-rpc-contract.test.ts src/__tests__/telefun-schema-contract.test.ts
   ```
   Script package sudah menggunakan `vitest run`, sehingga tambahan `--` membuat Vitest menjalankan seluruh suite API. Hasilnya 672 test lulus, 1 skipped, dan 2 test SIDAK yang tidak terkait gagal di `sidak-dashboard-available-services.test.ts` karena fixture tidak memiliki indikator layanan `chat`.

3. **Lint & Build API**:
   ```bash
   pnpm --filter @trainers/api lint
   pnpm --filter @trainers/api build
   ```
   Keduanya exit 0.

4. **Migration Validator**:
   Validator tidak dapat dijalankan sampai replay karena environment audit tidak menyediakan `DATABASE_URL` atau `SUPABASE_DB_URL`. Contract migration tetap diverifikasi secara statis oleh test schema.

5. **Call Site Audit**:
   Call 2-arg di `apps/api/src/lib/telefun-analysis.ts` tetap kompatibel karena `p_ai_annotation_count` dan `p_ai_annotation_checksum` memiliki `DEFAULT NULL`. Tidak ditemukan call lain ke `upsert_telefun_coaching_summary` yang mengirim `p_user_id`; named arguments RPC lain dalam scope Task 4 sesuai dengan signature migration finalnya.

---

## Rollback Plan

Jika kompatibilitas lama diperlukan atau terjadi regresi yang tidak terduga pada server production:
1. Revert perubahan kode di `apps/api/src/routes/telefun/annotations.ts` dan test files.
2. Jika perlu me-restore overload legacy 2-arg `upsert_telefun_coaching_summary(UUID, JSONB)`, terapkan ulang definisi fungsi tersebut dari source historis `supabase/migrations/005_carbon_copy_parity.sql:282`.
3. Verifikasi ulang `pg_proc` untuk memastikan tanda tangan fungsi lama telah kembali.

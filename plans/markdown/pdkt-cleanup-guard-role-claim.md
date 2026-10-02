# Tugas Pi: perbaiki guard `cleanup_pdkt_mailbox_subject_intents` (PDKT subject intent cleanup)

Repo: `~/Downloads/_Projects/trainerssuperappvite` (branch `main`). Bahasa laporan: Indonesia.

## Masalah produksi

API Trainers SuperApp menjadwalkan cleanup PDKT subject intent tiap 15 menit
(`apps/api/src/api-runtime.ts` → `startPdktMailboxSubjectIntentCleanup()`,
interval di `apps/api/src/services/pdkt/mailbox-subject-intent-cleanup.ts`).
Setiap jadwal gagal dan menulis log error:

```
[PDKT] Subject intent cleanup failed: {
  code: 'P0001',
  message: 'FORBIDDEN: subject intent cleanup is service-role only'
}
```

Log produksi 28–30 Sep 2026: 165 kejadian, jarak antar kejadian konsisten ~15 menit
(≈4×/jam), 24 jam nonstop. Bukan error sekali jalan.

## Root cause (sudah diverifikasi, bukan dugaan)

1. Semua pemanggil memakai `supabaseAdmin` (`apps/api/src/lib/supabase.ts`) yang dibangun
   dengan `SUPABASE_SERVICE_ROLE_KEY`. Jadi pemanggil memang service role.
2. Bukti kuat dari DB: kalau pemanggil bukan service_role, PostgREST akan menolak lebih dulu
   dengan `permission denied for function` (EXECUTE sudah `REVOKE` dari `PUBLIC, anon,
   authenticated`). Yang muncul justru pesan `RAISE EXCEPTION` dari **dalam** badan fungsi —
   artinya pemanggil punya EXECUTE (service_role) tapi guard-nya tidak mengenali role-nya.
3. Guard versi lama (`supabase/migrations/20260910000853_pdkt_mailbox_subject_intent_cleanup.sql`)
   hanya membaca GUC legacy `request.jwt.claim.role`. PostgREST versi yang dipakai Supabase
   sekarang tidak lagi mengeset GUC claim per-claim: claims terverifikasi tersedia sebagai satu
   GUC JSON `request.jwt.claims`, sementara `session_user` koneksi tetap `authenticator`.
   Akibatnya kedua cabang guard gagal → RAISE → cleanup tidak pernah benar-benar jalan.
4. Kenapa test lama tidak menangkap: test integrasi menjalankan migrasi di PostgreSQL lokal dan
   `session_user` = `postgres`, jadi guard lolos lewat cabang `session_user` — bentuk request
   PostgREST tidak pernah direproduksi.

RED/GREEN yang sudah dibuktikan (repro SQL, `session_user=authenticator` + claims JSON):

```
=== guard BEFORE fix (20260910000853) ===
ERROR:  FORBIDDEN: subject intent cleanup is service-role only
=== guard AFTER fix (20260930120000) ===
1            -- deleted count; fungsi jalan
```

## Yang harus dikerjakan

Cek dulu apakah perubahan ini sudah ada di working tree (implementasi sudah pernah dilakukan):

```bash
git -C ~/Downloads/_Projects/trainerssuperappvite status --porcelain |
  grep -E 'pdkt_mailbox_subject_intent_cleanup_role_guard|simulation-subject-rpc.integration'
```

- **Jika sudah ada**: jangan tulis ulang dari nol. Verifikasi (bagian Verifikasi di bawah), baca
  diff-nya, perbaiki hanya kalau ada yang gagal, lalu commit hanya dua path itu.
- **Jika belum ada**: buat dua perubahan berikut persis.

### 1. Migrasi baru (jangan pernah mengubah migrasi yang sudah terkirim)

File baru: `supabase/migrations/20260930120000_fix_pdkt_mailbox_subject_intent_cleanup_role_guard.sql`

```sql
-- PDKT subject-intent cleanup is scheduled by the API every 15 minutes and runs
-- through PostgREST with the service-role key.
--
-- The original guard only read the legacy per-claim GUC
-- `request.jwt.claim.role`. Current PostgREST no longer sets the legacy claim
-- GUCs: the verified claims arrive as one JSON GUC, `request.jwt.claims`, while
-- the connection's `session_user` stays `authenticator`. A legitimate
-- service-role call therefore hit the RAISE below and logged
-- `FORBIDDEN: subject intent cleanup is service-role only` every scheduled run.
--
-- EXECUTE stays restricted to service_role by the REVOKE/GRANT at the bottom of
-- this file; this migration only teaches the in-function guard to read the role
-- from the GUC that PostgREST actually sets, keeping the legacy GUC and direct
-- postgres/service-role sessions as fallbacks.

CREATE OR REPLACE FUNCTION public.cleanup_pdkt_mailbox_subject_intents()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
  jwt_role TEXT;
BEGIN
  -- `request.jwt.claims` is JSON. A malformed or absent setting must fall
  -- through to the other checks instead of aborting cleanup with a parse error.
  BEGIN
    jwt_role := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  EXCEPTION
    WHEN others THEN
      jwt_role := NULL;
  END;

  IF jwt_role IS NULL THEN
    jwt_role := NULLIF(current_setting('request.jwt.claim.role', true), '');
  END IF;

  -- SECURITY DEFINER changes current_user to the function owner, so the guard
  -- deliberately tests the JWT role claim and session_user only.
  IF COALESCE(jwt_role, '') NOT IN ('service_role', 'postgres', 'supabase_admin')
     AND session_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: subject intent cleanup is service-role only';
  END IF;

  DELETE FROM public.pdkt_mailbox_subject_intents
   WHERE consumed_at IS NOT NULL
      OR expires_at <= clock_timestamp();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_pdkt_mailbox_subject_intents() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_pdkt_mailbox_subject_intents() TO service_role;

COMMENT ON FUNCTION public.cleanup_pdkt_mailbox_subject_intents() IS
  'Deletes consumed or expired PDKT mailbox subject intents containing temporary participant snapshots.';
```

### 2. Regression test bentuk PostgREST

File: `apps/api/src/__tests__/simulation-subject-rpc.integration.test.ts`

- Tambahkan path migrasi baru ke `MIGRATION_PATHS` (setelah
  `20260910000853_pdkt_mailbox_subject_intent_cleanup.sql`).
- Di blok setup `beforeAll`: tambah `CREATE ROLE authenticator NOLOGIN;` dan
  `GRANT service_role TO authenticator;` (agar `SET ROLE service_role` sah dari `authenticator`).
- Tambah dua test setelah test `"keeps intent cleanup executable only by the service role"`:

```ts
  it("lets the scheduled PostgREST caller clean up when the role claim arrives as JSON", async () => {
    // Production shape: PostgREST connects as `authenticator`, exposes the
    // verified claims as the JSON GUC `request.jwt.claims`, and switches the
    // request to the JWT role. The legacy `request.jwt.claim.role` GUC is not
    // set, which is what made every scheduled cleanup log FORBIDDEN.
    const consumedToken = randomUUID();
    await withRole("service_role", TRAINER_ID, async () => {
      await db.client.query(
        `INSERT INTO public.pdkt_mailbox_subject_intents
           (token, actor_id, subject_type, subject_peserta_id, subject_name,
            client_request_id, expires_at, consumed_at)
         VALUES ($1, $2, 'participant', $3, 'Consumed', $4,
                 now() + interval '30 minutes', now())`,
        [consumedToken, TRAINER_ID, PARTICIPANT_ID, randomUUID()],
      );
    });

    await db.client.query("BEGIN");
    try {
      await db.client.query("SET LOCAL SESSION AUTHORIZATION authenticator");
      await db.client.query(
        "SELECT set_config('request.jwt.claims', $1, true)",
        [JSON.stringify({ role: "service_role" })],
      );
      await db.client.query("SET LOCAL ROLE service_role");
      const cleanup = await db.client.query(
        "SELECT public.cleanup_pdkt_mailbox_subject_intents() AS deleted",
      );
      expect(Number(cleanup.rows[0].deleted)).toBeGreaterThanOrEqual(1);
    } finally {
      await db.client.query("ROLLBACK");
    }
  });

  it("still refuses a JSON role claim that is not the service role", async () => {
    await db.client.query("BEGIN");
    try {
      await db.client.query("SET LOCAL SESSION AUTHORIZATION authenticator");
      await db.client.query(
        "SELECT set_config('request.jwt.claims', $1, true)",
        [JSON.stringify({ role: "authenticated" })],
      );
      await db.client.query("SET LOCAL ROLE service_role");
      await expect(
        db.client.query(
          "SELECT public.cleanup_pdkt_mailbox_subject_intents()",
        ),
      ).rejects.toThrow(/service-role only/);
    } finally {
      await db.client.query("ROLLBACK");
    }
  });
```

Catatan: test pertama sengaja `ROLLBACK`, jadi jangan meng-assert isi tabel setelah blok itu —
deletenya ikut ter-rollback. Yang membuktikan fix adalah nilai `deleted` yang ≥ 1.

## Verifikasi (wajib dijalankan, laporkan output apa adanya)

```bash
cd ~/Downloads/_Projects/trainerssuperappvite/apps/api

# 1. Unit test service cleanup (tanpa DB)
LC_ALL=en_US.UTF-8 npx vitest run src/__tests__/pdkt-mailbox-subject-intent-cleanup.test.ts

# 2. Integration test di PostgreSQL disposable (bentuk PostgREST)
LC_ALL=en_US.UTF-8 npx vitest run --config vitest.config.db-integration.ts \
  src/__tests__/simulation-subject-rpc.integration.test.ts

# 3. Lint file yang diubah
npx eslint src/__tests__/simulation-subject-rpc.integration.test.ts
```

Harapan: unit 2/2 lulus, integrasi 15/15 lulus, eslint bersih.

`LC_ALL` **wajib** di macOS: tanpa itu `pg_ctl` gagal start dengan
`FATAL: postmaster became multithreaded during startup`. Ini quirk lingkungan, bukan bug kode.

### Bukti test punya gigi (mutation check, wajib)

Pastikan test baru benar-benar menangkap bug lama:

1. `cp -a supabase/migrations/20260930120000_*.sql /tmp/keep.sql` (backup, jangan pakai
   `git checkout` untuk membatalkan karena working tree berisi pekerjaan orang lain yang belum di-commit)
2. Sementara keluarkan path migrasi baru dari `MIGRATION_PATHS` (atau jalankan repro SQL di bawah)
3. Test `"lets the scheduled PostgREST caller clean up..."` harus **FAIL** dengan
   `FORBIDDEN: subject intent cleanup is service-role only`
4. Pulihkan file dari backup, jalankan ulang, harus lulus

Repro SQL mandiri bila ingin bukti RED/GREEN di luar vitest: buat DB disposable, jalankan migrasi
lama saja, lalu

```sql
BEGIN;
SET LOCAL SESSION AUTHORIZATION authenticator;   -- session_user seperti PostgREST
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
SELECT public.cleanup_pdkt_mailbox_subject_intents();
ROLLBACK;
```

→ migrasi lama: `ERROR: FORBIDDEN: subject intent cleanup is service-role only`;
→ setelah migrasi baru: mengembalikan integer tanpa error.

## Guardrail (jangan dilanggar)

- **Jangan melonggarkan keamanan.** Jangan `GRANT EXECUTE` ke `anon`/`authenticated`/`PUBLIC`,
  jangan menghapus guard, jangan pakai `SECURITY INVOKER`, jangan menambah `current_user` ke
  daftar yang diizinkan (di bawah `SECURITY DEFINER` `current_user` = owner fungsi, sehingga
  guard jadi tidak berguna).
- **Jangan menyentuh service-role key di frontend** dan jangan mengubah nilai env apa pun.
- Migrasi yang sudah terkirim tidak boleh diedit; perbaikan selalu migrasi baru.
- **Working tree repo ini kotor** dengan pekerjaan modul SIDAK milik orang/agent lain
  (`apps/web/**`, `apps/api/src/routes/sidak*`, `packages/types/src/sidak.ts`,
  `supabase/migrations/20261001120000_add_temuan_business_dates.sql`, `plans/markdown/…`).
  Jangan stash, reset, checkout, rebase, atau commit file-file itu. Stage **eksplisit per path**:

  ```bash
  git add supabase/migrations/20260930120000_fix_pdkt_mailbox_subject_intent_cleanup_role_guard.sql \
          apps/api/src/__tests__/simulation-subject-rpc.integration.test.ts
  ```

  Dilarang `git add -A`, `git add -u`, `git commit -a`, `git push --force`.
- Jangan commit kalau test gagal. Jangan menyamarkan test gagal sebagai "flaky".

## Definition of done

1. Dua file di atas ada di working tree dengan isi sesuai.
2. Unit 2/2, integrasi 15/15, eslint bersih — disertai output nyata.
3. Mutation check dijalankan dan hasil RED-nya dilaporkan (bukan hanya diklaim).
4. Commit terpisah, pesan: `fix(pdkt): read service-role claim from request.jwt.claims in subject intent cleanup`.
5. **Tidak** di-push (Fajar yang memutuskan push).

## Di luar scope (jangan dikerjakan, cukup laporkan sebagai sisa pekerjaan)

- Menerapkan migrasi ke Supabase produksi (`supabase db push` / SQL editor) — dilakukan Fajar,
  setelah itu log `Subject intent cleanup failed` harus berhenti.
- Mengubah kode API (`mailbox-subject-intent-cleanup.ts`, `api-runtime.ts`): tidak perlu diubah,
  caller-nya sudah benar.

## Format laporan akhir

- Status tiap file (path + ringkas perubahan).
- Output nyata dari 3 perintah verifikasi (jumlah test lulus/gagal).
- Hasil mutation check: RED terlihat / tidak, beserta pesan errornya.
- Commit hash dan konfirmasi belum di-push.
- Apa yang **tidak** dijalankan (mis. suite penuh, E2E, apply migrasi ke prod) dan risiko yang
  masih terbuka.

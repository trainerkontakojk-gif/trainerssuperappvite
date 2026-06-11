# Telefun Coaching Summary RPC Contract Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Memastikan endpoint generate anotasi Telefun memakai kontrak RPC yang valid, menghasilkan checksum yang sesuai schema, dan gagal secara eksplisit bila coaching summary tidak tersimpan.

**Architecture:** Pertahankan route Hono dan RPC `SECURITY DEFINER` yang sudah ada. API tetap memakai service-role client, sedangkan PostgreSQL mengambil `user_id` dari `telefun_history` berdasarkan `p_session_id`; API tidak mengirim `p_user_id`. Tambahkan terminal migration untuk menghapus overload 2-arg lama, lalu lindungi kontrak tersebut dengan regression test route/helper dan migration contract test.

**Tech Stack:** TypeScript, Hono, Supabase JS/PostgREST RPC, PostgreSQL PL/pgSQL, Vitest.

---

## Requirement

### Tujuan

Memperbaiki kontrak persistensi hasil generate AI pada:

- `apps/api/src/routes/telefun/annotations.ts`
- RPC `public.upsert_telefun_coaching_summary`

### Temuan Tervalidasi

1. Route memanggil RPC dengan lima named arguments, termasuk `p_user_id`.
2. Migration hanya mendefinisikan:
   - `(p_session_id UUID, p_recommendations JSONB)`
   - `(p_session_id UUID, p_recommendations JSONB, p_ai_annotation_count INTEGER, p_ai_annotation_checksum TEXT)`
3. Tidak ada overload yang menerima `p_user_id`.
4. `20260523000000_telefun_parity_extensions.sql` tidak menghapus overload 2-arg dari `005_carbon_copy_parity.sql`.
5. Route tidak memeriksa properti `error` dari hasil `.rpc()`, sehingga kegagalan RPC tidak otomatis masuk ke blok `catch`.
6. Checksum saat ini berupa Base64 dari payload mentah, sedangkan constraint database mewajibkan lowercase SHA-256 hex dengan pola `^[a-f0-9]{64}$`.

### Acceptance Criteria

- Call dari route tidak mengirim `p_user_id`.
- Call memakai empat named arguments yang persis sama dengan signature final RPC.
- Checksum dihitung dengan SHA-256 dan menghasilkan 64 karakter lowercase hex.
- Checksum dihitung dari bentuk anotasi yang benar-benar dipersist, termasuk normalisasi/truncation.
- Route memeriksa `rpcError` dan mengembalikan HTTP 500 bila coaching summary gagal disimpan.
- Database hanya memiliki signature final `(uuid, jsonb, integer, text)` setelah seluruh migration dijalankan.
- Call 2-arg di `apps/api/src/lib/telefun-analysis.ts` tetap kompatibel melalui default parameter pada signature final.
- Regression tests membuktikan tidak ada `p_user_id`, checksum valid, error tidak diabaikan, dan overload legacy dihapus.
- Dokumentasi perubahan dibuat sebelum commit.

### Edge Cases

- `recommendations` kosong tetap dikirim sebagai array JSON kosong.
- Nilai `moment` null/undefined dinormalisasi secara deterministik sebelum hashing.
- Teks lebih dari 500 karakter di-hash setelah dipotong, sama dengan nilai yang disimpan.
- Urutan hasil AI yang berbeda tetapi berisi anotasi identik menghasilkan checksum yang sama.
- RPC mengembalikan `{ data: null, error }` tanpa melempar exception.
- Hosted database mungkin sudah memiliki kedua overload; karena itu perbaikan schema harus berupa terminal migration baru, bukan hanya mengedit migration lama.

### Constraint Teknis

- Jangan menambahkan `p_user_id` ke RPC. Sumber identitas tetap berasal dari `telefun_history.user_id`.
- Jangan mengandalkan `auth.uid()` untuk service-role. Body RPC yang ada sudah menangani `auth.role() = 'service_role'` dengan lookup session owner.
- Jangan mengubah migration historis sebagai satu-satunya remediation karena database yang sudah deployed tidak akan menjalankannya ulang.
- Tidak ada dependency baru; gunakan `createHash` dari `node:crypto`.

## Design

### Alur Data Setelah Perbaikan

1. Route memvalidasi session dan authorization.
2. Route menghasilkan serta menormalisasi `annotationRows`.
3. AI annotations disimpan.
4. Checksum SHA-256 dihitung dari `annotationRows` non-manual yang sudah dinormalisasi.
5. Route memanggil:

```ts
{
  p_session_id: sessionId,
  p_recommendations: normalizedRecommendations,
  p_ai_annotation_count: annotationRows.length,
  p_ai_annotation_checksum: checksum,
}
```

6. Route memeriksa `rpcError`.
7. Hanya bila RPC sukses, route mengembalikan `success: true`.

### Interface Changes

Tambahkan helper teruji di `apps/api/src/routes/telefun/annotations.ts` atau file helper terdekat:

```ts
import { createHash } from "node:crypto";

export function createReplayAnnotationChecksum(
  annotations: Array<{
    timestamp_ms: number;
    category: string;
    moment: string | null;
    text: string;
    is_manual: boolean;
  }>,
): string {
  const payload = annotations
    .filter((annotation) => !annotation.is_manual)
    .map(({ timestamp_ms, category, moment, text }) => ({
      timestamp_ms,
      category,
      moment,
      text,
    }))
    .sort((a, b) => {
      if (a.timestamp_ms !== b.timestamp_ms) return a.timestamp_ms - b.timestamp_ms;
      return `${a.category}:${a.moment ?? ""}:${a.text}`.localeCompare(
        `${b.category}:${b.moment ?? ""}:${b.text}`,
      );
    });

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
```

RPC harus dipanggil dengan error handling eksplisit:

```ts
const { error: rpcError } = await adminClient.rpc(
  "upsert_telefun_coaching_summary",
  {
    p_session_id: sessionId,
    p_recommendations: normalizedRecommendations,
    p_ai_annotation_count: annotationRows.length,
    p_ai_annotation_checksum: checksum,
  },
);

if (rpcError) {
  throw new Error(`Gagal menyimpan coaching summary: ${rpcError.message}`);
}
```

### Database Contract

Buat terminal migration baru:

`supabase/migrations/20260611100000_fix_telefun_coaching_summary_rpc_contract.sql`

Isi minimal:

```sql
DROP FUNCTION IF EXISTS public.upsert_telefun_coaching_summary(UUID, JSONB);

REVOKE ALL ON FUNCTION public.upsert_telefun_coaching_summary(UUID, JSONB, INTEGER, TEXT)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.upsert_telefun_coaching_summary(UUID, JSONB, INTEGER, TEXT)
  TO authenticated, service_role;
```

Migration harus gagal saat signature final tidak tersedia, sehingga schema drift tidak tersembunyi.

### File Ownership

| File | Perubahan |
| --- | --- |
| `apps/api/src/routes/telefun/annotations.ts` | Hapus `p_user_id`, buat checksum SHA-256 dari persisted rows, periksa `rpcError` |
| `apps/api/src/__tests__/telefun-annotations-rpc-contract.test.ts` | Regression tests untuk payload, checksum, dan propagasi error |
| `apps/api/src/__tests__/telefun-schema-contract.test.ts` | Tambah contract assertion untuk terminal migration dan signature final |
| `supabase/migrations/20260611100000_fix_telefun_coaching_summary_rpc_contract.sql` | Hapus overload 2-arg dan tegaskan privilege signature final |
| `docs/rebuild-logs/phase-193-telefun-coaching-summary-rpc-contract.md` | Catat root cause, perubahan, verifikasi, dan rollback |

## Tasklist

### Task 1: Tambahkan Regression Test yang Gagal

**Files:**

- Create: `apps/api/src/__tests__/telefun-annotations-rpc-contract.test.ts`
- Modify: `apps/api/src/__tests__/telefun-schema-contract.test.ts`

- [ ] Uji bahwa builder/persistence helper mengirim tepat empat argumen RPC.
- [ ] Uji bahwa object RPC tidak mempunyai key `p_user_id`.
- [ ] Uji checksum terhadap regex `/^[a-f0-9]{64}$/`.
- [ ] Uji checksum deterministik saat urutan anotasi berubah.
- [ ] Uji checksum memakai teks yang sudah dipotong ke batas persistensi.
- [ ] Mock `.rpc()` agar mengembalikan `{ data: null, error: { message: "rpc failed" } }`, lalu pastikan helper/route melempar sehingga response menjadi HTTP 500.
- [ ] Uji migration terminal mengandung:

```ts
expect(sql).toContain(
  "DROP FUNCTION IF EXISTS public.upsert_telefun_coaching_summary(UUID, JSONB);",
);
```

- [ ] Jalankan test sebelum implementasi:

```bash
pnpm --filter @trainers/api test -- \
  src/__tests__/telefun-annotations-rpc-contract.test.ts \
  src/__tests__/telefun-schema-contract.test.ts
```

Expected: FAIL karena call masih memiliki `p_user_id`, checksum bukan SHA-256 hex, error RPC diabaikan, dan terminal migration belum ada.

### Task 2: Perbaiki Call dan Checksum Route

**Files:**

- Modify: `apps/api/src/routes/telefun/annotations.ts`

- [ ] Import `createHash` dari `node:crypto`.
- [ ] Normalisasi `annotationRows` terlebih dahulu, termasuk `text.slice(0, 500)` dan `moment ?? null`.
- [ ] Hitung checksum dari `annotationRows`, bukan dari output AI mentah.
- [ ] Hapus `p_user_id` dari payload RPC.
- [ ] Destructure `{ error: rpcError }` dari hasil `.rpc()`.
- [ ] Throw error manusiawi bila `rpcError` tidak null.
- [ ] Jalankan test Task 1 dan pastikan test route/helper sudah PASS, sementara contract migration masih FAIL.

### Task 3: Hapus Overload Legacy dengan Terminal Migration

**Files:**

- Create: `supabase/migrations/20260611100000_fix_telefun_coaching_summary_rpc_contract.sql`

- [ ] Hapus hanya signature legacy `(UUID, JSONB)`.
- [ ] Jangan drop atau recreate tabel.
- [ ] Pertahankan signature final `(UUID, JSONB, INTEGER, TEXT)`.
- [ ] Revoke akses `public`/`anon` dan grant ke `authenticated`/`service_role`.
- [ ] Jalankan validator migration repo:

```bash
pnpm exec tsx scripts/validate-migrations.ts
```

Expected: exit 0.

- [ ] Bila Supabase lokal tersedia, replay migration lalu query `pg_proc`:

```sql
SELECT oidvectortypes(p.proargtypes) AS signature
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'upsert_telefun_coaching_summary';
```

Expected: tepat satu row, `uuid, jsonb, integer, text`.

### Task 4: Verifikasi Call Site RPC Lain

**Files:**

- Verify only: `apps/api/src/lib/telefun-analysis.ts`
- Verify only: `apps/api/src/services/pdkt/mailbox-service.ts`
- Verify only: `apps/api/src/services/profiler-service.ts`
- Verify only: `apps/api/src/services/monitoring-history-delete-service.ts`
- Verify only: `apps/api/src/services/sidak/temuan-service.ts`

- [ ] Pastikan call 2-arg di `telefun-analysis.ts` tetap valid karena parameter metadata memiliki default.
- [ ] Pastikan tidak ada call lain ke `upsert_telefun_coaching_summary` yang mengirim `p_user_id`.
- [ ] Cocokkan named arguments RPC lain dengan migration final masing-masing.
- [ ] Jangan memperluas perubahan bila tidak ditemukan mismatch lain.

### Task 5: Dokumentasi dan Verification Gate

**Files:**

- Create: `docs/rebuild-logs/phase-193-telefun-coaching-summary-rpc-contract.md`

- [ ] Dokumentasikan bahwa gejala sebelumnya adalah false success/partial persistence, bukan selalu HTTP 500.
- [ ] Dokumentasikan terminal migration dan rollback dengan menunjuk definisi overload 2-arg yang lengkap pada `supabase/migrations/005_carbon_copy_parity.sql:282`; jangan menulis ulang body yang berbeda dari sumber tersebut.

- [ ] Jalankan targeted verification:

```bash
pnpm --filter @trainers/api test -- \
  src/__tests__/telefun-annotations-rpc-contract.test.ts \
  src/__tests__/telefun-schema-contract.test.ts
pnpm --filter @trainers/api lint
pnpm --filter @trainers/api build
```

Expected: seluruh command exit 0.

- [ ] Jalankan core gate:

```bash
pnpm test:core
```

Expected: seluruh core tests PASS.

## Risk Assessment

| Risiko | Level | Mitigasi |
| --- | --- | --- |
| Hosted DB masih memiliki overload legacy | High | Terminal migration menghapus signature 2-arg secara idempoten |
| Route tetap memberi false success | High | Wajib periksa `rpcError` dan regression test error path |
| Checksum tidak sesuai constraint atau data persisted | High | SHA-256 lowercase hex dari normalized persisted rows |
| Call 2-arg existing menjadi rusak | Medium | Signature final mempertahankan default untuk dua parameter metadata |
| Partial persistence: annotations masuk, summary gagal | Medium | Fail closed ke HTTP 500; atomic transaction lintas insert+summary dicatat sebagai follow-up terpisah bila dibutuhkan |
| Migration diterapkan dengan urutan salah | Medium | Gunakan timestamp terminal `20260611100000` dan validator migration |
| Perubahan privilege mengganggu caller | Low | Pertahankan grant untuk `authenticated` dan `service_role` sesuai migration existing |

## Rollback Plan

1. Revert perubahan TypeScript dan tests.
2. Jangan menghapus signature final 4-arg.
3. Hanya bila rollback kompatibilitas benar-benar diperlukan, restore overload 2-arg menggunakan body dari `005_carbon_copy_parity.sql`.
4. Setelah rollback, verifikasi ulang `pg_proc` dan lakukan smoke test generate anotasi Telefun.

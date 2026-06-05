# Phase 119 - Supabase Disk IO Polling Prevention

## Ringkasan

Audit preventif menemukan pola legacy yang masih tersisa di halaman `/waiting-approval`: halaman melakukan pengecekan status akun ke Supabase `profiles` setiap 60 detik selama tab terbuka.

Perubahan ini mengurangi risiko Supabase Disk IO Budget Warning dengan:

- tetap melakukan pengecekan awal saat halaman dibuka;
- menaikkan interval polling berkala menjadi 5 menit;
- melewati polling saat tab browser berada di background/hidden;
- mengecek ulang saat tab kembali visible.

## File

- `apps/web/src/routes/waiting-approval.tsx`
- `apps/web/src/routes/waitingApprovalPolling.ts`
- `apps/web/src/__tests__/waiting-approval-polling.test.ts`
- `plan/markdown/supabase-disk-io-polling-prevention.md`

## Verifikasi

```bash
pnpm --filter @trainers/web test src/__tests__/waiting-approval-polling.test.ts
pnpm --filter @trainers/web exec tsc --noEmit
```

Hasil: 1 file test, 2 test pass; TypeScript web exit 0.

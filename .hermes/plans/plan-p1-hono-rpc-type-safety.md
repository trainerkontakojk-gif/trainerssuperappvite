# P1.2 Hono RPC Type Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development`; lookup dokumentasi Hono terbaru melalui Context7 sebelum implementasi.

## Goal

Memigrasikan frontend dari raw string API paths ke client Hono RPC `hc<AppType>` secara bertahap tanpa mengubah behavior auth, envelope response, atau error UX.

## Requirements

- `AppType` dari `@trainers/api` menjadi contract compile-time frontend.
- Token Bearer, `X-Requested-With`, handling 401, HTML fallback, dan human-friendly error tetap dipertahankan.
- Tidak ada big-bang rewrite; setiap domain dimigrasikan dan diverifikasi terpisah.
- Raw wrapper lama baru dihapus setelah tidak memiliki consumer.
- Dynamic route params dan request body tervalidasi TypeScript.
- Tidak menambah API call saat render dan tidak memperburuk FCP/LCP.

## Design

- Buat satu `rpcClient` di web menggunakan `hc<AppType>` dan custom fetch yang mempertahankan auth/error semantics.
- Tambahkan helper kecil untuk menormalisasi envelope `{ success, data, error }`, bukan menyembunyikan tipe endpoint dengan generic bebas.
- Migrasi per domain: shared/auth -> KETIK/PDKT -> Telefun -> SIDAK/Profiler -> dashboard/monitoring/admin.
- Pertahankan adapter domain seperti `telefunApi.ts`, tetapi implementasinya memakai generated RPC chain.
- Gunakan compile-fail/type tests untuk membuktikan path/body yang salah ditolak.

## Tasklist

- [ ] Verifikasi versi/API `hono/client` dan pola monorepo `AppType` melalui Context7.
- [ ] Tambahkan characterization tests untuk auth headers, 401 redirect, HTML response rejection, dan error envelope `useApi.ts`.
- [ ] Buat `apps/web/src/lib/api/rpc-client.ts` dengan `hc<AppType>` dan custom fetch.
- [ ] Buat typed response unwrap helper beserta unit tests untuk success/error/empty response.
- [ ] Migrasikan endpoint auth dan shared lookup sebagai vertical slice pertama.
- [ ] Jalankan web `tsc --noEmit` dan targeted tests; perbaiki contract API yang tidak chainable tanpa melemahkan tipe menjadi `any`.
- [ ] Migrasikan `apps/web/src/routes/ketik/ketikApi.ts` dan seluruh consumer KETIK.
- [ ] Migrasikan PDKT adapters/consumers dan pertahankan polling/evaluation behavior.
- [ ] Migrasikan Telefun adapters/finalizer/review calls.
- [ ] Migrasikan SIDAK dan Profiler per route group.
- [ ] Migrasikan dashboard, monitoring, access, dan admin.
- [ ] Tambahkan structural gate yang melarang raw `fetch(API_BASE + ...)` baru di source web.
- [ ] Hapus `getApi/postApi/putApi/patchApi/deleteApi` setelah `rg` membuktikan zero consumers.
- [ ] Update AGENTS/docs dengan pola pemanggilan RPC dan pengecualian yang sah.
- [ ] Verifikasi per tahap: targeted tests, web/API typecheck, lint; final: core tests dan build.

## Risk Assessment

- **High:** Hono route composition dapat menghasilkan tipe sangat besar/lambat.
- **High:** perbedaan envelope dapat memicu perubahan runtime diam-diam.
- **Medium:** generic helper dapat kembali menghapus type safety jika memakai `any`.
- **Mitigasi:** migrasi domain bertahap, characterization tests, typed unwrap, dan pengukuran waktu typecheck.

## Rollback Plan

- Setiap domain migration dibuat commit terpisah dan dapat direvert tanpa memengaruhi domain lain.
- Pertahankan wrapper lama sampai domain terakhir lulus.
- Jika type performance tidak layak, pecah exported route types per domain tanpa kembali ke raw string paths.

# TNA Fase 3 — Laporan T5 (review, dokumentasi, gate penuh)

- **Tanggal:** 2026-11-07. Baseline `8d019308` (`main`).
- **Rencana:** [`tna-phase-3.md`](tna-phase-3.md) rev. 3, task T5.
- **Target:** Supabase lokal (stack minimal) dan dev server lokal. Tidak ada produksi, deploy, atau mutasi remote.

## Review `thermo-nuclear`

Cakupan: seluruh diff Fase 3 `972f3de4..8d019308` pada `apps/api`, `apps/web`, `packages/types`, `supabase` (migrasi, rollback, service `practice.ts`, lift `simulations/sources.ts`, read/write service, route, narasi, schema, UI, tiga spec).

```text
Verdict: PASS (setelah satu perbaikan P3)
```

| #   | Sev | Lokasi                                                                       | Temuan                                                                                                            | Tindakan                                                                                                                                                                          |
| --- | --- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | P3  | `apps/api/src/services/tna/narrative.ts`, `apps/web/src/routes/tna/utils.ts` | Label modul dan format "KETIK 2 sesi, …" ditulis dua kali (API dan web); bisa bergeser.                           | **Diperbaiki:** `TNA_PRACTICE_MODULE_LABELS` dan `formatTnaPracticeTargets` di `packages/types/src/tna.ts`; `practiceModules` = `tnaPracticeModuleSchema.options`. Perilaku sama. |
| 2   | —   | `practice.ts` `seen`                                                         | Set dedupe per modul. Cabang `participant` dan `self` disjoint, tetapi set menjaga dari baris ganda antarhalaman. | Dibiarkan; murah dan aman.                                                                                                                                                        |
| 3   | —   | `practice.ts` `.in()` hingga 200 id                                          | Daftar id panjang di query string.                                                                                | Sama dengan pola `baseline.ts` yang sudah berjalan; tidak diubah.                                                                                                                 |

Yang diperiksa dan tidak bermasalah:

- **Keamanan / K21:** service-role hanya di `practice.ts`, dipanggil setelah `tna.read`/`tna.write`, hanya untuk roster yang dibaca dengan JWT pengguna; kolom terbatas (id, subjek, waktu, skor, status review); respons hanya agregat.
- **Fail-closed:** baca riwayat gagal → detail `unavailable` (bagian lain tetap terbaca), completion → 503 `TNA_PRACTICE_UNAVAILABLE`, tidak membekukan angka tidak lengkap. Error lain tetap menggagalkan request.
- **Kontrak:** schema zod, payload RPC, dan validasi SQL (`valid_practice_snapshot`) memakai bentuk entri yang sama; signature RPC tidak berubah; tidak ada `REVOKE`.
- **Ukuran file:** terbesar yang disentuh `PlanForm.tsx` 376 baris, `practice.ts` 245.

## Dokumentasi

| File                | Bagian baru                                                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/modules.md`   | §9 "Fase 3 — target latihan simulasi": target, jendela WIB, progres live/beku/gagal, completion 503, narasi, UI.                          |
| `docs/database.md`  | "TNA — Latihan simulasi (Fase 3)": tabel, kolom snapshot, trigger, helper, perubahan RPC, rollback fail-closed, status belum di produksi. |
| `docs/auth-rbac.md` | "TNA — latihan simulasi (Fase 3)": tanpa kapabilitas baru, **batas service-role K21**.                                                    |

`database.md` dan `auth-rbac.md` belum Prettier-clean sebelumnya, jadi hanya bagian baru yang ditambahkan (tanpa reformat file).

## Gate penuh (serial, satu runner pada satu waktu)

| Langkah                   | Perintah                                                                                                                        | Hasil                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Typecheck paket tersentuh | `pnpm --filter @trainers/{types,api,web} exec tsc --noEmit`                                                                     | exit 0 ×3                     |
| Replay migrasi            | `supabase db reset --local`                                                                                                     | exit 0                        |
| API TNA (backend lokal)   | `apps/web`: `pnpm exec playwright test -c playwright.api.config.ts --project=tna-real-backend`                                  | exit 0, **99 passed** (4,7 m) |
| Browser TNA (hermetic)    | `apps/web`: `pnpm exec playwright test tna-practice-flow.spec.ts tna-flow.spec.ts tna-evaluation-flow.spec.ts tna-efek.spec.ts` | exit 0, **48 passed** (7,9 m) |
| Root typecheck            | `pnpm typecheck`                                                                                                                | exit 0                        |
| Root lint                 | `pnpm lint`                                                                                                                     | exit 0                        |
| Root build                | `pnpm build`                                                                                                                    | exit 0                        |
| Typecheck E2E             | `apps/web`: `pnpm exec tsc --noEmit -p tsconfig.e2e.json`                                                                       | exit 0                        |
| Whitespace                | `git diff --check`                                                                                                              | exit 0                        |
| Graph                     | `graphify update .`                                                                                                             | exit 0 (18.881 node)          |

## Status Fase 3

Fase 3 **selesai lokal**. Belum diterapkan ke produksi. Langkah rilis yang butuh izin eksplisit Fajar:

1. Preflight read-only produksi (Fase 2 lengkap, belum ada objek Fase 3).
2. `supabase db query --linked -f supabase/migrations/20261104120000_tna_phase3_practice.sql`, lalu `supabase migration repair --linked --status applied 20261104120000`. **Bukan** `db push`.
3. Deploy API + web segera sesudahnya (API lama tidak mengirim `practice_targets`, jadi jeda aman: rencana tanpa target).

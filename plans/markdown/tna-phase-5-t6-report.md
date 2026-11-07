# TNA Fase 5 — Laporan T6 (review dan dokumentasi)

- **Tanggal:** 2026-11-07. Baseline `21ef5988` (`main`).
- **Rencana:** [`tna-phase-5.md`](tna-phase-5.md) rev. 2, T6. Lane **D**.
- **Cakupan review:** seluruh diff Fase 5 `95e2b6ce..21ef5988` di luar `plans/` dan screenshot: migrasi + rollback, `catalog-service.ts`, `routes/tna.ts`, `errors.ts`, `read-service.ts`, `packages/types/src/tna.ts`, UI `catalog.tsx`/`ProgramForm.tsx`/`TnaTabs.tsx`/`plan.tsx`/`utils.ts`, router, breadcrumb, tiga spec baru dan helper.
- **Target uji:** Supabase lokal dan dev server lokal. Tidak ada akses produksi di T6.

## Review thermo-nuclear

```text
Verdict: PASS
```

Yang ditelusuri lintas lapisan, tanpa temuan P0–P2:

- **Batas akses:** tiga route tulis memakai `tna.write`, route baca `tna.read` (keduanya admin + trainer). Actor dari autentikasi; skema strict menolak `created_by`/`is_active`/`code` di PATCH. Writer database `SECURITY DEFINER` dengan `assert_service_role()` sebagai statement pertama, EXECUTE tidak dicabut (K6), helper `tna_internal` dicabut dari semua role klien.
- **Validasi berlapis:** API memeriksa keanggotaan registry (klaster, layanan, modul) dan panjang teks; database memeriksa bentuk ulang sehingga pemanggil service-role yang salah tetap ditolak. Pesan 422/409/404 manusiawi lewat `throwTnaRpcError`.
- **Konkurensi:** update dan aktif/nonaktif mengunci baris (`FOR UPDATE`) lalu membandingkan `expected_updated_at`; `updated_at` monoton. Aktivasi rencana yang berjalan bersamaan dengan rename program membekukan salah satu nama yang sudah commit, keduanya sah.
- **Snapshot:** urutan trigger `tna_plan_guard` → `tna_plan_program_snapshot` (alfabetis) tidak saling bergantung. INSERT dengan snapshot ditolak; snapshot tidak bisa diubah setelah aktivasi; narasi hanya memakai `program.name`, yang diambil dari snapshot.
- **Kontrak:** `GET /programs` default tidak berubah (aktif saja), jadi form rencana dan saran program tidak terpengaruh. `TnaPlanDetail.program` selalu ada.
- **UI:** 409 pada create diperlakukan sebagai kode ganda, bukan revisi basi; mutasi terkunci selama konflik sampai **Muat ulang**; pilihan form selalu dikirim dalam urutan registry.
- **Ukuran file:** `routes/tna.ts` 576 baris, `packages/types/src/tna.ts` 561, `catalog.tsx` 333; semua di bawah batas ~1.000.

Catatan P3 (diterima, tidak diubah):

- **Aktif/nonaktif ke status yang sama** tetap memajukan revisi dan menulis log aktivitas. UI hanya menawarkan arah sebaliknya, dan revisi basi mencegah klik ganda, jadi tidak tercapai dari UI. Memperbaikinya butuh migrasi baru di atas migrasi yang sudah diterapkan di produksi; tidak sepadan.
- **`TnaPlan` (interface) vs `tnaPlanSchema`:** `program_snapshot` opsional di interface tetapi wajib (nullable) di skema. Ini mengikuti pola interface terpisah yang sudah ada; tidak ada pemanggil yang bergantung pada perbedaannya.

## Dokumentasi

| File                | Perubahan                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/modules.md`   | Bagian baru "Fase 5 — katalog program" (UI, nonaktif tanpa hapus, snapshot, endpoint, hasil T4); kalimat Fase 1 "tanpa pengelolaan katalog" diperbarui. |
| `docs/database.md`  | Bagian Fase 5 diperluas: tabel kolom/constraint, trigger, writer dan error, helper, rollback; baris `tna_programs` di tabel Fase 1 menunjuk ke Fase 5.  |
| `docs/auth-rbac.md` | Bagian baru "TNA — katalog program (Fase 5)": tabel endpoint → kapabilitas → jalur data; leader tanpa akses TNA; inventaris guard.                      |

`docs/database.md` dan `docs/auth-rbac.md` memang belum bersih Prettier sebelum perubahan ini, jadi hanya bagian baru yang disisipkan tanpa memformat ulang seluruh file. `docs/modules.md` lulus `prettier --check`.

## Bukti eksekusi (satu runner pada satu waktu)

| Langkah               | Perintah                                                                                                                     | Hasil                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Regresi API TNA       | `apps/web`: `pnpm exec playwright test -c playwright.api.config.ts --project=tna-real-backend --reporter=line --workers=1`   | exit 0, **110 passed** (2.3m)                                    |
| Regresi browser TNA   | `apps/web`: `pnpm exec playwright test tna-catalog-flow tna-practice-flow tna-flow tna-evaluation-flow tna-efek --workers=1` | exit 0, **55 passed** (3.8m)                                     |
| Browser EFEK di SIDAK | `apps/web`: `pnpm exec playwright test sidak-agent-efek-training --workers=1`                                                | exit 0, **2 passed**                                             |
| Typecheck             | `pnpm --filter @trainers/{types,api,web} typecheck`                                                                          | exit 0 ketiganya                                                 |
| Lint                  | `eslint` pada file Fase 5 (route, service TNA, route web TNA, router, nav-config, types, spec katalog, harness)              | exit 0, 0 error; 38 warning `react-refresh` lama di `router.tsx` |
| Build                 | `pnpm --dir apps/api build`, `pnpm --dir apps/web build`                                                                     | exit 0 keduanya                                                  |
| Graph                 | `graphify update .`                                                                                                          | exit 0, 19.014 node, 36.468 edge                                 |
| Format / whitespace   | `prettier --check docs/modules.md plans/markdown/tna-phase-5-t6-report.md`; `git diff --check`                               | exit 0                                                           |

## Status Fase 5

Selesai. Migrasi `20261107120000` sudah di produksi sejak 2026-11-07; kode T2–T3 sudah di `main` (auto-deploy). T5 tidak diperlukan (T4: 0 parameter SIDAK tanpa master). Belum diverifikasi: tampilan katalog di deployment produksi.

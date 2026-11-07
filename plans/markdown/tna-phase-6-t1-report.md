# TNA Fase 6 — Laporan T1 (agregasi efektivitas + API)

- **Tanggal:** 2026-11-07. Baseline `91c2a120` (`main`).
- **Rencana:** [`tna-phase-6.md`](tna-phase-6.md) rev. 2 (D28, D29, K39, K42, K43, P-1, P-2, P-4). Lane **C** (kontrak API baru, tanpa migrasi).
- **Target:** backend lokal (Hono in-process + Supabase lokal). Tidak ada produksi.

## Kontrak

| Method & path                                                        | Izin       | Isi                                                                                                   |
| -------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| `GET /tna/effectiveness?from&to&group_by=program\|gap_type\|service` | `tna.read` | `{ group_by, from, to, summary, groups }`. Query lain, tanggal tidak valid, `from > to` → 400.        |
| `GET /tna/plans/due-count`                                           | `tna.read` | `{ count }` rencana jatuh tempo, aturan WIB yang sama dengan `GET /plans?due=1`. Query apa pun → 400. |

- **Statistik** (`summary` dan per grup):
  - `completed`, `verdicts` (tiga verdict);
  - `fully_achieved_pct`: persentase `tercapai`;
  - `median_rate_drop`: median tingkat baseline beku dikurangi tingkat evaluasi beku per 100 sesi;
  - `median_duration_days`: median jarak aktivasi → selesai.

  Ketiga nilai turunan bernilai `null` bila tidak ada rencana. Angka mentah; UI yang membulatkan.

- **Grup** menambah:
  - `key`, `label` (nama program untuk grup program; `null` untuk gap dan layanan);
  - `follow_ups`;
  - `thin` bila kurang dari 3 rencana;
  - `plans`: daftar rencana di balik angka (P-2), selesai terbaru dulu.

  Urutan grup: jumlah selesai menurun, lalu nama.

- **Sumber hanya rencana `selesai`**, dibaca dengan JWT pengguna (RLS admin/trainer). Kolom yang dibaca hanya yang dipakai; kedua tingkat diambil lewat path JSON snapshot. SIDAK tidak dihitung ulang, tanpa service-role (S28/S29 aman).
- **Pengelompokan:**
  - Program memakai `program_snapshot` (nama saat aktivasi), dengan cadangan baris katalog.
  - Gap memakai `tna_needs.gap_type` (P-1).
  - Layanan memakai `tna_needs.service_type`.
- **Rentang tanggal** adalah hari kalender Asia/Jakarta dari `completed_at`, inklusif di kedua ujung.

### Penyimpangan dari D29 (teknis, satu)

D29 menulis badge sebagai `GET /tna/plans?due=1&count_only=1`. Saat diimplementasikan, tipe respons Hono RPC untuk `GET /plans` menjadi union `{ count } | { items }`, sehingga pemanggil typed yang sudah ada gagal typecheck (`tna-plan-api.spec.ts`). Badge dipindah ke route sendiri `GET /tna/plans/due-count`, sehingga kontrak daftar rencana tidak berubah. Aturan jatuh tempo tetap satu sumber (`dueFilter` di `read-service.ts`) untuk daftar dan hitungan.

## File

| File                                         | Isi                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `apps/api/src/services/tna/effectiveness.ts` | Baru: baca rencana selesai + kebutuhan + program, statistik, pengelompokan.                 |
| `apps/api/src/services/tna/read-service.ts`  | `countDueTnaPlans`; aturan jatuh tempo dipakai bersama lewat `dueFilter`.                   |
| `apps/api/src/routes/tna.ts`                 | Route `/effectiveness` dan `/plans/due-count` (sebelum `/plans/:id`).                       |
| `packages/types/src/tna.ts`                  | `tnaEffectivenessQuerySchema` (tanggal kalender ketat), `TnaEffectiveness*`, `TnaDueCount`. |
| `apps/web/e2e/tna-effectiveness-api.spec.ts` | Spec baru (5 test).                                                                         |

## Spec `tna-effectiveness-api.spec.ts`

Fixture: dua program fixture (P-4 Fase 5). Empat rencana diselesaikan lewat RPC service-role yang dijaga (aktivasi → mulai evaluasi → selesai) dengan snapshot beku sintetis yang lolos validasi database:

| Rencana | Program | Gap kebutuhan | Tingkat evaluasi / sebaran | Verdict           | Penurunan |
| ------- | ------- | ------------- | -------------------------- | ----------------- | --------- |
| a1      | A       | skill         | 20 / 40                    | tercapai          | 180       |
| a2      | A       | skill         | 60 / 95                    | tercapai_sebagian | 140       |
| a3      | A       | proses        | 150 / 95                   | tidak_tercapai    | 50        |
| b1      | B       | skill         | 40 / 50                    | tercapai          | 160       |

Baseline 200 per 100 sesi; target 100 / 90. Ditambah satu rencana aktif dan satu draft yang tidak boleh dihitung.

Perhitungan manual yang diasersikan:

- **Ringkasan:** 4 selesai; 2/1/1; 50% tercapai; median penurunan (140 + 160) / 2 = **150**.
- **Program A:** 3 selesai, 1/1/1, 33,3%, median **140**, tindak lanjut 1/1/1, tidak tipis. Rencana diurutkan a3, a2, a1.
- **Program B:** 1 selesai, 100%, median **160**, tipis.
- **Per gap (P-1):** skill 3 (a1, a2, b1), proses 1 (a3, tipis). Kedua program fixture ber-gap `skill`, jadi ini membuktikan sumbernya kebutuhan.
- **Per layanan:** chat 4, median 150.

Test:

1. Grup program: nama program tetap nama snapshot walau program diganti nama sesudah aktivasi. Prasyarat fail-closed: tidak ada rencana selesai lain pada tanggal WIB hari ini.
2. Grup gap dan layanan.
3. Filter tanggal:
   - `to=kemarin` mengecualikan rencana hari ini;
   - rentang kosong menghasilkan statistik `null` dan tanpa grup;
   - tanpa filter, jumlah sama dengan hitungan SQL;
   - lima query tidak valid menghasilkan 400.
4. `due-count` sama dengan panjang `GET /plans?due=1` dan hitungan SQL. Rencana jatuh tempo hari ini masuk, yang besok tidak; query asing menghasilkan 400.
5. Akses: admin 200; leader/agent 403 dan tanpa token 401 di kedua endpoint.

**Catatan nilai `null`:** database menjamin rencana `selesai` punya tingkat baseline dan evaluasi berupa angka (`TNA_INVALID_BASELINE`, `validate_evaluation_snapshot`). Jadi penurunan `null` tidak bisa dibuat lewat fixture. Penanganannya ada di kode (median mengabaikan `null`) tetapi tidak diuji; skema baca tetap menolak nilai non-angka alih-alih menelannya.

## Bukti eksekusi (satu runner pada satu waktu)

| Langkah             | Perintah (di `apps/web`)                                                                                         | Hasil                                                                                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RED                 | `pnpm exec playwright test tna-effectiveness-api.spec.ts -c playwright.api.config.ts --project=tna-real-backend` | exit 1: `GET /effectiveness` 404 sesudah siklus fixture berhasil; 4 test berikutnya tidak jalan (serial)                                                                   |
| GREEN percobaan 1   | sama                                                                                                             | 2 passed, 1 failed: `from=2026-13-01` → **500**. Bug nyata: validator tanggal memanggil `toISOString()` pada tanggal tidak valid. Diperbaiki dengan cek `Number.isFinite`. |
| GREEN percobaan 2   | sama                                                                                                             | 3 passed, 1 failed: `GET /plans?due=1` → 503 karena baseline fixture tidak lengkap untuk skema rencana penuh. Masalah fixture; diganti baseline snapshot lengkap.          |
| GREEN               | sama                                                                                                             | exit 0, **5 passed**                                                                                                                                                       |
| Typecheck           | `pnpm --filter @trainers/{types,api,web} typecheck`                                                              | web pertama exit 1 (union respons `GET /plans`, lihat penyimpangan); sesudah `due-count` dipisah, ketiganya exit 0                                                         |
| GREEN ulang         | spec yang sama                                                                                                   | exit 0, **5 passed**                                                                                                                                                       |
| Regresi API TNA     | `pnpm exec playwright test -c playwright.api.config.ts --project=tna-real-backend`                               | exit 0, **115 passed** (110 lama + 5 baru)                                                                                                                                 |
| Lint, format, spasi | `eslint` dan `prettier --check` pada file tersentuh; `git diff --check`                                          | exit 0                                                                                                                                                                     |

## Berikutnya

T2: ekspor HTML siap cetak per rencana (K40), spec browser hermetic RED-first.

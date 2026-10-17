# SIDAK: parameter baru di versi aturan tidak bisa dicatat sebagai temuan

- **Status:** DIIMPLEMENTASIKAN (lokal, belum di-commit) — Opsi A + B + A1 + A2 disetujui Fajar 2026-10-17 dengan master `is_active = false` dan kompensasi TypeScript (tanpa migrasi). Backfill (T6) menunggu hasil query produksi. Bukti di §Bukti verifikasi.
- **Tanggal:** 2026-10-17. Baseline: `ddda8a27` (`main`, bersih).
- **Risk lane:** **Lane D** — kontrak API publik (`POST /sidak/rule-versions/:id/indicators`, `POST /sidak/temuan/batch`), kemungkinan migrasi/backfill data produksi, dan identitas parameter yang dipakai modul TNA.
- **Asal:** `plans/markdown/tna-phase-1-t0-report.md` §S1; keputusan TNA K8 di `plans/markdown/tna-phase-1.md`.
- **Batas:** semua bukti di bawah adalah pembacaan kode, Git, dan skema Supabase **lokal** (read-only). Produksi tidak disentuh. Perilaku UI belum dibuktikan runtime; bukti runtime API berasal dari laporan T0.

## Temuan discovery

### 1. Apa yang dilihat pengguna di `/sidak/input`

Jalur normal UI **tidak** menampilkan sukses palsu, tetapi menjadi jalan buntu:

| Jalur                                                                  | Yang terjadi                                                                                                                                                                                                                                                                            | Bukti                                                                                                                                                                |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manual                                                                 | Dropdown parameter menampilkan parameter unmapped tanpa penanda apa pun (`id` = UUID snapshot). Saat Simpan, guard klien menolak sebelum ada request: "Beberapa parameter yang dipilih belum terhubung ke database global. Gunakan parameter yang sudah dilink di halaman Settings QA." | `apps/api/src/services/sidak/period-indicator.ts:199–211`, `apps/web/src/routes/sidak/input.tsx:100–108`, `apps/web/src/routes/sidak/hooks/useTemuanForm.ts:104–112` |
| Import Excel                                                           | Nama parameter cocok → baris tampak valid di preview import (tanpa error baris). Saat Import, guard klien menolak: "Terdapat parameter yang belum terhubung ke database global…".                                                                                                       | `apps/web/src/routes/sidak/hooks/useTemuanImport.ts:287–291, 350–359`                                                                                                |
| Guard klien terlewati                                                  | `POST /temuan/batch/preview` mengembalikan `invalid` → UI menampilkan "N parameter tidak valid…".                                                                                                                                                                                       | `useTemuanForm.ts:162–168`, `useTemuanImport.ts:388–393`                                                                                                             |
| API langsung / preview usang (versi berubah antara preview dan submit) | `POST /temuan/batch` → **HTTP 201 `{inserted: 0}`** bila semua invalid; bila sebagian invalid, item invalid **dibuang diam-diam** dan respons tidak memuat jumlah/daftar invalid. UI lalu menampilkan "0 temuan tersimpan…" / "0 temuan berhasil diimport!" sebagai pesan sukses.       | `apps/api/src/services/sidak/temuan-service.ts:296–316, 382–386`; `useTemuanForm.ts:199–201`; `useTemuanImport.ts:420`                                               |

Masalah UX utamanya: pesan menyuruh "gunakan parameter yang sudah dilink di Settings QA", padahal **tidak ada UI untuk menautkan** — `PUT /rule-versions/:versionId/indicators/:indicatorId` tidak menerima `legacy_indicator_id` (`apps/api/src/routes/sidak/rule-versions.ts:414–422`) dan Settings hanya menampilkan lencana "Tertaut ke parameter lama" (`RuleIndicatorsSection.tsx:37`).

### 2. Bagaimana parameter baru dibuat, dan apakah produksi bisa menghasilkannya

- Satu-satunya alur UI "Tambah parameter" (`apps/web/src/routes/sidak/settings.tsx:285–297`) memakai `indicatorFormToPayload()` (`settings/utils.ts:49–62`), yang **tidak pernah** mengirim `legacy_indicator_id`. Backend (`rule-versions.ts` service `:485–507`) menyisipkan snapshot apa adanya.
- Jadi **setiap parameter yang ditambahkan lewat Settings QA selalu unmapped**, dan tetap unmapped di semua versi turunan karena kloning menyalin `legacy_indicator_id` dari sumber (`rule-versions.ts:219–221`).
- Versi pertama tanpa sumber disalin dari master `qa_indicators` aktif sehingga mapped; parameter lama aman.
- Alur tambah tanpa mapping sudah ada sejak ≥ 2026-05-21 (`0bfeae90`); guard klien ditambahkan 2026-05-24 (`6968bfad`), artinya kasus ini sudah dikenal tetapi hanya ditutup di klien.
- **Kesimpulan:** produksi _bisa_ — dan bila pernah ada parameter yang ditambahkan lewat Settings, _pasti_ — memiliki rule indicator unmapped. Jumlahnya belum diketahui; perlu query read-only yang dijalankan Fajar (§Query produksi). Karena `qa_temuan.indicator_id` FK ke `qa_indicators` (`001_sidak_core.sql:165`), **tidak mungkin** ada temuan tersimpan untuk parameter unmapped; yang hilang adalah temuan yang tidak pernah bisa dicatat.

### 3. Temuan terkait (bukan bagian §S1, tetapi satu akar masalah)

- **A1 — "Sesi Tanpa Temuan" mengabaikan versi aturan.** `createPerfectSession` memilih `id, indicator_id` dari `qa_service_rule_indicators` (`temuan-service.ts:119–122`), padahal kolom `indicator_id` tidak ada (diverifikasi pada skema lokal: kolom = `id, rule_version_id, legacy_indicator_id, …, parameter_group`). Error PostgREST tidak dibaca, `data` null, sehingga kode jatuh ke master `qa_indicators` aktif dengan `rule_version_id = NULL`. Phantom padding dibuat untuk himpunan parameter yang salah bila versi berbeda dari master. _Bukti statis + skema lokal; belum runtime._
- **A2 — Versi tanpa satu pun parameter mapped tidak membatasi indikator.** `validateTemuanBatch` hanya membatasi ke `validLegacyIds` bila himpunannya tidak kosong (`temuan-service.ts:225–239`). Bila versi efektif ada tetapi tidak punya parameter mapped, master apa pun milik layanan itu diterima walaupun tidak termasuk versi.
- **A3 — `legacy_indicator_id` tanpa FK.** Kolom tidak punya foreign key ke `qa_indicators` (`001_sidak_core.sql:146`; dicek di constraint lokal), jadi mapping menggantung mungkin terjadi.

## Requirement

1. Trainer/admin yang menambahkan parameter di draft versi aturan lalu mempublikasikannya **bisa mencatat temuan** untuk parameter itu lewat input manual dan import Excel.
2. `qa_temuan.indicator_id` tetap ID master `qa_indicators` yang **stabil lintas versi aturan** (TNA K8). Tidak ada jalur yang menyimpan UUID snapshot sebagai `indicator_id`, dan tidak ada penyatuan parameter berdasarkan nama.
3. `POST /sidak/temuan/batch` tidak pernah mengembalikan 2xx bila ada item yang ditolak validasi. Hasil sah tanpa sisipan (semua duplikat dilewati) tetap jujur dan eksplisit.
4. Bila parameter unmapped masih ada (data lama sebelum backfill), UI menandainya sebelum pengguna mengisi, bukan hanya saat Simpan.
5. Sesi Tanpa Temuan memakai parameter versi efektif dengan `rule_version_id` dan `rule_indicator_id` yang benar (A1).
6. Tidak ada service-role baru di frontend; seluruh logika di `apps/api`. Pesan error manusiawi, bukan error database mentah.

## Design — opsi

### Opsi A — Buat master otomatis saat parameter ditambahkan (direkomendasikan, inti)

`addRuleVersionIndicator()` membuat baris `qa_indicators` (service_type, name, parameter_group, category, bobot, has_na, threshold, sort_order) bila `legacy_indicator_id` tidak dikirim, lalu menyimpan snapshot dengan `legacy_indicator_id` = ID master baru. Bila insert snapshot gagal, master dihapus (pola kompensasi yang sama dengan `createRuleVersion`, `rule-versions.ts:224–233`). Saat parameter draft dihapus, master yang dibuat otomatis ikut dihapus bila tidak dirujuk snapshot lain atau `qa_temuan` (FK `ON DELETE RESTRICT` menjaga temuan).

- **Plus:** menutup akar masalah; kloning otomatis mempertahankan identitas; TNA K8 tetap berlaku tanpa perubahan dan parameter baru otomatis masuk TNA begitu punya temuan; tanpa perubahan skema.
- **Minus:** master bertambah per parameter baru; nama master bisa usang bila snapshot di-rename (tampilan tetap dari snapshot — perlu dicek titik yang memakai nama master, mis. `formatQAIndicatorName` di pesan validasi); dua insert tanpa transaksi (kompensasi, bukan atomik). Alternatif atomik = fungsi Postgres (butuh migrasi; lihat K-c).
- **Keputusan turunan:** master otomatis dibuat `is_active = false` (identitas saja) agar tidak muncul di fallback master (`getIndicators`, fallback Sesi Tanpa Temuan, basis versi pertama) — atau `true` agar sejajar dengan master lama. Rekomendasi: `false` (K-b).

### Opsi B — Error eksplisit pada batch (direkomendasikan, pelengkap A)

`POST /temuan/batch` menjadi all-or-nothing: bila `invalid_count > 0`, tidak ada yang disisipkan dan respons **422** `{ code: "INVALID_INDICATORS", message, details: invalid[] }`. Semua-duplikat tetap 200 dengan `inserted: 0, skipped: N` (bukan kegagalan; UI sudah meminta konfirmasi). Respons sukses menambah `invalid: 0` agar kontrak eksplisit. UI menampilkan pesan dari error, bukan "0 temuan tersimpan".

- **Plus:** memenuhi AGENTS.md (kegagalan tidak jadi sukses palsu); menutup celah preview usang.
- **Minus:** perubahan kontrak publik; spec karakterisasi `apps/web/e2e/tna-parameter-key-api.spec.ts:68–73` (`status < 500`) harus diperbarui ke 422. Hanya dua pemanggil web (`useTemuanForm`, `useTemuanImport`).
- B **tidak** menyelesaikan Requirement 1 sendirian — hanya membuat kegagalannya jujur.

### Opsi C — Terima UUID snapshot dan petakan/buat master saat menulis temuan (tidak direkomendasikan)

Lazy-create master pada temuan pertama. Ditolak: race antar-submit paralel bisa membuat master ganda untuk parameter yang sama; logika identitas tersebar di jalur tulis; bertentangan dengan arah K8.

### Opsi D — UI untuk menautkan parameter ke master (opsional, transisi)

`PUT` indikator menerima `legacy_indicator_id` (hanya draft, master harus satu layanan) + pemilih di Settings. Berguna untuk data lama, tetapi menambah beban manual dan risiko salah tautan. Rekomendasi: tidak, kecuali backfill (K-a) tidak disetujui.

### Data lama (backfill)

Snapshot unmapped yang sudah ada di produksi tetap tidak bisa dicatat setelah Opsi A. Pilihan:

1. **Tidak backfill** bila query produksi menunjukkan nol baris.
2. **Backfill per-versi via migrasi** (Lane D, butuh izin migrasi produksi): buat satu master per snapshot unmapped dan isi `legacy_indicator_id`. Konsekuensi: snapshot klon dari parameter yang sama mendapat master **berbeda** karena tidak ada kolom lineage — tren lintas versi untuk parameter itu terpecah. Mengubah snapshot versi `published` (sekadar mapping, bukan konfigurasi skor) bertentangan dengan prinsip "never mutate published snapshots" di `20260716160000_add_slik_qa_subparameters.sql`.
3. **Backfill dengan peta yang ditinjau Fajar:** query menghasilkan daftar kandidat per rantai `created_from_version_id`; Fajar menyetujui pengelompokan secara eksplisit sebelum migrasi. Tidak ada penyatuan otomatis berdasarkan nama.

Rekomendasi: jalankan query dulu; pilih 1 atau 3 sesuai hasil.

### Ketergantungan TNA (K8)

- TNA membaca `qa_temuan.indicator_id` sebagai kunci parameter (`apps/api/src/services/tna/parameters.ts:196–204`, `metrics.ts:395`). Opsi A mempertahankan itu: setiap parameter baru punya master, jadi TNA tidak perlu diubah dan **tidak boleh** dialihkan ke UUID snapshot.
- Setelah A, klaim K8 "tidak ada data yang terlewat" tetap benar; catatan "dukungan unmapped direncanakan terpisah" diperbarui untuk menunjuk dokumen ini.
- Backfill opsi 2 akan membuat parameter yang sama tampil sebagai beberapa parameter TNA lintas versi — alasan utama memilih 1/3.
- Regression TNA wajib: `tna-parameter-key-api.spec.ts` dan spec metrik TNA tetap hijau.

## Keputusan Fajar (2026-10-17)

- K-a: **disetujui** A + B + A1 + A2. K-b: **`false`**. K-c: **kompensasi TypeScript**, tanpa migrasi. K-d: **menunggu** query produksi. K-e: tidak termasuk (tunda).

### Pertanyaan semula

- **K-a (inti):** setujui Opsi A + B (+ perbaikan A1, A2)?
- **K-b:** master otomatis `is_active = false` (rekomendasi) atau `true`?
- **K-c:** kompensasi di TypeScript (tanpa migrasi, rekomendasi) atau fungsi Postgres atomik (migrasi + rollback)?
- **K-d:** jalankan query produksi read-only di bawah, lalu pilih strategi backfill (1/3). Migrasi apa pun ke produksi tetap butuh izin eksplisit terpisah.
- **K-e:** FK `legacy_indicator_id → qa_indicators(id)` (A3) masuk rencana ini atau ditunda? Rekomendasi: tunda, migrasi terpisah setelah data produksi dicek tidak ada mapping menggantung.

### Query produksi (read-only, dijalankan Fajar)

```sql
-- Snapshot unmapped per versi
SELECT v.service_type, v.status, v.version_number, v.id AS rule_version_id,
       count(*) FILTER (WHERE ri.legacy_indicator_id IS NULL) AS unmapped,
       count(*) AS total
FROM qa_service_rule_indicators ri
JOIN qa_service_rule_versions v ON v.id = ri.rule_version_id
GROUP BY 1, 2, 3, 4
HAVING count(*) FILTER (WHERE ri.legacy_indicator_id IS NULL) > 0
ORDER BY 1, 3;

-- Mapping menggantung (A3)
SELECT count(*) FROM qa_service_rule_indicators ri
WHERE ri.legacy_indicator_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM qa_indicators i WHERE i.id = ri.legacy_indicator_id);
```

## Tasklist (setelah persetujuan)

- [x] **T0 — Drift check & graph.** Cek ulang baris yang dirujuk terhadap `main`; `graphify` query pemanggil `addRuleVersionIndicator`, `validateTemuanBatch`, `createTemuanBatch`, `createPerfectSession`.
- [x] **T1 — RED E2E real backend** (`apps/web/e2e/sidak-unmapped-indicator-api.spec.ts`, Supabase lokal): (a) tambah parameter via `POST /rule-versions/:id/indicators` tanpa legacy → publish → `resolved-input-config` mengembalikan ID master → `POST /temuan/batch` 201 `inserted: 1` dengan `indicator_id` master (SQL read-after-write); (b) klon versi → ID master sama; (c) batch dengan satu item invalid → 422, nol baris tersimpan; (d) semua duplikat → 200 `inserted: 0, skipped: N`; (e) Sesi Tanpa Temuan memakai parameter versi, `rule_version_id`/`rule_indicator_id` terisi; (f) versi tanpa parameter mapped menolak master di luar versi; (g) hapus parameter draft menghapus master otomatis yang belum dirujuk. Jalankan, pastikan gagal karena alasan yang diharapkan.
- [x] **T2 — RED E2E browser** (`apps/web/e2e/sidak-input-unmapped.spec.ts`): parameter baru dari Settings bisa disimpan lewat manual dan import Excel; respons 422 tampil sebagai error, bukan "0 temuan tersimpan".
- [x] **T3 — GREEN backend:** Opsi A di `services/sidak/rule-versions.ts` (+ hapus master saat hapus draft), Opsi B di `temuan-service.ts` + `routes/sidak/temuan.ts`, A1 (`legacy_indicator_id` + `rule_indicator_id`, baca error query), A2. Tipe respons di `packages/types` bila ada.
- [x] **T4 — GREEN web:** tampilkan error 422; tandai/disable parameter unmapped di dropdown dan baris import (selama data lama ada); ganti pesan buntu "gunakan parameter yang sudah dilink".
- [x] **T5 — Regression:** `tna-parameter-key-api.spec.ts` (perbarui ekspektasi 422), spec TNA real-backend, spec SIDAK input/settings yang ada. Satu Playwright run pada satu waktu.
- [ ] **T6 — Backfill (bila K-d memilih 3):** migrasi + `supabase/rollbacks/rollback_<name>.sql` via skill `supabase-migration`, replay lokal bersih. Tanpa push ke produksi tanpa izin.
- [x] **T7 — Review & gate:** `thermo-nuclear`; `pnpm --dir apps/api exec tsc --noEmit -p tsconfig.json`, web typecheck, lint, build; `git diff --check`; perbarui `docs/modules.md`/`docs/database.md` (identitas parameter) dan catatan K8 di `plans/markdown/tna-phase-1.md`; satu `graphify update .`.

## Catatan implementasi

- **Pemakaian ulang master berdasarkan kunci unik.** `qa_indicators` punya indeks unik `(service_type, coalesce(parameter_group, ''), name)`, jadi master kedua dengan identitas sama tidak bisa dibuat. Parameter yang ditambahkan dengan identitas persis sama (mis. menambahkan kembali parameter yang dulu dihapus) memakai ulang master itu. Ini mengikuti kunci identitas tabel master sendiri, bukan penyatuan nama yang longgar; parameter yang sama dua kali di satu versi ditolak 422.
- **T0:** drift check terhadap `ddda8a27` bersih. Pemanggil dilacak dengan `grep`/pembacaan kode, bukan query Graphify; satu `graphify update .` dijalankan di akhir.
- **Respons batch:** `{ inserted, skipped, invalid: 0, total }` pada 200/201; 422 `{ code: "INVALID_INDICATORS", message, details: ValidationError[] }`.
- **Pesan buntu diganti:** "Gunakan parameter yang sudah dilink di halaman Settings QA" diganti `unlinkedIndicatorError()` / `UNLINKED_INDICATOR_NOTE` (`apps/web/src/lib/sidak-input-service.ts`). Guard simpan di import dihapus karena baris unmapped kini sudah error saat parse.

## Batasan dan risiko tersisa

- **Prasyarat deploy (penting):** Sesi Tanpa Temuan sebelumnya *selalu* jatuh ke master aktif karena bug kolom (A1). Sekarang ia memakai versi efektif dan **menolak** bila versi memuat snapshot tanpa master. Bila produksi punya snapshot unmapped di versi published, Sesi Tanpa Temuan untuk layanan itu akan gagal (dengan pesan jelas) sampai backfill. Jalankan query §Query produksi sebelum deploy.
- **Rename snapshot tidak mengubah master.** Master tetap memakai nama saat dibuat. Bila parameter di-rename lalu nama lama ditambahkan lagi di versi lain, keduanya berbagi master. Kasus jarang; tidak ditangani.
- **Race hapus vs tambah.** Penghapusan master tak-terpakai memeriksa referensi lalu menghapus tanpa transaksi; penambahan snapshot paralel yang memakai master yang sama pada saat itu bisa meninggalkan mapping menggantung (tidak ada FK, A3). Temuan tetap dilindungi FK `RESTRICT`.
- **Tidak ada guard status draft** pada tambah/ubah/hapus parameter (perilaku lama, di luar cakupan).

## Bukti verifikasi

Semua terhadap Supabase lokal disposable (`127.0.0.1:54321/54322`); tidak ada akses remote/produksi.

| Perintah | Hasil |
| --- | --- |
| `npx playwright test --config=playwright.api.config.ts --project=sidak-unmapped-indicator-real-backend` (RED, sebelum GREEN) | Test 1 gagal: `legacy_indicator_id` null; dijalankan terpisah: partial-invalid 201 (harap 422), A2 201 (harap 422), link menggantung 201 (harap 422) |
| sama (GREEN) | 9 passed |
| `npx playwright test e2e/sidak-input-unmapped.spec.ts` (RED) | 2 gagal (tidak ada penanda/ error baris), 1 lulus (jalur catch 422 sudah ada) |
| sama (GREEN) | 3 passed |
| API regression: `--project=tna-real-backend --project=sidak-temuan-dates --project=sidak-unmapped-indicator-real-backend --project=sidak-dashboard-kpi-real-backend` | 92 passed, 2 failed — keduanya di `sidak-temuan-dates-api.spec.ts`, prasyarat fixture (periode Jan 2026 dari `seed-slik-baseline.sh` tidak ada lokal); identik di baseline `ddda8a27` (2 failed, 26 did not run) |
| Browser regression: input-unmapped, temuan-dates, temuan-import-dates, input-layout, settings, heatmap-integration, heatmap-browser-integration | 57 passed, 3 failed, 1 did not run — semua spec heatmap real-backend dengan ID periode/indikator SLIK yang tidak ada lokal. Di baseline, `heatmap-integration` test 1 juga gagal (`inserted` 0, harap 3) dan test "skor/ranking" **lulus semu** (0 baris tersisip); sekarang gagal jujur dengan 422 |
| `pnpm typecheck` / `pnpm lint` / `pnpm build` | exit 0 / exit 0 (0 error, 8 + 70 warning existing) / exit 0 |
| `git diff --check` | exit 0 |

# EFEK ↔ TNA — tautan sesi kelas ke rencana TNA

Lane D (schema + RPC change, API contract, UI). Status: **DONE di `main`** (2026-11-13); migrasi remote/produksi belum dijalankan (butuh izin Fajar).
Dibuat 2026-11-13 untuk dikerjakan agent lain. Ikuti `AGENTS.md` dan `docs/AGENT_WORKFLOW.md`;
muat `trainers-superapp-tdd` dan `supabase-migration` sebelum mengedit.

## Masalah

EFEK (`efek_sessions`, `efek_participants`) dan TNA (`tna_needs` → `tna_plans` →
`tna_plan_participants`) hanya berbagi `profiler_peserta.id`, `service_type`, dan tanggal. Tidak ada
relasi. Trainer tidak bisa melihat dari rencana TNA sesi kelas mana yang menjalankannya, dan EFEK
tidak tahu rencana mana yang ia ukur. `apps/web/src/routes/tna/results.tsx:25` sengaja memisahkan
keduanya ("EFEK stays separate").

## Requirement

1. Sesi EFEK boleh ditautkan ke paling banyak satu rencana TNA; satu rencana boleh punya banyak sesi.
2. Dari detail rencana `aktif`, trainer bisa membuat sesi EFEK yang sudah terisi dari rencana.
3. Sesi lama/impor bisa ditautkan atau dilepas lewat form edit sesi.
4. Detail rencana menampilkan sesi kelas tertaut beserta Δ EFEK-nya (informatif).
5. Δ EFEK **tidak** memengaruhi verdict TNA (ukurannya berbeda: skor SIDAK keseluruhan vs tingkat
   temuan satu parameter per 100 sesi).

## Keputusan default (konfirmasi ke Fajar sebelum T1 bila ragu)

| #   | Pertanyaan                                | Default di rencana ini                                                                                                                                                |
| --- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Peserta sesi wajib subset roster rencana? | **Tidak wajib.** Form prefill dari roster; detail rencana menampilkan "x dari N peserta rencana ikut sesi ini".                                                       |
| D2  | Δ EFEK dibekukan saat rencana `selesai`?  | **Tidak.** Dibaca live, seperti laporan EFEK. Tidak ada snapshot baru.                                                                                                |
| D3  | CERIWIS boleh ditautkan?                  | **Ya**, validasi berdasarkan `service_type` (sama dengan layanan kebutuhan), bukan `suggested_modules`.                                                               |
| D4  | Rencana yang boleh dipilih                | Status `aktif`, `evaluasi`, `selesai`. Bukan `draft`/`dibatalkan`. Tautan yang sudah ada tetap tersimpan bila rencana kemudian dibatalkan (UI menandai "Dibatalkan"). |
| D5  | Aturan tanggal                            | `session.start_date` ∈ [`plan.start_date`, `plan.end_date`].                                                                                                          |

Tidak ada state/lifecycle baru (aturan "no new implicit state machines" tidak terpicu): ini hanya FK
opsional.

## Desain

### Skema — `supabase/migrations/<ts>_efek_tna_plan_link.sql` + `supabase/rollbacks/rollback_<ts>_efek_tna_plan_link.sql`

- `ALTER TABLE public.efek_sessions ADD COLUMN tna_plan_id uuid NULL REFERENCES public.tna_plans(id) ON DELETE SET NULL;`
- `CREATE INDEX idx_efek_sessions_tna_plan ON public.efek_sessions(tna_plan_id) WHERE tna_plan_id IS NOT NULL;`
- RLS/grant tidak berubah (SELECT admin/trainer sudah ada; `tna_plans` juga sudah terbaca admin/trainer).
- `CREATE OR REPLACE FUNCTION public.efek_save_sessions(...)` dengan signature **sama** (jangan ubah
  signature/ACL; ikuti peringatan "never REVOKE EXECUTE" di header migrasi `20261019160000`):
  - Baca `s->>'tna_plan_id'` (opsional, boleh `null`).
  - Bila ada: `SELECT p.status, p.start_date, p.end_date, n.service_type FROM tna_plans p JOIN tna_needs n ON n.id = p.need_id WHERE p.id = ...`.
    Tolak dengan `RAISE EXCEPTION 'EFEK_PLAN_INVALID'` bila tidak ada, status di luar D4, `service_type`
    berbeda, atau tanggal melanggar D5.
  - `create`: simpan `tna_plan_id`. `replace`: set ke nilai baru (termasuk `NULL` = lepas tautan);
    key yang tidak dikirim mempertahankan tautan tersimpan (perbaikan review 2026-11-13).
    Rencana yang sudah dibatalkan dan **tidak berubah** pada replace harus tetap diterima (cek hanya bila
    nilainya berbeda dari yang tersimpan).
  - `merge` (impor): **jangan** sentuh `tna_plan_id` sesi yang sudah ada; sesi baru dari impor = `NULL`.
    Payload impor tetap tanpa `tna_plan_id`.
- Rollback: kembalikan definisi fungsi lama persis dari `20261019160000_efek_training_sessions.sql`,
  drop index, drop kolom. Verifikasi replay lokal bersih (`supabase db reset`).

### Types — `packages/types/src/efek.ts`

- `sessionFields` menambah `tna_plan_id: z.string().uuid().nullable().optional()`; `efekImportInputSchema` tetap tanpa field ini (strict).
- `EfekSession` menambah `tna_plan: { id: string; title: string; status: TnaPlanStatus } | null`.
- Tipe baru `EfekPlanOption { id; title; status; start_date; end_date; service_type; participant_ids: string[] }`.
- Tipe baru untuk detail rencana (taruh di file types TNA yang dipakai `GET /plans/:id`):
  ```ts
  type TnaPlanEfek =
    { state: "ok"; sessions: TnaPlanEfekSession[] } | { state: "unavailable" };
  interface TnaPlanEfekSession {
    id: string;
    program_code: string;
    title: string;
    start_date: string;
    end_date: string;
    participant_count: number;
    roster_overlap: number; // D1
    status: EfekSessionStatus; // terukur | sebagian | menunggu
    mean_delta: number | null; // dari ringkasan sesi laporan EFEK
  }
  ```

### API

- `apps/api/src/services/efek/sessions.ts`: teruskan `tna_plan_id` ke RPC; petakan
  `EFEK_PLAN_INVALID` → 422 dengan pesan Indonesia ("Rencana TNA tidak cocok: periksa status, layanan,
  dan tanggal sesi."). List/detail sesi menyertakan `tna_plan` (join `tna_plans(id,title,status)` via
  user JWT).
- `apps/api/src/routes/efek.ts`: endpoint baru `GET /tna/efek/plan-options?service_type=&start_date=`
  (`tna.read`), mengembalikan rencana sesuai D4/D5 dengan layanan yang sama, maksimal 50, terbaru dulu.
  Query tidak valid → 400.
- `GET /tna/plans/:id` (`apps/api/src/routes/tna.ts:479`, `services/tna/detail.ts`): tambah field
  `efek: TnaPlanEfek`. Baca `efek_sessions` dengan `tna_plan_id = :id` (user JWT), lalu hitung status/Δ
  per sesi dengan service laporan EFEK yang sudah ada (`services/efek/report.ts`, filter `session`,
  window bawaan, mode proper input bawaan). Bila pembacaan EFEK gagal → `{ state: "unavailable" }`
  (satu fallback terbatas, sama seperti `practice.state = "unavailable"`); detail rencana tetap 200.
  Tanpa sesi → `{ state: "ok", sessions: [] }`.
- Tidak ada perubahan pada verdict, `complete`, snapshot, atau `/tna/effectiveness`.
- Semua tulis tetap lewat RPC + `logActivity` yang sudah ada (tambahkan `tna_plan_id` ke detail log).

### Web

- `apps/web/src/routes/tna/plan.tsx`: bagian baru **Sesi kelas (EFEK)** setelah `PracticeProgress`,
  tampil untuk `aktif`/`evaluasi`/`selesai`.
  - Daftar sesi: judul, program, tanggal, "x dari N peserta rencana", status, Δ, tautan ke
    `/tna/efek/program/$code?session=<id>`.
  - Kosong: "Belum ada sesi kelas tertaut." + tombol **Catat sesi pelatihan** (hanya `aktif`, hanya `tna.write`).
  - `unavailable`: pesan gagal + **Coba lagi**.
  - Catatan kecil: "Δ EFEK informatif, tidak memengaruhi verdict."
- `apps/web/src/routes/tna/efek-session.tsx`: terima search param `plan`. Saat ada: muat
  `plan-options` / detail rencana, prefill `service_type`, `start_date`, `end_date`, `peserta_ids` dari
  roster (peserta dengan `peserta_id` null dilewati), judul = judul rencana. Field baru
  **Rencana TNA (opsional)** (select dari `plan-options`, termasuk "Tanpa rencana"); daftar dimuat ulang
  saat layanan/tanggal mulai berubah. Error 422 `EFEK_PLAN_INVALID` tampil di field ini.
- `apps/web/src/routes/tna/efek.tsx`: baris sesi menampilkan label nama rencana bila tertaut.
- `apps/web/src/routes/tna/results.tsx`: ubah kalimat pemisah agar menyebut bahwa sesi kelas tertaut
  terlihat di detail rencana (tanpa menggabungkan angka).
- Rute/tipe search mengikuti pola router yang ada (lihat `EfekReportSearch`).

### Docs

- `docs/modules.md` §10 (EFEK) dan §9 Fase 6 / detail rencana: kontrak `tna_plan_id`, `plan-options`,
  field `efek` di `GET /plans/:id`, D1–D5.
- `docs/database.md`: kolom + index + validasi RPC + rollback.
- `CHANGELOG.md`: satu entri `feat(tna): ...` di tanggal hari pengerjaan.

## Tasklist

- [x] T0 Discovery: `graphify` untuk `services/efek/sessions.ts`, `services/tna/detail.ts`,
      `routes/tna/plan.tsx`, `routes/tna/efek-session.tsx`; konfirmasi D1–D5 dengan Fajar bila ada keraguan.
- [x] T1 RED API (backend + DB lokal nyata, `--config playwright.api.config.ts`), perluas
      `apps/web/e2e/tna-efek-api.spec.ts` (atau spec baru `tna-efek-plan-link-api.spec.ts`):
  - create dengan `tna_plan_id` valid → 201, list/detail berisi `tna_plan`;
  - 422 untuk: rencana `draft`, `dibatalkan`, layanan beda, tanggal di luar D5, UUID tidak ada;
  - replace melepas tautan (`null`) dan mengganti tautan; replace sesi yang rencananya sudah dibatalkan tanpa mengubah tautan → 200;
  - impor `merge` tidak mengubah tautan sesi yang ada; payload impor dengan `tna_plan_id` → 400;
  - `GET /plan-options` filter status/layanan/tanggal; leader/agent 403;
  - `GET /tna/plans/:id` berisi `efek.sessions` dengan `roster_overlap` benar; tanpa sesi → `[]`;
  - hapus rencana tidak mungkin (dibatalkan saja), tapi uji `ON DELETE SET NULL` cukup di DB spec bila ada pola `*-db-api.spec.ts`.
- [x] T2 Migrasi + rollback; `supabase db reset` lokal bersih; jalankan rollback lalu migrasi lagi.
- [x] T3 GREEN types + API sampai T1 hijau.
- [x] T4 RED browser hermetic (`tna-efek.spec.ts` dan/atau `tna-flow.spec.ts`, 390 dan 1280 px):
      tombol **Catat sesi pelatihan** → form terisi → simpan → kembali ke rencana dan sesi terlihat;
      edit sesi lama → pilih rencana → label muncul di daftar EFEK; keadaan `unavailable` + Coba lagi;
      error 422 di field rencana.
- [x] T5 GREEN web sampai T4 hijau.
- [x] T6 Review: `thermo-nuclear`, lalu `impeccable` audit untuk UI baru.
- [x] T7 Verifikasi serial (satu Playwright run sekaligus): spec TNA/EFEK yang tersentuh, lalu
      `pnpm exec turbo run typecheck lint build --concurrency=1`, `git diff --check`.
- [x] T8 Docs + CHANGELOG. **Jangan commit/push** sampai Fajar meminta; migrasi remote/produksi
      butuh izin eksplisit terpisah.

## Di luar cakupan

- Mencocokkan otomatis sesi lama ke rencana (backfill heuristik).
- Snapshot Δ EFEK saat rencana selesai (lihat D2).
- Menggabungkan `efek_programs` dengan `tna_programs`.
- Agregasi EFEK di `/tna/hasil`.

## Risiko

- Laporan EFEK per sesi bisa berat bila rencana punya banyak sesi; batasi ke sesi tertaut saja dan
  hitung dalam satu panggilan service, bukan N panggilan HTTP.
- `CREATE OR REPLACE` pada fungsi SECURITY DEFINER: pastikan `search_path` dan guard
  `tna_internal.assert_service_role()` / `require_actor()` tetap ada, dan grant tidak berubah.

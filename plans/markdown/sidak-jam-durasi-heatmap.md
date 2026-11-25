# Jam Layanan & Durasi Call di Heatmap SIDAK — Rencana Implementasi

- **Status:** rencana, belum dieksekusi. Dokumen ini bukan bukti implementasi atau hasil pengujian.
- **Tanggal rencana:** 2026-11-25. **Baseline:** `03589fb2` (`main`).
- **Risk lane:** Lane D — schema/migration, kontrak API publik, dan penulisan data prod oleh Hermes.
- **Kontrak terkait:** `plans/markdown/sidak-heatmap.md` (tanggal bisnis), `plans/markdown/sidak-heatmap-insights-agent.md` (kontrak heatmap terbaru: leader scope, `count_by`, `agent_id`).

## Requirement

### Latar belakang

Sheet "Rekap Ketidaksesuaian QA 2026" (sumber sync Hermes di `vps-fajar`) punya kolom H yang belum pernah masuk SIDAK. `gs-to-md.py` dan `batch_sync_sidak.py` hanya membaca kolom F (TGL SAMPEL) dan G (TGL LAYANAN); `qa_temuan` hanya menyimpan `tanggal_layanan`/`tanggal_sampel` bertipe `date`.

| Keluarga sheet | Header kolom H          | Layanan (prefix NO TEMUAN)                |
| -------------- | ----------------------- | ----------------------------------------- |
| EMAIL & MIX    | `JAM`                   | email, cso, pencatatan (`QAPCT`/`RECPCT`) |
| DIGITAL CHAT   | `JAM`                   | chat                                      |
| SLIK           | `JAM`                   | slik                                      |
| CALL           | `DURASI` (menit.detik)  | call                                      |
| BKO-MONITORING | — (kolom H = PARAMETER) | bko                                       |

### Keputusan yang sudah dikonfirmasi Fajar (2026-11-25)

| Aspek        | Ketentuan                                                           |
| ------------ | ------------------------------------------------------------------- |
| Digital chat | JAM = saat interaksi layanan **dimulai** → jam layanan              |
| Call         | DURASI **disimpan**; call tidak punya jam layanan                   |
| BKO          | Tidak punya jam maupun durasi                                       |
| Pencatatan   | Punya JAM (di sheet EMAIL & MIX); ikut aturan email/CSO             |
| Data lama    | Di-backfill dari sheet oleh Hermes; tanpa sumber jujur tetap `NULL` |

### Asumsi awal (BELUM dikonfirmasi — lihat Gerbang G1)

| ID  | Asumsi                                                                    | Kalau ternyata salah                    |
| --- | ------------------------------------------------------------------------- | --------------------------------------- |
| A1  | Email: JAM = saat agent **membalas** → jam layanan                        | lihat G1                                |
| A2  | CSO & pencatatan: JAM = jam layanan                                       | lihat G1                                |
| A3  | SLIK: JAM = jam layanan/proses verifikasi                                 | lihat G1                                |
| A4  | Ambang kategori jam & durasi di bawah dipakai sampai ada target AHT resmi | ubah konstanta di `packages/types` saja |

### Kategori

Dasar: profil read-only kolom H Jan–Nov 2026 dari cache XLSX Hermes (`qa-sync-november-final-20261125T184307+0800.xlsx`, 2026-11-25).

**Jam layanan** (n = 2.561 temuan non-call):

| Kategori                | Rentang (WIB)               | Porsi saat profiling |
| ----------------------- | --------------------------- | -------------------- |
| Pagi                    | 07:00–10:59                 | ±51%                 |
| Siang                   | 11:00–13:59                 | ±25%                 |
| Sore                    | 14:00–16:59                 | ±20%                 |
| Di luar jam operasional | 00:00–06:59 dan 17:00–23:59 | ±3%                  |

**Durasi call** (n = 1.379; median 8m51s, p25 6m07s, p75 12m19s, p90 17m10s):

| Kategori              | Rentang                                                 | Porsi saat profiling |
| --------------------- | ------------------------------------------------------- | -------------------- |
| Singkat               | < 5 menit                                               | 15%                  |
| Sedang                | 5 menit – < 15 menit                                    | 70%                  |
| Panjang               | ≥ 15 menit                                              | 15%                  |
| Penanda "perlu dicek" | < 1 menit (bukan kategori keempat; tetap masuk Singkat) | 3%                   |

Kategori dihitung dari nilai tersimpan, tidak pernah disimpan sebagai kolom — supaya mengubah ambang tidak butuh migration/backfill.

### Batasan interpretasi (wajib tampil di UI)

- Heatmap ini menunjukkan **di jam berapa temuan menumpuk**, bukan tingkat kesalahan per jam: tidak ada denominator jumlah layanan per jam.
- Semantik JAM berbeda per kanal (email = dibalas, chat = dimulai). Tampilan gabungan semua layanan harus menyebutnya.
- Distribusi durasi hanya mencakup call **yang punya temuan**, bukan seluruh call.

### Di luar scope

- Korelasi dengan Jadwal Shifting (jam ke-N dalam shift) — kandidat fase lanjutan.
- Analisis AI atas pola jam/durasi.
- Mengubah skor, ranking, periode audit, phantom padding, atau format ekspor agent yang terkunci.
- Jam untuk call (tidak ada sumbernya) dan BKO.

## Design

### Gerbang G1 — konfirmasi semantik JAM (email, CSO, pencatatan, SLIK)

Kerja lokal Fase 0–5 boleh jalan dengan asumsi A1–A3. **Migration ke prod (Fase 6) dan backfill Hermes untuk email/CSO/pencatatan/SLIK (Fase 7) menunggu konfirmasi Fajar.** Chat dan durasi call tidak menunggu G1.

Kalau konfirmasi untuk satu layanan = "jam QA melakukan sampling":

1. Jangan masukkan nilainya ke `jam_layanan`. Tambah kolom `jam_sampel time(0) NULL` di migration yang sama, **sebelum** migration diterapkan ke prod.
2. Ubah peta sumber jam (lihat di bawah) untuk layanan itu menjadi `"sampel"`; tampilannya pindah ke heatmap mode QA.
3. Perbarui plan ini (Requirement + Tasklist) sebelum lanjut.

### Kondisi kode saat perencanaan

- `supabase/migrations/20261001120000_add_temuan_business_dates.sql`: pola kolom bisnis nullable tanpa default/backfill — diikuti.
- `packages/types/src/sidak.ts`: `serviceTypeSchema` (call, chat, email, cso, pencatatan, bko, slik), `HEATMAP_DATE_COLUMN`, `tanggalSchema`, `temuanTanggalSchema`, `createTemuanBatchSchema`, `updateTemuanSchema`, `SidakHeatmapResponse`.
- `apps/api/src/services/sidak/temuan-service.ts`: mapping insert tanggal per baris (`?? null`).
- `apps/api/src/services/sidak/heatmap-service.ts` + `apps/api/src/routes/sidak/heatmap.ts`: agregasi per tanggal, `is_countable`, phantom dikeluarkan, leader = service-role + scope app-side.
- Web input: `SidakInputManualForm.tsx`, `SidakInputImportPanel.tsx`, `EditTemuanModal.tsx`, `TemuanGroupCard.tsx`, `AgentTemuanTab.tsx`, hooks `useTemuanForm.ts` / `useTemuanImport.ts` / `useTemuanEdit.ts`.
- Web heatmap: `routes/sidak/heatmap.tsx`, `SidakHeatmapCalendar.tsx`, `SidakWeekdayBars.tsx`, `SidakHeatmapInsights.tsx`, `SidakAgentHeatmapPanel.tsx`, `lib/sidak-heatmap-client.ts`.
- Hermes (VPS, di luar repo): `~/.hermes/skills/productivity/qa-rekap-md/scripts/{gs-to-md.py,batch_sync_sidak.py,backfill-temuan-dates.py}`; menulis langsung ke PostgREST dengan service-role, jadi **validasi API tidak melindungi jalur ini** — penjaganya tipe kolom + CHECK di database.

### Penyimpanan

Migration baru `supabase/migrations/<ts>_add_temuan_jam_durasi.sql` + rollback berpasangan:

```sql
ALTER TABLE public.qa_temuan
  ADD COLUMN IF NOT EXISTS jam_layanan time(0),
  ADD COLUMN IF NOT EXISTS durasi_detik integer;

ALTER TABLE public.qa_temuan
  ADD CONSTRAINT qa_temuan_durasi_detik_range
    CHECK (durasi_detik IS NULL OR (durasi_detik >= 0 AND durasi_detik < 86400)),
  ADD CONSTRAINT qa_temuan_durasi_only_call
    CHECK (durasi_detik IS NULL OR service_type = 'call'),
  ADD CONSTRAINT qa_temuan_jam_layanan_not_call_bko
    CHECK (jam_layanan IS NULL OR service_type NOT IN ('call', 'bko'));
```

- `time(0)` jam dinding WIB tanpa zona — sengaja bukan `timestamptz` supaya tidak ada geser zona waktu; detik dibuang (heatmap per jam).
- Tanpa DEFAULT, tanpa backfill di migration; `NULL` = belum diisi. `created_at` tidak pernah dipakai sebagai pengganti.
- CHECK membuat salah tulis Hermes (durasi ke chat, jam ke call/bko) mustahil, bukan sekadar dilarang di dokumen.
- RLS/policy/grant tidak berubah (policy existing column-agnostic). Index tidak ditambah di MVP; agregasi memakai filter tanggal + service yang sudah ada.

### Kontrak bersama (`packages/types/src/sidak.ts`)

- `jamSchema`: string `HH:MM` atau `HH:MM:SS` 24 jam (00–23, 00–59); format lain ditolak, tidak ada tebakan AM/PM.
- `durasiDetikSchema`: integer 0–86399.
- `temuanWaktuSchema = { jam_layanan?: jam | null, durasi_detik?: int | null }`, digabung ke item `createTemuanBatchSchema` dan `updateTemuanSchema`.
- Peta sumber jam, satu tempat (allowlist, bukan nama kolom dari input):
  ```ts
  export const SIDAK_TIME_SOURCE: Record<
    ServiceType,
    "layanan" | "durasi" | null
  > = {
    email: "layanan",
    cso: "layanan",
    pencatatan: "layanan",
    chat: "layanan",
    slik: "layanan",
    call: "durasi",
    bko: null,
  };
  ```
- `SIDAK_JAM_BUCKETS` (pagi/siang/sore/luar, batas dalam menit sejak 00:00) dan `SIDAK_DURASI_BUCKETS` (singkat/sedang/panjang, batas dalam detik) + `SIDAK_DURASI_REVIEW_BELOW_SECONDS = 60`. Fungsi `classifyJam()` / `classifyDurasi()` dipakai API dan web.

### API

- **Create/preview/import/update temuan:** menerima `jam_layanan` dan `durasi_detik`. Service menolak kombinasi yang tidak sesuai `SIDAK_TIME_SOURCE` dengan pesan manusiawi (mis. "Layanan Call tidak memakai jam layanan; isi durasi."), bukan error CHECK mentah. Mapping insert mengikuti pola `?? null`.
- **Endpoint baru `GET /sidak/heatmap/time-profile`** (router `sidakHeatmap`, guard `agentRead` yang sama). Query: `year`, `service_type?`, `count_by`, `agent_id?`, `folder_ids?`, `start_month?`/`end_month?` — skema sama dengan `sidakHeatmapQuerySchema` minus `mode` (selalu basis `tanggal_layanan`). Respons:
  ```ts
  interface SidakHeatmapTimeProfileResponse {
    year: number;
    serviceType: ServiceType | null;
    countBy: SidakHeatmapCountBy;
    agentId: string | null;
    hours: {
      cells: Array<{
        weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7;
        hour: number;
        count: number;
      }>; // Senin=1
      buckets: Record<"pagi" | "siang" | "sore" | "luar", number>;
      total: number;
      missingTime: number; // layanan bersumber jam, tanggal ada, jam NULL
    } | null; // null bila layanan terpilih tidak punya jam (call/bko)
    durations: {
      buckets: Record<"singkat" | "sedang" | "panjang", number>;
      reviewBelowOneMinute: number;
      total: number;
      missingDuration: number;
    } | null; // null bila layanan terpilih bukan call/semua
    notApplicable: number; // temuan bko (dan call untuk bagian jam) — "tidak punya data jam", BUKAN "belum diisi"
  }
  ```
- Aturan agregasi sama dengan heatmap tanggal: hanya `is_countable`, phantom padding dikeluarkan, `count_by=tiket` = distinct `no_tiket` per sel (baris tanpa tiket dihitung per baris), paging `fetchAllPages` + `order("id")`, kegagalan query = error (bukan profil kosong), admin/trainer memakai user JWT, leader memakai service-role + `applyScope`. Weekday dihitung dari `tanggal_layanan` (baris tanpa tanggal tidak masuk sel maupun `missingTime`, karena di luar filter tahun).

### UI

Jalankan `ui-ux-pro-max` sebelum implementasi dan `impeccable` audit/polish sebelum gerbang akhir.

- `/sidak/heatmap`, **mode Agent**: section baru "Jam layanan" di bawah kalender.
  - Matriks Senin–Minggu × kolom `<07`, `07`…`16`, `≥17` (dua kolom tepi menampung jam di luar operasional).
  - Ringkasan Pagi/Siang/Sore/Di luar jam: jumlah + persen, dengan rentang jam tertulis.
  - Kalimat batasan interpretasi (lihat Requirement).
  - Layanan Call/semua: kartu "Durasi panggilan" Singkat/Sedang/Panjang + penanda "< 1 menit perlu dicek".
  - Layanan BKO: status "Layanan ini tidak punya data jam/durasi" — dibedakan tegas dari "belum diisi".
- **Mode QA**: section jam tidak tampil; catatan singkat "Jam hanya tersedia di mode Agent" (kecuali G1 menghasilkan `jam_sampel`).
- **Detail agent → tab Heatmap**: komponen yang sama, ter-scope `agent_id`.
- **Input/edit**: field "Jam layanan" (`HH:MM`) untuk layanan bersumber jam, field "Durasi" (`mm:ss`, disimpan sebagai detik) hanya untuk Call; keduanya disembunyikan untuk BKO. Template import menambah dua kolom opsional di akhir; template lama tetap terbaca.

### Hermes (VPS, di luar repo)

Perubahan dikerjakan di `~/.hermes/skills/productivity/qa-rekap-md/scripts/`, dengan backup `*.bak-pre-jam` sesuai kebiasaan folder itu. Semua penulisan prod butuh izin Fajar per run.

- **Baca sel mentah XLSX + format angkanya (numFmt)**, bukan teks gviz.
- **Semantik kolom H ditentukan layanan baris** (hasil routing prefix), bukan nama sheet. Contoh: baris QADATA di sheet CALL berisi jam (`0.6118` = 14:41), bukan durasi.
- **Aturan parse jam (fail closed — tidak cocok → `NULL` + masuk laporan):**
  - Serial waktu (pecahan hari) bila format selnya format waktu.
  - Angka `h.mm` (`8.02` → 08:02; satu digit menit dipad kanan: `7.2` → 07:20).
  - Teks `HH:MM[:SS]` atau `HH.MM`.
  - `HH:MM:SS PM` dengan HH ≥ 13 → akhiran dibuang.
  - Akhiran AM/PM dengan HH ≤ 12 → dikonversi.
- **Aturan parse durasi:**
  - Angka `m.ss` (`8.59` → 539 detik; `7.2` → 7m20s).
  - Teks `h.mm.ss` (`01.20.07` → 4.807 detik).
  - Detik ≥ 60 (`6.9`) atau `-` → `NULL` + laporan.
- **Sync harian:** `batch_sync_sidak.py` menambah `jam_layanan,durasi_detik` ke field default dan read-back.
- **Backfill Jan–Nov:** perluas `backfill-temuan-dates.py`, dengan kunci dan resolusi yang sama: `(service_type, no_tiket)`, kemiripan teks bila kandidat > 1, fail closed.
- **Laporan dry-run per bulan** berisi tingkat terbaca per layanan dan daftar sel yang tidak terbaca. Dari profiling: ±247 chat berformat `PM`, 16 chat di 00:xx/23:xx, beberapa `-`, `15.40,40`, `6.9`, `01.20.07`. Daftar ini bisa diperbaiki di sheet oleh tim QA sebelum `--apply`.

### Urutan rilis

Railway auto-deploy API saat push ke `main`, jadi migration prod harus masuk **sebelum** kode yang membaca kolom baru di-push. Urutannya:

1. G1 selesai.
2. Migration diterapkan ke prod `ruosnjmtywcrghjgqugz` (izin eksplisit Fajar).
3. Push kode ke `main`.
4. Hermes sync harian diaktifkan dengan field baru.
5. Backfill per bulan: dry-run → review → `--apply` (izin per run).

## Tasklist

### Fase 0 — Persiapan (read-only)

- [ ] Drift-check plan ini terhadap `main` (file dan skema di "Kondisi kode" masih sama).
- [ ] Load `trainers-superapp-tdd`, `supabase-migration`; query Graphify untuk pemanggil `getSidakHeatmap`, `createTemuanBatch`, `updateTemuan`.
- [ ] Hermes: tulis parser `parse_jam`/`parse_durasi` sebagai modul terpisah + mode dry-run laporan saja (tanpa tulis DB). Jalankan untuk Jan–Nov; simpan laporan di `~/.hermes/cache/scratch/`. Kirim daftar sel tak terbaca ke Fajar.
- [ ] Minta izin Fajar sebelum menambah/menjalankan unit test Python parser (aturan non-E2E AGENTS.md); bila disetujui, daftar semua failure mode dulu.

### Fase 1 — Schema & kontrak bersama

- [ ] RED: E2E real-backend `sidak-temuan-time-db-guard.spec.ts` — insert langsung (jalur service-role seperti Hermes) dengan durasi pada chat, jam pada call/bko, durasi negatif/≥86400 → ditolak; kombinasi valid → tersimpan.
- [ ] Migration + rollback berpasangan; replay lokal bersih (`supabase db reset`) via skill `supabase-migration`.
- [ ] `packages/types`: `jamSchema`, `durasiDetikSchema`, `temuanWaktuSchema`, `SIDAK_TIME_SOURCE`, bucket + `classifyJam`/`classifyDurasi`.
- [ ] GREEN.

### Fase 2 — API CRUD

- [ ] RED: `sidak-temuan-time-api-contract.spec.ts` — create/preview/update menerima & menyimpan jam/durasi; menolak `25:00`, `7.2`, `08:00 PM`, jam untuk call/bko, durasi untuk non-call dengan pesan manusiawi; tanpa field → `NULL` (tidak ada default).
- [ ] Mapping insert/update di `temuan-service.ts`; GREEN.

### Fase 3 — API time-profile

- [ ] RED: `sidak-heatmap-time-profile-api.spec.ts`:
  - Batas bucket: 06:59 luar, 07:00 pagi, 10:59 pagi, 11:00 siang, 13:59 siang, 14:00 sore, 16:59 sore, 17:00 luar.
  - Batas durasi: 59 detik singkat + review, 299 singkat, 300 sedang, 899 sedang, 900 panjang.
  - Weekday Senin=1.
  - `count_by=tiket`.
  - `is_countable=false` dan phantom dikeluarkan.
  - `missingTime` vs `notApplicable` terpisah.
  - Filter bulan/folder/agent.
  - Leader hanya melihat timnya.
  - Query gagal → error.
- [ ] Service + route; GREEN.

### Fase 4 — UI input/edit

- [ ] RED: `sidak-temuan-time.spec.ts` — manual, import (template baru + template lama), dan edit inline/modal menyimpan jam/durasi; field tampil/tersembunyi sesuai layanan.
- [ ] Implementasi hooks + komponen input; GREEN.

### Fase 5 — UI heatmap

- [ ] `ui-ux-pro-max` untuk section jam & durasi (acceptance criteria, state kosong/NA/missing, mobile).
- [ ] RED: `sidak-heatmap-time.spec.ts`:
  - Matriks + ringkasan persen tampil di mode Agent.
  - Tersembunyi di mode QA.
  - Kartu durasi tampil untuk Call.
  - Status "tidak punya data jam" untuk BKO.
  - Tab Heatmap detail agent ter-scope.
  - Kalimat batasan interpretasi ada.
- [ ] Implementasi; GREEN; `impeccable` audit/polish; screenshot desktop + mobile, terang + gelap.

### Fase 6 — Integrasi & rilis

- [ ] `thermo-nuclear` review; perbaiki temuan.
- [ ] Root `pnpm typecheck`, `pnpm lint`, `pnpm build`; E2E fitur + regresi heatmap/tanggal yang ada (`sidak-heatmap*.spec.ts`, `sidak-temuan-dates*.spec.ts`, `sidak-temuan-import-dates.spec.ts`), satu run pada satu waktu.
- [ ] Dokumentasi: kolom baru di `docs/database.md`, kontrak di `docs/modules.md`; entri `plans/README.md`.
- [ ] **STOP — G1 harus sudah selesai.** Minta izin Fajar → terapkan migration ke prod → verifikasi kolom/CHECK → baru push kode ke `main` (`push-ready`).

### Fase 7 — Hermes sync & backfill

- [ ] Sync harian: tambah field, read-back; satu run dry-run lalu run nyata (izin Fajar).
- [ ] Backfill per bulan Jan–Nov: dry-run → laporan (tingkat terbaca, sel ditolak) → `--apply` dengan izin per run → read-back penuh.
- [ ] Verifikasi di app: profil jam per layanan cocok dengan profiling awal (selisih hanya dari sel yang ditolak/diperbaiki).

## STOP conditions

- Konfirmasi G1 menyatakan JAM = jam sampling untuk layanan mana pun → hentikan sebelum migration prod, ubah plan (tambah `jam_sampel`, ubah `SIDAK_TIME_SOURCE`).
- Tingkat terbaca kolom H untuk satu layanan < 90% pada dry-run → laporkan ke Fajar sebelum backfill layanan itu.
- Kegagalan E2E yang sama setelah tiga ronde perbaikan → berhenti dan bawa bukti (`docs/AGENT_WORKFLOW.md` §7).
- Penulisan ke Supabase prod (migration atau Hermes `--apply`) tanpa izin eksplisit Fajar untuk run itu → jangan dilakukan.

# Jam Layanan & Durasi Call di Heatmap SIDAK — Rencana Implementasi

- **Status:** Fase 1–6 selesai dan sudah di `main` (migration prod diterapkan 2026-11-26). Fase 7 Hermes: sync harian sudah membawa jam/durasi; Januari–November 2026 terisi, termasuk 268 baris lewat pencocokan per tiket (2026-11-26). Tersisa keputusan QA atas 77 baris sheet yang tidak di-insert, dan cek tampilan di app.
- **Tanggal rencana:** 2026-11-25; revisi 2026-11-26 (arti JAM semua layanan, kecocokan tanggal–jam, tanpa AHT, jam operasional chat, dan email/CSO/BKO dikeluarkan dari analisa jam). **Baseline:** `03589fb2` (`main`).
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

### Keputusan yang sudah dikonfirmasi Fajar

| Aspek         | Ketentuan                                                                                                                                                                           | Dikonfirmasi |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Digital chat  | JAM = saat interaksi layanan **dimulai**                                                                                                                                            | 2026-11-25   |
| Email         | **Tidak dipakai untuk analisa jam.** Datanya tidak valid: arti JAM berbeda per petugas QA (jam penugasan vs jam dibalas) dan sheet tidak mencatat petugasnya                        | 2026-11-26   |
| CSO           | **Tidak dipakai untuk analisa jam.** JAM tiket dibuat tidak mewakili kondisi layanan                                                                                                | 2026-11-26   |
| Pencatatan    | JAM = saat **tiket layanan dibuat** (bukan saat layanan diterima, bukan saat QA sampling)                                                                                           | 2026-11-26   |
| Call          | DURASI **disimpan**; call tidak punya jam                                                                                                                                           | 2026-11-25   |
| BKO           | **Tidak dipakai untuk analisa jam.** Tidak punya jam maupun durasi                                                                                                                  | 2026-11-26   |
| Data lama     | Di-backfill dari sheet oleh Hermes; tanpa sumber jujur tetap `NULL`                                                                                                                 | 2026-11-25   |
| SLIK          | JAM = jam layanan                                                                                                                                                                   | 2026-11-26   |
| Tanggal & jam | Tanggal kolom G dan JAM kolom H = hari dan peristiwa yang sama                                                                                                                      | 2026-11-26   |
| Ambang durasi | Tidak ada target AHT; ambang diambil dari sebaran data (lihat Kategori)                                                                                                             | 2026-11-26   |
| Jam chat      | Chat live beroperasi **07:45–16:50**. JAM chat di luar itu bisa human error (mis. AM/PM tertukar), chat yang masuk sebelum agent sempat logout, atau balasan komentar IG (asinkron) | 2026-11-26   |

Semua JAM adalah **peristiwa di sisi agent/layanan**, bukan jam kerja QA. Karena itu semuanya disimpan di satu kolom `jam_layanan` (sama seperti `tanggal_layanan` yang juga sudah berbeda makna per layanan), dengan arti per layanan dicatat di satu peta (`SIDAK_TIME_SOURCE`) dan di `COMMENT` kolom. Tidak perlu kolom `jam_sampel`.

### Layanan tanpa analisa jam (keputusan 2026-11-26)

Analisa jam/durasi hanya untuk **chat, pencatatan, SLIK** (jam) dan **call** (durasi). Email, CSO, dan BKO tidak dipakai:

| Layanan | Alasan                                                                                                                                                                                                                                                                             |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email   | Data tidak valid. Di bulan yang sama (mis. November) satu QA mengisi jam penugasan dan QA lain jam dibalas. Tab email tidak punya kolom petugas QA; huruf akhir NO TEMUAN hanya nomor urut per tanggal dan prefix QAEMAIL pun campuran, jadi arti per baris tidak bisa dipulihkan. |
| CSO     | JAM tiket dibuat tidak mewakili kondisi layanan.                                                                                                                                                                                                                                   |
| BKO     | Tidak ada kolom jam maupun durasi.                                                                                                                                                                                                                                                 |

Akibatnya di rancangan:

- Ketiganya `kind: "none"` di `SIDAK_TIME_SOURCE`, masing-masing dengan alasan yang ditampilkan UI ("Analisa jam tidak dipakai untuk layanan ini: …"), dibedakan tegas dari "belum diisi".
- CHECK database hanya mengizinkan `jam_layanan` untuk chat, pencatatan, dan SLIK, jadi jam email/CSO tidak bisa tertulis lewat jalur mana pun, termasuk Hermes.
- Hermes tidak membaca kolom H untuk baris email/CSO; laporan dry-run hanya menghitung jumlahnya sebagai "tidak dipakai".
- Kalau suatu hari datanya diperbaiki (mis. QA menyeragamkan JAM email), cukup ubah `SIDAK_TIME_SOURCE` plus CHECK lewat migration baru.

### Cek jam chat di luar jam operasional

Sheet DIGITAL CHAT Jan–Nov, dicek 2026-11-26 (read-only lewat Google Sheets). Dari 1.661 baris ber-JAM, 1.580 baris berprefix chat (QADC/RECDC/OADC/REDC); sisanya (QADATA, RECEMAIL) ikut layanan hasil routing-nya, bukan aturan chat.

- **Penanda balasan komentar = format tiket.** Tidak ada kolom kanal. Tiket `L` + 10 digit tidak pernah memuat template komentar. Semua tiket 13 digit (`26MMDD` + 7 digit urutan) memuat template balasan komentar/DM di kolom KETIDAKSESUAIAN/SEBAIKNYA. Prefix NO TEMUAN tidak membedakan kanal. Keyakinan: sedang (penandanya baru terlihat di 10 baris, tapi tiap baris punya dua tanda yang sama-sama mengarah ke komentar).
- **Di luar 07:45–16:50 ada 27 baris chat:**
  - 6 bertiket 13 digit (Mar 73, Mar 114, Apr 82, Mei 35, Mei 60, Jul 10) → balasan komentar; jam disimpan.
  - 20 bertiket `L` atau berisi nomor HP, tanpa penanda komentar → jam disimpan `NULL` + masuk laporan (aturan Hermes, sudah ditetapkan; tidak menahan backfill). Rinciannya: 14 di malam hari (10 di Januari, hampir semua `11:xx PM` / `12:xx AM`, pola khas AM/PM tertukar), 5 pagi 07:15–07:41 (semua Maret), dan Jan 124 (kolom E berisi nomor HP).
  - 1 tidak terbaca (Jul 106 berisi tanggal, bukan jam) → `NULL` + laporan; satu-satunya sel yang perlu diisi jamnya oleh QA di sheet, juga tidak menahan backfill.
- Tidak ada chat live yang tercatat antara 16:51 dan 17:59.

### Kategori

Dasar: profil read-only kolom H Jan–Nov 2026 dari cache XLSX Hermes (`qa-sync-november-final-20261125T184307+0800.xlsx`, 2026-11-25).

**Jam** (n = 2.561 temuan non-call; ambang sama untuk semua layanan, tapi dibaca per layanan — lihat Batasan interpretasi):

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

Untuk chat, "Di luar jam" praktis berisi balasan komentar (lihat aturan Hermes); chat live di luar jam yang belum dibetulkan tercatat sebagai "Belum diisi".

Kategori dihitung dari nilai tersimpan, tidak pernah disimpan sebagai kolom — supaya mengubah ambang tidak butuh migration/backfill.

### Batasan interpretasi (wajib tampil di UI)

- Heatmap ini menunjukkan **di jam berapa temuan menumpuk**, bukan tingkat kesalahan per jam: tidak ada denominator jumlah layanan per jam.
- Arti JAM berbeda per layanan: chat = interaksi dimulai; pencatatan = tiket layanan dibuat; SLIK = jam layanan. Label section dan kalimat penjelas mengikuti layanan yang dipilih.
- Pencatatan: jam tiket dibuat dekat dengan saat agent mencatat/menginput, jadi paling dekat ke jam terjadinya kesalahan input; tetap bukan jam terima layanan.
- Email, CSO, BKO tidak punya analisa jam (lihat Layanan tanpa analisa jam).
- Tidak ada matriks gabungan lintas layanan: peristiwanya berbeda, jadi menjumlahkannya ke satu sel jam menyesatkan. Untuk "Semua layanan" hanya tampil tabel kategori per layanan (lihat UI).
- Distribusi durasi hanya mencakup call **yang punya temuan**, bukan seluruh call.

### Di luar scope

- Korelasi dengan Jadwal Shifting (jam ke-N dalam shift) — kandidat fase lanjutan.
- Analisis AI atas pola jam/durasi.
- Mengubah skor, ranking, periode audit, phantom padding, atau format ekspor agent yang terkunci.
- Jam untuk call (tidak ada sumbernya), email, CSO, dan BKO.

## Design

### Gerbang G1 — konfirmasi arti JAM

- **Pencatatan: SELESAI (2026-11-26).** Peristiwa sisi layanan (tiket dibuat), masuk `jam_layanan`. Tidak ada `jam_sampel`.
- **Email, CSO: SELESAI (2026-11-26)** — tidak dipakai untuk analisa jam.
- **SLIK: SELESAI (2026-11-26)** — JAM = jam layanan.
- **Tanggal kolom G dan JAM kolom H: SELESAI (2026-11-26)** — hari dan peristiwa yang sama, jadi matriks hari × jam boleh memakai `tanggal_layanan` untuk hari.

G1 selesai seluruhnya; tidak ada `jam_sampel`. Fase 6–7 tinggal menunggu izin prod per langkah.

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
  ADD CONSTRAINT qa_temuan_jam_layanan_allowed_service
    CHECK (jam_layanan IS NULL OR service_type IN ('chat', 'pencatatan', 'slik'));

COMMENT ON COLUMN public.qa_temuan.jam_layanan IS
  'Jam dinding WIB peristiwa sisi layanan; arti per service_type: chat = interaksi dimulai, pencatatan = tiket layanan dibuat, slik = jam layanan; email/cso/bko/call tidak memakai kolom ini. Peta resmi: SIDAK_TIME_SOURCE di packages/types.';
COMMENT ON COLUMN public.qa_temuan.durasi_detik IS
  'Durasi panggilan Call dalam detik; hanya untuk service_type = call.';
```

- `time(0)` jam dinding WIB tanpa zona — sengaja bukan `timestamptz` supaya tidak ada geser zona waktu; detik dibuang (heatmap per jam).
- Tanpa DEFAULT, tanpa backfill di migration; `NULL` = belum diisi. `created_at` tidak pernah dipakai sebagai pengganti.
- CHECK membuat salah tulis Hermes (durasi ke chat, jam ke call/email/CSO/BKO) mustahil, bukan sekadar dilarang di dokumen.
- RLS/policy/grant tidak berubah (policy existing column-agnostic). Index tidak ditambah di MVP; agregasi memakai filter tanggal + service yang sudah ada.

### Kontrak bersama (`packages/types/src/sidak.ts`)

- `jamSchema`: string `HH:MM` atau `HH:MM:SS` 24 jam (00–23, 00–59); format lain ditolak, tidak ada tebakan AM/PM.
- `durasiDetikSchema`: integer 0–86399.
- `temuanWaktuSchema = { jam_layanan?: jam | null, durasi_detik?: int | null }`, digabung ke item `createTemuanBatchSchema` dan `updateTemuanSchema`.
- Peta sumber jam, satu tempat (allowlist, bukan nama kolom dari input). Label ikut di peta yang sama supaya UI, pesan error, dan dokumen tidak menulis ulang arti JAM sendiri-sendiri:
  ```ts
  type SidakTimeSource =
    | { kind: "jam"; label: string; meaning: string }
    | { kind: "durasi"; label: string }
    | { kind: "none"; reason: string };

  export const SIDAK_TIME_SOURCE: Record<ServiceType, SidakTimeSource> = {
    chat: {
      kind: "jam",
      label: "Jam interaksi dimulai",
      meaning: "saat interaksi chat dimulai",
    },
    email: {
      kind: "none",
      reason: "JAM email diisi dengan arti berbeda antar petugas QA",
    },
    cso: {
      kind: "none",
      reason: "jam tiket dibuat tidak mewakili kondisi layanan CSO",
    },
    pencatatan: {
      kind: "jam",
      label: "Jam tiket dibuat",
      meaning: "saat tiket layanan dibuat",
    },
    slik: {
      kind: "jam",
      label: "Jam layanan",
      meaning: "saat layanan SLIK berlangsung",
    },
    call: { kind: "durasi", label: "Durasi panggilan" },
    bko: {
      kind: "none",
      reason: "layanan BKO tidak mencatat jam maupun durasi",
    },
  };
  ```
  Mengubah label atau arti JAM cukup di peta ini.
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
      label: string; // dari SIDAK_TIME_SOURCE
      cells: Array<{
        weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7;
        hour: number;
        count: number;
      }>; // Senin=1
      buckets: Record<"pagi" | "siang" | "sore" | "luar", number>;
      total: number;
      missingTime: number; // layanan bersumber jam, tanggal ada, jam NULL
    } | null; // null bila service_type kosong (semua) atau layanan tanpa jam (call/email/cso/bko)
    hoursByService: Array<{
      serviceType: ServiceType; // hanya layanan kind "jam"
      label: string;
      buckets: Record<"pagi" | "siang" | "sore" | "luar", number>;
      total: number;
      missingTime: number;
    }> | null; // diisi hanya bila service_type kosong; tidak ada sel gabungan lintas layanan
    durations: {
      buckets: Record<"singkat" | "sedang" | "panjang", number>;
      reviewBelowOneMinute: number;
      total: number;
      missingDuration: number;
    } | null; // null bila layanan terpilih bukan call/semua
    notApplicable: number; // temuan email/cso/bko (dan call untuk bagian jam) — "analisa jam tidak dipakai", BUKAN "belum diisi"
  }
  ```
- Aturan agregasi sama dengan heatmap tanggal: hanya `is_countable`, phantom padding dikeluarkan, `count_by=tiket` = distinct `no_tiket` per sel (baris tanpa tiket dihitung per baris), paging `fetchAllPages` + `order("id")`, kegagalan query = error (bukan profil kosong), admin/trainer memakai user JWT, leader memakai service-role + `applyScope`. Weekday dihitung dari `tanggal_layanan` (baris tanpa tanggal tidak masuk sel maupun `missingTime`, karena di luar filter tahun). Sel hari × jam **tidak pernah** menjumlahkan layanan berbeda; tanpa `service_type` API hanya mengembalikan `hoursByService`.

### UI

Jalankan `ui-ux-pro-max` sebelum implementasi dan `impeccable` audit/polish sebelum gerbang akhir.

- `/sidak/heatmap`, **mode Agent**: section baru di bawah kalender; judulnya label layanan dari `SIDAK_TIME_SOURCE` (mis. "Jam interaksi dimulai", "Jam tiket dibuat"), bukan "Jam layanan" generik.
  - **Satu layanan dipilih (chat/pencatatan/SLIK):** matriks Senin–Minggu × kolom `<07`, `07`…`16`, `≥17` (dua kolom tepi menampung jam di luar operasional) + ringkasan Pagi/Siang/Sore/Di luar jam (jumlah + persen, rentang jam tertulis) + kalimat arti JAM layanan itu (`meaning`).
  - **Semua layanan:** tanpa matriks. Tabel kategori per layanan (baris = layanan + labelnya, kolom = Pagi/Siang/Sore/Di luar jam/Belum diisi) dan ajakan "Pilih satu layanan untuk melihat pola per hari dan jam".
  - Kalimat batasan interpretasi (lihat Requirement).
  - Layanan Call/semua: kartu "Durasi panggilan" Singkat/Sedang/Panjang + penanda "< 1 menit perlu dicek".
  - Layanan email/CSO/BKO: status "Analisa jam tidak dipakai untuk layanan ini" + `reason` dari `SIDAK_TIME_SOURCE` — dibedakan tegas dari "belum diisi".
- **Mode QA**: section jam tidak tampil; catatan singkat "Jam hanya tersedia di mode Agent".
- **Detail agent → tab Heatmap**: komponen yang sama, ter-scope `agent_id`.
- **Input/edit**: field jam (`HH:MM`) berlabel sesuai layanan (mis. "Jam tiket dibuat") untuk layanan bersumber jam, field "Durasi" (`mm:ss`, disimpan sebagai detik) hanya untuk Call; keduanya disembunyikan untuk email, CSO, dan BKO. Template import menambah dua kolom opsional di akhir; template lama tetap terbaca.

### Hermes (VPS, di luar repo)

Perubahan dikerjakan di `~/.hermes/skills/productivity/qa-rekap-md/scripts/`, dengan backup `*.bak-pre-jam` sesuai kebiasaan folder itu. Semua penulisan prod butuh izin Fajar per run.

- **Baca sel mentah XLSX + format angkanya (numFmt)**, bukan teks gviz.
- **Semantik kolom H ditentukan layanan baris** (hasil routing prefix), bukan nama sheet. Contoh: baris QADATA di sheet CALL berisi jam (`0.6118` = 14:41), bukan durasi.
- Chat, pencatatan, SLIK → `jam_layanan`; call → `durasi_detik`.
- **Email, CSO, BKO:** kolom H tidak dibaca dan tidak ditulis; dry-run hanya menghitung jumlah barisnya sebagai "tidak dipakai".
- **Chat di luar jam operasional 07:45–16:50** (batas inklusif, konstanta di skrip Hermes), dibedakan menurut format tiket:
  - Tiket 13 digit `26\d{11}` → balasan komentar; jam disimpan apa adanya. Tidak dilaporkan sebagai salah.
  - Tiket lain (`L` + 10 digit, nomor HP, format lain) → bisa human error, chat masuk sebelum agent sempat logout, atau komentar. Tidak bisa dibedakan dari nilainya. Disimpan `NULL` + masuk laporan. **Tidak dikoreksi otomatis** (tidak menebak AM/PM).
  - Aturan ini hanya untuk baris yang di-routing ke layanan chat. Baris QADATA/RECEMAIL di sheet DIGITAL CHAT ikut layanan masing-masing.
  - Jalan keluar laporan: tim QA membetulkan jam di sheet (sync berikutnya mengisinya), atau Fajar menyatakan jamnya benar. Pernyataan "jam benar" disimpan Hermes di daftar `NO TEMUAN` yang dikonfirmasi (file di folder skrip, bukan tebakan), lalu jamnya ditulis apa adanya.
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

1. G1 selesai (2026-11-26) untuk semua layanan.
2. Migration diterapkan ke prod `ruosnjmtywcrghjgqugz` (izin eksplisit Fajar).
3. Push kode ke `main`.
4. Hermes sync harian diaktifkan dengan field baru.
5. Backfill per bulan: dry-run → review → `--apply` (izin per run).

## Tasklist

### Fase 0 — Persiapan (read-only)

- [x] Drift-check plan ini terhadap `main` (file dan skema di "Kondisi kode" masih sama).
- [x] Load `trainers-superapp-tdd`, `supabase-migration`; query Graphify untuk pemanggil `getSidakHeatmap`, `createTemuanBatch`, `updateTemuan`.
- [x] Hermes: tulis parser `parse_jam`/`parse_durasi` sebagai modul terpisah + mode dry-run laporan saja (tanpa tulis DB). Jalankan untuk Jan–Nov; simpan laporan di `~/.hermes/cache/scratch/`. Kirim daftar sel tak terbaca ke Fajar. (2026-11-26: `parse_waktu.py` + `jam_durasi_dryrun.py`; laporan `jam-durasi-dryrun-20261126T160455+0800.{json,md}`.)
- [x] Minta izin Fajar sebelum menambah/menjalankan unit test Python parser (aturan non-E2E AGENTS.md); bila disetujui, daftar semua failure mode dulu. (2026-11-26: Fajar mengizinkan. Failure mode didaftar dulu, lalu `scripts/test_parse_waktu.py` dan `scripts/test_sidak_rows.py` di Hermes: 57 test OK. Test menemukan bug `parse_dt`: `"32 Okt 2026"` menjadi `2026-10-32` dan angka besar membuat `OverflowError`. Diperbaiki atas izin Fajar menjadi fail closed (`None`). Test baru gagal di kode lama dan lulus di kode baru; dry-run sync Jan–Nov identik per bulan dengan pasca-cek final, jadi data prod tidak terdampak. Cara menjalankan dan risiko `date_key` yang tersisa dicatat di runbook Hermes `jam-durasi-kolom-h.md`.)

### Fase 1 — Schema & kontrak bersama

- [x] RED: E2E real-backend `sidak-temuan-time-db-guard.spec.ts` — insert langsung (jalur service-role seperti Hermes) dengan durasi pada chat, jam pada call/email/cso/bko, durasi negatif/≥86400 → ditolak; kombinasi valid → tersimpan.
- [x] Migration + rollback berpasangan; replay lokal bersih (`supabase db reset`) via skill `supabase-migration`.
- [x] `packages/types`: `jamSchema`, `durasiDetikSchema`, `temuanWaktuSchema`, `SIDAK_TIME_SOURCE`, bucket + `classifyJam`/`classifyDurasi`.
- [x] GREEN.

### Fase 2 — API CRUD

- [x] RED: `sidak-temuan-time-api-contract.spec.ts` — create/preview/update menerima & menyimpan jam/durasi; menolak `25:00`, `7.2`, `08:00 PM`, jam untuk call/email/cso/bko, durasi untuk non-call dengan pesan manusiawi; tanpa field → `NULL` (tidak ada default).
- [x] Mapping insert/update di `temuan-service.ts`; GREEN.

### Fase 3 — API time-profile

- [x] RED: `sidak-heatmap-time-profile-api.spec.ts`:
  - Batas bucket: 06:59 luar, 07:00 pagi, 10:59 pagi, 11:00 siang, 13:59 siang, 14:00 sore, 16:59 sore, 17:00 luar.
  - Batas durasi: 59 detik singkat + review, 299 singkat, 300 sedang, 899 sedang, 900 panjang.
  - `service_type` kosong → `hours = null`, `hoursByService` per layanan; data pencatatan + chat di jam yang sama tidak pernah dijumlah ke satu sel; `hoursByService` tidak memuat email/CSO/BKO.
  - `hours.label` sama dengan `SIDAK_TIME_SOURCE`.
  - Email/CSO/BKO: masuk `notApplicable`, tidak pernah `missingTime`.
  - Weekday Senin=1.
  - `count_by=tiket`.
  - `is_countable=false` dan phantom dikeluarkan.
  - `missingTime` vs `notApplicable` terpisah.
  - Filter bulan/folder/agent.
  - Leader hanya melihat timnya.
  - Query gagal → error.
- [x] Service + route; GREEN.

### Fase 4 — UI input/edit

- [x] RED: `sidak-temuan-time.spec.ts` — manual, import (template baru + template lama), dan edit inline/modal menyimpan jam/durasi; field tampil/tersembunyi sesuai layanan.
- [x] Implementasi hooks + komponen input; GREEN.

### Fase 5 — UI heatmap

- [x] `ui-ux-pro-max` untuk section jam & durasi (acceptance criteria, state kosong/NA/missing, mobile).
- [x] RED: `sidak-heatmap-time.spec.ts`:
  - Matriks + ringkasan persen tampil di mode Agent untuk satu layanan, dengan judul sesuai label layanan (chat: "Jam interaksi dimulai"; pencatatan: "Jam tiket dibuat").
  - "Semua layanan": tidak ada matriks; tabel kategori per layanan + ajakan memilih layanan.
  - Tersembunyi di mode QA.
  - Kartu durasi tampil untuk Call.
  - Status "analisa jam tidak dipakai" beserta alasannya untuk email, CSO, dan BKO.
  - Tab Heatmap detail agent ter-scope.
  - Kalimat batasan interpretasi ada.
- [x] Implementasi; GREEN; `impeccable` audit/polish; screenshot desktop + mobile, terang + gelap.

### Fase 6 — Integrasi & rilis

- [x] `thermo-nuclear` review; perbaiki temuan.
- [x] Root `pnpm typecheck`, `pnpm lint`, `pnpm build`; E2E fitur + regresi heatmap/tanggal yang ada (`sidak-heatmap*.spec.ts`, `sidak-temuan-dates*.spec.ts`, `sidak-temuan-import-dates.spec.ts`), satu run pada satu waktu.
- [x] Dokumentasi: kolom baru di `docs/database.md`, kontrak di `docs/modules.md`; entri `plans/README.md`.
- [x] **STOP —** minta izin Fajar → terapkan migration ke prod → verifikasi kolom/CHECK → baru push kode ke `main` (`push-ready`).

### Fase 7 — Hermes sync & backfill

- [x] Sync harian: tambah field, read-back; satu run dry-run lalu run nyata (izin Fajar).
  - 2026-11-26: `batch_sync_sidak.py` memakai `parse_waktu.decide_time()`; `jam_layanan,durasi_detik` masuk field default; extract tanpa `h_cell` ditolak fail-closed; NULL dari sheet tidak pernah menimpa nilai SIDAK.
  - Run nyata November 2026 dibatasi `--fields jam_layanan,durasi_detik --no-insert`: 451 patch.
  - Snapshot diff per id bersih (hanya dua kolom itu yang berubah), dry-run ulang `patch 0`, verifier jam/durasi `field mismatch 0`.
  - Sisa `GS-only 10` adalah insert chat yang sengaja ditahan.
  - Dokumentasi skill Hermes: `references/jam-durasi-kolom-h.md`.
  - Lanjutan 2026-11-26, sync penuh November (izin Fajar): `inserted 10, patched 5`, snapshot diff bersih. Hasil akhir 559/559 baris, verifier BERSIH, dry-run ulang `insert 0 / patch 0`.
- [x] Aturan urutan tanggal (keputusan Fajar 2026-11-26: tanggal layanan tidak pernah melebihi tanggal sampel QA).
  - Aturan ada di `parse_waktu.order_service_dates()` dan dipakai `batch_sync_sidak.py`: G > F dengan selisih ≤ 31 hari ditukar; selisih > 31 hari ditahan dan tanggal SIDAK dipertahankan. Semua baris dilaporkan di `date_report` plan.
  - November: 5 baris SIDAK ditukar.
  - Januari–Oktober (izin Fajar 2026-11-26): 216 baris SIDAK ditukar lewat `swap_service_dates.py` (plan di-pin, PATCH di-guard tanggal lama, read-back 0 mismatch, snapshot diff 10 periode bersih, dry-run ulang `swap 0`).
  - 6 baris dengan selisih > 31 hari diperbaiki satu per satu atas keputusan Fajar (2026-11-26):
    - 3 BKO Januari: tahun sampel 2025 → 2026.
    - 3 Agustus: D/M terbalik ditambah urutan → sampel 2026-08-10, layanan 2026-08-04.
  - Sesudahnya SQL prod menunjukkan 0 baris non-phantom dengan layanan > sampel.
  - `backfill-temuan-dates.py` belum memakai aturan ini.
- [ ] Cek laporan dry-run: 20 tiket chat di luar 07:45–16:50 tercatat `NULL` + laporan sesuai aturan; Jul 106 (berisi tanggal) diteruskan ke QA untuk diisi jamnya. Keduanya tidak menahan `--apply`.
- [x] Backfill per bulan Jan–Nov (pencatatan, chat, SLIK, call): dry-run → laporan (tingkat terbaca, sel ditolak) → `--apply` dengan izin per run → read-back penuh.
  - November selesai.
  - Dry-run Jan–Okt 2026-11-26 (scoped `batch_sync_sidak.py`): 3.495 dari 3.912 baris SIDAK terisi; 70 NULL + laporan; 347 tidak cocok kunci plan, 181 di antaranya di Januari (ekor Desember dan anomali tahun). 1 id Januari menerima dua nilai, jadi ditahan.
  - Apply Jan–Okt (izin Fajar 2026-11-26), per bulan dengan gate penuh: 3.494 id terisi. Gate per bulan: plan di-pin ke dry-run yang disetujui, `--no-insert`, snapshot diff per id bersih (0 field non-waktu berubah), dry-run ulang `patch 0`, dan verifier `field mismatch 0`. Kunci Januari yang bernilai ganda kini ditahan otomatis oleh guard `time_conflict` di sync.
  - Verifier bulan 01–09 tetap `ADA TEMUAN` karena insert yang dilewati dan baris SIDAK-only lama; Oktober BERSIH penuh.
- [x] Pencocokan per tiket untuk 347 baris SIDAK yang tidak cocok kunci sync (dry-run 2026-11-26, `match_time_by_ticket.py`).
  - Hasil: 268 usulan, 50 NULL karena aturan (call QADATA), 27 tiket tidak ada di sheet, 2 agent beda, 0 ambigu.
  - Refactor pendukung: pembacaan sel sheet dipindah ke `sidak_rows.py`, dipakai bersama sync dan matcher. Plan dry-run Jan–Nov byte-identik dengan sebelum refactor.
  - Apply (izin Fajar 2026-11-26) lewat `guarded_write.py`, bersama 6 perbaikan tanggal dan 8 insert. Satu plan ops dengan sha256 di-pin; PATCH di-guard nilai lama.
  - Hasil apply: 272 patch + 8 insert, read-back 0 mismatch, snapshot diff 10 periode bersih (8.302 → 8.310 baris). Pasca-cek: matcher `proposed 0`, swap tanggal `0/0`, dry-run sync hanya 8 insert itu yang menjadi skip.
- [x] Insert Januari–Juli yang dilewati sync (85 baris): hanya yang benar-benar baru yang masuk.
  - Cek lintas periode (tiket + peserta) menyisakan 8 dari 11 kandidat; 3 lainnya ternyata sudah ada di SIDAK dengan indikator atau layanan lain.
  - 77 baris tidak di-insert. Laporan pembandingnya (sheet vs SIDAK) ada di Hermes `fix-final/qa-report/`: 59 tiket sama dengan indikator/layanan beda (8 di antaranya satu baris sheet dengan 2+ indikator) dan 18 temuan sama di tiket lain.
  - Koreksi indikator menunggu QA dan Fajar. Diputuskan 2026-11-26 lewat sinkron teks/nilai di bawah.
- [x] Sinkron teks, nilai, dan indikator sheet → SIDAK Jan–Nov (keputusan Fajar 2026-11-26: sheet adalah sumber yang benar; konfirmasi bila ragu).
  - Semua lewat `guarded_write.py` dengan plan sha256 di-pin, PATCH di-guard nilai lama, read-back, dan snapshot diff 10 periode (semua BERSIH). Sinkron ini tidak menambah atau menghapus baris (8.312 sebelum dan sesudah).
  - 1.236 patch aman (teks/nilai/tanggal), 27 patch beda format saja (`<br>`, penomoran), 55 patch teks beda yang dikonfirmasi Fajar, 31 patch penyelesaian (18 baris ragu diikuti sheet apa adanya, 16 baris tiket placeholder: tiket SIDAK dipertahankan, sisanya ikut sheet), dan 2 patch rule version insert Gunawan Januari.
  - 1 patch salah sasaran (3f328335, dicocokkan oleh dua baris sheet) dikembalikan; cek tabrakan tidak menemukan kasus lain.
  - Tidak ditulis: 2 kunci yang di sheet berisi dua temuan untuk satu tiket+indikator (QACALL19012026C/20012026A pada L2601031800, QADC11062026F pada L2606027267). Unique index `uq_qa_temuan_duplicate_input` hanya mengizinkan satu temuan per tiket+indikator, jadi SIDAK mempertahankan satu baris (gabungan) dan QA perlu memutuskan. RECCSO09032026A: kolom sheet bergeser, indikator diterapkan, teks SIDAK dipertahankan.
  - `guarded_write.py` kini meng-encode filter URL, menangkap HTTP error tanpa kehilangan catatan eksekusi, dan menolak insert yang bentrok dengan unique index sebelum menulis.
  - `sidak_rows.extract_tiket` mengenali tiket Instagram 13 digit (`26MMDD` + 7 digit) setelah L/P dan OL/WI. Dengan begitu 9 baris chat Mar–Mei cocok dengan SIDAK, tidak lagi diusulkan insert.
  - `batch_sync_sidak.py` menahan kunci yang diklaim 2+ baris sheet berbeda isi (`key_conflict` di plan, tidak ditulis). Beda jam/durasi saja tetap ditangani `time_conflict`.
  - Bukti dua perubahan ini: dry-run Jan–Nov lama vs baru per entri tidak menunjukkan perbedaan selain yang diharapkan. Satu efek baru: baris SIDAK Juli d12f05c4 bertiket placeholder `QADC30062026I` (izin Fajar) dipatch ke tiket sheet `2606300000001`, BERSIH.
  - Pasca-cek final Jan–Nov: patch 1 (RECCSO09032026A, sengaja), key_conflict 2, dan insert 9. Kesembilan insert itu adalah baris sheet tanpa tiket yang temuannya sudah ada di SIDAK dengan tiket asli.
  - Sisa catatan: `backfill-temuan-dates.py` tetap memakai parser sendiri (perilakunya beda). Sync memilih rule version terbaru per layanan, bukan per periode.
- [x] Verifikasi di app: profil jam per layanan cocok dengan profiling awal (selisih hanya dari sel yang ditolak/diperbaiki).
  - Ditutup 2026-11-26 atas keputusan Fajar: acuan diganti ke profil sheet setelah aturan jam (angka profiling awal tidak bisa direproduksi), dan cek role selain admin dilewati.
  - Cek data 2026-11-26 (baca prod lewat API Hermes, belum lewat UI): 2.333 nilai jam (chat + pencatatan + SLIK) dengan sebaran pagi 38,36% / siang 31,80% / sore 29,19% / luar jam 0,64%, selisih ≤ 0,81 poin dari sheet setelah aturan. Durasi call 1.748 nilai, median 9:15 (singkat 11,96%, sedang 69,62%, panjang 18,42%).
  - Masih terbuka: angka profiling awal (2.561 jam, 1.379 durasi) tidak bisa direproduksi; profil ulang workbook memberi 2.958 dan 1.348. Ada baris sheet tanpa pasangan SIDAK (11 chat, 33 SLIK, 54 call) dan bobot call beda (1.276 baris sheet = 1.838 temuan prod). 3f328335 durasinya tetap NULL karena dua nilai sumber bertentangan. Tampilan UI per role belum dicek; E2E tidak boleh diarahkan ke prod.
  - Cek UI 2026-11-26 (akun admin Fajar, `/sidak/heatmap`, Semua layanan, 2026, dibuka lewat browser T3): setiap sel "Jam temuan per layanan" dan "Durasi panggilan" sama persis dengan hitungan ulang read-only dari prod memakai filter yang sama dengan endpoint (non-phantom, `is_countable`, `tanggal_layanan` 2026). Chat 719/646/562/4 (37 kosong), pencatatan 35/16/40/6 (1), SLIK 140/80/79/5 (1); call singkat 209, sedang 1.222, panjang 322, < 1 menit 8, kosong 99; total 5.381.
  - Role lain (leader/agent) belum dicek karena hanya akun admin yang tersedia di browser.

## STOP conditions

- Dry-run backfill menemukan baris yang tanggal kolom G-nya jelas tidak cocok dengan JAM kolom H (mis. pencatatan dengan jam tiket dibuat jauh setelah tanggal layanan) → laporkan ke Fajar sebelum `--apply` bulan itu.
- Tingkat terbaca kolom H untuk satu layanan < 90% pada dry-run → laporkan ke Fajar sebelum backfill layanan itu.
- Kegagalan E2E yang sama setelah tiga ronde perbaikan → berhenti dan bawa bukti (`docs/AGENT_WORKFLOW.md` §7).
- Penulisan ke Supabase prod (migration atau Hermes `--apply`) tanpa izin eksplisit Fajar untuk run itu → jangan dilakukan.

# Jam Layanan & Durasi Call di Heatmap SIDAK — Rencana Implementasi

- **Status:** rencana, belum dieksekusi. Dokumen ini bukan bukti implementasi atau hasil pengujian.
- **Tanggal rencana:** 2026-11-25; revisi 2026-11-26 (arti JAM semua layanan, kecocokan tanggal–jam, tanpa AHT, jam operasional chat, dan arti JAM email per petugas QA). **Baseline:** `03589fb2` (`main`).
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

| Aspek            | Ketentuan                                                                                                                                                                                                                                                                  | Dikonfirmasi |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Digital chat     | JAM = saat interaksi layanan **dimulai**                                                                                                                                                                                                                                   | 2026-11-25   |
| Email            | Arti JAM berbeda **per petugas QA**, bukan per tanggal: di November yang sama ada QA yang mengisi jam penugasan (distribusi leader ke agent) dan ada yang mengisi jam email dibalas. Sheet tidak mencatat petugas QA. SIDAK belum memakai JAM email (lihat Arti JAM email) | 2026-11-26   |
| CSO & pencatatan | JAM = saat **tiket layanan dibuat** (bukan saat layanan diterima, bukan saat QA sampling)                                                                                                                                                                                  | 2026-11-26   |
| Call             | DURASI **disimpan**; call tidak punya jam                                                                                                                                                                                                                                  | 2026-11-25   |
| BKO              | Tidak punya jam maupun durasi                                                                                                                                                                                                                                              | 2026-11-25   |
| Pencatatan       | Punya JAM (di sheet EMAIL & MIX)                                                                                                                                                                                                                                           | 2026-11-25   |
| Data lama        | Di-backfill dari sheet oleh Hermes; tanpa sumber jujur tetap `NULL`                                                                                                                                                                                                        | 2026-11-25   |
| SLIK             | JAM = jam layanan                                                                                                                                                                                                                                                          | 2026-11-26   |
| Tanggal & jam    | Tanggal kolom G dan JAM kolom H = hari dan peristiwa yang sama (email wajib selesai di hari yang sama)                                                                                                                                                                     | 2026-11-26   |
| Ambang durasi    | Tidak ada target AHT; ambang diambil dari sebaran data (lihat Kategori)                                                                                                                                                                                                    | 2026-11-26   |
| Jam chat         | Chat live beroperasi **07:45–16:50**. JAM chat di luar itu bisa human error (mis. AM/PM tertukar), chat yang masuk sebelum agent sempat logout, atau balasan komentar IG (asinkron)                                                                                        | 2026-11-26   |

Semua JAM adalah **peristiwa di sisi agent/layanan**, bukan jam kerja QA. Karena itu semuanya disimpan di satu kolom `jam_layanan` (sama seperti `tanggal_layanan` yang juga sudah berbeda makna per layanan), dengan arti per layanan dicatat di satu peta (`SIDAK_TIME_SOURCE`) dan di `COMMENT` kolom. Tidak perlu kolom `jam_sampel`.

### Arti JAM email (profil 2026-11-26)

Profil read-only 674 baris email (prefix QAEMAIL/RECEMAIL/QEMAIL) di sheet EMAIL & MIX Jan–Nov. Header kolom H selalu `JAM`, tanpa keterangan arti.

| Bulan   | n   | Median JAM  | % di 07–08 | % ≥ 12:00 |
| ------- | --- | ----------- | ---------- | --------- |
| Jan–Mei | 256 | 07:34–08:15 | 66–95      | 5–15      |
| Jun–Agu | 195 | 08:35–08:59 | 47–55      | 3–12      |
| Sep–Nov | 223 | 10:16–11:22 | 25–28      | 35–48     |

- Profil bulanan terlihat seperti pergeseran bertahap dari pagi ke sepanjang hari, tapi **itu bukan pergantian arti per tanggal**. QA mengonfirmasi (2026-11-26) bahwa di November masih ada satu QA yang mengisi jam penugasan dan satu QA lain yang mengisi jam dibalas. Pergeseran median kemungkinan besar mencerminkan porsi sampel tiap petugas.
- **Tidak ada kolom yang membedakan petugas QA.** Kolom tab email: No, NO TEMUAN, TL, NAMA (agent), identitas konsumen/tiket, TGL SAMPEL, TGL EMAIL, JAM, PARAMETER, dst. Huruf akhir NO TEMUAN (A, B, C, …) hanya nomor urut per tanggal. Prefix juga tidak cukup: QAEMAIL November sendiri masih campuran (24% di 07–08, 47% ≥ 12:00); RECEMAIL cenderung pagi (median 07:31–09:16 di Sep–Nov) tapi tidak dikonfirmasi milik satu petugas.
- Jadi untuk satu baris email, arti JAM-nya **tidak bisa ditentukan dari sheet**. Menebak dari nilai jam (pagi = distribusi) akan salah untuk email yang memang dibalas pagi.
- Okt–Nov ada 19 email bernilai 05:xx–06:xx; penyebabnya belum diketahui.

**Keputusan rancangan (rekomendasi, menunggu E1):**

- SIDAK memakai satu arti saja untuk email: **jam email dibalas**. Itu yang dekat dengan saat kesalahan dibuat; jam penugasan hanya mencerminkan jadwal pembagian.
- **Data email yang sudah ada (Jan–Nov 2026) tidak diberi jam sama sekali**, karena artinya tidak bisa dipisahkan per baris. Heatmap email tampil "Jam tidak tersedia — JAM email belum seragam di sheet QA", bukan "belum diisi".
- JAM email baru dipakai setelah QA sepakat **semua petugas** mengisi jam dibalas mulai satu tanggal. Tanggal itu masuk `validFrom` di `SIDAK_TIME_SOURCE`. Selama `validFrom` belum diisi (`null`), Hermes tidak menulis jam email, input manual/import menolak jam email dengan pesan manusiawi, dan agregasi API mengabaikan jam email yang terlanjur ada.
- Alternatif kalau QA tetap butuh dua arti: tambah kolom penanda di sheet (mis. `JENIS JAM` = penugasan/dibalas, atau nama petugas QA) dan Hermes hanya mengambil baris "dibalas". Ini mengubah format sheet dan parser, jadi dipilih hanya kalau penyeragaman tidak bisa.

### Yang masih perlu dipastikan

| ID  | Hal                                                                                                                                     | Sampai dipastikan                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| E1  | QA bersedia menyeragamkan JAM email = jam dibalas untuk semua petugas, dan mulai tanggal berapa (atau memilih alternatif kolom penanda) | `validFrom` = `null`: email tanpa jam                                                                |
| E2  | 19 JAM email 05:xx–06:xx di Okt–Nov: email memang dibalas sebelum shift, atau salah input                                               | Tidak relevan selama E1 belum dijawab (data lama tidak dipakai)                                      |
| E3  | Arti JAM CSO & pencatatan sama untuk semua petugas QA atau tidak                                                                        | Dianggap seragam "tiket dibuat" (profil non-email konsisten siang–sore); perlu satu konfirmasi ke QA |

### Cek jam chat di luar jam operasional

Sheet DIGITAL CHAT Jan–Nov, dicek 2026-11-26 (read-only lewat Google Sheets). Dari 1.661 baris ber-JAM, 1.580 baris berprefix chat (QADC/RECDC/OADC/REDC); sisanya (QADATA, RECEMAIL) ikut layanan hasil routing-nya, bukan aturan chat.

- **Penanda balasan komentar = format tiket.** Tidak ada kolom kanal. Tiket `L` + 10 digit tidak pernah memuat template komentar. Semua tiket 13 digit (`26MMDD` + 7 digit urutan) memuat template balasan komentar/DM di kolom KETIDAKSESUAIAN/SEBAIKNYA. Prefix NO TEMUAN tidak membedakan kanal. Keyakinan: sedang (penandanya baru terlihat di 10 baris, tapi tiap baris punya dua tanda yang sama-sama mengarah ke komentar).
- **Di luar 07:45–16:50 ada 27 baris chat:**
  - 6 bertiket 13 digit (Mar 73, Mar 114, Apr 82, Mei 35, Mei 60, Jul 10) → balasan komentar; jam disimpan.
  - 20 bertiket `L` atau berisi nomor HP, tanpa penanda komentar → ditahan untuk dicek. Rinciannya: 14 di malam hari (10 di Januari, hampir semua `11:xx PM` / `12:xx AM`, pola khas AM/PM tertukar), 5 pagi 07:15–07:41 (semua Maret), dan Jan 124 (kolom E berisi nomor HP).
  - 1 tidak terbaca (Jul 106 berisi tanggal, bukan jam).
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
- Arti JAM berbeda per layanan: chat = interaksi dimulai; email = email dibalas agent (hanya sejak `validFrom`, yang belum ditetapkan); CSO & pencatatan = tiket layanan dibuat. Label section dan kalimat penjelas mengikuti layanan yang dipilih.
- Email: hanya temuan sejak `validFrom` yang punya jam. Selama `validFrom` belum ada, section jam email menampilkan alasan tidak tersedia; setelah ada, UI menyebut periode itu supaya rentang tahun penuh tidak dibaca sebagai profil Jan–Des.
- CSO & pencatatan: jam tiket dibuat dekat dengan saat agent mencatat/menginput, jadi paling dekat ke jam terjadinya kesalahan input; tetap bukan jam terima layanan.
- Tidak ada matriks gabungan lintas layanan: peristiwanya berbeda, jadi menjumlahkannya ke satu sel jam menyesatkan. Untuk "Semua layanan" hanya tampil tabel kategori per layanan (lihat UI).
- Distribusi durasi hanya mencakup call **yang punya temuan**, bukan seluruh call.

### Di luar scope

- Korelasi dengan Jadwal Shifting (jam ke-N dalam shift) — kandidat fase lanjutan.
- Analisis AI atas pola jam/durasi.
- Mengubah skor, ranking, periode audit, phantom padding, atau format ekspor agent yang terkunci.
- Jam untuk call (tidak ada sumbernya) dan BKO.

## Design

### Gerbang G1 — konfirmasi arti JAM

- **Email, CSO, pencatatan: SELESAI (2026-11-26).** Ketiganya peristiwa sisi layanan (email dibalas / tiket dibuat), jadi masuk `jam_layanan`. Tidak ada `jam_sampel`. Email memakai `validFrom` (lihat Arti JAM email); tanggalnya E1 dan masih kosong, karena arti JAM email berbeda per petugas QA.
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
  ADD CONSTRAINT qa_temuan_jam_layanan_not_call_bko
    CHECK (jam_layanan IS NULL OR service_type NOT IN ('call', 'bko'));

COMMENT ON COLUMN public.qa_temuan.jam_layanan IS
  'Jam dinding WIB peristiwa sisi layanan; arti per service_type: chat = interaksi dimulai, email = email dibalas agent (hanya sejak tanggal validFrom di SIDAK_TIME_SOURCE; data sebelum itu tidak berjam karena arti per petugas QA tidak seragam), cso/pencatatan = tiket layanan dibuat, slik = jam layanan. Peta resmi: SIDAK_TIME_SOURCE di packages/types.';
COMMENT ON COLUMN public.qa_temuan.durasi_detik IS
  'Durasi panggilan Call dalam detik; hanya untuk service_type = call.';
```

- `time(0)` jam dinding WIB tanpa zona — sengaja bukan `timestamptz` supaya tidak ada geser zona waktu; detik dibuang (heatmap per jam).
- Tanpa DEFAULT, tanpa backfill di migration; `NULL` = belum diisi. `created_at` tidak pernah dipakai sebagai pengganti.
- CHECK membuat salah tulis Hermes (durasi ke chat, jam ke call/bko) mustahil, bukan sekadar dilarang di dokumen.
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
    | { kind: "none" };

  export const SIDAK_TIME_SOURCE: Record<ServiceType, SidakTimeSource> = {
    chat: {
      kind: "jam",
      label: "Jam interaksi dimulai",
      meaning: "saat interaksi chat dimulai",
    },
    email: {
      kind: "jam",
      label: "Jam email dibalas",
      meaning: "saat agent membalas email",
      validFrom: null, // E1: diisi tanggal QA mulai seragam mengisi jam dibalas; null = email tanpa jam
    },
    cso: {
      kind: "jam",
      label: "Jam tiket dibuat",
      meaning: "saat tiket layanan dibuat",
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
    bko: { kind: "none" },
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
    } | null; // null bila service_type kosong (semua) atau layanan tanpa jam (call/bko)
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
    notApplicable: number; // temuan bko (dan call untuk bagian jam) — "tidak punya data jam", BUKAN "belum diisi"
  }
  ```
- Aturan agregasi sama dengan heatmap tanggal: hanya `is_countable`, phantom padding dikeluarkan, `count_by=tiket` = distinct `no_tiket` per sel (baris tanpa tiket dihitung per baris), paging `fetchAllPages` + `order("id")`, kegagalan query = error (bukan profil kosong), admin/trainer memakai user JWT, leader memakai service-role + `applyScope`. Weekday dihitung dari `tanggal_layanan` (baris tanpa tanggal tidak masuk sel maupun `missingTime`, karena di luar filter tahun). Sel hari × jam **tidak pernah** menjumlahkan layanan berbeda; tanpa `service_type` API hanya mengembalikan `hoursByService`.

### UI

Jalankan `ui-ux-pro-max` sebelum implementasi dan `impeccable` audit/polish sebelum gerbang akhir.

- `/sidak/heatmap`, **mode Agent**: section baru di bawah kalender; judulnya label layanan dari `SIDAK_TIME_SOURCE` (mis. "Jam email dibalas", "Jam tiket dibuat"), bukan "Jam layanan" generik.
  - **Satu layanan dipilih (chat/email/CSO/pencatatan/SLIK):** matriks Senin–Minggu × kolom `<07`, `07`…`16`, `≥17` (dua kolom tepi menampung jam di luar operasional) + ringkasan Pagi/Siang/Sore/Di luar jam (jumlah + persen, rentang jam tertulis) + kalimat arti JAM layanan itu (`meaning`).
  - **Semua layanan:** tanpa matriks. Tabel kategori per layanan (baris = layanan + labelnya, kolom = Pagi/Siang/Sore/Di luar jam/Belum diisi) dan ajakan "Pilih satu layanan untuk melihat pola per hari dan jam".
  - Kalimat batasan interpretasi (lihat Requirement), termasuk periode berlaku jam email.
  - Layanan Call/semua: kartu "Durasi panggilan" Singkat/Sedang/Panjang + penanda "< 1 menit perlu dicek".
  - Layanan BKO: status "Layanan ini tidak punya data jam/durasi" — dibedakan tegas dari "belum diisi".
- **Mode QA**: section jam tidak tampil; catatan singkat "Jam hanya tersedia di mode Agent".
- **Detail agent → tab Heatmap**: komponen yang sama, ter-scope `agent_id`.
- **Input/edit**: field jam (`HH:MM`) berlabel sesuai layanan (mis. "Jam tiket dibuat") untuk layanan bersumber jam, field "Durasi" (`mm:ss`, disimpan sebagai detik) hanya untuk Call; keduanya disembunyikan untuk BKO. Template import menambah dua kolom opsional di akhir; template lama tetap terbaca.

### Hermes (VPS, di luar repo)

Perubahan dikerjakan di `~/.hermes/skills/productivity/qa-rekap-md/scripts/`, dengan backup `*.bak-pre-jam` sesuai kebiasaan folder itu. Semua penulisan prod butuh izin Fajar per run.

- **Baca sel mentah XLSX + format angkanya (numFmt)**, bukan teks gviz.
- **Semantik kolom H ditentukan layanan baris** (hasil routing prefix), bukan nama sheet. Contoh: baris QADATA di sheet CALL berisi jam (`0.6118` = 14:41), bukan durasi.
- Email, CSO, pencatatan, chat, SLIK → `jam_layanan`; call → `durasi_detik`.
- **Email sebelum `validFrom` (atau selama `validFrom` = `null`):** tidak ditulis (`NULL`), dicatat di laporan sebagai "arti belum seragam", bukan sebagai sel tak terbaca. Hermes membaca `validFrom` dari satu konstanta yang sama nilainya dengan `packages/types` (dicek di laporan dry-run).
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
  - `service_type` kosong → `hours = null`, `hoursByService` per layanan; data email + chat di jam yang sama tidak pernah dijumlah ke satu sel.
  - `hours.label` sama dengan `SIDAK_TIME_SOURCE`.
  - Email: jam pada temuan dengan `tanggal_layanan` sebelum `validFrom` (atau semua email selama `validFrom` = `null`) tidak masuk sel/kategori dan dihitung terpisah sebagai "tidak tersedia", bukan `missingTime`.
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
  - Matriks + ringkasan persen tampil di mode Agent untuk satu layanan, dengan judul sesuai label layanan (email: "Jam email dibalas"; CSO: "Jam tiket dibuat").
  - "Semua layanan": tidak ada matriks; tabel kategori per layanan + ajakan memilih layanan.
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
- [ ] **STOP —** minta izin Fajar → terapkan migration ke prod → verifikasi kolom/CHECK → baru push kode ke `main` (`push-ready`).

### Fase 7 — Hermes sync & backfill

- [ ] Sync harian: tambah field, read-back; satu run dry-run lalu run nyata (izin Fajar).
- [ ] Pastikan 20 tiket chat di luar 07:45–16:50 (daftar di laporan dry-run) sudah dibetulkan di sheet atau dikonfirmasi benar.
- [ ] E1 dijawab (QA sepakat seragam + tanggal mulai, atau pilih kolom penanda). Sampai itu, backfill tidak menyentuh jam email.
- [ ] Backfill per bulan Jan–Nov (email hanya sejak `validFrom`, CSO, pencatatan, chat, SLIK, call): dry-run → laporan (tingkat terbaca, sel ditolak) → `--apply` dengan izin per run → read-back penuh.
- [ ] Verifikasi di app: profil jam per layanan cocok dengan profiling awal (selisih hanya dari sel yang ditolak/diperbaiki).

## STOP conditions

- Dry-run backfill menemukan baris yang tanggal kolom G-nya jelas tidak cocok dengan JAM kolom H (mis. setelah `validFrom`, email masih menumpuk di jam penugasan pagi; tanda ada petugas yang belum ikut seragam) → laporkan ke Fajar sebelum `--apply` bulan itu.
- Tingkat terbaca kolom H untuk satu layanan < 90% pada dry-run → laporkan ke Fajar sebelum backfill layanan itu.
- Kegagalan E2E yang sama setelah tiga ronde perbaikan → berhenti dan bawa bukti (`docs/AGENT_WORKFLOW.md` §7).
- Penulisan ke Supabase prod (migration atau Hermes `--apply`) tanpa izin eksplisit Fajar untuk run itu → jangan dilakukan.

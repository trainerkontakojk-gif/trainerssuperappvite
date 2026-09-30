# Jadwal Shifting SIDAK

**Status:** perubahan lokal mengalihkan adapter ke Supabase PostgREST read-only, server-side, memakai URL/key backend dan exact-origin allowlist tanpa redirect. E2E API lokal 35/35 lulus dengan key sintetis/stub; tidak ada probe live oleh adapter baru. Zona waktu `Asia/Jakarta` terkonfirmasi. Produksi **NO-GO** sampai pemilik menyetujui jenis/izin key, kebijakan akses/RLS dan runtime env, lalu role smoke test pada environment target diverifikasi. Tidak ada row jadwal mentah atau credential yang disimpan di repo/fixture.

## Requirement

Buat laman operasional read-only di SIDAK untuk melihat jadwal shifting agen dari WFM Dash Pro.

**Fakta terverifikasi**

- Login kustom WFM melalui `google.script.run.checkLogin(username, password)` berhasil pada uji terbatas. Slot username/password tersedia di vault; nilai tidak dicetak atau disimpan.
- Fajar mengizinkan pembacaan jadwal WFM yang diperlukan secara read-only; data baris tidak boleh dicetak ke chat atau disimpan sebagai fixture/artefak. Pada 29 September 2026, request langsung ke host Supabase WFM membaca 78 baris untuk satu tanggal; isi jadwal tidak dimasukkan ke repo/fixture.
- Fajar menetapkan MVP hanya untuk role `admin` dan `trainer`; leader dan agent tidak termasuk.
- Sumber Apps Script yang diberikan menunjukkan `getScheduleFromSupabase(dateStr, channel)` sudah membaca tabel Supabase, sementara file yang diperiksa tidak menunjukkan handler `doPost(e)`. Request langsung Supabase untuk satu tanggal berhasil; adapter Node lama yang mencoba POST `f.req` gagal `WFM_INVALID_RESPONSE`. Ganti adapter ke direct PostgREST; tidak perlu meminta pemilik WFM mencari `f.req` atau membagikan ulang credential.

**Hasil yang diminta**

- Halaman native SIDAK—nama dan route sementara: **Jadwal Shifting**, `/sidak/jadwal-shifting`.
- Menampilkan jadwal untuk pengguna ber-role `admin` atau `trainer` saja, dengan status memuat, kosong, gagal, dan data terakhir diperbarui. Tidak ada scope per-agent dalam MVP.
- Tidak ada operasi tulis, sinkronisasi ke database Trainers, atau pemanggilan AI dalam MVP.

**Kriteria penerimaan**

- Akses dibatasi pada navigasi, route frontend, dan API backend; backend memverifikasi role `admin`/`trainer` sebelum query. Jangan menambah role lain atau scope per-agent.
- Browser hanya memanggil API Trainers dan tidak menerima credential WFM/Supabase atau mengakses sumber WFM langsung.
- Respons hanya berisi field yang disetujui; error upstream tidak disamarkan sebagai jadwal kosong.
- Tampilan responsif dan aksesibel, termasuk shift yang melintasi tengah malam.
- Probe browser berhasil membaca row untuk tanggal uji; transport adapter server-side dan verifikasi lingkungan produksi tetap gate sebelum rilis.

**Keputusan yang harus ditutup sebelum implementasi**

| Keputusan                      | Status / keputusan                                                                                                                                                                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role                           | **Disetujui:** admin dan trainer saja untuk MVP. Leader/agent tidak termasuk; jangan menambahkan role lain tanpa persetujuan Fajar.                                                                                                                        |
| Rentang tanggal dan zona waktu | Tanggal eksplisit tetap dapat dipakai tanpa konfigurasi zona waktu; jika tanggal tidak dikirim, backend gagal tertutup kecuali `WFM_SCHEDULE_TIMEZONE` valid. Zona `Asia/Jakarta` telah dikonfirmasi; env runtime tetap perlu diisi untuk tanggal default. |
| Filter channel/shift           | Tambahkan hanya setelah enum dan hak akses sumber diverifikasi.                                                                                                                                                                                            |
| Swap dan alasan aktivitas      | Di luar MVP.                                                                                                                                                                                                                                               |
| Refresh/cache                  | Mulai dengan refresh manual. Tambahkan cache hanya jika perlu dan pisahkan berdasarkan cakupan akses.                                                                                                                                                      |
| Jalur integrasi                | Supabase REST langsung sudah berhasil dibaca untuk satu tanggal dengan key server-side yang tersedia. Adapter Node diganti agar memakai jalur yang sama; E2E lokal harus membuktikan allowlist, header server-only, batas query, dan kegagalan tertutup.   |

## Design

**Batas integrasi yang disarankan**

1. Backend memanggil Supabase PostgREST langsung dengan `WFM_SCHEDULE_SUPABASE_URL` dan `WFM_SCHEDULE_SUPABASE_KEY`; origin harus cocok persis dengan `WFM_SCHEDULE_API_ALLOWED_ORIGINS` sebelum key dikirim. Apps Script `/exec`, `checkLogin`, dan `f.req` bukan lagi bagian jalur adapter.
2. Ambil hanya field yang diperlukan, satu tanggal, satu tabel, tanpa pagination ke belakang. Jangan query tabel users, reasons, swaps, atau lightweight data. Kegagalan upstream harus menjadi state error, bukan jadwal kosong.
3. Tidak ada key di browser, query string, log, repo, atau fixture. Local E2E memakai key sintetis dan host loopback; tidak ada request WFM live saat verifikasi kode ini.
4. Produksi tetap NO-GO sampai secret server-only dipasang pada service API, izin/RLS cocok dengan akses jadwal read-only, dan smoke test role admin/trainer lolos pada environment target.

Jangan letakkan credential di bundle Vite, browser, query string, log, atau test fixture. Hermes vault lokal tidak otomatis tersedia di runtime produksi; jika jalur data terbukti valid, gunakan secret runtime backend tanpa meminta Fajar mengirim ulang atau menampilkan nilai rahasia. Jangan menyimpan data jadwal di database Trainers untuk MVP.

API yang diusulkan: `GET /api/v1/sidak/jadwal-shifting` dengan parameter tanggal tervalidasi dan batas rentang. Otorisasi role `admin`/`trainer` harus selesai sebelum adapter memanggil sumber. Field jadwal terverifikasi: `nama`, `tl`, `shift`, `shift_prev`, `activities`, `date`, `channel`; pilih proyeksi minimum yang UI perlukan. Jangan menyertakan NIK, user WFM, konfigurasi sistem, alasan aktivitas, atau swap. Sertakan timestamp `asOf`; bila cache digunakan, TTL pendek dan kunci cache wajib menyertakan scope.

Gunakan komponen/token SIDAK yang ada—termasuk pola status `QaStatePanel`—dan hindari pola landing pemasaran. Ikuti desain serta konvensi navigasi yang sudah ada. Lokasi perubahan yang diperkirakan:

- API: `apps/api/src/services/sidak/wfm-schedule.ts`, `apps/api/src/routes/sidak/jadwal-shifting.ts`, registrasi di `apps/api/src/routes/sidak.ts`.
- Web: `apps/web/src/routes/sidak/jadwal-shifting.tsx`, route guard di `apps/web/src/router.tsx`, menu/breadcrumb di `apps/web/src/components/layout/nav-config.ts`, serta tautan beranda `apps/web/src/routes/sidak/index.tsx` bila sesuai pola.
- Periksa kebutuhan tipe/Hono client di `packages/types` dan `apps/web/src/lib/api/rpc-client.ts`; pertahankan kontrak typed, jangan memperluas `any`.
- Dokumentasi bila kontrak/arsitektur berubah: `docs/modules.md`, `docs/architecture.md`, dan `docs/auth-rbac.md` sesuai dampaknya.

## Gate checkpoint — 2026-09-28

- OpenCode sebelumnya hanya menjalankan `plan` read-only dan memberi verdict **NO-GO** sebelum Fajar mengizinkan pembacaan row dan menetapkan role MVP. Discovery read-only kini terotorisasi dan implementasi MVP sudah ada; NO-GO produksi tetap berlaku untuk gate di bawah.
- Fajar secara eksplisit mengizinkan pembacaan jadwal WFM yang diperlukan dan menetapkan role MVP `admin` + `trainer` saja. Leader/agent dan scope per-agent tidak termasuk; jangan meminta akses console Supabase, endpoint baru, atau credential ulang.
- Dari browser, login WFM dan `getSystemSettingsServer()` berhasil. Satu GET ber-proyeksi allowlist ke `wfm_schedules` untuk tanggal `2026-09-28` menghasilkan HTTP 200 JSON dan 78 row di empat channel. Schema: `nama`, `tl`, `shift`, `shift_prev`, `activities`, `date`, `channel`; tidak ada row yang kehilangan field minimum. Isi row tidak dicetak atau disimpan. Ini bukan bukti transport server-side Node.
- `activities` berupa object; agregat tanggal uji menunjukkan 66 object dengan key numerik dan 12 object kosong/array-like, dengan nilai string. Scraper referensi WFM memetakan index ke interval 15 menit, tetapi jangan lakukan konversi timezone tanpa dasar.
- Format key yang tersedia sebelumnya tampak seperti publishable-prefix, tetapi jenis key dan izin efektifnya belum dikonfirmasi oleh pemilik; jangan menganggapnya otomatis disetujui untuk runtime baru. Query satu tanggal hanya membuktikan akses pada tanggal uji, bukan seluruh histori, RLS antar-identitas, atau izin produksi.
- Probe zero-row sebelumnya dan review OpenCode sebelumnya adalah bukti historis pre-authorization; hasil query row di atas yang menjadi bukti terbaru. Artefak lama dari scraper di scratch tidak dibuka atau digunakan.
- Hasil live probe yang dipertahankan hanya agregat/schema aman. Tidak ada data row jadwal atau credential yang ditulis ke repo/fixture/log/chat.

## Tasklist

- [x] Implementasi MVP read-only sesuai keputusan Fajar: hanya admin/trainer; tidak ada role tambahan atau mapping per-agent.
- [x] Tambahkan konfigurasi WFM server-only tanpa secret literal dan dokumentasikan penempatan env backend.
- [x] Tulis E2E RED lalu GREEN pada fixture sintetis lokal/test-only: role allow/deny, deep link, tanggal, kosong, error, shift lintas hari, akses browser, dan tidak ada operasi tulis.
- [x] Ganti transport Apps Script POST `f.req` menjadi direct Supabase PostgREST dengan URL/key server-only; pertahankan validasi tanggal/field, batas hasil, timeout, redaksi log, allowlist dan role fail-closed. Verifikasi live adapter tetap belum dilakukan.
- [x] Implement route Hono typed dan kontrak respons allowlist; role admin/trainer diverifikasi sebelum adapter dijalankan.
- [x] Implement halaman, route guard, navigasi desktop/mobile, breadcrumb, filter tanggal, dan state loading/empty/error/stale.
- [x] E2E lokal pasca-adapter lulus: API 35/35 dan UI 20/20 dengan stub/fixture sintetis; key palsu saja.
- [x] Perbarui dokumentasi kanonik: direct Supabase server-only env; origin exact di-allowlist sebelum key dikirim; redirect ditolak; timezone `Asia/Jakarta` tercatat.
- [x] Buktikan satu tanggal dapat dibaca langsung dari Supabase dengan key yang tersimpan aman; ini bukan smoke test adapter Node atau verifikasi produksi.
- [x] Implementasikan allowlist exact origin `WFM_SCHEDULE_API_ALLOWED_ORIGINS` dan uji origin mismatch/redirect dengan stub lokal. Env aktual pada service API belum diisi atau diverifikasi.
- [ ] Set secret/env pada service API dan smoke-test akses `admin` + `trainer` pada environment target sebelum rilis.

**E2E yang dijalankan:** API spec **35 passed** dan UI spec **20 passed** dengan config sementara tanpa `webServer` agar command tidak memulai root `pnpm dev`; target Vite lokal `http://localhost:3005` lolos preflight, UI memakai mock API, dan router API memakai stub WFM loopback + fixture sintetis. Cakupan membuktikan URL di luar origin allowlist ditolak sebelum key/query dikirim, redirect PostgREST tidak diikuti, key hanya dipasang pada header ke stub, dan kegagalan upstream tidak bocor ke log/respons. Tidak ada live WFM/Supabase atau row jadwal mentah yang dipakai dalam E2E ini.

**Rollback:** nonaktifkan route/menu dan cabut secret/identitas integrasi. MVP tidak memigrasikan atau menyimpan jadwal di database Trainers.

**Production NO-GO:** adapter direct Supabase belum selesai diverifikasi; origin allowlist dan env aktual service API belum diverifikasi pada target deployment; secret dan otorisasi role produksi juga belum diverifikasi. Probe 29 September 2026 membuktikan satu request langsung memakai key yang tersedia dapat membaca jadwal untuk satu tanggal, tetapi bukan smoke test adapter Node, seluruh histori, atau perilaku RLS untuk identitas lain. Tidak ada production deploy, perubahan konfigurasi service API, atau live probe baru yang dilakukan untuk perubahan adapter ini.

## Dua format tampilan — 2026-09-29

Permintaan: satu halaman, dua format.

1. **Hari ini** — daftar siapa **masuk** dan **libur**, dengan pilihan bagian layanan:
   `Semua layanan`, `Call`, `Digital Chat`, `Email`, `Leader`.
   `shift` kosong atau `OFF`/`LIBUR` = libur; nilai lain = masuk.
   Detail jadwal harian (tabel + `activities`) tetap ada sebagai panel penjelas.
2. **Kalender** — MATRIKS agen × hari, satu bulan penuh. Barisnya agent
   (nama + team leader), kolomnya tanggal-tanggal bulan terpilih, tiap sel berisi
   kode shift apa adanya dari WFM, dan kolom kanan menghitung rekap per agen.
   toolbar: navigasi bulan, pencarian nama, dan pilihan bagian layanan.

   Matriks (bukan grid tanggal 7 kolom) dipilih karena data WFM adalah satu baris
   per (agen, tanggal). Grid tanggal hanya bisa menampilkan jumlah per hari, jadi
   nama orang dan kode shift-nya hilang — padahal justru itu yang dicari saat
   bikin jadwal. Matriks juga membuat pola mingguan tiap orang terbaca sekilas.

Desain:

- Switcher memakai `Tabs` yang sudah disetujui (`role="tab"`, `aria-selected`),
  URL membawa `?view=calendar` dan `?month=YYYY-MM`; format `date` tetap
  `YYYY-MM-DD`. Nilai default tidak ditulis ke URL.
- Endpoint baru `GET /api/v1/sidak/jadwal-shifting/month?month=YYYY-MM`
  (hanya-baca, `admin`/`trainer`): `dates=gte.&lte.`, maksimal 31 hari, proyeksi
  minimum `nama,tl,channel,shift,date` — tanpa `activities`/`shiftPrev`.
  Respons `JadwalShiftingMonthResponse`: `from,to,month,rows,total,truncated,channels,asOf`.
- Batas bulanan terpisah `WFM_SCHEDULE_MAX_MONTH_ROWS` (default 3000) dengan
  kontrak `truncated` yang sama; bulan di luar jendela `MAX_DATE_OFFSET_DAYS`
  ditolak `400` sebelum query.
- Pencarian harian difilter klien per bagian; halaman hanya membaca `search.date`
  saat format harian aktif sehingga perubahan `channel` tidak memicu query baru.
- Respons bulanan difilter klien per bagian (kontrak API per-permintaan tidak
  dipecah per bagian), lalu difilter lagi per nama agen. Baris matriks dan rekap
  dihitung ulang dari baris yang benar-benar lolos dua filter itu, sehingga
  angka pada layar tidak pernah memakai agregat bagian lain.
- Struktur kolom matriks:
  - Kolom identitas (nama + TL) `sticky left-0`, header sticky di atas.
  - Rekap **satu** `<td>` berisi empat angka, **tidak** sticky.
  - Alasannya: empat `<td>` sticky `right-0` menumpuk pada offset yang tidak
    menambah lebar tabel sehingga judulnya saling menutupi, dan satu blok
    sticky selebar 10rem menutupi tanggal terakhir saat tabel digulir ke ujung.
    Rekap berada di ujung tabel, jadi mengikutinya saat scroll adalah perilaku
    yang wajar — yang wajib selalu terlihat adalah identitas dan header.
- `TBCCI` ikut terhitung hari kerja (kodenya berarti jadwal kerja, bukan hari
  tanpa duty). Kode yang tidak dikenal tetap ditampilkan utuh dan hanya diberi
  warna netral — tidak boleh dianggap libur, karena menyembunyikan kode shift
  yang tak dikenal justru menghilangkan informasi yang paling perlu dilihat.

Verifikasi: TDD. Spec baru dijalankan lebih dulu (RED 25 gagal / 56 lulus),
lalu implementasi (GREEN 25 + 56 lulus), ditambah typecheck web/API/telefun,
lint, build, Prettier, dan `git diff --check` (file yang dimodifikasi saja).

## Hari ini — jam kerja dan interval istirahat

### Requirement

- Khusus format **Hari ini**, tampilkan jam mulai, interval istirahat, dan jam pulang. Format kalender bulanan tidak berubah.
- Jam mulai/pulang berasal dari mapping kode shift yang disediakan Fajar: H 07:45–16:50; S1 06:00–15:00; S2 08:00–17:00; S3 13:00–22:00; S4 22:00–07:00.
- Interval istirahat berasal dari `wfm_schedules.activities`: nilai `LB` berarti Long Break. Slot bersebelahan digabung menjadi rentang waktu; satu slot bernilai 15 menit.
- Jika tidak ada interval `LB`, tampilkan `—`; jangan mengarang jam istirahat. Jadwal OFF/CUTI/kode shift tanpa mapping tidak diberi jam kerja buatan.

### Design

- Probe read-only API live 2026-09-29: 78 row; 260 slot berisi kode `LB`. Penggabungan slot pada data menghasilkan rentang Long Break; dashboard WFM pada gambar referensi menampilkan label `Long Break`.
- Render ringkas tiga bidang `Mulai`, `Istirahat`, `Pulang`; jangan tampilkan kode mentah `LB` atau buat kartu/badge baru.

### Tasklist

- [x] Tambah E2E RED untuk fallback shift H tanpa activities dan verifikasi jam untuk H/S1/S2/S3/S4.
- [x] Tambah E2E RED untuk menggabungkan slot `LB` berurutan menjadi interval istirahat.
- [x] Implementasikan tampilan tiga bidang pada format harian saja.
- [x] Jalankan focused E2E, typecheck, lint, build, format, diff-check, dan inspeksi tampilan.

## Urutan daftar harian — layanan → team leader (2026-09-30; superseded)

Bagian ini mencatat keputusan historis yang kemudian digantikan oleh revisi
pemilik di bawah: **Hari ini hanya memakai tabel detail**, tanpa daftar Masuk/Libur
dan tanpa subjudul layanan/TL.

1. Kelompokkan **per team leader**, nama agen urut A–Z di dalamnya.
2. Lalu tambah **pengelompokan per layanan** sebagai tingkat TERATAS:
   **Layanan → TL → nama A–Z**. Header layanan tetap tampil walau filter sudah
   memilih satu bagian ("konsisten, tidak berubah-ubah").

Format **Kalender tetap A–Z** dan tidak disentuh.

- Urutan bagian layanan mengikuti `SCHEDULE_SECTIONS` (Call → Digital Chat →
  Email → Leader), bukan urutan kedatangan baris. Bagian di luar daftar itu tetap
  ditampilkan (menyembunyikannya = menghapus orang dari jadwal) tapi diletakkan
  paling belakang; bagian kosong paling akhir lagi.
- Grup TL di dalam tiap layanan diurutkan dari nama TL (A–Z, collator `id`);
  grup **Tanpa team leader** selalu paling akhir di layanannya. Barisnya tetap
  ditampilkan — `tl` kosong di WFM bukan alasan menyembunyikan orangnya.
- Berlaku di kedua panel (Masuk dan Libur). Filter bagian layanan tetap jalan
  seperti sebelumnya: saring dulu, lalu kelompokkan — jadi angka "N orang" per
  layanan dan per TL tidak pernah memakai baris dari bagian lain.
- Label `TL <nama>` di tiap baris DIHAPUS karena sudah menjadi sub-judul grup;
  informasi yang sama tidak diulang dua kali. `shift` tetap tampil apa adanya.
- Murni di klien: satu kali ambil data, tanpa query tambahan ke WFM, tanpa
  perubahan kontrak API maupun tipe. Urutan dari sumber tidak lagi menentukan
  posisi baris.
- Tabel detail di bawah daftar memakai urutan yang SAMA (layanan → TL → nama).
  Satu `orderBySectionThenTeamLeader()` dipakai bersama oleh daftar dan tabel di
  route, supaya orang yang sama tidak pindah posisi antar panel. Tiga E2E lama
  yang mencari baris lewat indeks (`nth(0)`/`nth(1)`) dipindahkan ke pencarian
  per nama — indeks di sana mengikat urutan sumber, bukan perilaku yang diuji.

Verifikasi: E2E RED dulu tiap tahap (tahap TL: 2 gagal / 31 lulus; tahap tabel:
1 gagal / 33 lulus; tahap layanan: 4 gagal / 32 lulus), setelah implementasi —
**36 / 36 lulus**, `tsc --noEmit` web bersih, ESLint bersih, Prettier dijalankan,
`pnpm build` 3/3 task sukses, `git diff --check` bersih.
Bukti visual diambil dengan fixture sintetis lokal (9 baris, 3 layanan berisi,
3 TL + 1 tanpa TL).

## Gate thermo-nuclear (Pi) — 2026-09-30

Gate dijalankan read-only lewat Pi atas commit `010e361`
(`pi -p --tools read,bash --thinking max`). Verdict awal **NEEDS_FIX**, tiga
temuan P2, semuanya soal ketahanan — tidak ada temuan security atau kontrak.

| Temuan                                                             | Tindakan                                                                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| E2E tidak membuktikan urutan (satu agen per pasangan layanan×TL)   | Diperbaiki: test baru 1 layanan × 2 TL × 2 agen, input teracak, memeriksa grup + urutan datar daftar + tabel detail |
| Kapitalisasi `channel` menghasilkan grup kembar (`call` vs `Call`) | Diperbaiki: kanonikalisasi ke label `SCHEDULE_SECTIONS` sebelum grouping; bagian tak dikenal tetap apa adanya       |
| Baris ganda per agen dihitung sebagai beberapa "orang"             | Status quo (keputusan Fajar): semua baris tampil dan terhitung, tanpa deduplikasi diam-diam; dicatat di kode + docs |

Supaya temuan pertama tidak kembali, test urutan dibuktikan dengan mutation
check: komparator nama, komparator TL, dan peringkat bagian layanan dibalik
satu per satu — ketiganya membuat test gagal, lalu dikembalikan.

Verifikasi akhir: **38 / 38 lulus** (kasus kapitalisasi RED dulu: 1 gagal /
37 lulus), `tsc --noEmit` web bersih, ESLint bersih, Prettier dijalankan,
`pnpm build` 3/3 task sukses, `git diff --check` bersih. Gate Pi dijalankan
ulang setelah commit perbaikan.

## Gate thermo-nuclear (Pi) — putaran kedua dan ketiga

- Putaran 2 atas `e8bf6b0`: **NEEDS_FIX** — fixture urutan layanan masih searah
  dengan ekspektasi (sortir layanan bisa dihapus tanpa membuat test gagal), dan
  satu komentar helper basi. Keduanya ditutup di `582c931`.
- Putaran 3 atas `582c931`: **PASS**, satu P3 — assertion "Hari ini hanya tabel"
  belum menolak daftar tanpa heading. Ditutup dengan menolak testid panel lama
  dan `ul`/`ol` di wilayah Hari ini; dibuktikan lewat mutation check (panel lama
  disuntikkan → test gagal → dipulihkan identik).

Ringkasnya: implementasi dipindahkan ke Pi coding agent, gate dijalankan sesi Pi
terpisah yang read-only, dan Moy memverifikasi ulang hasilnya sendiri (E2E,
typecheck, lint, build, serta mutation check independen) sebelum commit.

## Revisi pemilik — Hari ini hanya tabel detail dan urutan baris

### Requirement

- Format **Hari ini** hanya menampilkan tabel detail sebagai satu-satunya daftar.
  Panel `ScheduleGroups`, pemisahan Masuk/Libur, dan subjudul layanan/TL dihapus.
- Urutan tabel per baris: shift `S1 → H → S2 → S3 → S4 → Off → kode tak dikenal`;
  layanan `Call → Digital Chat → Email → Leader → layanan lain`; TL A–Z dengan TL
  kosong terakhir; nama agen A–Z.
- `Off` hanya mencakup shift kosong, `OFF`, `LIBUR`, `LBR`, dan `CUTI`.
  Kode/label lain (termasuk `TBCCI` dan rentang jam) tetap tampil sesudah Off,
  diurutkan A–Z di antara kode tak dikenal.
- Pencocokan layanan dikenal tidak peka kapitalisasi; layanan tak dikenal tetap
  tampil di belakang daftar kanonik. Filter layanan tetap berjalan.
- Format **Kalender** tidak berubah; baris agen tetap A–Z. Loading, kosong, gagal,
  truncated, dan hanya-baca tetap sama.
- Tidak mengubah API, shared types, proyeksi WFM, operasi tulis, atau AI.

### Design

Gunakan satu comparator leksikografis atas field barisnya sendiri (shift,
layanan, TL, nama), tanpa pengelompokan tambahan atau ketergantungan pada urutan
sumber WFM. Hapus `ScheduleGroups.tsx` dan helper grouping yang tidak lagi
memiliki pemakai; pertahankan utilitas filter serta kalender yang masih dipakai.

### Tasklist

- [x] Tulis E2E RED untuk tabel-saja dan semua tingkat urutan dengan fixture yang
      layanan input-nya berlawanan dari urutan kanonik serta memuat layanan tak dikenal.
- [x] Implementasi comparator harian dan hapus daftar/grouping mati.
- [x] Mutation-check shift, layanan, TL, dan nama satu per satu melalui E2E.
- [x] Perbarui docs/modul/log dan jalankan seluruh gate yang diminta pemilik.

## Urutan tabel dan perilaku gulir (2026-09-30, lanjutan)

- Urutan tabel Hari ini: shift → layanan → jam mulai istirahat (slot `LB`
  pertama) → TL → nama. Baris tanpa istirahat selalu paling belakang.
- Kalender: wadah dibatasi tinggi (`max-h-[calc(100dvh-24rem)]`, `overflow-auto`)
  dengan header tanggal `sticky top-0` dan kolom nama opak + sticky kiri, supaya
  scrollbar horizontal terjangkau tanpa menggulir halaman dulu dan tidak ada
  kode tanggal yang tembus di belakang nama agen.

### Koreksi urutan (2026-09-30)

Kunci paling luar adalah **layanan**, bukan shift — dikoreksi pemilik setelah
melihat hasilnya. Urutan: layanan (`Call → Digital Chat → Email → Leader` →
bagian lain A–Z → kosong terakhir) → shift (`S1 → H → S2 → S3 → S4 → Off → kode
tak dikenal`) → jam mulai istirahat (`LB`) → TL A–Z (kosong terakhir) → nama A–Z.

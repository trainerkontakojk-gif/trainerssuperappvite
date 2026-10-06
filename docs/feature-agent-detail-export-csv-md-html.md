# Feature Request — Agent Detail Export: Excel / HTML / PDF

> **Pembaruan 2026-10-06 — keterbacaan laporan (plan
> [`plans/markdown/sidak-agent-report-readability.md`](../plans/markdown/sidak-agent-report-readability.md)).**
> Bagian ini **menggantikan** kontrak lama di bawahnya bila bertentangan.
>
> - **Format:** menu **Unduh Laporan** sekarang menawarkan **empat** format:
>   **Excel (.xlsx)**, HTML Interaktif, HTML Statis, dan PDF. **CSV dan Markdown
>   dihapus** (disetujui Fajar) dan digantikan Excel. Seluruh bagian "CSV",
>   "MD", "Kontrak CSV multi-seksi", prefiks `[teks] `, dan baris `// Cakupan:`
>   di bawah adalah **riwayat**, bukan kontrak aktif.
> - **Excel:** sheet `Ringkasan` (identitas, cakupan, Kesimpulan Utama),
>   `Skor Bulanan`, `Temuan`, `Tiket`, `Akar Masalah`, `Tren Temuan`,
>   `Perbandingan`. Header tebal + beku + filter otomatis, angka disimpan
>   sebagai angka, label manusiawi. Teks yang diawali `=`/`+`/`-`/`@` disimpan
>   sebagai sel string (`exceljs` tidak pernah diberi objek `{ formula }`), jadi
>   tidak pernah dievaluasi sebagai formula. Sheet tanpa data berisi satu
>   kalimat kosong yang jujur. `exceljs` diimpor dinamis.
> - **Model bersama:** `apps/web/src/utils/agentReportModel.ts` memegang kamus
>   label (layanan `Call`, jabatan via `labelJabatan`, kategori
>   `Critical`/`Non-critical`, nilai `Kritis`/`Tidak Sesuai`/`Perlu
>   Perbaikan`/`Sesuai`, bulan `Februari 2026`, angka gaya Indonesia), cakupan,
>   **Kesimpulan Utama** deterministik (skor bulan terpilih vs target 95 dalam
>   poin, capaian target tahun ini, parameter temuan terbanyak, fokus coaching
>   dari akar masalah teratas — tanpa AI), pengelompokan temuan per parameter,
>   dan arah baik/buruk. HTML, PDF, dan Excel memakai modul ini.
> - **Cakupan:** ditulis sekali di header (`Layanan Call • Tahun 2026 • Bulan
>   terpilih Februari 2026`). Seksi hanya menulis cakupan bila berbeda: tiket
>   (`Hanya Februari 2026`), akar masalah (`Januari s.d. Februari 2026`), dan
>   perbandingan (cakupan `comparisonTable.scope` dari backend).
> - **HTML/PDF:** urutan baca identitas → Kesimpulan Utama → Ringkasan (posisi,
>   skor bulan terpilih + selisih dalam **poin**, Rekap Skor Bulanan, tiket,
>   akar masalah) → Perkembangan Skor → Tren Temuan → Detail Temuan. Satu metrik
>   skor tetap satu grafik, tetapi sumbu di-zoom dan ada garis **target 95**;
>   tabel data per grafik skor dihapus karena angkanya sama dengan Rekap Skor
>   Bulanan. Tren temuan = satu grafik total + **tabel** parameter × bulan
>   (menggantikan grafik garis per parameter dan filter seri). Perbandingan:
>   temuan **lebih sedikit** dari rata-rata = hijau, **lebih banyak** = merah
>   (sebelumnya terbalik). Detail Temuan dikelompokkan **per parameter**;
>   catatan yang sama digabung dengan daftar kemunculan (nomor tiket di depan,
>   bulan, nilai). Pita "NO TIKET" per tiket tidak ada lagi.
> - **PDF:** header kolom rata kanan kini dijangkar di tepi kanan kolom (dulu
>   bergeser satu kolom ke kiri); judul "Akar Masalah" tercetak; waktu
>   pembuatan ada di identitas dan catatan sesi tanpa temuan di bawah Rekap
>   Skor Bulanan, sehingga tidak ada halaman terakhir yang hanya berisi penutup;
>   "Sebaiknya" + daftar tiketnya tidak pernah terpisah halaman. Catatan yang
>   diketik dengan Enter tidak lagi tercetak sebagai `[U+000A]`: baris baru
>   dipertahankan dan tab menjadi spasi.
> - **Regresi E2E:** `sidak-agent-report-readability.spec.ts` (6),
>   `sidak-agent-report-download.spec.ts` (25), `sidak-agent-html-export-parity.spec.ts`
>   (2), `sidak-agent-report-date-invariance.spec.ts` (2, kini membandingkan
>   isi sheet Excel). Test CSV/MD dihapus atau dipindah ke Excel; test formula
>   CSV digantikan test formula Excel. Unit test non-E2E tidak ditambah.

## Status

✅ **IMPLEMENTED** — CSV, Markdown, HTML Statis, HTML Interaktif, dan **PDF**.

PDF adalah **unduhan langsung** (file `application/pdf` yang dibuat di
peramban), bukan dialog cetak dan bukan hasil tangkapan layar. Menu **Unduh
Laporan** menawarkan lima format, dan file PDF hasil unduhan punya magic bytes
`%PDF-`, metadata dokumen, halaman A4 berulang, dan teks yang bisa diekstrak
(bukan gambar). Semua klaim isi PDF diuji dari file yang diunduh lewat menu
nyata, bukan dari pemanggilan generator.

> ✅ **DISETUJUI Fajar.** Kedua konvensi output baru di bawah ini sudah
> terimplementasi, teruji, dan **disetujui** atas pertanyaan eksplisit:
> prefiks CSV **`[teks] `** pada sel yang diawali pemicu formula, dan penanda
> PDF **`[U+XXXX]`** untuk karakter yang tidak punya glyph di font standar.
> Keduanya kini berstatus kontrak final, bukan keputusan sementara. Cakupan
> persetujuannya **hanya dua konvensi itu** — tidak ada perubahan kontrak lain
> yang disetujui di sini.
>
> ❌ **Defect placeholder sudah diperbaiki.** Penanda `[teks] ` pernah menempel
> pada placeholder internal `-` (baris `Masa Kerja,[teks] -` untuk agen tanpa
> `bergabung_date`), sehingga penanda itu muncul di luar pemicu formula dan
> hanya mengaburkan nilai yang sebenarnya. Sekarang placeholder itu ditulis
> polos; lihat
> [Keamanan, nama file, dan kegagalan ekspor](#keamanan-nama-file-dan-kegagalan-ekspor).

Dua kontrak data-integrity berlaku dan diuji dari file yang diunduh:
karakter yang tidak bisa dicetak font standar tidak hilang diam-diam (dicetak
sebagai penanda `[U+XXXX]` yang dapat dibalik), dan tidak ada sel CSV yang
pernah dibaca spreadsheet sebagai formula. Batasan keduanya — termasuk
konsumen yang **tidak** diuji, dan limit penanda PDF yang **tidak** dapat
dibedakan dari teks sumber — tercatat di
[Karakter di luar WinAnsi di PDF](#karakter-di-luar-winansi-di-pdf) dan
[Keamanan, nama file, dan kegagalan ekspor](#keamanan-nama-file-dan-kegagalan-ekspor).


---

## Latar Belakang

Halaman `/sidak/agents/$id` memiliki header ringkas dengan tombol **"Unduh Laporan"** di `AgentProfileBar` yang memicu `handleExport()` di `useAgentDetail.ts`.

**Masalah:** Export saat ini hanya:
- Format **XLSX** (Excel) via library `xlsx`
- Data **sangat minim** — hanya nama, tim, batch, jabatan, tahun + tabel ringkasan skor per bulan (finalScore, ncScore, crScore, sessionCount, findingsCount)
- **Tidak menyertakan:** daftar temuan detail, root causes, top tickets, trend data, comparison table

## Permintaan

Mekanisme export tersedia melalui dropdown **5 format**:

### 1. CSV
- Delimiter koma (`,`); pemisah baris `\n`; seluruh file ber-BOM UTF-8
- **Multi-seksi, bukan satu tabel tunggal** (keputusan produk, lihat
  [Kontrak CSV multi-seksi](#kontrak-csv-multi-seksi))
- Enam seksi dengan skema kolom masing-masing; skema dan baris data yang sudah
  ada tidak diubah oleh penambahan cakupan
- Cocok untuk dibuka di Excel / Google Sheets / tools data, dengan batasan
  pemformatan yang harus dibaca: lihat
  [Keamanan, nama file, dan kegagalan ekspor](#keamanan-nama-file-dan-kegagalan-ekspor)

### 2. MD (Markdown)
- Tabel Markdown yang rapi
- Bisa langsung dipakai di dokumentasi atau commit message
- Struktur: profil → ringkasan skor → detail temuan → top tickets → root causes
- Cakupan per seksi mengikuti aturan yang sama dengan CSV
  (lihat [Cakupan seksi](#cakupan-per-seksi-pada-laporan))
- Sesi tanpa temuan tidak diekspor (lihat
  [Pengecualian sesi tanpa temuan](#pengecualian-sesi-tanpa-temuan))

### 3. HTML Statis / 4. HTML Interaktif
- **Satu dokumen laporan**, bukan snapshot shell aplikasi. Hierarki editorial:
  identitas agen (h1 + meta) → **Ringkasan** (posisi performa, skor periode
  aktif, rekap bulanan, tiket pengurang skor, akar masalah) → **Perkembangan
  Skor** (grafik tren, tabel data tren, perbandingan temuan) → **Riwayat
  Temuan** (dikelompokkan per periode lalu per tiket) → colophon.
- **Tidak ada kontrol palsu pada file offline.** Tombol `Unduh Laporan`,
  `Input Audit`, `Muat ulang`, navigasi kembali, dan `<select>` tahun/folder/agen
  yang non-fungsional TIDAK lagi ikut diekspor. Tahun dan layanan dilaporkan
  sebagai metadata teks (`<dl>`), bukan kontrol.
- **HTML Statis** adalah dokumen baca: semua bagian terbuka dan terlihat, tidak
  ada `role="tab"`/`role="tablist"` tanpa perilaku, dan tidak ada tombol.
  Disclosure `<details open>` hanya dipakai untuk drill-down (tiket terkait
  akar masalah, daftar agen berbagi peringkat); kontrolnya native, terbuka
  secara default, dan aman saat dicetak.
- **HTML Interaktif** hanya memakai kontrol yang benar-benar bekerja: `tablist`
  dengan empat tab (`Ringkasan`, `Skor`, `Tren`, `Temuan`) beserta
  `aria-selected`, `aria-controls`, roving `tabindex`, dan navigasi
  Arrow/Home/End; filter seri tren temuan dengan `aria-pressed` (hanya pada
  panelnya sendiri — tiap grafik skor cuma punya satu seri, jadi tidak ada yang
  bisa disaring); disclosure opsional untuk detail per periode, detail temuan,
  dan tiket terkait akar masalah.
- Kedua varian memakai **dataset, markup, dan stylesheet yang sama**; yang
  berbeda hanya perilaku (tab/filter/disclosure `open`). `@media print`
  membuka kembali semua panel, semua seri grafik, dan semua disclosure.
- **Setiap bagian menyatakan cakupannya sendiri** di bawah judulnya, memakai
  label cakupan yang sama dengan CSV/MD (tahun + layanan, bulan terpilih, YTD
  akar masalah, periode tren, `comparisonTable.scope`).
- Rekap bulanan memakai **tabel** dengan kolom `Status QA` terhadap target 95%
  yang sama dengan `MonthRail`/`AgentAuditDossier`, jadi informasi "di bawah
  target" tidak hilang bersamahilangnya rail.
- **Dua keluarga tren, dua seksi.** `personalTrend` berisi **jumlah temuan** per
  periode — itu hitungan temuan, bukan skor. Karena itu grafiknya berada di
  seksi **Tren Temuan**, sedangkan seksi **Perkembangan Skor** memakai skor yang
  benar-benar dihitung backend: `periodSummaries` (`finalScore`,
  `nonCriticalScore`, `criticalScore`) untuk tahun + layanan yang sama, pada
  periode yang benar-benar ada. Tidak ada skor yang diturunkan dari jumlah
  temuan, dan tidak ada perhitungan ulang di laporan.
- **Satu metrik satu grafik.** Di seksi skor, tiga metrik — `Skor Final`,
  `Skor Non-Critical (NC)`, dan `Skor Critical (CR)` — masing-masing satu grafik
  dengan satuan sumbu `Skor (0-100)`, judul, nilai di atas tiap titik, legenda
  yang menempel di bawah plot, dan tabel data lengkapnya sendiri
  (`Data skor — Skor Final per Periode`, `Data skor — Skor Non-Critical (NC) per
  Periode`, `Data skor — Skor Critical (CR) per Periode`). Di seksi temuan,
  `Total Temuan` adalah agregat sedangkan rincian per parameter adalah
  komponen: satuan sama, makna berbeda, jadi tidak pernah digabung dalam satu
  trendline. Masing-masing punya judul, satuan sumbu Y, nilai di atas tiap titik,
  legenda, dan tabelnya sendiri (`Data tren — Total Temuan per Periode` dan
  `Data tren — Temuan per Parameter`). Di `@media print` kalimat penjelasan per
  grafik tidak ikut tercetak (judul + satuan sudah cukup), dan grafik, legenda,
  serta kepala tabel tidak pernah terbelah antar halaman.
- Grafik tren memakai satu seri per warna **dan** pola garis berbeda, sehingga
  grafik tidak bergantung pada warna saja dan tetap terbaca saat dicetak
  hitam-putih.
- **Nomor tiket adalah identifier utama** di blok temuan: ia tampil pada pita
  berlabel `NO TIKET` (PDF) atau `No Tiket` (HTML), kontras penuh (`--ink`) dan
  lebih besar dari nama parameter maupun nilai, sehingga tiket yang diaudit
  mudah dipindai di antara angka. Nama parameter dan nilai tetap lengkap, dengan
  tipografi yang proporsional terhadap nomor tiket.
- Avatar memakai **inisial**, bukan `<img>`, agar dokumen benar-benar offline.
- Mode: **light mode**, inline CSS lokal, tanpa font/link/script/gambar remote.

### 5. PDF
- **Unduhan langsung**, bukan `window.print()`: `jspdf` (dependency web yang
  sudah ada, diimpor dinamis saat PDF dipilih) menulis dokumen biner dari
  snapshot yang sama dengan HTML/CSV, lalu hook mengunduhnya sebagai Blob
  `application/pdf` tanpa BOM UTF-8. Empat format teks tetap ber-BOM; PDF
  format biner tidak pernah memakai BOM.
- **A4 portrait, teks asli.** Seluruh isi ditulis sebagai operator teks, jadi
  bisa diseleksi/dicari/disalin. Tidak ada `html2canvas`, tidak ada raster
  penuh, tidak ada font eksternal. Grafik tren hanya garis vektor (dibedakan
  pola garis, bukan hanya warna) dan angkanya tetap ada lengkap di tabel data
  masing-masing grafik. Pemisahan grafik dan hierarki nomor tiket di PDF
  mengikuti aturan yang sama dengan HTML statis: satu metrik satu grafik, dan
  nomor tiket dicetak pada pita berlabel `NO TIKET` dengan ukuran paling besar
  di blok temuan.
- **Tidak ada halaman sampul terpisah.** Halaman 1 langsung berisi identitas
  (nama, tahun, layanan, meta) lalu ringkasan eksekutif, rekap bulanan, tiket,
  dan akar masalah; halaman berikutnya skor, tren temuan, benchmark, seluruh
  temuan, dan colophon. PDF dan HTML Statis adalah **dua implementasi render
  dan layout yang terpisah** (jsPDF operator teks vs. markup+CSS offline): tidak
  ada satupun yang memakai tangkapan layar, dan tidak ada satupun yang memakai
  keluaran format lain sebagai basis.
- **Paginasi:** judul seksi tidak pernah menggantung di dasar halaman, header
  tabel berulang saat tabel terbelah, satu baris tabel tidak pernah keluar dari
  area cetak, teks panjang mengalir per baris (token tanpa spasi dipecah per
  karakter supaya tidak melewati margin), dan setiap halaman memakai header
  identitas plus footer **"Halaman X dari N"**.
- **Font standar + sanitasi teks tanpa kehilangan bukti.** PDF memakai font
  standar (Helvetica) yang hanya bisa menencetak WinAnsi. Semua teks dari data
  dilewatkan sanitasi: karakter kontrol dibuang, `→`/`≥`/`≤`/`≈`/superscript
  ditulis ulang ke ejaan Indonesia, dan setiap titik kode yang **tidak** punya
  glyph dicetak sebagai penanda **`[U+XXXX]`** (lihat
  [Karakter di luar WinAnsi](#karakter-di-luar-winansi-di-pdf)). Karakter CJK,
  emoji, dan huruf Latin-Extended (mis. `đ`, `ệ`) tidak bisa dirender sebagai
  glyph, tapi **tidak pernah hilang**: yang tidak bisa dicetak dicatat sebagai
  titik kodenya, bukan diganti spasi atau dihapus.
- **Metadata dokumen:** judul memuat nama agen, subject memuat tahun, layanan,
  dan bulan terpilih, author `SIDAK`, creator aplikasi.
- **Cakupan identik dengan format lain.** PDF memakai label cakupan yang sama
  (`yearServiceScopeLabel`, `monthScopeLabel`, `yearToDateScopeLabel`,
  `trendScopeLabel`, dan kalimat `comparisonScopeLabel` milik CSV/MD), jadi
  tidak ada satu periode yang lendoh ke seluruh dokumen.
- **Bagian kosong dinyatakan eksplisit.** Bagian yang tidak punya isi disebut apa adanya
  ("Tidak ada tiket yang menurunkan skor pada cakupan ini", dst.), tidak diisi
  nol atau placeholder. Colophon menyatakan terbuka bahwa sesi tanpa temuan
  hanya menyumbang angka agregat `Sesi`.

## Kontrak CSV multi-seksi

CSV **bukan** satu tabel datar. File ini adalah satu dokumen ber-seksi yang
tetap bisa di-parse spreadsheet: setiap seksi diawali baris kosong, lalu baris
heading `# <Nama Seksi>`, lalu satu baris header skema, lalu baris data. Skema
kolom tiap seksi berbeda dan sengaja dibiarkan begitu.

Alasan: seksi-seksi ini punya unit dan kolom yang berbeda (profil key/value,
bulanan, temuan, tiket, akar masalah, tren, benchmark). Menggabungkan semuanya
ke satu tabel berarti mengarang kolom kosong atau memipihkan skema. Konsekuensi
yang harus disadari pembaca file: baris `# <Nama Seksi>` dan baris
`// Cakupan: ...` adalah metadata dokumen, bukan baris tabel.

Blok profil adalah daftar key/value dua kolom (`Nama`, `Tim`, `Batch`,
`Jabatan`, `Masa Kerja`, `Tahun Laporan`, `Layanan Audit`) — juga bukan tabel
datar.

Enam seksi dan skema kolomnya (dipakai juga oleh E2E sebagai regression
evidence):

| Seksi | Baris header skema | Cakupan |
|-------|--------------------|---------|
| `Ringkasan Skor Bulanan` | `Bulan,Skor Final,NC Score,CR Score,Sesi,Temuan` | Semua bulan pada tahun + layanan terpilih |
| `Detail Temuan` | `Bulan,Tahun,Indikator,Kategori,Nilai,Ketidaksesuaian,Sebaiknya,No Tiket` | Semua temuan pada tahun + layanan terpilih, bukan hanya bulan aktif |
| `Tiket Pengurang Skor Terbesar` | `No Tiket,Score Deduction,Jumlah Temuan,Parameter Terberat` | Bulan terpilih saja |
| `Akar Masalah` | `Label,Prioritas,Jumlah Temuan,Tiket Terdampak,Temuan Critical,Rata-rata Nilai,Rekomendasi` | Tahun berjalan (YTD) s.d. bulan terpilih |
| `Perkembangan Skor` | `Periode,<label tiap seri>` | Periode yang benar-benar ada pada data tren; seksi hanya ditulis jika data tren tersedia. **Catatan:** di CSV/MD seksi ini masih dibangun dari `personalTrend`, yaitu JUMLAH TEMUAN per periode — nama seksi dan skema Endernya dikunci agar tidak breaking, dan tidak diubah dalam koreksi seksi skor HTML/PDF. Grafik skor yang benar-benar memakai `periodSummaries` hanya ada di HTML (kedua varian) dan PDF |
| `Perbandingan Temuan` | `Parameter,Agent Ini,Rata-rata Tim,Rata-rata Service` | Cakupan yang dideklarasikan `comparisonTable.scope`; seksi hanya ditulis jika tabel benchmark tersedia |

Menambah atau mengubah baris metadata cakupan **tidak** mengubah nama seksi,
baris header skema, maupun baris data yang sudah ada.

## Cakupan per seksi pada laporan

Tidak semua seksi memakai periode yang sama, jadi laporan menyatakan cakupan
sendiri di tiap seksi daripada membiarkan pembaca menyimpulkan satu bulan untuk
seluruh dokumen. Aturan sumber nilai:

- **Tahun dan layanan** — selalu dari state UI saat unduhan ditekan
  (`selectedYear`, `selectedService`).
- **Bulan terpilih** — hanya untuk seksi yang memang dihitung per bulan
  (dossier/tiket) dan untuk batas YTD akar masalah.
- **Cakupan tren dan benchmark** — dari data yang benar-benar dipakai seksi
  tersebut: label periode dari `personalTrend`, dan
  `comparisonTable.scope` untuk benchmark. Nilai scope yang dideklarasikan
  backend tidak ditimpa nilai UI.

Dalam CSV, cakupan ditulis sebagai satu baris komentar `// Cakupan: ...`
tepat sebelum baris heading seksi. Dalam MD, cakupan ditulis sebagai baris
`_..._` di bawah heading seksi. Baris-baris ini tidak menambah kolom baru pada
skema seksi mana pun.

## Pengecualian sesi tanpa temuan

Sesi tanpa temuan (clean session, `is_phantom_padding = true`, ditampilkan di
UI sebagai **Sesi tanpa temuan**) **tidak pernah diekspor oleh format mana
pun** — CSV, MD, HTML Statis, maupun HTML Interaktif. Aturan ini konsisten
dengan
[`docs/SIDAK_LOGIC_AND_SCORING.md`](./SIDAK_LOGIC_AND_SCORING.md) bagian *Rumus
Clean Session* dan *Presentasi Sesi Phantom pada Agent Detail*, serta dengan
aturan "Exklusi Phantom" pada Workspace Data: sesi bersih dihitung sebagai audit
valid dan boleh punya skor 100, tetapi tidak boleh menambah defect, temuan,
pareto, atau ranking.

Yang tetap ikut ke laporan hanya **angka agregat** yang sudah dihitung di
backend, yaitu kolom `Sesi` pada `Ringkasan Skor Bulanan` (`sessionCount`).
Tidak ada nomor tiket, parameter, atau baris dari sesi bersih yang muncul di
file mana pun. Ekspor tidak pernah menambahkan baris phantom, dan tidak pernah
menghitung ulang atau mengubah angka agregat tersebut.

## Karakter di luar WinAnsi di PDF

Font standar PDF (Helvetica) hanya bisa menencetak WinAnsi (CP1252). Mayoritas
teks laporan — huruf Latin, angka, tanda baca Indonesia — aman. Sisanya
(ideogram CJK, emoji, huruf Latin-Extended seperti `đ`/`ệ`, beberapa simbol
matematika) **tidak punya glyph** di font itu, dan tidak ada font eksternal
yang boleh dimuat (tanpa aset remote, tanpa dependency baru).

Aturannya satu dan berlaku seragam: **titik kode yang tidak bisa dicetak
dicetak sebagai penanda `[U+XXXX]`** — `U+` diikuti 4-6 digit heksa huruf
besar. Jadi `中` menjadi `[U+4E2D]`, `😅` menjadi `[U+1F605]`, `ệ` menjadi
`[U+1EC7]`.

Kenapa bentuk ini, dan bukan spasi atau kotak:

1. **Terlihat.** Pembaca tahu ada karakter yang tidak ikut tercetak, bukan
   mengira datanya bersih.
2. **Bisa dicari.** Penanda ASCII biasa, jadi `Ctrl+F [U+4E2D]` langsung
   menemukan tempat karakter itu berada.
3. **Bentuknya baku.** Notasi titik kode Unicode lazim dibaca, jadi tidak ada
   format baru yang harus dipelajari. Konvensi ini **disetujui Fajar** sebagai
   kontrak final.
4. **Dapat dibalik.** `parseInt(heksa, 16)` mengembalikan karakter aslinya
   persis, jadi bukti yang tidak bisa dicetak tetap bisa dipulihkan dari file
   PDF-nya sendiri.

Yang **tidak** bisa diklaim: bahwa penanda itu selalu bisa dibedakan dari teks
lain di dokumen. Lihat limit di bawah.
 Notasi titik kode Unicode juga lazim dibaca, jadi tidak
   ada format baru yang harus dipelajari.

Simbol yang punya padanan ejaan Indonesia (`→`→`ke`, `≥`→`>=`, `²`→`2`, kutip
melengkung → `'`) tetap ditulis ulang ke ejaan biasa, karena lebih enak dibaca
dan tidak ada informasi yang hilang. Karakter **yang bisa** dicetak (mis. `é`,
em dash, bullet) tidak pernah disentuh.

Penanda `[U+…]` diperlakukan sebagai satu atom saat pembungkusan baris, jadi
penanda tidak pernah terbelah di batas kolom walau di dalam token tanpa spasi
yang dipecah per karakter.

### Batasan yang jujur

- **Bukan render visual.** PDF tidak menampilkan bentuk glyph aslinya; yang
  tampil adalah titik kodenya. Membaca dokumen dengan mata saja tidak
  membuktikan karakter apa yang dimaksud, dan font CJK tetap tidak tersedia.
- **Penanda tidak dapat dibedakan dari teks sumbernya.** Kalau teks laporan
  sendiri sudah memuat `[U+XXXX]` secara harfiah — misalnya nama agen, label
  parameter, atau catatan temuan yang menuliskan bentuk penanda itu sendiri —
  hasil PDF-nya **identik** dengan penanda yang dihasilkan generator untuk
  karakter tak-tercetak. Tidak ada metadata, penanda tipe, atau konteks yang
  membedakannya di dalam file, dan teks `[U+XXXX]` itu sendiri bisa dicetak
  persis sama karena seluruhnya ASCII. Jadi klaim "dapat dibalik" di atas
  berlaku pada penanda yang dihasilkan generator, **bukan** pada pencarian
  `[U+…]` di seluruh dokumen: pembaca yang menemukan `[U+1F605]` tidak bisa
  memastikan apakah itu emoji yang tidak tercetak atau teks yang memang
  menuliskan penanda itu. Batas ini diketahui, diterima, dan sengaja tidak
  diperbaiki — memperjelas ambiguitas itu butuh escape atau kode penanda kedua
  yang mengubah kontrak keluaran PDF yang baru saja disetujui.
- **Baris baru dan tab bukan karakter tak-tercetak** (sejak 2026-10-06).
  Catatan yang diketik dengan Enter dulu tercetak sebagai `[U+000A]`/`[U+000D]`.
  Sekarang pemisah baris (`\n`, `\r\n`, `\r`) dipertahankan sebagai baris baru
  di PDF dan HTML (`white-space: pre-line`), dan tab menjadi spasi. Karakter
  kontrol lain tetap ditandai `[U+XXXX]`.
- **Kotak inisial di header** (13 mm) bisa melebar kalau inisial nama agen
  sendiri merupakan karakter tak-tercetak; ini kosmetik, dan nama lengkapnya
  tetap tercetak utuh di sampingnya.
- **Belum diuji** di pembaca PDF selain pustaka standar: bukti diambil dari
  `pypdf` dan `pdftotext` (poppler) yang keduanya membaca penanda sebagai teks
  biasa, bukan sebagai byte rusak.

## Keamanan, nama file, dan kegagalan ekspor

- **Formula spreadsheet — dinetralisasi per sel, bukan hanya diapit tanda
  kutip.** Nilai yang karakter pertamanya adalah pemicu formula (`=`, `+`, `-`,
  `@`, tab, `\r`) **dan bukan angka biasa** diberi awalan penanda
  `[teks] ` pada CSV. Karakter pertama sel berhenti menjadi pemicu formula,
  jadi tidak ada konsumen yang bisa menilainya sebagai formula hanya karena
  meng-parse CSV, dan **isi nilai aslinya tidak pernah diubah atau dipotong** —
  menghapus prefiks memulihkan teks apa adanya. Angka bertanda (`-1.5`, `+3`)
  dikecualikan: selnya harus tetap angka, dan pengapitan tanda kutipnya
  dipertahankan apa adanya. Prefiks ini **disetujui Fajar** sebagai kontrak
  final.

  **Placeholder internal dikecualikan secara eksplisit.** Nilai yang persis
  satu tanda hubung (`-`) adalah placeholder yang dipakai generator untuk
  "tidak ada" — `Masa Kerja` untuk agen tanpa `bergabung_date` — bukan data
  dari sumber. Nilai itu ditulis polos (`Masa Kerja,-`), tanpa penanda dan
  tanpa tanda kutip. Pengecualian ini sengaja sangat sempit: hanya string
  yang persis `-`. Tetangganya tidak berubah —
  `-1-1` masih pemicu formula dan tetap dilindungi penanda, `-1.5` tetap
  dikecualikan sebagai angka biasa, dan `- 1`/`--` masuk aturan biasa.

  Bukti (bukan klaim), dari file CSV yang **benar-benar diunduh lewat menu UI**:
  file di atas dibuka di LibreOffice 26.8 headless (Calc CSV import) dan dibaca
  kembali dengan `openpyxl`. Perilaku lama dijadikan **kontrol positif**: sel
  `"=1+1"` tetap terbaca sebagai formula, sehingga metode verifikasi ini
  memang bisa gagal. Setelah perbaikan, kedua file unduhan berisi **0 sel
  formula**; keempat sel yang dinetralisasi terbaca sebagai teks biasa
  (`[teks] =1+1`, `[teks] @SUM(1,1)`, `[teks] +1+1`, `[teks] -1-1`); 45 sel
  angka pada kolom skor tetap angka dengan nilai byte-identik; sel placeholder
  `Masa Kerja` terbaca sebagai teks biasa `-`, bukan formula dan bukan angka;
  dan enam seksi tetap terbaca.

  Batasan yang jujur:
  - **Hanya LibreOffice yang diuji**, dan di sana **hanya `=` yang benar-benar
    menjadi formula** (sel `"=1+1"` tetap terbaca sebagai sel formula pada
    baca-balik `openpyxl`), sementara `@SUM(1,1)`, `+1+1`, dan `-1-1` tetap
    teks. `+`, `-`, dan `@` tetap dinetralisasi karena aturan konsumen
    berbeda-beda dan hanya satu konsumen yang bisa diuji di lingkungan ini —
    bagian itu **defensif, bukan terverifikasi**. (Catatan: run sebelumnya pada
    import yang sama melaporkan `=1+1` dievaluasi menjadi angka `2`; run
    terbaru dengan opsi import default melaporkannya sebagai sel formula apa adanya.
    Perbedaannya ada di opsi import LibreOffice, bukan di file CSV, dan kedua
    hasil sama-sama membuktikan pengapitan tanda kutip bukan netralisasi.)
    Microsoft Excel dan Google Sheets tidak tersedia di sini, jadi tidak ada
    klaim empiris tentang keduanya. Yang bisa diklaim adalah invarian struktural
    (di luar placeholder `-`, karakter pertama sel tidak pernah berupa pemicu
    formula, apa pun nilainya) plus hasil empiris pada satu konsumen nyata.
  - **Placeholder `-` relaxing satu bagian invarian struktural itu.** Satu
    tanda hubung tunggal memang bukan formula yang bisa dievaluasi, dan itu
    terbukti di LibreOffice, tapi ia tetap satu-satunya sel yang boleh berawalan
    `-` tanpa penanda. Ini residual risk yang tercatat, bukan klaim aman.
  - **Nilai yang diawali spasi lalu pemicu** (` =1+1`) tidak diubah. Di
    LibreOffice sel seperti itu tetap teks, dan tidak ada konsumen lain yang
    bisa diuji; annotate prosa biasa yang kebetulan diawali spasi hanya menambah
    kebisingan. Ini residual risk yang tercatat, bukan klaim aman.
  - **Konsumen CSV non-spreadsheet** (pandas, `LOAD DATA`, dsb.) membaca
    penanda sebagai bagian nilai; pemulihannya adalah menghapus prefiks
    `[teks] `.

- **Nama file.** `Laporan_Audit_<nama>_<tahun>.<ext>` memakai nama yang sudah
  aman apa adanya. Nama agen yang memuat karakter path/berbahaya
  (`/ \ : * ? " < > |`, karakter kontrol) disanitasi menjadi satu garis bawah
  per rangkaian karakter, lalu spasi/garis di ujung dipangkas; bila hasilnya
  kosong, `agentId` dipakai. Sanitasi hanya menyentuh nama file — isi laporan
  tidak pernah diubah.
- **Kegagalan ekspor tidak senyap.** Kegagalan membuat laporan (data profil
  belum ada, modul ekspor gagal dimuat, generator melempar error) tidak lagi
  ditelan tanpa umpan balik. Pengguna melihat toast error yang diumumkan lewat
  `aria-live`, dan **tidak ada** file unduhan yang lahir dari kegagalan tersebut
  (tidak ada file kosong maupun file separuh jadi). Detail teknis tetap di
  console, bukan di UI.

## Spesifikasi Teknis

### Data yang Harus Ada di Semua Format

| Data | Sumber |
|------|--------|
| Profil agent (nama, tim, batch, jabatan) | `data.peserta` |
| Ringkasan skor per bulan | `monthlySummaries` |
| Detail temuan (indikator, nilai, ketidaksesuaian, sebaiknya) | `temuanDisplayItems` |
| Top tickets (deduksi terbesar) | `topTickets` |
| Root causes analysis | `activeRootCauses` |
| Trend score (jika ada) | `data.personalTrend` |
| Comparison table | `data.comparisonTable` |
| **Bukan** data ekspor: sesi tanpa temuan | `phantomSessionDisplayItems` — sengaja tidak diteruskan ke generator mana pun |

### Arsitektur

**Client-side only** — semua data sudah tersedia dari response `/sidak/agents/:id` yang di-fetch oleh `useApi<AgentDetailData>`.

### File yang Diubah

| File | Perubahan |
|------|-----------|
| `apps/web/src/hooks/useAgentDetail.ts` | `handleExport` menerima format CSV/MD/HTML/PDF, snapshot context ringan, cakupan seksi, nama file tersanitasi, Blob biner tanpa BOM untuk PDF, dan umpan balik error |
| `apps/web/src/components/sidak/AgentProfileBar.tsx` | Header identitas ringkas dan dropdown lima format export (label CSV jujur: multi-seksi; label PDF jujur: dokumen A4 dengan teks yang bisa dicari) |
| `apps/web/src/components/sidak/SidakAgentDetailTabs.tsx` | Tab presentation `summary`, `trend`, `temuan`, `simulations` dan mounted panel state |
| `apps/web/src/components/sidak/ContextControlBar.tsx` | Filter konteks audit, rentang tren, dan perpindahan profil |
| `apps/web/src/utils/exportAgentReport.ts` | Utility `generateCSV()`, `generateMD()`, `generateHTML()`, dan `buildAgentReportFileName()`; union format laporan; re-export tipe kontrak laporan; `comparisonScopeLabel()` diekspor supaya PDF memakai kalimat cakupan benchmark yang sama; `csvEscape()` menetralisasi pemicu formula per sel dengan penanda `[teks] ` (angka dikecualikan) |
| `apps/web/src/utils/agentReportHtml.ts` | **Sumber tunggal desain laporan HTML**: stylesheet, seluruh section builder, helper label cakupan (dipakai bersama CSV/MD/PDF), dan script interaktif untuk kedua varian |
| `apps/web/src/utils/agentReportPdf.ts` | **Generator PDF**: mesin tata letak A4 (paragraf, tabel ber-header berulang, grafik tren vektor), sanitasi teks WinAnsi dengan penanda `[U+XXXX]` untuk karakter tak-tercetak, metadata, header/footer "Halaman X dari N" |
| `apps/web/e2e/sidak-agent-report-download.spec.ts` | Bukti E2E unduhan nyata: menu → hook → Blob → file, incl. cakupan seksi, pengecualian sesi bersih, sanitasi nama file, kegagalan ekspor, kontrak PDF (magic bytes, tanpa BOM, metadata, jumlah halaman, teks ter-ekstrak di halaman awal/akhir, isi panjang lintas halaman, kegagalan async), serta kontrak data-integrity: penanda karakter tak-tercetak yang utuh + dapat dibalik di PDF, dan invarian "tidak ada sel formula di seluruh file" pada CSV yang diunduh |

### HTML Export — Persyaratan Visual

- **Light mode.** Token warna, tipografi, dan radius didefinisikan lokal di
  `<style>` dokumen laporan (`--ink`, `--paper`, `--line`, `--wash`, status
  emerald/amber/rose yang sama dengan komponen live). Tidak ada token atau
  konvensi baru yang ditambahkan ke CSS aplikasi/global.
- Font: Outfit (heading) + Inter (body) sebagai **nama pertama** pada font
  stack sistem, tanpa `@import` — dokumen tetap terbaca dengan font sistem
  saat offline.
- Hierarki lewat tipografi dan spasi: judul panel lebih besar dan tebal dari
  judul sub-bagian, `h1–h3` memakai `text-wrap: balance`, jarak mengikuti
  kelipatan 4/8px, angka memakai `font-variant-numeric: tabular-nums`.
- Pemisahan memakai **border 1px**, bukan box-shadow; radius 8–12px. Tanpa
  nested card, gradien, eyebrow uppercase, dan penomoran seksi.
- Kontras: teks utama `#0f172a` (17,9:1), teks isi `#334155` (10,4:1), sekunder
  `#475569` (7,5:1), tersier `#64748b` (4,8:1) — semuanya ≥4,5:1 di atas
  putih/kertas.
- **Responsif:** tidak ada overflow horizontal halaman pada 390px maupun 1440px.
  Tabel lebar menggulir di dalam `-webkit`-nya sendiri (`.table-scroll`), bukan
  melebarkan halaman. Sumbu SVG diperbesar pada layar sempit supaya labelnya
  tetap terbaca.
- **Cetak:** `@page A4 portrait` dengan margin 14mm/12mm, `thead` berulang
  (`display: table-header-group`), `tr`/blok skor/temuan memakai
  `break-inside: avoid`, judul dan caption memakai `break-after: avoid`, dan
  kontrol navigasi disembunyikan.
- **Perbaikan Fase 3 (paginasi cetak + isi tertutup).** Tiga kontrak yang
  sekarang berlaku dan harus tetap berlaku:
  1. `@media print` membuka kembali isi `<details>` yang tadinya tertutup lewat
     `details::details-content { content-visibility: visible }`. Chromium
     menyembunyikan isi disclosure dengan `content-visibility`, bukan `display`,
     jadi memaksa `display: block` saja tidak cukup — seluruh isi temuan dan
     bukti akar masalah akan hilang dari cetak.
  2. Ritme vertikal khusus `@media print` (padding panel/seksi, `line-height`,
     margin colophon) dikompakan supaya laporan standar muat dalam **lima**
     halaman A4 dan halaman terakhir tidak hanya berisi colophon. Angka ini
     terikat isi seksi tren (tiga grafik skor + dua grafik jumlah temuan,
     masing-masing dengan tabelnya sendiri, tidak pernah terbelah antar
     halaman). Aturan ini hanya ada di dalam blok `@media print`; tampilan
     layar tidak berubah.
  3. Bukti paginasi yang sah adalah `page.pdf()` A4 plus baca-balik teks
     per halaman dari PDF itu. Potongan `page.screenshot({ clip })` bukan
     bukti: `clip` memotong aliran dokumen kontinu, bukan hasil paginasi.
- **Petunjuk gulir tabel (mobile).** Tabel benchmark menggulir di dalam
  `.table-scroll` pada layar sempit. Supaya pembaca tidak mengira tabelnya
  sudah tamat, ada satu baris petunjuk "Geser tabel ke samping untuk melihat
  seluruh kolom." yang hanya muncul di bawah `40rem`, disembunyikan di desktop,
  dan tidak ikut tercetak.

### PDF Export — Persyaratan Teknis

- **Isi dari snapshot yang sama.** `generateAgentReportPdf()` menerima snapshot
  yang identik dengan varian HTML (tanpa `variant`): data, bulan, layanan, dan
  tahun yang sama. Tidak ada fetch ulang, tidak ada pembacaan DOM.
- **Paginasi dihitung sendiri, bukan di-browser.** jsPDF tidak punya mesin
  layout, jadi `agentReportPdf.ts` punya mesin tata letak kecil: pembungkus
  baris berbasis lebar karakter, `ensureSpace()` sebelum setiap blok, dan
  `table()` yang memecah baris per-baris saat tabel melewati batas halaman.
  `doc.splitTextToSize()` sengaja tidak dipakai: pengukurannya meleset untuk
  teks tanpa spasi sehingga baris bisa melewati margin kanan. Paginasi tabel
  dibuktikan dari file yang diunduh dengan fixture tabel panjang (24 baris
  perbandingan): tabel melewati batas halaman, header kolom diulang di setiap
  halaman yang memuat baris, dan setiap baris label unik muncul utuh tepat di
  satu halaman.
- **Warna glyph ditulis eksplisit sebelum teks.** `startPage()` memasang font,
  ukuran, dan warna untuk header identitas. Tanpa itu, glyph header mewarisi
  warna sel terakhir yang digambar, sehingga halaman dengan status negatif bisa
  tercetak dengan header merah seperti peringatan.
- **Pengukuran teks.** Lebar string dihitung dari tabel lebar per karakter
  (di-cache), bukan `getTextWidth()` untuk string panjang — yang terbukti
  mengembalikan 0 untuk pengulangan karakter panjang pada jsPDF 4.2.1.
- **Penanda tak-tercetak tidak boleh terpotong.** `hardBreak()` memecah token
  per karakter, tapi satu penanda `[U+…]` diperlakukan sebagai satu atom
  (lihat [Karakter di luar WinAnsi di PDF](#karakter-di-luar-winansi-di-pdf)):
  penanda yang terbelah di batas kolom tidak bisa dibalik ke karakter aslinya.
- **Tidak ada aset remote.** Tidak ada font eksternal, gambar, atau permintaan
  jaringan; avatar berupa inisial seperti di HTML.
- **Beban bundel:** `jspdf` diimpor dinamis di dalam generator, jadi pengguna
  yang hanya mengunduh CSV/MD/HTML tidak pernah memuat pustaka PDF.
- Inline CSS, satu file HTML self-contained. The intentionally embedded CSS
  keeps offline snapshots dependency-free; a bounded CSS/template extraction
  remains a follow-up if the generator grows further.

### Prioritas

1. Implementasi dropdown + CSV + MD (cepat, text-based)
2. HTML layout cloning (lebih kompleks, butuh inspect DOM lebih dalam)

## Bukti regresi: migrasi test ke E2E (Fase 5)

Semua kontrak laporan di atas diukur dari **file yang benar-benar diunduh lewat
menu "Unduh Laporan"**, bukan dari panggilan `generateCSV/MD/HTML` dan bukan dari
`page.setContent`. Harness-nya dipakai dua spec:

| Spec | Surface yang diukur | Jumlah test |
| --- | --- | --- |
| `apps/web/e2e/sidak-agent-report-download.spec.ts` | Kontrak tiap format: isi file, cakupan, offline-safety, PDF, kegagalan ekspor, guard jaringan, kasus batas, dan diskriminasi placeholder vs pemicu formula | 29 |
| `apps/web/e2e/sidak-agent-html-export-parity.spec.ts` | Paritas **halaman live vs dokumen unduhan** + review visual live/unduhan | 2 |
| `apps/web/e2e/helpers/sidakAgentReportFixture.ts` | Harness bersama (fixture, guard fail-closed, preflight, `exportFromMenu`, pembaca offline `file://`) | bukan spec |

Helper itu sengaja diekstrak supaya fixture-nya hanya ada satu. Paritas lintas
permukaan tidak mungkin dibuktikan kalau kedua spec memakai data berbeda. Isolasi
juga dipusatkan di sana: preflight `assertLocalDevOnlyTarget()` membuktikan
target adalah dev-server Vite repo ini dengan proxy `/api` yang hanya loopback,
`openAgentDetail()` memasang mock auth + mock `/api` + guard fail-closed,
`readReportOffline()` memasang guard egress di level konteks **sebelum** `file://`
dinavigasi, dan `resolveArtifactDir()` menolak menulis artefak di dalam repo.

### Peta kontrak → bukti lama → pengganti E2E → celah yang tersisa

Nomor merujuk ke **nomor baris** `it(...)`/`it.each(...)` di
`apps/web/src/__tests__/exportAgentReport.test.ts` dan
`AgentProfileBar.test.tsx` pada **baseline commit `8866306`** (47 `it` +
2 `it.each` = 53 case di file pertama; 4 `it` di file kedua). Nomor baris dipakai,
bukan urutan, supaya setiap baris bisa langsung dibuka dan diperiksa. "Dihapus"
berarti test lamanya dihapus **setelah** pengganti E2E-nya benar-benar lulus.

Jumlah test unit yang dihapus **tidak** berpasangan 1:1 dengan E2E: **54 case unit
dihapus, sementara E2E laporan bertambah dari 1 menjadi 31 (net +30 dari baseline
`8866306`)**. Sebagian baris lama dipecah menjadi beberapa test E2E yang masing-masing
membuktikan satu kontrak berbeda (mis. filter tren menjadi keyboard-tab, filter
seri, dan cetak), sebagian baris lama lainnya hilang tanpa pengganti 1:1 karena
isinya kopy shell yang sudah discontinued. Kedua angka harus dibaca sebagai total
cakupan, bukan sebagai pasangan tukar-tukar.

| Kontrak | Test lama (baris) | Pengganti E2E (terbukti lulus) | Celah tersisa |
| --- | --- | --- | --- |
| CSV: nama file, BOM, blok profil, enam seksi | `exportAgentReport` L272 | *CSV asli: nama file, BOM, isi, dan scope* | — |
| CSV: koma/kutip/newline ter-escape utuh | L296 | *CSV asli* (kutip digandakan, sel berisi koma tetap utuh) | — |
| CSV: tidak ada sel formula di seluruh file | L315 | *CSV dari fixture berformula* + uji konsumen LibreOffice + *placeholder internal `-` tetap polos* | hanya satu konsumen spreadsheet yang teruji |
| CSV: array kosong tidak merusak file | L344 | *Agen tanpa data audit* | — |
| CSV: seksi tren + nilainya | L361 | *CSV asli* (baris tren tepat) | — |
| CSV: tabel benchmark | L376 | *CSV asli* (baris benchmark tepat) | — |
| MD: judul, heading, tabel | L393 | *Markdown asli* (tujuh `##`) | — |
| MD: `\|` di-escape (batas kolom tabel) | L412 | *Markdown asli* — fixture hostile memuat `\|` | — |
| MD: akar masalah + prioritas | L441 | *Markdown asli* | — |
| MD: tren + benchmark | L455 | *Markdown asli* | — |
| MD: empty state jujur | L470 | *Agen tanpa data audit* | — |
| HTML: varian statis, SVG tren, tanpa `<script>` | L482 | *HTML Statis self-contained* + *Tren degeneratif* | pembungkus `class="table-scroll"` dan atribut `data-series*` **tidak** diassert E2E pengganti — detail implementasi yang belum terbukti |
| HTML: geometri tren degeneratif (titik tunggal / semua nol / nilai hilang) | L503 (`it.each`, 3 case) | *Tren degeneratif* (titik tunggal, celah `null`, seri semua nol) | — |
| HTML: filter tren interaktif benar-benar menyaring | L548, L618 | *HTML Interaktif: tab keyboard, filter tren, cetak* | — |
| HTML: tiga tab audit, tanpa Simulasi | L570 | *HTML Interaktif dengan tab* + *HTML Statis self-contained* | — |
| HTML: semua panel terbaca di varian statis | L599 | *HTML Statis self-contained* + *dokumen baca* | — |
| HTML: `</script>` dari dalam data tidak dieksekusi | L718 | *Data BERBAHAYA dari label seri, cakupan benchmark, dan quickview* | — |
| HTML: self-contained, tanpa resource remote | L741 | *HTML Statis/Interaktif* (`REMOTE_RESOURCE_PATTERNS`) + guard egress `file://` | — |
| HTML: profil · tabel bulanan · temuan · tiket · akar masalah · tren | L769, L784, L799, L846, L861, L876 | *CSV/MD/HTML asli* + *paritas live vs unduhan* | kopy badge "SESUAI"/"PERBAIKAN" (L799) tidak lagi diassert — kosmetik |
| HTML: escaping karakter khusus | L816 | *HTML Statis/Interaktif* + *paritas live vs unduhan* | — |
| HTML: label tren memakai tahun terpilih | L892 | *CSV menyatakan cakupan tiap seksi* + *Tren degeneratif* | kopy `Periode: …` lama tidak lagi jadi kontrak |
| HTML: tabel data tren terlihat | L906 | *HTML Interaktif: … filter tren* (kedua tabel data tren terlihat + angka per periode) | tabel data tren bukan `sr-only`; aturan CSS `.sr-only` sendiri masih ada di stylesheet generator tetapi tidak dipakai markup laporan mana pun |
| HTML/PDF: satu metrik satu grafik, tiap grafik punya tabel sendiri | — | *HTML Statis: grafik skor & tren temuan terpisah lengkap* + *PDF: nomor tiket jadi identifier utama* (judul, satuan sumbu, legenda, caption tabel, dan kolom yang tidak saling bocor) | agregat `Total Temuan` dan rincian parameter tidak boleh digabung dalam satu trendline; tiga metrik skor juga tidak boleh digabung satu sama lain |
| HTML/PDF: nomor tiket lebih besar & lebih kontras dari parameter/nilai | — | *HTML Statis: grafik skor & tren temuan terpisah lengkap* (computed style + rasio kontras) + *PDF: nomor tiket jadi identifier utama* (ukuran font + `/BaseFont` dari run teks) | — |
| **HTML/PDF: "Perkembangan Skor" berisi skor, bukan jumlah temuan** | — | *HTML Statis: grafik skor & tren temuan terpisah lengkap* (sel tabel skor dibaca satu per satu terhadap `AGENT_SCORE_HISTORY`; tabel tren temuan tidak boleh memuat angka skor) + *PDF: nomor tiket jadi identifier utama* (`LONG_TEXT_SCORE_HISTORY` per seksi, `"74.5"` utuh, nol label/satuan keluarga temuan di seksi skor dan nol label skor di seksi tren) | sumbernya `periodSummaries` (`finalScore`/`nonCriticalScore`/`criticalScore`), bukan `personalTrend`; tidak ada test non-E2E baru — daftar putihanya belum mencakup helper skor ini |
| HTML: filter seri tidak lintas panel | — | *HTML Interaktif: tab keyboard, filter tren* (filter parameter tidak menyaring grafik skor; panel skor tanpa filter) | tiap grafik skor satu seri, jadi tidak ada yang perlu disaring |
| PDF: tabel panjang dipaginasi, header berulang, baris utuh | — | *PDF: tabel panjang dipaginasi* (fixture `agent-tabel-panjang`, 24 baris perbandingan) | — |
| HTML: celah `null` tidak dijembatani | L940 | *Tren degeneratif* (periode tanpa angka tetap terbaca sebagai kosong) | atribut `d` SVG tidak diassert — detail implementasi |
| HTML statis: tidak ada kontrol palsu | L972 | *HTML Statis adalah dokumen baca* (nol `<button>`, nol `role="tab"`) | — |
| HTML: quickview "berbagi peringkat" | L993 (`it.each`, 3 case) | *Data BERBAHAYA ... quickview* (dua agen seri) | kopy untuk 1 dan 3+ agen tidak diassert |
| **HTML: `NaN`/`Infinity` dari payload runtime** | L1045 | **TIDAK BISA** lewat E2E: `JSON.stringify` mengubah `NaN` dan `Infinity` menjadi `null` sebelum sampai ke peramban. Dibuktikan langsung — menyuntik `Number.NaN` ke fixture E2E membuat test tetap hijau | **RETAIN** satu test non-E2E (izin Fajar) |
| HTML: label cakupan benchmark ter-escape | L1101 | *Data BERBAHAYA ...* | — |
| HTML: tahun non-berhingga dinormalisasi | L1143 | ikut invarian `NaN`/`Infinity` yang diretain | ikut test yang diretain |
| HTML: tabel benchmark + semantik delta | L1183, L1198 | *CSV asli* (baris benchmark tepat) + *HTML Interaktif* (tabel benchmark terlihat) | kopy `% vs layanan sama` tidak lagi diassert di HTML |
| HTML: empty state jujur | L1260 | *Agen tanpa data audit* | — |
| HTML: mode terang | L1277 | *dokumen baca* + artefak screenshot yang diinspeksi visual | hex `#f8fafc` tidak lagi diassert |
| HTML: keadaan awal tren & temuan sama dengan halaman live | L1294, L1318, L1336, L1352 | *paritas live vs unduhan* + *HTML Interaktif: tab keyboard, filter tren* | — |
| HTML: kopy lama shell aplikasi | L699, L1369, L1413, L1430, L1453, L1489, L1505 (7 test) | Diperlakukan sebagai **assertion shell/kopy lama yang discontinued**, bukan sebagai klaim bahwa tokennya sudah hilang dari generator. Yang benar-benar tidak lagi emitted sebagai markup hanyalah token shell: `.profile-actions`, `.shell-actions`, `.context-control-bar`, `audit-dossier`, `min-width:5.5rem`, `INPUT AUDIT`, `Muat ulang`, `Unduh Laporan`, `snapshot-badge`, dan `Bulan audit terpilih` (nama `MonthRail`, `Muat ulang`, serta `Unduh Laporan` kini hanya tersisa di komentar/JSDoc sumber). Sebaliknya **`Tren Kinerja` masih emitted** sebagai `p.section-note`, dan aturan CSS **`.sr-only` masih ada** di stylesheet generator meski tidak ada markup yang memakainya, jadi assertion lama itu tidak boleh dipakai sebagai bukti bahwa generator bebas dari token tersebut. | Yang terputus adalah assertion literalnya: kopy persis tidak lagi jadi kontrak, sementara yang struktural digantikan E2E. Tujuh baris ini tujuh test yang dihapus dan tercatat, bukan test mati: `L699` dan `L1453` punya pengganti E2E yang hidup (paritas live vs unduhan + filter tren), jadi klasifikasinya kopy usang. |
| Menu: lima format + menu tidak terpotong | `AgentProfileBar` L23, L50 | *Menu Unduh Laporan tidak terpotong di layar sempit* (320/390/1440 px) | — |
| Komponen: H1 membungkus, muat ulang, ukuran avatar | `AgentProfileBar` L61, L90 | — | **tidak diubah**: di luar scope ekspor, belum ada E2E pengganti |
| Perilaku hook (bulan, layanan, phantom, root cause) | `useAgentDetail` L395–L694 (9 `it`) | — | **tidak diubah**: di luar scope ekspor, tidak ada E2E ekuivalen |
| `URL.revokeObjectURL` setelah `click()` | — | **implisit** di setiap unduhan nyata kedua spec, dengan isi file dibaca dari disk; pencatat `recordDownloadBlobs` mengamati siklus hidup blob tanpa mengurangi jalur unduhan (jumlah unduhan sengaja tidak ditulis sebagai angka tetap karena ikut berubah bersama spec) | **tidak ada test lama dan tidak ditambah test baru** — tidak ada izin untuk menulis test non-E2E baru |

### Hitungan test

Kolom **Sebelum** memakai baseline **commit `8866306`** — commit yang sudah ada
sebelum migrasi ini. Baseline itu dipin jadi nomor commit, bukan `HEAD` yang
bergerak dan bukan keadaan tengah di dalam working tree. Itu penting untuk dua
spec E2E: `e2e/sidak-agent-report-download.spec.ts` **tidak ada sama sekali** di
baseline `8866306` dan **baru ada pada perubahan ini**, jadi angka "21" yang
beredar selama fase ini bukan baseline yang sah.

| Suite | Sebelum (baseline `8866306`) | Sesudah | Catatan |
| --- | --- | --- | --- |
| `src/__tests__/exportAgentReport.test.ts` | 47 `it` + 2 `it.each` (53 case) | 1 `it` | hanya invarian non-berhingga yang diretain |
| `src/__tests__/AgentProfileBar.test.tsx` | 4 `it` | 2 `it` | 2 test kontrak ekspor digantikan E2E |
| `src/__tests__/useAgentDetail.test.tsx` | 9 `it` | 9 `it` | tidak disentuh |
| **Total non-E2E** | **62 deklarasi / 66 case** | **12 deklarasi / 12 case** | **50 deklarasi / 54 case dihapus** |
| `e2e/sidak-agent-report-download.spec.ts` | 0 (tidak ada di baseline `8866306`) | 29 | spec baru, tidak ada di baseline dan ada di perubahan ini |
| `e2e/sidak-agent-html-export-parity.spec.ts` | 1 (panggilan generator langsung) | 2 (unduhan nyata) | spec yang sama, dirombak di tempat |
| **Total E2E laporan** | **1** | **31** | **net +30 dari baseline `8866306`** |

Hitungan yang sering disalahbaca: **54 case unit dihapus**, sedangkan suite E2E
laporan sekarang berjumlah **31 test** (bertambah 30 dari baseline). Test E2E itu
**bukan** pengganti satu-per-satu dari 54 case tersebut; keduanya hanya boleh
dibandingkan sebagai total cakupan (lihat peta kontrak di atas).

Status run terverifikasi pada **2026-09-28**: `pnpm --filter @trainers/web exec playwright test e2e/sidak-agent-report-download.spec.ts e2e/sidak-agent-html-export-parity.spec.ts --reporter=line` — **31 passed (2.0m)**, exit code `0`. Preflight mengonfirmasi target Vite lokal `http://localhost:3005`; API dan auth dimock, pembacaan HTML dilakukan offline melalui `file://`, dan request font eksternal diblokir.

Catatan gaya: file ini **sudah gagal `prettier --check` di baseline `8866306`**
(dibuktikan lewat `git show 8866306:<path> | prettier --check`), termasuk pada
tabel markdown-nya. Tabel
di bagian ini sengaja memakai gaya tabel yang sama dengan tabel lain di file ini
dan **tidak** diformat ulang, supaya debt bawaan tidak menutupi diff perilaku.

Tidak ada entri suite yang perlu dihapus dari `scripts/test-core.json` atau
`scripts/test-fast.json`: ketiga suite legacy itu **tidak terdaftar** di sana
(sebelum maupun sesudah), jadi tidak ada daftar yang basi.

### Kurasi: 12 case yang tersisa

Audit read-only terakhir terhadap 12 case non-E2E yang tersisa menyimpulkan
**0 dari 12 case itu yang membenarkan penghapusan sekarang.** Rinciannya:

| Sisa case | Suite | Alasan tidak dihapus |
| --- | --- | --- |
| 1 case | `exportAgentReport.test.ts` | invarian `NaN`/`Infinity`; **tidak bisa** dibuktikan E2E (`JSON.stringify` mengubahnya jadi `null` sebelum mencapai peramban). Ini satu-satunya pengecualian non-E2E yang **disetujui Fajar** |
| 2 case | `AgentProfileBar.test.tsx` | perilaku UI komponen (H1 membungkus, muat ulang, ukuran avatar) di luar scope ekspor; belum ada E2E ekuivalen yang terverifikasi |
| 9 case | `useAgentDetail.test.tsx` | perilaku hook (bulan, layanan, phantom, root cause) di luar scope ekspor; belum ada E2E ekuivalen yang terverifikasi |

**Rekomendasi kurasi:** jangan hapus test lagi sekarang. Dua langkah yang
disarankan berurutan: (1) tulis E2E untuk perilaku yang observabel di permukaan
pengguna — kandidat paling jelas dari 11 case komponen/hook di atas — sampai
kontrak yang dimaksud benar-benar terbukti; (2) baru hapus test unit yang
kontraknya sudah terverifikasi setara. Menghapus lebih dulu berarti
membiarkan perilaku tanpa bukti sama sekali. **Tidak ada kebijakan untuk
menghilangkan seluruh unit test** — batasnya adalah "jangan tulis unit test baru
sebagai pengganti E2E", bukan "unit test tidak pernah dipertahankan".

### Bukti RED (test baru tidak lulus kosong)

- *Tren degeneratif*: menyuntik label seri berisi `NaN` membuat test gagal dengan
  pesan "nilai tidak berhingga bocor ke HTML". Versi pertama yang menyuntik
  `Number.NaN` **tetap hijau** — itu justru buktinya bahwa jalur E2E tidak bisa
  mengukur invarian non-berhingga, dan alasan test itu diretain.
- Spec paritas versi pertama gagal karena `generateHTML` + `page.setContent`
  tidak mengukur jalur unduh sama sekali, dan karena teks temuan hanya hidup di
  panel Temuan yang tersembunyi.

### Temuan produk yang ditemukan, dan mana yang sudah diperbaiki

- ✅ **SELESAI — penanda `[teks] ` pernah ikut menempel pada placeholder.**
  Untuk agen tanpa `bergabung_date`, CSV menghasilkan baris
  `Masa Kerja,[teks] -`. Placeholder `-` bukan formula, jadi penanda itu hanya
  mengaburkan nilai yang sebenarnya. Setelah Fajar menyetujui konvensi
  prefiks `[teks] `, `csvEscape` sekarang mengenali placeholder internal lebih
  dulu: nilai yang persis satu tanda hubung ditulis polos, sementara pemicu
  formula asli (`-1-1`) tetap dilindungi. E2E
  *CSV: placeholder internal `-` tetap polos, pemicu formula `-1-1` tetap
  dilindungi* membuktikannya dari dua file yang benar-benar diunduh lewat menu
  UI, dan kedua file itu dibuka lagi di LibreOffice headless sebagai bukti
  konsumen (lihat
  [Keamanan, nama file, dan kegagalan ekspor](#keamanan-nama-file-dan-kegagalan-ekspor)).
- **Observasi, bukan klaim defect:** untuk agen tanpa periode sama sekali,
  `Layanan Audit` kosong dan baris cakupan menjadi `Cakupan: Layanan • Tahun 2026`
  tanpa nama layanan. Nama layanan memang tidak ada pada keadaan itu, jadi ini
  masih konsisten dengan aturan "cakupan berasal dari data yang benar-benar
  dipakai"; perlu konfirmasi Fajar kalau tidak diinginkan.


## Referensi

- `useAgentDetail.ts` — `handleExport` (format dispatch, cakupan, nama file, error)
- `AgentProfileBar.tsx` — tombol Unduh Laporan + `exportOptions`
- `exportAgentReport.ts` — `generateCSV()`, `generateMD()`, `generateHTML()`, `buildAgentReportFileName()`, `comparisonScopeLabel()`
- `agentReportPdf.ts` — `generateAgentReportPdf()` (A4 ber-paginasi, teks yang bisa dicari)
- `AgentDetailData` type di `packages/types/src/sidak.ts`
- `docs/SIDAK_LOGIC_AND_SCORING.md` — kontrak clean session/phantom
- `docs/rebuild-logs/phase-222-sidak-agent-report-export-readability.md` — ringkasan perubahan keterbacaan PDF/HTML dan verifikasinya
- `.hermes/plans/2026-09-27_201056-sidak-agent-report-exports.md` — rencana export per fase (Fase 1-4 sudah dieksekusi; Fase 5 migrasi test legacy)
- `apps/web/e2e/sidak-agent-report-download.spec.ts` — bukti regresi unduhan nyata per format
- `apps/web/e2e/sidak-agent-html-export-parity.spec.ts` — paritas halaman live vs dokumen unduhan, plus review visual live/unduhan
- `apps/web/e2e/helpers/sidakAgentReportFixture.ts` — harness E2E bersama: fixture, guard fail-closed, preflight target, dan pembaca offline `file://`

## Perilaku Presentation Agent Detail

- Shell halaman memakai satu `max-w-7xl` dengan padding responsif 16/24/32px.
- Header memiliki satu H1 nama agen, avatar shadcn/ui 96px pada mobile dan 112px mulai `sm`, metadata yang dapat membungkus, dan aksi minimum 44px.
- Surface dan kontrol detail agen memakai primitive shadcn/ui yang dipasang melalui konfigurasi workspace: Avatar, Button, Badge, Card, Dialog, DropdownMenu, Progress, Select, Skeleton, Table, Tabs, Textarea, dan Empty sesuai konteks. Token tema aplikasi tetap mengatur warna, tipografi, dan radius.
- Tab live memiliki empat pilihan: **Ringkasan**, **Tren**, **Temuan**, dan **Simulasi**. Hanya panel aktif terlihat; panel yang sudah dibuka tetap mounted agar state lokal seperti disclosure dan filter grafik terpelihara.
- Tahun dan layanan berlaku untuk tiga panel audit. Rentang bulan hanya muncul pada Tren. Filter serta riwayat Simulasi tetap independen dari konteks audit.
- Quickview berada di panel Ringkasan dan menampilkan scope tahun + layanan. Tabel pembanding berada di permukaan Tren.
- MonthRail menandai setiap skor QA di bawah 95 persen dengan ikon peringatan kecil dan legenda target; indikator ini tetap tersedia pada snapshot HTML.
- Detail Riwayat Simulasi memakai modal lebar responsif dengan judul yang dapat membungkus dan area isi yang menggulir di dalam batas tinggi viewport.

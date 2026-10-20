# Trainers SuperApp Design System Guidelines

Dokumen ini mendeskripsikan aturan desain (Design Guidelines) yang menjadi acuan utama (Source of Truth) untuk seluruh antarmuka (UI) dalam proyek Trainers SuperApp. Desain ini diadaptasi dari pembaruan UI _Landing Page_ dan _Auth Modal_ yang berfokus pada estetika minimalis, modern, dan profesional (mengacu pada gaya desain _Linear_ atau _Vercel_).

Setiap _engineer_ atau sub-agen (AI) **WAJIB** merujuk pada dokumen ini saat melakukan implementasi atau redesain modul apapun.

> **Catatan konsolidasi:** `DESIGN.md` (root) adalah pointer ke dokumen ini. Seluruh skill (ui-ux-pro-max, impeccable) wajib membaca `docs/design.md`, bukan duplikat lain.

---

## 0. Product Type

**Product UI (Dashboard/App)** — Bukan brand landing page. Design **melayani fungsi**, bukan sebaliknya. Prioritas: readability, data density, task completion speed.

**Stack:** React + Vite + TypeScript · Tailwind CSS v4 · shadcn/ui (Base UI primitives) · Lucide React · framer-motion · Monorepo pnpm + Turborepo.

**Design Principles:**

1. **Data-first** — Tabel, kartu statistik, dan grafik adalah elemen utama. Setiap pixel harus membantu user memahami data lebih cepat.
2. **Clean & Minimal** — Hindari dekorasi yang tidak perlu. Setiap elemen punya tujuan.
3. **Konsisten** — Satu source of truth untuk spacing, warna, tipografi di seluruh modul (SIDAK, KETIK, PDKT, Telefun, Profiler, KTP, Admin).
4. **Accessible** — Kontras ≥4.5:1 untuk body text, focus states visible, keyboard navigable.

---

## 1. Design Philosophy & "No AI Slop" Rule

- **Utility-First & Minimalist:** Desain berfokus pada konten dan fungsionalitas. Hindari dekorasi yang tidak memiliki makna semantik.
- **High Contrast & Crisp:** Gunakan garis tepi (_border_) yang tegas, kontras warna yang jelas, dan hindari bayangan (_drop-shadow_) yang terlalu lembut/berlebihan.
- **NO "AI SLOP":**
  - **Dilarang** menggunakan lencana (_badge_) dekoratif dengan ikon yang tidak berguna (misal: badge "Masuk Aman" dengan ikon tameng).
  - **Dilarang** menggunakan gradien kompleks, _floating blobs_, atau warna neon yang tidak selaras, kecuali memang diinstruksikan.
  - Hierarki informasi dibangun menggunakan **Tipografi** dan **Spasi**, bukan dengan kotak/warna-warni latar belakang yang berlebihan.

---

## 2. Color Palette (CSS Variables)

Aplikasi memiliki mode _Dark_ (sebagai _default_) dan _Light_. Gunakan variabel CSS ini untuk warna, jangan menggunakan warna _hardcode_ (`#hex`).

```css
/* Mode Terang (Light) */
--bg: #fafafa; /* Background utama aplikasi */
--surface: #f5f5f5; /* Background untuk Card, Modal, Input */
--border: #e5e5e5; /* Warna garis pembatas (stroke) */
--fg: #0a0a0a; /* Teks utama (Heading, Judul) */
--fg2: #404040; /* Teks sekunder (Deskripsi, Label) */
--fg3: #707070; /* Teks tersier (Placeholder, Meta info) — ≥4.5:1 di bg/surface */
--inv-bg: #0a0a0a; /* Background kebalikan (Tombol Primary) */
--inv-fg: #fafafa; /* Teks kebalikan (Teks Tombol Primary) */

/* Mode Gelap (Dark - Default) */
--bg: #0a0a0a;
--surface: #171717;
--border: #262626;
--fg: #fafafa;
--fg2: #a3a3a3;
--fg3: #8a8a8a; /* ≥4.5:1 di bg/surface */
--inv-bg: #fafafa;
--inv-fg: #0a0a0a;
```

> **Aturan Implementasi CSS:**
> Pastikan selektor kelas `.dark` diaplikasikan dengan benar agar komponen anak mewarisi variabel _dark mode_ (contoh: `.dark .my-component { ... }`).

### Aturan Warna Tambahan

- **Jangan** pakai gray text di atas colored background — pakai darker shade dari background hue.
- **Jangan** pure black (`#000`) atau pure gray (`#808080`) — selalu tint.
- **Jangan** gradient text (`background-clip: text`) — pakai solid color.
- **Jangan** glassmorphism sebagai default — khusus untuk overlay/modal tertentu saja.
- **Jangan** cream/sand/beige body bg — itu AI default 2026. Pakai white, true off-white, atau brand color.
- **Wajib** contrast check: body text ≥4.5:1, large text (≥18px/bold ≥14px) ≥3:1.
- Light-mode cards wajib terlihat terpisah (`bg-surface-elevated`, border, atau shadow ringan) — jangan dua shade yang nyaris sama.

---

## 3. Typography

Kami menggunakan dua font keluarga dari Google Fonts: **Outfit** dan **Inter**.

### Headings (Display & Titles)

- **Font Family:** `Outfit`, sans-serif
- **Weight:** `700` (Bold), `800` (ExtraBold), `900` (Black)
- **Letter Spacing:** Sangat rapat, antara `-0.02em` hingga `-0.04em`.
- **Warna:** `var(--fg)`

### Body & UI Text (Paragraphs, Labels, Buttons)

- **Font Family:** `Inter`, -apple-system, sans-serif
- **Weight:** `400` (Regular), `500` (Medium), `600` (SemiBold)
- **Letter Spacing:** Normal atau sedikit renggang untuk label mikro (`0.02em`).
- **Warna:** `var(--fg2)` untuk deskripsi, `var(--fg)` untuk nilai/data.

### Aturan Tipografi

- **Cap body line length** di 65–75ch — jangan terlalu lebar.
- **Display heading max** `clamp()` max ≤ 6rem (~96px).
- **Pakai** `text-wrap: balance` di h1–h3, `text-wrap: pretty` di long prose.
- **Jangan** pakai dua font yang mirip tapi beda (mis: dua geometric sans-serif barengan).
- **Pair on contrast axis:** serif + sans, geometric + humanist, atau satu family beda weight.
- Data/monospace: JetBrains Mono / tabular-nums untuk angka di tabel & score.

---

## 4. Layout & Spacing

- **Container Width:** Maksimal `1400px` untuk _wrapper_ utama. `max-w-6xl`/`max-w-7xl` — jangan campur.
- **Padding/Margin:** Gunakan kelipatan `4px` atau `8px` (misal: `8px`, `16px`, `24px`, `32px`, `64px`).
- **Alignment:** Cenderung _Left-aligned_ (rata kiri) atau _Centered_ (rata tengah) untuk konten hero/fokus.
- **Flexbox** untuk 1D, **Grid** untuk 2D — jangan default Grid kalau `flex-wrap` lebih simple.
- **Responsive grids** tanpa breakpoints: `repeat(auto-fit, minmax(280px, 1fr))`.
- **Cards** jangan jadi default — pakai hanya kalau memang affordance terbaik. **Nested cards always wrong.**
- **Vary spacing untuk rhythm** — jangan semua seragam.
- **Z-index scale** semantic: dropdown → sticky → modal-backdrop → modal → toast → tooltip. Jangan `999`/`9999`.
- **Tab list:** Jaga trigger tetap selebar labelnya (`shrink-0`). Pada layar sempit, izinkan
  strip horizontal untuk di-scroll; pada layout lebar, tab boleh menjadi navigasi vertikal.
  Jangan mengecilkan label sampai bertumpuk atau terpotong.

### Spacing Scale

Pakai Tailwind spacing scale konsisten: `4` (16px), `6` (24px), `8` (32px) sebagai base unit.

| Element            | Gap/Padding        |
| ------------------ | ------------------ |
| Antar card         | `gap-6` (24px)     |
| Padding card       | `p-6` (24px)       |
| Antar section      | `space-y-8` (32px) |
| Form field spacing | `gap-4` (16px)     |
| Modal padding      | `p-6` (24px)       |

---

## 5. UI Components

### Buttons (Tombol)

- **Primary:** `background: var(--inv-bg); color: var(--inv-fg);`
- **Secondary/Ghost:** `background: transparent; color: var(--fg); border: 1px solid var(--border);` atau tanpa _border_ dengan _hover state_ `background: var(--surface);`
- **Radius:** Umumnya `6px` untuk tombol kecil/menengah, `8px` untuk tombol besar.
- **Padding:** `6px 14px` (kecil), `10px 20px` (standar), `14px 28px` (besar).
- **Font:** `Inter`, ukuran `13px` hingga `15px`, `font-weight: 500`.

### Cards & Modals

- **Background:** `var(--surface)` (atau transparan dengan _border_ jika di dalam _surface_ lain).
- **Border:** `1px solid var(--border)`
- **Border Radius:** `12px` hingga `24px` (untuk _container_ besar). **Jangan** `32px+` pada cards/sections/inputs.
- **Shadow:** Hindari _box-shadow_. Andalkan _border_ untuk memisahkan _card_ dengan _background_.
- **Modal:** title + close button di header, backdrop click & Escape nutup modal, focus trap, konten panjang pakai `overflow-y-auto`.

### Dialog Pengaturan Simulasi

Dialog pengaturan KETIK, PDKT, dan Telefun mengikuti satu pola visual dan responsif:

- Gunakan hierarki header, navigasi kategori, area konten, dan footer aksi yang konsisten.
  Field dan label bersama memakai primitive dari
  `apps/web/src/components/settings/SettingsPrimitives.tsx`; panel tiap modul tetap menangani
  data dan kontrol khususnya.
- Header dan footer tetap terlihat saat konten panjang di-scroll. Batasi tinggi dialog ke
  viewport, beri area konten `min-h-0 min-w-0`, lalu scroll konten di area itu agar tombol
  Simpan tidak terdorong keluar layar.
- Di mobile, daftar kategori boleh scroll horizontal dan setiap trigger mempertahankan lebar
  labelnya. Di layar lebar, daftar kategori dapat disusun vertikal.
- Pertahankan jarak `gap-4` (16px) antar-field. Pada bagian yang memiliki pengantar, beri jarak
  total sekitar 24px sebelum field pertama agar heading dan deskripsi tidak menempel pada form.
- Pastikan backdrop dan dialog berada di atas navigasi bawah yang fixed; navigasi bawah tidak
  boleh menutupi isi dialog atau footer.

### Ringkasan SIDAK (`/sidak`)

Beranda modul menjawab "apa yang perlu ditindaklanjuti", bukan menu pemasaran. Analisis lengkap tetap di Dashboard.

- **Kepala:** `SidakPageHeader` dengan `h1 "SIDAK"`, satu kalimat fungsi, baris cakupan, lalu satu aksi utama sesuai peran (admin/trainer `Input temuan`, leader `Lihat agen saya`) dan tautan kecil yang tersaring capability (Laporan, Jadwal shifting, Parameter QA).
- **Kondisi periode terbaru:** satu strip empat angka dari `periodMetrics` (`GET /sidak/dashboard`): rata-rata skor agen + status, agen diaudit, temuan, tiket bertemuan, masing-masing dengan kalimat perubahan dari periode sebelumnya. Grid 2×2 di ponsel.
- **Perlu tindak lanjut:** agen `atRisk` dari `GET /sidak/agents` (definisi sama dengan item Beranda "agen di bawah target"), skor terendah dulu, maksimal 8 baris lalu tautan ke Agen. Beranda tidak memicu forecast; arah per agen ditautkan ke Forecast.
- **Parameter teratas:** tiga teratas Pareto dengan jumlah dan porsi; batang memakai `bg-module-sidak`.
- **Halaman SIDAK:** daftar berbaris per kelompok kerja (Audit, Analisis, Agen, Laporan) dari `SIDAK_CHILDREN` (`group`, `description`) lewat `buildNavModel`, jadi sidebar dan beranda tidak punya daftar terpisah.
- Tiap bagian punya state memuat / kosong / gagal sendiri; saat gagal tidak ada angka yang tampil, hanya pesan + `Coba lagi`. Turunan angka ada di `utils/sidakHomeSummary.ts` (murni).

### Kepala halaman dan cakupan (SIDAK)

- **Satu kepala:** semua sub-halaman SIDAK memakai `components/sidak/SidakPageHeader.tsx` (`h1` `font-display text-2xl font-bold tracking-tight`, deskripsi `text-fg2`, baris cakupan, aksi di kanan yang turun ke bawah di layar sempit). Profil di detail agen tetap memakai nama agen sebagai `h1`.
- **Cakupan bersama:** layanan, tahun, rentang bulan, dan tim disimpan di query (`layanan`, `tahun`, `dari`, `sampai`, `tim`; `tim=ALL` = semua tim dipilih sengaja) lewat `hooks/useSidakScope.ts`, divalidasi `validateSidakScopeSearch` di router. Cakupan terakhir juga disimpan di `sessionStorage` sehingga ikut ketika pindah lewat sidebar, lalu ditulis ke URL. Bawaan: `call`, tahun berjalan, Januari s.d. bulan ini.
- Dipakai Ringkasan, Dashboard, Forecast, Ranking (tautan lama `service_type`/`year` dipetakan), Heatmap (tahun + layanan), dan Agen (tahun). Halaman yang tidak memakai salah satu filter menyatakannya di baris cakupan (`SidakScopeLine` `note`), mis. "Heatmap memakai tahun dan layanan saja".

### Entity Directory Cards (SIDAK)

Kartu per entitas diperbolehkan ketika setiap kartu adalah target navigasi yang utuh dan perbandingan antar-entitas memang menjadi pekerjaan utama user. Implementasinya wajib tetap operasional, bukan template statistik dekoratif:

- Satu kartu = satu entitas yang dapat dibuka; seluruh surface menjadi target klik dan memiliki focus state yang terlihat.
- Gunakan label domain yang eksplisit pada metrik (`Skor audit`, `Status audit`, `Periode`, `Perubahan`), bukan angka besar tanpa konteks.
- Jangan membuat nested mini-card, badge status berulang, gradient, atau shadow dekoratif di dalam kartu.
- Grid responsif harus menjaga keterbacaan: 1 kolom mobile, 2 kolom tablet, 3 kolom desktop; jangan memakai `auto-rows-fr` untuk memaksa ruang kosong.
- State tanpa data harus menyatakan kondisi sebenarnya (`Belum diaudit`), bukan angka, tren, atau placeholder yang mengarang data.
- Konten terakhir harus tetap dapat discroll melewati fixed bottom navigation dengan ruang aman yang memadai.

### Detail Agen (SIDAK)

- Navigasi `Ringkasan`, `Tren`, `Temuan`, dan `Simulasi` harus tampak sebagai kontrol interaktif, bukan teks navigasi biasa: tampilkan state aktif yang jelas serta state hover dan focus yang terlihat.
- Pertahankan lebar tiap tab sesuai labelnya. Pada layar sempit, izinkan grup tab digulir horizontal tanpa memotong label atau target interaksi.
- Susun Ringkasan dengan hierarki eksplisit: judul dan deskripsi, Quickview performa, lalu nilai skor per bulan. Gunakan divider dan jarak section untuk mengelompokkan konten; hindari badge dekoratif atau kartu tambahan yang tidak menambah makna.
- Jelaskan fungsi pemilih bulan, lalu tampilkan detail skor, tiket pengurang, dan akar masalah untuk bulan yang dipilih.
- **Bahan coaching** (`AgentCoachingBrief`) berada paling atas di Ringkasan untuk bulan terpilih: skor + status + perubahan, parameter yang paling sering muncul ("n dari m temuan"), pola akar masalah utama, dan tiga tiket pengurang terbesar yang membuka tab Temuan. Tombol `Salin ringkasan` menyalin teks yang sama. Tanpa data backend baru.

### Input Temuan (SIDAK)

Halaman kerja harian `/sidak/input` memakai satu layar, bukan wizard kartu:

- **Bar konteks** satu `fieldset` (legend `sr-only` "Konteks audit") berisi Folder, Agen, Periode, Layanan. Label terlihat di atas kontrol, tinggi kontrol minimal 44px, memakai `ui/select` dan `ui/combobox` (Agen bisa dicari nama/tim/batch). Desktop satu baris; mobile Folder dan Agen penuh, Periode + Layanan dua kolom. Kontrol berikutnya disabled sampai kontrol sebelumnya terisi.
- **Ringkasan sesi** satu baris tanpa kartu: skor live (`tabular-nums`) dengan status dari `utils/sidakScoreStatus.ts` (target 95), jumlah temuan, jumlah tiket; aksi `Sesi Tanpa Temuan`, `Import`, `Tambah` di sisi kanan (wrap di layar sempit). Rincian kategori hanya baris teks sekunder.
- **Pesan** (error, sukses, konfigurasi parameter) memakai `QaStatePanel`/`Alert`; satu blok peringatan konfigurasi. Sukses `role="status"` menyebut hasilnya ("n temuan tersimpan untuk {agen}.") dengan tautan `Buka detail agen`; error `role="alert"` dengan aksi `Coba lagi` bila bisa diulang.
- **Konfirmasi** (no. tiket kosong, parameter/baris duplikat) memakai `ConfirmDialog` lewat `hooks/useConfirmRequest.ts`, bukan `window.confirm`. Batal tidak mengirim apa pun.
- **Motion** hanya untuk expand form/import dan dimatikan saat `prefers-reduced-motion`.

### Parameter QA (SIDAK)

Halaman `/sidak/settings` mengelola versi aturan penilaian per layanan. Setiap publish mengubah skor semua agen, jadi status dan konfirmasi harus eksplisit:

- **Struktur:** `h1 "Parameter QA"`, pemilih layanan memakai `ui/tabs` (strip digulir horizontal di layar sempit), lalu dua kolom di ≥lg: riwayat versi (satu-satunya surface bertepi) di kiri, detail versi terpilih di kanan. Di mobile riwayat menjadi `Select` "Versi" di atas detail. Section dipisah divider dan `space-y-8`, bukan kartu bertumpuk.
- **Status versi:** satu peta di `settings/constants.ts` — `draft` → "Draft", `published` → "Berlaku", `superseded` → "Digantikan". Warna hanya titik dekoratif; teks tetap netral. Jangan menampilkan status mentah berbahasa Inggris.
- **Seleksi versi** diturunkan dari daftar terbaru berdasarkan `id`, bukan menyimpan objek versi, sehingga setelah publish/hapus/buat draft header langsung mengikuti status server (tombol Publish/Hapus draft hilang setelah publish).
- **Konfirmasi:** semua modal (tambah/edit parameter, hapus parameter, hapus draft, Publish) memakai `ui/dialog` — judul terhubung, Escape/klik backdrop menutup (kecuali saat menyimpan), fokus kembali ke pemicu, footer aksi tetap terlihat. Tidak ada `window.confirm`. Dialog Publish menampilkan diff terhadap versi `published` yang berlaku (parameter ditambah/dihapus/diubah dan perubahan bobot kategori; "Versi pertama untuk layanan ini" bila belum ada), periode efektif wajib, alasan opsional, dan checkbox konfirmasi sebelum tombol Publish aktif.
- **Simpan bobot kategori:** slider dan input angka mengubah state lokal; `PUT` dikirim sekali per commit (pointer up, blur, Enter, atau jeda 500 ms), hasil request lama diabaikan, status "Menyimpan…/Tersimpan" atau error inline ditampilkan, dan nilai kembali ke nilai server bila gagal.
- **Metadata parameter** (`N/A diizinkan`, `Urutan #n`, `Ambang x`, `Tertaut ke parameter lama`) berupa teks kecil netral dipisah `·`, bukan badge berwarna. Teks porsi kategori SLIK dihitung dari bobot versi, bukan angka tetap.
- Kontrol minimal 44px (`h-[44px]`; root 14px membuat `h-11` hanya 38,5px), teks sekunder minimal 12px.

### Periode QA (SIDAK)

Halaman `/sidak/periods` mengelola periode audit (bulan + tahun) yang dipakai Input Temuan, Parameter QA, dan analitik:

- **Struktur:** `h1 "Periode QA"` + satu baris deskripsi, `max-w-3xl` karena halaman ringkas. Form tambah satu baris (`Select` Bulan, `Select` Tahun, tombol `Tambah periode`), lalu daftar per tahun terbaru dulu: `h2` tahun biasa (bukan uppercase), baris per bulan dipisah divider, bukan kartu bersarang.
- **Rentang tahun** = min(tahun terlama di data − 1, tahun lalu) s.d. tahun berjalan + 1. Kombinasi yang sudah ada menonaktifkan tombol dan menampilkan teks inline "Periode {Bulan Tahun} sudah ada." (bukan kotak merah).
- **Hapus** selalu terlihat (ikon `Trash2`, `aria-label="Hapus {Bulan Tahun}"`, target 44px), lewat `ConfirmDialog` bersama di `components/ConfirmDialog.tsx` (juga dipakai Parameter QA dan Input Temuan).
- **Umpan balik** lewat `notify` (toast): sukses "Periode {X} ditambahkan./dihapus."; error berbahasa manusia. Penolakan hapus karena periode sudah punya temuan menampilkan pesan backend bila berbahasa Indonesia, selain itu pesan baku. Tidak ada banner error menempel; gagal memuat memakai `QaStatePanel` + `Coba lagi`.

### Forecast (SIDAK)

Halaman `/sidak/forecast` mengutamakan isi utama (grafik tren + proyeksi), bukan blok metrik:

- **Urutan:** `h1 "Forecast"` + deskripsi satu baris + `Perbarui` (header biasa, tidak sticky, tanpa blur) → bar filter satu blok (`DashboardFilters` `showHeader={false}` + `Periode proyeksi`, flex-wrap, tanpa judul sendiri) → `Tren layanan` → `Prioritas agen`.
- **Tren layanan:** ringkasan proyeksi _inline_ di header section (arah/rekomendasi dengan ikon, satu kalimat status data, metode · titik data · periode sebagai teks sekunder), lalu kontrol seri, grafik, dan `ForecastInsightPanel`. Tidak ada blok metrik "Proyeksi temuan" / "Kecukupan data" terpisah.
- **Kontrol seri:** satu grup tombol toggle (`aria-pressed`): "Total temuan" dan chip per parameter. Maksimal 2 seri tampil (Total dihitung sebagai satu seri); tombol yang akan melewati batas nonaktif, dan grafik tidak pernah kosong (mematikan Total tanpa parameter aktif menyalakan parameter pertama).
- **Prioritas agen:** satu baris "{n} agen siap diproyeksikan · periode {x} bulan", lalu empat kelompok (1 kolom di mobile, 4 kolom di ≥xl). Jumlah per status hanya tampil di header kelompok.
- **Satu peta status:** `components/sidak/forecast-status.ts` memegang `{label, icon, textClass, dotClass}` untuk Membaik / Memburuk / Stabil/stagnan / Pantauan beserta peta confidence; arah layanan, header kelompok, dan baris agen semuanya memakainya. Empat titik kelompok berwarna berbeda, pasangan terang/gelap mengikuti `SIDAK_SCORE_TEXT`/`SIDAK_SCORE_FILL`.
- **Istilah:** "Pantauan" (bukan Watchlist), "agen" (bukan agent), "Stabil/stagnan" satu ejaan.
- Kontrol `h-[44px]` / `min-h-[44px]`, teks halaman minimal 12px.

### Filter analitik (SIDAK)

Ranking, Heatmap, dan Laporan Data memakai satu pola filter:

- **Select:** `components/sidak/FilterSelect.tsx` (label terlihat 12px + `ui/select` Base UI, `!h-[44px]`, `aria-label` = label). Bukan `<select>` native. Opsi "kosong" dipetakan ke sentinel string (`__none__`/`__all__`) di batas komponen; state halaman dan body request tetap `""`. Opsi berkelompok memakai `groups` (pengganti `<optgroup>`). `onValueChange` hanya meneruskan pilihan pengguna, bukan reset otomatis Base UI saat daftar opsi berubah.
- **Toggle:** `ui/button` (`default` aktif, `outline` tidak) dengan `aria-pressed`, `h-[44px]`. Tombol sort header tabel: `ui/button variant="ghost"` + `aria-sort` di `<th>`.
- **Warna skor:** `sidakScoreTone` + `SIDAK_SCORE_TEXT` (target 95). Perubahan posisi Ranking: naik prioritas = `.bad`, turun = `.ok`, baru/tetap = `text-muted-foreground`; teks tetap menyebut arahnya.
- **Label** minimal 12px, tanpa `uppercase tracking`. Error memuat memakai `QaStatePanel type="error"` + `Coba lagi`; skeleton memakai `ui/skeleton`, tanpa framer-motion.
- **E2E:** pilih opsi lewat `e2e/helpers/pickSelect.ts` (klik pemicu berlabel, lalu `role="option"`); `selectOption` tidak berlaku.

### Inputs & Forms

- **Background:** `transparent` atau `var(--bg)` jika di atas `var(--surface)`.
- **Border:** `1px solid var(--border)`
- **Radius:** `6px` hingga `8px`.
- **Focus State:** Ubah warna _border_ menjadi `var(--fg)` dan hapus _outline_ bawaan peramban (`outline: none`). Hindari _ring_ biru (_default browser_).
- **Label** di atas input (bukan placeholder sebagai label), validasi inline di bawah field, submit button disabled saat loading, konfirmasi untuk destructive actions.

### Tabel (Data-heavy)

- **Fixed header** — kolom header sticky.
- **Striped rows** — `even:bg-muted/50` buat readability.
- **Sortable columns** — indikator sort arrow.
- **Pagination** — 10–25 rows/page, dengan page size selector.
- **Loading state** — skeleton rows (bukan spinner doang).
- **Empty state** — pesan jelas + CTA action.

### KETIK (`/ketik`)

- **Landing** mengikuti pola PDKT: hero dengan satu aksi utama "Mulai simulasi", menu kecil (Riwayat, Pemakaian AI, Pengaturan), dan demo chat → telaah (`KetikStageDemo`, `aria-hidden`, tombol jeda, keadaan akhir utuh saat dijeda/reduced motion). Di bawahnya: Progres latihan, Perlu tindak lanjut (sesi belum/gagal ditelaah), Fokus berikutnya (aspek terendah dari 5 sesi terakhir), dan Hasil telaah terbaru dengan kolom aspek terendah. Angka dihitung backend dari seluruh scope riwayat (bulan WIB dan lima reviewed terakhir), terpisah dari halaman daftar; tiap bagian punya state loading/error + "Coba lagi".
- **Ruang chat** menyerupai aplikasi chat layanan: nama, kota · telepon, percakapan, dan kotak balasan. Tanpa stopwatch, badge "Online", nama skenario, atau penanda tahap. "Akhiri chat" bertombol netral dengan dialog konfirmasi; merah hanya untuk aksi yang menghapus data.
- **Telaah** adalah tahap layar penuh (`?sesi=<id>&tahap=telaah`), bukan popup: transkrip bernomor di kiri dengan typo digarisbawahi di kalimatnya, hasil di kanan (skor akhir dulu, lima aspek sebagai satu daftar bar, lalu tab). Warna bar: oranye untuk skor < 75, hijau untuk ≥ 85, netral di antaranya. Di bawah 1024px hasil ditumpuk di atas transkrip. Tingkat typo memakai bahasa Indonesia (Berat/Sedang/Ringan).
- **Anotasi Telaah:** "Inti kasus" tampil di atas tab. Tab "Pertanyaan konsumen" (bawaan bila ada poin) memberi huruf A–E per pertanyaan dengan status Terjawab/Sebagian/Belum terjawab, yang dibedakan oleh gaya garis (utuh/putus/titik) dan warna sekaligus. Tab "Kalimat agen" memberi nomor per kalimat dengan Sudah tepat/Perlu diperbaiki dan "Kalimat yang lebih tepat". Kutipan ditandai di transkrip (typo tetap bertanda di dalamnya), dan setiap butir punya tombol ke pesannya. Telaah lama tanpa anotasi menulis "Belum tersedia". Daftar tab yang bisa digeser wajib `relative`, supaya base-ui menghitung posisi tab aktif dengan benar.
- **Umpan balik berbukti:** "Sudah baik" berisi kalimat agen yang berstatus tepat, kutipan dan alasannya, bukan seluruh aspek dengan skor ≥75. "Perbaiki dulu" tetap memuat kalimat yang perlu diperbaiki dan weaknesses pada semua skor. Klik nama aspek membuka tab "Penjelasan skor": alasan, bukti pesan, langkah berikutnya, dan contoh tidak disembunyikan pada skor tinggi. Review lama atau penjelasan tanpa bukti diberi keterangan alasan spesifik belum tersedia; saran dan contohnya dilabeli panduan umum/latihan.
- **Navigasi dua arah:** label huruf/angka di transkrip membuka tab dan memfokuskan butir anotasi terkait; tombol kutipan butir kembali ke pesan. Lompatan hanya menggulir area Telaah, mendukung klik berulang dan keyboard, serta menghormati reduced motion.
- **Lampiran di transkrip Telaah:** marker gambar yang dikirim pada sesi menampilkan thumbnail dan tombol pratinjau. Sumber/alt berasal dari snapshot sesi, bukan pengaturan terbaru. Dialog pratinjau berada di dalam lapisan Telaah, bisa ditutup dengan tombol atau Escape, lalu fokus kembali ke pemicu. Gambar gagal dimuat punya aksi coba lagi; lampiran historis tanpa sumber menampilkan keterangan tidak tersedia. Anotasi dan typo pada teks tetap bisa dipakai.
- **Telaah ulang:** tombol outline "Telaah ulang" di samping skor akhir, hanya untuk peran dengan izin telaah, selalu lewat `ConfirmDialog`. Selama berjalan, tahap menampilkan progres biasa. Bila gagal, hasil lama tetap tampil dengan pemberitahuan `role="alert"`, tanpa kode galat mentah.
- **Riwayat** (`/ketik/history`) adalah tabel, bukan kartu, dengan pola yang sama seperti `/pdkt/history`.
- **Pengaturan** mengikuti dialog Pengaturan PDKT: kategori Skenario (aktif/total), Karakter konsumen, Identitas konsumen, Template cepat, dan Sesi & AI. Skenario berupa daftar baris dengan sakelar aktif, pencarian, dan filter kategori; durasi, tempo, dan model AI adalah grup radio. Footer menandai "Belum disimpan"; tutup dengan perubahan, hapus, dan "Pulihkan bawaan" memakai `ConfirmDialog`, tidak pernah `window.confirm`. Sakelar, baris pilihan karakter, dan tombol radio dipakai bersama lewat `components/settings/SettingsSwitch.tsx` dan `SettingsChoices.tsx`; di layar sempit tombol baris karakter turun ke baris sendiri.

### PDKT — rincian skor Telaah

- Tampilkan label "Perlu perbaikan" untuk aspek <75; alasan dan saran tidak dibatasi ambang skor.
- Pisahkan "Alasan penilaian" beserta kutipan "Di balasan Anda" dari "Saran latihan". Alasan hanya memakai `edu.dimensionExplanations` yang diterima backend; angka skor tidak menjadi diagnosis tersendiri.
- Bila alasan dengan kutipan belum tersedia, nyatakan kondisi itu dan arahkan ke telaah ulang. Histori lama tetap dapat dibaca tanpa membuat bukti pengganti.

### Telefun (`/telefun`)

- **Landing** memakai pola KETIK: hero "Dengarkan konsumennya. Jawab dengan suara yang tenang.", satu aksi utama, menu kecil (Riwayat, Pemakaian AI, Pengaturan), dan demo panggilan → telaah (`TelefunStageDemo`, `aria-hidden`, tombol jeda, keadaan akhir utuh saat dijeda/reduced motion). Bagian data di bawahnya sama dengan KETIK, dengan skor 0–10 satu desimal ("7,6").
- **Layar panggilan** meniru softphone dan berbeda dari kepala chat KETIK: kepala tipis hanya berisi "Panggilan masuk", peserta, dan lama panggilan; data penelepon (`role="group"` "Data penelepon") ada di tengah layar dengan inisial, nama sebagai heading besar, lalu nomor telepon (mono, ≥20px) dan kota sebagai `dl` supaya agen bisa membacanya sambil bicara; satu baris status netral, meter mikrofon tipis, pita hold di bawah kepala, dan tiga tombol berlabel Indonesia di bawah dalam jangkauan ibu jari. "Akhiri" tetap merah (konvensi telepon) dan selalu lewat `ConfirmDialog`. Lama panggilan tampil kecil dan tidak pernah berupa hitung mundur.
- **Telaah** adalah tahap layar penuh (`?sesi=<id>&tahap=telaah`): pemutar + transkrip bertanda waktu di kiri, hasil di kanan; di bawah 1024px hasil ditumpuk di atas. Garis waktu hanya memuat data nyata: gelombang batang vertikal simetris yang dihitung dari rekaman itu sendiri (bagian terputar berwarna dengan garis posisi; batang datar selama dimuat), posisi, hold, dan nomor catatan trainer yang bisa diklik (memutar dari waktunya dan menunjuk catatannya). Waktu baris transkrip adalah awal giliran bicara yang dibaca dari rekaman gabungan + rekaman agen saja (jeda di tengah giliran tidak memecahnya); tanpa bunyi di dekatnya, waktu tercatat dipakai apa adanya. Label tanda kutipan (A, B, 1, 2) di transkrip adalah tombol menuju butirnya di panel hasil. Filler (istilah di UI, bukan "kata pengisi") ditandai dengan garis bawah oranye + latar tipis, hanya di kalimat agen. Warna bar: oranye < 7, hijau ≥ 8,5, netral di antaranya.
- **Anotasi isi Telaah** mengikuti KETIK: "Inti kasus" di atas tab, tab "Pertanyaan konsumen" (bawaan bila ada poin, huruf A–E, status Terjawab/Sebagian/Belum terjawab dengan gaya garis + warna) dan "Kalimat agen" (Sudah tepat/Perlu diperbaiki + "Kalimat yang lebih tepat"). Kutipan ditandai di transkrip (tanda filler tetap ada di dalamnya) dan setiap butir punya tombol ke baris bertanda waktu. Helper tanda dipakai bersama di `components/simulation/quoteMarks.tsx`. Hasil lama menulis "Belum tersedia" dan menunjuk Telaah ulang; panggilan tanpa transkrip mengatakannya.
- **Pisahkan bukti isi dan skor suara:** tab "Sudah baik"/"Perbaiki dulu" memakai verdict catatan ucapan agen (`good`/`fix`), bukan ambang skor suara. Tab "Penjelasan skor" dapat dibuka dari nama aspek dan tetap menampilkan feedback, latihan, serta contoh yang tersedia pada skor tinggi. Riwayat tanpa telaah isi menyatakan belum tersedia; feedback suara tetap terlihat. Label transkrip dan tombol kutipan mendukung navigasi dua arah, fokus ke catatan yang sama pada klik berulang, keyboard, dan reduced motion.
- **Telaah ulang:** tombol outline di samping skor suara, selalu lewat `ConfirmDialog`. Selama berjalan hasil sekarang tetap tampil dengan panel tunggu `TelefunAnalysisWait` (`role="status"`): jam berjalan mm.ss (disembunyikan dari pembaca layar), bar tak tentu (diam saat reduced motion), "Biasanya 1–2 menit, paling lama sekitar 3 menit", dan "Lebih lama dari biasanya" setelah 3 menit — tanpa persen. Panel yang sama dipakai untuk "Mulai analisis"/"Analisis ulang"; bila gagal, hasil lama tetap tampil dengan pemberitahuan `role="alert"` tanpa kode galat mentah.
- **Profil komunikasi** (tab Profil di Telaah dan panel Telefun di Monitoring) adalah diagram spider `TelefunProfileRadar` (SVG, tanpa recharts): lima sumbu berlabel Indonesia dengan skor aspek 0–10 yang sama dengan bar skor, makin ke luar makin baik; cincin skala 2–10 diberi angka di celah antara dua sumbu pertama, tanpa zona berwarna; poligon dan titik hasil satu warna (modul Telefun). Nilai mentah (kata/menit, jumlah filler) tetap di daftar skor per aspek.
- **Status analisis** selalu teks + titik warna (tidak bergantung warna saja), tanpa persen palsu.
- **Riwayat** (`/telefun/history`) adalah tabel dengan pola yang sama seperti `/ketik/history`; aksi baris sekunder ada di menu "⋯".
- **Pengaturan** mengikuti dialog KETIK: Skenario (aktif/total), Karakter konsumen, Identitas konsumen, Sesi & AI; "Belum disimpan"; semua konfirmasi lewat `ConfirmDialog`. Tiap kategori dibuka dengan judul dan satu kalimat penjelas. Skenario: baris bersakelar, pencarian, filter kategori; editor memakai sakelar "Ikuti skrip" dan tombol "Terapkan". Karakter konsumen: baris `SettingsChoiceRow` dengan kesulitan Mudah/Sedang/Sulit. Sesi & AI: durasi panggilan, tempo bicara, dan model AI sebagai grup radio (`SettingsRadioOption`, dipakai juga oleh KETIK); tantangan percakapan berupa kotak centang, maksimal 3.

### Shell & navigasi

Satu model navigasi, `buildNavModel(role)` di `components/layout/nav-config.ts`, menjadi sumber sidebar, drawer ponsel, tab bar, dan Beranda. Jangan membuat daftar modul lokal di komponen; modul dan sub-halaman tersaring capability `access.ts`.

- **Sidebar (≥1024px)** 248px berlabel: tiap item berisi ikon, nama (`nav-name`, 13px), dan fungsi singkat (`nav-sub`, 12px, `aria-describedby`). Grup: Beranda · Latihan · Kualitas · Data · Administrasi. Item aktif memakai `aria-current="page"`; SIDAK memakai `Collapsible` dan terbuka otomatis di `/sidak/*`.
- **Rail ciut** 64px, disimpan di `localStorage` (`trainers.sidebar.collapsed`). Label tetap ada untuk pembaca layar; nama tampil lewat Base UI Tooltip. Lebar sidebar tidak dianimasikan.
- **Menu akun** di kaki sidebar dan drawer (Base UI Menu): Pengaturan akun, Ganti tema (menu tetap terbuka), Keluar. Teks "Keluar" memakai `--fg`; hanya ikonnya merah karena `--destructive` tidak mencapai 4.5:1 sebagai teks kecil.
- **Ponsel (<1024px):** header dengan breadcrumb (root "Beranda") dan tombol menu; tab bar berisi 4 tab sesuai peran + "Lainnya"; drawer adalah Base UI Dialog berisi daftar navigasi yang sama.
- **Fokus:** skip link "Lewati ke konten"; setelah navigasi fokus pindah ke `h1` halaman baru (atau region "Konten halaman") dan `document.title` mengikuti breadcrumb.
- Target kontrol minimal 44px — karena root font 14px, pakai `h-[44px]`/`min-h-[44px]`, bukan `h-11`. Teks shell minimal 12px; `text-xs` di root 14px hanya 10,5px.

### Beranda (`/dashboard`)

- **Staff (admin/trainer/leader):** salam + tanggal (WIB) + periode QA terakhir, dan aksi utama sesuai peran → **Perlu tindakan** (`GET /api/v1/home/attention`, daftar berbaris dengan hitungan dan CTA) → kartu **Tren temuan QA** (bulan awal–akhir tahun berjalan, default Januari s.d. bulan ini/YTD; filter layanan; ringkasan angka; kurva halus monokrom dengan area tipis, bulan terakhir disorot beserta angkanya, dan proyeksi putus-putus yang hanya tampil bila rentang berakhir di bulan ini) di samping **Temuan per layanan** (jumlah atas rentang yang sama) → **Aktivitas terakhir** (hanya baca) + **Pintasan**. Dua baris terakhir memakai grid 2:1 yang sama, dan kepala section setinggi 44px supaya kolomnya sejajar.
- **Proyeksi di Beranda hanya dibaca dari cache** (`POST /sidak/dashboard/forecast` dengan `cacheOnly`). Membuat atau memperbarui prediksi, serta filter tahun lain, ada di halaman SIDAK (`/sidak/forecast`, `/sidak`).
- **Ponsel (≤560px):** aksi header selebar layar; CTA "Perlu tindakan" turun ke bawah teks; label sumbu X grafik dipendekkan/dijarangkan agar tidak bertumpuk.
- **Agent:** aksi "Lanjutkan KETIK" → **Skor QA saya** (audit terakhir berlabel layanan/periode, kalimat skor vs target 95 dan perubahan, tiga parameter teratas + saran, grafik monokrom skala 0–100 dan tabel tren maksimal enam audit) → **Latihan** (modul yang diizinkan, kuota/reset WIB) → **Riwayat sesi** gabungan KETIK + PDKT + Telefun, lima terbaru. Skala asli ditulis (/100 atau /10). QA satu panel dengan dua kolom di desktop, ditumpuk di ponsel; tanpa leaderboard atau tautan ke data staff. Akun belum tertaut dan belum punya audit mendapat panel netral yang berbeda; error memiliki retry dan tidak menutup Latihan.
- Setiap section memuat datanya sendiri dengan state loading, kosong, dan error + "Coba lagi"; gagal satu section tidak mengosongkan section lain. Data tidak dikarang: kolom yang tidak ada di respons tidak ditampilkan.

### Landing publik (`/`)

Landing adalah satu-satunya surface persuasif; modul operasional tetap mengikuti aturan produk di atas.

- **Hero** hanya wordmark "Trainers SuperApp" pada papan split-flap 2 × 8 (`components/landing/SplitFlapBoard.tsx`). Intro melewati nama modul berwarna token `--module-*` lalu mendarat di wordmark (±4 detik); hover/ketuk mengocok ulang. Huruf maksimal ±4,4rem, tetap di bawah batas display 6rem.
- **Papan split-flap** dekoratif dan `aria-hidden`; karakter dirender lewat `data-ch` + `::before`, teks yang dibaca pembaca layar berasal dari `sr-only` di sebelahnya. Status papan tersedia di `data-state` / `data-frame` untuk E2E.
- **Modul** (`components/landing/ModuleStory.tsx`): papan kode modul yang mendarat saat terlihat, lalu langkah yang digulir menggerakkan panggung contoh sticky (data ilustrasi, `aria-hidden`). Di ≤900px panggung menempel di atas dan langkah aktif dihitung dari area di bawahnya.
- **Pengecualian motion terbatas:** intro papan dan adegan panggung boleh lebih dari 0,6 detik, tetapi setiap animasi otomatis selesai atau berhenti dalam ±5 detik (WCAG 2.2.2), dan `prefers-reduced-motion: reduce` menampilkan keadaan akhir tanpa animasi.
- Aksi masuk/akses tetap memakai `AuthContext` dari `LandingAuthClient`; tamu melihat `Masuk ke Platform` / `Ajukan Akses`, sesi aktif melihat `Buka Dashboard`.

---

## 6. Motion & Animation

- **CSS Transitions:** Gunakan transisi cepat dan halus. `transition: all 0.15s ease;` (terutama untuk efek _hover_ pada tombol dan tautan).
- **Framer Motion (React):**
  - Untuk elemen yang muncul (_Entrance animation_), gunakan efek _staggered fade-up_ (muncul perlahan dari bawah).
  - Parameter standar: `initial={{ opacity: 0, y: 15 }}`, `animate={{ opacity: 1, y: 0 }}`, `transition={{ duration: 0.4, ease: "easeOut" }}`.
  - Hindari animasi yang melompat-lompat, berputar, atau memakan waktu lebih dari `0.6s`.
- **Motion harus intentional** — jangan asal animasi; jangan animate CSS layout properties kalau tidak perlu.
- **Ease out** pakai exponential curves (`ease-out` quart/quint/expo). **No bounce, no elastic.**
- **Reduced motion WAJIB** — setiap animasi butuh `@media (prefers-reduced-motion: reduce)`.
- **Stagger items** dalam satu list itu legitimate — yang jadi tell adalah uniform reflex (setiap section masuk dengan animasi identik).
- **Reveal animations** harus enhance yang sudah visible — jangan gate content visibility di belakang class-triggered transition.
- **Ilustrasi berulang di halaman modul** (mis. tiga tahap PDKT di `/pdkt`) boleh berputar lebih dari 5 detik hanya bila bersifat dekoratif (`aria-hidden`, penjelasan di `figcaption` `sr-only`), punya tombol jeda/putar yang terlihat (WCAG 2.2.2), dan saat dijeda atau `prefers-reduced-motion: reduce` menampilkan keadaan akhir yang utuh, bukan bingkai setengah jadi.

---

## 7. Contrast & Readability Rules

Untuk memastikan antarmuka mudah dibaca oleh semua pengguna (aksesibilitas tinggi):

- **Contrast Ratio:** Teks utama (`var(--fg)`) harus memiliki kontras minimal 7:1 terhadap latar belakang. Teks sekunder/deskripsi (`var(--fg2)`) harus memiliki kontras minimal 4.5:1.
- **Muted Text:** Gunakan `var(--fg3)` hanya untuk informasi non-kritis/meta-info. Jangan gunakan `opacity` di bawah `0.8` pada teks yang bertumpuk dengan latar belakang terang.
- **Font Size Minimum:** Teks yang dibaca minimal `12px`. `text-xs` sudah 12px lewat token `--text-xs` (root 14px membuat `text-xs` bawaan hanya 10,5px); jangan pakai ukuran manual di bawahnya (`text-[11px]`, `text-[0.8rem]`, `fontSize: 11`). Label formulir memakai berat sedang (`font-medium`). E2E menegakkannya lewat `MIN_TEXT_PX` di `apps/web/e2e/helpers/typographyFloor.ts`. Pengecualian: mockup dekoratif `*MotionFrame` dan kanvas ekspor Profiler (slide/PPTX).

---

## 8. Anti-Patterns (Absolute Bans)

❌ Side-stripe borders (`border-left` >1px sebagai accent di cards)
❌ Gradient text (`background-clip: text`)
❌ Glassmorphism as default
❌ Hero-metric template (big number + small label + gradient accent)
❌ Identical card grids (icon + heading + text, repeated)
❌ Tiny uppercase tracked eyebrow ("ABOUT" "PROCESS" "PRICING") di atas setiap section
❌ Numbered section markers as default scaffolding (01/02/03)
❌ Text overflow container — test heading copy di setiap breakpoint
❌ `border: 1px solid X` + `box-shadow` dengan blur ≥16px pada elemen yang sama
❌ `border-radius: 32px+` pada cards/sections/inputs
❌ Hand-drawn / sketchy SVG illustrations
❌ `repeating-linear-gradient` stripe backgrounds

---

## Kesimpulan

Jika Anda ragu dalam mendesain, pilih jalur yang paling sederhana dan paling bersih. Hapus garis, latar belakang, atau dekorasi yang tidak penting. Biarkan tipografi, jarak (_whitespace_), dan kontras mengambil alih hierarki visual.

---

## Referensi

- Skill **UI/UX Pro Max** (`ui-ux-pro-max`) — workflow & decision record untuk fitur UI baru.
- Skill **Impeccable** (`impeccable`) — audit/polish gate untuk perubahan UI.
- Component library: **shadcn/ui** (cek registry sebelum bikin custom).

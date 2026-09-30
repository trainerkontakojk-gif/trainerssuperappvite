# Phase 224 — SIDAK Jadwal Shifting WFM

**Tanggal:** 2026-09-29 · **Rute:** `/sidak/jadwal-shifting`

## Perubahan

- Menambahkan endpoint harian dan bulanan read-only ke API SIDAK. Backend membaca PostgREST dengan proyeksi kolom minimum, origin HTTPS yang di-allowlist secara exact, redirect ditolak, batas tanggal/baris, dan credential server-only.
- Membatasi akses ke role `admin` dan `trainer` pada navigasi, route frontend, dan API. Error integrasi tetap berupa state gagal, bukan data kosong.
- Menambahkan dua format UI: **Hari ini** (jam shift dari mapping yang disepakati dan interval istirahat dari slot `LB` berurutan) serta **Kalender** (matriks agen × tanggal dengan kode shift WFM dan rekap per agen).
- Memperbarui dokumentasi kontrak di `docs/architecture.md`, `docs/modules.md`, `docs/auth-rbac.md`, dan `docs/deployment.md`; konfigurasi contoh ada di `.env.example`.
- Tidak ada migrasi database, penyimpanan jadwal, operasi tulis, atau pemanggilan AI.

## Verifikasi

- Playwright E2E terarah, memakai Vite lokal, fixture sintetis, stub upstream loopback, dan network guard fail-closed: **87 passed**. Tidak ada host WFM/Supabase live yang diakses oleh tes.
- `pnpm lint`: lulus tanpa error; warning lint yang tercatat berasal dari file lain di repo.
- `pnpm build`: lulus untuk API, Telefun, dan Web.
- `git diff --check`: lulus. Link Markdown lokal yang diperiksa seluruhnya resolve.
- Prettier lulus untuk `docs/architecture.md`, `docs/modules.md`, `docs/auth-rbac.md`, dan file log ini. `docs/deployment.md` tetap diperiksa secara surgical karena formatter akan merombak alignment tabel lain di luar perubahan WFM.

## Batas Rilis

Produksi tetap **NO-GO** sampai jenis/izin key WFM, kebijakan akses/RLS, env runtime service API, dan smoke test role `admin`/`trainer` pada environment target diverifikasi. E2E lokal bukan bukti izin produksi. Tidak ada deployment yang dilakukan.

## Update — 2026-09-30 — urutan daftar harian

Permintaan Fajar: daftar pada format **Hari ini** dirapikan ("contoh dari tim leader atau layanan").

- Daftar masuk/libur dikelompokkan dua tingkat: **layanan → team leader → nama A–Z**. Urutan layanan mengikuti `SCHEDULE_SECTIONS` (Call → Digital Chat → Email → Leader), bukan urutan kedatangan baris. Grup tanpa layanan dan grup tanpa TL selalu diletakkan paling akhir; barisnya tetap ditampilkan, tidak disembunyikan.
- Tabel detail di bawah daftar memakai urutan yang sama (`orderBySectionThenTeamLeader` di route), jadi daftar dan tabel tidak punya urutan masing-masing.
- Header layanan tetap tampil ketika filter bagian layanan memilih satu bagian, supaya struktur daftar tidak berubah bentuk saat filter diganti.
- Format **Kalender** tidak berubah: baris agen tetap A–Z tanpa grup layanan/TL.
- Pengelompokan murni di klien. Tidak ada perubahan kontrak API, tipe bersama, proyeksi query upstream, operasi tulis, atau pemanggilan AI.

## Verifikasi update

- `apps/web/e2e/sidak-jadwal-shifting.spec.ts`: **36 passed**. RED dijalankan lebih dulu — tahap TL 2 gagal / 31 lulus, tahap urutan tabel 1 gagal / 33 lulus, tahap layanan 4 gagal / 32 lulus.
- `tsc --noEmit` (web), ESLint, Prettier, dan `pnpm build` (**3/3 task**) lulus; `git diff --check` bersih.
- Bukti visual diambil dari Vite lokal dengan fixture sintetis dan network guard fail-closed; tidak ada host WFM/Supabase live yang diakses.

Rilis tetap pada batas yang sama: produksi **NO-GO** sampai gate environment target di atas diverifikasi.

## Update 2 — 2026-09-30 — gate thermo-nuclear (Pi) dan perbaikannya

Gate `thermo-nuclear` dijalankan read-only lewat Pi (`pi -p --tools read,bash --thinking max`) atas commit `010e361`. Verdict awal: **NEEDS_FIX**, tiga temuan P2.

1. **E2E belum membuktikan urutan.** Fixture grup hanya memuat satu agen per pasangan (layanan, TL), sehingga pengurutan nama di dalam grup dan pengurutan beberapa TL dalam satu layanan bisa rusak tanpa membuat test gagal. **Diperbaiki**: test baru dengan satu layanan berisi dua TL × dua agen dalam urutan input teracak, memeriksa grup, urutan datar daftar, dan tabel detail.
2. **Kapitalisasi `channel` membuat grup kembar.** `call` dan `Call` menjadi dua header untuk layanan yang sama, sementara filter bagian layanan sudah mencocokkan tanpa peduli kapitalisasi. **Diperbaiki**: nama bagian yang dikenal dikanonikalisasi ke label `SCHEDULE_SECTIONS` sebelum grouping; bagian tak dikenal tetap apa adanya.
3. **Baris ganda per agen dihitung sebagai beberapa "orang".** Keputusan Fajar: **status quo** — semua baris tetap tampil dan ikut terhitung, tidak dideduplikasi diam-diam, karena duplikat adalah cacat data sumber dan aturan konflik antar-baris belum ditetapkan. Keputusan ini ditulis eksplisit di `ScheduleGroups.tsx` dan `docs/modules.md` supaya tidak diangkat ulang sebagai temuan baru.

Bukti bahwa test urutan benar-benar punya daya tangkap (mutation check): komparator nama, komparator TL, dan peringkat bagian layanan masing-masing dibalik satu per satu — ketiganya membuat test gagal, lalu dikembalikan.

Verifikasi setelah perbaikan: **38 passed** (RED dulu untuk kasus kapitalisasi: 1 gagal / 37 lulus), `tsc --noEmit` web, ESLint, Prettier, `pnpm build` (3/3 task), dan `git diff --check` lulus. Gate Pi dijalankan ulang setelah commit perbaikan.

## Update 3 — 2026-09-30 — Hari ini hanya tabel dan urutan detail

Permintaan pemilik menggantikan daftar masuk/libur yang dicatat pada update sebelumnya:

- Format **Hari ini** sekarang hanya memiliki tabel detail; `ScheduleGroups.tsx`, panel Masuk/Libur, dan seluruh subjudul layanan/TL dihapus.
- Tabel diurutkan per baris menurut shift `S1 → H → S2 → S3 → S4 → Off → kode tak dikenal`, lalu layanan (Call → Digital Chat → Email → Leader → lainnya), TL A–Z (kosong terakhir), dan nama A–Z.
- `Off` hanya kode kosong, `OFF`, `LIBUR`, `LBR`, dan `CUTI`. Kode lain—termasuk `TBCCI` dan label jam—tetap terlihat setelah Off serta diurutkan A–Z. Filter layanan tetap case-insensitive dan berjalan di klien.
- Kalender bulanan tidak berubah; agen tetap diurutkan A–Z. Tidak ada perubahan API, shared types, proyeksi WFM, operasi tulis, atau pemanggilan AI.
- Komentar helper layanan kini membedakan peringkat bagian kanonik dari nilai channel sumber yang tetap dirender.

## Update 4 — 2026-09-30 — gate thermo-nuclear putaran ketiga

Gate ketiga atas `582c931` memberi verdict **PASS** dengan satu temuan P3: assertion “Hari ini hanya tabel” masih hanya menolak heading `h2`–`h4`, sehingga daftar/panel lama tanpa heading bisa lolos. Assertion diperkuat: sekarang `data-testid` sisa panel Masuk/Libur ditolak eksplisit, dan `ul`/`ol` di dalam wilayah Hari ini tidak boleh ada.

Dibuktikan dengan mutation check: elemen panel lama disuntikkan kembali ke route, test gagal dengan pesan “sisa panel Masuk/Libur tidak boleh dirender lagi”, lalu route dipulihkan identik. Verifikasi setelahnya: E2E **32 passed**, `tsc --noEmit` web, ESLint, Prettier, dan `git diff --check` lulus.

### E2E RED → GREEN dan daya tangkap urutan

- RED sebelum implementasi: **30 passed / 2 failed** dari 32. Kontrak tabel-saja mendeteksi 22 elemen daftar/subjudul lama; test urutan mendeteksi urutan tabel lama yang mengikuti layanan/TL dan bukan prioritas shift.
- GREEN setelah implementasi: **32/32 passed** pada `apps/web/e2e/sidak-jadwal-shifting.spec.ts`; screenshot UI sintetis disimpan di `artifacts/sidak-jadwal-shifting-e2e/hari-ini-tabel-saja.png` (lokal, gitignored) beserta ringkasan `verification.md`.
- Mutation check test urutan: pembalikan komparator **shift, layanan, TL, dan nama** satu per satu, serta menonaktifkan pengurutan A–Z kode shift tak dikenal, masing-masing menyebabkan E2E terfokus **1 gagal** pada assertion urutan. Comparator asli dipulihkan setelah tiap mutation.
- Seluruh request browser pada E2E memakai mock API lokal/fixture sintetis, dengan preflight dev-server Vite dan network guard fail-closed; tidak ada WFM/Supabase live yang diakses.

### Gerbang akhir

- `pnpm --filter @trainers/web test:e2e -- e2e/sidak-jadwal-shifting.spec.ts`: **32 passed**.
- `pnpm --filter @trainers/web exec tsc --noEmit`: exit 0.
- `npx eslint apps/web/e2e/helpers/sidakJadwalShiftingHarness.ts apps/web/e2e/sidak-jadwal-shifting.spec.ts apps/web/src/components/sidak/jadwal-shifting/schedule-sections.ts apps/web/src/routes/sidak/jadwal-shifting.tsx`: exit 0.
- `pnpm lint`: exit 0, 4/4 tasks; warnings existed in unrelated API/Web files (0 errors).
- `npx prettier --check` untuk seluruh file kode/dokumentasi yang diubah: exit 0.
- `pnpm build`: exit 0, **3 successful / 3 total**; direktori `dist` dan `tsbuildinfo` yang sudah ada dipulihkan setelah build sesuai batas perubahan artefak.
- Impeccable dan thermo-nuclear review: **PASS**, tanpa temuan sisa dalam scope. Screenshot mengonfirmasi tabel tunggal; E2E juga mencakup tabel aksesibel dan viewport sempit.
- `git diff --check`: exit 0; tidak ada whitespace error.

## Update 5 — 2026-09-30 — kalender bisa dipakai, urutan istirahat

Dua keluhan pemakaian nyata dari Fajar.

**1. Kolom nama kalender "samar" dan scrollbar horizontal tidak ketemu.**
Kolom nama yang sticky memakai latar `bg-muted/60` (60% opak), jadi kode
tanggal dari kolom sebelah terbaca menembus nama agen saat matriks digulir.
Selain itu wadah matriks setinggi seluruh isi: pada 30 agen tingginya ~1412px
sementara layar 800px, sehingga scrollbar horizontal baru ketemu setelah
menggulir halaman ~900px.

Perbaikan di `MonthMatrix.tsx`: kolom nama header jadi opak (`bg-muted`) dan
header tanggal ikut menempel (`sticky top-0`); wadahnya dibatasi
`max-h-[calc(100dvh-24rem)]` dengan `overflow-auto`, sehingga scrollbar
horizontal selalu berada di dalam layar dan konteks kolom tetap terlihat saat
isi digulir.

**2. Urutan tabel Hari ini belum memakai jadwal istirahat.**
Urutan sekarang: shift → bagian layanan → **jam mulai istirahat** → team leader
→ nama. Jam istirahat dibaca dari slot `LB` pertama, jadi di dalam satu layanan
yang break lebih dulu tampil lebih dulu; baris yang belum punya istirahat
diletakkan paling belakang (bukan dianggap break 00:00). Helper
`breakStartMinutes()` dan `LONG_BREAK_CODE` ditambahkan di `schedule-sections.ts`,
dan kode `"LB"` yang tadinya literal di route sekarang memakai konstanta itu.

Bukti yang bisa direproduksi dari commit ini: E2E
`sidak-jadwal-shifting.spec.ts` (test urutan istirahat, latar kolom nama opak,
wadah gulir dibatasi tinggi di enam ukuran layar, lantai tinggi di jendela
pendek) dan unit test `sidak-jadwal-shifting-order.test.ts`. Mutation check:
comparator istirahat dibuang, latar nama dibuat tembus, dan batas tinggi dihapus
— ketiganya membuat test terkait gagal.

Klaim "data asli WFM 78 baris" pada versi pertama catatan ini berasal dari
pengamatan manual di luar repo (query baca-saja ke upstream WFM) dan **tidak
bisa direproduksi dari commit**; anggap sebagai pengamatan belum terverifikasi,
bukan bukti.

## Update 6 — 2026-09-30 — layanan jadi kunci urutan paling luar

Koreksi dari pemilik: urutan yang benar adalah **seluruh baris satu layanan
tampil berurutan lebih dulu**, di dalamnya baru urut per shift, lalu istirahat.
Sebelumnya shift yang jadi kunci paling luar, sehingga baris Call muncul
terpisah-pisah (Call/S1, lalu Call lagi di H) dan tabel terlihat tidak
berurutan per layanan.

Urutan final: **layanan → shift → jam mulai istirahat → TL → nama**.
Perubahannya hanya menukar dua comparator di `orderScheduleRows()`; urutan shift
dan aturan istirahat tidak berubah. Test `urutan tabel mengikuti layanan, shift,
TL, lalu nama dari baris acak` diperbarui ke kontrak baru dan dibuktikan RED
dulu, lalu GREEN. Mutation check: menukar kembali kedua comparator membuat test
itu gagal.

## Update 7 — 2026-09-30 — menutup temuan gate thermo-nuclear putaran keempat

Gate putaran keempat atas `66c8641` memberi verdict **NEEDS_FIX** dengan empat
temuan; semuanya dikerjakan.

1. **P2 — batas slot istirahat tidak seragam.** `breakStartMinutes()` menerima
   slot berapa pun ≥ 0, sementara `longBreakIntervals()` di route hanya
   merender slot 0–95. Akibatnya baris bisa diurutkan seolah punya istirahat
   yang tidak pernah muncul di kolom jam. Sekarang keduanya memakai konstanta
   bersama `SLOTS_PER_DAY = 96`; helper juga menolak `activities` yang hilang,
   bukan array, atau berisi slot bukan bilangan bulat.
2. **P2 — batas tinggi wadah hanya teruji di satu ukuran layar.** Diukur ulang:
   ruang di atas matriks 300px (≥1024px), 368px (768px), dan 454px (≤480px) —
   jadi `100dvh - 24rem` tidak cukup di layar sempit. Cadangan sekarang
   responsif (`34rem` dasar, `28rem` ≥768px, `24rem` ≥1024px) dengan lantai
   `min-h-[14rem]` supaya matriks tidak mengerut jadi nol di jendela pendek.
   E2E kini memeriksa tepi bawah wadah di enam ukuran layar (1280×800, 1280×720,
   1024×768, 768×1024, 480×800, 390×844) plus satu kasus jendela 400px.
   Catatan yang sempat salah: root font-size aplikasi ini 14px, bukan 16px, jadi
   `rem` di CSS ini 14px — perhitungan pertama keliru karena mengasumsikan 16px.
3. **P3 — uji gulir terlalu longgar.** `overflowX !== "visible"` juga meloloskan
   `hidden`/`clip`; sekarang harus `auto` atau `scroll`.
4. **P3 — klaim "data asli" tanpa bukti.** Klaim itu ditandai sebagai pengamatan
   di luar repo yang belum terverifikasi (lihat Update 5) dan digantikan bukti
   yang bisa direproduksi dari commit.

## Update 8 — 2026-09-30 — menutup temuan gate putaran kelima

Gate putaran kelima atas `2220a2e` memberi verdict **NEEDS_FIX** dengan dua
temuan.

1. **P2 — lantai tinggi mengalahkan batas atas di jendela pendek.** `min-h-[14rem]`
   lebih besar daripada `max-h` di jendela 400px, sehingga lantai menang dan
   tepi bawah wadah tetap keluar layar — tujuan "scrollbar horizontal
   terjangkau" batal di jendela pendek. Lantai diturunkan ke `min-h-[5rem]`;
   fungsinya sekarang hanya mencegah matriks mengerut jadi nol, bukan menjamin
   tinggi nyaman. E2E memeriksa dua sifat terpisah: di 1280×400 tinggi ≥ lantai
   **dan** tepi bawah ≤ 400; di 1280×300 hanya lantai yang dijamin (batas atas
   bisa jatuh ke nol karena ruang di atas sudah menghabiskan layar) — batas ini
   ditulis terbuka di komentar test.
2. **P3 — klaim "78 baris" masih bercokol di bagian "Fakta terverifikasi" plan.**
   Baris itu dikeluarkan dari daftar fakta dan dipindah ke blok **Pengamatan
   belum terverifikasi (di luar repo)**, sejalan dengan catatan di Update 5.

Mutation check: lantai dibalik ke `14rem` → test 400px gagal; lantai dibuang →
test 300px gagal.

## Update 9 — 2026-09-30 — menutup temuan gate putaran keenam

Gate putaran keenam atas `12f1041` memberi verdict **NEEDS_FIX** dengan tiga
temuan.

1. **P2 — invariant tepi bawah belum umum.** Perbaikan sebelumnya hanya terbukti
   di 1280×400; kombinasi lain (1280×300, 390×400) belum diuji, dan di ukuran
   itu tepi bawah memang bisa keluar layar. Setelah diperiksa, sebagian kasus
   **mustahil secara fisik**: di 390×400 kontrol di atas matriks saja memakai
   ~454px, jadi tidak ada nilai CSS yang bisa menaruh tepi bawah di dalam layar.
   Karena itu kontraknya ditulis eksplisit dan diuji dengan predikat:
   - selalu: tinggi wadah ≥ lantai 5rem (matriks tidak runtuh);
   - bila jendela memuat kontrol + lantai: tepi bawah ≤ tinggi layar;
   - bila tidak: tinggi wadah harus **tepat setinggi lantai**, bukan tumbuh
     menutupi layar.
   E2E kini menguji **sembilan** ukuran layar (1280×800, 1280×720, 1024×768,
   768×1024, 480×800, 390×844, 1280×400, 1280×300, 390×400) dengan konstanta
   kontrak `FLOOR_REM = 5` (bukan angka hasil pengukuran), supaya memperbesar
   lantai membuat test GAGAL alih-alih test menyesuaikan diri.
2. **P3 — `docs/modules.md` terlalu umum.** Klaim "scrollbar terjangkau" kini
   menyebut pengecualian viewport pendek beserta angka nyatanya.
3. **P3 — klaim probe manual masih bercokol di bagian historis plan.** Dua
   tempat ("Gate checkpoint 2026-09-28" dan "Design") sekarang menyatakan
   eksplisit bahwa 78 row dan 260 slot `LB` berasal dari pengamatan manual di
   luar repo yang tidak dapat direproduksi dari commit.

Mutation check putaran ini: lantai dibalik ke 14rem → 3 test gagal (termasuk
1280×400 yang dulu lolos); lantai dibuang → 2 test gagal; cadangan dasar kembali
24rem → 2 test gagal.

## Update 10 — 2026-09-30 — wadah kalender mengukur ruang, bukan menebak

Gate putaran ketujuh atas `4a6b042` memberi verdict **NEEDS_FIX** dengan tiga
temuan, dan temuan pertamanya menunjuk kelemahan mendasar.

1. **P2 — cadangan tetap tidak tahan perubahan tinggi kontrol.** Batas tinggi
   memakai cadangan tetap 34/28/24rem, sementara kontrol di atas matriks bisa
   tumbuh (teks diperbesar, label membungkus, zoom). Selisih di layar sempit
   hanya ~22px sebelum wadah melewati tepi layar. Perbaikannya: tinggi wadah
   sekarang **diukur** — `maxHeight = window.innerHeight − posisi-atas-wadah −
   16px`, dengan lantai 5rem — dan dihitung ulang saat viewport berubah, saat
   elemen di atas matriks berubah ukuran (ResizeObserver pada parent + saudara
   wadah), saat `<head>` berubah (MutationObserver), dan setelah font selesai
   dimuat. Pengukuran dijadwalkan ke frame berikutnya (`requestAnimationFrame`)
   karena observer bisa terpanggil sebelum layout baru dihitung — tanpa ini tepi
   bawah sempat meleset ~17px saat teks diperbesar.
   Kelas `max-h` lama tetap ada sebagai cadangan sebelum JS jalan.
2. **P3 — toleransi ±8px membuat kontrak lantai tidak tepat.** Toleransi
   dihapus: sekarang lantai di CSS harus tepat `5rem` (dicek dari
   `getComputedStyle().minHeight`), tinggi wadah di jendela pendek harus tepat
   setinggi lantai (`toBeCloseTo`), dan di jendela yang muat, sisa ruang di
   bawah wadah harus 0–24px — terlalu pendek atau terlalu tinggi sama-sama
   gagal.
3. **P3 — plan masih memuat kontrak lama (`max-h-[calc(100dvh-24rem)]`,
   mundur 24rem tunggal).** Bagian "Urutan tabel dan perilaku gulir" dan bagian
   batas diperbarui; `docs/modules.md` juga menyebut pengukuran adaptif.

Test baru: `dengan teks diperbesar, kontrol boleh tumbuh tetapi tepi bawah wadah
tetap di dalam layar` (root font-size 14px → 20px di 480×800). Test ini sempat
GAGAL dua kali selama pengerjaan (957px lalu 817px dari 800px) dan itu yang
membuktikan perbaikannya benar-benar bekerja, bukan sekadar lolos.

## Update 11 — 2026-09-30 — mengukur terhadap area gulir, bukan window

Gate putaran kedelapan atas `05793bb` memberi verdict **NEEDS_FIX** dengan tiga
temuan; yang pertama membongkar asumsi dasar.

1. **P2 — halaman ini tidak menggulir di window.** Pengukuran memakai
   `window.innerHeight`, padahal isi halaman menggulir di
   `section[aria-label="Konten halaman"]` dan `<main>` sudah menyisakan ruang
   untuk tab bar mobile. Akibatnya tepi bawah wadah bisa melewati tepi area
   gulir dan tertutup tab bar di layar mobile.
   Perbaikan: `findScrollport()` mencari area gulir yang benar-benar memotong
   isi, dan tinggi dihitung dari `clientHeight` area gulir dikurangi posisi atas
   wadah. Dua penjaga dipakai bersama: leluhur harus benar-benar memotong
   (`scrollHeight > clientHeight`) dan tingginya tidak melebihi layar. Tanpa
   penjaga, pengukuran sempat memakai pembungkus setinggi **1780px** alih-alih
   area gulir **744px** (gejala: `max-height` jadi 1521px).
   Suku `scrollTop` juga dihapus dari rumus dan listener `scroll` tidak dipakai,
   supaya tinggi wadah tidak berubah-ubah saat pengguna menggulir.
2. **P3 — pembersihan RAF belum lengkap.** Sekarang ada flag `cancelled` yang
   dicek sebelum menjadwalkan maupun menjalankan pengukuran, dan frame yang
   tertunda dibatalkan saat unmount.
3. **P3 — `waitForTimeout(300)` di test rawan flaky.** Diganti `expect.poll`
   yang menunggu pengukuran ulang benar-benar menghasilkan tinggi yang benar.

E2E juga berubah: pengukuran kini dilakukan terhadap area gulir pada **posisi
gulir paling atas** (kasus terburuk) dan sekali lagi setelah digulir penuh, plus
cek tab bar mobile. `min-height` sekarang datang dari `FLOOR_REM` (satu sumber,
inline) sehingga kelas CSS dan perhitungan JS tidak bisa berbeda.

Mutation check: pengukuran dikembalikan ke window ⇒ 3 test gagal; pengukuran
tidak ditunda ke frame berikutnya ⇒ 1 gagal; `FLOOR_REM` 5 → 14 ⇒ 9 gagal.
Dua penjaga internal di `findScrollport()` (syarat "benar-benar memotong" dan
"setinggi layar") **tidak** bisa dibuktikan terpisah lewat mutasi — masing-masing
redundan di tata letak sekarang; yang terbukti lewat mutasi adalah perilaku
akhirnya (mengukur terhadap area gulir, bukan window).

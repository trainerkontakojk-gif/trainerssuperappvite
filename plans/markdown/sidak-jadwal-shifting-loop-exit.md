# SIDAK Jadwal Shifting — keluar dari loop review

**Status:** implementasi dan bukti teknis D1–D10 selesai lokal; final spec `--repeat-each=2 --retries=0` lulus 100/100 dan quality gates lulus. **Exit gate:** P3 putaran 10 sudah ditriase — daftarnya disediakan pemilik dan ketiganya tertutup/moot (lihat _Update 13_ di `docs/rebuild-logs/phase-224-sidak-jadwal-shifting.md`) — dan reviewer independen dijalankan sebagai putaran exit setelah batch ini. Keputusan commit/push tetap milik pemilik. Tidak ada commit/push/deploy. Plan ditulis 30 September 2026 terhadap `b9e8795c579cd1b5bd9d77934d3091c0488ef2bd`, branch `main`, working tree awal bersih, 7 commit di atas upstream lokal. Tidak ada fetch sehingga posisi remote belum diverifikasi. Rantai: `66c8641 → 2220a2e → 12f1041 → 4a6b042 → 05793bb → 2b6cf32 → b9e8795`.

Plan ini tidak mengizinkan commit, push, atau deploy. Revisi D2 di bawah adalah keputusan eksplisit pemilik selama sesi implementasi; hasil akhir tetap harus memenuhi seluruh D1–D10 dan aturan exit.

## Revisi pemilik — D2 (2026-09-30)

Keputusan Fajar: syarat awal D2 bahwa seluruh dokumen tidak boleh bergulir **digantikan** oleh kontrak workspace berikut, dengan pengecualian terukur untuk rail sidebar bersama. Riwayat syarat awal dipertahankan di sini; tidak dianggap sebagai acceptance aktif.

> **D2 historis, superseded:** kalender mensyaratkan workspace dan dokumen tidak bergulir vertikal/horizontal (`scrollHeight <= clientHeight + 1`, `scrollWidth <= clientWidth + 1`), serta `workspace.scrollTop` dan `window.scrollY` persis 0 setelah aksi scroll matriks/kontrol.

Bukti alasan revisi pada Chromium 1280×400, root font 14px: workspace dan shell masing-masing `clientHeight = scrollHeight = 344px`, `scrollTop = 0`; kontrol dan matriks menggulir sendiri. `.sidebar-rail` memiliki `scrollHeight = 605px` dan `clientHeight = 400px` (overflow 205px), sementara `documentElement.scrollHeight = 605px`. `Layout.tsx`, `Sidebar.tsx`, dan `.sidebar-rail` global tidak diubah oleh batch ini; sumbernya berlaku lintas halaman. Mengubah shell/sidebar atau memotong dokumen global berada di luar scope dan berisiko memengaruhi navigasi.

D2 aktif, objektif dan dapat diperiksa:

1. Sebelum serta sesudah aksi scroll pada kontrol/matriks, workspace (`[aria-label="Konten halaman"]`) dan shell Kalender memenuhi sumbu x/y: `scrollHeight <= clientHeight + 1`, `scrollWidth <= clientWidth + 1`, `scrollTop === 0`, dan `scrollLeft === 0`.
2. Kontrol dan matriks memakai `overflow-x/y: auto` atau `scroll` sesuai arah konten dan benar-benar dapat digulir; bukti E2E harus menunjukkan perubahan posisi `scrollTop`/`scrollLeft` yang positif melalui keyboard/drag, bukan hanya computed style.
3. Pengecualian dokumen hanya sebesar rail overflow yang diukur dari `.sidebar-rail`: `sidebarOverflow = max(0, railContentHeight - railBoxHeight)`. `documentElement.scrollHeight <= viewportHeight + sidebarOverflow + 1`, dan `abs(documentElement.scrollHeight - viewportHeight - sidebarOverflow) <= 2px`. E2E mencatat dimensi rail untuk membuktikan sumbernya; poin 1 harus lulus pada pengukuran yang sama.
4. Geometri matriks, padding/gap, dan hubungan tab bar pada D3 **tidak dilonggarkan**.

## Requirement

Tutup tiga keluhan Fajar dalam satu perubahan terintegrasi:

1. Identitas agen kalender opak dan tetap terbaca ketika tanggal bergulir di belakangnya.
2. Tepi bawah wadah kalender, tempat scrollbar horizontal berada, langsung terjangkau tanpa menggulir halaman.
3. Tabel Hari ini: **layanan → shift → awal istirahat → TL → nama**. Jangan mengubah aturan bisnis yang sudah benar.

### Akar masalah loop

| Penyebab                                                           | Bukti/pola                                                                                                                                                               | Pemutus loop                                                                                                                           |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Proses: gate dipakai sebagai penemu requirement baru setiap patch  | Menurut riwayat pemilik, sembilan review NEEDS_FIX; kasus satu viewport berkembang menjadi viewport pendek, teks besar, scrollport, lalu koordinat saat scroll           | Bekukan requirement, matriks kondisi, severity, dan anggaran review sebelum implementasi; semua temuan baru harus dipetakan ke kontrak |
| Proses: definisi selesai ikut berubah                              | Assertion `if (metrics.fits)` masih membolehkan scrollbar keluar layar; klaim manual dan dokumentasi berulang turut membuka gate                                         | Hilangkan acceptance bersyarat; bedakan bukti commit, bukti E2E sintetis, pengamatan historis, dan readiness produksi                  |
| Proses: scope mengalir dan bukti terlalu dekat dengan implementasi | Tes mengikuti FLOOR_REM/rumus pengukuran; perbaikan lokal memicu perubahan klaim di beberapa dokumen                                                                     | Oracle membaca hasil UI dengan nilai acceptance tetap; satu paket kode/tes/docs, satu reviewer dengan kontrak yang sama                |
| Teknis: JS membangun ulang layout browser                          | `MonthMatrix.tsx` memiliki `findScrollport`, state `maxHeight`, ResizeObserver, MutationObserver, rAF, font-ready, rumus posisi + scrollTop, cleanup, serta cadangan CSS | Serahkan pembagian tinggi ke CSS; hapus seluruh lifecycle pengukuran                                                                   |
| Teknis: kontrol tidak dibatasi, matriks dipaksa punya lantai       | Kontrol yang tumbuh dapat menghabiskan viewport; `Math.max(floor, available)` memilih ukuran yang secara fisik tidak muat                                                | Batasi area kontrol dan izinkan kontrol menggulir; matriks memperoleh ruang tersendiri                                                 |

Temuan lama memang nyata; masalahnya bukan reviewer terlalu teliti. Patch menutup satu kondisi tanpa mengurangi jumlah asumsi. CSS menghapus kelas bug koordinat, stale measurement, observer/RAF cleanup, dan font-ready; tetap perlu membuktikan overflow, sticky, dan akses keyboard.

## Design

### Keputusan: layout CSS lokal pada mode Kalender

`apps/web/src/components/Layout.tsx:127–158` sudah menyediakan `h-screen`, `<main>` kolom flex dengan `min-h-0`, AppHeader `shrink-0`, serta workspace `flex-1 min-h-0`. Main menyisakan tab bar mobile melalui padding `44px + safe-area`. Route Jadwal Shifting adalah anak root langsung (`apps/web/src/router.tsx:251`), sehingga tidak ada shell SIDAK tambahan yang harus diukur.

**Pilih memanfaatkan tinggi workspace tersebut; jangan mengubah Layout.tsx.** Saat Kalender aktif, route menjadi `h-full min-h-0 overflow-hidden`; shell internal kolom flex memenuhi tinggi induk. Semua isi selain matriks masuk area kontrol yang maksimum 50% tinggi isi shell dan mempunyai `overflow-auto`. Matriks mengisi sisanya. Saat Hari ini aktif, pertahankan layout dokumen dan gulir halaman yang ada.

Bentuk target di `apps/web/src/routes/sidak/jadwal-shifting.tsx` (kelas hanya untuk mode Kalender):

```tsx
// Workspace milik Layout sudah mempunyai tinggi terbatas.
<div
  data-testid="jadwal-shifting-page"
  className="h-full min-h-0 min-w-0 overflow-hidden"
>
  <div className="mx-auto flex h-full min-h-0 w-full max-w-[110rem] flex-col gap-[8px] p-[16px]">
    <section
      data-testid="jadwal-shifting-calendar-controls"
      aria-label="Kontrol kalender jadwal"
      tabIndex={0}
      className="min-h-0 min-w-0 max-h-[50%] shrink-0 overflow-auto"
    >
      {/* Judul, tabs, bulan, pencarian, filter, jumlah/asOf/rentang,
          warning truncated, dan dua catatan yang sekarang di bawah matriks. */}
    </section>
    <section
      data-testid="jadwal-shifting-view-calendar"
      aria-label="Tampilan kalender"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
      {/* MonthMatrix mengisi slot ini; state nonmatriks boleh overflow-auto. */}
    </section>
  </div>
</div>
```

`MonthMatrix`: `flex-1 min-h-0 min-w-0 overflow-auto rounded-lg border border-border`. Tidak ada inline min/max-height, batas berbasis viewport/rem, ref untuk tinggi, atau effect pengukuran. Pertahankan table, caption, testid, rekap, sort nama kalender, sticky header, corner `z-30`, header tanggal `z-20`, nama baris `z-10`, dan latar opak `bg-muted`/`bg-background`. Semua leluhur antara slot dan matriks harus `min-h-0`; jangan menyisipkan wrapper dengan tinggi intrinsik tak terbatas.

**Trade-off yang disengaja:** di jendela pendek/teks besar kontrol perlu digulir tersendiri. Dua catatan di bawah kalender dipindahkan ke akhir area kontrol, dengan teks tetap sama dan urutan kontrol lainnya tetap. Ini mengubah komposisi lokal secukupnya untuk menjamin matriks; tidak menyembunyikan warning atau menghapus kontrol. Padding/gap 16px/8px hanya jarak, bukan perkiraan tinggi header. Cap 50% membatasi persaingan ruang, bukan menebak tinggi kontrol.

| Opsi                                                                              | Biaya/risiko                                                                                                                                                        | Keputusan                                                                                                                                                                              |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSS lokal dengan kontrol terbatas                                                 | Sedang: susun ulang JSX Kalender dan sesuaikan oracle E2E; dua area gulir butuh label/fokus                                                                         | **Dipilih**; tidak mengubah shell lintas modul atau API                                                                                                                                |
| Shell opt-in di Layout.tsx: workspace flex/overflow-hidden khusus kalender, h-dvh | Sedang–besar: routing mode today/calendar, navigasi antar-route, header/tab bar, dan regresi modul lain harus dibuktikan; h-dvh juga mengubah mobile browser chrome | Belum masuk akal karena shell sekarang sudah mempunyai tinggi terbatas. Jika browser membuktikan rantai h-full tidak terikat, STOP dan revisi desain; jangan diam-diam menyentuh shell |
| Fixed max-height/calc di route tanpa menyusun kontrol                             | Murah, tetapi breakpoints/zoom/kontrol tumbuh tetap membutuhkan pengecualian viewport pendek                                                                        | Ditolak karena mempertahankan kelas bug utama                                                                                                                                          |
| Scrollbar horizontal kedua di atas tabel                                          | Murah–sedang tetapi perlu sinkronisasi scrollLeft/lebar, keyboard, resize; hanya memindahkan akses scrollbar                                                        | Ditolak; menambah state dan tidak mengatasi viewport matriks                                                                                                                           |
| Pertahankan pengukuran JS lalu tambah observer/test                               | Patch murah, total pemeliharaan mahal; koordinat dan lifecycle tetap terbuka                                                                                        | Ditolak; bukan exit arsitektural                                                                                                                                                       |

### Kontrak urutan yang dibekukan

`schedule-sections.ts:189` sudah memakai layanan sebagai pembanding pertama. Pertahankan:

- Layanan: Call, Digital Chat, Email, Leader; lain A–Z; kosong terakhir. Layanan dikenal/filter tidak peka kapitalisasi; teks sumber tetap.
- Di dalam layanan: S1, H, S2, S3, S4, bucket Off, kode asing A–Z. Off = kosong/OFF/LIBUR/LBR/CUTI.
- Awal LB valid paling kecil × 15 menit, lalu tanpa LB; slot integer 0–95 saja (`SLOTS_PER_DAY = 96`). Slot 0 = 00:00, bukan tanpa data. Render interval memakai batas yang sama.
- TL A–Z, kosong terakhir, lalu nama menurut kolasi Indonesia. Kalender tetap nama A–Z, bukan urutan harian.

## Tasklist — satu batch implementasi

### 1. Bekukan baseline dan perimeter

**File dibaca:** plan ini, `docs/AGENT_WORKFLOW.md`, `docs/design.md`, `Layout.tsx`, kedua file komponen, route, harness/spec, unit order, `apps/web/playwright.config.ts`, dan tiga dokumen pada langkah 5.

Jalankan dari root: `git status --short`, `git rev-parse HEAD`, `git diff --stat b9e8795..HEAD -- apps/web/src/components/Layout.tsx apps/web/src/components/sidak/jadwal-shifting apps/web/src/routes/sidak/jadwal-shifting.tsx apps/web/e2e/sidak-jadwal-shifting.spec.ts apps/web/e2e/helpers/sidakJadwalShiftingHarness.ts`. Drift wajib diperiksa sebelum mengedit. Jangan stash/reset/clean/rebase tujuh commit atau mengambil pekerjaan lain. Ambil verdict putaran 10 jika sudah tersedia sebagai input triase, bukan izin menambah scope.

Klasifikasi implementasi **Lane C** (bug/layout lokal multi-file); muat `trainers-superapp-tdd` sebelum edit dan `impeccable` sebelum final gate. Gunakan Graphify hanya jika tersedia dengan query simbol tepat; fallback baca imports/route/source, jangan regenerate cache untuk tugas plan. Tidak ada dependency/API eksternal baru sehingga Context7 tidak perlu. Skill wajib yang tidak tersedia adalah blocker, bukan alasan mengganti workflow dengan Superpowers.

**Bukti langkah:** SHA dan daftar dirty paths disimpan dalam laporan implementasi. Jika Layout perlu diubah, scope menjadi lintas modul/Lane D dan rencana ini berhenti.

### 2. Tulis oracle E2E, lalu buktikan RED

**File:** `apps/web/e2e/sidak-jadwal-shifting.spec.ts`; harness hanya bila fixture perlu diperluas di `apps/web/e2e/helpers/sidakJadwalShiftingHarness.ts`.

- Ganti `measureCalendar` dengan pembaca geometri tanpa mutasi scroll. Element wajib ditemukan; ukur workspace, shell, kontrol, slot/matriks, tab bar visible dan document. Jangan menghitung `fits` atau meniru rumus produksi.
- Ganti tes sembilan viewport/lantai dengan kontrak DoD di bawah, beri judul mengandung `[loop-exit]`. Gunakan BIG_MATRIX_ROWS sintetis 30×30 yang sudah ada. Loop font 14/20/28px di dalam kasus viewport yang sama; jangan membuat suite paralel baru.
- Ganti tes pengukuran saat scroll menjadi: kontrol dan matriks benar-benar digulir (`scrollTop > 0` dibuktikan), ubah font/resize, dan pastikan batas tetap benar. Tes membaca keadaan, aksi scroll berada di test sendiri. Jangan memaksa workspace scrollTop bukan nol jika kontrak baru memang membuat workspace tidak bergulir.
- Perkuat tes opasitas untuk corner **dan th nama baris**, mode light/dark. Normalisasi computed background melalui canvas 1×1 dan periksa alpha 255; warna tidak terbaca/null gagal, jangan default alpha ke 1. Buktikan sticky/hit-test setelah scroll horizontal dan vertikal; simpan screenshot posisi tumpang tindih.
- Gabungkan fixture urutan layanan dan break agar setiap kunci saling bertentangan. Expected nama/interval literal, jangan memakai `orderScheduleRows` sebagai oracle. Sertakan LB 0, 95, -1, 96, 106, 12.5; kode `lb`/non-LB, duplikat/tidak urut, tanpa break, tie TL/nama, layanan asing/kosong, dan shift asing. Slot 95 harus tampil `23:45–24:00`, slot tidak valid tidak membentuk interval/kunci sort.
- Pertahankan coverage existing role, loading/empty/error, filter, GET-only, rekap, search, navigasi bulan, dan perpindahan view. Lengkapi state Kalender loading/error/empty/truncated/tidak ada hasil agar kontennya bisa dicapai melalui slot/control scroll. Tambahkan font besar + keyboard untuk mencapai kontrol paling akhir dan tombol kembali Hari ini.
- Hilangkan `waitForTimeout(400)`. Gunakan assertion Playwright/poll dengan batas 5 detik; font harus persis diterapkan dahulu. Tidak ada skip/retry/if-fits untuk acceptance.

**Bukti RED:** focused `[loop-exit]` gagal pada kode b9e8795 karena matriks keluar workspace di viewport pendek/struktur kontrol belum ada. Simpan log/trace kegagalan. Assertion urutan/opasitas yang sudah benar boleh GREEN; jangan merusak produk untuk memaksa semua tes RED.

### 3. Ganti struktur, hapus pengukuran sekaligus

**File:** `apps/web/src/routes/sidak/jadwal-shifting.tsx`, `apps/web/src/components/sidak/jadwal-shifting/MonthMatrix.tsx`.

- Terapkan struktur Design hanya ketika `view === "calendar"`; lepaskan `pb-16` serta wrapper tinggi intrinsik pada cabang itu. Header/tabs dipakai sekali pada view aktif; jangan menduplikasi ID/landmark/control di DOM tersembunyi.
- Pindahkan metadata/truncated dan kedua catatan ke kontrol. State loading/error/empty/tidak ada hasil masuk slot `flex-1 min-h-0 overflow-auto`; matriks memakai overflow-nya sendiri.
- Hapus `FLOOR_REM` (sekarang berada di MonthMatrix, bukan schedule-sections), `VIEWPORT_MARGIN_PX`, `findScrollport`, height state/ref/effect, ResizeObserver/MutationObserver, rAF, font-ready/resize listener, inline height, serta seluruh kelas cadangan max-h/calc. Sisakan `useMemo` untuk data. Tidak menambah fallback JS.
- Jangan mengubah `schedule-sections.ts`, renderer LB, API, atau Layout; urutan saat ini sudah benar. Gunakan token dan sticky stack yang ada.

**Bukti GREEN:** focused `[loop-exit]` exit 0; kemudian seluruh spec UI exit 0, tidak ada test skipped. Source check pengukuran pada tabel DoD mengembalikan tidak ada match. Jika height tidak terikat, STOP; jangan menambah offset/observer baru.

### 4. Kurasi coverage sesudah GREEN

**File:** `apps/web/e2e/sidak-jadwal-shifting.spec.ts`, `apps/web/src/__tests__/sidak-jadwal-shifting-order.test.ts`; `scripts/test-core.json`/`scripts/test-fast.json` hanya jika ada entry yang benar-benar menjadi stale.

Gabungkan tes geometri lama ke kontrak yang baru; hapus kontrak lantai 5rem dan pengecualian fits. Setelah E2E urutan/interval terbukti, hapus hanya kasus unit order yang kontraknya sudah digantikan oleh E2E. Pertahankan kasus isolated yang belum punya padanan, termasuk immutability array, activities null/undefined/non-array, dan default comparator tanpa accessor: tidak ada input/UI path yang setara, comparator tidak diubah. Jangan menambahkan/menjalankan unit untuk itu. Pada baseline tidak ditemukan entry nama file order di kedua manifest; jangan mengedit manifest tanpa match aktual. `vitest.config.fast.ts` memakai glob, bukan entry khusus.

**Bukti langkah:** rerun focused E2E hanya bila tesnya berubah; tabel kontrak→judul E2E→kasus unit dihapus/dipertahankan dalam laporan. Tidak wajib mempertahankan angka 46; semua kontrak yang relevan harus dipertahankan. Tidak menjalankan Vitest, termasuk failure pre-existing `telefun-live-session-auth`; bukan blocker perubahan ini.

**Catatan ukuran file yang disengaja:** spec pemilik sudah 1.934 baris di baseline; tes D1–D7 tetap dikurasi di sana agar tidak membuat suite/fixture paralel (sesuai rencana dan pemilik suite), menggantikan geometri yang tumpang tindih. Harness juga sudah 1.188 baris dan batch hanya menambah metadata delay pada fixture existing. Ekstraksi luas ke file/suite baru akan memperbesar scope dan tidak diperlukan untuk kontrak batch ini.

### 5. Sinkronkan satu kali dan verifikasi final

**File:** `docs/modules.md` paragraf Jadwal Shifting, `plans/markdown/sidak-jadwal-shifting.md` bagian kontrak gulir, `docs/rebuild-logs/phase-224-sidak-jadwal-shifting.md`.

- Canonical modules dan plan lama: ganti kontrak adaptive measurement/5rem/cadangan 34/28/24rem/if-fits dengan layout CSS lokal, cap kontrol, batas viewport, dan trade-off gulir kontrol. Urutan harian tetap seperti kontrak di atas.
- Log phase: tambahkan satu status final yang menunjuk kontrak baru; beri penanda bahwa catatan Update 5–12 tentang algoritme tinggi adalah riwayat yang sudah digantikan. Jangan menulis ulang hasil historis seolah dites ulang.
- Simpan backlog di section `Di luar cakupan dan tindak lanjut` pada log phase, dengan ID, severity, bukti, pemilik Fajar, alasan ditunda, dan status. Pengamatan manual 78 row tetap historis/nonreproducible; jangan menambahkan klaim data WFM asli. Artefak final hanya fixture sintetis.

**Bukti langkah:** Prettier check scoped, tsc, root typecheck/lint/build, `git diff --check` exit 0; pemeriksaan diff memastikan hanya scope di atas. Jalankan `impeccable` atas acceptance yang sama, gabungkan temuannya sebelum gate independen pertama, bukan menjadi putaran requirement baru.

## DoD objektif

Semua wajib; reviewer membaca artefak pada SHA yang sama dengan diff final.

| ID                  | Pernyataan yang harus terbukti                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Cara membuktikan                                                                                                                                                                                                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------ | -------------- | ---------------- | --------------------- | -------------------- | ------------ | --------------------- | ----------- | --------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1                  | Viewport CSS px: 1280×800, 1280×720, 1024×768, 768×1024, 480×800, 390×844, 1280×400, 1280×300, 390×400. Setiap ukuran lulus pada root font 14, 20, 28px yang dibuktikan computed-style persis                                                                                                                                                                                                                                                                                                                                                                    | Parameter E2E `[loop-exit]`, tanpa `fits`, skip, retry, atau hard wait. Ini uji reflow/teks besar; jangan mengklaim browser zoom fisik telah diuji                                                                                                                                                                        |
| D2 (revisi pemilik) | Workspace dan shell tidak bergulir pada x/y, dengan `scrollHeight <= clientHeight + 1`, `scrollWidth <= clientWidth + 1`, `scrollTop = scrollLeft = 0` sebelum/sesudah aksi scroll. Kontrol/matriks memakai overflow internal dan benar-benar bergulir. Tinggi dokumen boleh melebihi viewport hanya sebesar `max(0, railContentHeight - railBoxHeight)` pada `.sidebar-rail`: documentElement `scrollHeight <= viewportHeight + sidebarOverflow + 1` dan selisihnya cocok dengan sidebar overflow dalam toleransi 2px. Dokumen tetap tanpa horizontal overflow. | E2E mengukur workspace, shell, rail, kontrol, matriks dan documentElement sebelum/sesudah; perubahan scroll posisi dibuktikan via keyboard/drag. Poin workspace harus lulus agar exception dokumen berlaku. Toleransi 1 CSS px hanya untuk geometri, 2px hanya untuk mencocokkan overflow sidebar. D3 tidak dilonggarkan. |
| D3                  | Semua sisi matriks berada dalam workspace dengan toleransi 1px; bottom juga <= tabBar.top + 1px bila tab bar visible. Jarak bottom ke batas workspace = 16px ±1px; padding shell 16px dan gap 8px persis                                                                                                                                                                                                                                                                                                                                                         | Geometri browser; buktikan top dan bottom sekaligus supaya elemen yang sudah keluar layar tidak lolos                                                                                                                                                                                                                     |
| D4                  | Dengan A = tinggi isi shell (clientHeight minus padding atas/bawah), kontrol <= A/2 + 1px; slot/matriks >= A/2 − 8 − 1px dan clientHeight >= 64px pada seluruh matriks D1. `min-height` matriks persis 0px; tidak ada kontrak 5rem                                                                                                                                                                                                                                                                                                                               | Computed style + rect/clientHeight. Oracle mengukur hasil, tidak membaca konstanta produksi. Wrapper tidak boleh mengambil ruang tak tercatat                                                                                                                                                                             |
| D5                  | Fixture BIG_MATRIX_ROWS benar-benar overflow kedua arah; matriks overflowX/Y = auto atau scroll. Keyboard ArrowRight mengubah scrollLeft dari 0 ke >0; vertical scroll >0; kontrol yang overflow juga benar-benar scroll >0 dan semua kontrol/catatan dapat dicapai                                                                                                                                                                                                                                                                                              | E2E keyboard, scroll dan focus; ambil metrik sebelum/sesudah. Scroll tidak mengubah tinggi/batas matriks lebih dari 1px; resize/font boleh mengubah tinggi tetapi tetap memenuhi D2–D4                                                                                                                                    |
| D6                  | Alpha background corner dan nama baris = 255, opacity = 1, light/dark; posisi sticky header atas/nama kiri meleset <=2px dari inner border matriks setelah scroll; hit-test area identitas menemukan sel identitas/descendant                                                                                                                                                                                                                                                                                                                                    | E2E computed style, canvas alpha, rect, elementsFromPoint; screenshot light/dark tumpang tindih dilampirkan tanpa snapshot suite                                                                                                                                                                                          |
| D7                  | Expected urutan nama/interval literal sesuai kontrak, filter tidak menambah request; state dan navigasi view/bulan tetap benar; warning/copy tidak hilang atau terpotong permanen                                                                                                                                                                                                                                                                                                                                                                                | Owning spec UI lengkap, fixture sintetis, `expectIsolation`; audit GET-only dan guard mock tetap aktif                                                                                                                                                                                                                    |
| D8                  | Tidak ada algoritme tinggi kalender                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `rg -n 'findScrollport                                                                                                                                                                                                                                                                                                    | FLOOR_REM | VIEWPORT_MARGIN_PX | ResizeObserver | MutationObserver | requestAnimationFrame | cancelAnimationFrame | fonts\.ready | getBoundingClientRect | innerHeight | maxHeight | regionRef | max-h-\[calc' apps/web/src/components/sidak/jadwal-shifting/MonthMatrix.tsx` menghasilkan **exit 1, tanpa match**; inspeksi route memastikan tak dipindahkan ke tempat lain |
| D9                  | Layout dan helper urutan tidak berubah oleh batch baru                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `git diff --exit-code b9e8795 -- apps/web/src/components/Layout.tsx apps/web/src/components/sidak/jadwal-shifting/schedule-sections.ts` exit 0 sebelum commit; setelah commit bandingkan SHA baseline..final                                                                                                              |
| D10                 | Semua quality gates exit 0, E2E final dua kali berturut pada kode yang sama, retries 0 dan skipped 0; tracked test-results tidak berubah                                                                                                                                                                                                                                                                                                                                                                                                                         | Perintah di bawah + JSON report + diff paths. Keberhasilan lokal tidak dianggap bukti hosting/WFM produksi                                                                                                                                                                                                                |

### Perintah dan artefak untuk eksekutor

Jalankan hanya pada sesi implementasi terotorisasi, bukan saat menulis plan ini. Jalankan Vite web saja dari terminal tersendiri: `pnpm --filter @trainers/web dev --host 127.0.0.1 --port 3005 --strictPort`. Jangan start root `pnpm dev` dengan env produksi. Config Playwright akan memakai server lokal yang sudah hidup jika `CI` kosong. Harness wajib lulus preflight Vite/proxy loopback dan mock guard; jangan melonggarkannya. Mock auth/profile memakai alamat Supabase tetapi harus di-fulfill lokal, bukan diteruskan ke server tersebut.

```bash
# Dari apps/web. Artefak ke /tmp; jangan biarkan output default menghapus tracked test-results.
sidak_artifact_dir=$(mktemp -d /tmp/sidak-loop-exit.XXXXXX)
CI= PLAYWRIGHT_JSON_OUTPUT_NAME="$sidak_artifact_dir/red.json" npx playwright test e2e/sidak-jadwal-shifting.spec.ts --grep '\[loop-exit\]' --output="$sidak_artifact_dir/red" --reporter=list,json --retries=0 --trace=on
# Sesudah implementasi: expected exit 0.
CI= PLAYWRIGHT_JSON_OUTPUT_NAME="$sidak_artifact_dir/green.json" npx playwright test e2e/sidak-jadwal-shifting.spec.ts --grep '\[loop-exit\]' --output="$sidak_artifact_dir/green" --reporter=list,json --retries=0 --trace=on
# Final setelah kode/tes/docs tetap: semua tes dua kali, expected exit 0.
CI= PLAYWRIGHT_JSON_OUTPUT_NAME="$sidak_artifact_dir/final.json" PLAYWRIGHT_HTML_OUTPUT_DIR="$sidak_artifact_dir/html" PLAYWRIGHT_HTML_OPEN=never npx playwright test e2e/sidak-jadwal-shifting.spec.ts --output="$sidak_artifact_dir/final" --reporter=list,json,html --retries=0 --repeat-each=2 --trace=on
```

Screenshot/JSON metrik per kondisi ditulis melalui `testInfo.outputPath` dan `testInfo.attach`, bukan path repo. Sertakan manifest bukti: SHA (atau HEAD + diff pra-commit), `git diff` scoped, perintah/exit code, browser version, viewport/font, console/pageerror, RED→GREEN, JSON/HTML/trace/screenshot. JSON final harus `unexpected = flaky = skipped = 0`. Setelah commit yang diotorisasi, ulangi final hanya bila diff berubah; perubahan kode setelah bukti membatalkan bukti pada SHA sebelumnya.

Quality gates dari root, berurutan dan berhenti pada kegagalan baru:

```bash
pnpm --filter @trainers/web exec tsc --noEmit
pnpm typecheck
pnpm lint
pnpm build
pnpm exec prettier --check plans/markdown/sidak-jadwal-shifting-loop-exit.md plans/markdown/sidak-jadwal-shifting.md docs/modules.md docs/rebuild-logs/phase-224-sidak-jadwal-shifting.md apps/web/src/routes/sidak/jadwal-shifting.tsx apps/web/src/components/sidak/jadwal-shifting/MonthMatrix.tsx apps/web/e2e/sidak-jadwal-shifting.spec.ts apps/web/e2e/helpers/sidakJadwalShiftingHarness.ts apps/web/src/__tests__/sidak-jadwal-shifting-order.test.ts
git diff --check
git diff --exit-code -- apps/web/test-results
git status --short
```

Hanya formatter scoped jika diperlukan; jangan `pnpm format`. Semua exit 0 kecuali source-absence D8 dan RED yang memang harus gagal. Jika gate root mempunyai failure lain, simpan bukti baseline dan laporkan blocker; jangan memperbaiki modul lain atau menurunkan acceptance. Output /tmp menghindari kebutuhan `git checkout -- apps/web/test-results`; jika tracked artefak tetap berubah, STOP dan periksa baseline sebelum pemulihan apa pun.

## Aturan exit gate

1. Tetapkan satu pemilik integrasi dan satu reviewer independen. Handoff reviewer berisi requirement, D1–D10, allowlist file, exclusions, baseline dan artefak final; prompt harus menilai **kontrak beku**, bukan mencari improvement tanpa batas. Review source tetap mencakup efek regresi, akses, dan keamanan yang benar-benar ditimbulkan diff.
2. Temuan wajib punya path/line, skenario, expected vs actual, ID DoD/kontrak terdampak, severity dan bukti repro atau trace sebab yang konkret. Deduplicate dahulu. Pemilik integrasi mencatat accept/reject/defer beserta alasan; beda pendapat severity diputus Fajar, tidak diturunkan otomatis.
3. **P0/P1:** selalu blocker (keamanan/data/akses atau flow inti rusak), termasuk regresi lintas scope yang diperkenalkan diff. **P2:** blocker jika bug nyata pada tiga requirement, D1–D10, atau regresi existing yang ditimbulkan batch. Improvement/pre-existing di luar scope masuk backlog, bukan otomatis NEEDS_FIX. **P3:** catatan nonblocking yang tidak melanggar DoD; jika melanggar DoD, tetap blocker tanpa memandang labelnya.
4. Maksimal **dua putaran independen pasca-batch**: putaran 1 review penuh; bila ada blocker, lakukan satu batch perbaikan terkonsolidasi dan ulangi bukti yang terdampak; putaran 2 menilai closure dan regresi batch tersebut. Putaran 10 atas algoritme lama hanya input; bukan gate arsitektur baru. Jika putaran 2 masih punya blocker, status BLOCKED dan eskalasi keputusan desain/scope ke Fajar; **tidak ada putaran 3 dan tidak ada rilis otomatis**.
5. Berhenti setelah putaran 1/2 dengan **0 blocker + seluruh DoD lulus**. Verdict `PASS` atau `PASS_WITH_NOTES` dapat diterima. Jika hanya P3 tersisa, catat semua di backlog phase log dan tutup loop; jangan menyentuh kode demi komentar/style baru. Reviewer boleh mengonfirmasi pencatatan tanpa review penuh lagi.
6. Hasil tersebut berarti **siap diajukan untuk commit/push**; tindakan tetap membutuhkan otorisasi pemilik. Deploy produksi juga masih bergantung gate WFM/env/izin/RLS/smoke target di docs existing. Local PASS tidak menghapus NO-GO produksi. Tidak melakukan deploy dalam pekerjaan ini.

Alasan: dua putaran memberi satu kesempatan review independen dan satu kesempatan closure; lebih banyak putaran penemuan terbuka mengembalikan pola lama. Ambang blocker melindungi fungsi nyata dan DoD; menerima P3 yang terdokumentasi mencegah detail pemeliharaan menjadi syarat rilis tanpa batas. Batas putaran menghentikan proses, bukan membolehkan bug dirilis.

## Di luar cakupan yang sengaja ditunda

| Item                                                                                                                                                      | Mengapa tidak diperbaiki                                                                          | Dokumentasi tujuan                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Layout.tsx, perubahan global h-screen→h-dvh, shell seluruh modul, mobile browser chrome/keyboard/zoom fisik, safe-area perangkat nyata di luar matriks D1 | Risiko lintas modul; font/reflow desktop Chromium bukan bukti semua perangkat                     | Backlog phase-224; batas dukungan pada docs/modules.md, tidak mengklaim universal                |
| Credential/izin/RLS WFM, env produksi, live smoke adapter, isi asli/78 row                                                                                | Bukan kontrak UI; tetap gate produksi terpisah, tidak memanggil upstream untuk membuktikan layout | NO-GO existing di docs/architecture.md dan docs/deployment.md; status eksplisit phase-224        |
| API/backend/types, role baru, cache, virtualisasi, identitas agen duplikat, koreksi data upstream                                                         | Tidak diperlukan tiga keluhan dan berpotensi mengubah bisnis                                      | Backlog phase-224 dengan rujukan kontrak existing                                                |
| Bug unit Telefun pre-existing; migrasi seluruh unit menjadi E2E; immutability/null helper yang belum punya padanan UI                                     | Workstream lain atau kontrak isolated tidak diubah; tidak ada izin menjalankan non-E2E            | Backlog phase-224 + tabel kurasi laporan; kasus unit terkait yang belum replaced tetap tersimpan |
| P3 style/komentar/maintainability yang tersisa                                                                                                            | Tidak menghalangi DoD, dicatat agar terlihat                                                      | Backlog phase-224 dengan severity, bukti, pemilik dan alasan                                     |
| Viewport/font di luar D1, browser selain Chromium                                                                                                         | Tidak dinyatakan telah didukung/diuji oleh pekerjaan ini                                          | Batas bukti docs/modules.md dan manifest final; bug baru dievaluasi pada tugas berikut           |

Pengecualian tidak berlaku bagi P0/P1 atau regresi yang diperkenalkan batch. Jangan menyembunyikan temuan dengan memasukkannya ke exclusions setelah diketahui.

## Pembuktian keberhasilan plan

Sukses memerlukan bukti struktural D8/D9, seluruh kontrak D1–D7, gates D10, dan maksimal dua review independen yang berakhir 0 blocker. Satu PASS pada SHA final cukup; PASS_WITH_NOTES setara jika hanya P3 tercatat dan semua DoD tetap lulus. Banyak test atau label PASS tanpa artefak bukan bukti. Jika batas dua putaran tercapai dengan blocker tersisa, plan berhasil membatasi loop tetapi **perbaikan belum selesai**: laporkan BLOCKED beserta keputusan yang diperlukan, jangan klaim sukses fitur.

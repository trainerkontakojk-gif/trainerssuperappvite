# SIDAK — Redesign detail agent (`/sidak/agents/$id`)

Status: DONE (2026-10-05). Fase 1–4 diimplementasikan; tata letak sidebar disetujui Fajar. Lane D (significant UI redesign).

## Requirement

Halaman detail agent harus terlihat rapi dan mudah dipindai tanpa mengubah data,
perhitungan, endpoint, atau kontrak ekspor. Masalah yang terlihat dari render
hermetic (fixture sintetis, 1440px dan 390px) sebelum perubahan:

1. Header kebesaran: avatar 112px, ikon meta 24px, bullet menggantung di akhir,
   masa kerja patah ke baris kedua, tombol `Input Audit` jatuh ke baris sendiri.
   Baris "SIDAK · Profil Agen" menduplikasi breadcrumb shell.
2. Bar konteks tidak sejajar: legend "Pindah profil" mengambang di atas dua label,
   select layanan melebar tanpa isi; di mobile empat select menumpuk satu layar.
3. Judul bertumpuk di tab Ringkasan (tab → "Ringkasan skor" → "Quickview performa"
   → "Nilai skor per bulan") dengan garis pembatas ganda dan kartu bersarang tiga
   lapis (dossier → akar masalah → kartu utama).
4. Sinyal berisik: ikon peringatan di hampir setiap bulan, progress bar panjang
   tanpa informasi baru, band "Pola Temuan Lainnya" menyisakan kolom kosong.
5. Selisih skor ditulis `%` padahal selisih dua persentase adalah poin.

Acceptance criteria:

- Header satu baris di desktop: tombol kembali, avatar 56px, nama, meta satu baris
  dengan pemisah hanya di antara item, aksi dalam satu baris.
- Tab langsung di bawah header (gaya garis), toolbar filter di bawah tab; filter
  layanan/tahun di kiri, "Pindah profil" di kanan; di mobile dua kolom per grup.
- Ringkasan: strip performa (peringkat gabungan, peringkat leader, forecast) tanpa
  kartu bersarang; rail bulan dengan satu catatan target; panel bulan terpilih
  dengan skor + statistik dalam satu baris, lalu tiket | akar masalah berdampingan.
  Pola akar masalah lain menjadi daftar di kolom akar masalah, bukan band terpisah.
- Selisih ditampilkan sebagai "poin".
- Tidak ada perubahan pada `useAgentDetail`, endpoint, atau ekspor laporan.
- Nama aksesibel yang dipakai E2E tetap: tab/panel `Ringkasan…Simulasi`,
  `Bagian profil agen`, combobox `Pilihan layanan audit`, tombol `Unduh Laporan`,
  `Input Audit`, `Kembali ke daftar agen`, `Muat ulang profil agen`.

## Design

- `AgentProfileBar`: bukan Card lagi; `<header>` flex dengan slot tombol kembali.
- `SidakAgentDetailTabs`: `TabsList variant="line"` full-width + prop `toolbar`
  yang dirender di antara daftar tab dan panel.
- `ContextControlBar`: satu baris flex-wrap dengan lebar tetap per select; label
  seragam; tidak ada legend mengambang.
- `AgentPerformanceQuickview`: tanpa CardHeader; strip 3 sel bertepi tunggal.
- `MonthRail`: grid sel sama lebar, tanpa ikon per bulan; ringkasan "x dari y
  bulan di bawah target 95%" di atas rail. Aria-label per bulan tetap.
- `AgentAuditDossier`: header ringkas (bulan, skor, status, sesi/temuan/selisih),
  tanpa progress bar; dua kolom tiket | akar masalah (`showSecondary`).
- `RootCauseCard`/`TopTicketsCard`: lepas lapisan Card; kartu utama jadi blok
  `bg-muted`.

## Tasklist

- [x] Fixture hermetic kaya (`e2e/helpers/sidakAgentDetailLayoutFixture.ts`) dan
      opsi override payload di `sidakAgentDetailDatesHarness.ts`.
- [x] Screenshot sebelum (desktop 1440, mobile 390).
- [x] Spec E2E RED: `e2e/sidak-agent-detail-layout.spec.ts`.
- [x] Implementasi komponen.
- [x] E2E GREEN + regresi spec detail agent yang ada.
- [x] `impeccable detect`, typecheck/lint workspace web.
- [x] Review visual Fajar (fase 2 disetujui; fase 3 menindaklanjuti masukan).
- [x] Unit test legacy dihapus atas persetujuan Fajar setelah E2E pengganti hijau (lihat Fase 2).

---

## Fase 2 — Sidebar profil (2026-10-05)

### Requirement

Keputusan Fajar: tampilan "fresh" dengan **sidebar profil**, foto lebih besar,
plus grafik skor dengan garis target, satu pemilih agen, klik tiket → tab Temuan,
dan warna status mengikuti target QA 95%. Unit test komponen yang tergantikan E2E
dihapus.

Acceptance criteria:

- Desktop (≥1024px): kolom kiri sticky ±18rem berisi tombol kembali, foto 160px,
  nama (satu H1), meta vertikal, aksi, pemilih agen, status bulan terbaru,
  peringkat + forecast. Kanan: tab → toolbar (Tahun, Layanan, rentang tren) → isi.
- Mobile: sidebar menjadi blok atas (foto 96px di samping nama), tanpa scroll
  horizontal.
- Pemilih agen tunggal: combobox dengan pencarian nama/tim/batch dari
  `GET /sidak/agents?show_all=true` (endpoint direktori yang sudah ada, RLS/role
  backend tetap), dimuat saat dibuka. Folder + Agen select dihapus, termasuk
  fetch folder di `useAgentDetail`.
- Rail bulan → grafik batang Jan–Des dengan garis target 95%; bulan berdata
  adalah tombol (aria-pressed, aria-label lama dipertahankan).
- Baris tiket pengurang adalah tombol: membuka tab Temuan, membuka bulan terkait,
  scroll + fokus ke grup tiket.
- Status skor: ≥95 "Memenuhi target" (hijau), 85–94.9 "Mendekati target"
  (kuning), <85 "Perlu perhatian" (merah) — di halaman detail **dan** laporan
  HTML/PDF. Layar SIDAK lain (ranking, kartu direktori, input) belum diubah.

### Tasklist

- [x] Hapus 6 unit test setelah E2E pengganti `sidak-agent-detail-states.spec.ts` (20 kasus) hijau; perbarui inventaris di `docs/SIDAK_LOGIC_AND_SCORING.md`.
- [x] `utils/sidakScoreStatus.ts` + pakai di dossier, grafik, sidebar, laporan HTML/PDF.
- [x] Sidebar profil (`AgentProfileSidebar`), pemilih agen (`AgentSwitcher`), grafik skor (`MonthRail`), tiket → Temuan (`AgentTemuanTab.focusRequest`).
- [x] Bersihkan state folder/agen di `useAgentDetail`.
- [x] E2E: layout 6/6 + states 20/20 (RED lebih dulu untuk layout), regresi 84/84 spec detail/ekspor; detector `[]`; typecheck web + e2e.
- [x] `docs/modules.md` diperbarui.
- [x] Review visual Fajar (fase 2 disetujui; fase 3 menindaklanjuti masukan).
- [x] Opsional: samakan ambang status di layar SIDAK lain (ranking, kartu direktori, input, `lib/scoring.ts`). 2026-10-10: Ranking dan Input sudah memakai `sidakScoreStatus`; kartu direktori (`AgentCard`) dipindah ke `sidakScoreTone`/`SIDAK_SCORE_TEXT` dengan E2E RED→GREEN di `sidak-minor-polish.spec.ts`; `ScoreDisplay.tsx` (tidak dipakai) dihapus. `scoreColor`/`scoreBg`/`scoreLabel` (ambang 85) di `lib/scoring.ts` tidak punya pemanggil runtime; dihapus beserta 5 kasus unit test legacy-nya di `sidak-scoring-core.test.tsx` atas persetujuan Fajar.

---

## Fase 3 — Sidebar tanpa scroll internal + copywriting (2026-10-05)

Requirement (Fajar): profil kiri tidak boleh perlu di-scroll sendiri; perbaiki
copy di `/sidak/agents/$id`.

- Sidebar: `max-h` + `overflow-y-auto` dihapus. Isi dipadatkan (tombol kembali
  sebaris dengan Ganti agen, peringkat dua kolom, skor + status sebaris; 954px →
  806px). Sticky hanya bila seluruh sidebar muat di area scroll
  (`useStickyWhenFits`, `data-sticky`); bila tidak, ikut scroll halaman.
- Copy: istilah "agen" konsisten; label layanan "Call" (bukan "CALL"); catatan
  peringkat tidak ambigu ("Peringkat 1 berarti temuan paling sedikit…");
  perubahan skor "Naik/Turun x poin dari {bulan}"; stat "Sesi audit",
  "Dibanding {bulan}"; tiket "Parameter terberat"; akar masalah "Akumulasi temuan
  Jan–{bulan}", "Pola utama", "x temuan kritis", "Tampilkan n tiket"; Tren:
  judul sesuai isi grafik (temuan, bukan skor), eyebrow dan blok saran generik
  dihapus, chip "Semua parameter"/"Total saja"; nilai temuan "x dari 3";
  Heatmap "Hitung per"; Simulasi tidak lagi menampilkan error mentah; empty/
  error state memberi langkah berikutnya; deskripsi format ekspor; modal edit
  "Rekomendasi" (sama dengan tab Temuan) dengan contoh placeholder.
- Tidak diubah: komponen heatmap bersama halaman `/sidak/heatmap`, teks di dalam
  file laporan HTML/PDF/CSV/MD, teks dari backend (scope label, forecast).

### Tasklist

- [x] E2E diperbarui; spec lama gagal terhadap copy baru (RED), lalu hijau.
      Tambah test "sidebar tidak pernah butuh scroll sendiri" (768px & 1100px).
- [x] Regresi 85/85 spec detail agent + ekspor; detector `[]`; typecheck.
- [x] `docs/modules.md` diperbarui.

---

## Fase 4 — Copy insight heatmap (2026-10-05)

Permintaan Fajar: perbaiki copy insight `/sidak/heatmap` (komponen dipakai
bersama tab Heatmap detail agent).

- Narasi pembuka merangkum total, jumlah hari, puncak, hari & bulan terbanyak
  (sebelumnya hanya mengulang kartu pertama).
- Kartu: istilah "Tanggal" untuk tanggal kalender dan "Hari" untuk hari dalam
  sepekan; "Tanggal temuan paling sedikit" menyebut bahwa hanya hari yang ada
  temuannya dihitung; satuan ikut di nilai ("6 hari", "2,8 temuan").
- Ringkasan: "Temuan tanpa tanggal" + penjelasan kenapa tidak tampil di
  kalender (menggantikan "tidak bisa diatribusikan"); label layanan "Call".
- Pesan kosong kalender tidak lagi menyebut "tanggal yang dipilih".
- Tidak diubah: judul halaman, filter, legenda intensitas.

- [x] `e2e/sidak-heatmap.spec.ts` diubah dulu (RED 3 tes), lalu hijau; heatmap + agent heatmap 20/20; typecheck, lint.

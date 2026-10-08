# SIDAK — Redesign halaman Settings parameter QA (`/sidak/settings`)

Status: TODO — plan untuk dieksekusi Codex. Dibuat 2026-10-08.
Lane D (significant UI redesign pada halaman yang mengubah aturan skor). Eksekutor wajib
mengikuti `AGENTS.md` dan `docs/AGENT_WORKFLOW.md`: muat `trainers-superapp-tdd` sebelum
edit, E2E RED-first, `thermo-nuclear` + gate `impeccable` setelah implementasi. Jangan
commit/push/deploy tanpa izin Fajar. Kerjakan di branch sendiri dari `main`.

## Requirement

Halaman ini mengelola versi aturan penilaian QA (rule version) per layanan: buat draft,
ubah bobot kategori, tambah/edit/hapus parameter, publish ke periode efektif. Setiap
publish mengubah skor semua agen mulai periode itu, jadi kejelasan status dan
konfirmasi aksi jauh lebih penting daripada di halaman lain.

File: `apps/web/src/routes/sidak/settings.tsx` (481 baris) +
`apps/web/src/routes/sidak/settings/{constants,types,utils}.ts` +
`settings/components/{RuleVersionPicker,PublishRulePanel,ServiceWeightsPanel,RuleIndicatorsPanel,AddIndicatorModal,EditIndicatorModal,PublishPreviewModal}.tsx`.

Masalah yang terlihat di kode sekarang:

**Bug / risiko perilaku (prioritas utama):**

1. **Slider bobot menembak API di setiap langkah geser.** `ServiceWeightsPanel` memanggil
   `PUT /rule-versions/:id` di `onChange` `<input type="range">` — satu drag 40%→60%
   mengirim beberapa request tanpa debounce; respons yang datang tidak berurutan bisa
   menimpa nilai terakhir. Tidak ada indikator menyimpan.
2. **Seleksi versi bisa basi setelah publish.** Effect pemilihan versi bergantung pada
   `[versions?.length, activeTeam]`. Publish tidak mengubah jumlah versi, jadi
   `selectedVersion` masih memegang objek lama berstatus `draft` → header masih bisa
   menampilkan tombol Publish/Hapus Draft untuk versi yang sudah published.
   **Verifikasi dulu lewat E2E** (Tasklist 1c) sebelum memperbaiki.
3. **Hapus parameter tanpa konfirmasi** (`handleDeleteIndicator` langsung DELETE).
   Hapus draft memakai `window.confirm` native.
4. **Tombol hapus draft di daftar versi tidak terlihat** (`opacity-0 group-hover:opacity-100`)
   — tidak bisa ditemukan lewat keyboard atau layar sentuh, dan tidak punya nama aksesibel.
5. **Modal buatan sendiri** (`fixed inset-0 z-[60]` + framer-motion) di Add/Edit/Publish:
   tanpa focus trap, tanpa Escape, tanpa `role="dialog"`/judul terhubung.
6. **Teks SLIK hard-coded**: "bobot akhir mengikuti porsi Non Critical 40% dan Critical 60%"
   ditulis tetap, padahal bobot sebenarnya ada di `selectedVersion`. Bila bobot diubah,
   teks berbohong.

**Masalah tampilan & bahasa:**

7. Header sticky dengan `backdrop-blur`, tombol buatan sendiri dengan warna mentah
   (`bg-emerald-600`, `bg-destructive`), `rounded-xl`, label `uppercase tracking-wide`.
8. Banner status (`PublishRulePanel`) memakai blok berwarna penuh (emerald/amber) dengan
   ikon dalam kotak — kartu bertumpuk dengan panel bobot dan daftar parameter.
9. Status versi ditampilkan sebagai kata mentah Inggris (`draft`, `published`, `superseded`)
   dan campuran bahasa: "Create Revision", "Publish", "immutable", "Scoring Mode",
   "Version:", "Th:", "Linked".
10. Pemilih layanan = 7 tombol tanpa semantik tab. Daftar parameter penuh badge berwarna
    (`purple`, `amber`, `emerald`, `blue`, `red`) untuk metadata kecil.
11. Preview publish hanya mengulang isi draft; **tidak menunjukkan apa yang berubah**
    dibanding versi published yang sedang berlaku — padahal itu informasi yang paling
    dibutuhkan sebelum publish.

### Acceptance criteria

1. **Header halaman**: `h1 "Parameter QA"` + deskripsi satu baris, tanpa sticky blur.
   Pemilih layanan memakai `ui/tabs.tsx` (`TabsList`, trigger `shrink-0`, scroll horizontal
   di layar sempit — aturan Tab list di `docs/design.md` §4).
2. **Layout dua kolom (≥lg)**: kiri daftar versi (riwayat), kanan detail versi terpilih.
   Mobile: daftar versi menjadi `Select` "Versi" di atas detail (bukan sidebar yang
   mendorong detail ke bawah layar).
3. **Daftar versi**: tiap baris = tombol utuh dengan `aria-pressed`/`aria-current`, isi:
   `v{n}`, status berlabel Indonesia, periode efektif, tanggal dibuat. Aksi hapus draft
   pindah ke header detail (tidak ada tombol tersembunyi di baris).
   Label status: `draft` → "Draft", `published` → "Berlaku", `superseded` → "Digantikan".
   Satu helper `ruleVersionStatusLabel()` + satu peta tone, dipakai di semua tempat.
4. **Header detail versi** (satu baris, wrap di mobile): `Versi {n} · {status}` +
   "Efektif mulai {periode}" + aksi sesuai status:
   - Draft: `Publish…` (primary), `Hapus draft` (destructive ghost).
   - Berlaku: `Buat revisi`.
   - Digantikan: tanpa aksi.
   - Belum ada versi: `Buat draft baru` / `Buat baseline` (logika `meta` sekarang).
     Penjelasan status satu kalimat (pengganti `PublishRulePanel`), tanpa blok berwarna penuh.
     Tombol pakai `ui/button.tsx`, tinggi ≥44px, tidak uppercase.
5. **Bobot kategori**: kontrol tetap (slider `Non-critical`, `Critical` = sisanya, hanya
   draft & bukan `no_category`), **tetapi simpan sekali**: perubahan lokal selama drag,
   kirim `PUT` saat commit (pointer up / keyup / blur) atau debounce ≥400ms; request lama
   dibatalkan/diabaikan; tampilkan status "Menyimpan…"/"Tersimpan"/error inline; nilai
   kembali ke nilai server bila gagal. Angka juga bisa diketik (`Input` number 0–100,
   step 5) agar dapat dioperasikan tanpa drag. Mode penilaian tampil sebagai teks
   ("Berbobot", "Flat", "Tanpa kategori") — satu peta label.
6. **Daftar parameter**: dikelompokkan per kategori (Non-critical / Critical / Semua)
   dengan subjudul berisi bobot kategori. Tiap baris: nama, bobot item, bobot akhir
   (bila relevan), lalu metadata sebagai teks kecil netral dipisah `·`
   (`N/A diizinkan`, `Urutan #n`, `Ambang {x}`, `Tertaut ke parameter lama`) — tanpa badge
   warna-warni. Warna hanya untuk kategori, lewat token yang lolos kontras.
   Aksi baris (draft saja): `Edit {nama}`, `Hapus {nama}` — hapus wajib konfirmasi dialog.
   Teks SLIK menghitung porsi dari bobot versi, bukan angka tetap.
7. **Semua modal pakai `ui/dialog.tsx`**: Tambah parameter, Edit parameter, Konfirmasi hapus
   (parameter & draft), Publish. Judul terhubung, Escape & klik backdrop menutup (kecuali
   saat menyimpan), fokus terkunci & kembali ke pemicu, footer aksi tetap terlihat saat
   konten panjang (pola "Dialog Pengaturan Simulasi" di `docs/design.md` §5). Tidak ada
   `z-[60]`.
8. **Dialog Publish menampilkan perubahan** dibanding versi `published` yang berlaku untuk
   layanan itu (bila ada): parameter ditambah / dihapus / diubah (nama, bobot, kategori,
   N/A, ambang), dan perubahan bobot kategori. Data dari endpoint yang sudah ada
   (`GET /rule-versions/:id/indicators` untuk versi published). Bila belum ada versi
   published → "Versi pertama untuk layanan ini". Periode efektif wajib (`Select`
   berlabel), alasan perubahan opsional, checkbox konfirmasi tetap wajib sebelum tombol
   `Publish` aktif. Pratinjau nomor versi (`getPreviewVersionNumber`) tetap.
9. **Seleksi versi selalu segar**: setelah publish/hapus/buat draft/ubah bobot, versi
   terpilih diambil ulang dari daftar terbaru berdasarkan `id` (tidak bergantung pada
   `versions.length`). Setelah publish, halaman menunjukkan versi itu berstatus "Berlaku"
   tanpa aksi draft.
10. **State lengkap**: loading (skeleton baris), kosong (belum ada versi; draft tanpa
    parameter + CTA "Buat revisi dari versi berlaku" bila ada), error memuat dengan
    `Coba lagi`. Notifikasi sukses/gagal tetap lewat `notify` (toast) yang ada.
11. **Responsif & a11y**: tanpa overflow horizontal di 320/390/768/1440; konten terakhir
    lolos bottom nav mobile; semua kontrol ≥44px dan bisa dioperasikan keyboard; light &
    dark lolos kontras; teks ≥12px.
12. **Token & aturan desain**: tanpa warna mentah baru, tanpa `uppercase tracking` label,
    tanpa kartu bersarang, tanpa glass. Hapus framer-motion halaman kecuali yang dibawa
    `ui/dialog`.
13. **Bahasa**: seluruh UI berbahasa Indonesia yang konsisten (lihat tabel istilah di
    Design). Pesan toast yang ada boleh dirapikan ke istilah yang sama.

### Kontrak yang wajib dipertahankan

- Endpoint, payload, dan urutan request yang ada: `GET /sidak/rule-versions?service_type=`,
  `GET /sidak/rule-versions/meta`, `POST /sidak/rule-versions` (dengan/atau tanpa
  `source_version_id`), `PUT /sidak/rule-versions/:id` (bobot), `DELETE /sidak/rule-versions/:id`,
  `POST /sidak/rule-versions/:id/publish` (`change_reason`, `effective_period_id`),
  `GET|POST /sidak/rule-versions/:id/indicators`,
  `PUT|DELETE /sidak/rule-versions/:versionId/indicators/:indicatorId`, `GET /sidak/periods`.
  Tidak ada endpoint baru.
- `indicatorFormToPayload` / `indicatorToFormState` (`settings/utils.ts`) dan isi field
  form parameter (nama, kategori, bobot, N/A, urutan, ambang, `parameter_group` SLIK) tetap;
  hanya pembungkus & gaya yang berubah.
- Aturan pemilihan awal: draft → published → nomor versi tertinggi.
- Guard `requireCapability("sidak.config.manage")` di router tidak berubah.
- `main-landmark.spec.ts` memuat `/sidak/settings`: halaman tetap tanpa `<main>` sendiri.

### Non-goals

- Tidak mengubah API, skema, RLS, logika scoring, atau aturan versioning di backend.
- Tidak menambah fitur baru selain diff di dialog Publish (yang murni frontend dari data
  yang sudah ada). Tidak ada drag-reorder parameter, tidak ada undo publish.
- Tidak menyentuh `/sidak/periods` atau halaman lain.

## Design

### Struktur

```
h1 Parameter QA                                    deskripsi 1 baris
[Call] [Chat] [Email] [CSO] [Pencatatan] [BKO] [SLIK]      (Tabs)
┌ Riwayat versi (lg: kolom kiri ~18rem) ┐ ┌ Detail versi ─────────────────────────┐
│ v4  Draft      Efektif Jan 2027       │ │ Versi 4 · Draft  Efektif mulai Jan 2027│
│ v3  Berlaku    Efektif Okt 2026       │ │ 1 kalimat status     [Hapus draft][Publish…]
│ v2  Digantikan Efektif Mar 2026       │ │ ── Bobot kategori ── mode: Berbobot      │
└───────────────────────────────────────┘ │ Non-critical [slider][40]%  Critical 60% │
                                          │ Menyimpan… / Tersimpan                   │
                                          │ ── Parameter (12) ──      [Tambah parameter]
                                          │ Non-critical · 40%                        │
                                          │  Nama parameter      25% · akhir 10%  ✎ 🗑 │
                                          │  N/A diizinkan · Ambang 2                  │
                                          │ Critical · 60%  …                          │
                                          └──────────────────────────────────────────┘
```

Section dipisah divider + spasi (`space-y-8`), bukan kartu. Satu-satunya surface
bertepi adalah kolom riwayat versi (lg) dan dialog.

### Komponen

- `RuleVersionPicker` → `RuleVersionList` (lg) + `RuleVersionSelect` (mobile) dari satu
  sumber data; tab layanan dipindah ke halaman (`ServiceTabs`).
- `PublishRulePanel` → `RuleVersionHeader` (judul, status, periode, aksi, kalimat status).
- `ServiceWeightsPanel` → `CategoryWeightsSection` dengan hook `useCategoryWeightDraft`
  (state lokal, commit/debounce, abort, status simpan). Request tetap dari komponen/hook
  frontend yang sama seperti sekarang, tetapi sekali per commit.
- `RuleIndicatorsPanel` → `RuleIndicatorsSection` (+ `IndicatorRow` tanpa badge warna).
- `AddIndicatorModal`/`EditIndicatorModal` → satu `IndicatorFormDialog` (mode tambah/edit)
  di atas `ui/dialog`; field tetap.
- `PublishPreviewModal` → `PublishRuleDialog` + util murni `diffRuleVersions(published, draft)`
  di `settings/utils.ts` (bandingkan per `legacy_indicator_id` bila ada, lalu nama
  ternormalisasi; kembalikan `added`/`removed`/`changed` + perubahan bobot).
- `ConfirmDialog` kecil (atau `ui/dialog` langsung) untuk hapus parameter & hapus draft;
  hapus `window.confirm`.

### Istilah (satu peta di `settings/constants.ts`)

| Sekarang                           | Jadi                                                             |
| ---------------------------------- | ---------------------------------------------------------------- |
| draft / published / superseded     | Draft / Berlaku / Digantikan                                     |
| Create Revision (dari Published)   | Buat revisi (dari versi berlaku)                                 |
| Buat Draft Baru / Buat Baseline    | Buat draft baru / Buat baseline                                  |
| Publish / Preview & Publish        | Publish… / Publish versi                                         |
| Versioning Parameter QA            | Parameter QA                                                     |
| Konfigurasi Bobot & Mode           | Bobot kategori                                                   |
| weighted / flat / no_category Mode | Berbobot / Flat / Tanpa kategori                                 |
| Service / Version / Scoring Mode   | Layanan / Versi / Mode penilaian                                 |
| Th: x / Linked / #n / N/A          | Ambang x / Tertaut ke parameter lama / Urutan #n / N/A diizinkan |
| immutable                          | tidak dapat diubah                                               |

`SERVICE_LABELS`, `formatPeriodLabel`, dan nama bulan: pakai yang sudah ada di
`settings/constants.ts`; jangan membuat salinan baru. Jika plan
`sidak-input-redesign.md` sudah memindahkan konstanta ini ke modul bersama, pakai modul itu.

### Pengujian (hermetic)

Belum ada E2E perilaku untuk halaman ini. Buat harness stateful
`apps/web/e2e/helpers/sidakSettingsHarness.ts` mengikuti pola
`helpers/sidakTemuanDatesHarness.ts` (store in-memory, `resetStore()`, `captured()` untuk
payload yang benar-benar dikirim, guard jaringan fail-closed, `assertLocalDevOnlyTarget()`).
Fixture: layanan `call` dengan v2 `superseded`, v3 `published` (5 parameter), v4 `draft`
(6 parameter: 1 baru, 1 dihapus, 1 bobot berubah dibanding v3); layanan `slik` dengan
`parameter_group`; layanan `email` tanpa versi tapi `meta.indicator_count > 0`.
Jangan memakai backend/Supabase nyata.

## Tasklist

- [ ] **0. Baseline** — screenshot hermetic sebelum perubahan (1440 & 390, light/dark)
      setelah harness ada; simpan di `apps/web/test-results/` (gitignored), catat path.
- [ ] **1. RED E2E** `apps/web/e2e/sidak-settings.spec.ts`, satu test per kontrak:
      a. layout: `h1 "Parameter QA"`, tab layanan, versi terpilih awal = draft, status
      berlabel "Draft"/"Berlaku"/"Digantikan", tanpa kata `superseded` mentah;
      b. slider bobot: drag/ketik 40→60 menghasilkan **tepat satu** `PUT` dengan
      `non_critical_weight: 0.6, critical_weight: 0.4`; status "Tersimpan"; PUT gagal →
      nilai kembali + pesan error;
      c. publish: dialog menampilkan diff (1 ditambah, 1 dihapus, 1 diubah) dan nomor versi,
      tombol Publish nonaktif sampai checkbox dicentang, payload benar; **setelah sukses
      header menunjukkan "Berlaku" dan tidak ada tombol Publish/Hapus draft**;
      d. hapus parameter: dialog konfirmasi; Batal → tidak ada DELETE; Hapus → satu DELETE;
      e. hapus draft lewat header: dialog konfirmasi (bukan `window.confirm`), lalu seleksi
      jatuh ke versi berlaku;
      f. dialog tambah/edit: Escape menutup, fokus kembali ke pemicu, payload tambah/edit
      sama dengan `indicatorFormToPayload`;
      g. SLIK: teks porsi kategori mengikuti bobot fixture (ubah bobot fixture → teks ikut);
      h. layanan tanpa versi: CTA "Buat baseline" → `POST` tanpa `source_version_id`;
      i. 390px: versi dipilih lewat `Select`, tanpa overflow horizontal, kontrol ≥44px;
      1440px: dua kolom.
      Jalankan, konfirmasi tiap test gagal karena alasan yang benar (catat output). Bila 1c
      ternyata sudah lulus di kode lama untuk bagian "seleksi basi", catat bahwa bug itu
      tidak terbukti dan pertahankan asersinya sebagai regresi.
- [ ] **2. GREEN** — komponen di bagian Design, perbaikan seleksi versi (#9), simpan bobot
      sekali (#5), dialog (#7), diff publish (#8), istilah (#13).
- [ ] **3. Bersihkan** komponen lama yang tidak terpakai; tidak ada unit test baru. Bila ada
      unit test legacy yang menguji komponen yang dihapus, hapus bersama entri manifestnya
      hanya setelah E2E pengganti hijau. Jangan menjalankan suite unit tanpa izin Fajar.
- [ ] **4. Docs** — subbagian "Parameter QA (SIDAK)" di `docs/design.md` §5 (status versi,
      pola konfirmasi publish/hapus, simpan bobot); perbarui `docs/modules.md` bila perlu.
- [ ] **5. Review & gate** — `thermo-nuclear`, lalu `impeccable` audit (desktop/mobile,
      light/dark, keyboard, reduced motion). Perbaiki temuan P0–P2.
- [ ] **6. Verifikasi** (satu run Playwright pada satu waktu):

```bash
pnpm --filter @trainers/web test:e2e -- sidak-settings.spec.ts
pnpm --filter @trainers/web test:e2e -- main-landmark.spec.ts
pnpm typecheck --concurrency=1
pnpm lint --concurrency=1
pnpm build --concurrency=1
git diff --check
```

Sebelum E2E: periksa `apps/web/playwright.config.ts` dan env yang diwarisi; semua target
harus lokal/hermetic. Jangan pernah mengarah ke Supabase produksi.

- [ ] **7. Laporan** — isi _Execution evidence_: perintah persis + exit code, jumlah test,
      hasil RED per kontrak (terutama 1b dan 1c), path screenshot sebelum/sesudah, dan
      setiap penyimpangan dari plan beserta alasannya.

## Execution evidence

_(diisi eksekutor)_

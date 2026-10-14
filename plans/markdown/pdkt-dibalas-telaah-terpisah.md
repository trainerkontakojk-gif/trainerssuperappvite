# PDKT — email yang sudah dibalas dibuka sebagai email, Telaah lewat tombol terpisah

Lane C: perubahan perilaku frontend multi-file di ruang kerja PDKT (`apps/web`). Tanpa perubahan backend, skema database, RLS, route API, atau kontrak `packages/types`. Penilaian AI tetap berjalan otomatis di backend begitu balasan dikirim (`POST /api/v1/pdkt/mailbox/reply` → `processPdktEvaluation`); plan ini hanya mengubah **kapan hasilnya ditampilkan**.

Untuk eksekutor (Deepseek): baca `AGENTS.md` dan `docs/AGENT_WORKFLOW.md` lebih dulu. Aturan yang paling relevan:

- E2E Playwright ditulis dan dijalankan **RED dulu**, baru implementasi.
- Jangan menambah atau menjalankan unit test (Vitest) tanpa izin Fajar.
- Hanya satu run Playwright dalam satu waktu (Mac tidak kuat paralel). Run penuh `pdkt-flow.spec.ts` hanya sekali di akhir.
- Jangan commit/push tanpa izin eksplisit.
- Jangan sentuh path di luar daftar file di bawah.

## Requirement

Permintaan Fajar (2026-10-14): agent bisa mengerjakan beberapa email dulu dan membahas hasil telaahnya belakangan.

Perilaku sekarang (dicek pada `26710ab`):

- Tahap ditentukan di `apps/web/src/routes/pdkt/simulation.tsx` (sekitar baris 1064–1074): `selectedStatus === "replied"` langsung berarti `stage = "telaah"`. Klik email apa pun di tab **Dibalas** langsung membuka layar Telaah (skor, rincian, catatan).
- Setelah **Kirim balasan** (`handleReplySubmit`, sekitar baris 797–840), email tetap terpilih, filter pindah ke `replied`, dan layar otomatis masuk Telaah.
- `PdktStageNav` tidak pernah mengizinkan Telaah diklik.

Perilaku yang diminta:

1. Klik email di tab **Dibalas** menampilkan **email konsumen saja**, dengan tampilan yang sama seperti email yang belum dibalas (panel baca `EmailDetailPane`). Balasan agent dan hasil telaah **tidak** ditampilkan di tampilan ini.
2. Ada **tombol terpisah "Lihat telaah"** untuk membuka layar Telaah email tersebut.
3. Setelah **Kirim balasan**, agent **kembali ke kotak masuk** (bukan ke Telaah), sehingga bisa langsung lanjut ke email berikutnya.
4. Badge "Skor N" di daftar email tab Dibalas **tetap tampil** (tidak diubah).

### Acceptance criteria

1. **AC-1. Klik email Dibalas membuka panel baca.** Panel menampilkan `role="article"` yang berisi subjek, pengirim, isi email konsumen, dan lampiran, sama seperti email terbuka. Heading `Balasan untuk <nama>` tidak ada dan wilayah "Ringkasan skor" tidak ada. URL: `?ruang=1&email=<id>` tanpa `tahap`.
2. **AC-2. Footer panel baca untuk email dibalas:**
   - Tombol utama **"Lihat telaah"** (min-h-11, ikon `ArrowRight`). Tidak ada tombol "Tulis balasan".
   - Tombol "Hapus email" hanya tampil bila `item.permissions?.can_delete === true`, sama dengan aturan di layar Telaah sekarang.
   - Teks status singkat di samping tombol, diambil dari `evaluations[id].status`: `pending`/`processing` → "Sedang ditelaah AI", `completed` → "Telaah siap", `failed` → "Telaah gagal". Tidak ada angka skor di panel ini.
3. **AC-3. Navigasi tahap untuk email dibalas** (`PdktStageNav` di panel baca):
   - Tahap aktif "Pahami". "Tanggapi" tampil sebagai selesai (ikon centang, tidak bisa diklik). "Telaah" berupa tombol yang membuka Telaah.
   - Teks "Telaah terbuka setelah balasan dikirim" **tidak** tampil untuk email dibalas.
   - Untuk email terbuka, perilaku navigasi tidak berubah: Telaah tetap tidak bisa diklik dan teks bantuannya tetap tampil.
4. **AC-4. Membuka Telaah.** Klik "Lihat telaah" atau tombol tahap "Telaah":
   - URL berubah menjadi `?ruang=1&email=<id>&tahap=telaah` sebagai entri history baru (push).
   - Layar Telaah tampil seperti sekarang.
   - Di header Telaah, tahap "Pahami" bisa diklik dan kembali ke panel baca email itu (URL kembali tanpa `tahap`).
5. **AC-5. Back dan refresh.**
   - Browser Back dari Telaah kembali ke panel baca email yang sama.
   - Refresh pada `...&tahap=telaah` tetap membuka Telaah. Refresh tanpa `tahap` tetap membuka panel baca.
   - `tahap=telaah` pada email berstatus `open` diabaikan, jadi tetap tampil Pahami.
6. **AC-6. Masuk dari Riwayat dan landing tetap langsung ke Telaah.** URL dengan `sesi=` (link tabel Riwayat, "Hasil telaah terbaru" di landing, sesi replay `replay_<id>`) tetap membuka Telaah tanpa langkah tambahan, termasuk setelah refresh. Test `Riwayat membuka sesi yang ditelaah di tahap Telaah` dan `AC4 Riwayat ke Telaah…` harus tetap hijau tanpa diubah.
7. **AC-7. Setelah Kirim balasan:**
   - Seleksi dikosongkan dan URL menjadi `?ruang=1`.
   - Filter kembali ke "Belum dibalas" (`open`). Layar menampilkan kotak masuk, bukan Telaah.
   - Toast sukses: **"Balasan terkirim dan sedang ditelaah AI. Buka dari tab Dibalas kapan saja."**
   - Polling evaluasi tetap berjalan untuk email itu. Badge skor muncul di tab Dibalas begitu penilaian selesai, dan pemberitahuan pemakaian AI (`onAfterActivity("review")`) tetap terkirim.
8. **AC-8. Sidebar konsisten.** Bila email terpilih berstatus `replied` sedangkan filter aktif `open` (misalnya setelah refresh pada `?email=<id-dibalas>`), filter otomatis pindah ke `replied`. Dengan begitu, email yang sedang dibaca terlihat terpilih di daftar desktop.
9. **AC-9.** Tidak ada perubahan pada backend, skema, dan perilaku email terbuka (Pahami → Tanggapi → kirim). Satu-satunya pengecualian adalah tujuan akhir setelah kirim (AC-7).

## Design

### Kontrak URL

Tambahkan satu parameter pencarian opsional pada route `/pdkt` di `apps/web/src/router.tsx` (`validateSearch`):

```ts
tahap?: "telaah";
// ...(search.tahap === "telaah" ? { tahap: "telaah" } : {}),
```

Aturan "Telaah terbuka" (`isReviewOpen`), dihitung di `apps/web/src/routes/pdkt/index.tsx`:

```ts
const isReviewOpen = tahap === "telaah" || Boolean(requestedSessionId);
```

`sesi` selalu berarti Telaah (AC-6). `email` tanpa `tahap` berarti panel baca.

### `apps/web/src/routes/pdkt/index.tsx`

- Baca `tahap` dari `useSearch({ from: "/pdkt" })`.
- Ubah `handleSelectedIdChange` agar menerima opsi tahap. Bentuk yang disarankan, dengan sedikit perubahan pada pemanggil lama:

  ```ts
  const handleSelectedIdChange = useCallback(
    (id: string | null, replace = false, review = false) =>
      navigate({
        to: "/pdkt",
        search: {
          ruang: 1,
          ...(id ? { email: id } : {}),
          ...(id && review ? { tahap: "telaah" as const } : {}),
        },
        replace,
      }),
    [navigate],
  );
  ```

- Teruskan prop baru `isReviewOpen={isReviewOpen}` ke `<PdktSimulation>`.
- Kasus email replay atau `sesi`: jangan ubah alur yang ada. `selectedId` untuk `sesi` dihitung seperti sekarang, dan `isReviewOpen` bernilai true karena `sesi`.

### `apps/web/src/routes/pdkt/simulation.tsx`

- Props:
  - Tambah `isReviewOpen?: boolean` (default `false`).
  - Perluas tipe `onSelectedIdChange` menjadi `(id: string | null, replace?: boolean, review?: boolean) => Promise<void>`.
- Penentuan tahap:

  ```ts
  const stage =
    selectedStatus === "replied" && isReviewOpen
      ? "telaah"
      : selectedStatus === "open" && isReplyOpen
        ? "tanggapi"
        : "pahami";
  ```

- Handler baru:
  - `openReview = () => selectedId && setSelectedId(selectedId, false, true)` (push).
  - `closeReview = () => selectedId && setSelectedId(selectedId, false, false)`. Gunakan push supaya Back kembali ke Telaah. Ini konsisten dengan AC-4/AC-5.
- `EmailDetailPane` di cabang `pahami`: teruskan `onOpenReview={openReview}` dan `reviewStatus={evaluations[selectedItem.id]?.status ?? null}`. Teruskan `onDelete` hanya bila `can_delete === true` untuk email dibalas. Untuk email terbuka, biarkan seperti sekarang.
- Header Telaah (`PdktWorkspaceHeader mode="focus"` saat `stage === "telaah"`): `onSelectStage={{ pahami: closeReview }}`.
  - Untuk replay `replay_<id>` (tidak ada di mailbox, `selectedItem` sintetis), panel baca tetap bisa dirender dari `inbound_email`. Kalau ternyata `EmailDetailPane` tidak bisa menampilkannya dengan benar, jangan berikan `pahami` handler untuk replay. Catat keputusan itu di laporan.
- `handleReplySubmit` setelah sukses:
  - Ganti blok yang sekarang (`invalidateMailboxDetail(selectedId); setIsReplyOpen(false); setFilter("replied"); …`) dengan: `invalidateMailboxDetail(id)`, `setIsReplyOpen(false)`, `setFilter("open")`, `await setSelectedId(null)`, toast AC-7, lalu `notifyAfter("reply")`.
  - Simpan `selectedId` ke variabel lokal sebelum mengosongkannya.
  - Jangan biarkan auto-select desktop memilih email lain secara otomatis. `autoSelectPendingRef` sudah `false` setelah pembukaan pertama, jadi cukup pastikan tidak di-reset.
  - Hapus komentar lama "Email tetap terpilih; … pindah ke tahap Telaah".
- AC-8: tambahkan efek kecil. Bila `selectedListItem?.status === "replied"` dan `filter === "open"`, panggil `setFilter("replied")`. Hanya picu saat `selectedId` berubah, supaya tidak melawan klik filter manual. Perhatikan `handleFilterChange`: kalau pengguna memilih "Belum dibalas" saat email dibalas sedang terpilih, seleksi sudah dikosongkan oleh kode yang ada, jadi tidak ada loop.
- `backToInbox` tidak berubah. Dari Telaah tetap ke kotak masuk; dari Riwayat tetap pakai `onBackToHistory`.

### `apps/web/src/routes/pdkt/components/EmailDetailPane.tsx`

- Props baru (opsional, supaya pemanggil lain tetap jalan): `onOpenReview?: () => void` dan `reviewStatus?: "pending" | "processing" | "completed" | "failed" | null`.
- Navigasi tahap:
  - `status === "open"`: `<PdktStageNav current="pahami" onSelect={{ tanggapi: onReply }} />`, tidak berubah.
  - `status === "replied"`: `<PdktStageNav current="pahami" completed={["tanggapi"]} onSelect={{ telaah: onOpenReview }} />`, lihat perubahan `PdktStageNav` di bawah.
- Footer:
  - Blok `item.status === "open"` tidak diubah.
  - Tambah blok `item.status === "replied" && onOpenReview` dengan: Hapus email (hanya bila `onDelete` diberikan), teks status (AC-2) dalam `<span role="status">`, dan tombol utama "Lihat telaah".
  - Ikuti gaya tombol "Tulis balasan" (`min-h-11 gap-2 px-5 text-[13px] font-semibold`).
- Perbarui doc comment komponen: "Tahap Pahami: membaca email konsumen; untuk email dibalas, pintu ke Telaah."

### `apps/web/src/routes/pdkt/components/PdktStageNav.tsx`

- Izinkan Telaah dibuka bila diberi handler. Ubah tipe `onSelect` menjadi `Partial<Record<PdktStage, () => void>>` dan hapus pengecualian `stage.id === "telaah"` pada perhitungan `handler`. Pemanggil lama tidak pernah mengirim `telaah`, jadi perilaku mereka tetap.
- Tambah prop opsional `completed?: PdktStage[]`. Tahap di dalamnya dianggap `done` (centang, label sr-only "(selesai)") walaupun indeksnya di atas `current`. Tahap `done` yang tidak punya handler tetap dirender sebagai span non-interaktif.
- Teks "Telaah terbuka setelah balasan dikirim" hanya tampil bila `current !== "telaah"` **dan** tidak ada `onSelect.telaah`.
- Perbarui komentar di atas prop `onSelect` dan komponen. Komentar "Telaah tidak pernah dibuka dari sini" sudah tidak benar.

### `apps/web/src/routes/pdkt/components/PdktWorkspaceHeader.tsx`

Tidak ada perubahan perilaku. `onSelectStage` bertipe `Partial<Record<"pahami" | "tanggapi", () => void>>` sudah mendukung `pahami`. Kalau tipe `PdktStageNav` diperluas, pastikan tipe di header tetap kompatibel.

### Di luar scope

- Menyembunyikan badge skor di sidebar (Fajar memilih tetap tampil).
- Menunda penilaian AI atau mengubah backend.
- Penugasan batch oleh trainer.
- Halaman Riwayat dan monitoring trainer.

## Tasklist

- [x] **T0 — Persiapan.** Baca `AGENTS.md`, `docs/AGENT_WORKFLOW.md`, dan `docs/e2e-testing.md`. Drift-check: pastikan baris/fungsi yang disebut di Design masih ada di HEAD. Kalau berbeda material, berhenti dan laporkan.
- [x] **T1 — RED E2E** di `apps/web/e2e/pdkt-flow.spec.ts` (hermetic, pola `openWorkspace` / `pdktMocks` / `pdktNavigationMocks` / `stageNav` / `expectSearch` yang sudah ada). Test baru:
  1. `email dibalas dibuka sebagai email dengan tombol Lihat telaah`: pilih tab Dibalas, klik email dibalas. Assert AC-1, AC-2 (status "Telaah siap" untuk `EVALUATED_HISTORY`), dan AC-3 (tahap Telaah berupa tombol, teks bantuan hilang).
  2. `Lihat telaah membuka Telaah, Back dan tahap Pahami kembali ke email`: AC-4 dan AC-5, termasuk `expectSearch(page, { email: <id>, tahap: "telaah" })`, reload, `page.goBack()`, dan klik tahap "Pahami" di header.
  3. `tahap=telaah diabaikan untuk email terbuka`: buka langsung `/pdkt?ruang=1&email=<open-id>&tahap=telaah`, lalu assert Pahami dan tombol "Tulis balasan".
  4. Ubah ekspektasi akhir test `tahap Tanggapi: tulis, konfirmasi, kirim, lalu Telaah menunggu penilaian`. Ganti judulnya menjadi `…kirim, lalu kembali ke kotak masuk`. Assert AC-7: URL tanpa `email`, heading "Kotak masuk" terlihat, toast baru, tidak ada heading `Balasan untuk Rina`. Lalu klik tab Dibalas → email → "Lihat telaah" → status "Sedang ditelaah AI" tampil di Telaah.
  5. `refresh pada email dibalas memilih tab Dibalas` (AC-8, viewport 1280): buka `?ruang=1&email=<replied-id>`, lalu assert tombol filter "Dibalas" aktif dan baris email terpilih.

  Jalankan **hanya** test baru dan yang diubah dengan `--grep`, lalu catat bahwa mereka gagal karena assertion baru (bukan karena error setup):

  ```
  cd apps/web && npx playwright test e2e/pdkt-flow.spec.ts --grep "<judul-judul test>"
  ```

- [x] **T2 — Sesuaikan test yang sudah ada.** Test ini membuka Telaah dengan mengklik baris email dibalas dan sekarang butuh satu klik "Lihat telaah". Tambahkan klik itu tanpa mengubah assertion lain:
  - `tahap Telaah: skor, rincian, catatan bernomor, dan contoh balasan` (sekitar baris 1888)
  - `telaah tanpa consumerPoints…` (sekitar baris 2265)
  - `telaah lama tanpa penanda kalimat bisa ditelaah ulang`
  - `tahap Telaah gagal bisa dicoba lagi`
  - `teks mailbox, evaluasi, dan lampiran PDKT minimal …px` (sekitar baris 2446)
  - `AC3 refresh mempertahankan email replied`: sekarang setelah klik yang diharapkan adalah panel baca (`article`), bukan `reviewHeading`, baik sebelum maupun sesudah reload.

  Cari pemanggil lain dengan `grep -n "REPLIED_MAIL.list.subject\|SUBJECT_MAIL" apps/web/e2e/pdkt-flow.spec.ts`. Jangan ubah test Riwayat/`sesi` (AC-6).

- [x] **T3 — Implementasi** sesuai Design, dengan urutan: `router.tsx` → `index.tsx` → `PdktStageNav.tsx` → `EmailDetailPane.tsx` → `simulation.tsx`. Ikuti gaya kode sekitar: komentar singkat bahasa Indonesia dan token kelas Tailwind yang sudah dipakai. Ukuran teks minimal 12px (`docs/design.md`), target sentuh minimal 44px.
- [x] **T4 — GREEN fokus.** Jalankan ulang `--grep` dari T1 ditambah test T2, sampai semuanya lulus.
- [x] **T5 — Cek statis:**

  ```
  cd apps/web && npm run typecheck && npx eslint src/routes/pdkt src/router.tsx e2e/pdkt-flow.spec.ts
  git diff --check
  ```

- [x] **T6 — Review.** Lakukan review maintainability/correctness (gate `thermo-nuclear` di `docs/AGENT_WORKFLOW.md` bila tersedia di harness). Periksa: tidak ada state tahap ganda (URL adalah sumber kebenaran untuk Telaah), tidak ada loop efek filter, dan komentar lama yang menyesatkan sudah diperbarui.
- [x] **T7 — Satu run penuh** di akhir:

  ```
  cd apps/web && npx playwright test e2e/pdkt-flow.spec.ts
  ```

  Catat jumlah passed/failed dan durasinya. Jangan jalankan suite lain secara paralel.

- [x] **T8 — Laporan.** Tambahkan bagian `## Evidence` di akhir file ini: tabel perintah dan hasil persis (RED awal, GREEN fokus, typecheck/lint, run penuh), daftar file yang diubah, dan keputusan yang menyimpang dari Design beserta alasannya. Jangan commit; serahkan ke Fajar.

## Risiko yang perlu diawasi

- **Auto-select desktop** (`autoSelectPendingRef`): setelah kirim, jangan sampai email terbuka berikutnya terpilih otomatis dan URL berubah tanpa aksi pengguna. AC-7 meminta kotak masuk tanpa seleksi.
- **Email replay sintetis** (`replay_<id>`): `selectedItem` tidak berasal dari mailbox. Pastikan `sesi` tetap memaksa Telaah dan `closeReview` tidak membuat URL `email=replay_…` yang tidak bisa dimuat. Kalau ragu, nonaktifkan tahap "Pahami" untuk replay (lihat Design).
- **Polling evaluasi** bergantung pada `visibleMailboxItems`, bukan seleksi. Pastikan tetap jalan setelah seleksi dikosongkan, sehingga badge skor muncul dan `onAfterActivity("review")` terpanggil.
- **Pemberitahuan biaya** `computeUsageDeltaNow("reply")` di `index.tsx` tidak bergantung pada tahap dan tidak perlu diubah.

## Evidence

Implemented lokal oleh sesi Pi utama (Lane C), tanpa delegasi, unit test, commit, push, migrasi, atau perubahan backend. Dirty awal hanya plan ini dan entri `plans/README.md`; keduanya dipertahankan lalu diberi status/evidence.

### Perintah dan hasil

Semua Playwright menggunakan satu worker, satu run aktif, Vite lokal `localhost:3005`, target Supabase/Telefun loopback port 9, mock API hermetic, dan guard fail-closed. Perintah dijalankan dari root kecuali detector (tetap root).

| Gate | Perintah | Hasil |
| --- | --- | --- |
| RED awal | `pnpm --dir apps/web exec playwright test e2e/pdkt-flow.spec.ts --grep 'email dibalas dibuka\|Lihat telaah membuka\|tahap=telaah diabaikan\|refresh pada email dibalas\|kirim, lalu kembali'` | Exit 1; 4 failed, 1 passed (1.4m). Gagal karena panel baca/tombol belum ada dan email tetap dipilih setelah kirim; bukan setup. Guard email terbuka sudah lulus. |
| GREEN fokus | `pnpm --dir apps/web exec playwright test e2e/pdkt-flow.spec.ts --grep 'email dibalas dibuka\|Lihat telaah membuka\|tahap=telaah diabaikan\|refresh pada email dibalas\|kirim, lalu kembali\|tahap Telaah:\|telaah tanpa consumerPoints\|telaah lama tanpa\|tahap Telaah gagal\|teks mailbox\|AC3 refresh\|AC6 latihan lagi memakai'` | Exit 0; 13 passed (1.2m). |
| Polling tanpa seleksi | `pnpm --dir apps/web exec playwright test e2e/pdkt-flow.spec.ts --grep 'kirim, lalu kembali'` | Exit 0; 1 passed (15.7s). Membuktikan skor 85 dan toast pemakaian AI muncul setelah kembali ke daftar tanpa email terpilih. |
| UI RED tambahan | `pnpm --dir apps/web exec playwright test e2e/pdkt-flow.spec.ts --grep 'email dibalas dibuka'` | Exit 1; target sentuh terukur 39px, bukan 44px. Diperbaiki sebelum final. |
| UI GREEN | Perintah UI yang sama | Exit 0; 1 passed (10.4s). Screenshot desktop 1280/mobile 390, tombol >=44px, tidak ada overflow horizontal, dan tombol hapus tersembunyi saat izin false. |
| Typecheck awal | `pnpm --dir apps/web run typecheck` | Exit 1: union status live mencakup `not_started`, yang belum tercantum dalam plan. Prop diperluas dan status ditampilkan jujur. |
| Typecheck final | `pnpm --dir apps/web run typecheck` | Exit 0 (termasuk TypeScript E2E); diulang setelah repair test. |
| Lint scoped final | `pnpm --dir apps/web exec eslint src/routes/pdkt src/router.tsx e2e/pdkt-flow.spec.ts` | Exit 0; 0 errors, 37 warnings di deklarasi/variabel lama yang tidak diubah. |
| Lint root serial | `pnpm lint --concurrency=1 --cache=local:rw` | Exit 0; 4/4 tasks berhasil. Web: 0 errors, 80 warnings. |
| Build root serial | `pnpm build --concurrency=1 --cache=local:rw` | Exit 0; 3/3 tasks berhasil, 25.957s. Tidak menjalankan service backend. |
| Run penuh (hanya sekali) | `pnpm --dir apps/web exec playwright test e2e/pdkt-flow.spec.ts` | Exit 1; 53 passed, 16 failed (6.6m). Seluruh failure adalah test latihan ulang yang belum mengklik Lihat telaah. |
| Repair scoped | `pnpm --dir apps/web exec playwright test e2e/pdkt-flow.spec.ts --grep 'AC6 atribusi\|agent legacy\|latihan ulang'` | Exit 0; seluruh 16 test gagal tadi passed (1.0m), setelah menambah klik pada dua titik test/helper. Assertion kebijakan peserta tidak diubah. |
| Run penuh ulang (verifikasi Claude, 2026-10-14) | `cd apps/web && npx playwright test e2e/pdkt-flow.spec.ts --reporter=line` | Exit 0; 69 passed (5.4m). Menutup celah suite penuh yang belum diulang setelah repair. |
| Format scoped | `pnpm exec prettier --check apps/web/src/router.tsx apps/web/src/routes/pdkt/index.tsx apps/web/e2e/pdkt-flow.spec.ts` | Exit 0. File legacy yang baseline-nya tidak Prettier-clean tidak direformat menyeluruh. |
| Diff | `git diff --check` | Exit 0. |

**Batas bukti:** tidak mengklaim satu run penuh 69/69 hijau. Bukti aktual adalah 53 lulus pada run penuh dan 16 kegagalannya lulus pada rerun fokus; suite penuh tidak diulang demi budget plan. Test Riwayat dan replay tidak diubah, dan lulus pada run penuh.

Log dan screenshot disimpan lokal, gitignored, di `artifacts/pdkt-dibalas-telaah/`:
`pdkt-red.log`, `pdkt-green.log`, `pdkt-poll.log`, `pdkt-ui.log`, `pdkt-full.log`, `pdkt-repair.log`, `pdkt-final-typecheck.log`, `pdkt-final-lint.log`, `pdkt-root-lint.log`, `pdkt-build.log`, `pdkt-graph.log`, `pdkt-detect.json`, `dibalas-1280.png`, `dibalas-390.png`.
Test panel baca membuat ulang screenshot melalui `test.info().outputPath()`; artifact disalin terpisah agar tidak hilang ketika Playwright membersihkan output run berikutnya.

### File yang diubah

- `apps/web/src/router.tsx`
- `apps/web/src/routes/pdkt/index.tsx`
- `apps/web/src/routes/pdkt/simulation.tsx`
- `apps/web/src/routes/pdkt/components/EmailDetailPane.tsx`
- `apps/web/src/routes/pdkt/components/PdktStageNav.tsx`
- `apps/web/e2e/pdkt-flow.spec.ts`
- `docs/modules.md` — sinkronisasi kontrak perilaku PDKT yang sebelumnya masih menyebut langsung ke Telaah.
- `plans/README.md` dan plan ini — status/evidence.

### Keputusan dan review

- URL tetap sumber kebenaran Telaah; tidak ditambah state tahap lokal kedua.
- Efek filter bergantung pada ID/status seleksi, bukan filter; functional updater menjaga filter manual dan menghindari loop. Hook berada sebelum return loading/error.
- Replay tanpa mailbox tetap memakai `sesi` dan tidak menawarkan handler Pahami; mencegah URL sintetis `email=replay_...` yang tidak dapat direhidrasi.
- Union live punya `not_started`: ditampilkan sebagai **Belum ditelaah**, bukan klaim sedang diproses. Tidak mengubah kontrak shared/backend.
- Tombol baru dan tombol navigasi interaktif memakai `min-h-[44px]`, karena E2E membuktikan `min-h-11` terhitung 39px pada font-root repo.
- Test latihan ulang memakai klik Telaah tambahan pada `openSubjectReview`, AC6 atribusi, dan AC6 peserta X. Assertion peserta dan test Riwayat dipertahankan.
- Scope dokumentasi diperluas hanya ke bagian PDKT `docs/modules.md` untuk memenuhi documentation gate repo. Tidak ada perubahan fitur di luar scope.
- `simulation.tsx` sudah >1.000 baris sebelum task; pertumbuhan hanya wiring alur yang disetujui, tanpa refaktor arsitektur besar di luar plan.
- **Thermo-nuclear self-review: PASS** setelah repair helper test. Tidak ada temuan P0/P1/P2 terbuka pada diff; guard status, izin footer, polling, autosel, Back/refresh, dan replay ditelusuri. Bukan review agen independen.
- **Impeccable audit: PASS** untuk scope perubahan. Source audit memakai token/semantik/focus yang sudah ada, detector exit 0 dengan `[]`, dan visual runtime desktop/mobile diperiksa dari screenshot E2E. Temuan P2 target sentuh 39px sudah diperbaiki dan diverifikasi 44px; tidak mengklaim audit WCAG keseluruhan aplikasi.
- Knowledge lookup: `graphify query 'EmailDetailPane PdktStageNav' --budget 600` mengonfirmasi caller lokal; live source tetap sumber kebenaran. `GRAPHIFY_MAX_WORKERS=1 graphify update .` exit 0 memperbarui cache lokal. Context7 dilewati karena penggunaan API router tetap pola existing dan tidak ada dependency baru.
- Pemeriksaan proses akhir tidak menemukan Playwright/Vite task-owned yang masih berjalan.

### Lanjutan review Claude (2026-10-14)

Dua catatan review dirapikan:

1. **Sinkronisasi tab Dibalas** (`simulation.tsx`) sekarang berjalan sekali per email terpilih, bukan setiap kali status berubah. Perpindahan filter sesaat setelah `refetch()` ternyata tidak terlihat: layar masih di tahap Tanggapi karena detail email masih `open`. Guard `MutationObserver` di test kirim-balasan lulus sebelum maupun sesudah perubahan, jadi guard ini adalah pengaman regresi, bukan bukti RED.
2. **`dari=riwayat` dipertahankan** (`index.tsx`) saat berpindah Pahami/Telaah pada email yang sama. Test baru `Telaah dari Riwayat tetap menyediakan Riwayat setelah Pahami dan Lihat telaah`: RED (URL kehilangan `dari`), lalu GREEN.

| Langkah | Perintah | Hasil |
| --- | --- | --- |
| RED | `cd apps/web && npx playwright test e2e/pdkt-flow.spec.ts --grep "kirim, lalu kembali\|tetap menyediakan Riwayat"` | Exit 1; 1 failed (assertion `dari`), 1 passed (guard kedipan). |
| GREEN fokus | `... --grep "kirim, lalu kembali\|tetap menyediakan Riwayat\|refresh pada email dibalas\|Lihat telaah membuka\|AC4 Riwayat\|AC3 refresh"` | Exit 0; 7 passed (45.5s). |
| Typecheck | `cd apps/web && npm run typecheck` | Exit 0. |
| Lint scoped | `npx eslint src/routes/pdkt/index.tsx src/routes/pdkt/simulation.tsx e2e/pdkt-flow.spec.ts` | 0 errors, 3 warnings lama (`settingsLoading`, `historyLoading`). |
| Run penuh | `cd apps/web && npx playwright test e2e/pdkt-flow.spec.ts` | Exit 0; 70 passed (4.8m). |

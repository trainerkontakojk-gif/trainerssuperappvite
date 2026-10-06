# Profiler Workspace — Redesign Tahap 1

Lane D (redesign UI signifikan). Tidak ada perubahan API, shared types, database, role/akses, atau dependency.

## Requirement

`/profiler` saat ini memecah satu tugas (pilih batch → kerjakan pesertanya) menjadi dua layar yang saling mengganti, dengan navigasi tahun/tim/batch yang tampil tiga kali (navigator tengah, panel hierarki kanan, breadcrumb header), dan setelah batch dipilih pengguna hanya melihat tile menu, bukan pesertanya. Pilihan batch juga hilang saat refresh.

Kriteria penerimaan:

- Satu navigasi: panel kiri berisi pemilih tahun, pencarian, dan daftar tim → batch beserta jumlah peserta. Aksi folder (tambah batch, duplikat, ubah nama, hapus) ada di menu baris dan disembunyikan untuk mode hanya-baca. Di viewport sempit panel dibuka lewat tombol "Pilih batch".
- Batch aktif disimpan di URL (`/profiler?batch=<nama>`); refresh dan tombol back mempertahankan/mengembalikan pilihan. Nama batch yang tidak dikenal kembali ke ringkasan tahun.
- Batch aktif langsung menampilkan daftar peserta (grid kartu yang sama dengan `/profiler/table`) dengan pencarian nama. Tab **Peserta** di halaman; **Statistik**, **Slide**, **Ekspor**, dan **Tabel lengkap** menuju route yang sudah ada dengan `?batch=`.
- Satu tombol **Tambah peserta** (pilih dari daftar, input manual, impor Excel) untuk mode tulis; tidak tampil untuk mode hanya-baca.
- Ulang tahun batch menjadi satu baris info yang hanya muncul jika ada data, membuka modal yang sudah ada.
- Tanpa batch terpilih: ringkasan tahun berupa daftar batch (tim, batch, peserta) yang bisa diklik dan widget ulang tahun global. Empty state untuk tahun tanpa tim dan tanpa arsip tahun.
- Hapus hero/tile/kartu dekoratif (Tips navigasi, Mode akses, badge "Workspace aktif") dan toggle tema ganda (app shell sudah punya).

## Design

- `index.tsx` memegang data dan dialog (tahun, folder, rename, hapus, duplikat, picker, ulang tahun) seperti sekarang; state batch dibaca dari `useQueryParams()` dan ditulis lewat `navigate({ to: "/profiler", search })`.
- Komponen baru di `components/workspace/`:
  - `ProfilerLibraryNav.tsx` — panel kiri (desktop) dan isi sheet (mobile).
  - `ProfilerYearOverview.tsx` — isi kanan tanpa batch.
  - `ProfilerBatchWorkspace.tsx` — header batch, tab, baris ulang tahun, roster.
- Roster memakai ulang `ProfilerParticipantGrid` (density compact, tanpa sort/select). Klik/ubah peserta membuka `/profiler/table?batch=` (tempat modal edit berada); tombol analisis tetap ke `/sidak/agents/$id`.
- Dihapus karena tergantikan: `WorkspaceHeader`, `WorkspaceNavigator`, `WorkspaceActiveBatch`, `HierarchyPanel`, `BatchHero`, `InsightPanel`, `ActionToolTile`, beserta unit test `profiler-workspace-navigator.test.tsx` dan `profiler-hierarchy-panel.test.tsx` (tidak terdaftar di manifest suite) setelah E2E pengganti hijau.
- Visual mengikuti `docs/design.md`: hierarki lewat tipografi/spasi, border tegas, token warna, target sentuh ≥44px, tanpa overflow horizontal di 320–768px.

## Tasklist

- [x] Perluas `apps/web/e2e/helpers/profilerMocks.ts` (counts + peserta batch) dan tulis `apps/web/e2e/profiler-workspace.spec.ts`; jalankan dan konfirmasi RED.
- [x] Implementasi komponen baru dan rewiring `index.tsx`; GREEN.
- [x] Sesuaikan `apps/web/e2e/profiler.spec.ts` ke struktur baru.
- [x] Hapus komponen dan unit test yang tergantikan.
- [x] Web typecheck, lint, build, `git diff --check`, detector Impeccable, self-review.
- [x] Perbarui dokumentasi modul Profiler bila menyebut tata letak lama.

## Verification

- RED: `npx playwright test profiler-workspace.spec.ts` (apps/web) — 8/8 gagal karena navigasi/region baru belum ada.
- GREEN: `npx playwright test profiler-workspace.spec.ts profiler.spec.ts sidebar-nav-state.spec.ts` — 13/13 lulus, Chromium lokal hermetic (dev server localhost:3005, `assertLocalDevOnlyTarget` + `expectHermetic`); 320/375/768 px tanpa overflow horizontal.
- `pnpm --filter @trainers/web typecheck` — exit 0.
- `pnpm --filter @trainers/web lint` — 0 error, 107 warning (file lain/legacy, tidak ada di file baru).
- `pnpm --filter @trainers/web build` — exit 0.
- Prettier (file yang diubah) dan `git diff --check` — bersih.
- `impeccable detect --json` pada 4 file UI — `[]`. Review manual: target sentuh menu baris dinaikkan ke 44px.
- Tambahan di luar rencana awal: `useProfilerAccess` kini membaca role dari auth store (sumber yang sama dengan guard), menggantikan query `profiles` terpisah; error muat peserta kini tampil dengan "Coba lagi" alih-alih tampak sebagai batch kosong.
- Tidak dijalankan: unit test (butuh persetujuan), `graphify update .`, review `thermo-nuclear`/`ui-ux-pro-max` (tidak tersedia di host ini).
- Diketahui: lookup batch tetap berbasis nama (kontrak lama `counts`/`peserta/batch/:name`); nama sama di dua tahun akan memilih yang pertama.

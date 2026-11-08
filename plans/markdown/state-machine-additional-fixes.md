# Perbaikan lifecycle tambahan — 8 November 2026

## Requirement

Perbaiki risiko konkret pada lima subalur bagian 9 laporan state machine, tanpa mengulang perbaikan lokal terdahulu dan tanpa refactor massal. Harga terjadwal merupakan perilaku turunan waktu, bukan bug; pertahankan desainnya. Lane D untuk akses/auth/schema; lane C untuk draf dan pengaturan UI. Semua pengujian E2E hanya loopback atau disposable; tidak ada mutasi remote atau production deploy.

## Design

- Lindungi dirty tree awal. Scope milik tugas baru: transisi backend leader request (service/route, migration baru dan rollback), AuthModal, ReplyComposer, draft settings Telefun dan form Kegiatan; tambah spec Playwright terarah. Jangan menyentuh implementasi perbaikan SIDAK/Profiler/PDKT lama kecuali test terkait mengungkap dependensi yang benar-benar perlu.
- Akses: satu RPC transisi bersifat transaksional dengan row lock dan expected status; approve dan penggantian grup tidak boleh menghasilkan status/grup parsial. Tolak konflik/no-op, tolak self-approve/self-group reassignment, validasi grup aktif dan actor yang berhak. Pertahankan guard capability route. RPC exposed menolak anon/authenticated di dalam fungsi, gunakan search_path kosong seperti RPC service-role yang sudah ada. Tidak mengedit migration terapan.
- Auth modal: satukan fase request dalam reducer dan invalidasi respons ketika ditutup, berganti mode, atau operasi baru dimulai. Jangan menampilkan sukses atau navigasi dari request usang. Pertahankan kebijakan akun dan alur provider. Jangan menghapus akun atau mengubah signup backend untuk risiko yang belum direproduksi.
- Reply draft: satu fase editing/confirming/sending/failed/sent; kegagalan boolean maupun reject mempertahankan draf; unmount saat pengiriman belum dikonfirmasi tetap menyimpan ketikan. Cegah pengiriman ganda dan update usang.
- Settings Telefun: fase ready/saving/failed terpusat, single-flight; pertahankan draf pada kegagalan serta editor bersarang. Risiko reset karena props refresh ditelusuri, tetapi tidak direproduksi pada route aktual; sinkronisasi props tidak diubah tanpa bukti. Ini penajaman scope setelah pemeriksaan, bukan klaim bug tersebut sudah diperbaiki.
- Kegiatan: status form closed/editing/saving/failed terpusat dan operation guard; tidak boleh mengganti/menutup form atau memulai aksi bentrok ketika menyimpan, termasuk selama baca file. Pertahankan preview dan payload existing.
- Tes E2E RED-first per failure mode lalu GREEN, satu worker; tanpa unit/Vitest. Browser hermetic memakai e2eTargets. API memakai router nyata serta database lokal disposable yang dibuktikan identitasnya. Jika target aman tidak tersedia, laporkan blocker, jangan substitusi hasil tiruan sebagai bukti transaksi DB.
- gbrain code reads menolak agent caller; impact discovery memakai Graphify dan pencarian pemanggil langsung sebagai fallback.

## Tasklist

- [x] Snapshot dirty tree dan hash baseline tersimpan; target Supabase disposable terpisah 55541/55542 dibuat, bukan database lama.
- [x] E2E akses RED menunjukkan approved parsial ketika penautan dan kompensasi gagal; GREEN 7 kasus router+DB. Rerun assertion self-target akhir dicatat pada evidence.
- [x] E2E auth: request login sukses yang tertunda tidak menavigasi setelah close; signup tetap menyiapkan profil. Rerun pasca-review dengan sesi valid eksplisit lulus.
- [x] E2E ReplyComposer: keluar saat pending mempertahankan draf terbaru; kegagalan→retry→success serta klik konfirmasi ganda lulus. Rejection callback diperlakukan sama dengan false di implementasi, tetapi tidak diuji terpisah melalui route.
- [x] Kandidat props refresh tidak direproduksi pada route aktual (load awal dan save adalah penulis settings yang terlihat). Jangan mengubah sinkronisasi secara spekulatif. Tes save failed→retry sudah hijau sebelum perubahan; status save/error dirapikan ke reducer saat tetap hijau.
- [x] E2E Kegiatan: field dibekukan saat request tertunda, kegagalan mempertahankan isi; regresi tambah kegiatan dan layout desktop/mobile lulus setelah rerun terarah.
- [x] Review read-only selesai dan catatan bukti ditangani; root build/typecheck/lint exit 0, graph update exit 0. Pengujian browser dilakukan terarah, suite luas tidak diklaim bersih.
- [x] Canonical auth/access/database docs, indeks rollback, changelog dan laporan hasil diperbarui. Tidak ada commit/push/deploy/mutasi remote; migration hanya diterapkan pada target disposable.

## Verification evidence

- RED API: `E2E_SUPABASE_WORKDIR=<disposable-workdir> pnpm --dir apps/web exec playwright test --config playwright.api.config.ts --project leader-access-atomic-real-backend --workers=1 --reporter=line` exit 1, status tetap approved setelah penautan dan kompensasi gagal. GREEN awal exit 0: 7 passed. Rerun versi assertion self-approval akhir juga exit 0, 7 passed (`access-final.log`).
- RED browser: request login lama menavigasi setelah close, field Kegiatan masih enabled saat save pending; RED draf terarah menunjukkan localStorage null sebelum debounce/unmount. GREEN fokus akhir `lifecycle-ui-recovery.spec.ts`: 6 passed, exit 0 (`ui-final.log`). Payload fixture login diperjelas setelah review; rerun 4 kasus auth/Kegiatan exit 0 (`ui-review-final.log`). Typecheck final setelah perubahan review juga exit 0.
- Root typecheck: `pnpm typecheck --concurrency=1` exit 0, sebelum perubahan review akhir. Root lint: `NODE_OPTIONS=--max-old-space-size=768 pnpm lint --concurrency=1` exit 0 dengan warning. Root build: `NODE_OPTIONS=--max-old-space-size=1024 pnpm build --concurrency=1` exit 0. Log: cache scratch `state-machine-additional/`.
- Gate akhir pasca-review: browser 4/4, root typecheck exit 0, lint exit 0 (warning), graph update exit 0.
- Review read-only: bukan masalah produk baru; tambahkan kasus signup setelah close (sudah ada), perjelas sesi valid untuk login tertunda (sudah diubah), baca kembali req self-review yang tepat (sudah diubah). Tidak menjalankan tes non-E2E.
- Run browser diperluas sempat 17 passed/3 failed dan run berikutnya timeout host/tes sebelum seluruhnya selesai. Jangan klaim suite luas bersih. Perbaikan harness mengendalikan debounce saja, bukan clock animasi, dan menunggu settlement sebelum retry; status rinci ada pada report hasil.
- Hash baseline: tidak ada perubahan tak terduga pada dirty paths lama; dua path bersama yang diedit sengaja adalah `apps/web/playwright.api.config.ts` dan `supabase/rollbacks/README.md`.
- Harga jadwal, lifecycle besar Telefun/KETIK/TNA dan editor bersama tidak dirombak. Migration baru hanya lokal disposable, bukan remote. Tidak commit/push/deploy pada fase ini.

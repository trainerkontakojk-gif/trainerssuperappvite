# Penutupan backlog state machine — 8 November 2026

**Status: disposition lokal seluruh 32 butir selesai; gate akhir dan integrasi remote dicatat di hasil lanjutan.** Resume mempertahankan seluruh dirty tree dan bukti checkpoint; evidence mentah di `.audit-run/state-machine-closure-20261108/resume/`. Hasil terbaru: `advisor-plans/hasil-lanjutan-state-machine-2026-11-08.md`; register portabel: `advisor-plans/state-machine-closure-register-2026-11-08.json`. Ini bukan klaim seluruh lifecycle legacy direfactor atau diuji menyeluruh.

## Requirement

Tutup dahulu seluruh butir yang SUDAH dilaporkan pada `advisor-plans/laporan-state-machine-implisit.md`, bukan memperluas pencarian. Setiap subbagian mendapat disposition dan bukti: diperbaiki + E2E, perilaku yang memang terjaga/desain yang didokumentasikan, atau blocker yang nyata. Jangan menandai risiko yang belum direproduksi sebagai bug produksi. Penutupan lokal tidak berarti deploy produksi.

Basis: HEAD `6a6d9ba0b8d6130c4951a2fd5948c297b38d2ed4` beserta dirty tree yang sengaja dipertahankan. Snapshot hash dan binary diff di `.audit-run/state-machine-closure-20261108/`. Register awal mengambil seluruh 32 subbagian bernomor dari laporan; tidak menghitung judul sebagai bug terpisah.

## Design

- Lane C untuk koordinasi UI Monitoring, impor EFEK, dan catatan manual. Lane D untuk kontrak hasil parsial simpan KETIK serta verifikasi lintas API/database/auth. Implementasi dilakukan langsung; reviewer hanya membaca, tidak menjalankan perintah verifikasi atau menulis.
- Monitoring: satu reducer request-state dengan generation ownership. Respons/error/finally lama tidak mengubah filter baru. Refresh setelah delete memakai konteks terbaru, bukan closure filter lama; operasi delete single-flight dan hasilnya tidak menghidupkan kembali daftar usang.
- EFEK: satu reducer untuk fase file/matching/ready/importing/failed; satu generation per pemilihan file. Parsing dan pencocokan yang terlambat diabaikan. Selama impor, penggantian file/pilihan peserta dibekukan; sukses, gagal dan retry menjaga kepemilikan payload. RPC backend existing tidak dirombak.
- Catatan Telefun: fase edit/saving/failed terpusat, single-flight. Pertahankan draf saat gagal; freeze field selama save agar ACK tidak menghapus ketikan baru. Key record dan parent throw tetap dipertahankan.
- KETIK settings: pertahankan resource dan revision global/pribadi terpisah. Satu reducer tahap save mengakui global-success sebelum personal-save; jika personal gagal, pesan menyebut hasil parsial dan draf tetap ada. Retry tidak menulis ulang template yang sudah diakui bila isinya sama; perubahan template yang baru tetap memakai version terbaru. Tidak rollback resource global karena kegagalan pribadi.
- PDKT evaluasi: pertahankan kontrak recovery manual, fencing, dan ownership. Periksa bukti crash/restart yang belum selesai; tidak menambahkan worker/AI call otomatis secara spekulatif. Bila diperlukan proses fixture untuk membuktikan crash, seluruh backend/DB/provider hanya loopback disposable dan hanya child milik tes yang boleh dihentikan.
- Legacy Telefun/KETIK, SIDAK input/scope, TNA dan reference hooks ditelaah pada risiko yang dinyatakan, bukan dirombak massal karena jumlah boolean. Existing guard harus dibaca dan E2E terpilih dijalankan sebelum disposition.
- Perbaikan awal SIDAK/Profiler/access/OAuth dan paket tambahan sebelumnya tidak ditimpa. Regression memakai spec yang sudah ada; hanya tambah kasus untuk kontrak yang belum tercakup. Non-E2E tidak diizinkan.
- Tidak ada production deploy, remote mutation, atau migration remote. Database lama yang pernah kosong tidak dipakai; gunakan target disposable milik pekerjaan tambahan setelah identitas dan schema diverifikasi. Provider hanya fixture dan egress fail-closed.
- Penyesuaian harness yang diperlukan: `helpers/sidakRealBackend.ts` membaca `E2E_SUPABASE_WORKDIR` secara eksplisit melalui status CLI dan memvalidasi kedua endpoint tetap loopback. Tanpa flag, perilaku `.env.integration` lama tidak berubah. Ini menghindari menimpa file kredensial atau database integrasi milik pekerjaan lain; credential tetap hanya di memori proses.
- Gbrain code_blast/code_callers menolak caller agent (permission_denied); tidak diulang. Impact discovery memakai Graphify dan pembacaan caller/import langsung. Hasil graph lama seperti helper getApi/deleteApi tidak dijadikan sumber implementasi.

- SIDAK 4.2 (resume): RED `sidak-red.log` membuktikan hasil parse lama muncul sesudah close/reopen. Satukan fase panel/parse/save di reducer; invalidasi generation pada tutup/unmount/perubahan konteks. Bekukan konteks dan payload save; sesudah await preview/confirm, jangan menulis untuk operasi yang sudah ditutup. E2E parser memakai decoding XLSX asli dengan barrier hasil selesai, tanpa provider/database remote.

## Tasklist

- [x] Baca aturan/hasil lama, snapshot dirty tree dan buat register seluruh 32 subbagian.
- [x] Reproduksi RED dan perbaiki Monitoring (10.1); bukti RED checkpoint dipertahankan, seluruh 10 kasus lulus saat resume.
- [x] Reproduksi RED dan perbaiki impor EFEK (10.2); bukti RED checkpoint dipertahankan dan integrasi lulus.
- [x] Reproduksi RED dan perbaiki hasil parsial pengaturan KETIK (10.3); 4 kasus mencakup retry/reopen/revision berikutnya.
- [x] Reproduksi RED dan perbaiki draf catatan Telefun (10.4); dua kasus dan integrasi lulus.
- [x] Rekonsiliasi risiko legacy dengan sumber aktual dan E2E yang relevan; cleanup historis 1.4 dan dugaan props-refresh 9.4 tetap dibatasi bukti.
- [x] Verifikasi ulang perbaikan lama dan PDKT crash/restart/manual recovery pada disposable; 66 E2E DB terpilih lulus.
- [x] Rekonsiliasi review read-only terdahulu dan thermo-nuclear/security self-review. Tidak mengklaim review independen baru.
- [x] Isi seluruh 32 disposition dan perbarui canonical docs; tidak ada audit baru atau klaim 32 bug diperbaiki.
- [x] Selesaikan root typecheck/lint/build, satu Graphify update, scoped format/diff, dan commit lokal; bukti final di hasil lanjutan.
- [ ] Setelah izin eksplisit: terapkan tepat dua migration remote, verifikasi RPC, kemudian push main. Deploy produksi tidak termasuk izin commit/push.

## Verification

- RED → GREEN Playwright browser melalui route produk, boundary API hermetic/egress blocked, satu worker. Test baru tidak memakai freeze seluruh browser clock.
- Real-backend Playwright hanya setelah `E2E_SUPABASE_WORKDIR` menunjuk target disposable dan label/port/schema diverifikasi. Import API setelah env loopback dipasang. Tidak menjalankan root dev server.
- Gate serial: focused E2E, `NODE_OPTIONS=--max-old-space-size=1024 pnpm typecheck --concurrency=1`, `NODE_OPTIONS=--max-old-space-size=768 pnpm lint --concurrency=1`, `NODE_OPTIONS=--max-old-space-size=1024 pnpm build --concurrency=1`, scoped Prettier check, `git diff --check`, satu Graphify update setelah kode final.
- Simpan log/exit code per run di `.audit-run/state-machine-closure-20261108/`; capture child exit sebelum printf dan exit dengan kode yang sama. Bandingkan hash baseline hanya dengan owned/shared paths yang sengaja diubah.
- Tidak mengklaim semua kemungkinan race atau seluruh aplikasi bebas state machine implisit. Acceptance adalah setiap risiko/kontrak yang sudah ditulis mempunyai disposition yang jujur dan bukti yang sesuai.

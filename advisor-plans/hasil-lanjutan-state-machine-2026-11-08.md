# Lanjutan penutupan state machine — 8 November 2026

**Status: SELESAI LOKAL; integrasi remote menunggu izin dua migration.** Seluruh 32 butir mempunyai disposition pada [register portabel](state-machine-closure-register-2026-11-08.json). Ini menggantikan status pause pada checkpoint lama, bukan klaim seluruh aplikasi bebas state machine implisit.

## Scope dan hasil yang sudah terverifikasi

Lane D, rencana `plans/markdown/state-machine-backlog-closure.md`. Seluruh dirty tree awal dipertahankan; snapshot resume memiliki 103 file termasuk artefak lama. Tidak ada reset/stash/clean, unit/Vitest, paid-provider smoke, migration remote, atau deploy.

- Empat perbaikan closure lama (Monitoring, EFEK, pengaturan KETIK, catatan Telefun) lolos fokus 16/16. KETIK diperluas menjadi 4/4 untuk retry, hasil parsial, reopen, dan revision template berikutnya.
- SIDAK 4.2 direproduksi RED: hasil decode XLSX lama muncul setelah panel ditutup/dibuka. Hook kini memiliki satu reducer fase panel/parse/save; generation/context/unmount fence membuang hasil usang, single-flight menjaga payload, preview/confirm lama tidak mengirim mutasi berikutnya, dan refresh lama tidak menimpa konteks baru. Regresi impor 9/9; tambahan close/reopen dan ganti periode lolos pada run gap 4/4.
- Gap replay KETIK dan hapus parsial PDKT mendapat E2E browser: respons detail lama tidak mengganti pilihan baru; item yang gagal dihapus tetap ada dan kedua jumlah dilaporkan.
- Crash API PDKT nyata lolos: SIGKILL setelah claim, restart tanpa pemicu AI otomatis, claim fresh tetap processing, claim stale menawarkan retry manual, dua retry menghasilkan satu provider call. Tidak menambahkan worker PDKT otomatis.
- Regresi API perbaikan lama 28/28; worker/session/fencing KETIK dan Telefun terpilih 12/12; lifecycle rencana/evaluasi TNA 22/22.

## Target dan artefak

Database disposable workdir `/Users/nadindyta/.hermes/profiles/ram/cache/scratch/state-machine-additional/local-db`, label `ram-lifecycle-20261108`, API 55541 dan DB 55542. Seluruh 118 file migration cocok hash dengan repo; schema terpasang sampai `20261108000000`. Identitas/hash definisi RPC aktif direkam di `resume/db-functions.log`; request akses leader tersisa nol. Provider fixture dan guard loopback/fail-closed aktif. Supabase dihentikan dengan backup volume, lalu OrbStack kembali `Stopped`.

Browser memakai config repo: web dev server loopback 3005 saja, tidak reuse server, target Supabase/Telefun/proxy mati di `127.0.0.1:9` dengan routing hermetic. Seleksi integrasi ada di `resume/browser-selection.json`, runner ulang `python3 .audit-run/state-machine-closure-20261108/resume/run-browser.py`; `--list` memverifikasi 109 kasus/21 file. Hasil integrasi: **109/109 lulus**, exit 0, 12,1 menit (`resume/browser-final.log`).

## Kegagalan yang dijelaskan dan diperbaiki

- Dua run crash PDKT awal gagal menunggu provider fixture. Diagnosis child menunjukkan `Request` body sudah dikonsumsi oleh preload guard. `denyEgress.mjs` kini membaca URL tanpa membangun/mengonsumsi Request baru. Tes crash sesudah koreksi lulus.
- Run API awal: 10 lulus/1 gagal/17 belum berjalan. Fixture uji billing gambar memakai forced-template sehingga tidak masuk generasi gambar. Fixture sekarang masuk jalur generasi sungguhan dengan email valid, memeriksa attachment AI dan log biaya. Fokusnya lulus; rerun 28/28 lulus. Tidak mengubah aturan harga/produk untuk meloloskan tes.
- Pemanggilan TNA pertama salah menempatkan filter file setelah opsi project variadik; tidak ada tes yang berjalan. Sesudah koreksi CLI, fixture DB kosong memilih tahun 2100 sementara due date memakai hari ini. Percobaan memisahkan tanggal pelatihan dibatalkan karena membuat kasus invalid-month kehilangan makna. Perbaikan final di `helpers/tnaFixture.ts` memilih tahun selesai sebelum seluruh audit existing, mempertahankan konsistensi bulan audit/pelatihan. Rerun 22/22 lulus; file spec evaluasi kembali tanpa diff.
- Run gap awal: 1 lulus/1 gagal/2 belum berjalan; test PDKT memakai `alertdialog` sementara ConfirmDialog existing memakai `dialog`. Locator dan fixture detail disesuaikan, assertion hasil parsial tetap utuh; rerun 4/4 lulus.

Semua kegagalan/log awal dipertahankan, bukan diganti menjadi PASS. Jumlah run fokus dan integrasi saling overlap; jangan menjumlahkannya sebagai kasus unik.

## Dokumentasi dan batas pembuktian

- Tabel harness di `docs/e2e-testing.md` dahulu hanya menyebut `.env.integration`; kode closure sudah mendukung `E2E_SUPABASE_WORKDIR`. Dokumentasi disinkronkan tanpa mengubah credential developer.
- Bagian 1.4 laporan snapshot membahas WebRTC broker/start lama. Runtime saat ini Gemini-only: HTTP POST WebRTC selalu 404 dan server memakai facade cleanup historis; bukan lifecycle start aktif. POST retired juga terbukti lewat E2E boot nyata. Cleanup/orphan lease legacy tetap dibaca sebagai batas existing, bukan diklaim selesai diuji langsung pada seluruh skenario retry/lease.
- Pola legacy panggilan `PhoneInterface` dan beberapa status write SQL existing tetap ada. Tidak dirombak massal; disposition adalah guard/desain yang dibaca dan skenario E2E terpilih, bukan kepatuhan retroaktif semua lifecycle ke reducer tunggal.
- Antrean rekonsiliasi rekaman Telefun berbasis storage browser: batas 32 entri, TTL 7 hari, 8 attempt; bukan jaminan durable bila storage hilang. Harga terjadwal menggunakan waktu efektif; tidak membutuhkan worker perubahan status.
- Audit `impeccable detect` pada lima permukaan berubah menghasilkan `[]` (mekanis, bukan sertifikat WCAG). Review `thermo-nuclear` dilakukan langsung; tidak ada klaim reviewer independen baru.

## Gate akhir dan integrasi

Browser 109/109 lulus. Tambahan API/boot 16/16 lulus: 4 balasan/idempotensi PDKT pada DB nyata dan 12 boot/proxy/egress, termasuk POST WebRTC retired 404. Total E2E DB terpilih 66 (28 + 12 + 22 + 4); run fokus tidak dijumlahkan ulang. Root typecheck/lint/build final lulus. Graphify query awal memperlihatkan node stale (`deleteApi`), retry path exact tidak menemukan node; impact discovery memakai caller/import/source nyata. Satu update graph final berhasil; cache tidak masuk commit.

| Gate             | Perintah aktual                                                         | Hasil / log di `resume/`                  |
| ---------------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| Typecheck final  | `NODE_OPTIONS=--max-old-space-size=1024 pnpm typecheck --concurrency=1` | exit 0, 4 tasks; `typecheck-complete.log` |
| Lint final       | `NODE_OPTIONS=--max-old-space-size=768 pnpm lint --concurrency=1`       | exit 0, 4 tasks; `lint-complete.log`      |
| Production build | `NODE_OPTIONS=--max-old-space-size=1024 pnpm build --concurrency=1`     | exit 0, 3 tasks; `build-final.log`        |
| Graphify final   | `graphify update .`                                                     | exit 0; `graphify-final.log`              |

Lint tetap melaporkan warning (web 73, API 8), termasuk heuristik cleanup ref untuk counter generation; tidak ada aturan yang dinonaktifkan. Build memberi warning kompatibilitas `__dirname` config Vite untuk default loader versi mendatang; build saat ini berhasil. Graphify menghasilkan 19.928 node/37.591 edge; HTML visualisasi dilewati karena batas 5.000 node, pembaruan graph JSON berhasil.

Register menyimpan selector browser/worker, argv untuk mengulang keenam kelompok E2E, serta hash log. Contoh pengulangan browser dari root repo, tanpa membutuhkan runner lokal `.audit-run`:

```bash
python3 - <<'PY'
import json, subprocess
with open('advisor-plans/state-machine-closure-register-2026-11-08.json') as f:
    register = json.load(f)
subprocess.run(register['verification']['repeat_commands']['browser'], check=True)
PY
```

Kelompok API hanya boleh diulang setelah identitas/schema disposable diverifikasi dan `E2E_SUPABASE_WORKDIR` dipasang; `GEMINI_PROXY_URL` dikosongkan. Jangan menggantinya dengan target produksi atau server yang kebetulan memakai port sama. Snapshot 103 file awal tidak kehilangan file; handoff Cloudflare yang tidak terkait tetap identik.

Dua RPC baru (`20261107181115`, `20261108000000`) wajib tersedia sebelum API dirilis. Remote migration/deploy tetap memerlukan izin eksplisit sesuai AGENTS; belum dilakukan.

## Preflight integrasi remote (read-only)

Proyek linked CLI cocok dengan host API `.env.local`. SELECT katalog melalui Supabase MCP membuktikan `publish_sidak_rule_version(uuid,uuid,text,boolean,uuid)` dan `transition_leader_access(uuid,uuid,text,uuid[],text)` **keduanya belum ada**. Bukti boolean di `resume/remote-rpc-preflight.json`; tidak membaca data pengguna dan tidak memutasi remote.

Push API ini menunggu urutan migration schema-first. Commit/push repo memang pre-authorized, tetapi AGENTS secara eksplisit meminta izin untuk migration remote; tidak menerapkan SQL dan tidak memicu rilis API tanpa dua RPC tersebut. Persetujuan migration baru diminta setelah patch dan seluruh gate lokal konkret.

## Disposition seluruh 32 butir

Ini penutupan **inventaris risiko yang dilaporkan**, bukan 32 bug yang semuanya diperbaiki atau pembuktian semua kemungkinan race. `local_fix_verified` merujuk perbaikan pada skenario teruji; `guarded_existing` mempertahankan pengaman existing dengan batas coverage; `reference_guard`, `by_design`, dan `reviewed_retired_legacy` bukan klaim bug baru. Rincian source/spec ada pada register JSON pendamping. Area cleanup historis 1.4 dan dugaan props-refresh 9.4 tetap memiliki batas bukti yang tertulis; tidak diubah menjadi klaim runtime yang tidak diuji.

| ID   | Disposition                  | Bukti dan batas                                                                                                                                                                                                                                                        |
| ---- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | `guarded_existing`           | Guard start/end dan cleanup dipertahankan; E2E start ganda, gagal koneksi/terminal, end terkonfirmasi, cleanup retry dan unmount lulus.                                                                                                                                |
| 1.2  | `guarded_with_storage_limit` | Finalize gagal tersimpan lokal dan tidak memulai scoring. Antrean browser dibatasi 32 entri, TTL 7 hari dan 8 attempt; kehilangan storage tidak dijanjikan recovery durable.                                                                                           |
| 1.3  | `guarded_existing`           | Worker nyata menyelesaikan capture valid; token lama/capture gagal tidak dapat publish. Hanya subset queue/fencing yang dipilih, bukan seluruh suite scoring.                                                                                                          |
| 1.4  | `reviewed_retired_legacy`    | Runtime hanya mengekspos cleanup facade; POST start retired terbukti 404 melalui boot E2E. Owner-bound cleanup/orphan dibaca statis; retry/hangup/persistence/lease historis belum mendapat E2E langsung. Bukan bug start aktif atau klaim cleanup sudah teruji penuh. |
| 2.1  | `guarded_existing`           | Retry turn mempertahankan ID/pesan; antrean, expiry, append ketika respons pending dan dua pesan cepat lulus browser. Lifecycle legacy tidak dirombak.                                                                                                                 |
| 2.2  | `guarded_existing`           | Failed rerun tetap menampilkan hasil sebelumnya setelah reload; late polling tidak mengganti hasil explicit refresh; enqueue lost response tidak menulis dua kali.                                                                                                     |
| 2.3  | `guarded_existing`           | Worker nyata, SIGKILL/restart, lost lease, competing claims, session expiry, finalization failure/retry dan stale settlement teruji pada disposable.                                                                                                                   |
| 2.4  | `guarded_existing`           | Deep-link/detail retry, pergantian akun dan replay detail lama setelah pilihan baru lulus. Generation guard existing dipertahankan.                                                                                                                                    |
| 3.1  | `guarded_existing`           | Tahap pahami/tanggapi/telaah serta navigasi sesi diuji melalui workspace, riwayat dan replay. Kombinasi panel existing bukan bug yang terbukti dan tidak direfactor massal.                                                                                            |
| 3.2  | `guarded_existing`           | Replay tanpa mailbox bertahan setelah refresh; source menjaga pembeda item sintetis dan permission hapus. Create/retry token nyata tidak membocorkan metadata privat.                                                                                                  |
| 3.3  | `manual_recovery_verified`   | API SIGKILL setelah claim, restart, stale claim, explicit retry dan satu provider call lulus. Recovery tetap manual; tidak ada worker PDKT otomatis/durable baru.                                                                                                      |
| 3.4  | `guarded_existing`           | Reply RPC/API retry mengembalikan history yang sama dan menjaga atribusi; bulk delete campuran mempertahankan item gagal serta melaporkan dua count. E2E atribusi tidak menilai mutu jawaban AI.                                                                       |
| 4.1  | `local_fix_verified`         | RPC publish atomik: kegagalan, concurrency, double publish, SLIK validation, pindah periode, not-found dan denial JWT lulus 7 kasus.                                                                                                                                   |
| 4.2  | `local_fix_verified`         | RED stale XLSX parse direproduksi; reducer + generation/context ownership mencegah resurrection setelah close/reopen dan ganti periode. Preview/confirm usang tidak melanjutkan write; payload save tetap milik konteks asal.                                          |
| 4.3  | `guarded_existing`           | Query/default/reset dan perpindahan cakupan Dashboard/Ranking/Heatmap teruji; source useSidakScope dipertahankan, bukan bug yang memerlukan state machine baru.                                                                                                        |
| 5.1  | `local_fix_verified`         | Import tidak blind retry setelah hasil write tak diketahui. Jumlah mengikuti hasil server; field opsional dan hasil parsial terbukti melalui browser dan API/DB nyata.                                                                                                 |
| 5.2  | `guarded_existing`           | Workspace/deep link, back, folder/peserta dan read-only role teruji. Hak tulis tetap dari capability/backend; tidak memperluas scope data.                                                                                                                             |
| 6.1  | `guarded_existing`           | Rencana/evaluasi mempertahankan revision, locking dan frozen snapshots; aktivasi, penyelesaian, pembatalan dan concurrency lulus API/DB. Practice progress bukan status plan.                                                                                          |
| 6.2  | `guarded_existing`           | 409 mengunci mutasi sampai reload; pending, error/retry dan completion failure tampil jujur pada browser; API menolak stale/wrong status.                                                                                                                              |
| 7.1  | `local_fix_verified`         | Reject getSession callback menghasilkan pemulihan, bukan loading selamanya. Bukti ini khusus callback, bukan sertifikat seluruh bootstrap auth.                                                                                                                        |
| 7.2  | `local_fix_verified`         | Generation guard reader akses menolak respons terbalik dan mempertahankan loading milik request terbaru; E2E race lulus.                                                                                                                                               |
| 7.3  | `reference_guard`            | useApi sudah memiliki generation/unmount fence. Pembanding existing, tidak direfactor dan bukan bug yang terbukti; disposition berdasarkan source.                                                                                                                     |
| 9.1  | `local_fix_verified`         | Transition leader atomik, expected-status guard, rollback, conflict, group replacement, approve/reject race, self-review dan denial RPC lulus 7 API/DB.                                                                                                                |
| 9.2  | `local_fix_verified`         | Login lama tidak menavigasi sesudah modal ditutup; signup yang sudah menciptakan akun tetap menyelesaikan provisioning profil tanpa navigasi terlambat.                                                                                                                |
| 9.3  | `local_fix_verified`         | Draf tersimpan sebelum await, bertahan pending-unmount dan gagal/retry, dibuang hanya setelah ACK serta tidak menghapus draf berbeda yang dibuka ulang.                                                                                                                |
| 9.4  | `retry_contract_verified`    | Save/error reducer dan retry Telefun settings lulus. Dugaan reset props saat editor terbuka belum direproduksi di route; tidak diklaim sebagai bug yang diperbaiki.                                                                                                    |
| 9.5  | `local_fix_verified`         | Form Kegiatan dan mutasi single-flight; field/close dibekukan saat save, failure mempertahankan draf dan retry berhasil melalui browser.                                                                                                                               |
| 9.6  | `by_design`                  | Harga menjadi efektif lewat effective_from pada waktu baca, bukan worker status. Jadwal dan pembatalan sebelum berlaku lulus browser; bukan audit finansial menyeluruh.                                                                                                |
| 10.1 | `local_fix_verified`         | Filter loading/ready/failed dan delete dipusatkan; late success/failure ditolak dan delete completion memakai filter terbaru setelah Back. Fokus/109 lulus.                                                                                                            |
| 10.2 | `local_fix_verified`         | File terakhir memiliki parse/match/preview/payload. Import membekukan file/pilihan; failure menjaga preview dan retry eksplisit. Fokus/109 lulus.                                                                                                                      |
| 10.3 | `local_fix_verified`         | ACK global/pribadi terpisah, pesan partial, retry/reopen tanpa global write ulang dan next write memakai revision baru. Empat kasus dan integrasi lulus.                                                                                                               |
| 10.4 | `local_fix_verified`         | Catatan manual single-flight; editor dibekukan sampai ACK, failure mempertahankan draf dan sukses membersihkan input. Locator slider eksak; dua kasus/integrasi lulus.                                                                                                 |

## Koreksi pada gate lint terakhir

Root lint pertama setelah integrasi gagal dengan tiga error: parameter fixture kosong pada test crash dan dua penulisan ref saat render (Monitoring/SIDAK). Parameter diganti dengan `test.info()` untuk attachment; snapshot context sekarang dipublikasikan melalui `useLayoutEffect` sesudah commit, bukan render spekulatif. Context7 `/reactjs/react.dev` dipakai untuk memverifikasi timing hook resmi React 19. Rerun lint kemudian menemukan dependency `dispatch` belum dicantumkan pada callback Monitoring; dependency stabil dari `useReducer` ditambahkan dan lint final lulus. Tidak ada aturan lint yang dilonggarkan.

Run browser 109/109 mendahului koreksi ini. Setelahnya **seluruh dua spec terdampak** (Monitoring dan impor SIDAK) dijalankan ulang; hasilnya **20/20 lulus**, exit 0 (`resume/post-review.log`); root gates sesudah koreksi dicatat terpisah. Jangan menyebut run 109 sebagai run ulang pada kode pasca-koreksi.

Koreksi dependency stabil `dispatch` dan format akhir sesudah 20/20 tidak mengubah kontrak runtime. Typecheck final mencakup koreksi tersebut. Format check pertama menemukan lima file owned; perapian hanya format, tidak mengubah SQL maupun aturan produk. Scoped `pnpm exec prettier --check` terakhir lulus untuk seluruh 64 file yang didukung (exit 0, `resume/format-final.log`); daftar file tersimpan di register. Pemeriksaan struktur memverifikasi 32 ID unik, seluruh hash evidence, selector serial, branch main, dan tidak ada staged change lama. `git diff --check` tracked lulus. Staged diff pertama menemukan tujuh Markdown hard-break dengan trailing spaces pada metadata dua laporan historis (`resume/staged-diff-initial.log`); format diganti menjadi paragraf terpisah sebelum pemeriksaan ulang file baru.

## Verdict review dan sisa rilis

**Verdict: PASS untuk patch lokal dan skenario terpilih; integrasi remote menunggu izin.** Review source langsung memeriksa ownership async, request/claim fencing, partial ACK, atomic transaction, expected-status UPDATE, guard service-role, error publik dan egress fixture. Tidak ada temuan material P0/P1/P2 yang masih terbuka pada patch berubah; ini bukan security audit seluruh repo atau review independen baru. Batas runtime legacy 1.4 dan dugaan 9.4 tetap mengikuti disposition di atas.

Commit lokal memakai `fix(lifecycle): fence asynchronous workflows and verify recovery`, dengan changelog dan hook aktif. Push belum dilakukan: dua RPC production belum tersedia. Urutan berikutnya memerlukan izin migration remote sesuai [AGENTS.md](../AGENTS.md): apply tepat dua file yang tercatat, verifikasi katalog/guard tanpa E2E produksi, lalu push `main`. Deploy produksi bukan bagian otorisasi commit/push.

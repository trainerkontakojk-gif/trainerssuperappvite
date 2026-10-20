# KETIK — pesan agen durable dan balasan konsumen terpisah

- **Lane:** D (kontrak API publik, migrasi database, lifecycle AI, dan pencatatan biaya).
- **Keputusan pengguna:** pesan agen disimpan segera; balasan konsumen dipicu terpisah setelah quiet window; bila pesan baru masuk saat AI sedang menghasilkan balasan, hasil pertama dibuang dan AI diulang paling banyak satu kali dengan konteks terbaru.
- **Batas operasi:** implementasi dan verifikasi hanya pada database Supabase lokal/test. Tidak menjalankan migrasi atau mutasi remote.

## Requirement

1. Setiap pesan agen langsung muncul di browser dan segera dipersist ke sesi server dengan request ID idempoten. Pesan yang sudah diterima server tetap ada setelah reload, penutupan tab, penutupan konsumen, atau finalisasi sesi.
2. Penyimpanan pesan agen tidak memanggil AI. Balasan konsumen memakai endpoint terpisah setelah quiet window yang sudah ada: 1,2 detik untuk `training_fast` dan 3 detik untuk `realistic`, dihitung ulang dari kiriman agen terakhir.
3. Satu permintaan balasan membaca semua pesan agen yang sudah tersimpan sejak balasan konsumen terakhir dan menghasilkan satu rangkaian balasan konsumen.
4. Pesan agen tetap dapat dipersist ketika permintaan AI sedang berjalan. Jika versi konteks agen berubah sebelum hasil dipublikasikan, hasil pertama tidak masuk transkrip dan AI dipanggil ulang satu kali memakai konteks terbaru. Kedua panggilan tetap melalui provider wrapper sehingga usage/cost keduanya tercatat.
5. Jika konteks berubah lagi selama panggilan ulang, hasil kedua juga tidak dipublikasikan. Sesi tetap menandai bahwa balasan diperlukan dan browser menjadwalkan permintaan baru setelah quiet window; tidak ada hasil stale yang menyamar sebagai jawaban untuk pesan terbaru.
6. Reload memulihkan pesan server dan status balasan tanpa mengirim duplikat. Error menyediakan retry terhadap permintaan balasan, bukan mengirim ulang pesan agen.
7. Tahap Telaah KETIK menampilkan waktu berjalan dan estimasi jujur seperti Telefun: biasanya 1–2 menit, paling lama sekitar 3 menit, lalu copy “lebih lama dari biasanya”; tanpa persentase buatan.

## Design

### Kontrak dan persistence

- Tambahkan `agent_version` pada `ketik_sessions`. Nilai ini hanya bertambah saat pesan agen dipersist, sehingga append baru tidak konflik dengan publish balasan konsumen.
- Gunakan `ketik_session_turns` sebagai ledger idempotensi append pesan agen yang langsung diselesaikan (`completed`). RPC append memvalidasi owner, sesi aktif, expiry, request payload, dan `expectedAgentVersion`, lalu menambahkan satu pesan agen serta menaikkan `version` dan `agent_version` atomik.
- Tambahkan `ketik_session_responses` sebagai ledger/lease permintaan balasan. Hanya satu response `processing` per sesi. Row menyimpan request ID, versi konteks agen, retry count (0/1), lease, status, dan outcome publish/superseded.
- RPC claim response mengambil snapshot sesi pada `agent_version` saat ini. RPC settle membandingkan versi itu setelah provider selesai:
  - berubah, retry count 0 → pertahankan lease, naikkan retry count, kembalikan snapshot terbaru untuk satu panggilan ulang;
  - berubah, retry count 1 → tandai `superseded`, jangan publish hasil;
  - tidak berubah → publish pesan konsumen, naikkan `version`, terminalkan response.
- RPC finish tetap atomik dan memblokir response ber-lease aktif. Semua function baru tetap service-role-only; JWT authenticated hanya mendapat SELECT owner-bound melalui RLS.

### API/backend

- `POST /ketik/sessions/:id/messages` menerima `{requestId, expectedAgentVersion, text}` dan hanya menyimpan pesan.
- `POST /ketik/sessions/:id/respond` menerima `{requestId}` dan menjalankan lifecycle response idempoten. AI rate limit diterapkan hanya di endpoint ini.
- `KetikServerSession` menambahkan `agentVersion`, `awaitingResponse`, dan `pendingResponse`; endpoint `/turns` lama tetap tersedia sementara untuk kompatibilitas tetapi web baru tidak memakainya.
- Service response memanggil `generateConsumerResponse()` maksimal dua kali per request. Wrapper Gemini/OpenAI yang sudah ada tetap menjadi satu-satunya jalur logging usage.

### Browser

- `useServerKetikChat` memisahkan antrean append dari satu response in-flight. `send()` tetap menampilkan bubble langsung, lalu append dikirim serial berdasarkan `agentVersion`.
- Setelah append queue kosong dan quiet window lewat, hook memanggil `/respond`. Kiriman baru saat response berjalan tetap masuk append queue; backend melakukan discard-and-retry secara authoritative.
- Balasan yang dipublikasikan `/respond` tetap **diketik satu per satu** dengan tempo lama (`pacing.ts`: baca dulu sejak kiriman agen terakhir, lalu band panjang/pendek per balasan, sesekali lambat di mode realistic, balasan lanjutan memakai tempo `follow_up`). Jam tempo mulai dari selesai-membaca, bukan dari saat AI selesai, jadi AI yang cepat tidak membuat balasan panjang muncul dalam satu detik; balasan yang belum waktunya ditahan dari semua render supaya append baru tidak membocorkannya.
- Status centang: `sent` saat masih lokal, `delivered` setelah append server, `read` saat konsumen mulai mengetik atau balasan server tampil. Peringatan unload hanya diperlukan selama append lokal belum diakui, bukan selama AI menilai konteks yang sudah durable.
- Pesan error/retry menjelaskan kegagalan balasan konsumen tanpa menyatakan pesan agen belum tersimpan.

### Telaah

- Tambahkan komponen waktu tunggu KETIK yang mengikuti pola `TelefunAnalysisWait`: elapsed clock tersembunyi dari live announcement, progress indeterminate, estimasi 1–2/3 menit, dan late copy setelah 180 detik.
- Waktu mulai lokal dipertahankan selama phase review yang sama dan diinisialisasi saat halaman menemukan status queued/processing.

## E2E acceptance

1. **API real backend:** append menyimpan tanpa provider call; reload membaca pesan; trigger response memanggil provider sekali dan memublikasikan satu respons.
2. **API real backend race:** provider pertama ditahan, append kedua berhasil selama AI aktif, hasil pertama dibuang, panggilan kedua menerima kedua pesan, hanya hasil kedua dipublikasikan, dan dua usage rows tercatat.
3. **API bounded race:** pesan ketiga saat retry membuat hasil kedua superseded tanpa publish; sesi tetap `awaitingResponse` dan request baru dapat menyelesaikannya.
4. **Security/idempotency:** payload append yang berubah ditolak; akun lain 404; JWT tidak dapat mengeksekusi RPC atau menulis tabel; replay request tidak menggandakan pesan/provider call.
5. **Browser:** bubble kedua tampil dan tersimpan saat response pertama masih berjalan; reload mempertahankannya; composer tetap aktif; balasan akhir membaca konteks gabungan.
6. **Telaah browser:** status queued/processing menampilkan elapsed clock dan estimasi 1–2/3 menit, berubah ke late copy setelah 180 detik, tanpa persen palsu, pada desktop dan mobile.

## Tasklist

- [x] RED: `ketik-session-api.spec.ts` — append tanpa provider, trigger response, race discard-and-retry, bounded supersede, RLS/RPC denial, dan kolom lease.
- [x] RED: `ketik-server-chat.spec.ts` — bubble + append durable saat response aktif, dua kiriman cepat → satu respond, reload; `ketik-review-worker-browser.spec.ts` — elapsed clock + estimasi Telaah.
- [x] GREEN: migration `20261020160000_ketik_durable_agent_messages.sql` (lokal: applied; rollback/reapply diaudit dalam satu transaksi).
- [x] GREEN: shared schema/types, route `/messages` + `/respond`, service append/claim/settle, kompatibilitas `/turns`.
- [x] GREEN: hook chat dipecah menjadi append queue + response lifecycle; centang Diterima/Dibaca dan retry per-jenis.
- [x] GREEN: `KetikReviewWait` dipasang di tahap Telaah.
- [x] RED→GREEN (perbaikan tinjauan): `ketik-server-chat.spec.ts` — "consumer replies published by one response are still typed out one at a time" membuktikan balasan yang sudah dipublikasikan belum tampil saat konsumen masih mengetik, lalu muncul satu per satu (balasan kedua menunggu tempo `follow_up` sendiri). Tanpa pace ini tes gagal karena kedua balasan tampil sekaligus.
- [x] Docs: `modules.md`, `architecture.md`, `database.md`, `e2e-testing.md`, dan rollback README.
- [x] Verifikasi: `ketik-session-api` 14/14, `ketik-server-chat` 15/15, `ketik-review-worker-browser` 5/5, `ketik-flow` 40/40, `ketik-consumer-prompt-api` (back-to-back) 1/1, opt-in `ketik-session-browser` (`E2E_KETIK_LIVE=1`) 1/1, root `pnpm lint` 4/4 (66 warning lama), root `pnpm typecheck` 4/4, root `pnpm build` 3/3, `supabase db lint --local`, siklus apply/rollback/reapply migrasi dalam satu transaksi yang di-rollback, Impeccable detector kosong, `git diff --check`.
- Verifikasi ulang khusus perbaikan pace balasan (sesi tinjauan): `ketik-server-chat` 16/16 (termasuk tes pace baru), `ketik-flow` 40/40, root `pnpm typecheck` 4/4, root `pnpm lint` 4/4 (0 error, 66 warning lama di luar perubahan), root `pnpm build` 3/3, `git diff --check` bersih.
- Opt-in `ketik-session-browser` sebelumnya sudah stale: fixture konsumen menembak OpenAI padahal sesi KETIK dipaksa ke Gemini. Fixture sekarang membedakan panggilan konsumen vs review lewat `systemInstruction` dan memakai endpoint baru.

## Catatan rollout

- Deploy API sebelum web: `/messages` dan `/respond` harus ada sebelum hook baru dipakai; klien lama tetap memakai `/turns` yang kini juga menaikkan `agent_version` dan menolak saat response aktif.
- Aktifkan migrasi hanya lewat proses rilis yang disetujui (remote belum disentuh pada sesi ini).

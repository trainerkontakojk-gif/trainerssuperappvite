# KETIK — ritme balasan konsumen seperti manusia (Lane C)

## Requirement

Sumber: pertanyaan Fajar di thread proyek (2026-10-17) soal kecepatan balasan dan template "/maintain" ("apakah informasinya sudah cukup jelas?"), dijawab "Perbaiki semua" lalu "Setuju".

- Pesan agen yang dikirim berdekatan dibaca dulu dan dibalas konsumen satu kali, bukan satu balasan per gelembung.
- Jeda balasan ikut lama membaca semua pesan agen sejak balasan konsumen terakhir, lalu lama mengetik balasannya. Tanda "sedang mengetik" baru muncul setelah konsumen selesai membaca.
- Kecepatan per tipe: Terburu-buru dan Marah lebih cepat, Bingung dan Pasrah lebih lambat.
- Pertanyaan cek pemahaman ("sudah jelas?") dijawab jujur sesuai tipe: tidak bilang jelas kalau masalah belum terjawab; ditanya sebelum sempat membalas berarti belum selesai membaca; ditanya berulang membuat Marah dan Kritis kesal. Tidak semua tipe tersinggung.

## Design

- `packages/types/src/ketik-session.ts`: `ketikSessionTurnSchema` menerima `awaitMore?: true` (opsional, kompatibel dengan klien lama).
- `apps/api/src/services/ketik/server-sessions.ts`: giliran dengan `awaitMore` menyimpan pesan agen tanpa memanggil AI (publish pesan kosong, chat tidak ditutup). Riwayat dan replay tetap lewat RPC yang sama; tidak ada migrasi.
- `apps/web/src/routes/ketik/hooks/useServerKetikChat.ts`: antrean menunggu jeda tenang singkat setelah kiriman terakhir; pesan antrean yang masih punya pesan berikutnya dikirim dengan `awaitMore`. Jeda balasan = waktu baca (dihitung dari saat pesan agen terakhir dikirim) + waktu ketik, dikali faktor tipe. Hook memberi `isConsumerTyping` terpisah dari `isLoading`.
- `apps/web/src/routes/ketik/lib/pacing.ts`: waktu baca per karakter, faktor kecepatan per tipe, jeda tenang; `isAgentGivingSolution` dihapus (digantikan waktu baca).
- `apps/web/src/routes/ketik/components/ChatInterface.tsx`: tanda mengetik memakai `isConsumerTyping` dan diberi label aksesibel.
- `apps/api/src/services/ketik/consumer-response.ts`: aturan membalas beberapa pesan agen sekaligus dan reaksi cek pemahaman per tipe.

## Tasklist

- [x] RED: E2E hermetic `ketik-server-chat.spec.ts` (dua pesan berdekatan → satu `awaitMore`, satu balasan; tanda mengetik tidak muncul saat membaca) dan E2E real backend `ketik-consumer-prompt-api.spec.ts` (`awaitMore` tanpa panggilan AI; aturan cek pemahaman di prompt).
- [x] GREEN: ubah file di atas.
- [x] Typecheck api/web, lint, build, E2E fokus, `git diff --check`, thermo-nuclear.

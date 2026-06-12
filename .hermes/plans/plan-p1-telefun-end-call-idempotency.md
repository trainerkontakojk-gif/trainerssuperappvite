# P1.1 Telefun End-Call Idempotency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development` and `superpowers:verification-before-completion`.

## Goal

Menjamin satu lifecycle finalisasi dan satu proses scoring per sesi Telefun walaupun tombol End Call diklik berulang, timeout bertabrakan dengan klik user, atau request scoring datang bersamaan.

## Requirements

- Tombol End Call masuk state `disconnecting/finalizing`, disabled, dan menampilkan status yang jelas.
- `PhoneInterface` hanya menjalankan `disconnect()` satu kali untuk setiap instance panggilan.
- Promise callback recording/finalizer harus ditunggu sebelum navigasi kembali ke home.
- Callback recording tetap boleh menyelesaikan upload/finalisasi setelah komponen mulai ditutup.
- Endpoint `POST /telefun/score/:id` memiliki claim atomik; request kedua tidak memanggil AI lagi.
- Hasil cached yang valid tetap dikembalikan tanpa billing AI tambahan.
- Status scoring minimal: `pending`, `processing`, `completed`, `failed`, beserta timestamp/error yang aman.
- Nilai `0` tetap dianggap score valid.

## Design

- Tambahkan lock frontend berbasis ref untuk menutup race klik ganda dan race timeout-vs-user.
- Ubah kontrak recording completion agar `disconnect()`/end-call dapat menunggu satu finalization Promise, bukan fire-and-forget callback.
- Tambahkan kolom lifecycle scoring pada `telefun_history` melalui migration terminal baru.
- Claim scoring dilakukan atomik di backend sebelum `analyzeVoiceQuality()`. Jika sudah `processing`, endpoint mengembalikan status in-progress; jika `completed`, gunakan assessment cached.
- Finalizer tetap mempertahankan urutan yang sekarang sudah benar: upload -> persist path -> score -> persist result.
- Jangan mengandalkan lock frontend sebagai boundary billing; backend adalah sumber idempotensi.

## Tasklist

- [ ] Tambahkan regression test `PhoneInterface` untuk double click End Call dan timeout yang terjadi bersamaan; pastikan `disconnect()` hanya sekali.
- [ ] Tambahkan regression test `LiveSession` yang membuktikan `disconnect()` belum resolve sampai async `onRecordingComplete()` selesai.
- [ ] Ubah `emitRecording()`/`disconnect()` di `apps/web/src/routes/telefun/services/geminiService.ts` untuk mengembalikan dan menunggu finalization Promise yang sama.
- [ ] Tambahkan `isDisconnecting`/`endCallStartedRef` di `apps/web/src/routes/telefun/components/PhoneInterface.tsx`.
- [ ] Disable tombol End Call dan tombol kontrol lain selama disconnect/finalization; navigasi home hanya setelah Promise selesai; tambahkan label aksesibel.
- [ ] Buat migration `supabase/migrations/<timestamp>_telefun_scoring_lifecycle.sql` untuk status, claimed timestamp, completed timestamp, attempt count, dan last error.
- [ ] Tambahkan RPC/function atomik claim scoring yang hanya mengubah `pending/failed` menjadi `processing`.
- [ ] Tambahkan test migration/security contract untuk grant, ownership, dan transisi status.
- [ ] Refactor `apps/api/src/routes/telefun/recordings.ts` agar claim terjadi sebelum AI call dan cache valid dikembalikan lebih dulu.
- [ ] Pastikan `apps/api/src/lib/telefun-analysis.ts` menyimpan assessment, score, dan status completed dalam satu jalur sukses; jalur error menandai failed.
- [ ] Tambahkan concurrent-request regression test: dua request paralel hanya memanggil generator AI sekali.
- [ ] Tambahkan test retry dari status failed dan recovery stale processing berdasarkan batas waktu eksplisit.
- [ ] Update dokumentasi modul Telefun dan rebuild log.
- [ ] Verifikasi: targeted Telefun API/web tests, migration validator, API/web `tsc --noEmit`, lint, dan `git diff --check`.

## Risk Assessment

- **High:** claim salah dapat membuat sesi permanen stuck di `processing`.
- **High:** migration/grant salah dapat membuka mutasi status ke client.
- **Medium:** lock UI dapat mencegah retry lokal bila disconnect gagal sebelum recording complete.
- **Mitigasi:** stale-claim timeout, service-role-only mutation, test concurrent request, dan tombol retry dari history.

## Rollback Plan

- Revert perubahan frontend lock jika lifecycle panggilan tidak bisa ditutup.
- Revert route/lib ke cache behavior sebelumnya.
- Jalankan rollback SQL yang menghapus RPC dan kolom lifecycle hanya setelah memastikan tidak ada worker yang masih memakainya.
- Assessment/score yang sudah tersimpan tidak dihapus saat rollback.

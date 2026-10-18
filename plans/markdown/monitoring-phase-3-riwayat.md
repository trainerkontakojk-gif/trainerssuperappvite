# Monitoring tahap 3 — Riwayat cepat dan cakupan leader

- **Lane:** D (schema + API contract + auth scope + UI).
- **Diminta:** Fajar, 2026-10-17 (rencana redesign Monitoring, tahap 3). Leader: "Tim disetujui".
- **Mockup:** `/mnt/project-files/telaah-monitoring/` bagian Riwayat, Filter, Kosong & leader, HP.

## Requirement

1. `GET /ai/monitoring/history` mengirim satu halaman (25 baris ringkas, tanpa transkrip), terbaru dulu, dengan total dan jumlah per modul/status.
2. Filter modul, status (Diproses mencakup pending), tanggal WIB, dan pencarian (skenario, konsumen, peserta, email/nama pelaksana) dikerjakan server.
3. Leader hanya melihat sesi yang peserta targetnya, atau akun pelaksananya, ada di tim yang aksesnya disetujui (modul `sidak` atau `all`), termasuk detail sesi. Leader tanpa persetujuan tidak melihat apa pun.
4. Halaman `/monitoring`: filter tersimpan di alamat (`modul`, `status`, `dari`, `sampai`, `q`, `hal`), satu baris per sesi, menu ⋯ (Buka detail, Hapus sesi… untuk admin/trainer), dialog hapus menyebut sesinya, kosong dengan Hapus filter, catatan tim untuk leader, daftar ringkas di HP.

## Design

- Migrasi `20261018090000_monitoring_sessions.sql`: view `monitoring_sessions` (security_invoker, gabungan KETIK/PDKT/Telefun/`results` lama tanpa duplikat) + fungsi `monitoring_sessions_page(...)` yang mengembalikan `{total, counts, rows}` dalam satu panggilan. Hanya `service_role`. Indeks `profiler_peserta.trainer_id`.
- Status Telefun mengikuti riwayat SIDAK (`scoring_status`, lalu `status`, lalu skor).
- Durasi KETIK dihitung di API dari stempel waktu pesan pertama/terakhir (`ketikTranscriptDurationSeconds`).
- Daftar peserta leader dikirim ke fungsi lewat body RPC (bukan URL), jadi tidak ada batas panjang alamat.
- Fallback terbatas: bila fungsi belum dipasang di production, API membaca semua sesi seperti sebelumnya lalu memfilter dan membagi halaman di server. Di jalur ini nama akun tidak tersedia (email dipakai) dan judul PDKT mengikuti parser lama.
- Detail sesi: modal lama dipakai ulang, data telaah dimuat sekali di halaman lalu dioper (seperti SIDAK). Halaman detail sendiri adalah tahap 4.

## Tasklist

- [x] RED: `e2e/monitoring-riwayat-api.spec.ts` (backend nyata) + hermetic `e2e/monitoring-riwayat.spec.ts`.
- [x] Migrasi + rollback + README rollback.
- [x] Service `monitoring-sessions-service.ts`, validasi query, cakupan leader di daftar dan detail.
- [x] UI: `HistoryTab`, `HistoryFilters`, `HistoryTable`, `history-search.ts`, rute dengan `validateSearch`.
- [x] Perbarui `monitoring.spec.ts`, `monitoring-harga.spec.ts`, `monitoring-numbers-api.spec.ts` ke bentuk halaman.
- [x] Hapus unit test HistoryTab lama yang digantikan E2E (`monitoring-redesign.test.tsx` blok HistoryTab, satu tes di `monitoring-assessment-completeness.test.tsx`).
- [x] typecheck/lint/build, `git diff --check`, CHANGELOG.

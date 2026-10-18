# Monitoring tahap 5 — Biaya AI

- **Lane:** C (API contract + auth scope + UI), tanpa migrasi.
- **Diminta:** Fajar, 2026-10-17 (rencana redesign Monitoring, tahap 5); dilanjutkan 2026-10-18 ("Lanjut redesign monitoring"). Leader: "Tim disetujui".
- **Mockup:** `/mnt/project-files/telaah-monitoring/` bagian Biaya AI, Biaya per orang, Tampilan HP.

## Requirement

1. Tab diganti nama menjadi Riwayat / Biaya AI / Harga & kurs; judul halaman "Monitoring".
2. `/monitoring/biaya?bulan=YYYY-MM&modul=…&q=…`: bulan sebelumnya/berikutnya, pilihan bulan, modul, cari pengguna; satu baris ringkas (Total, Simulasi, Penilaian, Lainnya, Panggilan AI, Token); tabel per pengguna dan per model dengan baris Total; daftar ringkas di HP.
3. `/monitoring/biaya/:pengguna`: rincian satu orang per model dengan token masuk/keluar dan tautan ke sesinya di Riwayat.
4. Leader hanya melihat biaya akun yang tertaut ke peserta di tim yang aksesnya disetujui; tanpa persetujuan tidak melihat apa pun.

## Design

- `GET /ai/monitoring/aggregation` menerima `user_id` (UUID). Cakupan leader memakai `resolveMonitoringScope` + `scopedUsageUserIds` (akun dari `profiler_peserta.trainer_id`), lalu `.in("user_id", …)` sebelum membaca log, jadi baris di luar tim tidak pernah dibaca.
- Filter SIDAK/TNA/KTP di mockup tidak dibuat: modul itu tidak mencatat `ai_usage_logs` dengan namanya sendiri (forecast SIDAK tercatat sebagai `qa-analyzer`). Filter tetap KETIK, PDKT, Telefun, Analisis QA.
- Respons tetap array per akun (kontrak lama), jadi tidak ada perubahan untuk pemanggil lain.

## Tasklist

- [x] Backend nyata: `e2e/monitoring-biaya-api.spec.ts` (RED dulu: user_id ditolak, leader melihat semua).
- [x] API: `user_id`, cakupan leader.
- [x] UI: `BiayaTab`, `BiayaUserPage`, `components/usage/*`, `biaya-search.ts`, rute, breadcrumb, nama tab.
- [x] Hermetic: `e2e/monitoring-biaya.spec.ts`; perbarui `monitoring.spec.ts`, `monitoring-harga.spec.ts`.
- [x] Hapus `UsageTab.tsx` dan unit test lama `monitoring-unauthorized.test.tsx` (tidak di suite mana pun; tab, peran, error, dan pemuatan data sudah dicakup E2E).
- [x] typecheck/lint/build, `git diff --check`, CHANGELOG.

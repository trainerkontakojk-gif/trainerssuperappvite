# Performa gelombang 4: riwayat ringan dan koneksi Telefun

Lane C (API contract + UI data loading). Sumber: audit `/mnt/project-files/audit-performa/laporan.md`.

## 4a. Riwayat PDKT ringan

- `GET /api/v1/pdkt/history?view=list` mengembalikan baris ringkas (`detail: "summary"`): kolom skalar, skor, id/judul skenario pertama, subjek email terakhir. Dipilih dengan proyeksi JSON PostgREST, jadi isi email dan evaluasi penuh tidak keluar dari database.
- `GET /api/v1/pdkt/history/:id` mengembalikan satu sesi penuh (RLS dicek lewat klien user, 404 bila tidak terlihat).
- Web: Riwayat, workspace, dan landing memakai `view=list`. Replay di landing mengambil sesi penuh; Telaah di workspace mengambil evaluasi penuh saat dibuka.
- Pagination sengaja tidak dibuat: baris ringkas ~300 B, sehingga filter dan pencarian di klien tetap instan.
- E2E: `pdkt-resilience-api` (kontrak list/detail) dan `pdkt-flow` describe "PDKT riwayat ringkas".

## 4b. Daftar riwayat Telefun ringan

- `GET /api/v1/telefun/sessions?view=list` memilih kolom yang dipakai landing dan Riwayat saja (skor, penilaian suara, status, subjek) dan menandai baris `detail: "summary"`. Transkrip (`messages`), `session_metrics`, `disruption_results`, `live_prompt_instructions`, dan teks coaching tidak ikut.
- Telaah (`/telefun?sesi=…&tahap=telaah`) memuat sesi penuh lewat `GET /telefun/history/:id` bila barisnya ringkas; gagal dimuat kembali ke landing dengan pesan.
- `projectTelefunHistoryRow` tidak lagi mengirim `scoring_claim_token_hash` dan `scoring_claim_owner`.
- E2E: `telefun-history-list-api` (kontrak) dan `telefun-flow` "riwayat ringkas" (2 tes).

## 4c. Koneksi Telefun saat nada dering

- `PhoneInterface` membuat sesi dan memanggil `connect(token, { pickUp: ring })` saat dering mulai. Mikrofon, WebSocket, autentikasi, konfigurasi, dan setup Gemini berjalan selama dering.
- `LiveSession` menahan hal yang menandai panggilan dimulai sampai `pickUp`: MediaRecorder start, `sessionStartTime`, kiriman suara mikrofon, dan status "Tersambung". Ditutup sebelum diangkat tidak menghasilkan rekaman, dan `connect` berhenti bila ditutup saat mikrofon atau audio sedang disiapkan.
- E2E: `telefun-call` "sambungan disiapkan selama nada dering" (setup terkirim saat masih "Memanggil…", tanpa `realtimeInput` sebelum diangkat).

## 4d. Indeks DB (migrasi + langkah untuk Fajar)

- `20261019140000_practice_history_list_indexes.sql` adds `telefun_history (user_id, created_at DESC, id DESC)`, `pdkt_history (user_id, "timestamp" DESC, id DESC)`, and `pdkt_mailbox_items (last_activity_at DESC, id DESC)`. The mailbox is shared (SELECT policy `true`), so its list has no owner filter.
- Additive, and no code depends on it, so the merge order does not matter. Verified locally: apply twice, then rollback, then apply again. With seqscan off, the plan uses an Index Only Scan.
- Production: Fajar runs `supabase db push` from `main` (runbook `/mnt/project-files/audit-performa/gelombang-4-indeks-langkah-produksi.md`).

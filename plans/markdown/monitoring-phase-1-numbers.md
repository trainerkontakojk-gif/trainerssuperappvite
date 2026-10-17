# Monitoring tahap 1 — perbaiki angka

Lane D (biaya/pemakaian AI, kontrak API Monitoring). Rencana induk dan mockup: artifact "Rombak Monitoring" (`/mnt/project-files/telaah-monitoring/`), disetujui Fajar 2026-10-17.

## Requirement

1. Durasi sesi KETIK di Monitoring dan riwayat simulasi SIDAK adalah lama sesi sebenarnya, bukan `ketik_history.simulation_duration` (batas waktu dalam menit dari `config.simulationDuration`).
2. Detail KETIK menampilkan batas waktu sebagai "Batas waktu: N menit".
3. `GET /ai/monitoring/aggregation` membaca semua baris bulan itu (tidak terpotong batas baris PostgREST), memvalidasi `year`/`month`, dan mengembalikan `other_cost_idr` per pengguna.
4. Aksi AI yang sudah dipakai tetapi belum dikategorikan masuk kategori yang benar: `start_session`, `generate_email_template` (simulasi), `evaluate_agent_response`, `replay-annotation-generation` (penilaian). Sisa aksi tanpa kategori (mis. `generate-trend-forecast` dari `qa-analyzer`) tampil sebagai "Lainnya".
5. Tab Penggunaan: pilihan bulan menampilkan nama bulan, pilihan modul menampilkan label (termasuk "Semua modul") dan bisa kembali ke "Semua modul"; ada pilihan "Analisis QA"; ringkasan menampilkan biaya Lainnya.
6. Endpoint Monitoring tidak mengirim pesan error database mentah.
7. `PUT /ai/monitoring/pricing` menolak `model_id` yang tidak ada di registry model.

## Design

- Helper `ketikTranscriptDurationSeconds(firstIso, lastIso)` di `packages/types` (selisih stempel waktu pesan pertama dan terakhir, `null` bila tidak valid). Monitoring memakai pesan yang sudah dibaca; SIDAK memilih `messages->0->>timestamp` dan `messages->-1->>timestamp` lewat PostgREST supaya tidak memuat seluruh transkrip.
- `simulation_duration` tetap dikirim apa adanya (menit) dan hanya diberi label baru di web.
- Agregasi: loop `.range()` per 1000 baris, urut `created_at,id`; skema zod untuk query; kategori `other` dijumlahkan.
- Error: `console.error` untuk detail, pesan Indonesia yang ramah di respons.

## Tasklist

- [x] RED: `e2e/monitoring-numbers-api.spec.ts` (backend nyata + Supabase lokal) dan tambahan `e2e/monitoring.spec.ts` (hermetic).
- [x] GREEN: durasi KETIK (monitoring-history-service, sidak/agent-simulations), label batas waktu (ReviewDetailModal).
- [x] GREEN: agregasi utuh + validasi + other_cost_idr; kategori aksi.
- [x] GREEN: UsageTab (Select items, sentinel "all", Lainnya, Analisis QA).
- [x] GREEN: pesan error ramah, tolak model tak dikenal.
- [x] thermo-nuclear review, typecheck/lint/build root, `git diff --check`, CHANGELOG.

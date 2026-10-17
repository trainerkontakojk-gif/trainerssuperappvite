# KETIK — konsumen AI yang lebih realistis (Lane C)

## Requirement

Sumber: audit prompt konsumen KETIK (2026-10-17, `/mnt/project-files/audit-ketik/audit-prompt-konsumen.md`) dan keputusan Fajar di thread proyek: perbaiki semua temuan kecuali penugasan (temuan 11, fitur penugasan belum diterapkan).

- Konsumen terasa seperti manusia yang chat ke Kontak OJK 157, bukan asisten yang membantu agen atau memberi petunjuk saat agen salah.
- Kepribadian mengikuti tipe yang dipilih; tipe Marah benar-benar sulit ditangani.
- Info masalah dibuka bertahap, dengan atau tanpa skrip, supaya agen harus menggali.

## Design

- `apps/api/src/services/ketik/consumer-response.ts`
  - Hapus framing "membantu agen" di status waktu; tetap larang menutup chat sebelum inti masalah tersampaikan.
  - Blok `POSISI KONSUMEN`: tidak tahu SOP/jawaban benar, tidak mengoreksi agen, tidak memberi petunjuk, info baru hanya bila ditanya. Aturan tindak lanjut tidak lagi menyebut "kanal pelaporan".
  - Aturan buka info bertahap berlaku untuk semua skenario; "WAJIB jelaskan masalah di 2–3 pesan" diganti "sampaikan inti keluhan singkat".
  - Perilaku per tipe berdasarkan id tipe bawaan (`marah`, `kritis`, `terburu-buru`, `bingung`, `ramah`, `pasrah`): perilaku, gaya chat, contoh gaya bicara, cara menolak topik di luar kasus, dan penutupan. Tipe buatan trainer (id lain) memakai aturan umum.
  - Marah: satu batas tegas (tanpa makian kasar, SARA, ancaman fisik), nada turun hanya setelah beberapa balasan baik berturut-turut, empati template membuat makin kesal, boleh menutup dengan kecewa di fase akhir.
  - Larangan "jangan dramatis" hanya untuk tipe tenang; singkatan chat lazim boleh untuk Marah, Terburu-buru, Bingung.
  - Bahasa prompt memakai "kamu". Komentar suhu Gemini diperbaiki (Gemini memakai suhu bawaan, nilai tidak dikirim).
- `packages/types/src/ketik.ts`: deskripsi skenario bawaan diberi latar singkat; deskripsi tipe bawaan diselaraskan.
- `apps/web/src/routes/ketik/simulation.tsx`: dihapus (rute dialihkan, memanggil endpoint yang sudah dimatikan).
- Tidak ada perubahan skema, kontrak API, atau penugasan.

## Tasklist

- [x] RED: E2E `apps/web/e2e/ketik-consumer-prompt-api.spec.ts` (real backend lokal) membaca instruksi yang dikirim ke penyedia AI untuk tipe Marah dan Ramah.
- [x] GREEN: ubah file di atas.
- [x] Typecheck api/web, lint, E2E fokus, `git diff --check`, thermo-nuclear.

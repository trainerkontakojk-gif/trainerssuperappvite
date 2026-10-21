# KETIK — keterangan lampiran sebagai fakta konsumen

Lane C (bug fix, cross-file: prompt policy, consumer prompt, API E2E).

## Requirement

- Keterangan lampiran adalah isi bukti dan pengalaman konsumen; nominal, tanggal, nama, nomor, serta isi pesan boleh dijawab ketika relevan, tetap mengikuti BUKA INFORMASI BERTAHAP. Pengiriman lampiran tetap dikecualikan.
- Satu daftar `scenario.attachments: [{ index, description }]` di blok data menggantikan `imageDescriptions`, satu entri per gambar dengan indeks asli dan keterangan trim atau null.
- Instruksi lampiran merujuk daftar itu tanpa mengulang keterangan sebagai instruksi. Identitas tetap hanya dari `identity`; konflik keterangan tidak mengubah inti masalah pada deskripsi skenario.
- Riwayat pesan konsumen bertag `[SEND_IMAGE: n]` membawa keterangan lampiran valid tanpa mengubah teks tersimpan. Serialisasi riwayat dan kompaksi memakai pemetaan yang sama agar budget tetap eksak.
- Tidak mengubah attachment guard, injection detection, route/API, shared types, migrasi, atau sistem remote.

## Design

- `apps/api/src/services/ketik/prompt-policy.ts`: daftar lampiran terindeks dalam escaped JSON; instruksi fakta lampiran; satu pemetaan riwayat untuk turn prompt dan pengukuran kompaksi, dengan count/alts opsional.
- `apps/api/src/services/ketik/consumer-response.ts`: teruskan count/alts dari skenario yang sudah diterima ke pemetaan riwayat; tambahkan keterangan lampiran pada sumber fakta aturan 13 dan script mode.
- `apps/api/src/services/ketik/server-sessions.ts`: tidak perlu berubah; skenario yang dikirim sudah mempertahankan panjang images dan imageAlts.
- `apps/web/e2e/ketik-consumer-prompt-api.spec.ts`: JWT/Hono/Supabase loopback nyata, provider fixture; verifikasi daftar, alt kosong/escaping, aturan fakta, dan anotasi riwayat pada giliran berikutnya.
- Harness drift: default Playwright config mengecualikan `*-api.spec.ts`; verifikasi memakai `--config playwright.api.config.ts` dan project `ketik-consumer-prompt-real-backend` bila perintah brief tidak menemukan tes.

## Tasklist

- [x] RED: update tes lampiran, tambah regresi indeks kosong, fakta, dan riwayat; empat tes fokus masing-masing gagal pada assertion yang diharapkan.
- [x] GREEN: implementasi minimal; empat tes fokus masing-masing lulus, seluruh spec 9 passed (satu run serial).
- [x] thermo-nuclear self-review, API/web typecheck, scoped ESLint, `git diff --check` lulus.
- [x] Implementation report: `.pi/orchestrator/ketik-alt-prompt/impl-report.md`, berisi perintah, exit code, bukti RED/GREEN, dan keterbatasan. Tidak commit/push/changelog.

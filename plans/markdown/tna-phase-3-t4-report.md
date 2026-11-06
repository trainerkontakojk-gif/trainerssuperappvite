# TNA Fase 3 — Laporan T4 (UI latihan simulasi)

- **Tanggal:** 2026-11-06. Baseline `b12519f7` (`main`).
- **Rencana:** [`tna-phase-3.md`](tna-phase-3.md) rev. 3 (D19, P-4, Q-1, Q-2). Lane **D** (antarmuka baru).
- **Skill:** `ui-ux-pro-max` sebelum implementasi, `impeccable` audit sesudahnya.
- **Target:** spec browser **hermetic** (semua API di-mock, dev server lokal `127.0.0.1:3005`, `reuseExistingServer: false`). Tidak ada backend, data produksi, atau deploy.

## Catatan desain (ui-ux-pro-max)

- **Permukaan:** form rencana (`/tna/kebutuhan/$id` saat membuat, `/tna/rencana/$id` saat draf) dan detail rencana `aktif`/`evaluasi`/`selesai`.
- **Hierarki form:** bagian "Latihan simulasi" diletakkan sesudah target QA dan sebelum peserta. Satu baris per modul: checkbox modul di kiri, "Sesi minimal" di kanan. Default berasal dari `suggested_modules` program (3 sesi) sampai trainer mengubahnya; mengganti program sebelum menyentuh bagian ini ikut mengganti default.
- **Hierarki progres:** heading → "Target: …" → ringkasan per modul ("KETIK: x dari N peserta memenuhi target") → daftar per peserta (`dl` per modul: sesi, rata-rata pada skala asli, status) → keterangan (live atau beku, catatan Telefun, "Data latihan mendukung, bukan pengganti hasil QA.").
- **Keadaan:** live, beku (`frozen`), gagal dimuat (`role="alert"` + **Coba lagi**), tanpa target (bagian tidak tampil; daftar terkunci menulis "Tanpa target latihan"). Saat draf belum ada progres; target hanya bisa diedit di form.
- **Responsif:** satu kolom di mobile, `dl` dua kolom mulai `sm`. Target sentuh ≥44px (checkbox dalam label setinggi 44px, input 44px). Tanpa scroll horizontal di 390px.
- **Token:** hanya `border-border`, `text-muted-foreground`, `text-foreground`, `text-destructive`. Tidak ada warna hardcode. Angka memakai `tabular-nums`.
- **Bukan tujuan:** tampilan untuk agent (K22), notifikasi, ambang skor (K23).

## File

| File                                     | Isi                                                                                                                                                                          |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/routes/tna/PlanForm.tsx`   | Fieldset "Latihan simulasi"; `practice_targets` ikut di body create/patch; pesan validasi menyebut sesi 1–20.                                                                |
| `apps/web/src/routes/tna/Practice.tsx`   | Komponen baru `PracticeProgress`.                                                                                                                                            |
| `apps/web/src/routes/tna/plan.tsx`       | Nilai awal form memuat target tersimpan; daftar terkunci menampilkan "Target latihan simulasi"; bagian progres dipasang sebelum evaluasi, **Coba lagi** = muat ulang detail. |
| `apps/web/src/routes/tna/utils.ts`       | Label modul/status, skala skor per modul (Telefun 10, lainnya 100), teks target, catatan Telefun (Q-1).                                                                      |
| `apps/web/e2e/tna-practice-flow.spec.ts` | Spec browser hermetic baru (6 test).                                                                                                                                         |
| `plans/markdown/tna-phase-3-t4-*.png`    | Screenshot: form mobile terang/gelap, progres desktop dan mobile terang/gelap.                                                                                               |

## Spec (`tna-practice-flow.spec.ts`)

1. Rencana baru: default dari saran program (KETIK + Telefun dicentang, 3 sesi; PDKT nonaktif); catatan Telefun muncul/hilang sesuai centang; perubahan terkirim sebagai `practice_targets` urut modul; mobile tanpa scroll horizontal.
2. Draf: target tersimpan terisi; perubahan terkirim lewat `PATCH` bersama `expected_updated_at`.
3. Aktif 1440 dan 390: ringkasan per modul, baris peserta ("2 sesi · rata-rata 85,5 / 100 · Memenuhi", "0 sesi · Belum mulai"), keterangan live, catatan Telefun, target di daftar terkunci, tanpa scroll horizontal; screenshot terang dan gelap.
4. `unavailable`: `alert` "Progres latihan simulasi belum bisa dimuat."; **Coba lagi** memuat ulang dan menampilkan progres. Ini menutup celah "tidak diuji" dari laporan T2 di sisi UI.
5. `selesai`: keterangan "Dibekukan saat rencana diselesaikan."; rencana tanpa target tidak menampilkan bagian progres dan menulis "Tanpa target latihan".

## Audit impeccable

- `impeccable context` dimuat. Detector `impeccable detect` pada `Practice.tsx`, `PlanForm.tsx`, `plan.tsx`: **tidak ada temuan**.
- **[P2] Kotak modul berulang di form** (tiga kotak bergaris, ~450px di mobile; mendekati "identical card grid" yang dilarang `docs/design.md`). **Diperbaiki:** diganti tiga baris ringkas dengan pemisah.
- **[P3] Angka input tampak redup di mode terang** (input mewarisi `text-muted-foreground` dari label). **Diperbaiki:** `text-foreground` pada input.
- A11y: bagian progres adalah `region` berlabel heading; fieldset punya `legend`; input bernama "Sesi minimal {modul}" yang memuat teks label terlihat (WCAG 2.5.3); status gagal memakai `role="alert"`. Kontras memakai token yang sudah lolos `design-token-contrast.spec.ts`.
- Skor (penilaian sendiri): A11y 3, Performance 4, Responsive 4, Theming 4, Integrity 4 → **19/20**.

## Bukti eksekusi (satu runner pada satu waktu)

| Langkah                 | Perintah (di `apps/web`)                                                                                                                                                                     | Hasil                                                                                                                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RED                     | `pnpm exec playwright test tna-practice-flow.spec.ts`                                                                                                                                        | exit 1, semua test gagal karena elemen baru belum ada (`element(s) not found`)                                                                                                                                      |
| GREEN                   | sama                                                                                                                                                                                         | exit 0, 6 passed                                                                                                                                                                                                    |
| Screenshot gelap        | percobaan pertama memakai `emulateMedia`, tetapi tema tetap terang (`useThemeMode` membaca `localStorage.theme` saat muat). Diganti: set `theme` lalu muat ulang, dan diperiksa `html.dark`. | exit 0, 6 passed                                                                                                                                                                                                    |
| Regresi browser TNA     | `tna-practice-flow.spec.ts tna-flow.spec.ts tna-evaluation-flow.spec.ts tna-efek.spec.ts`                                                                                                    | exit 0, **48 passed**                                                                                                                                                                                               |
| Setelah perbaikan audit | `tna-practice-flow.spec.ts`                                                                                                                                                                  | percobaan 1: 1 gagal; helper ganti tema menunggu form dengan timeout bawaan 5 detik saat run melambat (3,1 menit). Timeout dinaikkan ke 20 detik seperti muat awal spec TNA lain. Percobaan 2: exit 0, **6 passed** |
| Typecheck               | `pnpm --filter @trainers/web exec tsc --noEmit`, `pnpm exec tsc --noEmit -p tsconfig.e2e.json`                                                                                               | exit 0 (typecheck E2E kini bersih setelah `b12519f7`)                                                                                                                                                               |
| Lint                    | eslint pada 4 file UI dan spec                                                                                                                                                               | exit 0                                                                                                                                                                                                              |

## Berikutnya

T5: review `thermo-nuclear`, sinkron `docs/{modules,database,auth-rbac}.md` (termasuk batas service-role K21), gate penuh serial (API + browser TNA + root typecheck/lint/build + `git diff --check`), `graphify update .`.

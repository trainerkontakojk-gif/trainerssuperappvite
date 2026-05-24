# Phase 29: SIDAK Agent Directory Load-More Copy

## 1. Requirement & Goals
Ubah copy tombol load-more pada `/sidak/agents` supaya tidak selalu menampilkan angka statis `24`.

1. Label harus mengikuti jumlah item yang benar-benar akan dimuat pada klik berikutnya.
2. Jika sisa agent kurang dari 24, angka di tombol harus ikut turun.
3. Tombol tetap hilang saat semua data sudah tampil.
4. Behavior pagination tidak berubah, hanya copy tombol yang disesuaikan.

## 2. Implementation Summary
- **Frontend Fix (`apps/web/src/routes/sidak/agents.tsx`):**
  - Menambahkan derivasi `nextLoadCount` dari `filtered.length - visibleCount`.
  - Tombol kini menampilkan `Muat {nextLoadCount} Agent Lagi`.
  - Menghapus destructuring `refetch` yang tidak dipakai agar lint tetap bersih.
- **Frontend Test (`apps/web/src/__tests__/sidak-agents-load-more-copy.test.tsx`):**
  - Menambahkan regresi untuk memastikan label menjadi `Muat 6 Agent Lagi` saat hanya 6 item tersisa.
  - Menambahkan regresi untuk memastikan tombol load-more tidak tampil saat semua agent sudah terlihat.
- **Docs (`AGENTS.md`, `GEMINI.md`):**
  - Menambahkan phase 29 dan referensi test/plan terkait.

## 3. Verification & Validation
- **Frontend Test:** `pnpm test -- sidak-agents-load-more-copy.test.tsx` berhasil lulus (2 test).
- **Lint:** `rtk lint -- src/routes/sidak/agents.tsx src/__tests__/sidak-agents-load-more-copy.test.tsx` berhasil tanpa issue.
- **Production Build:** `pnpm build` berhasil selesai.

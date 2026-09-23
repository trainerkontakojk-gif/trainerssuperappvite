# Phase 220 — Telefun History Modal Operational UI

**Tanggal:** 2026-09-23
**Modul:** Telefun
**Route:** `/telefun`

## Ringkasan

Memperbaiki permukaan `Riwayat Panggilan` agar lebih operasional dan tidak terasa seperti kumpulan kartu UI generik. Struktur list sekarang menempatkan informasi sesi dan tindakan utama secara jelas, sementara tindakan sekunder dipindahkan ke menu `Lainnya`.

## Perubahan

- Mengubah row history dari kartu berulang menjadi daftar flat dengan divider.
- Menjadikan `Lihat detail` sebagai aksi utama per sesi.
- Menggabungkan `Unduh rekaman` dan `Hapus riwayat` ke menu `Lainnya` agar aksi berulang tidak memenuhi setiap row.
- Memadatkan metadata menjadi konsumen, tanggal, durasi aktual, dan batas durasi bila tersedia.
- Menampilkan `Target` hanya ketika memberi konteks tambahan; marker `record peserta tidak lagi tersedia` tetap ditampilkan secara eksplisit.
- Mempertahankan `Ekspor CSV`, `Hapus semua`, sorting tanggal terbaru, empty state, loading/error toast, konfirmasi destructive action, Escape/backdrop close, focus trap, dan reduced-motion behavior.
- Menetapkan target sentuh minimum `44px` untuk kontrol header, aksi row, dan item menu.
- Menambahkan `positionerClassName` pada shared `DropdownMenuContent` agar menu portal dapat dinaikkan di atas stacking layer modal tanpa mengubah default dropdown lain.
- Tidak mengubah backend, API contract, schema, atau data history.

## Accessibility dan visual QA

- Dialog tetap memakai `role="dialog"`, `aria-modal`, dan label judul.
- Aksi row memiliki accessible name berbasis nama skenario.
- Menu sekunder memakai role menu/menuitem dan item yang dapat difokuskan keyboard.
- Dropdown diverifikasi pada viewport mobile `390x844` dan desktop `1440x960`; menu terbuka terlihat di atas modal dan tidak ter-clipping.
- Visual direction mengikuti `docs/design.md`: hierarchy melalui tipografi/spasi, tanpa decorative card nesting, blur, atau shadow berlebihan.

## File

- `apps/web/src/routes/telefun/components/HistoryModal.tsx`
- `apps/web/src/components/ui/dropdown-menu.tsx`
- `apps/web/src/__tests__/telefun-history-subject.test.tsx`
- `docs/modules.md`
- `docs/rebuild-logs/phase-220-telefun-history-operational-ui.md`

## Verifikasi

- `pnpm --filter @trainers/web exec vitest run src/__tests__/telefun-history-subject.test.tsx` — PASS
- `pnpm --filter @trainers/web typecheck` — PASS
- `pnpm --filter @trainers/web exec eslint src/components/ui/dropdown-menu.tsx src/routes/telefun/components/HistoryModal.tsx src/__tests__/telefun-history-subject.test.tsx` — PASS
- `pnpm --filter @trainers/web build` — PASS
- `git diff --check` — PASS

## Non-goals

- Tidak mengubah modal History pada modul lain.
- Tidak mengubah backend, database, API contract, atau behavior recording/history persistence.
- Tidak menambahkan metrik atau data baru.

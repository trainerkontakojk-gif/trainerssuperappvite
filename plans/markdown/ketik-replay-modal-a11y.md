# KETIK Replay Modal Accessibility

## Requirement

`SessionReplayModal` (dibuka dari modal Riwayat KETIK lewat tombol "Replay sesi") adalah overlay buatan tangan: root `div.fixed.z-[200]` tanpa `role="dialog"`/`aria-modal`/`aria-labelledby`, Escape tidak menutupnya, fokus tidak di-trap atau dikembalikan, dan tombol tutup ikon `X` tanpa nama aksesibel. `PRODUCT.md` (aksi bisa dijangkau keyboard, kontrol ikon berlabel) dan `docs/design.md` (modal: Escape menutup, focus trap) mewajibkannya.

Acceptance:

1. Klik "Replay sesi" membuka elemen `role="dialog"` bernama judul skenario (via `aria-labelledby`), modal.
2. Tombol tutup header punya nama aksesibel "Tutup replay" dan menutup replay.
3. Escape menutup HANYA replay; modal Riwayat tetap terbuka, dan fokus kembali ke tombol "Replay sesi".
4. Fokus berada di dalam dialog replay saat terbuka (trap).
5. Desain visual dan kontrol playback (Reset/Previous/Play/Next, progress) tidak berubah.

Di luar scope: perubahan copy, desain, atau perilaku playback.

## Design

- Pakai primitive `Dialog`/`DialogContent`/`DialogTitle` dari `apps/web/src/components/ui/dialog.tsx` (Base UI), seperti `HistoryModal`. `DialogContent` memakai `showCloseButton={false}`; className menimpa gaya default supaya tampilan panel sama (`max-w-2xl`, `rounded-[2rem]`, `max-h-[86vh]`, `bg-card`, tanpa padding/grid default).
- Tombol tutup header tetap tombol yang sama secara visual, dibungkus `DialogClose` dengan `aria-label="Tutup replay"`.
- Judul skenario menjadi `DialogTitle` (memberi `aria-labelledby`).
- Replay dirender di dalam `DialogContent` Riwayat agar menjadi nested dialog Base UI: Escape hanya menutup dialog teratas. Sebagai sibling, kedua dialog mendengar Escape.
- `aria-modal="true"` diset eksplisit: Base UI menegakkan modalitas lewat inert/aria-hidden, tetapi tidak memancarkan atribut itu.
- `HistoryModal` memisahkan `isReplayOpen` dari `replaySession` agar animasi keluar tidak menampilkan panel kosong ("Session Replay"/"Tidak ada pesan") selama ~100 ms.
- Tidak ada perubahan backend/kontrak.

## Tasklist

- [x] RED: E2E di `apps/web/e2e/ketik-flow.spec.ts` dengan fixture `REVIEWED_SESSION` (riwayat berpesan) — buka replay, assert `getByRole("dialog", { name })`, tombol "Tutup replay", Escape menutup replay saja + fokus kembali, playback Next berjalan.
- [x] GREEN: refactor `SessionReplayModal` ke `Dialog`; pindahkan render ke dalam `DialogContent` Riwayat.
- [x] Jalankan seluruh `ketik-flow.spec.ts`.
- [x] `thermo-nuclear` review.
- [x] Web typecheck, `pnpm lint`, `git diff --check`.

## Verification

- RED: `npx playwright test e2e/ketik-flow.spec.ts` (dari `apps/web`, hanya Vite web port 3005 dengan env Supabase dummy yang sesuai harness hermetic): test replay gagal, `getByRole('dialog', { name: 'Skenario Replay' })` tidak ditemukan; dua test lama lulus.
- GREEN: `ketik-flow.spec.ts` 3/3.
- Web `tsc --noEmit` exit 0 (run pertama gagal transien saat pnpm me-relink workspace; diulang exit 0). `pnpm lint` exit 0 (0 error, 102 warning lama). `git diff --check` bersih.
- Catatan visual: backdrop kini memakai default primitive (`bg-black/10 backdrop-blur-xs`) alih-alih `bg-black/20 backdrop-blur-sm`; animasi masuk/keluar memakai animasi primitive, bukan framer-motion.

## Rebase ke main (2026-10-10)

Pekerjaan ini selesai 2026-10-07 di worktree `dreamy-kare-63d5f1` tetapi tidak pernah di-commit. Saat dipindahkan ke `main` terbaru, `ketik-flow.spec.ts` bentrok dengan test ukuran teks yang ditambahkan sesudahnya (`teks riwayat, review, dan replay KETIK minimal 11px`). Test itu mengenali replay lewat `div.fixed` karena modalnya belum punya `role="dialog"`. Sekarang test itu memakai `getByRole("dialog", { name })` dan tombol "Tutup replay". Fixture replay diganti nama menjadi `REPLAY_SESSION` karena `REVIEWED_SESSION` sudah dipakai test tersebut.

- RED: komponen dari `main` dengan spec baru: kedua test replay gagal (`getByRole('dialog', { name: … })` tidak ditemukan).
- GREEN: `ketik-flow.spec.ts` 6/6. Web `tsc --noEmit` dan `tsc -p tsconfig.e2e.json` exit 0, ESLint pada file yang berubah exit 0, `git diff --check` bersih. Spec ini sudah tidak Prettier-clean di `main`, jadi tidak diformat ulang.

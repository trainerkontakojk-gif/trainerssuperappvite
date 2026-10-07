# Design Token Contrast Fix

## Requirement

Tiga token warna di `apps/web/src/index.css` gagal kontras atau tidak bisa dibedakan:

- `--fg3` di tema gelap (`#525252`) hanya 2.1–2.5:1 di atas `bg`, `surface`, dan `surface-elevated`, sehingga meta-info tidak terbaca.
- `--module-telefun` di tema terang (`#10b981`) hanya 2.4:1 di atas `bg`, padahal dipakai sebagai warna teks (`text-module-telefun`, 23 pemakaian).
- `--module-profiler` (`#8b5cf6`, violet) hampir sama dengan `--module-pdkt` (`#a855f7`, ungu). Keputusan Fajar: Profiler pindah ke cyan/teal.

Acceptance (dibuktikan di browser pada kedua tema):

1. `--fg3` ≥ 4.5:1 di atas `--bg`, `--surface`, dan `--surface-elevated`.
2. `--module-telefun` dan `--module-profiler` ≥ 4.5:1 di atas ketiga latar yang sama, sehingga aman dipakai sebagai teks.
3. Hue `--module-profiler` berjarak ≥ 60° dari `--module-pdkt`.
4. Token lain tidak berubah.

Di luar scope: ukuran teks kecil (Tahap 2), warna modul lain, dan token `chart-*`.

## Design

- Tema terang (`:root`): `--module-telefun` jadi `#047857` (5.0–5.5:1), `--module-profiler` jadi `#0e7490` (4.9–5.4:1). Tint `-bg` diturunkan dari hex baru dengan alpha yang sama (`10`).
- Tema gelap (`.dark`): `--fg3` jadi `#8a8a8a` (4.8–5.7:1, tetap lebih redup dari `--fg2` `#a3a3a3`), `--module-profiler` jadi `#06b6d4` (6.8–8.2:1), tint `-bg` alpha `15`. `--module-telefun` gelap tetap `#10b981` (sudah 7.8:1).
- Catatan: `#0891b2` (usulan awal) hanya 3.5:1 di tema terang dan luminansinya sama dengan `--module-ketik`, jadi diganti `#0e7490`.
- `.module-clean-app[data-module="profiler"]` otomatis ikut karena membaca `var(--module-profiler)`.
- Tidak ada perubahan komponen, backend, atau kontrak API.

## Tasklist

- [x] RED: `apps/web/e2e/design-token-contrast.spec.ts` membaca token terkomputasi di landing `/` (hermetic, hanya origin lokal) pada tema terang dan gelap; konfirmasi gagal pada nilai lama.
- [x] GREEN: ubah token di `apps/web/src/index.css`.
- [x] Jalankan spec baru dan `accessibility.spec.ts`.
- [x] `thermo-nuclear` review.
- [x] Web typecheck, lint, build, `git diff --check`.

## Hasil

- RED: 4/4 gagal pada nilai lama (Telefun terang 2.33–2.54:1, Profiler terang 3.88–4.23:1, `fg3` gelap 2.10–2.53:1, jarak hue Profiler–PDKT 12.4°).
- GREEN: `design-token-contrast.spec.ts` 4/4 lulus, `accessibility.spec.ts` lulus.
- Web typecheck dan e2e typecheck exit 0; `pnpm lint` exit 0 (102 warning lama, tidak ada di file baru); `pnpm build` exit 0; `git diff --check` bersih.
- Temuan lanjutan (di luar scope): beberapa layar Telefun masih memakai `emerald-500` langsung untuk warna modul (mis. tab aktif `routes/telefun/components/ReviewModal.tsx`), sehingga tidak ikut token baru.

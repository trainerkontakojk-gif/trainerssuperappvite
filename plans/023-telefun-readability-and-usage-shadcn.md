# Plan 023: Telefun Readability + Shared UsageModal shadcn Alignment

## Requirement

Rapikan keterbacaan dan konsistensi shadcn/ui pada permukaan Telefun dan modal
pemakaian yang dipakai bersama KETIK/PDKT/Telefun, tanpa mengubah kontrak data,
alur simpan, atau perilaku runtime.

In scope:

- `UsageModal` bersama (`apps/web/src/components/UsageModal.tsx`) → shadcn
  `Dialog`/`Card`/`Badge`/`Separator` + token semantik modul.
- Shell pengaturan Telefun `SettingsModal` + 4 tab (Scenarios, Consumers,
  Identity, System) → naikkan seluruh teks di bawah 14px.
- Live simulation Telefun `PhoneInterface` → naikkan teks `text-xs` ke `text-sm`.
- Hapus sisa slop lokal di tab yang disentuh (side-stripe border, emoji dekoratif).

Out of scope:

- `apps/api`, migrations, `packages/types`, kontrak API/payload, permission,
  scoring, dan alur sesi/review.
- Pengaturan/live KETIK & PDKT (permukaan berbeda; ditawarkan terpisah).
- Mengganti ilustrasi HP atau struktur navigasi.

## Design

- **Ukuran teks:** tidak ada teks UI di bawah 12px; label/kontrol/deskripsi
  utama memakai `text-sm` (14px). Badge/chip kecil boleh `text-xs` (12px).
- **UsageModal:** pakai `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/
  `DialogDescription` (pola sama dengan `ketik/SessionReviewModal`), `Button`,
  `Badge`, `Separator`, dan token `--module-ketik|pdkt|telefun` menggantikan
  warna pastel hardcode (`bg-emerald-50`, `text-violet-600`). Buang `Sparkles`,
  `rounded-[2rem]`, `text-[10px] font-black uppercase tracking-widest`, dan
  `backdrop-blur-sm` dekoratif. Pertahankan seluruh teks yang diassert test
  (`Simulasi`, `Penilaian AI`, `masih diproses`, `Estimasi Biaya Bulan Ini`,
  label breakdown item, format `+Rp`/token/call).
- **Settings/Live:** naikkan `text-[8..13px]` dan `text-xs` non-badge ke
  `text-sm`; badge tetap `text-xs`. Ganti tips banner side-stripe + emoji ke
  banner border biasa.
- Ikuti `docs/design.md`: min 12px, tanpa gradien/blob/glass, tanpa
  side-stripe border, kontras `fg`/`fg2` terjaga.

## Tasklist

- [x] Catat baseline: jalankan test focused `usage-modal-breakdown`,
      `telefun-settings-*`, `telefun-phone-interface-*`.
- [x] Tulis guard test RED (`telefun-settings-usage-shadcn.test.ts`): UsageModal
      memakai Dialog, tanpa `Sparkles`/`rounded-[2rem]`/pastel hardcode;
      settings/live tanpa teks px di bawah 12px.
- [x] Rewrite `UsageModal` ke shadcn + token modul; pertahankan konten/format.
- [x] Naikkan teks `SettingsModal` + 4 tab; bersihkan side-stripe/emoji.
- [x] Naikkan teks `PhoneInterface`.
- [x] Jalankan focused tests (`usage-modal-breakdown`, `pdkt-landing`,
      `ketik-landing`, `telefun-settings-*`, `telefun-phone-interface-*`,
      anti-slop) → hijau.
- [x] Gate proporsional Lane C: web typecheck, root typecheck, ESLint file
      berubah, `test:core`, `build`, `thermo-nuclear` review, `git diff --check`.

## Evidence (execution 2026-09-12)

- Focused Web tests: 9 files / 36 tests passed, plus `pdkt-landing` 10 tests.
- Root `pnpm typecheck`: 4/4 packages successful.
- `pnpm test:core`: web 211, api 282, telefun 158 tests passed.
- `pnpm build`: 3/3 packages successful.
- ESLint changed Web files: exit 0. `git diff --check`: clean.
- Pre-existing: 4 tab settings files gagal `prettier --check` sejak HEAD; tidak
  direformat agar diff tetap terfokus.

## Verification

```bash
pnpm --filter @trainers/web exec vitest run \
  src/__tests__/usage-modal-breakdown.test.tsx \
  src/__tests__/usage-modal-shadcn.test.tsx \
  src/__tests__/ketik-landing.test.tsx \
  src/__tests__/telefun-settings-modal-accessibility.test.tsx \
  src/__tests__/telefun-settings-draft-lifecycle.test.tsx \
  src/__tests__/telefun-settings-save-race.test.tsx \
  src/__tests__/telefun-landing-anti-slop.test.ts \
  src/__tests__/telefun-motion-frame.test.tsx \
  --config vitest.config.ts --maxWorkers=1 --no-file-parallelism
pnpm --filter @trainers/web exec tsc --noEmit
pnpm --filter @trainers/web exec eslint <changed files>
pnpm typecheck
git diff --check
```

## Scope guard

Jangan ubah kontrak API, payload, permission, atau alur sesi/review. Bila
perubahan visual menuntut perubahan kontrak, hentikan dan laporkan terpisah.

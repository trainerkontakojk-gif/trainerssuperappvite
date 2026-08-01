# DESIGN.md — Trainers SuperApp

> **Pointer file.** Konten kanonik Design System ada di **[`docs/design.md`](docs/design.md)** — baca file itu, bukan duplikat lain.
>
> Dokumen ini dipertahankan hanya agar skill eksternal (mis. Impeccable `context.mjs`) yang mencari `DESIGN.md` di root tetap menemukan acuan. Semua aturan desain (color tokens `--bg/--surface/--border/--fg/--fg2/--fg3/--inv-bg/--inv-fg`, tipografi Outfit/Inter, spacing, komponen, motion, kontras, anti-pattern bans) hidup di `docs/design.md`.

## Ringkasan singkat

- **Product Type:** Product UI (Dashboard/App) — design melayani fungsi. Prioritas: readability, data density, task completion speed.
- **No AI Slop:** tanpa badge dekoratif, gradien berlebihan, floating blobs, atau neon. Hierarki via tipografi & spasi.
- **Warna:** CSS variables (dark default, light opsional). Jangan hardcode hex.
- **Tipografi:** Outfit (heading 700–900, letter-spacing -0.02em s/d -0.04em) + Inter (body 400–600).
- **Layout:** container ≤1400px, spacing kelipatan 4/8px, card radius 12–24px (bukan 32px+), hindari box-shadow.
- **Detail lengkap:** [`docs/design.md`](docs/design.md)

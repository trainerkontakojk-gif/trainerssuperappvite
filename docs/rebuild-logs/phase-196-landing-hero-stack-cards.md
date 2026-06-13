# Phase 196: Landing Page Hero Stack Cards

## Ringkasan

Menambahkan hero stack cards interaktif di landing page — preview visual module KETIK (chat bubble), PDKT (email draft), dan TELEFUN (call interface) yang tersusun bertumpuk dengan efek hover dan animasi.

## Perubahan

### apps/web/src/routes/index.tsx
- Hero section dibagi menjadi dua kolom: `hero-left` (text) dan `hero-right` (stack cards)
- Layout flex dengan `justify-content: space-between` dan gap 60px
- `hero-bottom` diubah dari `flex-wrap` menjadi `flex-column` dengan margin-top 24px

### apps/web/src/routes/landing.css
- **`.hero-in`** — Flex layout row dengan space-between + gap 60px
- **`.hero-left`** — Flex 1, max-width 760px untuk konten text
- **`.hero-stack`** — Container 400x580px dengan perspective 1000px, absolute positioning untuk cards
- **`.stack-card`** — Glassmorphism card (backdrop-blur, color-mix background), 320x200px, border 16px radius
- **3 cards** — Posisi absolute dengan z-index dan rotasi berbeda:
  - `card-ketik` — z-index 3, rotate(-2deg), chat bubbles dengan typing animation
  - `card-pdkt` — z-index 2, rotate(3deg), email header + body dengan subject/body
  - `card-telefun` — z-index 1, rotate(-1deg), avatar + name + call actions dengan red end button
- **Hover effect** — `.hero-stack:hover` memperbesar offset rotasi dan translasi cards
- **Dark mode** — Box shadow dan background transparency berbeda
- **Responsive mobile** — Flex column, cards center dengan transform translateX

## Verifikasi

- `pnpm --filter @trainers/web lint`
- `pnpm --filter @trainers/web build`
- Preview cards muncul di desktop (side-by-side) dan mobile (stacked)
- Hover animation memperbesar offset cards
- Dark mode rendering konsisten

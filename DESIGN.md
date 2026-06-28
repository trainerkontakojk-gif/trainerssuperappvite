# DESIGN.md — Trainers SuperApp

> Dibuat untuk project ini. Baca oleh skill Impeccable (`context.mjs`) dan jadi referensi design utama.

## Product Type

**Product UI (Dashboard/App)** — Bukan brand landing page. Design **melayani fungsi**, bukan sebaliknya. Prioritas: readability, data density, task completion speed.

## Stack

- **Framework:** React + Vite + TypeScript
- **Styling:** Tailwind CSS v4
- **Component Library:** shadcn/ui (Radix primitives)
- **Icons:** Lucide React
- **Animation:** framer-motion
- **Monorepo:** pnpm + Turborepo

## Design Principles

1. **Data-first** — Tabel, kartu statistik, dan grafik adalah elemen utama. Setiap pixel harus membantu user memahami data lebih cepat.
2. **Clean & Minimal** — Hindari dekorasi yang gak perlu. Setiap elemen punya tujuan.
3. **Konsisten** — Satu source of truth untuk spacing, warna, tipografi di seluruh modul (SIDAK, KETIK, PDKT, Telefun, Profiler, KTP, Admin).
4. **Accessible** — Kontras ≥4.5:1 untuk body text, focus states visible, keyboard navigable.

## Color System

### Palette

| Role | Light Mode | Dark Mode | Usage |
|------|-----------|-----------|-------|
| **Primary** | `blue-600` (#2563eb) | `blue-400` (#60a5fa) | Tombol utama, link, active states |
| **Background** | `white` / `gray-50` | `gray-950` / `gray-900` | Halaman, cards |
| **Surface** | `white` | `gray-900` | Card, modal, dropdown |
| **Border** | `gray-200` | `gray-800` | Separator, card border |
| **Text (ink)** | `gray-900` | `gray-100` | Heading, body |
| **Muted** | `gray-500` | `gray-400` | Label, placeholder, secondary |
| **Success** | `green-600` | `green-400` | Status OK, score tinggi |
| **Warning** | `amber-500` | `amber-400` | Peringatan, score sedang |
| **Danger** | `red-600` | `red-400` | Error, score rendah |
| **Info** | `sky-600` | `sky-400` | Informasi tambahan |

### Aturan Warna (dari Impeccable)

- **Jangan** pake gray text di atas colored background — pake darker shade dari background hue
- **Jangan** pure black (`#000`) atau pure gray (`#808080`) — selalu tint
- **Jangan** gradient text (`background-clip: text`) — pake solid color
- **Jangan** glassmorphism sebagai default — khusus untuk overlay/modal tertentu aja
- **Jangan** cream/sand/beige body bg — itu AI default 2026. Pake white, true off-white, atau brand color
- **Wajib** contrast check: body text ≥4.5:1, large text (≥18px/bold ≥14px) ≥3:1

## Typography

### Font Stack

| Level | Font | Weight | Size |
|-------|------|--------|------|
| **Body** | Inter / system sans | 400 | `text-sm` (14px) / `text-base` (16px) |
| **Heading** | Inter / system sans | 600–700 | `text-lg` sampai `text-3xl` |
| **Data/Monospace** | JetBrains Mono / tabular-nums | 400 | Untuk angka di tabel & score |
| **Label** | Inter | 500 | `text-xs` (12px) / `text-sm` (14px) |

### Aturan Tipografi (dari Impeccable)

- **Cap body line length** di 65–75ch — jangan terlalu lebar
- **Display heading max** `clamp()` max ≤ 6rem (~96px)
- **Letter-spacing** display heading minimal ≥ -0.04em (jangan sampai huruf nempel)
- **Pake** `text-wrap: balance` di h1–h3, `text-wrap: pretty` di long prose
- **Jangan** pake font yang mirip tapi beda (mis: dua geometric sans-serif barengan)
- **Pair on contrast axis:** serif + sans, geometric + humanist, atau satu family beda weight

## Spacing & Layout

### Scale

Pake Tailwind spacing scale konsisten: `4` (16px), `6` (24px), `8` (32px) sebagai base unit.

| Element | Gap/Padding |
|---------|-------------|
| Antar card | `gap-6` (24px) |
| Padding card | `p-6` (24px) |
| Antar section | `space-y-8` (32px) |
| Form field spacing | `gap-4` (16px) |
| Modal padding | `p-6` (24px) |

### Aturan Layout (dari Impeccable)

- **Flexbox** untuk 1D, **Grid** untuk 2D — jangan default Grid kalo `flex-wrap` lebih simple
- **Responsive grids** tanpa breakpoints: `repeat(auto-fit, minmax(280px, 1fr))`
- **Cards** jangan jadi default — pake cuma kalo emang affordance terbaik. **Nested cards always wrong**
- **Vary spacing untuk rhythm** — jangan semua seragam
- **Z-index scale** semantic: dropdown → sticky → modal-backdrop → modal → toast → tooltip. Jangan 999/9999
- **Max-width** konsisten: `max-w-6xl` atau `max-w-7xl` — jangan campur
- **Tab container:** `flex gap-6 shrink-0` — jangan `gap-4` (bikin text overlap pas tab panjang)

## Motion & Animation

### Aturan (dari Impeccable)

- **Motion harus intentional** — jangan asal animasi
- **Jangan** animate CSS layout properties kalo gak perlu
- **Ease out** pake exponential curves (`ease-out` quart/quint/expo). **No bounce, no elastic**
- **Reduced motion WAJIB** — setiap animasi butuh `@media (prefers-reduced-motion: reduce)`
- **Stagger items** dalam satu list itu legitimate — yang jadi tell adalah uniform reflex (setiap section masuk dengan animasi identik)
- **Reveal animations** harus enhance yang udah visible — jangan gate content visibility di belakang class-triggered transition
- Library: **framer-motion** (udah terinstall di project)

## Anti-Patterns (dari Impeccable — Absolute Bans)

❌ Side-stripe borders (`border-left` >1px sebagai accent di cards)
❌ Gradient text (`background-clip: text`)
❌ Glassmorphism as default
❌ Hero-metric template (big number + small label + gradient accent)
❌ Identical card grids (icon + heading + text, repeated)
❌ Tiny uppercase tracked eyebrow ("ABOUT" "PROCESS" "PRICING") di atas setiap section
❌ Numbered section markers as default scaffolding (01/02/03)
❌ Text overflow container — test heading copy di setiap breakpoint
❌ `border: 1px solid X` + `box-shadow` dengan blur ≥16px pada elemen yg sama
❌ `border-radius: 32px+` pada cards/sections/inputs
❌ Hand-drawn / sketchy SVG illustrations
❌ `repeating-linear-gradient` stripe backgrounds

## Komponen & Pattern

### Tabel (Data-heavy)

- **Fixed header** — kolom header sticky
- **Striped rows** — `even:bg-muted/50` buat readability
- **Sortable columns** — indikator sort arrow
- **Pagination** — 10-25 rows/page, dengan page size selector
- **Loading state** — skeleton rows (bukan spinner doang)
- **Empty state** — ilustrasi + pesan jelas + CTA action

### Form

- **Label** di atas input (bukan placeholder sebagai label)
- **Validation** inline — error message muncul di bawah field
- **Submit button** — disabled state pas loading, jangan ilang
- **Confirmation** — untuk destructive actions (hapus, revoke, dll)

### Modal/Dialog

- **Title + Close button** di header
- **Backdrop click** nutup modal
- **Escape key** nutup modal
- **Focus trap** — tab loop di dalam modal
- **Scroll content** kalo konten kepanjangan (`overflow-y-auto` di body)

## Detector Rules (Codex Hook)

Impeccable hooks terinstall di `.codex/hooks.json`. Setiap kali agent selesai Edit/Write/apply_patch di file UI, detector akan auto-berjalan. Perhatikan output-nya:
- **P0/P1 findings** = harus diperbaiki sebelum lanjut
- **Contrast findings** = paling sering terjadi, cek color contrast
- **Anti-pattern hits** = rewrite bagian itu

Jalankan `/impeccable hooks on` setelah setup untuk mengaktifkan.

## Referensi

- Skill **UI/UX Pro Max**: `.opencode/skills/ui-ux-pro-max/` — database referensi style, palette, font
- Skill **Impeccable**: `.agents/skills/impeccable/` & `.opencode/skills/impeccable/` — workflow & 23 commands
- Component library: **shadcn/ui** (cek registry sebelum bikin custom)

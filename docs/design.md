# Trainers SuperApp Design System Guidelines

Dokumen ini mendeskripsikan aturan desain (Design Guidelines) yang menjadi acuan utama (Source of Truth) untuk seluruh antarmuka (UI) dalam proyek Trainers SuperApp. Desain ini diadaptasi dari pembaruan UI *Landing Page* dan *Auth Modal* yang berfokus pada estetika minimalis, modern, dan profesional (mengacu pada gaya desain *Linear* atau *Vercel*).

Setiap *engineer* atau sub-agen (AI) **WAJIB** merujuk pada dokumen ini saat melakukan implementasi atau redesain modul apapun.

> **Catatan konsolidasi:** `DESIGN.md` (root) adalah pointer ke dokumen ini. Seluruh skill (ui-ux-pro-max, impeccable) wajib membaca `docs/design.md`, bukan duplikat lain.

---

## 0. Product Type

**Product UI (Dashboard/App)** — Bukan brand landing page. Design **melayani fungsi**, bukan sebaliknya. Prioritas: readability, data density, task completion speed.

**Stack:** React + Vite + TypeScript · Tailwind CSS v4 · shadcn/ui (Radix primitives) · Lucide React · framer-motion · Monorepo pnpm + Turborepo.

**Design Principles:**
1. **Data-first** — Tabel, kartu statistik, dan grafik adalah elemen utama. Setiap pixel harus membantu user memahami data lebih cepat.
2. **Clean & Minimal** — Hindari dekorasi yang tidak perlu. Setiap elemen punya tujuan.
3. **Konsisten** — Satu source of truth untuk spacing, warna, tipografi di seluruh modul (SIDAK, KETIK, PDKT, Telefun, Profiler, KTP, Admin).
4. **Accessible** — Kontras ≥4.5:1 untuk body text, focus states visible, keyboard navigable.

---

## 1. Design Philosophy & "No AI Slop" Rule

- **Utility-First & Minimalist:** Desain berfokus pada konten dan fungsionalitas. Hindari dekorasi yang tidak memiliki makna semantik.
- **High Contrast & Crisp:** Gunakan garis tepi (*border*) yang tegas, kontras warna yang jelas, dan hindari bayangan (*drop-shadow*) yang terlalu lembut/berlebihan.
- **NO "AI SLOP":**
  - **Dilarang** menggunakan lencana (*badge*) dekoratif dengan ikon yang tidak berguna (misal: badge "Masuk Aman" dengan ikon tameng).
  - **Dilarang** menggunakan gradien kompleks, *floating blobs*, atau warna neon yang tidak selaras, kecuali memang diinstruksikan.
  - Hierarki informasi dibangun menggunakan **Tipografi** dan **Spasi**, bukan dengan kotak/warna-warni latar belakang yang berlebihan.

---

## 2. Color Palette (CSS Variables)

Aplikasi memiliki mode *Dark* (sebagai *default*) dan *Light*. Gunakan variabel CSS ini untuk warna, jangan menggunakan warna *hardcode* (`#hex`).

```css
/* Mode Terang (Light) */
--bg: #fafafa;         /* Background utama aplikasi */
--surface: #f5f5f5;    /* Background untuk Card, Modal, Input */
--border: #e5e5e5;     /* Warna garis pembatas (stroke) */
--fg: #0a0a0a;         /* Teks utama (Heading, Judul) */
--fg2: #525252;        /* Teks sekunder (Deskripsi, Label) */
--fg3: #a3a3a3;        /* Teks tersier (Placeholder, Meta info) */
--inv-bg: #0a0a0a;     /* Background kebalikan (Tombol Primary) */
--inv-fg: #fafafa;     /* Teks kebalikan (Teks Tombol Primary) */

/* Mode Gelap (Dark - Default) */
--bg: #0a0a0a;
--surface: #171717;
--border: #262626;
--fg: #fafafa;
--fg2: #a3a3a3;
--fg3: #525252;
--inv-bg: #fafafa;
--inv-fg: #0a0a0a;
```

> **Aturan Implementasi CSS:**
> Pastikan selektor kelas `.dark` diaplikasikan dengan benar agar komponen anak mewarisi variabel *dark mode* (contoh: `.dark .my-component { ... }`).

### Aturan Warna Tambahan

- **Jangan** pakai gray text di atas colored background — pakai darker shade dari background hue.
- **Jangan** pure black (`#000`) atau pure gray (`#808080`) — selalu tint.
- **Jangan** gradient text (`background-clip: text`) — pakai solid color.
- **Jangan** glassmorphism sebagai default — khusus untuk overlay/modal tertentu saja.
- **Jangan** cream/sand/beige body bg — itu AI default 2026. Pakai white, true off-white, atau brand color.
- **Wajib** contrast check: body text ≥4.5:1, large text (≥18px/bold ≥14px) ≥3:1.
- Light-mode cards wajib terlihat terpisah (`bg-surface-elevated`, border, atau shadow ringan) — jangan dua shade yang nyaris sama.

---

## 3. Typography

Kami menggunakan dua font keluarga dari Google Fonts: **Outfit** dan **Inter**.

### Headings (Display & Titles)
- **Font Family:** `Outfit`, sans-serif
- **Weight:** `700` (Bold), `800` (ExtraBold), `900` (Black)
- **Letter Spacing:** Sangat rapat, antara `-0.02em` hingga `-0.04em`.
- **Warna:** `var(--fg)`

### Body & UI Text (Paragraphs, Labels, Buttons)
- **Font Family:** `Inter`, -apple-system, sans-serif
- **Weight:** `400` (Regular), `500` (Medium), `600` (SemiBold)
- **Letter Spacing:** Normal atau sedikit renggang untuk label mikro (`0.02em`).
- **Warna:** `var(--fg2)` untuk deskripsi, `var(--fg)` untuk nilai/data.

### Aturan Tipografi
- **Cap body line length** di 65–75ch — jangan terlalu lebar.
- **Display heading max** `clamp()` max ≤ 6rem (~96px).
- **Pakai** `text-wrap: balance` di h1–h3, `text-wrap: pretty` di long prose.
- **Jangan** pakai dua font yang mirip tapi beda (mis: dua geometric sans-serif barengan).
- **Pair on contrast axis:** serif + sans, geometric + humanist, atau satu family beda weight.
- Data/monospace: JetBrains Mono / tabular-nums untuk angka di tabel & score.

---

## 4. Layout & Spacing

- **Container Width:** Maksimal `1400px` untuk *wrapper* utama. `max-w-6xl`/`max-w-7xl` — jangan campur.
- **Padding/Margin:** Gunakan kelipatan `4px` atau `8px` (misal: `8px`, `16px`, `24px`, `32px`, `64px`).
- **Alignment:** Cenderung *Left-aligned* (rata kiri) atau *Centered* (rata tengah) untuk konten hero/fokus.
- **Flexbox** untuk 1D, **Grid** untuk 2D — jangan default Grid kalau `flex-wrap` lebih simple.
- **Responsive grids** tanpa breakpoints: `repeat(auto-fit, minmax(280px, 1fr))`.
- **Cards** jangan jadi default — pakai hanya kalau memang affordance terbaik. **Nested cards always wrong.**
- **Vary spacing untuk rhythm** — jangan semua seragam.
- **Z-index scale** semantic: dropdown → sticky → modal-backdrop → modal → toast → tooltip. Jangan `999`/`9999`.
- **Tab container:** `flex gap-6 shrink-0` — jangan `gap-4` (bikin text overlap pas tab panjang).

### Spacing Scale

Pakai Tailwind spacing scale konsisten: `4` (16px), `6` (24px), `8` (32px) sebagai base unit.

| Element | Gap/Padding |
|---------|-------------|
| Antar card | `gap-6` (24px) |
| Padding card | `p-6` (24px) |
| Antar section | `space-y-8` (32px) |
| Form field spacing | `gap-4` (16px) |
| Modal padding | `p-6` (24px) |

---

## 5. UI Components

### Buttons (Tombol)
- **Primary:** `background: var(--inv-bg); color: var(--inv-fg);`
- **Secondary/Ghost:** `background: transparent; color: var(--fg); border: 1px solid var(--border);` atau tanpa *border* dengan *hover state* `background: var(--surface);`
- **Radius:** Umumnya `6px` untuk tombol kecil/menengah, `8px` untuk tombol besar.
- **Padding:** `6px 14px` (kecil), `10px 20px` (standar), `14px 28px` (besar).
- **Font:** `Inter`, ukuran `13px` hingga `15px`, `font-weight: 500`.

### Cards & Modals
- **Background:** `var(--surface)` (atau transparan dengan *border* jika di dalam *surface* lain).
- **Border:** `1px solid var(--border)`
- **Border Radius:** `12px` hingga `24px` (untuk *container* besar). **Jangan** `32px+` pada cards/sections/inputs.
- **Shadow:** Hindari *box-shadow*. Andalkan *border* untuk memisahkan *card* dengan *background*.
- **Modal:** title + close button di header, backdrop click & Escape nutup modal, focus trap, konten panjang pakai `overflow-y-auto`.

### Inputs & Forms
- **Background:** `transparent` atau `var(--bg)` jika di atas `var(--surface)`.
- **Border:** `1px solid var(--border)`
- **Radius:** `6px` hingga `8px`.
- **Focus State:** Ubah warna *border* menjadi `var(--fg)` dan hapus *outline* bawaan peramban (`outline: none`). Hindari *ring* biru (*default browser*).
- **Label** di atas input (bukan placeholder sebagai label), validasi inline di bawah field, submit button disabled saat loading, konfirmasi untuk destructive actions.

### Tabel (Data-heavy)
- **Fixed header** — kolom header sticky.
- **Striped rows** — `even:bg-muted/50` buat readability.
- **Sortable columns** — indikator sort arrow.
- **Pagination** — 10–25 rows/page, dengan page size selector.
- **Loading state** — skeleton rows (bukan spinner doang).
- **Empty state** — pesan jelas + CTA action.

---

## 6. Motion & Animation

- **CSS Transitions:** Gunakan transisi cepat dan halus. `transition: all 0.15s ease;` (terutama untuk efek *hover* pada tombol dan tautan).
- **Framer Motion (React):**
  - Untuk elemen yang muncul (*Entrance animation*), gunakan efek *staggered fade-up* (muncul perlahan dari bawah).
  - Parameter standar: `initial={{ opacity: 0, y: 15 }}`, `animate={{ opacity: 1, y: 0 }}`, `transition={{ duration: 0.4, ease: "easeOut" }}`.
  - Hindari animasi yang melompat-lompat, berputar, atau memakan waktu lebih dari `0.6s`.
- **Motion harus intentional** — jangan asal animasi; jangan animate CSS layout properties kalau tidak perlu.
- **Ease out** pakai exponential curves (`ease-out` quart/quint/expo). **No bounce, no elastic.**
- **Reduced motion WAJIB** — setiap animasi butuh `@media (prefers-reduced-motion: reduce)`.
- **Stagger items** dalam satu list itu legitimate — yang jadi tell adalah uniform reflex (setiap section masuk dengan animasi identik).
- **Reveal animations** harus enhance yang sudah visible — jangan gate content visibility di belakang class-triggered transition.

---

## 7. Contrast & Readability Rules

Untuk memastikan antarmuka mudah dibaca oleh semua pengguna (aksesibilitas tinggi):
- **Contrast Ratio:** Teks utama (`var(--fg)`) harus memiliki kontras minimal 7:1 terhadap latar belakang. Teks sekunder/deskripsi (`var(--fg2)`) harus memiliki kontras minimal 4.5:1.
- **Muted Text:** Gunakan `var(--fg3)` hanya untuk informasi non-kritis/meta-info. Jangan gunakan `opacity` di bawah `0.8` pada teks yang bertumpuk dengan latar belakang terang.
- **Font Size Minimum:** Hindari teks dengan ukuran di bawah `11px`. Gunakan minimal `12px` (`text-sm` atau `text-xs`) untuk label formulir, dengan berat sedang (`font-medium`) untuk meningkatkan readability.

---

## 8. Anti-Patterns (Absolute Bans)

❌ Side-stripe borders (`border-left` >1px sebagai accent di cards)
❌ Gradient text (`background-clip: text`)
❌ Glassmorphism as default
❌ Hero-metric template (big number + small label + gradient accent)
❌ Identical card grids (icon + heading + text, repeated)
❌ Tiny uppercase tracked eyebrow ("ABOUT" "PROCESS" "PRICING") di atas setiap section
❌ Numbered section markers as default scaffolding (01/02/03)
❌ Text overflow container — test heading copy di setiap breakpoint
❌ `border: 1px solid X` + `box-shadow` dengan blur ≥16px pada elemen yang sama
❌ `border-radius: 32px+` pada cards/sections/inputs
❌ Hand-drawn / sketchy SVG illustrations
❌ `repeating-linear-gradient` stripe backgrounds

---

## Kesimpulan

Jika Anda ragu dalam mendesain, pilih jalur yang paling sederhana dan paling bersih. Hapus garis, latar belakang, atau dekorasi yang tidak penting. Biarkan tipografi, jarak (*whitespace*), dan kontras mengambil alih hierarki visual.

---

## Referensi

- Skill **UI/UX Pro Max** (`ui-ux-pro-max`) — workflow & decision record untuk fitur UI baru.
- Skill **Impeccable** (`impeccable`) — audit/polish gate untuk perubahan UI.
- Component library: **shadcn/ui** (cek registry sebelum bikin custom).

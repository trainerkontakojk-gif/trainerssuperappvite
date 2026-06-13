# Trainers SuperApp Design System Guidelines

Dokumen ini mendeskripsikan aturan desain (Design Guidelines) yang menjadi acuan utama (Source of Truth) untuk seluruh antarmuka (UI) dalam proyek Trainers SuperApp. Desain ini diadaptasi dari pembaruan UI *Landing Page* dan *Auth Modal* yang berfokus pada estetika minimalis, modern, dan profesional (mengacu pada gaya desain *Linear* atau *Vercel*).

Setiap *engineer* atau sub-agen (AI) **WAJIB** merujuk pada dokumen ini saat melakukan implementasi atau redesain modul apapun.

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

---

## 4. Layout & Spacing

- **Container Width:** Maksimal `1400px` untuk *wrapper* utama.
- **Padding/Margin:** Gunakan kelipatan `4px` atau `8px` (misal: `8px`, `16px`, `24px`, `32px`, `64px`).
- **Alignment:** Cenderung *Left-aligned* (rata kiri) atau *Centered* (rata tengah) untuk konten hero/fokus.

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
- **Border Radius:** `12px` hingga `24px` (untuk *container* besar).
- **Shadow:** Hindari *box-shadow*. Andalkan *border* untuk memisahkan *card* dengan *background*.

### Inputs & Forms
- **Background:** `transparent` atau `var(--bg)` jika di atas `var(--surface)`.
- **Border:** `1px solid var(--border)`
- **Radius:** `6px` hingga `8px`.
- **Focus State:** Ubah warna *border* menjadi `var(--fg)` dan hapus *outline* bawaan peramban (`outline: none`). Hindari *ring* biru (*default browser*).

---

## 6. Motion & Animation

- **CSS Transitions:** Gunakan transisi cepat dan halus. `transition: all 0.15s ease;` (terutama untuk efek *hover* pada tombol dan tautan).
- **Framer Motion (React):**
  - Untuk elemen yang muncul (*Entrance animation*), gunakan efek *staggered fade-up* (muncul perlahan dari bawah).
  - Parameter standar: `initial={{ opacity: 0, y: 15 }}`, `animate={{ opacity: 1, y: 0 }}`, `transition={{ duration: 0.4, ease: "easeOut" }}`.
  - Hindari animasi yang melompat-lompat, berputar, atau memakan waktu lebih dari `0.6s`.

---

## Kesimpulan

Jika Anda ragu dalam mendesain, pilih jalur yang paling sederhana dan paling bersih. Hapus garis, latar belakang, atau dekorasi yang tidak penting. Biarkan tipografi, jarak (*whitespace*), dan kontras mengambil alih hierarki visual.

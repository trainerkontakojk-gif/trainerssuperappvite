# Design Guidelines & System

Dokumen ini adalah ringkasan standar desain visual dan UI yang diterapkan di Trainers SuperApp. Aplikasi ini mengusung estetika **Dark Luxury × Minimalist Clarity**.

## Prinsip Desain

1. **Presisi**: Setiap elemen UI harus memiliki tujuan fungsional.
2. **Konsistensi**: Komponen yang sama harus tampil dan berperilaku identik di seluruh modul.
3. **Kontrol**: Pengguna harus selalu memahami posisi mereka dalam aplikasi (breadcrumbs, active sidebar indicators).

## Design Tokens (Tailwind CSS 4)

Semua komponen wajib menggunakan sistem token yang didefinisikan di CSS global.

### Warna Semantik

- `background`: Warna dasar halaman.
- `foreground`: Warna teks utama.
- `primary`: Warna aksen (Default: Navy/Slate di Light mode; Amber di Dark mode).
- `card`: Surface untuk panel, modal, dan kartu informasi.
- `accent`: Warna untuk state hover, chip, dan tag.
- `destructive`: Warna untuk aksi berbahaya atau pesan kesalahan.

### Warna Identitas Modul

Setiap modul memiliki warna identitas untuk membantu navigasi visual:

- **Profiler / KTP**: `violet-500`
- **SIDAK / Analisis**: `blue-500`
- **Statistik/Status**: `emerald-500`
- **Ekspor/Unduh**: `orange-500`

Warna identitas modul didefinisikan di `apps/web/src/lib/app-config.ts` dalam `APP_MODULES` dengan `accentColor` per modul.

## Tipografi

Menggunakan font sans-serif modern (Inter/System) dengan skala sebagai berikut:

- **Page Title**: `text-4xl font-bold tracking-tight`
- **Section Title**: `text-3xl font-bold tracking-tight`
- **Body Text**: `text-sm font-light text-muted-foreground`
- **Label Mono**: `text-[10px] font-bold uppercase tracking-widest`

## Komponen Navigasi

### 1. Module Header

Setiap modul wajib memiliki header yang konsisten dengan:

- Tombol kembali (Back to Dashboard).
- Ikon dan nama modul yang jelas.

### 2. Sidebar

- Sidebar utama di dashboard menggunakan sistem Accordion untuk mengelompokkan modul.
- Desain sidebar harus responsif (Auto-collapse pada mobile).
- SIDAK dan Admin memiliki submenu khusus.
- Implementasi di `apps/web/src/components/Layout.tsx`.

## Animasi & Micro-interactions

Aplikasi menggunakan `framer-motion` untuk meningkatkan pengalaman pengguna:

- **Hover Lift**: Komponen kartu sedikit terangkat saat di-hover.
- **Fade-Scale**: Transisi halus saat membuka modal atau berpindah tab.
- **Ambient Glow**: Efek cahaya latar (Ambient background blobs) pada area header untuk kesan premium.

## Aturan Penulisan Kode UI

- Gunakan variabel CSS (`var(--primary)`) daripada nilai hex langsung.
- Gunakan komponen `motion.div` untuk elemen yang membutuhkan transisi.
- Pastikan semua input memiliki state `focus-visible:ring-2` untuk aksesibilitas.
- Gunakan properti `rounded-xl` hingga `rounded-3xl` untuk komponen kartu/modal agar terlihat modern.

## Z-Index & Stacking Context

Perilaku `z-index` di CSS bergantung pada **stacking context**. Elemen dengan `position: relative` atau `position: absolute` **hanya** menciptakan stacking context baru jika disertai nilai `z-index` (bukan `auto`).

### Aturan Penting: Dropdown di Dalam Tabel

Ketika menggunakan dropdown `position: fixed` di dalam tabel yang dibungkus `overflow-x-auto`, **jangan** memberikan `z-index` pada wrapper tabel:

```tsx
// ❌ SALAH — z-10 menciptakan stacking context baru
<div className="overflow-x-auto relative z-10">
  <table>...</table>
</div>

// ✅ BENAR — relative tanpa z-index tidak menciptakan stacking context baru
<div className="overflow-x-auto relative">
  <table>...</table>
</div>
```

### Mengapa Ini Terjadi

1. Wrapper dengan `relative z-10` membuat **stacking context baru** di level `z-10`.
2. Dropdown `fixed z-50` yang berada di dalamnya tetap terjebak di dalam stacking context `z-10`.
3. Overlay backdrop `fixed z-40` di root context akan **menutupi** dropdown.

### Pattern yang Direkomendasikan

Jika dropdown harus keluar dari ancestor `overflow` atau stacking context, gunakan salah satu:

1. **Fixed positioning tanpa z-index pada wrapper** (untuk dropdown sederhana di dalam tabel).
2. **React Portal** (`createPortal`) — mount dropdown ke `document.body` untuk sepenuhnya lepas dari constraint ancestor (paling robust untuk kasus kompleks).
3. **Backdrop overlay dengan z-index lebih rendah dari dropdown**, namun keduanya harus berada di dalam stacking context yang sama (root context) agar berfungsi.

## Performance Considerations

- Gunakan `React.lazy()` dan `Suspense` untuk komponen berat yang tidak selalu ditampilkan.
- Library besar (Recharts, ExcelJS) harus di-import secara dinamis (`import()`).
- Hindari static import library besar di komponen yang tidak selalu dikunjungi.
- Perhatikan ukuran bundle per-chunk. Jika ada chunk >200 kB yang bukan vendor stabil, pertimbangkan split lanjutan.

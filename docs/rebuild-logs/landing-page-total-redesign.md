# Landing Page Total Redesign

## Ringkasan

Melakukan perombakan (redesign) total pada landing page utama (`/`) untuk menyesuaikan dengan mockup desain pixel-perfect dari `landing-page-mockup.html`. 

## Perubahan

- **Navbar**: Dibuat dengan tinggi tetap 56px (`h-[56px]`), background solid border-b, logo "S" dengan Trainers SuperApp wordmark, dan tombol aksi "Mulai Simulasi" / "Masuk" yang responsif.
- **Hero Section**: Font display ultra-besar (`clamp(64px, 12vw, 160px)`) dengan susunan kata "TRAINERS", "SUPER" (outline text), dan "APP." yang dinamis. Deskripsi di bawah hero diposisikan rapi dengan visual vertical line scroll indicator beranimasi.
- **Marquee Ticker**: Dua lajur marquee horizontal loop tanpa jeda yang berlawanan arah, menampilkan daftar modul dengan ukuran font tepat 14px dan pemisah dot berukuran 18px, berlatar belakang `--surface` CSS variable.
- **Modules Showcase**: Layout Bento Grid premium yang memetakan modul KETIK, PDKT, TELEFUN, KTP, dan SIDAK secara vertikal dengan border indicator dan ikon panah saat di-hover.
- **Statement & CTA**: Menghapus teks sensitif (OJK 157) dan menyesuaikan CTA dengan inverted background & foreground sesuai spesifikasi mockup.
- **Theme & Styles**: Penambahan CSS variable `--surface` (#F5F5F5 light / #171717 dark), perbaikan `@theme` font-family fallback, dan rule styling teks stroke (`text-stroke-2` / `text-stroke-1-5`).

## Verifikasi

- `pnpm --filter @trainers/web lint`
- `pnpm --filter @trainers/web build`
- Melalui review keselarasan visual mockup HTML dan rendering landing page

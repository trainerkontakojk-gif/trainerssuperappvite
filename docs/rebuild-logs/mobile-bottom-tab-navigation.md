# Mobile Bottom Tab Navigation

## Ringkasan

Menambahkan bottom tab bar untuk navigasi cepat ke Dashboard, KETIK, PDKT, dan Telefun pada viewport di bawah 1024px. Desktop tetap menggunakan sidebar.

## Perubahan

### apps/web/src/components/Layout.tsx
- Menambahkan konstanta `MOBILE_TAB_IDS` dan `MOBILE_TABS` yang di-filter dari `APP_MODULES`
- Bottom tab bar di-render sebagai `<nav>` dengan `fixed bottom-0 z-50 lg:hidden`
- Menggunakan konfigurasi `APP_MODULES` sebagai source of truth untuk icon, label, route, dan role
- Tab aktif di-highlight: Dashboard pakai exact match (`/dashboard` saja), KETIK/PDKT/Telefun pakai `startsWith`
- Telefun maintenance guard: `event.preventDefault()` + `openMaintenance()` jika user tidak punya akses
- Main content diberi padding bottom `pb-[calc(4rem+env(safe-area-inset-bottom,0px))] lg:pb-0`
- Safe-area perangkat mobile diperhitungkan dengan `env(safe-area-inset-bottom)`
- Touch target minimal 44px (`min-h-11 min-w-16`)

### apps/web/vite.config.ts
- Menambahkan `allowedHosts` untuk `.trycloudflare.com` dan `.lhr.life` agar tunnel testing tidak kena 403

### apps/api/src/app.ts
- Dev mode CORS: menggunakan `ALLOWED_ORIGINS` env var jika ada, fallback ke localhost origins

## Z-Index Contract

| Layer | Z-index |
|---|---|
| Header | `z-30` |
| Bottom tab bar | `z-50` |
| Mobile overlay | `z-[60]` |
| Mobile sidebar | `z-[70]` |
| Simulation views (KETIK/PDKT/Telefun) | `z-[100]` |
| Modal modul (Settings/History/Review) | `z-[150]` — `z-[260]` |

## Yang Tidak Berubah

- Router, app-config, index.css — tidak disentuh
- Halaman modul (ketik, pdkt, telefun) — tidak disentuh
- Simulation component (ChatInterface, PdktSimulation, PhoneInterface) — tidak disentuh
- State management, API, backend, test files — tidak disentuh
- Sidebar desktop dan hamburger mobile — tetap seperti semula

## Verifikasi

- `pnpm --filter @trainers/web lint` ✅
- `pnpm --filter @trainers/web build` ✅
- Bottom tab diverifikasi pada viewport mobile, tablet, dan desktop
- Simulation view KETIK/PDKT/Telefun menutup bottom tab melalui z-index 100
- Modal settings/history/review menutup bottom tab (z-index 150+)
- Landing page, auth callback, waiting-approval: bottom tab tidak muncul

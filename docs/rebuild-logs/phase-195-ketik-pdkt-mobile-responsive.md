# Phase 195: KETIK/PDKT Mobile Responsive Enhancement

## Ringkasan

Mobile responsive improvements untuk KETIK ChatInterface dan PDKT mailbox setelah bottom tab navigation (Phase 193) ditambahkan. Header dan layout disesuaikan untuk viewport mobile.

## Perubahan

### apps/web/src/routes/ketik/components/ChatInterface.tsx
- **MapPin icon**: Mengganti emoji `📍` dengan `MapPin` dari lucide-react untuk konsistensi icon
- **Responsive header**: Padding (px-4/py-4 mobile, px-8/py-6 desktop), avatar size (w-10 md:w-12), font size (text-base md:text-xl)
- **Identity pills**: Layout flex-wrap dengan modul-clean-panel terpisah untuk phone dan city
- **Button sizing**: Send button (w-12 md:w-14), template button (px-4 md:px-6), responsive text (text-[9px] md:text-[10px])
- **Cursor pointers**: `cursor-pointer` ditambahkan ke semua button interaktif, `cursor-not-allowed` untuk disabled states
- **Input area**: Padding (p-4 md:p-6), gap (gap-2 md:gap-4), input shell (px-4 md:px-6)

### apps/web/src/routes/pdkt/simulation.tsx
- **Mobile sidebar/detail toggle**: Sidebar hidden (`hidden md:flex`) saat email dipilih di mobile, detail pane menampilkan back button. Sidebar visible (`flex`) saat tidak ada selection
- **Auto-clear selection on mobile**: `selectedId` di-reset saat item yang dipilih tidak ada di filtered list pada viewport mobile
- **Skeleton responsive**: Detail pane skeleton `hidden md:flex` (tidak muncul di mobile saat sidebar loading)

### apps/web/src/routes/pdkt/components/EmailDetailPane.tsx
- **Back button**: `ArrowLeft` button muncul hanya di mobile (`md:hidden`) dengan `onBackToList` callback prop
- **Back button props**: Interface `EmailDetailPaneProps` mendapat optional `onBackToList` callback

### apps/web/src/__tests__/pdkt-mailbox.test.tsx
- **Back button test**: Test untuk memverifikasi button "Kembali ke Daftar Email" muncul dan `onBackToList` terpanggil saat diklik

## Verifikasi

- Layout KETIK ChatInterface responsif di mobile, tablet, dan desktop
- PDKT mailbox sidebar/detail pane toggling berfungsi di mobile viewport
- Back button PDKT hanya muncul di mobile (md:hidden)
- Test back button PDKT passing
